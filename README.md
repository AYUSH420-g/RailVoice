# 🚄 RailVoice AI: Autonomous Voice Train Reservation Platform

An enterprise-grade Train Reservation System powered by a **Python (FastAPI) Backend**, a **React (Vite + Tailwind CSS) Frontend**, and a **Continuous AI Voice Agent** with real-time audio streaming, authentic phone call simulation, real railway schedules, MongoDB storage, and strict policy guardrails.

---

## 🌟 Key Features

### 1. 🤖 Continuous AI Voice Agent (Full Duplex Call Experience)
- **Realistic Phone Call Simulation**: Ringing sound synthesis, call connected chime, active call timer, animated audio visualizer waveform, and call hangup tones.
- **Continuous Speech-to-Text & Speech Synthesis**:
  - Live bi-directional WebSocket streaming (`/ws/voice-agent`).
  - Edge-TTS Indian English neural voice generation + browser voice fallback.
  - Barge-in & interruption handling (agent yields immediately when the customer speaks).
- **Proactive Conversational Dialogue**:
  - Greets the passenger like an Indian Railways reservation officer.
  - Inquires about origin station, destination station, journey date, and preferred class.
  - Evaluates seat availability and suggests top trains (Vande Bharat, Rajdhani, Shatabdi).
  - Collects passenger names and ages, verifies against railway regulations, and confirms booking.
  - Issues a confirmed 10-digit Indian Railways PNR number and records it in the database.

### 2. 🛡️ Strict Railway Policy Guardrails (Enforced & Immutable)
The AI agent is bounded by real railway rules that neither the user nor the agent can violate:
- **Maximum 6 Passengers**: Strictly caps standard bookings at 6 passengers per ticket/PNR (and 4 under Tatkal quota). Refuses larger group bookings with an explanation to split tickets.
- **Mandatory Government ID**: Requires valid photo ID for adult passengers (Aadhaar, Voter ID, Passport, PAN).
- **Tiered Cancellation & Refund Policy**:
  - `> 48 Hours before departure`: Flat clerkage fee deducted (₹120 - ₹240 based on class).
  - `48 to 12 Hours`: 25% cancellation deduction.
  - `12 to 4 Hours`: 50% cancellation deduction.
  - `< 4 Hours / After Chart Preparation`: Strictly 0% refund.
  - `Tatkal Tickets`: Confirmed Tatkal tickets are non-refundable.
- **Interactive Policy Q&A**: Customers can inquire about any policy ("What is the refund policy?", "Tatkal booking timings", etc.), and the agent explains accurately.

### 3. 🚆 Real Train Schedules & Dynamic Seat Inventory
- Comprehensive database of premier Indian Railways trains:
  - **22436 / 22435 Vande Bharat Express** (New Delhi ⇄ Varanasi)
  - **12952 / 12951 Mumbai Rajdhani Express** (New Delhi ⇄ Mumbai Central)
  - **12954 / 12953 August Kranti Rajdhani** (New Delhi ⇄ Mumbai Central)
  - **12004 Lucknow Swarna Shatabdi** (New Delhi ⇄ Lucknow)
  - **12002 Bhopal Shatabdi Express** (New Delhi ⇄ Rani Kamlapati)
  - **12302 / 12301 Howrah Rajdhani Express** (New Delhi ⇄ Kolkata)
  - **12622 Tamil Nadu Express** (New Delhi ⇄ Chennai Central)
  - **22692 Bengaluru Rajdhani Express** (New Delhi ⇄ KSR Bengaluru)
  - **20608 Vande Bharat Express** (Chennai Central ⇄ Mysuru)
  - **12009 Mumbai Ahmedabad Shatabdi** (Mumbai Central ⇄ Ahmedabad)
  - **12124 Deccan Queen Express** (Pune ⇄ Mumbai CSMT)
  - **12015 Ajmer Shatabdi Express** (New Delhi ⇄ Jaipur)
- Class options: `1A` (First AC), `2A` (2-Tier AC), `3A` (3-Tier AC), `CC` (AC Chair Car), `EC` (Executive Chair Car), `SL` (Sleeper), `2S` (Second Sitting).
- Dynamic seat status: Available (AVL), Reservation Against Cancellation (RAC), and Waiting List (WL).

### 4. 💾 MongoDB Storage Layer
- Async MongoDB driver (`motor`) with configurable `MONGO_URI`.
- Built-in resilient zero-friction fallback: If MongoDB is not running locally, seamlessly uses an async JSON document database (`backend/data/railvoice_db.json`), ensuring 100% out-of-the-box functionality with zero setup.
- Persists confirmed reservations, passenger details, coach & berth allocations, booking channels (`VOICE_AGENT` vs `WEB_MANUAL`), cancellation timestamps, and calculated refund amounts.

### 5. 💻 Customer Portal & Digital Boarding Pass
- Train search with station autocomplete, date shortcuts (Today, Tomorrow, Day After), and class filters.
- Manual booking checkout with passenger details input and policy compliance checks.
- "My Bookings" dashboard: Track PNR status, view allocated coach and berth (e.g. `B1-14 Lower Berth`), and cancel tickets with real-time refund calculation.
- "Railway Policies" drawer highlighting all guardrails with instant voice test buttons.

---

## 🚀 Getting Started

### Prerequisites
- Python 3.10+
- Node.js 18+ and npm

### One-Click Launch
Run the automated launcher script from the project root:
```bash
./run.sh
```
This will start:
- **FastAPI Backend** on `http://localhost:8000` (Docs at `http://localhost:8000/docs`)
- **React Frontend** on `http://localhost:5173`

---

## 🎙️ Testing the Voice Agent

1. Open `http://localhost:5173` in your browser.
2. Click **"Book with Voice Agent"** (in the top navigation or the floating button at bottom right).
3. Allow microphone permission when prompted.
4. Speak naturally as if talking to a railway reservation desk officer:
   - *"Hello!"*
   - *"I want to travel from Delhi to Mumbai tomorrow."*
   - *"Book 3A for Ayush age 26."*
   - *"What is your cancellation refund policy?"*
   - *"Can I book for 10 passengers?"* (Observe the agent strictly refuse and cite the policy limit of 6).
   - *"Cancel ticket with PNR [your-pnr-number]"*
5. Check the **"My Bookings"** tab to see your confirmed e-ticket with allocated coach, berth, and PNR!
