// Solmar Nights — procedural sound. No audio files: every sound is
// synthesised with WebAudio (oscillators + filtered noise), so the game
// stays a handful of static files and plays fully offline.

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.master = null;
    this.musicGain = null;
    this.engineOsc = null;
    this.engineGain = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.musicTimer = null;
    this.musicStep = 0;
  }

  // Browsers require a user gesture before audio starts; main.js calls this
  // from the first click or keypress.
  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(this.ctx.destination);
    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 0.16;
    this.musicGain.connect(this.master);
    this.startEngineLoop();
    this.startMusic();
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.master) this.master.gain.value = muted ? 0 : 0.5;
  }

  // --- Continuous loops ----------------------------------------------------
  startEngineLoop() {
    const ctx = this.ctx;
    this.engineOsc = ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 55;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 320;
    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineOsc.connect(filter).connect(this.engineGain).connect(this.master);
    this.engineOsc.start();
  }

  // speed01: 0 (idle/off) to 1 (flat out). Called every frame while driving.
  setEngine(speed01, driving) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const target = driving ? 0.05 + speed01 * 0.06 : 0;
    this.engineGain.gain.setTargetAtTime(target, t, 0.08);
    this.engineOsc.frequency.setTargetAtTime(50 + speed01 * 130, t, 0.1);
  }

  setSiren(on) {
    if (!this.ctx) return;
    if (on && !this.sirenOsc) {
      const ctx = this.ctx;
      this.sirenOsc = ctx.createOscillator();
      this.sirenOsc.type = 'triangle';
      this.sirenOsc.frequency.value = 750;
      this.sirenGain = ctx.createGain();
      this.sirenGain.gain.value = 0.0;
      this.sirenOsc.connect(this.sirenGain).connect(this.master);
      this.sirenOsc.start();
      this.sirenGain.gain.setTargetAtTime(0.045, ctx.currentTime, 0.3);
      // Two-tone wail: alternate the frequency twice a second.
      this.sirenLfo = setInterval(() => {
        if (!this.sirenOsc) return;
        const f = this.sirenOsc.frequency.value > 700 ? 620 : 880;
        this.sirenOsc.frequency.setTargetAtTime(f, ctx.currentTime, 0.05);
      }, 450);
    } else if (!on && this.sirenOsc) {
      clearInterval(this.sirenLfo);
      const osc = this.sirenOsc;
      const gain = this.sirenGain;
      this.sirenOsc = null;
      gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.15);
      setTimeout(() => { try { osc.stop(); } catch { /* already stopped */ } }, 500);
    }
  }

  // --- One-shots -----------------------------------------------------------
  blip(freq, dur, type = 'sine', vol = 0.2) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(gain).connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  gunshot() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const dur = 0.14;
    const buffer = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 1800;
    const gain = ctx.createGain();
    gain.gain.value = 0.5;
    src.connect(filter).connect(gain).connect(this.master);
    src.start();
    this.blip(120, 0.08, 'square', 0.15);
  }

  pickup() {
    this.blip(880, 0.12, 'sine', 0.25);
    setTimeout(() => this.blip(1320, 0.18, 'sine', 0.25), 90);
  }

  missionComplete() {
    [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => this.blip(f, 0.22, 'triangle', 0.25), i * 110));
  }

  missionFailed() {
    [392, 330, 262].forEach((f, i) => setTimeout(() => this.blip(f, 0.25, 'triangle', 0.22), i * 140));
  }

  click() {
    this.blip(660, 0.06, 'sine', 0.15);
  }

  crash() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const dur = 0.2;
    const buffer = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length) * 0.7;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 500;
    src.connect(filter).connect(this.master);
    src.start();
  }

  // --- Music: a slow synthwave arpeggio over a soft pad --------------------
  startMusic() {
    // A minor, dreamy: Am – F – C – G, one chord a bar, 8 steps a bar.
    const chords = [
      [220.0, 261.63, 329.63],
      [174.61, 220.0, 261.63],
      [196.0, 246.94, 293.66],
      [164.81, 196.0, 246.94],
    ];
    const bass = [55.0, 43.65, 65.41, 49.0];
    this.musicTimer = setInterval(() => {
      if (!this.ctx || this.muted) return;
      const bar = Math.floor(this.musicStep / 8) % 4;
      const step = this.musicStep % 8;
      const chord = chords[bar];
      if (step === 0) {
        this.note(bass[bar], 1.9, 'sine', 0.16, this.musicGain);
        chord.forEach((f) => this.note(f, 1.9, 'triangle', 0.05, this.musicGain));
      }
      // Arpeggio note: chord tone, octave up, alternating.
      const tone = chord[step % 3] * 2;
      this.note(tone, 0.22, 'sine', 0.07, this.musicGain);
      this.musicStep++;
    }, 240);
  }

  note(freq, dur, type, vol, dest) {
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(vol, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(gain).connect(dest || this.master);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }
}
