import React, { useState, useEffect } from 'react';
import Navbar from './components/Navbar';
import TrainSearch from './components/TrainSearch';
import TrainCard from './components/TrainCard';
import BookingModal from './components/BookingModal';
import MyBookings from './components/MyBookings';
import PolicyModal from './components/PolicyModal';
import VoiceAgentCallModal from './components/VoiceAgentCallModal';
import AuthModal from './components/AuthModal';
import { getHealth, getStations, searchTrains, getAllBookings, getCurrentUser } from './services/api';
import { Train, AlertCircle, CheckCircle } from 'lucide-react';

export default function App() {
  const [activeTab, setActiveTab] = useState('search');
  const [stations, setStations] = useState([
    { code: 'NDLS', name: 'New Delhi' },
    { code: 'MMCT', name: 'Mumbai Central' },
    { code: 'BSB', name: 'Varanasi Jn' },
    { code: 'HWH', name: 'Howrah Jn (Kolkata)' },
    { code: 'MAS', name: 'Chennai Central' },
    { code: 'SBC', name: 'KSR Bengaluru' },
    { code: 'ADI', name: 'Ahmedabad Jn' },
    { code: 'PUNE', name: 'Pune Jn' },
    { code: 'JP', name: 'Jaipur Jn' }
  ]);

  // Authentication State
  const [user, setUser] = useState(null);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);

  // Search Query State
  const [fromStation, setFromStation] = useState('NDLS');
  const [toStation, setToStation] = useState('MMCT');
  const [journeyDate, setJourneyDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().split('T')[0];
  });
  const [travelClass, setTravelClass] = useState('');
  const [trains, setTrains] = useState([]);
  const [isSearching, setIsSearching] = useState(false);

  // Bookings State
  const [bookings, setBookings] = useState([]);

  // Modals
  const [selectedTrainForBooking, setSelectedTrainForBooking] = useState(null);
  const [bookingClass, setBookingClass] = useState('3A');
  const [isVoiceCallOpen, setIsVoiceCallOpen] = useState(false);
  const [voiceTestPrompt, setVoiceTestPrompt] = useState(null);

  // Toast
  const [toastMessage, setToastMessage] = useState(null);

  const showToast = (msg, type = 'success') => {
    setToastMessage({ msg, type });
    setTimeout(() => setToastMessage(null), 4000);
  };

  useEffect(() => {
    fetchInitialData();
    checkAuthStatus();
  }, []);

  const checkAuthStatus = async () => {
    const token = localStorage.getItem('railvoice_token');
    if (!token) return;
    try {
      const userData = await getCurrentUser();
      setUser(userData);
      // Fetch user's individual bookings
      const bList = await getAllBookings();
      setBookings(bList || []);
    } catch (err) {
      console.warn("Session expired or invalid token:", err);
      localStorage.removeItem('railvoice_token');
      setUser(null);
    }
  };

  const fetchInitialData = async () => {
    try {
      const [sData, bData] = await Promise.allSettled([
        getStations(),
        getAllBookings()
      ]);

      if (sData.status === 'fulfilled' && sData.value.length > 0) setStations(sData.value);
      if (bData.status === 'fulfilled') setBookings(bData.value || []);
      
      handleSearchTrains();
    } catch (e) {
      console.warn("Initial data load partial failure:", e);
    }
  };

  const handleSearchTrains = async () => {
    try {
      setIsSearching(true);
      const res = await searchTrains(fromStation, toStation, journeyDate, travelClass);
      setTrains(res.trains || []);
    } catch (err) {
      console.error("Search trains error:", err);
      showToast("Unable to fetch live trains. Using schedule database.", "error");
    } finally {
      setIsSearching(false);
    }
  };

  const refreshBookings = async () => {
    try {
      const bList = await getAllBookings();
      setBookings(bList || []);
    } catch (e) {
      console.error("Failed to refresh bookings:", e);
    }
  };

  const handleAuthSuccess = async (authUser) => {
    setUser(authUser);
    showToast(`Welcome, ${authUser.name}!`);
    await refreshBookings();
  };

  const handleLogout = () => {
    localStorage.removeItem('railvoice_token');
    setUser(null);
    setBookings([]);
    showToast("Signed out successfully");
  };

  const handleOpenManualBooking = (train, clsKey) => {
    if (!user) {
      setIsAuthModalOpen(true);
      showToast("Please sign in or register to complete your reservation", "error");
      return;
    }
    setSelectedTrainForBooking(train);
    setBookingClass(clsKey || '3A');
  };

  const handleTestPolicyWithVoice = (prompt) => {
    setVoiceTestPrompt(prompt);
    setIsVoiceCallOpen(true);
  };

  const handleBookingCompleted = (booking) => {
    refreshBookings();
    showToast(`Ticket Confirmed! PNR: ${booking.pnr}`);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col selection:bg-orange-500 selection:text-white">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-24 right-6 z-50 animate-bounce">
          <div className={`px-4 py-2.5 rounded-xl shadow-lg flex items-center gap-2.5 border text-xs font-bold ${
            toastMessage.type === 'error'
              ? 'bg-rose-50 text-rose-700 border-rose-200'
              : 'bg-emerald-50 text-emerald-700 border-emerald-200'
          }`}>
            {toastMessage.type === 'error' ? <AlertCircle className="w-4 h-4 text-rose-600" /> : <CheckCircle className="w-4 h-4 text-emerald-600" />}
            <span>{toastMessage.msg}</span>
          </div>
        </div>
      )}

      {/* Navbar Header with single Voice Agent button and User controls */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onOpenVoiceCall={() => {
          setVoiceTestPrompt(null);
          setIsVoiceCallOpen(true);
        }}
        user={user}
        onOpenAuthModal={() => setIsAuthModalOpen(true)}
        onLogout={handleLogout}
      />

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Tab 1: Search & Trains */}
        {activeTab === 'search' && (
          <div className="space-y-6">
            <TrainSearch
              stations={stations}
              fromStation={fromStation}
              setFromStation={setFromStation}
              toStation={toStation}
              setToStation={setToStation}
              journeyDate={journeyDate}
              setJourneyDate={setJourneyDate}
              travelClass={travelClass}
              setTravelClass={setTravelClass}
              onSearch={handleSearchTrains}
              isSearching={isSearching}
            />

            {/* Results Section */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Train className="w-4 h-4 text-orange-600" />
                  <h2 className="text-lg font-black text-slate-900">
                    Available Trains ({trains.length})
                  </h2>
                </div>
                <span className="text-xs text-slate-600 font-bold bg-white px-2.5 py-1 rounded-full border border-slate-200 shadow-2xs">
                  {fromStation} → {toStation} • {journeyDate}
                </span>
              </div>

              {isSearching ? (
                <div className="bg-white rounded-2xl p-10 text-center border border-slate-200 shadow-xs">
                  <div className="inline-block animate-spin rounded-full h-7 w-7 border-3 border-orange-500 border-t-transparent mb-2"></div>
                  <p className="text-xs text-slate-500 font-medium">Checking live seat availability and fares...</p>
                </div>
              ) : trains.length === 0 ? (
                <div className="bg-white rounded-2xl p-10 text-center border border-slate-200 shadow-xs">
                  <p className="text-sm font-bold text-slate-800">No direct trains found for this route</p>
                  <p className="text-xs text-slate-500 mt-1">Try routes like New Delhi (NDLS) to Mumbai Central (MMCT) or Varanasi (BSB).</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3.5">
                  {trains.map((train) => (
                    <TrainCard
                      key={train.train_number}
                      train={train}
                      onSelectBooking={handleOpenManualBooking}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab 2: My Bookings & PNR Tracker */}
        {activeTab === 'bookings' && (
          <MyBookings
            bookings={bookings}
            onRefresh={refreshBookings}
            onOpenVoiceAgent={() => {
              setVoiceTestPrompt(null);
              setIsVoiceCallOpen(true);
            }}
            user={user}
            onOpenAuthModal={() => setIsAuthModalOpen(true)}
          />
        )}

        {/* Tab 3: Railway Policies & Guardrails */}
        {activeTab === 'policies' && (
          <PolicyModal onTestPromptWithVoice={handleTestPolicyWithVoice} />
        )}
      </main>

      {/* Manual Booking Modal */}
      {selectedTrainForBooking && (
        <BookingModal
          train={selectedTrainForBooking}
          selectedClass={bookingClass}
          journeyDate={journeyDate}
          user={user}
          onClose={() => setSelectedTrainForBooking(null)}
          onBookingSuccess={(booking) => {
            setSelectedTrainForBooking(null);
            handleBookingCompleted(booking);
            setActiveTab('bookings');
          }}
        />
      )}

      {/* Voice Agent Calling Screen */}
      <VoiceAgentCallModal
        isOpen={isVoiceCallOpen}
        onClose={() => setIsVoiceCallOpen(false)}
        onBookingCompleted={(booking) => {
          handleBookingCompleted(booking);
          refreshBookings();
        }}
        initialPrompt={voiceTestPrompt}
      />

      {/* User Login / Sign Up Modal */}
      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        onAuthSuccess={handleAuthSuccess}
      />

      {/* Footer */}
      <footer className="w-full bg-white border-t border-slate-200 py-5 mt-10 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <p>© 2026 RailVoice AI • Indian Railways Automated Reservation Portal</p>
          <div className="flex items-center gap-3 text-slate-500 font-medium text-[11px]">
            <span>FastAPI Python</span>
            <span>•</span>
            <span>React UI</span>
            <span>•</span>
            <span>Continuous Voice AI</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
