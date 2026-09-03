import asyncio
import base64
import os
import io
import logging
import httpx
from typing import Optional
import edge_tts
from config import VOICE_SYNTH_VOICE, VOICE_RATE, VOICE_PITCH, DEEPGRAM_API_KEY, DEEPGRAM_VOICE_MODEL

logger = logging.getLogger("railvoice.voice")

class VoiceService:
    def __init__(self):
        self.edge_voice = VOICE_SYNTH_VOICE
        self.rate = VOICE_RATE
        self.pitch = VOICE_PITCH
        self.deepgram_key = DEEPGRAM_API_KEY.strip() if DEEPGRAM_API_KEY else ""
        self.deepgram_model = DEEPGRAM_VOICE_MODEL or "aura-asteria-en"
        self._cache = {}

    async def _deepgram_tts(self, clean_text: str) -> Optional[str]:
        """Synthesizes text using Deepgram Flux / Aura TTS API."""
        if not self.deepgram_key:
            return None
        
        try:
            # Flux models (like flux-priya-en) require /v2/speak endpoint
            endpoint_version = "v2" if "flux" in self.deepgram_model.lower() else "v1"
            url = f"https://api.deepgram.com/{endpoint_version}/speak?model={self.deepgram_model}"
            headers = {
                "Authorization": f"Token {self.deepgram_key}",
                "Content-Type": "application/json"
            }
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.post(url, headers=headers, json={"text": clean_text})
                if resp.status_code == 200 and resp.content:
                    b64_audio = base64.b64encode(resp.content).decode("utf-8")
                    logger.info(f"Synthesized speech via Deepgram {self.deepgram_model} - {len(resp.content)} bytes")
                    return f"data:audio/mp3;base64,{b64_audio}"
                else:
                    logger.warning(f"Deepgram TTS response status: {resp.status_code}, msg: {resp.text[:150]}")
        except Exception as e:
            logger.warning(f"Deepgram TTS error: {e}")
        return None

    async def _edge_tts(self, clean_text: str) -> Optional[str]:
        """Synthesizes text using Microsoft Azure Neural Edge-TTS."""
        try:
            communicate = edge_tts.Communicate(
                text=clean_text,
                voice=self.edge_voice,
                rate=self.rate,
                pitch=self.pitch
            )
            audio_buffer = io.BytesIO()
            async for chunk in communicate.stream():
                if chunk["type"] == "audio":
                    audio_buffer.write(chunk["data"])
            
            audio_bytes = audio_buffer.getvalue()
            if audio_bytes:
                b64_audio = base64.b64encode(audio_bytes).decode("utf-8")
                return f"data:audio/mp3;base64,{b64_audio}"
        except Exception as e:
            logger.error(f"Edge-TTS synthesis error: {e}")
        return None

    async def text_to_speech_base64(self, text: str) -> Optional[str]:
        """Synthesizes text into MP3 audio and returns Base64 data string."""
        if not text or not text.strip():
            return None
        
        # Clean text
        clean_text = text.replace("**", "").replace("*", "").replace("`", "").replace("#", "")
        clean_text = clean_text.replace("₹", "Rupees ")

        # Check Cache
        if clean_text in self._cache:
            return self._cache[clean_text]

        # 1. Primary: Deepgram Aura TTS
        audio_uri = None
        if self.deepgram_key:
            audio_uri = await self._deepgram_tts(clean_text)

        # 2. Fallback: Neural Edge-TTS
        if not audio_uri:
            audio_uri = await self._edge_tts(clean_text)

        if audio_uri:
            self._cache[clean_text] = audio_uri

        return audio_uri

    async def transcribe_audio_chunk(self, audio_bytes: bytes, content_type: str = "audio/wav") -> Optional[str]:
        """Transcribes incoming audio bytes using Deepgram Nova-2."""
        if not self.deepgram_key:
            return None
        
        try:
            url = "https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true&language=en-IN"
            headers = {
                "Authorization": f"Token {self.deepgram_key}",
                "Content-Type": content_type
            }
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.post(url, headers=headers, content=audio_bytes)
                if resp.status_code == 200:
                    data = resp.json()
                    transcript = data["results"]["channels"][0]["alternatives"][0]["transcript"]
                    return transcript
        except Exception as e:
            logger.error(f"Deepgram transcription error: {e}")
        return None

voice_service = VoiceService()
