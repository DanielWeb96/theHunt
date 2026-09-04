// ============================================================================
// RETRO 16-BIT AUDIO SYNTHESIZER & SOUNDTRACK MANAGER (Web Audio API)
// ============================================================================

import { SoundtrackEngine } from "./soundtrack.js";

class SoundFX {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.sfxGain = null;
    this.musicGain = null;
    this.soundtrack = null;

    // Volume levels (0.0 to 1.0)
    this.masterVolume = 0.8;
    this.musicVolume = 0.65;
    this.sfxVolume = 0.8;
    this.muted = false;

    // Listeners for audio UI updates
    this.listeners = [];

    // Load persisted settings
    this.loadSettings();
  }

  init() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();

        // 1. Master Gain Node
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.setValueAtTime(this.muted ? 0 : this.masterVolume, this.ctx.currentTime);
        this.masterGain.connect(this.ctx.destination);

        // 2. SFX Gain Node
        this.sfxGain = this.ctx.createGain();
        this.sfxGain.gain.setValueAtTime(this.sfxVolume, this.ctx.currentTime);
        this.sfxGain.connect(this.masterGain);

        // 3. Music Gain Node
        this.musicGain = this.ctx.createGain();
        this.musicGain.gain.setValueAtTime(this.musicVolume, this.ctx.currentTime);
        this.musicGain.connect(this.masterGain);

        // 4. Procedural Soundtrack Engine
        this.soundtrack = new SoundtrackEngine(this.ctx, this.musicGain);
        this.soundtrack.init();
      }
    }

    if (this.ctx && this.ctx.state === "suspended") {
      this.ctx.resume();
    }
  }

  // --------------------------------------------------------------------------
  // VOLUME & MUTE CONTROLS
  // --------------------------------------------------------------------------
  setMasterVolume(val) {
    this.masterVolume = Math.max(0, Math.min(1, parseFloat(val)));
    if (this.ctx && this.masterGain && !this.muted) {
      this.masterGain.gain.setValueAtTime(this.masterVolume, this.ctx.currentTime);
    }
    this.saveSettings();
    this.notifyListeners();
  }

  setMusicVolume(val) {
    this.musicVolume = Math.max(0, Math.min(1, parseFloat(val)));
    if (this.ctx && this.musicGain) {
      this.musicGain.gain.setValueAtTime(this.musicVolume, this.ctx.currentTime);
    }
    this.saveSettings();
    this.notifyListeners();
  }

  setSfxVolume(val) {
    this.sfxVolume = Math.max(0, Math.min(1, parseFloat(val)));
    if (this.ctx && this.sfxGain) {
      this.sfxGain.gain.setValueAtTime(this.sfxVolume, this.ctx.currentTime);
    }
    this.saveSettings();
    this.notifyListeners();
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.ctx && this.masterGain) {
      const target = this.muted ? 0 : this.masterVolume;
      this.masterGain.gain.setValueAtTime(target, this.ctx.currentTime);
    }
    this.saveSettings();
    this.notifyListeners();
    return this.muted;
  }

  isMuted() {
    return this.muted;
  }

  saveSettings() {
    try {
      const data = {
        master: this.masterVolume,
        music: this.musicVolume,
        sfx: this.sfxVolume,
        muted: this.muted,
        track: this.soundtrack ? this.soundtrack.currentTrack : "dynamic"
      };
      localStorage.setItem("deadzone_audio_settings", JSON.stringify(data));
    } catch (e) {}
  }

  loadSettings() {
    try {
      const saved = localStorage.getItem("deadzone_audio_settings");
      if (saved) {
        const data = JSON.parse(saved);
        if (typeof data.master === "number") this.masterVolume = data.master;
        if (typeof data.music === "number") this.musicVolume = data.music;
        if (typeof data.sfx === "number") this.sfxVolume = data.sfx;
        if (typeof data.muted === "boolean") this.muted = data.muted;
        this.initialTrack = data.track || "dynamic";
      }
    } catch (e) {}
  }

  onSettingsChanged(cb) {
    this.listeners.push(cb);
  }

  notifyListeners() {
    for (const cb of this.listeners) {
      try { cb(); } catch (e) {}
    }
  }

  // --------------------------------------------------------------------------
  // SOUNDTRACK PLAYBACK & DYNAMIC INTENSITY
  // --------------------------------------------------------------------------
  startMusic(trackKey = null) {
    this.init();
    if (!this.soundtrack) return;
    const track = trackKey || this.initialTrack || "dynamic";
    this.soundtrack.start(track);
    this.saveSettings();
    this.notifyListeners();
  }

  stopMusic() {
    if (this.soundtrack) {
      this.soundtrack.stop();
      this.notifyListeners();
    }
  }

  setMusicTrack(trackKey) {
    this.init();
    if (this.soundtrack) {
      this.soundtrack.setTrack(trackKey);
      this.saveSettings();
      this.notifyListeners();
    }
  }

  setCombatIntensity(level) {
    if (this.soundtrack) {
      this.soundtrack.setIntensity(level);
    }
  }

  isMusicPlaying() {
    return this.soundtrack ? this.soundtrack.isPlaying : false;
  }

  getCurrentTrack() {
    return this.soundtrack ? this.soundtrack.currentTrack : (this.initialTrack || "dynamic");
  }

  // --------------------------------------------------------------------------
  // SOUND EFFECTS (SFX) SYNTHESIS
  // --------------------------------------------------------------------------
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
      gain.connect(this.sfxGain || this.masterGain || this.ctx.destination);

      osc.start(now);
      osc.stop(now + duration);
    } catch (e) {}
  }

  shootAssault() {
    this.playTone(340 + Math.random() * 60, "sawtooth", 0.06, 0.1);
  }

  shootSniper() {
    this.playTone(550, "square", 0.18, 0.22);
    setTimeout(() => this.playTone(180, "sawtooth", 0.15, 0.12), 40);
  }

  shootShotgun() {
    this.playTone(160, "sawtooth", 0.14, 0.25);
    setTimeout(() => this.playTone(80, "triangle", 0.1, 0.2), 30);
  }

  shootSMG() {
    this.playTone(480 + Math.random() * 80, "square", 0.04, 0.07);
  }

  reload() {
    this.playTone(500, "sine", 0.05, 0.08);
    setTimeout(() => this.playTone(700, "sine", 0.08, 0.1), 120);
  }

  grenadeExplode() {
    if (!this.ctx || this.muted) return;
    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const now = this.ctx.currentTime;

      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(140, now);
      osc.frequency.exponentialRampToValueAtTime(20, now + 0.5);

      gain.gain.setValueAtTime(0.35, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.5);

      osc.connect(gain);
      gain.connect(this.sfxGain || this.masterGain || this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.5);
    } catch (e) {}
  }

  deployTurret() {
    this.playTone(400, "square", 0.06, 0.1);
    setTimeout(() => this.playTone(600, "square", 0.08, 0.1), 80);
    setTimeout(() => this.playTone(800, "sine", 0.1, 0.1), 160);
  }

  heal() {
    this.playTone(440, "sine", 0.1, 0.15);
    setTimeout(() => this.playTone(660, "sine", 0.12, 0.15), 90);
    setTimeout(() => this.playTone(880, "sine", 0.18, 0.15), 180);
  }

  zombieGroan() {
    if (!this.ctx || this.muted || Math.random() > 0.3) return;
    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const now = this.ctx.currentTime;

      osc.type = "sawtooth";
      const f = 85 + Math.random() * 25;
      osc.frequency.setValueAtTime(f, now);
      osc.frequency.linearRampToValueAtTime(f - 30, now + 0.35);

      gain.gain.setValueAtTime(0.07, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

      osc.connect(gain);
      gain.connect(this.sfxGain || this.masterGain || this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.35);
    } catch (e) {}
  }

  bulletWallHit() {
    this.playTone(110 + Math.random() * 40, "triangle", 0.04, 0.08);
  }

  zombieHit() {
    this.playTone(220, "triangle", 0.05, 0.08);
  }

  zombieDeath() {
    this.playTone(130, "sawtooth", 0.08, 0.09);
  }

  playerHurt() {
    this.playTone(120, "sawtooth", 0.18, 0.25);
  }

  waveStart() {
    this.playTone(300, "sawtooth", 0.2, 0.2);
    setTimeout(() => this.playTone(450, "sawtooth", 0.3, 0.2), 160);
    setTimeout(() => this.playTone(600, "sawtooth", 0.45, 0.25), 320);
  }

  defeat() {
    this.playTone(240, "sawtooth", 0.4, 0.3);
    setTimeout(() => this.playTone(160, "sawtooth", 0.6, 0.3), 300);
  }
}

export const sound = new SoundFX();
