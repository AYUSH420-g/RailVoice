// Synthesized Phone Sound Effects using Web Audio API

class SoundSynthesizer {
  constructor() {
    this.ctx = null;
  }

  _init() {
    if (!this.ctx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioContext();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  // Realistic phone ringback tone (400Hz + 450Hz)
  playRingbackTone() {
    try {
      this._init();
      const osc1 = this.ctx.createOscillator();
      const osc2 = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc1.frequency.value = 400;
      osc2.frequency.value = 450;
      gain.gain.value = 0.08;

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(this.ctx.destination);

      const now = this.ctx.currentTime;
      // 1.2s tone, 2s silence
      gain.gain.setValueAtTime(0.08, now);
      gain.gain.setValueAtTime(0, now + 1.2);

      osc1.start(now);
      osc2.start(now);
      osc1.stop(now + 1.25);
      osc2.stop(now + 1.25);
    } catch (e) {
      console.warn("Sound effect error:", e);
    }
  }

  // Call connected upbeat two-tone chime
  playConnectChime() {
    try {
      this._init();
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);

      osc.frequency.setValueAtTime(523.25, now); // C5
      osc.frequency.setValueAtTime(659.25, now + 0.15); // E5
      osc.frequency.setValueAtTime(783.99, now + 0.3); // G5

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.5);
    } catch (e) {
      console.warn("Connect chime error:", e);
    }
  }

  // Call hung-up / disconnect tone (480Hz + 620Hz busy signal)
  playDisconnectTone() {
    try {
      this._init();
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(425, now);
      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.45);
    } catch (e) {
      console.warn("Disconnect tone error:", e);
    }
  }

  // Celebration confirmation fanfare
  playSuccessFanfare() {
    try {
      this._init();
      const notes = [523.25, 659.25, 783.99, 1046.50]; // C-E-G-C high
      notes.forEach((freq, idx) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        const start = this.ctx.currentTime + (idx * 0.12);

        osc.type = 'triangle';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.15, start);
        gain.gain.exponentialRampToValueAtTime(0.001, start + 0.35);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(start);
        osc.stop(start + 0.4);
      });
    } catch (e) {
      console.warn("Success fanfare error:", e);
    }
  }
}

export const sounds = new SoundSynthesizer();
