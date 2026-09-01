/**
 * AeroSnap Audio Synthesizer (Web Audio API)
 * Studio-quality soft glass chimes, gentle camera snap & crystal tones
 * Replaces harsh motherboard/PowerShell beeps with pristine audio.
 */

class AeroSoundSynth {
  constructor() {
    this.ctx = null;
  }

  getAudioContext() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    return this.ctx;
  }

  /**
   * Soft, velvety camera shutter / crystal click for screenshots
   */
  playSnap() {
    try {
      const ctx = this.getAudioContext();
      if (!ctx) return;

      const now = ctx.currentTime;

      // 1. Soft acoustic body pop (Sine frequency drop)
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(480, now);
      osc.frequency.exponentialRampToValueAtTime(120, now + 0.07);

      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.07);

      // 2. Gentle crisp friction burst (Filtered noise click)
      const bufferSize = ctx.sampleRate * 0.025; // 25ms
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const output = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        output[i] = Math.random() * 2 - 1;
      }

      const whiteNoise = ctx.createBufferSource();
      whiteNoise.buffer = buffer;

      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(2400, now);
      filter.Q.setValueAtTime(3.0, now);

      const noiseGain = ctx.createGain();
      noiseGain.gain.setValueAtTime(0.06, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.025);

      whiteNoise.connect(filter);
      filter.connect(noiseGain);
      noiseGain.connect(ctx.destination);

      whiteNoise.start(now);
      whiteNoise.stop(now + 0.025);
    } catch (e) {
      console.warn('[AudioSynth] Error playing snap:', e);
    }
  }

  /**
   * Soft, warm ascending duo-bell chime for starting video recording
   */
  playVideoStart() {
    try {
      const ctx = this.getAudioContext();
      if (!ctx) return;

      const now = ctx.currentTime;
      // Warm upbeat acoustic bell chord: E5 (659Hz) -> A5 (880Hz)
      const notes = [
        { freq: 659.25, time: 0, dur: 0.28, vol: 0.07 },
        { freq: 880.00, time: 0.07, dur: 0.32, vol: 0.08 }
      ];

      notes.forEach(({ freq, time, dur, vol }) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const startTime = now + time;

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, startTime);

        // Soft attack to eliminate clicks, gentle exponential fadeout
        gain.gain.setValueAtTime(0.0001, startTime);
        gain.gain.linearRampToValueAtTime(vol, startTime + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, startTime + dur);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(startTime);
        osc.stop(startTime + dur + 0.02);
      });
    } catch (e) {
      console.warn('[AudioSynth] Error playing video start:', e);
    }
  }

  /**
   * Soft UI countdown tick
   */
  playTick() {
    try {
      const ctx = this.getAudioContext();
      if (!ctx) return;
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, now);
      gain.gain.setValueAtTime(0.04, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.04);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.04);
    } catch (e) {
      console.warn('[AudioSynth] Error playing tick:', e);
    }
  }

  /**
   * Soft, relaxing resolution chime for finishing & saving video
   */
  playVideoStop() {
    try {
      const ctx = this.getAudioContext();
      if (!ctx) return;

      const now = ctx.currentTime;
      // Soft calming completion chord: A5 (880Hz) -> E5 (659Hz) -> C#5 (554Hz)
      const notes = [
        { freq: 880.00, time: 0, dur: 0.22, vol: 0.06 },
        { freq: 659.25, time: 0.06, dur: 0.28, vol: 0.07 },
        { freq: 554.37, time: 0.12, dur: 0.40, vol: 0.08 }
      ];

      notes.forEach(({ freq, time, dur, vol }) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const startTime = now + time;

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, startTime);

        // Warm crystal decay envelope
        gain.gain.setValueAtTime(0.0001, startTime);
        gain.gain.linearRampToValueAtTime(vol, startTime + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, startTime + dur);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(startTime);
        osc.stop(startTime + dur + 0.02);
      });
    } catch (e) {
      console.warn('[AudioSynth] Error playing video stop:', e);
    }
  }
}

// Global singleton instance for overlay & renderer
window.SoundSynth = new AeroSoundSynth();
