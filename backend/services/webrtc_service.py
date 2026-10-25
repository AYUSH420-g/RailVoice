import asyncio
import fractions
import io
import json
import logging
import time
import uuid
from typing import Dict, Optional, Any

import av
import numpy as np
import websockets
from aiortc import RTCPeerConnection, RTCSessionDescription, RTCIceCandidate
from aiortc.mediastreams import AudioStreamTrack, MediaStreamError

from config import (
    DEEPGRAM_API_KEY,
    DEEPGRAM_STT_MODEL,
    DEEPGRAM_STT_LANGUAGE,
    DEEPGRAM_ENDPOINTING,
    WEBRTC_SAMPLE_RATE,
    DEEPGRAM_SAMPLE_RATE,
    VOICE_AGENT_NAME,
)
from services.agent_brain import agent_brain
from services.voice_service import voice_service
from database import db_manager
from services.auth_service import decode_access_token

logger = logging.getLogger("railvoice.webrtc")

AUDIO_PTIME = 0.020  # 20ms per frame
SAMPLES_PER_FRAME = int(WEBRTC_SAMPLE_RATE * AUDIO_PTIME)  # 960 samples @ 48kHz


class AgentAudioTrack(AudioStreamTrack):
    """
    WebRTC outgoing audio track that streams synthesized agent voice back to the user's browser.
    Maintains steady 48kHz WebRTC RTP frames at real-time pace.
    Supports instant flush upon user barge-in.
    """
    kind = "audio"

    def __init__(self, on_done_fn=None):
        super().__init__()
        self._queue = asyncio.Queue()
        self._timestamp = 0
        self._start_time: Optional[float] = None
        self._is_playing = False
        self._interrupted = False
        self.on_done_fn = on_done_fn

    def is_playing(self) -> bool:
        return self._is_playing or not self._queue.empty()

    def interrupt(self):
        """Immediately clear pending audio on barge-in."""
        self._interrupted = True
        self._is_playing = False
        flushed = 0
        while not self._queue.empty():
            try:
                self._queue.get_nowait()
                self._queue.task_done()
                flushed += 1
            except (asyncio.QueueEmpty, ValueError):
                break
        if flushed > 0:
            logger.info(f"Agent audio interrupted by user; flushed {flushed} frames from queue")

    def enqueue_audio_bytes(self, audio_bytes: bytes):
        """Decodes MP3/WAV audio bytes into 48kHz mono 20ms AudioFrames and queues them."""
        self._interrupted = False
        try:
            container = av.open(io.BytesIO(audio_bytes))
            resampler = av.AudioResampler(format="s16", layout="mono", rate=WEBRTC_SAMPLE_RATE)
            
            pcm_chunks = []
            for frame in container.decode(audio=0):
                resampled_frames = resampler.resample(frame)
                for rf in resampled_frames:
                    pcm_chunks.append(rf.to_ndarray().flatten())

            if not pcm_chunks:
                return

            full_audio = np.concatenate(pcm_chunks)
            total_samples = len(full_audio)

            # Split into 960-sample chunks (20ms @ 48kHz)
            for i in range(0, total_samples, SAMPLES_PER_FRAME):
                chunk = full_audio[i : i + SAMPLES_PER_FRAME]
                if len(chunk) < SAMPLES_PER_FRAME:
                    padded = np.zeros(SAMPLES_PER_FRAME, dtype=np.int16)
                    padded[: len(chunk)] = chunk
                    chunk = padded
                self._queue.put_nowait(chunk)

            logger.info(f"Enqueued {total_samples} samples (~{total_samples / WEBRTC_SAMPLE_RATE:.2f}s) to WebRTC audio track")
        except Exception as e:
            logger.error(f"Error decoding audio for WebRTC track: {e}", exc_info=True)

    async def recv(self) -> av.AudioFrame:
        """Called by aiortc roughly every 20ms to fetch the next audio frame."""
        if self.readyState != "live":
            raise MediaStreamError

        sample_rate = WEBRTC_SAMPLE_RATE
        samples = SAMPLES_PER_FRAME

        # Pace according to real time so aiortc does not spin in tight loop
        if self._start_time is not None:
            self._timestamp += samples
            wait = self._start_time + (self._timestamp / sample_rate) - time.time()
            if wait > 0:
                await asyncio.sleep(wait)
        else:
            self._start_time = time.time()
            self._timestamp = 0

        chunk = None
        if not self._queue.empty() and not self._interrupted:
            try:
                chunk = self._queue.get_nowait()
                self._queue.task_done()
                self._is_playing = True
            except asyncio.QueueEmpty:
                chunk = None

        if chunk is None:
            if self._is_playing:
                self._is_playing = False
                if self.on_done_fn:
                    asyncio.create_task(self.on_done_fn())
            # Generate silence frame (960 samples of zeros)
            chunk = np.zeros(samples, dtype=np.int16)

        frame = av.AudioFrame.from_ndarray(chunk.reshape(1, -1), format="s16", layout="mono")
        frame.sample_rate = sample_rate
        frame.pts = self._timestamp
        frame.time_base = fractions.Fraction(1, sample_rate)
        return frame


class DeepgramLiveSTTStreamer:
    """
    Maintains a persistent live WebSocket to Deepgram Nova-2 STT.
    Receives raw 16kHz PCM audio bytes from incoming WebRTC mic frames,
    streams them to Deepgram, and dispatches transcripts to Tool & LLM pipeline.
    """

    def __init__(self, session_id: str, on_interim_fn, on_final_fn, on_speech_start_fn):
        self.session_id = session_id
        self.on_interim = on_interim_fn
        self.on_final = on_final_fn
        self.on_speech_start = on_speech_start_fn
        self.api_key = DEEPGRAM_API_KEY.strip() if DEEPGRAM_API_KEY else ""
        self.ws: Optional[websockets.WebSocketClientProtocol] = None
        self._listen_task: Optional[asyncio.Task] = None
        self._debounce_task: Optional[asyncio.Task] = None
        self._is_running = False
        self._accumulated_transcript = ""

    async def start(self):
        """Connects to Deepgram Nova-2 live STT WebSocket."""
        if not self.api_key:
            logger.warning("No DEEPGRAM_API_KEY provided; live STT streaming disabled")
            return

        self._is_running = True
        # Railway & Station keyword boosting for Indian English speech recognition
        rail_keywords = [
            "Surat:3", "Delhi:3", "Mumbai:3", "Ahmedabad:3", "Varanasi:3", "Kolkata:3",
            "Bangalore:3", "Chennai:3", "Jaipur:3", "Lucknow:3", "Pune:3", "Patna:3",
            "Vadodara:3", "Agra:3", "Kanpur:3", "Bhopal:3", "Chandigarh:3", "Amritsar:3",
            "3A:3", "2A:3", "1A:3", "Sleeper:3", "confirm:3", "Tatkal:3", "PNR:3", "Rajdhani:3", "Vande Bharat:3"
        ]
        kw_params = "&".join([f"keywords={kw}" for kw in rail_keywords])

        dg_url = (
            f"wss://api.deepgram.com/v1/listen?"
            f"model={DEEPGRAM_STT_MODEL}&"
            f"language={DEEPGRAM_STT_LANGUAGE}&"
            f"encoding=linear16&"
            f"sample_rate={DEEPGRAM_SAMPLE_RATE}&"
            f"channels=1&"
            f"interim_results=true&"
            f"endpointing=300&"
            f"vad_events=true&"
            f"smart_format=true&"
            f"{kw_params}"
        )
        headers = {"Authorization": f"Token {self.api_key}"}

        try:
            self.ws = await websockets.connect(dg_url, additional_headers=headers)
            logger.info(f"[{self.session_id}] Connected to Deepgram Live STT WebSocket ({DEEPGRAM_STT_MODEL}) with Railway Keyword Boosting")
            self._listen_task = asyncio.create_task(self._listen_loop())
        except Exception as e:
            logger.error(f"[{self.session_id}] Deepgram Live STT connection failed: {e}")

    async def _listen_loop(self):
        try:
            while self._is_running and self.ws:
                msg = await self.ws.recv()
                if isinstance(msg, str):
                    data = json.loads(msg)
                    msg_type = data.get("type")

                    # 1. Voice Activity Detection (Barge-in trigger)
                    if msg_type == "SpeechStarted":
                        logger.info(f"[{self.session_id}] Deepgram VAD: SpeechStarted detected")
                        if self.on_speech_start:
                            await self.on_speech_start()

                    # 2. Transcription results
                    elif msg_type == "Results":
                        channel = data.get("channel", {})
                        alternatives = channel.get("alternatives", [{}])
                        if alternatives:
                            transcript = alternatives[0].get("transcript", "").strip()
                            is_final = data.get("is_final", False)
                            speech_final = data.get("speech_final", False)

                            if transcript:
                                if speech_final:
                                    self._cancel_debounce()
                                    self._accumulated_transcript += " " + transcript
                                    full_text = self._accumulated_transcript.strip()
                                    self._accumulated_transcript = ""
                                    logger.info(f"[{self.session_id}] Deepgram SpeechFinal STT: '{full_text}'")
                                    if self.on_final:
                                        await self.on_final(full_text)
                                elif is_final:
                                    self._accumulated_transcript += " " + transcript
                                    # Promptly dispatch debounced final STT within 400ms
                                    self._schedule_debounce()
                                else:
                                    if self.on_interim:
                                        await self.on_interim(transcript)
        except asyncio.CancelledError:
            pass
        except websockets.exceptions.ConnectionClosed:
            logger.info(f"[{self.session_id}] Deepgram STT WebSocket closed")
        except Exception as e:
            logger.error(f"[{self.session_id}] Deepgram STT listen error: {e}")

    def _cancel_debounce(self):
        if self._debounce_task and not self._debounce_task.done():
            self._debounce_task.cancel()

    def _schedule_debounce(self):
        self._cancel_debounce()
        self._debounce_task = asyncio.create_task(self._debounce_worker())

    async def _debounce_worker(self):
        try:
            await asyncio.sleep(0.4)
            full_text = self._accumulated_transcript.strip()
            if full_text:
                self._accumulated_transcript = ""
                logger.info(f"[{self.session_id}] Deepgram Debounced Final STT: '{full_text}'")
                if self.on_final:
                    await self.on_final(full_text)
        except asyncio.CancelledError:
            pass

    async def send_audio(self, pcm_bytes: bytes):
        """Sends raw 16kHz linear PCM audio bytes to Deepgram."""
        if self.ws and self._is_running:
            try:
                await self.ws.send(pcm_bytes)
            except Exception as e:
                logger.debug(f"Error sending audio to Deepgram: {e}")

    async def close(self):
        """Gracefully closes the Deepgram streaming connection."""
        self._is_running = False
        self._cancel_debounce()
        if self._listen_task:
            self._listen_task.cancel()
        if self.ws:
            try:
                await self.ws.send(b"")
                await self.ws.close()
            except Exception:
                pass


class WebRTCVoiceSession:
    """
    Manages a single WebRTC call session:
    Browser Mic ➔ WebRTC Audio Track ➔ Deepgram Live STT ➔ Tool Calling ➔ LLM ➔ Deepgram TTS ➔ Agent WebRTC Track ➔ Browser Speaker
    """

    def __init__(self, session_id: str, token: Optional[str] = None):
        self.session_id = session_id
        self.pc = RTCPeerConnection()
        self.agent_track = AgentAudioTrack()
        self.data_channel: Optional[Any] = None
        self.stt_streamer: Optional[DeepgramLiveSTTStreamer] = None
        self.user_track: Optional[AudioStreamTrack] = None
        self._rx_task: Optional[asyncio.Task] = None
        self.created_at = time.time()
        self.is_active = True
        self._last_agent_text = ""

        # Initialize Agent Brain session
        self.agent_session = agent_brain.get_session(session_id)
        if token:
            self._authenticate_user(token)

        # Attach local outgoing audio track to WebRTC PeerConnection with on_done callback
        self.agent_track = AgentAudioTrack(on_done_fn=self._on_agent_speech_finished)
        self.pc.addTrack(self.agent_track)

        # PeerConnection event handlers
        @self.pc.on("datachannel")
        def on_datachannel(channel):
            self.data_channel = channel
            logger.info(f"[{self.session_id}] WebRTC DataChannel established: {channel.label}")

            @channel.on("message")
            def on_message(message):
                try:
                    payload = json.loads(message)
                    asyncio.create_task(self._handle_client_event(payload))
                except Exception as e:
                    logger.warning(f"Error parsing DataChannel message: {e}")

        @self.pc.on("track")
        def on_track(track):
            if track.kind == "audio":
                logger.info(f"[{self.session_id}] Received WebRTC audio track from browser")
                self.user_track = track
                self._rx_task = asyncio.create_task(self._receive_user_audio_loop(track))

        @self.pc.on("connectionstatechange")
        async def on_connectionstatechange():
            logger.info(f"[{self.session_id}] WebRTC connection state: {self.pc.connectionState}")
            if self.pc.connectionState in ["failed", "closed"]:
                await self.close()

    def _authenticate_user(self, token: str):
        payload = decode_access_token(token)
        if payload and payload.get("email"):
            asyncio.create_task(self._bind_user_async(payload["email"]))

    async def _bind_user_async(self, email: str):
        try:
            user = await db_manager.users.find_one({"email": email})
            if user:
                self.agent_session.user_id = str(user.get("_id", ""))
                self.agent_session.user_name = user.get("name", "")
                self.agent_session.user_email = user.get("email", "")
                self.agent_session.user_phone = user.get("phone", "")
                logger.info(f"[{self.session_id}] Authenticated user: {email}")
        except Exception as e:
            logger.warning(f"User authentication bind error: {e}")

    async def start(self):
        """Starts the Deepgram Live STT streamer and sends welcome greeting."""
        self.stt_streamer = DeepgramLiveSTTStreamer(
            session_id=self.session_id,
            on_interim_fn=self._on_stt_interim,
            on_final_fn=self._on_stt_final,
            on_speech_start_fn=self._on_speech_started,
        )
        await self.stt_streamer.start()

        # Send welcome greeting over WebRTC
        welcome_text = (
            f"Hello! I am {VOICE_AGENT_NAME}, your RailVoice assistant. "
            "Where would you like to travel from and to?"
        )
        asyncio.create_task(self._speak_and_broadcast(welcome_text, badge=f"📞 Agent {VOICE_AGENT_NAME} Online • Aura 2 Voice"))

    async def _receive_user_audio_loop(self, track: AudioStreamTrack):
        """Pulls audio frames from the user's mic over WebRTC, downsamples to 16kHz PCM, and sends to Deepgram STT."""
        try:
            while self.is_active:
                frame = await track.recv()
                arr = frame.to_ndarray()

                if arr.ndim == 2:
                    mono_audio = arr[0]
                else:
                    mono_audio = arr

                rate = frame.sample_rate or WEBRTC_SAMPLE_RATE
                if rate == 48000:
                    mono_16k = mono_audio[::3]
                elif rate == 16000:
                    mono_16k = mono_audio
                else:
                    new_len = int(len(mono_audio) * 16000 / rate)
                    indices = np.linspace(0, len(mono_audio) - 1, new_len).astype(int)
                    mono_16k = mono_audio[indices]

                pcm_bytes = mono_16k.astype(np.int16).tobytes()
                if self.stt_streamer:
                    await self.stt_streamer.send_audio(pcm_bytes)
        except asyncio.CancelledError:
            pass
        except Exception as e:
            logger.error(f"[{self.session_id}] Audio rx loop error: {e}")

    async def _on_speech_started(self):
        """VAD event: log only; do NOT abruptly cut off agent speech on acoustic echo."""
        logger.debug(f"[{self.session_id}] Deepgram VAD SpeechStarted")

    async def _on_agent_speech_finished(self):
        """Triggered when agent audio queue finishes playback."""
        logger.info(f"[{self.session_id}] Agent speech queue finished playback; listening for passenger")
        await self.send_event({
            "type": "agent_speech_done",
            "action_badge": "👂 Listening to you...",
            "pipeline_stage": "CONNECTED"
        })

    async def _on_stt_interim(self, interim_text: str):
        """Sends interim speech transcription to frontend and triggers barge-in if genuine user words arrive."""
        clean = interim_text.strip().lower()
        if not clean:
            return

        # Barge-in: if agent is currently speaking, only interrupt if user spoke real words that aren't echo of agent speech
        if self.agent_track.is_playing() and len(clean) >= 4:
            if not self._last_agent_text or clean not in self._last_agent_text:
                logger.info(f"[{self.session_id}] Genuine user speech detected ('{clean}'); interrupting agent")
                self.agent_track.interrupt()
                await self.send_event({
                    "type": "agent_interrupted",
                    "action_badge": "👂 Listening to you...",
                    "pipeline_stage": "USER_SPEAKING"
                })

        await self.send_event({
            "type": "user_interim",
            "text": interim_text,
            "action_badge": "🎙️ Transcribing speech...",
            "pipeline_stage": "DEEPGRAM_STT"
        })

    async def _on_stt_final(self, user_utterance: str):
        """
        Main Pipeline Trigger:
        User Utterance (Deepgram STT) ➔ Tool Calling & Policy Engine ➔ LLM Response ➔ Deepgram TTS ➔ WebRTC Track
        """
        if not user_utterance or not user_utterance.strip():
            return

        logger.info(f"[{self.session_id}] Processing final utterance: '{user_utterance}'")

        # 1. Broadcast user utterance and processing indicator
        await self.send_event({
            "type": "user_final",
            "text": user_utterance,
            "action_badge": "🛠️ Running Railway Tools & Policies...",
            "pipeline_stage": "TOOL_CALLING"
        })

        # 2. Tool Execution & LLM Response via Agent Brain
        response_data = await agent_brain.process_user_utterance(self.session_id, user_utterance)
        agent_text = response_data.get("text", "")
        action_badge = response_data.get("action_badge", "🤖 Officer Priya Responding")
        tool_called = response_data.get("tool_called")
        booking_state = response_data.get("booking_state")
        tool_data = response_data.get("tool_data")

        # 3. Broadcast Tool Result & LLM Response
        await self.send_event({
            "type": "tool_executed",
            "text": agent_text,
            "action_badge": action_badge,
            "tool_called": tool_called,
            "booking_state": booking_state,
            "tool_data": tool_data,
            "pipeline_stage": "DEEPGRAM_TTS"
        })

        # 4. Synthesize Deepgram TTS & Queue to WebRTC Outgoing Audio Track
        await self._speak_and_broadcast(
            agent_text,
            badge=action_badge,
            tool_called=tool_called,
            booking_state=booking_state,
            tool_data=tool_data,
        )

    async def _speak_and_broadcast(
        self,
        text: str,
        badge: Optional[str] = None,
        tool_called: Optional[str] = None,
        booking_state: Optional[Dict] = None,
        tool_data: Optional[Dict] = None,
    ):
        """Synthesizes text using Deepgram TTS and pushes directly to WebRTC audio track."""
        try:
            self._last_agent_text = text.lower()
            audio_bytes = await voice_service.synthesize_speech_bytes(text)
            if audio_bytes:
                # Push to WebRTC AudioTrack
                self.agent_track.enqueue_audio_bytes(audio_bytes)

            await self.send_event({
                "type": "agent_speech",
                "text": text,
                "action_badge": badge or "🔊 Officer Priya Speaking",
                "tool_called": tool_called,
                "booking_state": booking_state,
                "tool_data": tool_data,
                "pipeline_stage": "WEBRTC_OUTPUT"
            })
        except Exception as e:
            logger.error(f"[{self.session_id}] Error in _speak_and_broadcast: {e}")

    async def _handle_client_event(self, data: Dict[str, Any]):
        """Handles events sent from browser over WebRTC DataChannel."""
        event_type = data.get("type")
        if event_type == "user_interrupt":
            await self._on_speech_started()
        elif event_type == "text_prompt":
            prompt = data.get("text", "")
            if prompt:
                await self._on_stt_final(prompt)
        elif event_type == "end_call":
            await self.close()

    async def send_event(self, data: Dict[str, Any]):
        """Broadcasts event payload through WebRTC DataChannel if open."""
        if self.data_channel and self.data_channel.readyState == "open":
            try:
                self.data_channel.send(json.dumps(data))
            except Exception as e:
                logger.debug(f"DataChannel send error: {e}")

    async def close(self):
        """Gracefully closes WebRTC connection and cleans up streaming tasks."""
        if not self.is_active:
            return
        self.is_active = False
        logger.info(f"[{self.session_id}] Closing WebRTC session")

        if self._rx_task:
            self._rx_task.cancel()
        if self.stt_streamer:
            await self.stt_streamer.close()
        if self.pc:
            await self.pc.close()


class WebRTCManager:
    """Manages active WebRTC voice sessions."""

    def __init__(self):
        self.sessions: Dict[str, WebRTCVoiceSession] = {}

    def create_session(self, session_id: Optional[str] = None, token: Optional[str] = None) -> WebRTCVoiceSession:
        sid = session_id or f"webrtc_{uuid.uuid4().hex[:8]}"
        session = WebRTCVoiceSession(session_id=sid, token=token)
        self.sessions[sid] = session
        return session

    def get_session(self, session_id: str) -> Optional[WebRTCVoiceSession]:
        return self.sessions.get(session_id)

    async def cleanup_inactive(self):
        to_delete = [sid for sid, s in self.sessions.items() if not s.is_active]
        for sid in to_delete:
            s = self.sessions.pop(sid, None)
            if s:
                await s.close()


webrtc_manager = WebRTCManager()
