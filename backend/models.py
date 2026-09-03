from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime

class UserRegister(BaseModel):
    name: str
    email: str
    password: str
    phone: Optional[str] = None

class UserLogin(BaseModel):
    email: str
    password: str

class UserResponse(BaseModel):
    id: str
    name: str
    email: str
    phone: Optional[str] = None

class TokenResponse(BaseModel):
    token: str
    user: UserResponse

class Passenger(BaseModel):
    name: str
    age: int
    gender: str = "M"  # M, F, O
    berth_preference: Optional[str] = "No Preference"  # Lower, Upper, Middle, Side Lower, Side Upper, Window
    id_type: Optional[str] = "Aadhaar Card"
    id_number: Optional[str] = "XXXX-XXXX-1234"

class BookingRequest(BaseModel):
    train_number: str
    train_name: Optional[str] = None
    from_station_code: str
    to_station_code: str
    journey_date: str  # YYYY-MM-DD
    travel_class: str  # CC, EC, 1A, 2A, 3A, SL, 2S
    passengers: List[Passenger]
    quota: str = "GN"  # GN, TQ, LD, SS
    booked_via: str = "WEB_MANUAL"  # WEB_MANUAL or VOICE_AGENT
    contact_phone: Optional[str] = "+91 9876543210"
    contact_email: Optional[str] = "passenger@example.com"
    user_id: Optional[str] = None
    user_email: Optional[str] = None

class BookingRecord(BaseModel):
    pnr: str
    train_number: str
    train_name: str
    from_station_code: str
    from_station_name: str
    to_station_code: str
    to_station_name: str
    departure_time: str
    arrival_time: str
    journey_date: str
    travel_class: str
    quota: str
    passengers: List[Dict[str, Any]]
    total_fare: float
    base_fare_per_ticket: float
    status: str = "CONFIRMED"  # CONFIRMED, CANCELLED
    booked_via: str
    contact_phone: Optional[str] = None
    contact_email: Optional[str] = None
    user_id: Optional[str] = None
    user_email: Optional[str] = None
    created_at: str
    cancelled_at: Optional[str] = None
    cancellation_charge: Optional[float] = 0.0
    refund_amount: Optional[float] = 0.0
    refund_status: Optional[str] = None

class CancellationRequest(BaseModel):
    pnr: str
    reason: Optional[str] = "Customer requested cancellation"

class TrainSearchQuery(BaseModel):
    from_station: str
    to_station: str
    date: Optional[str] = None
    travel_class: Optional[str] = None

class VoiceAgentInput(BaseModel):
    session_id: str
    text: str
    context: Optional[Dict[str, Any]] = None
