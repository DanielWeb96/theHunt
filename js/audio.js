// ============================================================================
// PROCEDURAL SOUND SYSTEM (Web Audio API - Zero External Assets)
// ============================================================================

class SoundFX {
  constructor() {
    this.ctx = null;
    this.muted = false;
  }

  init() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === "suspended") {
      this.ctx.resume();
    }
  }

  playTone(freq, type, duration, gainStart = 0.15, gainEnd = 0.001) {
    if (!this.ctx || this.muted) return;
    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const now = this.ctx.currentTime;

      osc.type = type;
      osc.frequency.setValueAtTime(freq, now);

      gain.gain.setValueAtTime(gainStart, now);
      gain.gain.exponentialRampToValueAtTime(gainEnd, now + duration);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + duration);
    } catch (e) {
      // Audio autoplay policy fallback
    }
  }

  shootArrow() {
    this.playTone(600, "triangle", 0.08, 0.1);
  }

  shootCannon() {
    if (!this.ctx || this.muted) return;
    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const now = this.ctx.currentTime;

      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(140, now);
      osc.frequency.exponentialRampToValueAtTime(30, now + 0.25);

      gain.gain.setValueAtTime(0.25, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.25);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.25);
    } catch (e) {}
  }

  shootFrost() {
    this.playTone(880, "sine", 0.15, 0.08);
  }

  shootTesla() {
    this.playTone(440 + Math.random() * 200, "sawtooth", 0.1, 0.12);
  }

  build() {
    this.playTone(480, "sine", 0.1, 0.15);
    setTimeout(() => this.playTone(640, "sine", 0.12, 0.15), 60);
  }

  upgrade() {
    this.playTone(520, "triangle", 0.08, 0.15);
    setTimeout(() => this.playTone(780, "triangle", 0.15, 0.15), 70);
  }

  sell() {
    this.playTone(320, "sine", 0.12, 0.1);
  }

  enemyKilled() {
    this.playTone(350, "triangle", 0.06, 0.08);
  }

  baseDamaged() {
    this.playTone(110, "sawtooth", 0.3, 0.3);
  }

  waveStart() {
    this.playTone(400, "sine", 0.15, 0.15);
    setTimeout(() => this.playTone(600, "sine", 0.25, 0.2), 120);
  }

  defeat() {
    this.playTone(280, "sawtooth", 0.4, 0.25);
    setTimeout(() => this.playTone(180, "sawtooth", 0.6, 0.25), 300);
  }
}

export const sound = new SoundFX();
