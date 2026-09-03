#!/bin/bash
set -e

echo "=========================================================="
echo "🚄 RailVoice AI: Automated Train Booking & Voice Agent 🚄"
echo "=========================================================="

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"

# 1. Start Python Backend
echo "⚙️ Starting FastAPI Backend on http://localhost:8000 ..."
cd "$ROOT_DIR/backend"
source venv/bin/activate
uvicorn main:app --host 0.0.0.0 --port 8000 &
BACKEND_PID=$!

# 2. Start React Frontend
echo "🌐 Starting React Vite Frontend on http://localhost:5173 ..."
cd "$ROOT_DIR/frontend"
npm run dev -- --host &
FRONTEND_PID=$!

echo "=========================================================="
echo "✅ Both Backend and Frontend are running!"
echo "📍 Web Application URL: http://localhost:5173"
echo "📍 Backend API Docs:   http://localhost:8000/docs"
echo "📍 WebSocket Endpoint: ws://localhost:8000/ws/voice-agent"
echo "Press Ctrl+C to stop both servers."
echo "=========================================================="

trap "echo 'Stopping servers...'; kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit 0" SIGINT SIGTERM EXIT
wait
