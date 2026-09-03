import React, { useState } from 'react';
import { Ticket, Search, CheckCircle2, XCircle, Mic, Globe, User, ArrowRight, ShieldAlert, DollarSign, LogIn } from 'lucide-react';
import { cancelBooking } from '../services/api';

export default function MyBookings({
  bookings = [],
  onRefresh,
  onOpenVoiceAgent,
  user,
  onOpenAuthModal
}) {
  const [searchPnr, setSearchPnr] = useState('');
  const [selectedBookingForCancel, setSelectedBookingForCancel] = useState(null);
  const [cancelReason, setCancelReason] = useState('Change of travel plans');
  const [isCancelling, setIsCancelling] = useState(false);

  const filteredBookings = bookings.filter((b) =>
    searchPnr ? b.pnr.includes(searchPnr.trim()) || b.train_name.toLowerCase().includes(searchPnr.toLowerCase()) : true
  );

  const handleConfirmCancel = async () => {
    if (!selectedBookingForCancel) return;
    try {
      setIsCancelling(true);
      await cancelBooking(selectedBookingForCancel.pnr, cancelReason);
      setSelectedBookingForCancel(null);
      onRefresh();
    } catch (err) {
      alert(err.response?.data?.detail || err.message || 'Cancellation failed');
    } finally {
      setIsCancelling(false);
    }
  };

  // If user is not logged in, show auth prompt banner
  if (!user) {
    return (
      <div className="bg-white rounded-2xl p-8 sm:p-12 text-center border border-slate-200 shadow-xs max-w-xl mx-auto">
        <div className="w-14 h-14 rounded-2xl bg-orange-100 text-orange-600 flex items-center justify-center mx-auto mb-4">
          <Ticket className="w-7 h-7" />
        </div>
        <h3 className="text-xl font-black text-slate-900 mb-2">Individual Booking Account</h3>
        <p className="text-xs text-slate-500 max-w-md mx-auto mb-6 leading-relaxed">
          Sign in or register to access your personal tickets, track PNR status, view allocated berths, and process instant refunds.
        </p>
        <button
          onClick={onOpenAuthModal}
          className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-orange-600 to-amber-600 text-white font-bold text-xs shadow-md shadow-orange-600/20 hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer"
        >
          <LogIn className="w-4 h-4" />
          <span>Sign In / Register</span>
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Top Banner & Search */}
      <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 shadow-xs flex flex-col md:flex-row items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
            <Ticket className="w-5 h-5 text-orange-600" />
            My Bookings & PNR Tracking
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Reservations for <span className="font-bold text-slate-700">{user.email}</span>
          </p>
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto">
          <div className="relative flex-1 md:w-56">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search PNR..."
              value={searchPnr}
              onChange={(e) => setSearchPnr(e.target.value)}
              className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-50 border border-slate-300 text-slate-900 text-xs font-semibold outline-none focus:bg-white focus:border-orange-500 font-mono"
            />
          </div>

          <button
            onClick={onRefresh}
            className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition-colors border border-slate-200 cursor-pointer"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Bookings List */}
      {filteredBookings.length === 0 ? (
        <div className="bg-white rounded-2xl p-10 text-center border border-slate-200 shadow-xs">
          <div className="w-12 h-12 rounded-xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-3">
            <Ticket className="w-6 h-6" />
          </div>
          <h3 className="text-base font-bold text-slate-800 mb-1">No Bookings Found</h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto mb-5">
            {searchPnr ? `No reservation matching PNR "${searchPnr}" was found.` : "You have no active train bookings yet."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3.5">
          {filteredBookings.map((b) => {
            const isCancelled = b.status === 'CANCELLED';
            const isVoice = b.booked_via === 'VOICE_AGENT';

            return (
              <div
                key={b.pnr}
                className={`bg-white rounded-2xl p-4 sm:p-5 border transition-all duration-200 shadow-xs hover:shadow-sm ${
                  isCancelled
                    ? 'border-rose-200 bg-rose-50/20'
                    : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                {/* Top Status Row */}
                <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[11px] text-slate-500 font-bold uppercase tracking-wider">PNR:</span>
                    <span className="text-xs font-mono font-black text-slate-900 bg-orange-50 px-2.5 py-0.5 rounded-lg border border-orange-200">
                      {b.pnr}
                    </span>

                    <span
                      className={`text-[10px] font-black px-2.5 py-0.5 rounded-full flex items-center gap-1 border ${
                        isCancelled
                          ? 'bg-rose-100 text-rose-800 border-rose-200'
                          : 'bg-emerald-100 text-emerald-800 border-emerald-200'
                      }`}
                    >
                      {isCancelled ? <XCircle className="w-3 h-3 text-rose-700" /> : <CheckCircle2 className="w-3 h-3 text-emerald-700" />}
                      {b.status}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <span
                      className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full flex items-center gap-1 border ${
                        isVoice
                          ? 'bg-purple-100 text-purple-800 border-purple-200'
                          : 'bg-blue-100 text-blue-800 border-blue-200'
                      }`}
                    >
                      {isVoice ? <Mic className="w-3 h-3 text-purple-700" /> : <Globe className="w-3 h-3 text-blue-700" />}
                      {isVoice ? 'AI Voice Agent' : 'Web Booking'}
                    </span>
                  </div>
                </div>

                {/* Train & Journey Route */}
                <div className="py-3 grid grid-cols-12 gap-2 items-center">
                  <div className="col-span-4">
                    <div className="text-[11px] font-bold text-orange-700 uppercase tracking-wider truncate">
                      {b.train_number} • {b.train_name}
                    </div>
                    <div className="text-base sm:text-lg font-black text-slate-900 leading-tight">{b.departure_time}</div>
                    <div className="text-xs font-bold text-slate-800 truncate">{b.from_station_name} ({b.from_station_code})</div>
                    <div className="text-[10px] text-slate-500 font-semibold">Date: {b.journey_date}</div>
                  </div>

                  <div className="col-span-4 flex flex-col items-center justify-center text-center px-1">
                    <div className="text-[10px] font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded-full border border-slate-200">
                      {b.travel_class} • {b.quota}
                    </div>
                    <div className="w-full flex items-center gap-1 my-1.5 max-w-[120px]">
                      <div className="w-1.5 h-1.5 rounded-full bg-orange-600"></div>
                      <div className="flex-1 h-0.5 bg-slate-200"></div>
                      <ArrowRight className="w-3 h-3 text-slate-400 shrink-0" />
                      <div className="flex-1 h-0.5 bg-slate-200"></div>
                      <div className="w-1.5 h-1.5 rounded-full bg-emerald-600"></div>
                    </div>
                  </div>

                  <div className="col-span-4 text-right">
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      Destination
                    </div>
                    <div className="text-base sm:text-lg font-black text-slate-900 leading-tight">{b.arrival_time}</div>
                    <div className="text-xs font-bold text-slate-800 truncate">{b.to_station_name} ({b.to_station_code})</div>
                    <div className="text-[11px] text-slate-700 font-black">₹{b.total_fare}</div>
                  </div>
                </div>

                {/* Passengers List & Allocated Berths */}
                <div className="pt-2.5 border-t border-slate-100">
                  <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                    Passenger & Berth Allocations
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {b.passengers?.map((p, pIdx) => (
                      <div key={pIdx} className="px-2.5 py-1.5 rounded-xl bg-slate-50 border border-slate-200 flex items-center gap-2">
                        <User className="w-3.5 h-3.5 text-orange-600 shrink-0" />
                        <div>
                          <div className="text-[11px] font-bold text-slate-900 leading-none">{p.name}</div>
                          <div className="text-[9px] text-slate-500">{p.age} yrs • {p.gender}</div>
                        </div>
                        <div className="text-right pl-2 border-l border-slate-200">
                          <div className="text-[10px] font-black font-mono text-emerald-700 leading-none">
                            {p.berth_number || `Seat ${pIdx + 1}`}
                          </div>
                          <div className="text-[8px] text-slate-500 font-semibold">{p.coach || p.berth_type || 'Confirmed'}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Cancellation Refund Details / Cancel Button */}
                <div className="mt-3 pt-2.5 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
                  {isCancelled ? (
                    <div className="w-full p-2 rounded-xl bg-rose-50 border border-rose-200 text-[11px] text-rose-800 flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <span className="font-bold">Cancelled:</span> {b.cancelled_at?.split('T')[0]} •{' '}
                        <span className="font-bold">Deduction:</span> ₹{b.cancellation_charge || 0} •{' '}
                        <span className="font-bold text-emerald-800">Refund:</span> ₹{b.refund_amount || 0}
                      </div>
                      <span className="text-[9px] font-mono font-bold uppercase px-2 py-0.5 bg-rose-200 text-rose-900 rounded">
                        {b.refund_status || 'REFUND_PROCESSED'}
                      </span>
                    </div>
                  ) : (
                    <>
                      <div className="text-[10px] text-slate-500 font-medium">
                        Booked: {new Date(b.created_at).toLocaleString()}
                      </div>

                      <button
                        onClick={() => setSelectedBookingForCancel(b)}
                        className="px-3 py-1.5 rounded-lg text-[11px] font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 transition-colors cursor-pointer"
                      >
                        Cancel Ticket
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Cancellation Modal */}
      {selectedBookingForCancel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="w-full max-w-md bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 pb-3 border-b border-slate-100">
              <div className="p-2 rounded-xl bg-rose-100 text-rose-600 border border-rose-200">
                <ShieldAlert className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-black text-slate-900">Cancel Ticket</h3>
                <p className="text-[11px] text-slate-500">
                  PNR: {selectedBookingForCancel.pnr} • Train #{selectedBookingForCancel.train_number}
                </p>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-1.5">
              <div className="font-bold text-orange-700 flex items-center gap-1">
                <DollarSign className="w-3.5 h-3.5" /> Railway Cancellation Refund Policy:
              </div>
              <p className="text-[11px] text-slate-600 leading-normal">
                • 48+ hrs before: Flat clerkage deduction<br />
                • 48-12 hrs: 25% of fare deducted<br />
                • 12-4 hrs: 50% of fare deducted<br />
                • &lt;4 hrs: No refund permissible
              </p>
              <div className="pt-1.5 border-t border-slate-200 text-slate-800 font-bold text-xs">
                Total Paid: ₹{selectedBookingForCancel.total_fare}
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Reason for Cancellation
              </label>
              <select
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                className="w-full bg-slate-50 text-slate-900 text-xs font-semibold rounded-xl p-2.5 border border-slate-300 outline-none"
              >
                <option value="Change of travel plans">Change of travel plans</option>
                <option value="Train schedule rescheduled">Train schedule rescheduled</option>
                <option value="Medical emergency">Medical emergency</option>
                <option value="Duplicate booking made">Duplicate booking made</option>
              </select>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                onClick={() => setSelectedBookingForCancel(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors"
              >
                Keep Ticket
              </button>
              <button
                onClick={handleConfirmCancel}
                disabled={isCancelling}
                className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 transition-colors cursor-pointer disabled:opacity-50"
              >
                {isCancelling ? 'Processing...' : 'Confirm Cancellation'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
