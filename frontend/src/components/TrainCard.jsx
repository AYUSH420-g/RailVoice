import React, { useState } from 'react';
import { Clock, Utensils, Star, Ticket, ChevronRight } from 'lucide-react';

export default function TrainCard({ train, onSelectBooking }) {
  const classesEntries = Object.entries(train.classes || {});
  const [activeClass, setActiveClass] = useState(classesEntries[0]?.[0] || '3A');

  const getBadgeStyle = (type) => {
    switch (type) {
      case 'Vande Bharat':
        return 'bg-blue-600 text-white border-blue-700';
      case 'Rajdhani':
        return 'bg-rose-600 text-white border-rose-700';
      case 'Shatabdi':
        return 'bg-amber-500 text-slate-950 font-black border-amber-600';
      default:
        return 'bg-slate-800 text-white border-slate-900';
    }
  };

  const getStatusColor = (status) => {
    if (!status) return 'text-slate-600 bg-slate-100 border-slate-200';
    if (status.includes('AVAILABLE')) return 'text-emerald-700 bg-emerald-50 border-emerald-200';
    if (status.includes('RAC')) return 'text-amber-700 bg-amber-50 border-amber-200';
    return 'text-rose-700 bg-rose-50 border-rose-200';
  };

  return (
    <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 hover:border-slate-300 transition-all duration-200 shadow-xs hover:shadow-sm">
      {/* Top Meta Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-[10px] px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider border ${getBadgeStyle(train.train_type)}`}>
            {train.train_type}
          </span>
          <h3 className="text-base font-extrabold text-slate-900">
            {train.train_name}
          </h3>
          <span className="text-[11px] px-2 py-0.5 rounded-md font-mono font-bold bg-slate-100 text-slate-600 border border-slate-200">
            #{train.train_number}
          </span>
        </div>

        <div className="flex items-center gap-3 text-[11px] text-slate-500 font-medium">
          {train.pantry && (
            <span className="flex items-center gap-1 text-emerald-700 font-semibold">
              <Utensils className="w-3 h-3" />
              <span>Pantry</span>
            </span>
          )}
          <span className="flex items-center gap-1 text-amber-600 font-bold">
            <Star className="w-3 h-3 fill-amber-500 text-amber-500" />
            <span>{train.rating || '4.6'}</span>
          </span>
          <span className="hidden sm:inline text-slate-400">•</span>
          <span className="hidden sm:inline">Runs: {train.runs_on?.join(', ')}</span>
        </div>
      </div>

      {/* Journey Schedule - Compact Responsive Bar */}
      <div className="py-3.5 grid grid-cols-12 gap-2 items-center">
        {/* Departure */}
        <div className="col-span-4 sm:col-span-3">
          <div className="text-lg sm:text-xl font-black text-slate-900 leading-tight">
            {train.departure_time}
          </div>
          <div className="text-xs font-bold text-slate-800 truncate" title={train.from_station_name}>
            {train.from_station_name}
          </div>
          <div className="text-[10px] text-slate-500 font-mono font-semibold">
            {train.from_station_code}
          </div>
        </div>

        {/* Duration Track */}
        <div className="col-span-4 sm:col-span-6 flex flex-col items-center justify-center px-1 sm:px-4">
          <div className="flex items-center gap-1 text-[11px] font-bold text-slate-600 mb-0.5">
            <Clock className="w-3 h-3 text-orange-600" />
            <span>{train.duration}</span>
            <span className="hidden md:inline">• {train.distance_km} km</span>
          </div>

          <div className="w-full flex items-center gap-1.5 max-w-xs">
            <div className="w-2 h-2 rounded-full bg-orange-600 shrink-0"></div>
            <div className="flex-1 h-0.5 bg-slate-200 relative">
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 px-1.5 py-0.2 rounded-full bg-white border border-slate-300 text-[9px] text-slate-600 font-bold whitespace-nowrap shadow-2xs">
                {train.intermediate_stations?.length || 2} stops
              </div>
            </div>
            <div className="w-2 h-2 rounded-full bg-emerald-600 shrink-0"></div>
          </div>
        </div>

        {/* Arrival */}
        <div className="col-span-4 sm:col-span-3 text-right">
          <div className="text-lg sm:text-xl font-black text-slate-900 leading-tight">
            {train.arrival_time}
          </div>
          <div className="text-xs font-bold text-slate-800 truncate" title={train.to_station_name}>
            {train.to_station_name}
          </div>
          <div className="text-[10px] text-slate-500 font-mono font-semibold">
            {train.to_station_code}
          </div>
        </div>
      </div>

      {/* Available Classes & Booking Button */}
      <div className="pt-3 border-t border-slate-100 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        {/* Class Selection Chips */}
        <div className="flex flex-wrap gap-2">
          {classesEntries.map(([clsKey, clsVal]) => {
            const isSelected = activeClass === clsKey;
            return (
              <button
                key={clsKey}
                type="button"
                onClick={() => setActiveClass(clsKey)}
                className={`p-2 rounded-xl text-left border transition-all cursor-pointer min-w-[90px] flex-1 sm:flex-initial ${
                  isSelected
                    ? 'bg-orange-50/80 border-orange-500 ring-1 ring-orange-500/20'
                    : 'bg-slate-50 hover:bg-slate-100/80 border-slate-200'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className={`text-xs font-bold ${isSelected ? 'text-orange-700' : 'text-slate-700'}`}>
                    {clsKey}
                  </span>
                  <span className="text-xs font-black text-slate-900">₹{clsVal.fare}</span>
                </div>
                <div className={`mt-1 text-[10px] font-bold px-1.5 py-0.5 rounded border text-center ${getStatusColor(clsVal.status)}`}>
                  {clsVal.status || `AVL ${clsVal.available}`}
                </div>
              </button>
            );
          })}
        </div>

        {/* Primary Booking Button */}
        <button
          onClick={() => onSelectBooking(train, activeClass)}
          className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl font-bold text-xs text-white bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 shadow-sm shadow-orange-600/20 transition-all hover:scale-[1.02] active:scale-[0.98] cursor-pointer whitespace-nowrap self-stretch sm:self-auto"
        >
          <Ticket className="w-3.5 h-3.5" />
          <span>Book {activeClass}</span>
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
