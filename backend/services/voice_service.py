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
        self.deepgram_model = DEEPGRAM_VOICE_MODEL or "aura-2-thalia-en"
        self._cache = {}
        self._bytes_cache = {}

    async def _deepgram_tts_bytes(self, clean_text: str) -> Optional[bytes]:
        """Synthesizes text using Deepgram Flux / Aura 2 TTS API and returns raw audio bytes."""
        if not self.deepgram_key:
            return None
        
        try:
            endpoint_version = "v2" if "flux" in self.deepgram_model.lower() else "v1"
            url = f"https://api.deepgram.com/{endpoint_version}/speak?model={self.deepgram_model}"
            headers = {
                "Authorization": f"Token {self.deepgram_key}",
                "Content-Type": "application/json"
            }
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.post(url, headers=headers, json={"text": clean_text})
                if resp.status_code == 200 and resp.content:
                    logger.info(f"Synthesized speech via Deepgram {self.deepgram_model} - {len(resp.content)} bytes")
                    return resp.content
                else:
                    # Fallback to standard Aura 2 Thalia
                    fallback_url = "https://api.deepgram.com/v1/speak?model=aura-2-thalia-en"
                    fb_resp = await client.post(fallback_url, headers=headers, json={"text": clean_text})
                    if fb_resp.status_code == 200 and fb_resp.content:
                        return fb_resp.content
                    logger.warning(f"Deepgram TTS response status: {resp.status_code}, msg: {resp.text[:150]}")
        except Exception as e:
            logger.warning(f"Deepgram TTS error: {e}")
        return None

    async def _edge_tts_bytes(self, clean_text: str) -> Optional[bytes]:
        """Synthesizes text using Microsoft Azure Neural Edge-TTS into raw audio bytes."""
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
                return audio_bytes
        except Exception as e:
            logger.error(f"Edge-TTS synthesis error: {e}")
        return None

    async def synthesize_speech_bytes(self, text: str) -> Optional[bytes]:
        """Returns synthesized raw audio bytes (MP3/WAV) using Deepgram Aura/Flux with Edge-TTS fallback."""
        if not text or not text.strip():
            return None
        
        clean_text = text.replace("**", "").replace("*", "").replace("`", "").replace("#", "")
        clean_text = clean_text.replace("₹", "Rupees ")

        if clean_text in self._bytes_cache:
            return self._bytes_cache[clean_text]

        audio_bytes = None
        if self.deepgram_key:
            audio_bytes = await self._deepgram_tts_bytes(clean_text)

        if not audio_bytes:
            audio_bytes = await self._edge_tts_bytes(clean_text)

        if audio_bytes:
            self._bytes_cache[clean_text] = audio_bytes

        return audio_bytes

    async def text_to_speech_base64(self, text: str) -> Optional[str]:
        """Synthesizes text into MP3 audio and returns Base64 data string."""
        audio_bytes = await self.synthesize_speech_bytes(text)
        if audio_bytes:
            b64 = base64.b64encode(audio_bytes).decode("utf-8")
            return f"data:audio/mp3;base64,{b64}"
        return None

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
