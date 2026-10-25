import os
from dotenv import load_dotenv

load_dotenv()

MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017/railvoice")
DATABASE_NAME = os.getenv("DATABASE_NAME", "railvoice")
PORT = int(os.getenv("PORT", 8000))
HOST = os.getenv("HOST", "0.0.0.0")

# Voice & AI API Keys (Optional with built-in realistic synthesizers & offline fallback)
DEEPGRAM_API_KEY = os.getenv("DEEPGRAM_API_KEY", "")
DEEPGRAM_VOICE_MODEL = os.getenv("DEEPGRAM_VOICE_MODEL", "aura-2-thalia-en")
VOICE_AGENT_NAME = os.getenv("VOICE_AGENT_NAME", "Thalia")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
RAPIDAPI_KEY = os.getenv("RAPIDAPI_KEY", "")
RAILRADAR_API_KEY = os.getenv("RAILRADAR_API_KEY", "")
RAILRADAR_BASE_URL = os.getenv("RAILRADAR_BASE_URL", "https://api.railradar.in/v1")

# Voice Engine Settings
VOICE_SYNTH_VOICE = os.getenv("VOICE_SYNTH_VOICE", "en-IN-NeerjaNeural")  # Natural Indian English Voice
VOICE_RATE = os.getenv("VOICE_RATE", "+0%")
VOICE_PITCH = os.getenv("VOICE_PITCH", "+0Hz")

# Deepgram Live STT Streaming & WebRTC Configuration
DEEPGRAM_STT_MODEL = os.getenv("DEEPGRAM_STT_MODEL", "nova-2")
DEEPGRAM_STT_LANGUAGE = os.getenv("DEEPGRAM_STT_LANGUAGE", "en-IN")
DEEPGRAM_ENDPOINTING = int(os.getenv("DEEPGRAM_ENDPOINTING", "350"))  # ms of silence to mark final utterance
WEBRTC_SAMPLE_RATE = 48000
DEEPGRAM_SAMPLE_RATE = 16000
