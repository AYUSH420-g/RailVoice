import json
import os
from datetime import datetime, timedelta
from typing import Dict, Any, List, Tuple

POLICIES_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "policies.json")

def load_policies() -> Dict[str, Any]:
    try:
        with open(POLICIES_PATH, "r") as f:
            return json.load(f)
    except Exception:
        return {}

POLICIES = load_policies()

class PolicyViolationError(Exception):
    def __init__(self, message: str, rule: str):
        super().__init__(message)
        self.message = message
        self.rule = rule

class RailwayPolicyEngine:
    @staticmethod
    def get_all_policies() -> Dict[str, Any]:
        return POLICIES

    @staticmethod
    def validate_booking(passengers: List[Dict[str, Any]], quota: str = "GN", travel_class: str = "3A") -> Tuple[bool, str]:
        """
        Enforces dummy railway policy that the voice agent or customer CANNOT break:
        1. Max 6 passengers per PNR (or 4 for Tatkal).
        2. Minimum 1 passenger required.
        3. All passengers must have a non-empty name and age > 0.
        4. Senior citizen concession / lower berth quota requires eligible age.
        """
        num_p = len(passengers)
        if num_p == 0:
            return False, "Booking must contain at least 1 passenger."

        if quota.upper() == "TQ" and num_p > 4:
            return False, f"Policy Violation: Tatkal quota allows a maximum of 4 passengers per booking. You requested {num_p} passengers."

        if num_p > 6:
            return False, f"Policy Violation: Railway regulations strictly restrict bookings to a maximum of 6 passengers per ticket/PNR. For {num_p} passengers, please split into two separate bookings."

        for idx, p in enumerate(passengers, 1):
            name = p.get("name", "").strip()
            age = int(p.get("age", 0))
            if not name:
                return False, f"Passenger #{idx} must have a valid full name."
            if age <= 0 or age > 120:
                return False, f"Passenger #{idx} ({name}) has an invalid age: {age}."

        if quota.upper() == "SS":  # Senior Citizen quota
            has_senior = False
            for p in passengers:
                age = int(p.get("age", 0))
                gender = p.get("gender", "M").upper()
                if (gender == "M" and age >= 60) or (gender == "F" and age >= 45):
                    has_senior = True
                    break
            if not has_senior:
                return False, "Policy Violation: Senior Citizen Quota (SS) requires at least one passenger to be male 60+ or female 45+."

        return True, "Validation successful. Compliant with all Railway booking policies."

    @staticmethod
    def calculate_cancellation_refund(
        travel_class: str,
        journey_date: str,
        departure_time: str,
        total_fare: float,
        num_passengers: int,
        quota: str = "GN"
    ) -> Dict[str, Any]:
        """
        Calculates refund based on the strict Railway cancellation policy time brackets.
        """
        if quota.upper() == "TQ":
            return {
                "refundable": False,
                "refund_amount": 0.0,
                "cancellation_charge": total_fare,
                "reason": "Tatkal Policy: Confirmed Tatkal tickets are non-refundable according to Indian Railways policy.",
                "policy_bracket": "TATKAL_NON_REFUNDABLE"
            }

        # Calculate time delta between now and departure
        try:
            dep_dt = datetime.strptime(f"{journey_date} {departure_time}", "%Y-%m-%d %H:%M")
        except Exception:
            dep_dt = datetime.now() + timedelta(hours=36)  # Default fallback

        now = datetime.now()
        hours_to_departure = (dep_dt - now).total_seconds() / 3600.0

        rules = POLICIES.get("cancellation_refund_rules", {})

        # Flat clerkage deductions per ticket
        flat_deductions = {
            "1A": 240, "EC": 240,
            "2A": 200,
            "3A": 180, "CC": 180,
            "SL": 120, "2S": 60
        }
        flat_charge_per_p = flat_deductions.get(travel_class.upper(), 180)
        total_flat_charge = flat_charge_per_p * max(1, num_passengers)

        if hours_to_departure > 48:
            deduction = min(total_flat_charge, total_fare)
            refund = max(0.0, total_fare - deduction)
            return {
                "refundable": True,
                "refund_amount": round(refund, 2),
                "cancellation_charge": round(deduction, 2),
                "reason": f"Cancelled more than 48 hours before departure. Flat clerkage fee of ₹{flat_charge_per_p} per passenger applied.",
                "policy_bracket": "> 48 Hours"
            }
        elif 12 <= hours_to_departure <= 48:
            pct_deduction = total_fare * 0.25
            deduction = max(total_flat_charge, pct_deduction)
            deduction = min(deduction, total_fare)
            refund = max(0.0, total_fare - deduction)
            return {
                "refundable": True,
                "refund_amount": round(refund, 2),
                "cancellation_charge": round(deduction, 2),
                "reason": "Cancelled between 48 and 12 hours before departure. 25% cancellation charge applied.",
                "policy_bracket": "12 to 48 Hours"
            }
        elif 4 <= hours_to_departure < 12:
            pct_deduction = total_fare * 0.50
            deduction = max(total_flat_charge, pct_deduction)
            deduction = min(deduction, total_fare)
            refund = max(0.0, total_fare - deduction)
            return {
                "refundable": True,
                "refund_amount": round(refund, 2),
                "cancellation_charge": round(deduction, 2),
                "reason": "Cancelled between 12 and 4 hours before departure. 50% cancellation charge applied.",
                "policy_bracket": "4 to 12 Hours"
            }
        else:
            return {
                "refundable": False,
                "refund_amount": 0.0,
                "cancellation_charge": total_fare,
                "reason": "Policy Violation / Non-refundable: Less than 4 hours remaining before departure or chart has been prepared.",
                "policy_bracket": "< 4 Hours / Chart Prepared"
            }

    @staticmethod
    def answer_policy_query(topic: str) -> str:
        """Provides direct, authoritative answers to user queries regarding policies."""
        topic_lower = topic.lower()
        if any(k in topic_lower for k in ["cancel", "refund", "return"]):
            return (
                "Our cancellation and refund policy is tiered: "
                "1. More than 48 hours before departure: Only flat clerkage is deducted (₹240 for 1A/EC, ₹200 for 2A, ₹180 for 3A/CC, ₹120 for Sleeper). "
                "2. Between 48 and 12 hours: 25% of fare is deducted. "
                "3. Between 12 and 4 hours: 50% of fare is deducted. "
                "4. Less than 4 hours or after chart preparation: No refund is allowed. "
                "Confirmed Tatkal tickets are completely non-refundable."
            )
        elif any(k in topic_lower for k in ["tatkal", "tq"]):
            return (
                "Tatkal Quota Policy: Opens at 10:00 AM for AC classes (1A, 2A, 3A, CC, EC) and 11:00 AM for Non-AC classes (Sleeper) on the day prior to journey. "
                "Maximum 4 passengers per booking. Confirmed Tatkal tickets are strictly non-refundable."
            )
        elif any(k in topic_lower for k in ["passenger", "max", "limit", "how many"]):
            return (
                "Passenger Limit Policy: A maximum of 6 passengers can be booked on a single standard ticket/PNR, and a maximum of 4 passengers under Tatkal quota. "
                "Children under 5 years travel free without a berth. Any booking above 6 passengers must be split across multiple PNRs."
            )
        elif any(k in topic_lower for k in ["id", "identity", "proof"]):
            return (
                "ID Policy: At least one passenger must carry a valid original Government photo ID (Aadhaar, Voter ID, Driving License, Passport, or PAN card) during the journey."
            )
        else:
            return (
                "Railway Booking Policies: Maximum 6 passengers per ticket (4 for Tatkal). Original ID proof mandatory. "
                "Cancellations >48 hours carry flat clerkage, 25% deduction between 48-12 hours, 50% between 12-4 hours, and 0% refund under 4 hours."
            )
