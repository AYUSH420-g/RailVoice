import React from 'react';

export default function AudioWaveform({ isActive, isAgent, isUser, barCount = 28 }) {
  const bars = Array.from({ length: barCount }, (_, i) => {
    const factor = Math.sin((i / barCount) * Math.PI);
    return Math.max(12, Math.round(factor * 100));
  });

  return (
    <div className="flex items-center justify-center gap-1.5 h-20 px-6 py-3 rounded-2xl bg-slate-100 border border-slate-200 shadow-inner">
      {bars.map((height, idx) => {
        let barColor = "bg-slate-300";
        let animationDuration = `${0.6 + (idx % 5) * 0.15}s`;
        let minHeight = "8px";

        if (isAgent) {
          barColor = "bg-gradient-to-t from-orange-600 via-amber-500 to-amber-400 shadow-xs";
        } else if (isUser) {
          barColor = "bg-gradient-to-t from-emerald-600 via-teal-500 to-cyan-400 shadow-xs";
        } else if (isActive) {
          barColor = "bg-slate-400";
        }

        return (
          <div
            key={idx}
            className={`w-1.5 rounded-full transition-all duration-150 ${barColor}`}
            style={{
              height: isActive ? `${Math.max(14, (height * (0.4 + ((idx * 7) % 6) * 0.1)))}%` : minHeight,
              animation: isActive ? `wave ${animationDuration} ease-in-out infinite alternate` : 'none',
              animationDelay: `${(idx * 0.05).toFixed(2)}s`
            }}
          />
        );
      })}
    </div>
  );
}
