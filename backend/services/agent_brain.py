import re
import os
import json
import random
import logging
import httpx
from datetime import datetime, timedelta
from typing import Dict, Any, List, Optional, Tuple
from services.train_service import train_service, STATION_MAP
from services.policy_service import RailwayPolicyEngine
from database import db_manager
from config import OPENAI_API_KEY, GEMINI_API_KEY, GROQ_API_KEY

logger = logging.getLogger("railvoice.agent_brain")

# City / Station voice aliases
CITY_STATION_ALIASES = {
    "delhi": "NDLS", "new delhi": "NDLS", "ndls": "NDLS",
    "mumbai": "MMCT", "bombay": "MMCT", "mumbai central": "MMCT", "mmct": "MMCT", "csmt": "CSMT",
    "varanasi": "BSB", "banaras": "BSB", "kashi": "BSB", "bsb": "BSB",
    "kolkata": "HWH", "calcutta": "HWH", "howrah": "HWH", "hwh": "HWH",
    "bangalore": "SBC", "bengaluru": "SBC", "sbc": "SBC",
    "chennai": "MAS", "madras": "MAS", "mas": "MAS",
    "ahmedabad": "ADI", "adi": "ADI",
    "pune": "PUNE", "jaipur": "JP", "jp": "JP",
    "lucknow": "LKO", "lko": "LKO",
    "bhopal": "RKMP", "rkmp": "RKMP",
    "kanpur": "CNB", "cnb": "CNB",
    "agra": "AGC", "agc": "AGC",
    "surat": "ST", "st": "ST",
    "vadodara": "BRC", "baroda": "BRC", "brc": "BRC",
    "mysore": "MYS", "mysuru": "MYS", "mys": "MYS",
    "gwalior": "GWL", "gwl": "GWL",
    "jhansi": "VGLJ", "vglj": "VGLJ",
    "nagpur": "NGP", "ngp": "NGP",
    "prayagraj": "PRYJ", "allahabad": "PRYJ", "pryj": "PRYJ",
    "patna": "PNBE", "pnbe": "PNBE",
    "chandigarh": "CDG", "cdg": "CDG",
    "amritsar": "ASR", "asr": "ASR",
    "hyderabad": "HYB", "secunderabad": "SC"
}

NUMBER_WORDS = {
    "one": 1, "single": 1, "1": 1,
    "two": 2, "couple": 2, "both": 2, "2": 2,
    "three": 3, "3": 3,
    "four": 4, "4": 4,
    "five": 5, "5": 5,
    "six": 6, "6": 6
}

# ---------------------------------------------------------------------------
# Booking State
# ---------------------------------------------------------------------------
class BookingState:
    def __init__(self):
        self.from_station: Optional[str] = None
        self.from_station_name: Optional[str] = None
        self.to_station: Optional[str] = None
        self.to_station_name: Optional[str] = None
        self.date: Optional[str] = None
        self.train_number: Optional[str] = None
        self.train_name: Optional[str] = None
        self.travel_class: Optional[str] = None   # 1A, 2A, 3A, CC, EC, SL
        self.seat_count: Optional[int] = None      # 1 to 6
        self.passengers: List[Dict[str, Any]] = [] # [{"name": "...", "age": ...}]
        self.pending_confirmation: bool = False

    def missing_requirements(self) -> List[str]:
        """Returns list of missing requirements needed to book."""
        missing = []
        if not self.from_station or not self.to_station:
            missing.append("ROUTE")
        if not self.train_number:
            missing.append("TRAIN")
        if not self.travel_class:
            missing.append("CLASS")
        if not self.seat_count:
            missing.append("SEATS")
        elif len(self.passengers) < self.seat_count:
            missing.append("PASSENGERS")
        return missing

    def is_fully_ready(self) -> bool:
        return len(self.missing_requirements()) == 0

    def to_dict(self) -> Dict[str, Any]:
        return {
            "from_station": self.from_station,
            "from_station_name": self.from_station_name or STATION_MAP.get(self.from_station or "", self.from_station),
            "to_station": self.to_station,
            "to_station_name": self.to_station_name or STATION_MAP.get(self.to_station or "", self.to_station),
            "date": self.date,
            "train_number": self.train_number,
            "train_name": self.train_name,
            "travel_class": self.travel_class,
            "seat_count": self.seat_count,
            "passengers": self.passengers,
            "missing_fields": self.missing_requirements(),
            "is_ready": self.is_fully_ready(),
            "pending_confirmation": self.pending_confirmation
        }

class VoiceSessionState:
    def __init__(self, session_id: str):
        self.session_id = session_id
        self.booking_state = BookingState()
        self.current_step = "GREETING"
        self.last_pnr = None
        self.history: List[Dict[str, str]] = []
        self.user_id = None
        self.user_name = None
        self.user_email = None
        self.user_phone = None

    def reset_booking(self):
        self.booking_state = BookingState()
        self.current_step = "GREETING"

# ---------------------------------------------------------------------------
# Tools Registry
# ---------------------------------------------------------------------------
class AgentToolRegistry:
    @staticmethod
    def search_trains(from_station: str, to_station: str, journey_date: Optional[str] = None) -> List[Dict[str, Any]]:
        """Tool: Searches live trains between stations."""
        return train_service.search_trains(from_station, to_station, journey_date)

    @staticmethod
    def get_best_train(from_station: str, to_station: str, journey_date: Optional[str] = None) -> Optional[Dict[str, Any]]:
        """Tool: Retrieves the best and fastest train on a route."""
        trains = train_service.search_trains(from_station, to_station, journey_date)
        if not trains:
            return None
        # Sort by rating desc, duration asc
        sorted_trains = sorted(trains, key=lambda x: (-x.get("rating", 4.0), x.get("duration", "99h")))
        return sorted_trains[0]

    @staticmethod
    def check_seat_availability(train_number: str, travel_class: str) -> Optional[Dict[str, Any]]:
        """Tool: Checks availability and fare for a specific class on a train."""
        t = train_service.get_train_by_number(train_number)
        if not t:
            return None
        classes = t.get("classes", {})
        cls_data = classes.get(travel_class.upper())
        return cls_data

    @staticmethod
    async def book_ticket(booking_state: BookingState, session: VoiceSessionState) -> Dict[str, Any]:
        """Tool: Finalizes ticket booking in database and generates PNR."""
        train = train_service.get_train_by_number(booking_state.train_number or "")
        cls_name = booking_state.travel_class or "3A"
        cls_data = (train.get("classes", {}).get(cls_name) if train else None) or {"base_fare": 1850}
        base_fare = cls_data.get("base_fare", cls_data.get("fare", 1850))
        total_fare = base_fare * len(booking_state.passengers)
        pnr = train_service.generate_pnr()

        allocated_passengers = []
        for idx, p in enumerate(booking_state.passengers):
            berth_alloc = train_service.allocate_berth(cls_name, idx + 1)
            p_copy = dict(p)
            p_copy.update(berth_alloc)
            allocated_passengers.append(p_copy)

        booking_doc = {
            "pnr": pnr,
            "train_number": booking_state.train_number,
            "train_name": booking_state.train_name,
            "from_station_code": booking_state.from_station,
            "from_station_name": booking_state.from_station_name,
            "to_station_code": booking_state.to_station,
            "to_station_name": booking_state.to_station_name,
            "departure_time": train.get("departure_time", "12:00") if train else "12:00",
            "arrival_time": train.get("arrival_time", "18:00") if train else "18:00",
            "journey_date": booking_state.date,
            "travel_class": cls_name,
            "quota": "GN",
            "passengers": allocated_passengers,
            "total_fare": float(total_fare),
            "base_fare_per_ticket": float(base_fare),
            "status": "CONFIRMED",
            "booked_via": "VOICE_AGENT",
            "contact_phone": session.user_phone or "+91 9876543210",
            "contact_email": session.user_email or "passenger@railvoice.in",
            "user_id": session.user_id,
            "user_email": session.user_email,
            "created_at": datetime.now().isoformat()
        }

        await db_manager.bookings.insert_one(booking_doc)
        session.last_pnr = pnr
        booking_state.pending_confirmation = False
        return booking_doc

# ---------------------------------------------------------------------------
# Intelligent Agent Brain with Tool-Calling & State Machine
# ---------------------------------------------------------------------------
class AgentBrain:
    def __init__(self):
        self.sessions: Dict[str, VoiceSessionState] = {}
        self.tools = AgentToolRegistry

    def get_session(self, session_id: str) -> VoiceSessionState:
        if session_id not in self.sessions:
            self.sessions[session_id] = VoiceSessionState(session_id)
        return self.sessions[session_id]

    def _normalize_station_voice(self, term: str) -> Optional[str]:
        if not term:
            return None
        cleaned = term.lower().strip()
        cleaned = re.sub(r'\b(station|junction|jn|city|central|terminal|cantt|railway)\b', '', cleaned).strip()
        if cleaned in CITY_STATION_ALIASES:
            return CITY_STATION_ALIASES[cleaned]
        return train_service.normalize_station(term)

    def _parse_date(self, text: str) -> str:
        lower = text.lower()
        today = datetime.now()
        if "tomorrow" in lower:
            return (today + timedelta(days=1)).strftime("%Y-%m-%d")
        elif "day after tomorrow" in lower:
            return (today + timedelta(days=2)).strftime("%Y-%m-%d")
        elif "today" in lower or "tonight" in lower:
            return today.strftime("%Y-%m-%d")
        
        match = re.search(r'(\d{4})[-/](\d{1,2})[-/](\d{1,2})', text)
        if match:
            return f"{match.group(1)}-{int(match.group(2)):02d}-{int(match.group(3)):02d}"
        
        match2 = re.search(r'(\d{1,2})[-/](\d{1,2})[-/](\d{4})', text)
        if match2:
            return f"{match2.group(3)}-{int(match2.group(2)):02d}-{int(match2.group(1)):02d}"

        days = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
        for idx, day in enumerate(days):
            if day in lower:
                curr_dow = today.weekday()
                offset = (idx - curr_dow) % 7
                if offset == 0: offset = 7
                return (today + timedelta(days=offset)).strftime("%Y-%m-%d")

        return (today + timedelta(days=1)).strftime("%Y-%m-%d")

    def _extract_stations(self, text: str) -> Tuple[Optional[str], Optional[str]]:
        source = None
        dest = None
        lower = text.lower()

        # Pattern 1: explicit "from X to Y"
        m1 = re.search(r'\bfrom\s+([a-zA-Z\s]+?)\s+(?:to|towards|-)\s+([a-zA-Z\s]+)', text, re.IGNORECASE)
        if m1:
            s_cand = m1.group(1).strip()
            d_cand = m1.group(2).strip()
            d_cand = re.sub(r'\s+(on|tomorrow|today|next|for|at|with|by|train|please|seats?|tickets?).*', '', d_cand, flags=re.IGNORECASE).strip()
            s_norm = self._normalize_station_voice(s_cand)
            d_norm = self._normalize_station_voice(d_cand)
            if s_norm: source = s_norm
            if d_norm: dest = d_norm
            if source and dest: return source, dest

        # Pattern 2: "X to Y"
        m2 = re.search(r'\b([a-zA-Z\s]+?)\s+(?:to|towards)\s+([a-zA-Z\s]+)', text, re.IGNORECASE)
        if m2:
            s_cand = m2.group(1).strip()
            d_cand = m2.group(2).strip()
            s_cand = re.sub(r'^(?:what|which|is|the|best|train|between|show|find|search|book|ticket|tickets|for|from)\s+', '', s_cand, flags=re.IGNORECASE).strip()
            d_cand = re.sub(r'\s+(on|tomorrow|today|next|for|at|with|by|train|please|seats?|tickets?).*', '', d_cand, flags=re.IGNORECASE).strip()
            s_norm = self._normalize_station_voice(s_cand)
            d_norm = self._normalize_station_voice(d_cand)
            if s_norm: source = s_norm
            if d_norm: dest = d_norm
            if source and dest: return source, dest

        # Pattern 3: Position ordered alias matching
        station_positions = []
        for city_name, code in CITY_STATION_ALIASES.items():
            for match in re.finditer(rf'\b{re.escape(city_name)}\b', lower):
                station_positions.append((match.start(), code))

        station_positions.sort(key=lambda x: x[0])
        unique_stations = []
        for _, code in station_positions:
            if code not in unique_stations:
                unique_stations.append(code)

        if len(unique_stations) >= 2:
            source = unique_stations[0]
            dest = unique_stations[1]
        elif len(unique_stations) == 1:
            if "to " in lower or "towards " in lower:
                dest = unique_stations[0]
            else:
                source = unique_stations[0]

        return source, dest

    def _extract_seat_count(self, text: str) -> Optional[int]:
        lower = text.lower()
        m = re.search(r'\b(\d+)\s*(?:seats?|tickets?|people|persons?|passengers?)?\b', lower)
        if m:
            val = int(m.group(1))
            if 1 <= val <= 6:
                return val

        for word, val in NUMBER_WORDS.items():
            if re.search(rf'\b{word}\s*(?:seats?|tickets?|people|persons?|passengers?)?\b', lower):
                return val

        return None

    def _extract_travel_class(self, text: str) -> Optional[str]:
        lower = text.lower()
        for cls in ["1A", "2A", "3A", "CC", "EC", "SL", "2S"]:
            if re.search(rf'\b{cls.lower()}\b', lower) or f"class {cls.lower()}" in lower:
                return cls
        if "first ac" in lower or "first class" in lower: return "1A"
        if "second ac" in lower or "2 tier" in lower or "2nd ac" in lower: return "2A"
        if "third ac" in lower or "3 tier" in lower or "3rd ac" in lower: return "3A"
        if "chair car" in lower: return "CC"
        if "executive" in lower: return "EC"
        if "sleeper" in lower: return "SL"
        return None

    def _extract_passengers(self, text: str) -> List[Dict[str, Any]]:
        passengers = []
        cleaned = re.sub(r'\b(?:in\s+)?(?:class\s+)?(?:1A|2A|3A|CC|EC|SL|2S)\b', '', text, flags=re.IGNORECASE)

        matches = re.findall(r'([A-Za-z\s]+?)(?:age|\bage\b|,|\bis\b|\byears?\b|\bold\b|\baged\b)\s*(\d{1,2})', cleaned, re.IGNORECASE)
        for name_part, age_part in matches:
            name = re.sub(r'\b(first|second|third|fourth|fifth|sixth|passenger|passengers|book|reserve|for|seat|seats|ticket|tickets|and|mr|mrs|ms|the|tier|class|name|is)\b', '', name_part, flags=re.IGNORECASE).strip()
            name = re.sub(r'\s+', ' ', name)
            if name and len(name) > 1 and not name.lower() in ["seat", "class", "train", "ticket", "tickets", "tatkal"]:
                try:
                    age = int(age_part)
                    passengers.append({
                        "name": name.title(),
                        "age": age,
                        "gender": "M",
                        "berth_preference": "Lower Berth" if age >= 60 else "No Preference"
                    })
                except ValueError:
                    pass

        if not passengers:
            name_match = re.search(r'(?:my name is|passenger is|for)\s+([A-Za-z\s]+)', cleaned, re.IGNORECASE)
            if name_match:
                cand_name = name_match.group(1).strip()
                cand_name = re.sub(r'\b(in|class|tatkal|tomorrow|today|tickets|seats|train|me|us|please)\b.*', '', cand_name, flags=re.IGNORECASE).strip()
                if cand_name and len(cand_name) > 2 and not cand_name.lower() in ["me", "us", "tickets", "seats"]:
                    passengers.append({
                        "name": cand_name.title(),
                        "age": 28,
                        "gender": "M",
                        "berth_preference": "No Preference"
                    })

        return passengers

    async def process_user_utterance(self, session_id: str, utterance: str) -> Dict[str, Any]:
        """Main AI pipeline: STT input -> Tool Execution -> State Management -> Spoken Response."""
        session = self.get_session(session_id)
        session.history.append({"speaker": "user", "text": utterance})
        text = utterance.strip()
        lower = text.lower()
        state = session.booking_state

        # ----------------- 1. Session Reset -----------------
        if lower in ["cancel call", "stop", "never mind", "reset", "start over"]:
            session.reset_booking()
            return {
                "text": "Sure, I have reset your booking session. Where would you like to travel to?",
                "action_badge": "🔄 Session Reset",
                "tool_called": "reset_booking",
                "booking_state": state.to_dict(),
                "session": {"step": "GREETING"}
            }

        # ----------------- 2. PNR Status Check Tool -----------------
        if ("pnr" in lower and not any(w in lower for w in ["book", "seat", "train"])) or "status of my ticket" in lower:
            pnr_match = re.search(r'\b\d{10}\b', text)
            pnr = pnr_match.group(0) if pnr_match else session.last_pnr
            if pnr:
                booking = await db_manager.bookings.find_one({"pnr": pnr})
                if booking:
                    spoken = (
                        f"PNR {pnr} status is {booking.get('status')}. Train {booking.get('train_number')} {booking.get('train_name')} "
                        f"from {booking.get('from_station_name')} to {booking.get('to_station_name')} on {booking.get('journey_date')} in {booking.get('travel_class')}."
                    )
                    badge = f"📋 PNR Status: {booking.get('status')}"
                else:
                    spoken = f"I could not find any active booking for PNR {pnr}."
                    badge = "❌ PNR Not Found"
                return {
                    "text": spoken,
                    "action_badge": badge,
                    "tool_called": f"check_pnr_status({pnr})",
                    "booking_state": state.to_dict(),
                    "session": {"step": session.current_step}
                }

        # ----------------- 3. Cancel Ticket Tool -----------------
        if "cancel" in lower and any(w in lower for w in ["ticket", "booking", "pnr", "reservation"]):
            pnr_match = re.search(r'\b\d{10}\b', text)
            pnr_to_cancel = pnr_match.group(0) if pnr_match else session.last_pnr
            if pnr_to_cancel:
                booking = await db_manager.bookings.find_one({"pnr": pnr_to_cancel})
                if booking:
                    if booking.get("status") == "CANCELLED":
                        spoken = f"PNR {pnr_to_cancel} is already cancelled."
                        badge = f"ℹ️ PNR {pnr_to_cancel} Cancelled"
                    else:
                        refund_info = RailwayPolicyEngine.calculate_cancellation_refund(
                            travel_class=booking.get("travel_class", "3A"),
                            journey_date=booking.get("journey_date", "2026-09-05"),
                            departure_time=booking.get("departure_time", "16:55"),
                            total_fare=booking.get("total_fare", 2150.0),
                            num_passengers=len(booking.get("passengers", [1])),
                            quota=booking.get("quota", "GN")
                        )
                        await db_manager.bookings.update_one(
                            {"pnr": pnr_to_cancel},
                            {"$set": {
                                "status": "CANCELLED",
                                "cancelled_at": datetime.now().isoformat(),
                                "refund_amount": refund_info["refund_amount"],
                                "cancellation_charge": refund_info["cancellation_charge"],
                                "refund_status": "PROCESSED_TO_SOURCE"
                            }}
                        )
                        spoken = (
                            f"Ticket PNR {pnr_to_cancel} has been cancelled. Cancellation fee is ₹{refund_info['cancellation_charge']}, "
                            f"and refund of ₹{refund_info['refund_amount']} will be credited to your account."
                        )
                        badge = f"❌ PNR {pnr_to_cancel} Cancelled"
                else:
                    spoken = f"I could not find any active booking for PNR {pnr_to_cancel}."
                    badge = "❌ PNR Not Found"
            else:
                spoken = "Please provide your 10-digit PNR number to cancel."
                badge = "🔍 Awaiting PNR"
            return {
                "text": spoken,
                "action_badge": badge,
                "tool_called": "cancel_ticket",
                "booking_state": state.to_dict(),
                "session": {"step": session.current_step}
            }

        # ----------------- 4. Final Confirmation Check -----------------
        if state.pending_confirmation:
            if any(w in lower for w in ["yes", "confirm", "proceed", "go ahead", "book", "sure", "ok", "okay", "yup", "book it"]):
                # Call Book Ticket Tool!
                booked_doc = await self.tools.book_ticket(state, session)
                p_summary = ", ".join([f"{p['name']} ({p.get('berth_number')})" for p in booked_doc["passengers"]])
                spoken = (
                    f"Congratulations! Your ticket is confirmed. Your PNR is {booked_doc['pnr']}. "
                    f"Train {booked_doc['train_number']} {booked_doc['train_name']} departing from {booked_doc['from_station_name']} "
                    f"at {booked_doc['departure_time']} on {booked_doc['journey_date']}. Allocated: {p_summary} in {booked_doc['travel_class']}. "
                    f"Total fare is ₹{booked_doc['total_fare']}. Your ticket is saved in My Bookings. Have a safe journey!"
                )
                session.reset_booking()
                return {
                    "text": spoken,
                    "action_badge": f"✅ Confirmed PNR: {booked_doc['pnr']}",
                    "tool_called": f"book_ticket(pnr={booked_doc['pnr']})",
                    "tool_data": booked_doc,
                    "booking_state": state.to_dict(),
                    "session": {"pnr": booked_doc["pnr"], "status": "CONFIRMED", "step": "BOOKED"}
                }
            elif any(w in lower for w in ["no", "change", "cancel", "don't", "dont", "modify"]):
                state.pending_confirmation = False
                return {
                    "text": "No problem! What would you like to change? You can update the train, class, seats, or passenger names.",
                    "action_badge": "✏️ Modifying Booking State",
                    "tool_called": "modify_booking_state",
                    "booking_state": state.to_dict(),
                    "session": {"step": "MODIFY"}
                }

        # ----------------- 5. Extract & Update State -----------------
        # Tool: update_booking_state with all recognized entities
        s_cand, d_cand = self._extract_stations(text)
        if s_cand:
            state.from_station = s_cand
            state.from_station_name = STATION_MAP.get(s_cand, s_cand)
        if d_cand:
            state.to_station = d_cand
            state.to_station_name = STATION_MAP.get(d_cand, d_cand)

        if any(w in lower for w in ["tomorrow", "today", "day after", "september", "october", "next", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]):
            state.date = self._parse_date(text)
        elif not state.date:
            state.date = (datetime.now() + timedelta(days=1)).strftime("%Y-%m-%d")

        # Class
        extracted_cls = self._extract_travel_class(text)
        if extracted_cls:
            state.travel_class = extracted_cls

        # Seats
        extracted_seats = self._extract_seat_count(text)
        if extracted_seats:
            state.seat_count = extracted_seats

        # Passengers
        extracted_passengers = self._extract_passengers(text)
        if extracted_passengers:
            # Merge without duplicates
            existing_names = [p["name"].lower() for p in state.passengers]
            for p in extracted_passengers:
                if p["name"].lower() not in existing_names:
                    state.passengers.append(p)
            if not state.seat_count:
                state.seat_count = len(state.passengers)

        # ----------------- 6. Evaluate State & Tool Execution -----------------
        missing = state.missing_requirements()

        # CASE A: Route missing
        if "ROUTE" in missing:
            spoken = "Which stations would you like to travel between? For example, from New Delhi to Mumbai or Varanasi."
            return {
                "text": spoken,
                "action_badge": "📍 Awaiting Route (From / To)",
                "tool_called": "awaiting_route",
                "booking_state": state.to_dict(),
                "session": {"step": "COLLECT_ROUTE"}
            }

        # Route is available! Query live trains via tool
        is_best_train_query = any(w in lower for w in ["best train", "fastest train", "recommend", "which train", "top train", "which is best"])
        
        # If user specifies train number or name in utterance
        matching_train = None
        available_trains = self.tools.search_trains(state.from_station, state.to_station, state.date)
        for t in available_trains:
            if t["train_number"] in text or t["train_name"].lower() in lower or t.get("train_type", "").lower() in lower:
                matching_train = t
                break

        if matching_train:
            state.train_number = matching_train["train_number"]
            state.train_name = matching_train["train_name"]

        # CASE B: Train missing or user specifically asks for "best train"
        if "TRAIN" in missing or is_best_train_query:
            top_train = self.tools.get_best_train(state.from_station, state.to_station, state.date)
            if not top_train:
                spoken = f"I could not find direct trains from {state.from_station_name} to {state.to_station_name} on {state.date}. Would you like to check another date or station?"
                return {
                    "text": spoken,
                    "action_badge": "⚠️ No Direct Trains Found",
                    "tool_called": f"search_trains({state.from_station} ➔ {state.to_station})",
                    "booking_state": state.to_dict(),
                    "session": {"step": "NO_TRAINS"}
                }

            # Set top train as selected
            state.train_number = top_train["train_number"]
            state.train_name = top_train["train_name"]

            cls_avail = []
            for c_name, c_info in top_train.get("classes", {}).items():
                cls_avail.append(f"{c_name} (₹{c_info.get('base_fare', c_info.get('fare'))})")
            classes_str = ", ".join(cls_avail)

            spoken = (
                f"The best and fastest train from {state.from_station_name} to {state.to_station_name} is the "
                f"{top_train['train_number']} {top_train['train_name']} (rated {top_train.get('rating', '4.8')} stars), departing at {top_train['departure_time']} "
                f"and arriving at {top_train['arrival_time']} (duration {top_train['duration']}). "
                f"Available classes: {classes_str}. Which travel class would you like, and how many seats do you need?"
            )
            return {
                "text": spoken,
                "action_badge": f"⭐ Best Train Tool: {top_train['train_name']}",
                "tool_called": f"get_best_train({state.from_station} ➔ {state.to_station})",
                "tool_data": top_train,
                "booking_state": state.to_dict(),
                "session": {"step": "COLLECT_CLASS_SEATS"}
            }

        # CASE C: Travel Class missing
        if "CLASS" in missing:
            train = train_service.get_train_by_number(state.train_number or "")
            available_classes = list(train.get("classes", {}).keys()) if train else ["3A", "2A", "1A", "SL"]
            classes_formatted = ", ".join(available_classes)
            spoken = f"For {state.train_name} ({state.train_number}), which travel class would you prefer? Available options are: {classes_formatted}."
            return {
                "text": spoken,
                "action_badge": f"🎫 Select Class ({classes_formatted})",
                "tool_called": "check_seat_availability",
                "booking_state": state.to_dict(),
                "session": {"step": "COLLECT_CLASS"}
            }

        # CASE D: Seat count missing
        if "SEATS" in missing:
            spoken = f"How many seats would you like to book in {state.travel_class} for {state.train_name}?"
            return {
                "text": spoken,
                "action_badge": f"🎟️ Awaiting Seat Count • {state.travel_class}",
                "tool_called": "awaiting_seat_count",
                "booking_state": state.to_dict(),
                "session": {"step": "COLLECT_SEATS"}
            }

        # CASE E: Passenger Details missing
        needed = state.seat_count or 1
        current = len(state.passengers)
        if "PASSENGERS" in missing:
            if current == 0:
                if needed == 1:
                    spoken = f"Got it, booking 1 seat. Please provide the passenger's full name and age."
                else:
                    spoken = f"Got it, booking {needed} seats. Please tell me the full name and age for each passenger."
            else:
                rem = needed - current
                recorded = ", ".join([f"{p['name']} ({p['age']})" for p in state.passengers])
                spoken = f"Recorded {recorded}. I still need details for {rem} more passenger. What is their full name and age?"

            return {
                "text": spoken,
                "action_badge": f"👤 Awaiting Passenger Details ({current}/{needed})",
                "tool_called": "awaiting_passengers",
                "booking_state": state.to_dict(),
                "session": {"step": "COLLECT_PASSENGERS"}
            }

        # ----------------- 7. ALL FULFILLED! Ready for Confirmation -----------------
        # Trim passengers to exactly seat_count
        confirmed_passengers = state.passengers[:needed]
        state.passengers = confirmed_passengers

        train = train_service.get_train_by_number(state.train_number or "")
        cls_name = state.travel_class
        cls_data = (train.get("classes", {}).get(cls_name) if train else None) or {"base_fare": 1850}
        base_fare = cls_data.get("base_fare", cls_data.get("fare", 1850))
        total_fare = base_fare * len(confirmed_passengers)

        p_summary = ", ".join([f"{p['name']} (Age {p['age']})" for p in confirmed_passengers])
        state.pending_confirmation = True

        spoken = (
            f"Here is your booking summary: {len(confirmed_passengers)} passenger{'s' if len(confirmed_passengers) > 1 else ''}—{p_summary}—"
            f"on Train {state.train_number} {state.train_name} from {state.from_station_name} to {state.to_station_name} "
            f"on {state.date} in {cls_name} class. Total fare is ₹{total_fare}. Shall I confirm and book your ticket now?"
        )

        return {
            "text": spoken,
            "action_badge": f"📋 Review & Confirm • Total ₹{total_fare}",
            "tool_called": "prepare_booking_confirmation",
            "booking_state": state.to_dict(),
            "tool_data": {
                "train_number": state.train_number,
                "train_name": state.train_name,
                "travel_class": state.travel_class,
                "passengers": confirmed_passengers,
                "total_fare": total_fare
            },
            "session": {
                "train": state.train_number,
                "class": state.travel_class,
                "seats": len(confirmed_passengers),
                "step": "CONFIRM_RESERVATION"
            }
        }

agent_brain = AgentBrain()
