import React, { useState } from 'react';
import { X, Plus, Trash2, ShieldCheck, Ticket, User, AlertCircle } from 'lucide-react';
import confetti from 'canvas-confetti';
import { createBooking } from '../services/api';

export default function BookingModal({ train, selectedClass, journeyDate, onClose, onBookingSuccess, user }) {
  const [quota, setQuota] = useState('GN');
  const [passengers, setPassengers] = useState([
    { name: user?.name || '', age: '', gender: 'M', berth_preference: 'Lower', id_type: 'Aadhaar Card', id_number: '' }
  ]);
  const [contactPhone, setContactPhone] = useState(user?.phone || '+91 9876543210');
  const [contactEmail, setContactEmail] = useState(user?.email || 'passenger@railvoice.in');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const clsData = train.classes?.[selectedClass] || { fare: 1500 };
  const baseFare = clsData.fare || 1500;
  const totalFare = baseFare * passengers.length;

  const addPassenger = () => {
    const maxAllowed = quota === 'TQ' ? 4 : 6;
    if (passengers.length >= maxAllowed) {
      setErrorMessage(`Railway Policy Restriction: Maximum ${maxAllowed} passengers allowed per booking under ${quota} quota.`);
      return;
    }
    setErrorMessage('');
    setPassengers([
      ...passengers,
      { name: '', age: '', gender: 'M', berth_preference: 'No Preference', id_type: 'Aadhaar Card', id_number: '' }
    ]);
  };

  const removePassenger = (index) => {
    if (passengers.length === 1) return;
    setPassengers(passengers.filter((_, idx) => idx !== index));
    setErrorMessage('');
  };

  const updatePassenger = (index, field, val) => {
    const updated = [...passengers];
    updated[index][field] = val;
    setPassengers(updated);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMessage('');

    for (let i = 0; i < passengers.length; i++) {
      const p = passengers[i];
      if (!p.name.trim()) {
        setErrorMessage(`Please enter the full name for Passenger #${i + 1}`);
        return;
      }
      if (!p.age || parseInt(p.age) <= 0) {
        setErrorMessage(`Please enter a valid age for Passenger #${i + 1}`);
        return;
      }
    }

    try {
      setIsSubmitting(true);
      const payload = {
        train_number: train.train_number,
        train_name: train.train_name,
        from_station_code: train.from_station_code,
        to_station_code: train.to_station_code,
        journey_date: journeyDate,
        travel_class: selectedClass,
        quota,
        passengers: passengers.map(p => ({
          name: p.name.trim(),
          age: parseInt(p.age),
          gender: p.gender,
          berth_preference: p.berth_preference,
          id_type: p.id_type,
          id_number: p.id_number || 'NA'
        })),
        booked_via: 'WEB_MANUAL',
        contact_phone: contactPhone,
        contact_email: contactEmail,
        user_id: user?.id || user?._id || undefined,
        user_email: user?.email || undefined
      };

      const resp = await createBooking(payload);
      if (resp.success) {
        confetti({
          particleCount: 100,
          spread: 70,
          origin: { y: 0.6 }
        });
        onBookingSuccess(resp.booking);
      }
    } catch (err) {
      const detail = err.response?.data?.detail || err.message || 'Failed to complete booking';
      setErrorMessage(detail);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm overflow-y-auto animate-fade-in">
      <div className="relative w-full max-w-2xl bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-2xl my-8">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-6 right-6 p-2 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Modal Header */}
        <div className="flex items-center gap-3.5 pb-5 border-b border-slate-100">
          <div className="p-3 rounded-2xl bg-orange-100 text-orange-600 border border-orange-200">
            <Ticket className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-xl font-extrabold text-slate-900 flex items-center gap-2">
              Book Ticket: {train.train_name}
            </h3>
            <p className="text-xs text-slate-500 font-medium">
              #{train.train_number} • {train.from_station_name} → {train.to_station_name} • Date: {journeyDate}
            </p>
          </div>
        </div>

        {/* Error Alert */}
        {errorMessage && (
          <div className="mt-4 p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-5 space-y-5">
          {/* Quota & Class Selector */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                Travel Class
              </label>
              <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200 text-slate-900 font-bold text-sm">
                {selectedClass} • ₹{baseFare} / passenger
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                Quota Category
              </label>
              <select
                value={quota}
                onChange={(e) => setQuota(e.target.value)}
                className="w-full p-3 rounded-2xl bg-slate-50 border border-slate-300 text-slate-900 font-semibold text-sm outline-none cursor-pointer focus:bg-white"
              >
                <option value="GN">General Quota (GN)</option>
                <option value="TQ">Tatkal Quota (TQ - Max 4)</option>
                <option value="LD">Ladies Quota (LD)</option>
                <option value="SS">Senior Citizen Quota (SS)</option>
              </select>
            </div>
          </div>

          {/* Passenger Information */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                <User className="w-4 h-4 text-orange-600" />
                Passenger Details (Max 6 as per Railway Policy)
              </span>

              <button
                type="button"
                onClick={addPassenger}
                className="flex items-center gap-1 px-3 py-1 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 text-orange-700 border border-slate-200 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" /> Add Passenger
              </button>
            </div>

            <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
              {passengers.map((p, idx) => (
                <div key={idx} className="p-4 rounded-2xl bg-slate-50 border border-slate-200 relative">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-slate-700">Passenger #{idx + 1}</span>
                    {passengers.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removePassenger(idx)}
                        className="text-slate-400 hover:text-rose-600 p-1 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                    <div className="sm:col-span-6">
                      <input
                        type="text"
                        placeholder="Full Name (as on Govt ID)"
                        value={p.name}
                        onChange={(e) => updatePassenger(idx, 'name', e.target.value)}
                        required
                        className="w-full px-3 py-2 rounded-xl bg-white border border-slate-300 text-slate-900 text-xs font-medium outline-none focus:border-orange-500"
                      />
                    </div>

                    <div className="sm:col-span-2">
                      <input
                        type="number"
                        placeholder="Age"
                        min="1"
                        max="120"
                        value={p.age}
                        onChange={(e) => updatePassenger(idx, 'age', e.target.value)}
                        required
                        className="w-full px-3 py-2 rounded-xl bg-white border border-slate-300 text-slate-900 text-xs font-medium outline-none focus:border-orange-500"
                      />
                    </div>

                    <div className="sm:col-span-2">
                      <select
                        value={p.gender}
                        onChange={(e) => updatePassenger(idx, 'gender', e.target.value)}
                        className="w-full px-2 py-2 rounded-xl bg-white border border-slate-300 text-slate-900 text-xs font-medium outline-none"
                      >
                        <option value="M">Male</option>
                        <option value="F">Female</option>
                        <option value="O">Other</option>
                      </select>
                    </div>

                    <div className="sm:col-span-2">
                      <select
                        value={p.berth_preference}
                        onChange={(e) => updatePassenger(idx, 'berth_preference', e.target.value)}
                        className="w-full px-2 py-2 rounded-xl bg-white border border-slate-300 text-slate-900 text-xs font-medium outline-none"
                      >
                        <option value="Lower">Lower</option>
                        <option value="Middle">Middle</option>
                        <option value="Upper">Upper</option>
                        <option value="Side Lower">Side Lower</option>
                        <option value="Side Upper">Side Upper</option>
                        <option value="Window">Window</option>
                      </select>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Contact Details */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">Mobile Number (for SMS)</label>
              <input
                type="text"
                value={contactPhone}
                onChange={(e) => setContactPhone(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-300 text-slate-900 text-xs font-medium outline-none focus:bg-white"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">Email (for E-Ticket)</label>
              <input
                type="email"
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-300 text-slate-900 text-xs font-medium outline-none focus:bg-white"
              />
            </div>
          </div>

          {/* Total Fare & Confirmation */}
          <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
            <div>
              <div className="text-xs text-slate-500 font-semibold">
                Total Fare ({passengers.length} passenger{passengers.length > 1 ? 's' : ''}):
              </div>
              <div className="text-2xl font-black text-slate-900">₹{totalFare}</div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="flex items-center gap-2 px-6 py-3 rounded-2xl font-bold text-sm text-white bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 shadow-md shadow-orange-600/20 transition-all hover:scale-105 active:scale-95 disabled:opacity-50 cursor-pointer"
            >
              <ShieldCheck className="w-4 h-4" />
              {isSubmitting ? 'Booking Ticket...' : 'Confirm & Book Ticket'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
