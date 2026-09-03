import React from 'react';
import { ArrowLeftRight, Calendar, Search, MapPin, Sparkles, Filter } from 'lucide-react';

const POPULAR_ROUTES = [
  { from: 'NDLS', to: 'MMCT', label: 'Delhi ⇄ Mumbai' },
  { from: 'NDLS', to: 'BSB', label: 'Delhi ⇄ Varanasi (Vande Bharat)' },
  { from: 'NDLS', to: 'HWH', label: 'Delhi ⇄ Kolkata (Howrah)' },
  { from: 'MAS', to: 'MYS', label: 'Chennai ⇄ Mysuru / Bengaluru' },
  { from: 'MMCT', to: 'ADI', label: 'Mumbai ⇄ Ahmedabad (Shatabdi)' },
];

export default function TrainSearch({
  stations,
  fromStation,
  setFromStation,
  toStation,
  setToStation,
  journeyDate,
  setJourneyDate,
  travelClass,
  setTravelClass,
  onSearch,
  isSearching
}) {
  const handleSwap = () => {
    const temp = fromStation;
    setFromStation(toStation);
    setToStation(temp);
  };

  const setDateShortcut = (daysAhead) => {
    const d = new Date();
    d.setDate(d.getDate() + daysAhead);
    const dateStr = d.toISOString().split('T')[0];
    setJourneyDate(dateStr);
  };

  return (
    <div className="w-full">
      {/* Search Container Card */}
      <div className="bg-white rounded-3xl p-5 sm:p-7 shadow-xs border border-slate-200/90 relative overflow-hidden">
        {/* Subtle Background Tint */}
        <div className="absolute -right-24 -top-24 w-80 h-80 bg-orange-100/40 rounded-full blur-3xl pointer-events-none"></div>
        <div className="absolute -left-24 -bottom-24 w-80 h-80 bg-blue-100/40 rounded-full blur-3xl pointer-events-none"></div>

        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-2 mb-5 relative">
          <div>
            <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-slate-900">
              Indian Railways Ticket Reservation
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
              Live seat availability, transparent dynamic fares, and seamless AI booking.
            </p>
          </div>
        </div>

        {/* Inputs Grid */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 sm:gap-4 items-center relative">
          {/* From Station */}
          <div className="md:col-span-3">
            <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-orange-600" /> From Station
            </label>
            <select
              value={fromStation}
              onChange={(e) => setFromStation(e.target.value)}
              className="w-full bg-slate-50 text-slate-900 rounded-2xl px-4 py-3.5 border border-slate-300 focus:border-orange-500 focus:bg-white focus:ring-2 focus:ring-orange-500/20 font-semibold text-sm transition-all outline-none cursor-pointer"
            >
              {stations.map((s) => (
                <option key={s.code} value={s.code} className="bg-white text-slate-900">
                  {s.name} ({s.code})
                </option>
              ))}
            </select>
          </div>

          {/* Swap Button */}
          <div className="md:col-span-1 flex justify-center pt-2 md:pt-6">
            <button
              onClick={handleSwap}
              title="Swap Stations"
              className="p-3 rounded-2xl bg-slate-100 hover:bg-orange-500 hover:text-white text-slate-600 border border-slate-300 transition-all duration-200 hover:scale-110 shadow-sm"
            >
              <ArrowLeftRight className="w-4 h-4" />
            </button>
          </div>

          {/* To Station */}
          <div className="md:col-span-3">
            <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-emerald-600" /> To Station
            </label>
            <select
              value={toStation}
              onChange={(e) => setToStation(e.target.value)}
              className="w-full bg-slate-50 text-slate-900 rounded-2xl px-4 py-3.5 border border-slate-300 focus:border-orange-500 focus:bg-white focus:ring-2 focus:ring-orange-500/20 font-semibold text-sm transition-all outline-none cursor-pointer"
            >
              {stations.map((s) => (
                <option key={s.code} value={s.code} className="bg-white text-slate-900">
                  {s.name} ({s.code})
                </option>
              ))}
            </select>
          </div>

          {/* Journey Date */}
          <div className="md:col-span-3">
            <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-blue-600" /> Journey Date
            </label>
            <input
              type="date"
              value={journeyDate}
              min={new Date().toISOString().split('T')[0]}
              onChange={(e) => setJourneyDate(e.target.value)}
              className="w-full bg-slate-50 text-slate-900 rounded-2xl px-4 py-3.5 border border-slate-300 focus:border-orange-500 focus:bg-white focus:ring-2 focus:ring-orange-500/20 font-semibold text-sm transition-all outline-none"
            />
          </div>

          {/* Search Button */}
          <div className="md:col-span-2 pt-2 md:pt-6">
            <button
              onClick={onSearch}
              disabled={isSearching}
              className="w-full flex items-center justify-center gap-2 px-5 py-3.5 rounded-2xl font-bold text-sm text-white bg-gradient-to-r from-orange-600 via-amber-600 to-amber-500 hover:from-orange-500 hover:to-amber-400 shadow-md shadow-orange-500/25 transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 cursor-pointer"
            >
              <Search className="w-4 h-4" />
              {isSearching ? 'Searching...' : 'Search Trains'}
            </button>
          </div>
        </div>

        {/* Date Shortcuts & Class Filter */}
        <div className="mt-5 pt-4 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
          {/* Quick Date Pills */}
          <div className="flex items-center gap-2">
            <span className="text-slate-500 font-semibold">Quick Dates:</span>
            <button
              onClick={() => setDateShortcut(0)}
              className="px-3 py-1 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold border border-slate-200 transition-colors"
            >
              Today
            </button>
            <button
              onClick={() => setDateShortcut(1)}
              className="px-3 py-1 rounded-xl bg-orange-100 text-orange-800 hover:bg-orange-200 font-bold border border-orange-200 transition-colors"
            >
              Tomorrow
            </button>
            <button
              onClick={() => setDateShortcut(2)}
              className="px-3 py-1 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold border border-slate-200 transition-colors"
            >
              Day After
            </button>
          </div>

          {/* Travel Class Selector */}
          <div className="flex items-center gap-2">
            <Filter className="w-3.5 h-3.5 text-slate-500" />
            <span className="text-slate-500 font-semibold">Class:</span>
            <select
              value={travelClass}
              onChange={(e) => setTravelClass(e.target.value)}
              className="bg-slate-100 text-slate-800 rounded-xl px-3 py-1 border border-slate-300 font-bold outline-none text-xs focus:bg-white"
            >
              <option value="">All Classes</option>
              <option value="3A">3A (AC 3 Tier)</option>
              <option value="2A">2A (AC 2 Tier)</option>
              <option value="1A">1A (First AC)</option>
              <option value="CC">CC (AC Chair Car)</option>
              <option value="EC">EC (Exec Chair Car)</option>
              <option value="SL">SL (Sleeper)</option>
            </select>
          </div>
        </div>

        {/* Popular Routes Pills */}
        <div className="mt-3.5 flex flex-wrap items-center gap-2 text-xs">
          <span className="text-slate-500 font-semibold">Popular:</span>
          {POPULAR_ROUTES.map((r, i) => (
            <button
              key={i}
              onClick={() => {
                setFromStation(r.from);
                setToStation(r.to);
                setTimeout(onSearch, 50);
              }}
              className="px-3 py-1 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 font-medium transition-colors"
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
