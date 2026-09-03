import React, { useState } from 'react';
import { PhoneCall, Train, ShieldCheck, Ticket, User, LogOut, Sparkles, ChevronDown } from 'lucide-react';

export default function Navbar({
  activeTab,
  setActiveTab,
  onOpenVoiceCall,
  user,
  onOpenAuthModal,
  onLogout
}) {
  const [showUserMenu, setShowUserMenu] = useState(false);

  return (
    <header className="sticky top-0 z-40 w-full bg-white/95 backdrop-blur-md border-b border-slate-200/90 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
        {/* Brand Logo */}
        <div className="flex items-center gap-3.5 cursor-pointer" onClick={() => setActiveTab('search')}>
          <div className="relative flex items-center justify-center w-11 h-11 rounded-2xl bg-gradient-to-tr from-orange-600 via-amber-500 to-amber-400 text-white font-black shadow-md shadow-orange-500/20">
            <Train className="w-6 h-6 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xl font-extrabold tracking-tight text-slate-900">
                RailVoice
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-orange-100 text-orange-700 border border-orange-200 tracking-wider">
                IRCTC AI
              </span>
            </div>
            <p className="text-xs text-slate-500 font-medium">Smart Voice Train Reservation System</p>
          </div>
        </div>

        {/* Center Tabs Navigation */}
        <nav className="hidden md:flex items-center p-1.5 rounded-2xl bg-slate-100 border border-slate-200/80 shadow-inner">
          <button
            onClick={() => setActiveTab('search')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all duration-200 cursor-pointer ${
              activeTab === 'search'
                ? 'bg-white text-orange-600 shadow-sm font-bold'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
            }`}
          >
            <Train className="w-4 h-4" />
            Search Trains
          </button>

          <button
            onClick={() => setActiveTab('bookings')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all duration-200 cursor-pointer ${
              activeTab === 'bookings'
                ? 'bg-white text-orange-600 shadow-sm font-bold'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
            }`}
          >
            <Ticket className="w-4 h-4" />
            My Bookings & PNR
          </button>

          <button
            onClick={() => setActiveTab('policies')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all duration-200 cursor-pointer ${
              activeTab === 'policies'
                ? 'bg-white text-orange-600 shadow-sm font-bold'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
            Railway Policies
          </button>
        </nav>

        {/* Right side: Single Voice Agent CTA + Auth profile */}
        <div className="flex items-center gap-3">
          {/* Sole Voice Agent CTA */}
          <button
            onClick={onOpenVoiceCall}
            className="group relative inline-flex items-center gap-2.5 px-4 sm:px-5 py-2.5 rounded-2xl font-bold text-xs sm:text-sm text-white bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-600 hover:from-emerald-500 hover:to-teal-500 shadow-md shadow-emerald-600/20 transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
          >
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-white"></span>
            </span>
            <PhoneCall className="w-3.5 h-3.5 text-white" />
            <span>Voice Agent</span>
            <Sparkles className="w-3.5 h-3.5 text-amber-200 hidden sm:inline" />
          </button>

          {/* User Account Controls */}
          {user ? (
            <div className="relative">
              <button
                onClick={() => setShowUserMenu(!showUserMenu)}
                className="flex items-center gap-2.5 pl-2 pr-3 py-1.5 rounded-2xl bg-slate-100 hover:bg-slate-200/70 border border-slate-200 text-slate-800 transition-all cursor-pointer"
              >
                <div className="w-7 h-7 rounded-xl bg-orange-600 text-white font-bold text-xs flex items-center justify-center shadow-xs">
                  {user.name ? user.name.charAt(0).toUpperCase() : 'U'}
                </div>
                <div className="text-left hidden sm:block">
                  <div className="text-xs font-bold text-slate-800 leading-none">{user.name}</div>
                </div>
                <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
              </button>

              {/* User dropdown menu */}
              {showUserMenu && (
                <div
                  className="absolute right-0 mt-2 w-56 bg-white rounded-2xl shadow-xl border border-slate-200 py-2 z-50 animate-fadeIn"
                  onMouseLeave={() => setShowUserMenu(false)}
                >
                  <div className="px-4 py-2 border-b border-slate-100">
                    <p className="text-xs font-bold text-slate-900 truncate">{user.name}</p>
                    <p className="text-[11px] text-slate-500 truncate">{user.email}</p>
                  </div>
                  <button
                    onClick={() => {
                      setShowUserMenu(false);
                      setActiveTab('bookings');
                    }}
                    className="w-full px-4 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-2 cursor-pointer"
                  >
                    <Ticket className="w-4 h-4 text-orange-600" />
                    My Bookings
                  </button>
                  <button
                    onClick={() => {
                      setShowUserMenu(false);
                      onLogout();
                    }}
                    className="w-full px-4 py-2 text-left text-xs font-semibold text-rose-600 hover:bg-rose-50 flex items-center gap-2 cursor-pointer"
                  >
                    <LogOut className="w-4 h-4 text-rose-600" />
                    Sign Out
                  </button>
                </div>
              )}
            </div>
          ) : (
            <button
              onClick={onOpenAuthModal}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl font-bold text-xs sm:text-sm text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-200/80 transition-all cursor-pointer"
            >
              <User className="w-4 h-4 text-slate-600" />
              <span>Sign In</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
