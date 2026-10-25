import React, { useState, useEffect, useRef } from 'react';
import {
  Phone, PhoneOff, Mic, MicOff, Volume2, VolumeX, Sparkles, Send,
  ShieldCheck, AlertTriangle, CheckCircle2, Bot, User, RefreshCw, Radio
} from 'lucide-react';
import confetti from 'canvas-confetti';
import AudioWaveform from './AudioWaveform';
import { sounds } from '../utils/audioEffects';
import { WebRTCVoiceClient } from '../utils/webrtcClient';

export default function VoiceAgentCallModal({ isOpen, onClose, onBookingCompleted, initialPrompt = null }) {
  const [callState, setCallState] = useState('DIALING');
  const [callDuration, setCallDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeakerOn, setIsSpeakerOn] = useState(true);
  const [isUserSpeaking, setIsUserSpeaking] = useState(false);
  const [isAgentSpeaking, setIsAgentSpeaking] = useState(false);
  const [currentActionBadge, setCurrentActionBadge] = useState('Initiating WebRTC Connection to RailVoice Officer...');
  const [pipelineStage, setPipelineStage] = useState('IDLE');
  const [messages, setMessages] = useState([]);
  const [inputFeedback, setInputFeedback] = useState('');
  const [sessionInfo, setSessionInfo] = useState(null);
  const [bookingState, setBookingState] = useState(null);
  const [toolCalled, setToolCalled] = useState(null);
  const [silenceCountdown, setSilenceCountdown] = useState(null);

  const webrtcClientRef = useRef(null);
  const socketRef = useRef(null);
  const recognitionRef = useRef(null);
  const audioPlayerRef = useRef(new Audio());
  const timerRef = useRef(null);
  const transcriptEndRef = useRef(null);
  const silenceTimerRef = useRef(null);
  const countdownIntervalRef = useRef(null);

  const clearSilenceTimer = () => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
    setSilenceCountdown(null);
  };

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, currentActionBadge]);

  useEffect(() => {
    if (!isOpen) {
      clearSilenceTimer();
      handleHangUp();
      return;
    }

    setCallState('DIALING');
    setCallDuration(0);
    setMessages([]);
    sounds.playRingbackTone();

    const ringTimeout = setTimeout(() => {
      setCallState('RINGING');
      sounds.playRingbackTone();
    }, 1200);

    const connectTimeout = setTimeout(() => {
      connectCall();
    }, 2000);

    return () => {
      clearTimeout(ringTimeout);
      clearTimeout(connectTimeout);
      clearSilenceTimer();
      handleHangUp();
    };
  }, [isOpen]);

  useEffect(() => {
    if (callState === 'CONNECTED') {
      timerRef.current = setInterval(() => {
        setCallDuration((prev) => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [callState]);

  const connectCall = async () => {
    const token = localStorage.getItem('railvoice_token');
    const apiBase = import.meta.env.VITE_API_BASE_URL
      ? import.meta.env.VITE_API_BASE_URL.replace(/\/api\/?$/, '')
      : `${window.location.protocol}//${window.location.hostname}:8000`;

    // 1. Try WebRTC Audio Streaming with Deepgram Nova-2 STT & Flux TTS
    try {
      setCurrentActionBadge('Connecting via WebRTC (Deepgram Nova-2)...');
      setPipelineStage('WEBRTC_STREAM');

      const webrtc = new WebRTCVoiceClient({
        apiBaseUrl: apiBase,
        onStateChange: (st) => {
          if (st === 'CONNECTED') {
            setCallState('CONNECTED');
            sounds.playConnectChime();
            setPipelineStage('CONNECTED');
            setCurrentActionBadge('⚡ WebRTC Active • Deepgram Voice Engine');
          } else if (st === 'DISCONNECTED' || st === 'ENDED') {
            setCallState('ENDED');
            setPipelineStage('IDLE');
          }
        },
        onTrack: () => {
          setIsAgentSpeaking(true);
          setPipelineStage('WEBRTC_OUTPUT');
        },
        onMessage: (data) => {
          handleServerVoiceEvent(data);
        }
      });

      webrtcClientRef.current = webrtc;
      await webrtc.start(token);

      if (initialPrompt) {
        setTimeout(() => {
          sendUserUtterance(initialPrompt);
        }, 3000);
      }
      return;
    } catch (err) {
      console.warn('[WebRTC] WebRTC setup failed, falling back to WebSocket:', err);
      connectWebSocket();
    }
  };

  const connectWebSocket = () => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.hostname;
    const token = localStorage.getItem('railvoice_token');
    
    let wsUrl = '';
    if (import.meta.env.VITE_WS_URL) {
      const baseWs = import.meta.env.VITE_WS_URL.replace(/\/$/, '');
      wsUrl = `${baseWs}/ws/voice-agent${token ? `?token=${encodeURIComponent(token)}` : ''}`;
    } else {
      wsUrl = `${protocol}//${host}:8000/ws/voice-agent${token ? `?token=${encodeURIComponent(token)}` : ''}`;
    }

    try {
      const ws = new WebSocket(wsUrl);
      socketRef.current = ws;

      ws.onopen = () => {
        setCallState('CONNECTED');
        sounds.playConnectChime();
        initSpeechRecognition();

        if (token) {
          ws.send(JSON.stringify({ type: 'auth', token }));
        }

        if (initialPrompt) {
          setTimeout(() => {
            sendUserUtterance(initialPrompt);
          }, 3000);
        }
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          handleServerVoiceEvent(data);
        } catch (e) {
          console.error("WS Parse error:", e);
        }
      };

      ws.onerror = (err) => {
        console.warn("WebSocket fallback to REST:", err);
        setCallState('CONNECTED');
        sounds.playConnectChime();
        initSpeechRecognition();
        handleServerVoiceEvent({
          type: "agent_speech",
          text: "Namaste! I am Priya, your RailVoice smart railway booking assistant. Where would you like to travel from and to?",
          action_badge: "📞 Officer Priya Online • Deepgram Flux"
        });
      };

      ws.onclose = () => {
        if (callState === 'CONNECTED') {
          setCallState('ENDED');
        }
      };
    } catch (err) {
      console.error("Failed to connect WS:", err);
    }
  };

  const handleServerVoiceEvent = (data) => {
    if (data.action_badge) {
      setCurrentActionBadge(data.action_badge);
    }
    if (data.pipeline_stage) {
      setPipelineStage(data.pipeline_stage);
    }

    if (data.type === 'user_interim') {
      setIsUserSpeaking(true);
      setInputFeedback(data.text);
      setPipelineStage('DEEPGRAM_STT');
      clearSilenceTimer();
      return;
    }

    if (data.type === 'user_final') {
      setIsUserSpeaking(false);
      setInputFeedback('');
      setPipelineStage('TOOL_CALLING');
      setMessages((prev) => [
        ...prev,
        { sender: 'user', text: data.text, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }
      ]);
      clearSilenceTimer();
      return;
    }

    if (data.type === 'agent_interrupted') {
      stopAgentSpeechAndInterrupt();
      return;
    }

    if (data.type === 'agent_speech_done') {
      setIsAgentSpeaking(false);
      setPipelineStage('CONNECTED');
      if (data.action_badge) setCurrentActionBadge(data.action_badge);
      return;
    }

    if (data.type === 'tool_executed') {
      setPipelineStage('DEEPGRAM_TTS');
      if (data.tool_called) setToolCalled(data.tool_called);
      if (data.booking_state) setBookingState(data.booking_state);
      if (data.session) setSessionInfo(data.session);
      if (data.tool_data && data.tool_data.pnr) {
        sounds.playSuccessFanfare();
        confetti({ particleCount: 90, spread: 80, origin: { y: 0.5 } });
        if (onBookingCompleted) onBookingCompleted(data.tool_data);
      }
      return;
    }

    if (data.type === 'agent_connected' || data.type === 'agent_speech') {
      const agentText = data.text;
      setPipelineStage('WEBRTC_OUTPUT');
      setMessages((prev) => [...prev, { sender: 'agent', text: agentText, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }]);

      if (data.tool_data && data.tool_data.pnr) {
        sounds.playSuccessFanfare();
        confetti({ particleCount: 90, spread: 80, origin: { y: 0.5 } });
        if (onBookingCompleted) onBookingCompleted(data.tool_data);
      }

      // If playing over WebRTC track, audio is streamed directly; otherwise fallback to audio element
      if (!webrtcClientRef.current?.isConnected) {
        if (isSpeakerOn && data.audio) {
          playAudioBase64(data.audio);
        } else if (isSpeakerOn && 'speechSynthesis' in window) {
          speakBrowserTTS(agentText);
        }
      } else {
        setIsAgentSpeaking(true);
      }

      if (data.session) {
        setSessionInfo(data.session);
      }
      if (data.booking_state) {
        setBookingState(data.booking_state);
      }
      if (data.tool_called) {
        setToolCalled(data.tool_called);
      }
    }
  };

  const speakBrowserTTS = (text) => {
    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.0;
      utterance.pitch = 1.05;

      const voices = window.speechSynthesis.getVoices();
      const inVoice = voices.find(v => v.lang.includes('IN') || v.name.includes('India')) || voices[0];
      if (inVoice) utterance.voice = inVoice;

      utterance.onstart = () => setIsAgentSpeaking(true);
      utterance.onend = () => setIsAgentSpeaking(false);
      utterance.onerror = () => setIsAgentSpeaking(false);

      window.speechSynthesis.speak(utterance);
    } catch (e) {
      console.warn("TTS fallback error:", e);
    }
  };

  const stopAgentSpeechAndInterrupt = () => {
    try {
      if (webrtcClientRef.current) {
        webrtcClientRef.current.sendInterrupt();
      }
      if (audioPlayerRef.current) {
        audioPlayerRef.current.pause();
        audioPlayerRef.current.currentTime = 0;
        audioPlayerRef.current.src = '';
      }
    } catch (e) {}
    if ('speechSynthesis' in window) {
      try { window.speechSynthesis.cancel(); } catch (e) {}
    }
    setIsAgentSpeaking(false);
    setIsUserSpeaking(true);
    setPipelineStage('USER_SPEAKING');
    setCurrentActionBadge("👂 Listening to you...");
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ type: 'user_interrupt' }));
    }
  };

  const playAudioBase64 = (base64Audio) => {
    try {
      audioPlayerRef.current.pause();
      audioPlayerRef.current.src = base64Audio;
      audioPlayerRef.current.play().then(() => {
        setIsAgentSpeaking(true);
      }).catch(err => {
        console.warn("Audio play issue:", err);
        const lastMsg = messages[messages.length - 1]?.text;
        if (lastMsg) speakBrowserTTS(lastMsg);
      });

      audioPlayerRef.current.onended = () => {
        setIsAgentSpeaking(false);
      };
    } catch (e) {
      console.warn("Audio playback error:", e);
      setIsAgentSpeaking(false);
    }
  };

  const initSpeechRecognition = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-IN';

      recognition.onspeechstart = () => {
        setIsUserSpeaking(true);
        clearSilenceTimer();
        if (isAgentSpeaking) {
          stopAgentSpeechAndInterrupt();
        }
      };

      recognition.onsoundstart = () => {
        clearSilenceTimer();
        if (isAgentSpeaking) {
          stopAgentSpeechAndInterrupt();
        }
      };

      recognition.onresult = (event) => {
        if (isMuted) return;
        clearSilenceTimer();

        let interim = '';
        let finalUtterance = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalUtterance += event.results[i][0].transcript;
          } else {
            interim += event.results[i][0].transcript;
          }
        }

        if (interim) {
          setIsUserSpeaking(true);
          clearSilenceTimer();
          if (isAgentSpeaking) {
            stopAgentSpeechAndInterrupt();
          }
        }

        if (finalUtterance.trim()) {
          if (isAgentSpeaking) {
            stopAgentSpeechAndInterrupt();
          }
          setIsUserSpeaking(false);
          clearSilenceTimer();
          sendUserUtterance(finalUtterance.trim());
        }
      };

      recognition.onerror = () => setIsUserSpeaking(false);
      recognition.onend = () => {
        if (callState === 'CONNECTED') {
          try { recognition.start(); } catch (e) {}
        }
      };

      recognition.start();
      recognitionRef.current = recognition;
    } catch (e) {
      console.warn("Recognition error:", e);
    }
  };

  const sendUserUtterance = (text) => {
    if (!text || !text.trim()) return;
    clearSilenceTimer();

    setMessages((prev) => [
      ...prev,
      { sender: 'user', text, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }
    ]);
    setInputFeedback('');
    setPipelineStage('TOOL_CALLING');

    if (webrtcClientRef.current && webrtcClientRef.current.isConnected) {
      webrtcClientRef.current.sendTextPrompt(text);
    } else if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ type: 'user_speech', text }));
    } else {
      const apiBase = import.meta.env.VITE_API_BASE_URL
        ? import.meta.env.VITE_API_BASE_URL.replace(/\/api\/?$/, '')
        : 'http://localhost:8000';
      fetch(`${apiBase}/api/voice/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: 'rest_session_1', text })
      })
        .then(res => res.json())
        .then(data => handleServerVoiceEvent(data))
        .catch(err => console.error("REST error:", err));
    }
  };

  const handleHangUp = () => {
    sounds.playDisconnectTone();
    setCallState('ENDED');
    setPipelineStage('IDLE');
    setIsAgentSpeaking(false);
    setIsUserSpeaking(false);

    if (webrtcClientRef.current) {
      try { webrtcClientRef.current.stop(); } catch (e) {}
      webrtcClientRef.current = null;
    }
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch (e) {}
    }
    if (audioPlayerRef.current) audioPlayerRef.current.pause();
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    if (socketRef.current) {
      try {
        socketRef.current.send(JSON.stringify({ type: 'end_call' }));
        socketRef.current.close();
      } catch (e) {}
    }

    setTimeout(() => {
      onClose();
    }, 1200);
  };

  const toggleMute = () => {
    const nextMute = !isMuted;
    setIsMuted(nextMute);
    if (webrtcClientRef.current) {
      webrtcClientRef.current.setMute(nextMute);
    }
    if (recognitionRef.current) {
      if (nextMute) {
        try { recognitionRef.current.stop(); } catch (e) {}
      } else {
        try { recognitionRef.current.start(); } catch (e) {}
      }
    }
  };

  const toggleSpeaker = () => {
    const next = !isSpeakerOn;
    setIsSpeakerOn(next);
    if (!next) {
      audioPlayerRef.current.pause();
      if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    }
  };

  const formatTimer = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-md animate-fade-in">
      <div className="relative w-full max-w-2xl bg-white border border-slate-200 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        
        {/* Top Call Status Bar */}
        <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="relative flex h-3 w-3">
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                callState === 'CONNECTED' ? 'bg-emerald-500' : 'bg-amber-500'
              }`}></span>
              <span className={`relative inline-flex rounded-full h-3 w-3 ${
                callState === 'CONNECTED' ? 'bg-emerald-600' : 'bg-amber-600'
              }`}></span>
            </span>

            <div>
              <div className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                RailVoice Live Phone Call
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200 font-bold">
                  {callState}
                </span>
              </div>
              <div className="text-[11px] font-mono text-slate-500 font-semibold">
                Duration: {formatTimer(callDuration)}
              </div>
            </div>
          </div>

          {/* Action Badge */}
          <div className="hidden sm:flex items-center gap-1.5 px-3 py-1 rounded-full bg-orange-50 border border-orange-200 text-xs font-bold text-orange-800 shadow-xs">
            <Sparkles className="w-3.5 h-3.5 text-orange-600" />
            <span className="truncate max-w-[220px]">{currentActionBadge}</span>
          </div>
        </div>

        {/* Real-time Voice Pipeline Architecture HUD */}
        <div className="bg-slate-900 text-slate-200 px-4 py-2 text-[10px] flex items-center justify-between overflow-x-auto gap-2 border-b border-slate-800 scrollbar-none font-mono">
          <div className="flex items-center gap-1.5 shrink-0 text-slate-400 font-bold uppercase tracking-wider">
            <Radio className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
            WebRTC Pipeline:
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <span className={`px-2 py-0.5 rounded font-semibold transition-all ${
              pipelineStage === 'USER_SPEAKING' || isUserSpeaking ? 'bg-emerald-500 text-white font-bold ring-2 ring-emerald-300 animate-pulse' : 'bg-slate-800 text-slate-400'
            }`}>🎤 Speak</span>
            <span className="text-slate-600">➔</span>
            <span className={`px-2 py-0.5 rounded font-semibold transition-all ${
              webrtcClientRef.current?.isConnected ? 'bg-cyan-600 text-white font-bold' : 'bg-slate-800 text-slate-400'
            }`}>⚡ WebRTC</span>
            <span className="text-slate-600">➔</span>
            <span className={`px-2 py-0.5 rounded font-semibold transition-all ${
              pipelineStage === 'DEEPGRAM_STT' ? 'bg-blue-600 text-white font-bold ring-2 ring-blue-300 animate-pulse' : 'bg-slate-800 text-slate-400'
            }`}>🎙️ Deepgram STT</span>
            <span className="text-slate-600">➔</span>
            <span className={`px-2 py-0.5 rounded font-semibold transition-all ${
              pipelineStage === 'TOOL_CALLING' ? 'bg-purple-600 text-white font-bold ring-2 ring-purple-300 animate-pulse' : 'bg-slate-800 text-slate-400'
            }`}>🛠️ Tools</span>
            <span className="text-slate-600">➔</span>
            <span className={`px-2 py-0.5 rounded font-semibold transition-all ${
              pipelineStage === 'LLM_GEN' || pipelineStage === 'TOOL_CALLING' ? 'bg-indigo-600 text-white font-bold' : 'bg-slate-800 text-slate-400'
            }`}>🧠 LLM</span>
            <span className="text-slate-600">➔</span>
            <span className={`px-2 py-0.5 rounded font-semibold transition-all ${
              pipelineStage === 'DEEPGRAM_TTS' ? 'bg-orange-500 text-white font-bold ring-2 ring-orange-300 animate-pulse' : 'bg-slate-800 text-slate-400'
            }`}>🔊 Deepgram TTS</span>
            <span className="text-slate-600">➔</span>
            <span className={`px-2 py-0.5 rounded font-semibold transition-all ${
              pipelineStage === 'WEBRTC_OUTPUT' || isAgentSpeaking ? 'bg-emerald-600 text-white font-bold ring-2 ring-emerald-300 animate-pulse' : 'bg-slate-800 text-slate-400'
            }`}>🎧 WebRTC Out</span>
          </div>
        </div>

        {/* Simple Circle Avatar with Wave Animations & Small Text */}
        <div className="py-6 px-6 bg-gradient-to-b from-slate-50 to-white flex flex-col items-center justify-center border-b border-slate-100 relative overflow-hidden">
          <div className="relative flex items-center justify-center my-3">
            {/* Animated waves expanding around circle when she is speaking */}
            {isAgentSpeaking && (
              <>
                <span className="absolute w-24 h-24 rounded-full bg-orange-400/20 animate-ping duration-1000 pointer-events-none" />
                <span className="absolute w-32 h-32 rounded-full border-2 border-orange-400/30 animate-pulse duration-700 pointer-events-none" />
                <span className="absolute w-40 h-40 rounded-full border border-orange-300/20 animate-ping duration-1500 pointer-events-none" />
              </>
            )}

            {/* Ripple when user is speaking */}
            {isUserSpeaking && (
              <span className="absolute w-24 h-24 rounded-full bg-emerald-400/20 animate-ping duration-1000 pointer-events-none" />
            )}

            {/* Simple Circle */}
            <div
              className={`relative w-20 h-20 rounded-full flex items-center justify-center transition-all duration-300 ${
                isAgentSpeaking
                  ? 'bg-gradient-to-tr from-orange-500 to-amber-500 text-white ring-4 ring-orange-200 scale-105 shadow-lg shadow-orange-500/25'
                  : isUserSpeaking
                  ? 'bg-emerald-600 text-white ring-4 ring-emerald-200 scale-105 shadow-md'
                  : 'bg-white border-2 border-slate-200 text-slate-700 shadow-sm'
              }`}
            >
              <Bot className="w-9 h-9" />
            </div>
          </div>

          {/* Small text: agent thalia */}
          <div className="flex items-center gap-1.5 mt-1">
            <span className="text-xs font-semibold text-slate-800 tracking-wide">
              agent thalia (aura 2)
            </span>
            <span className={`w-2 h-2 rounded-full ${isAgentSpeaking ? 'bg-orange-500 animate-pulse' : 'bg-emerald-500'}`} />
          </div>

          {/* Live User Speech Indicator */}
          {inputFeedback && (
            <div className="mt-2 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-300 text-emerald-800 text-xs font-medium flex items-center gap-2 animate-pulse max-w-sm text-center">
              <span className="w-2 h-2 rounded-full bg-emerald-600 animate-ping shrink-0" />
              <span className="truncate">"{inputFeedback}"</span>
            </div>
          )}

          <div className="w-full max-w-xs mt-3">
            <AudioWaveform
              isActive={isAgentSpeaking || isUserSpeaking || callState === 'CONNECTED'}
              isAgent={isAgentSpeaking}
              isUser={isUserSpeaking}
              barCount={28}
            />
          </div>
        </div>

        {/* Live Booking State & Tool Call Status Tracker HUD */}
        {bookingState && (bookingState.from_station || bookingState.train_number || bookingState.seat_count || bookingState.travel_class) && (
          <div className="bg-slate-100/90 border-b border-slate-200 px-4 py-2.5 shrink-0">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                Live Booking State Tracker
              </span>
              {toolCalled && (
                <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 shadow-2xs">
                  ⚡ Tool: {toolCalled}
                </span>
              )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5 text-[11px]">
              {/* Route */}
              <div className={`p-1.5 rounded-lg border font-medium flex flex-col ${
                bookingState.from_station && bookingState.to_station
                  ? 'bg-emerald-50 border-emerald-300 text-emerald-950'
                  : 'bg-white border-slate-200 text-slate-400'
              }`}>
                <span className="text-[9px] font-bold uppercase text-slate-500">Route</span>
                <span className="truncate font-semibold">
                  {bookingState.from_station && bookingState.to_station
                    ? `${bookingState.from_station} ➔ ${bookingState.to_station}`
                    : '⏳ Missing'}
                </span>
              </div>

              {/* Train */}
              <div className={`p-1.5 rounded-lg border font-medium flex flex-col ${
                bookingState.train_number
                  ? 'bg-emerald-50 border-emerald-300 text-emerald-950'
                  : 'bg-white border-slate-200 text-slate-400'
              }`}>
                <span className="text-[9px] font-bold uppercase text-slate-500">Train</span>
                <span className="truncate font-semibold">
                  {bookingState.train_number ? `#${bookingState.train_number}` : '⏳ Select Train'}
                </span>
              </div>

              {/* Class */}
              <div className={`p-1.5 rounded-lg border font-medium flex flex-col ${
                bookingState.travel_class
                  ? 'bg-emerald-50 border-emerald-300 text-emerald-950'
                  : 'bg-white border-slate-200 text-slate-400'
              }`}>
                <span className="text-[9px] font-bold uppercase text-slate-500">Class</span>
                <span className="truncate font-semibold">
                  {bookingState.travel_class ? bookingState.travel_class : '⏳ Select Class'}
                </span>
              </div>

              {/* Seats */}
              <div className={`p-1.5 rounded-lg border font-medium flex flex-col ${
                bookingState.seat_count
                  ? 'bg-emerald-50 border-emerald-300 text-emerald-950'
                  : 'bg-white border-slate-200 text-slate-400'
              }`}>
                <span className="text-[9px] font-bold uppercase text-slate-500">Seats</span>
                <span className="truncate font-semibold">
                  {bookingState.seat_count ? `${bookingState.seat_count} Seat${bookingState.seat_count > 1 ? 's' : ''}` : '⏳ How many?'}
                </span>
              </div>

              {/* Passengers */}
              <div className={`p-1.5 rounded-lg border font-medium flex flex-col ${
                bookingState.is_ready
                  ? 'bg-emerald-50 border-emerald-300 text-emerald-950'
                  : (bookingState.passengers?.length > 0)
                  ? 'bg-amber-50 border-amber-300 text-amber-900'
                  : 'bg-white border-slate-200 text-slate-400'
              }`}>
                <span className="text-[9px] font-bold uppercase text-slate-500">Passengers</span>
                <span className="truncate font-semibold">
                  {bookingState.passengers?.length > 0
                    ? `${bookingState.passengers.length}/${bookingState.seat_count || 1} Added`
                    : '⏳ Names & Ages'}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Conversation Live Transcript */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-3 bg-slate-50/70">
          {messages.length === 0 ? (
            <div className="text-center py-8 text-slate-400 text-xs font-medium">
              <p>Connecting to AI voice assistant...</p>
              <p className="mt-1 text-slate-500 font-semibold">Say your travel details, e.g.: <i>"I want to go from Delhi to Mumbai tomorrow"</i></p>
            </div>
          ) : (
            messages.map((m, idx) => (
              <div
                key={idx}
                className={`flex gap-3 ${m.sender === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {m.sender === 'agent' && (
                  <div className="w-7 h-7 rounded-full bg-orange-100 border border-orange-200 text-orange-700 flex items-center justify-center shrink-0 mt-0.5 font-bold shadow-xs">
                    <Bot className="w-4 h-4" />
                  </div>
                )}

                <div
                  className={`max-w-[82%] rounded-2xl px-4 py-3 text-xs leading-relaxed font-medium shadow-xs ${
                    m.sender === 'user'
                      ? 'bg-emerald-600 text-white'
                      : 'bg-white text-slate-800 border border-slate-200'
                  }`}
                >
                  <p>{m.text}</p>
                  <span className={`block text-[9px] mt-1 text-right font-medium ${m.sender === 'user' ? 'text-emerald-200' : 'text-slate-400'}`}>
                    {m.time}
                  </span>
                </div>

                {m.sender === 'user' && (
                  <div className="w-7 h-7 rounded-full bg-emerald-100 border border-emerald-200 text-emerald-700 flex items-center justify-center shrink-0 mt-0.5 font-bold shadow-xs">
                    <User className="w-4 h-4" />
                  </div>
                )}
              </div>
            ))
          )}
          <div ref={transcriptEndRef} />
        </div>

        {/* Text Input Fallback (Talk or Type while on call) */}
        <div className="p-3 bg-white border-t border-slate-200 flex items-center gap-2">
          <input
            type="text"
            placeholder="Speak into microphone or type your message here..."
            value={inputFeedback}
            onChange={(e) => {
              setInputFeedback(e.target.value);
              clearSilenceTimer();
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && inputFeedback.trim()) {
                sendUserUtterance(inputFeedback.trim());
              }
            }}
            className="flex-1 bg-slate-50 text-slate-900 rounded-xl px-4 py-2.5 border border-slate-300 text-xs font-medium outline-none focus:bg-white focus:border-orange-500"
          />
          <button
            onClick={() => {
              if (inputFeedback.trim()) sendUserUtterance(inputFeedback.trim());
            }}
            className="p-2.5 rounded-xl bg-orange-600 hover:bg-orange-500 text-white transition-colors cursor-pointer shadow-sm"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>

        {/* Bottom Call Controls (Mute, Speaker, Hangup) */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-center gap-6">
          <button
            onClick={toggleMute}
            className={`p-3.5 rounded-2xl border transition-all cursor-pointer shadow-xs ${
              isMuted
                ? 'bg-rose-100 text-rose-700 border-rose-300'
                : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
            }`}
            title={isMuted ? "Unmute Microphone" : "Mute Microphone"}
          >
            {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
          </button>

          <button
            onClick={handleHangUp}
            className="p-4 rounded-full bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-600/30 transition-all hover:scale-105 active:scale-95 cursor-pointer"
            title="End Call"
          >
            <PhoneOff className="w-6 h-6" />
          </button>

          <button
            onClick={toggleSpeaker}
            className={`p-3.5 rounded-2xl border transition-all cursor-pointer shadow-xs ${
              !isSpeakerOn
                ? 'bg-rose-100 text-rose-700 border-rose-300'
                : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
            }`}
            title={isSpeakerOn ? "Mute Speaker" : "Unmute Speaker"}
          >
            {isSpeakerOn ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
          </button>
        </div>
      </div>
    </div>
  );
}
