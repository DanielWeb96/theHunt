// ============================================================================
// PROCEDURAL AUDIO ENGINE - APOCALYPTIC ZOMBIE WARFARE (Web Audio API)
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
    } catch (e) {}
  }

  shootSentry() {
    // Sharp metallic crack of a minigun burst
    this.playTone(320 + Math.random() * 80, "sawtooth", 0.05, 0.12);
  }

  shootFlame() {
    // Roar of napalm
    if (!this.ctx || this.muted) return;
    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const now = this.ctx.currentTime;

      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(90, now);
      osc.frequency.exponentialRampToValueAtTime(40, now + 0.3);

      gain.gain.setValueAtTime(0.18, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.3);
    } catch (e) {}
  }

  shootCryo() {
    this.playTone(740, "sine", 0.14, 0.08);
  }

  shootRocket() {
    this.playTone(180, "sawtooth", 0.18, 0.2);
  }

  rocketExplosion() {
    if (!this.ctx || this.muted) return;
    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const now = this.ctx.currentTime;

      osc.type = "triangle";
      osc.frequency.setValueAtTime(120, now);
      osc.frequency.exponentialRampToValueAtTime(25, now + 0.45);

      gain.gain.setValueAtTime(0.35, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.45);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.45);
    } catch (e) {}
  }

  zombieGroan() {
    // Low zombie growl
    if (!this.ctx || this.muted || Math.random() > 0.4) return;
    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const now = this.ctx.currentTime;

      osc.type = "sawtooth";
      const startF = 90 + Math.random() * 30;
      osc.frequency.setValueAtTime(startF, now);
      osc.frequency.linearRampToValueAtTime(startF - 35, now + 0.4);

      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.4);
    } catch (e) {}
  }

  zombieDeath() {
    this.playTone(180, "triangle", 0.08, 0.1);
  }

  buildTurret() {
    this.playTone(450, "square", 0.07, 0.12);
    setTimeout(() => this.playTone(600, "square", 0.1, 0.12), 70);
  }

  upgradeTurret() {
    this.playTone(550, "sine", 0.08, 0.12);
    setTimeout(() => this.playTone(850, "sine", 0.14, 0.14), 70);
  }

  dismantle() {
    this.playTone(280, "sine", 0.1, 0.1);
  }

  waveStart() {
    // Air raid siren tone
    this.playTone(380, "sawtooth", 0.25, 0.2);
    setTimeout(() => this.playTone(540, "sawtooth", 0.4, 0.22), 220);
  }

  bunkerBreach() {
    this.playTone(100, "sawtooth", 0.35, 0.3);
  }

  defeat() {
    this.playTone(240, "sawtooth", 0.5, 0.3);
    setTimeout(() => this.playTone(140, "sawtooth", 0.7, 0.3), 350);
  }
}

export const sound = new SoundFX();
