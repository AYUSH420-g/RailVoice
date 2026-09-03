import React from 'react';
import { ShieldCheck, Clock, Users, FileText, AlertOctagon, HelpCircle, Sparkles } from 'lucide-react';

export default function PolicyModal({ onTestPromptWithVoice }) {
  const policyRules = [
    {
      icon: Users,
      title: 'Passenger Limits (Strict Guardrail)',
      color: 'text-orange-700 bg-orange-100',
      bgColor: 'bg-white border-slate-200',
      description: 'Maximum 6 passengers per booking on a single PNR (Maximum 4 under Tatkal quota). Children under 5 years travel free without separate berth.',
      testPrompt: 'Can I book for 8 passengers?'
    },
    {
      icon: Clock,
      title: 'Cancellation & Refund Tiers',
      color: 'text-blue-700 bg-blue-100',
      bgColor: 'bg-white border-slate-200',
      description: '>48 hrs: Flat clerkage deduction (₹180 for 3A/CC, ₹240 for 1A/EC, ₹120 for SL). 48-12 hrs: 25% deducted. 12-4 hrs: 50% deducted. <4 hrs: Zero refund.',
      testPrompt: 'What is your cancellation refund policy?'
    },
    {
      icon: AlertOctagon,
      title: 'Tatkal Quota Guidelines',
      color: 'text-amber-800 bg-amber-100',
      bgColor: 'bg-white border-slate-200',
      description: 'Opens at 10:00 AM IST for AC classes (1A, 2A, 3A, CC, EC) and 11:00 AM IST for Non-AC classes (Sleeper) 1 day prior to travel. Tatkal tickets are non-refundable.',
      testPrompt: 'What are the Tatkal booking timings and rules?'
    },
    {
      icon: FileText,
      title: 'Mandatory Identification Proof',
      color: 'text-emerald-800 bg-emerald-100',
      bgColor: 'bg-white border-slate-200',
      description: 'At least one passenger in each booking must carry an original government-issued photo ID (Aadhaar, Voter ID, Driving License, Passport, or PAN card).',
      testPrompt: 'Do I need an ID card to travel on the train?'
    }
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-sm">
        <div className="flex items-center gap-3.5">
          <div className="p-3 rounded-2xl bg-emerald-100 text-emerald-700 border border-emerald-200">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-2xl font-extrabold text-slate-900">
              Railway Booking & Cancellation Policy Guardrails
            </h2>
            <p className="text-xs text-slate-500 mt-1 font-medium">
              These official rules are strictly enforced by the autonomous AI Voice Agent and cannot be bypassed.
            </p>
          </div>
        </div>
      </div>

      {/* Rules Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {policyRules.map((rule, idx) => {
          const Icon = rule.icon;
          return (
            <div key={idx} className={`rounded-3xl p-6 border ${rule.bgColor} shadow-sm flex flex-col justify-between`}>
              <div>
                <div className="flex items-center gap-3 mb-3">
                  <div className={`p-2.5 rounded-xl ${rule.color}`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <h3 className="text-base font-bold text-slate-900">{rule.title}</h3>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed font-medium">{rule.description}</p>
              </div>

              <div className="mt-5 pt-4 border-t border-slate-100 flex items-center justify-between">
                <span className="text-[11px] text-slate-500 flex items-center gap-1 font-semibold">
                  <HelpCircle className="w-3.5 h-3.5" /> Test Voice Agent:
                </span>
                <button
                  onClick={() => onTestPromptWithVoice(rule.testPrompt)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-orange-700 bg-orange-50 hover:bg-orange-100 border border-orange-200 transition-all hover:scale-105"
                >
                  <Sparkles className="w-3 h-3 text-orange-600" /> "{rule.testPrompt}"
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
