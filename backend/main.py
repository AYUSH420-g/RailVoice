import json
import logging
import asyncio
from datetime import datetime
from contextlib import asynccontextmanager
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, Query, Depends, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List, Dict, Any

from config import MONGO_URI, DATABASE_NAME, PORT, HOST
from database import db_manager
from models import (
    BookingRequest, CancellationRequest, Passenger,
    UserRegister, UserLogin, UserResponse, TokenResponse
)
from services.auth_service import (
    hash_password, verify_password, create_access_token,
    get_current_user, get_optional_current_user, decode_access_token
)
from services.train_service import train_service, STATION_MAP
from services.policy_service import RailwayPolicyEngine
from services.voice_service import voice_service
from services.agent_brain import agent_brain

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("railvoice.server")

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Initializing RailVoice database connection...")
    await db_manager.initialize(MONGO_URI, DATABASE_NAME)
    logger.info("RailVoice server startup complete.")
    yield
    logger.info("RailVoice server shutting down.")

app = FastAPI(
    title="RailVoice - AI Automated Railway Booking Engine",
    version="1.0.0",
    description="Autonomous Voice Agent and Real Railway Reservation Backend",
    lifespan=lifespan
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ----------------- Health & Status -----------------
@app.get("/api/health")
async def health_check():
    return {
        "status": "online",
        "service": "RailVoice Engine",
        "database_connected": True,
        "voice_engine": "Ready",
        "system_time": datetime.now().isoformat()
    }

# ----------------- Train & Stations APIs -----------------
@app.get("/api/trains/stations")
async def get_stations():
    return {"stations": train_service.get_all_stations()}

@app.get("/api/trains/search")
async def search_trains(
    from_station: str = Query(..., description="Source station code or city"),
    to_station: str = Query(..., description="Destination station code or city"),
    date: Optional[str] = Query(None, description="Journey date YYYY-MM-DD"),
    travel_class: Optional[str] = Query(None, description="Travel class (e.g. 3A, 2A, CC)")
):
    trains = train_service.search_trains(from_station, to_station, date, travel_class)
    return {
        "from_station": from_station,
        "to_station": to_station,
        "journey_date": date or datetime.now().strftime("%Y-%m-%d"),
        "total_trains": len(trains),
        "trains": trains
    }

@app.get("/api/trains/{train_number}")
async def get_train_details(train_number: str):
    train = train_service.get_train_by_number(train_number)
    if not train:
        raise HTTPException(status_code=404, detail="Train not found")
    return train

# ----------------- Policy Endpoints -----------------
@app.get("/api/policy")
async def get_policies():
    return RailwayPolicyEngine.get_all_policies()

@app.get("/api/policy/query")
async def query_policy(topic: str):
    answer = RailwayPolicyEngine.answer_policy_query(topic)
    return {"topic": topic, "answer": answer}

# ----------------- Authentication APIs -----------------
@app.post("/api/auth/signup", response_model=TokenResponse)
async def signup(payload: UserRegister):
    clean_email = payload.email.lower().strip()
    if not clean_email or not payload.password:
        raise HTTPException(status_code=400, detail="Email and password are required.")
    
    existing_user = await db_manager.users.find_one({"email": clean_email})
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="An account with this email address already exists. Please log in."
        )
    
    pwd_hash = hash_password(payload.password)
    user_doc = {
        "name": payload.name.strip() or "Passenger",
        "email": clean_email,
        "password_hash": pwd_hash,
        "phone": payload.phone.strip() if payload.phone else None,
        "created_at": datetime.now().isoformat()
    }
    
    res = await db_manager.users.insert_one(user_doc)
    user_id = str(getattr(res, "inserted_id", user_doc.get("_id", "")))
    user_doc["_id"] = user_id

    token = create_access_token(user_doc)
    return {
        "token": token,
        "user": {
            "id": user_id,
            "name": user_doc["name"],
            "email": user_doc["email"],
            "phone": user_doc.get("phone")
        }
    }

@app.post("/api/auth/login", response_model=TokenResponse)
async def login(payload: UserLogin):
    clean_email = payload.email.lower().strip()
    user = await db_manager.users.find_one({"email": clean_email})
    if not user or not verify_password(payload.password, user.get("password_hash", "")):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password."
        )
    
    user_id = str(user.get("_id", ""))
    token = create_access_token(user)
    return {
        "token": token,
        "user": {
            "id": user_id,
            "name": user.get("name", "Passenger"),
            "email": user.get("email"),
            "phone": user.get("phone")
        }
    }

@app.get("/api/auth/me", response_model=UserResponse)
async def get_current_user_profile(current_user: Dict[str, Any] = Depends(get_current_user)):
    return {
        "id": str(current_user.get("_id", "")),
        "name": current_user.get("name", "Passenger"),
        "email": current_user.get("email", ""),
        "phone": current_user.get("phone")
    }

# ----------------- Bookings APIs -----------------
@app.post("/api/bookings")
async def create_manual_booking(
    request: BookingRequest,
    current_user: Optional[Dict[str, Any]] = Depends(get_optional_current_user)
):
    # 1. Enforce Railway Policy Guardrails
    passengers_list = [p.model_dump() for p in request.passengers]
    valid, msg = RailwayPolicyEngine.validate_booking(passengers_list, quota=request.quota, travel_class=request.travel_class)
    if not valid:
        raise HTTPException(status_code=400, detail=msg)

    # 2. Lookup train
    train = train_service.get_train_by_number(request.train_number)
    if not train:
        raise HTTPException(status_code=404, detail=f"Train number {request.train_number} not found")

    cls_info = train.get("classes", {}).get(request.travel_class, {})
    base_fare = cls_info.get("base_fare", 1500)
    total_fare = base_fare * len(request.passengers)
    pnr = train_service.generate_pnr()

    allocated_passengers = []
    for idx, p in enumerate(request.passengers):
        berth_alloc = train_service.allocate_berth(request.travel_class, idx + 1)
        p_dict = p.model_dump()
        p_dict.update(berth_alloc)
        allocated_passengers.append(p_dict)

    # Associate with authenticated user if present
    user_id = str(current_user["_id"]) if current_user else request.user_id
    user_email = current_user["email"] if current_user else request.user_email

    booking_doc = {
        "pnr": pnr,
        "train_number": train["train_number"],
        "train_name": train["train_name"],
        "from_station_code": train["from_station_code"],
        "from_station_name": STATION_MAP.get(train["from_station_code"], train["from_station_name"]),
        "to_station_code": train["to_station_code"],
        "to_station_name": STATION_MAP.get(train["to_station_code"], train["to_station_name"]),
        "departure_time": train["departure_time"],
        "arrival_time": train["arrival_time"],
        "journey_date": request.journey_date,
        "travel_class": request.travel_class,
        "quota": request.quota,
        "passengers": allocated_passengers,
        "total_fare": float(total_fare),
        "base_fare_per_ticket": float(base_fare),
        "status": "CONFIRMED",
        "booked_via": request.booked_via,
        "contact_phone": request.contact_phone,
        "contact_email": user_email or request.contact_email,
        "user_id": user_id,
        "user_email": user_email,
        "created_at": datetime.now().isoformat()
    }

    await db_manager.bookings.insert_one(booking_doc)
    return {
        "success": True,
        "message": "Train ticket booked successfully!",
        "booking": booking_doc
    }

@app.get("/api/bookings")
async def get_all_bookings(current_user: Optional[Dict[str, Any]] = Depends(get_optional_current_user)):
    all_bookings = await db_manager.bookings.find().sort("created_at", -1).to_list(300)
    
    if current_user:
        u_id = str(current_user.get("_id", ""))
        u_email = (current_user.get("email") or "").lower()
        # Filter strictly for this authenticated user
        filtered = [
            b for b in all_bookings
            if (b.get("user_id") and str(b.get("user_id")) == u_id)
            or (b.get("user_email") and str(b.get("user_email")).lower() == u_email)
            or (b.get("contact_email") and str(b.get("contact_email")).lower() == u_email)
        ]
        return {"bookings": filtered}
    
    # If not logged in, return empty bookings list to ensure privacy and individual isolation
    return {"bookings": []}

@app.get("/api/bookings/{pnr}")
async def get_booking_by_pnr(pnr: str):
    booking = await db_manager.bookings.find_one({"pnr": pnr})
    if not booking:
        raise HTTPException(status_code=404, detail="PNR record not found")
    return booking

@app.post("/api/bookings/cancel")
async def cancel_booking(req: CancellationRequest):
    booking = await db_manager.bookings.find_one({"pnr": req.pnr})
    if not booking:
        raise HTTPException(status_code=404, detail="PNR record not found")
    
    if booking.get("status") == "CANCELLED":
        return {
            "success": False,
            "message": "This ticket has already been cancelled previously.",
            "booking": booking
        }

    # Strict cancellation refund calculation
    refund_calc = RailwayPolicyEngine.calculate_cancellation_refund(
        travel_class=booking.get("travel_class", "3A"),
        journey_date=booking.get("journey_date", datetime.now().strftime("%Y-%m-%d")),
        departure_time=booking.get("departure_time", "12:00"),
        total_fare=booking.get("total_fare", 1500.0),
        num_passengers=len(booking.get("passengers", [1])),
        quota=booking.get("quota", "GN")
    )

    update_payload = {
        "status": "CANCELLED",
        "cancelled_at": datetime.now().isoformat(),
        "cancellation_reason": req.reason,
        "cancellation_charge": refund_calc["cancellation_charge"],
        "refund_amount": refund_calc["refund_amount"],
        "refund_status": "REFUND_INITIATED" if refund_calc["refundable"] else "NO_REFUND_APPLICABLE",
        "policy_rule_applied": refund_calc["reason"]
    }

    await db_manager.bookings.update_one({"pnr": req.pnr}, {"$set": update_payload})
    booking.update(update_payload)

    return {
        "success": True,
        "message": "Booking cancellation processed.",
        "refund_details": refund_calc,
        "booking": booking
    }

# ----------------- Voice REST Fallback Endpoint -----------------
class VoiceUtterance(BaseModel):
    session_id: str
    text: str

@app.post("/api/voice/chat")
async def voice_chat_endpoint(payload: VoiceUtterance):
    agent_output = await agent_brain.process_user_utterance(payload.session_id, payload.text)
    # Generate high quality speech using Deepgram Aura
    audio_b64 = await voice_service.text_to_speech_base64(agent_output["text"])
    agent_output["audio"] = audio_b64
    return agent_output

@app.post("/api/voice/transcribe")
async def voice_transcribe_endpoint(request: Request):
    audio_data = await request.body()
    content_type = request.headers.get("content-type", "audio/wav")
    transcript = await voice_service.transcribe_audio_chunk(audio_data, content_type)
    return {"transcript": transcript or ""}

# ----------------- WebSocket Real-time Voice Call -----------------
@app.websocket("/ws/voice-agent")
async def voice_agent_websocket(websocket: WebSocket, token: Optional[str] = Query(None)):
    await websocket.accept()
    session_id = f"session_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
    logger.info(f"WebSocket client connected: {session_id}")

    session = agent_brain.get_session(session_id)

    # If token provided via query parameter, bind user
    if token:
        payload = decode_access_token(token)
        if payload and payload.get("email"):
            user = await db_manager.users.find_one({"email": payload["email"]})
            if user:
                session.user_id = str(user.get("_id", ""))
                session.user_name = user.get("name", "")
                session.user_email = user.get("email", "")
                session.user_phone = user.get("phone", "")

    # Send initial greeting sound and welcome message with Deepgram Flux Priya voice
    welcome_text = (
        "Namaste! I am Priya, your RailVoice smart railway booking assistant. "
        "I can help you search live trains, check seat availability, and book your tickets. "
        "Where would you like to travel from and to?"
    )
    welcome_audio = await voice_service.text_to_speech_base64(welcome_text)
    await websocket.send_json({
        "type": "agent_connected",
        "session_id": session_id,
        "text": welcome_text,
        "audio": welcome_audio,
        "action_badge": "📞 Officer Priya Online • Deepgram Voice"
    })

    try:
        while True:
            raw_msg = await websocket.receive_text()
            data = json.loads(raw_msg)
            msg_type = data.get("type", "user_speech")

            if msg_type == "auth":
                auth_token = data.get("token")
                if auth_token:
                    payload = decode_access_token(auth_token)
                    if payload and payload.get("email"):
                        usr = await db_manager.users.find_one({"email": payload["email"]})
                        if usr:
                            session.user_id = str(usr.get("_id", ""))
                            session.user_name = usr.get("name", "")
                            session.user_email = usr.get("email", "")
                            session.user_phone = usr.get("phone", "")
                            logger.info(f"[{session_id}] Voice session authenticated for {usr.get('email')}")
                continue

            if msg_type == "user_interrupt":
                logger.info(f"[{session_id}] Customer interrupted agent speech")
                await websocket.send_json({
                    "type": "interrupted",
                    "action_badge": "👂 Listening to you..."
                })
                continue

            if msg_type == "user_speech":
                user_text = data.get("text", "").strip()
                if not user_text:
                    continue

                logger.info(f"[{session_id}] Customer utterance: {user_text}")

                # Send typing / processing indicator
                await websocket.send_json({
                    "type": "agent_processing",
                    "action_badge": "🧠 Processing your request..."
                })

                # Process through agent brain
                response_data = await agent_brain.process_user_utterance(session_id, user_text)
                
                # Synthesize TTS Audio
                tts_audio = await voice_service.text_to_speech_base64(response_data["text"])

                # Send back agent speech, action, tool execution and booking state
                await websocket.send_json({
                    "type": "agent_speech",
                    "text": response_data["text"],
                    "audio": tts_audio,
                    "action_badge": response_data.get("action_badge"),
                    "tool_called": response_data.get("tool_called"),
                    "booking_state": response_data.get("booking_state"),
                    "tool_data": response_data.get("tool_data"),
                    "session": response_data.get("session")
                })

            elif msg_type == "ping":
                await websocket.send_json({"type": "pong"})

            elif msg_type == "end_call":
                farewell = "Thank you for calling RailVoice. Have a safe and pleasant journey! Goodbye."
                bye_audio = await voice_service.text_to_speech_base64(farewell)
                await websocket.send_json({
                    "type": "call_ended",
                    "text": farewell,
                    "audio": bye_audio,
                    "action_badge": "📴 Call Ended"
                })
                break

    except WebSocketDisconnect:
        logger.info(f"WebSocket client disconnected: {session_id}")
    except Exception as e:
        logger.error(f"WebSocket error in {session_id}: {e}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host=HOST, port=PORT, reload=True)
