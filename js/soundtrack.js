// ============================================================================
// 16-BIT RETRO SYNTH SOUNDTRACK ENGINE (Web Audio API Procedural Sequencer)
// ============================================================================

// Note frequencies (Hz) for multi-octave synthesis
export const NOTE = {
  // Octave 1
  C1: 32.70, "C#1": 34.65, D1: 36.71, "D#1": 38.89, Eb1: 38.89, E1: 41.20, F1: 43.65, "F#1": 46.25, G1: 49.00, "G#1": 51.91, Ab1: 51.91, A1: 55.00, "A#1": 58.27, Bb1: 58.27, B1: 61.74,
  // Octave 2
  C2: 65.41, "C#2": 69.30, D2: 73.42, "D#2": 77.78, Eb2: 77.78, E2: 82.41, F2: 87.31, "F#2": 92.50, G2: 98.00, "G#2": 103.83, Ab2: 103.83, A2: 110.00, "A#2": 116.54, Bb2: 116.54, B2: 123.47,
  // Octave 3
  C3: 130.81, "C#3": 138.59, D3: 146.83, "D#3": 155.56, Eb3: 155.56, E3: 164.81, F3: 174.61, "F#3": 185.00, G3: 196.00, "G#3": 207.65, Ab3: 207.65, A3: 220.00, "A#3": 233.08, Bb3: 233.08, B3: 246.94,
  // Octave 4
  C4: 261.63, "C#4": 277.18, D4: 293.66, "D#4": 311.13, Eb4: 311.13, E4: 329.63, F4: 349.23, "F#4": 369.99, G4: 392.00, "G#4": 415.30, Ab4: 415.30, A4: 440.00, "A#4": 466.16, Bb4: 466.16, B4: 493.88,
  // Octave 5
  C5: 523.25, "C#5": 554.37, D5: 587.33, "D#5": 622.25, Eb5: 622.25, E5: 659.25, F5: 698.46, "F#5": 739.99, G5: 783.99, "G#5": 830.61, Ab5: 830.61, A5: 880.00, "A#5": 932.33, Bb5: 932.33, B5: 987.77,
  // Octave 6
  C6: 1046.50, D6: 1174.66, E6: 1318.51, F6: 1396.91, G6: 1567.98, A6: 1760.00
};

export class SoundtrackEngine {
  constructor(audioContext, musicDestinationNode) {
    this.ctx = audioContext;
    this.dest = musicDestinationNode;

    // Track selection & playback state
    this.currentTrack = "dynamic"; // "dynamic" | "overdrive" | "nightfall" | "quarantine" | "off"
    this.isPlaying = false;
    this.intensity = 0; // 0 = calm/ambient, 1 = combat wave, 2 = intense horde

    // Sequencer Clock
    this.bpm = 124;
    this.currentStep = 0; // 0 to 63 (4 bars of 16th notes per pattern)
    this.currentPattern = 0; // 0 to 3 (4 patterns = 16 bars per song loop)
    this.nextNoteTime = 0.0;
    this.scheduleAheadTime = 0.12; // lookahead schedule buffer (seconds)
    this.timerId = null;

    // Stem Master Gains
    this.masterMusicGain = null;
    this.bassGain = null;
    this.drumsGain = null;
    this.padGain = null;
    this.arpGain = null;
    this.leadGain = null;

    // Audio Buffers
    this.noiseBuffer = null;

    // Echo Delay Node for arpeggios
    this.delayNode = null;
    this.delayFeedback = null;
    this.delayFilter = null;

    // Track metadata
    this.tracks = {
      dynamic: { name: "⚡ Dynamic (Adapts to Waves)", bpm: 124 },
      overdrive: { name: "💀 Dead Zone Overdrive (Action)", bpm: 124 },
      nightfall: { name: "🌙 Nightfall Outpost (Suspense)", bpm: 102 },
      quarantine: { name: "⚡ Neon Quarantine (Cyberpunk)", bpm: 134 },
      off: { name: "⏹ Music Off", bpm: 120 }
    };
  }

  init() {
    if (!this.ctx) return;

    // Build Stem Bus Graph
    if (!this.masterMusicGain) {
      this.masterMusicGain = this.ctx.createGain();
      this.masterMusicGain.gain.setValueAtTime(1.0, this.ctx.currentTime);
      this.masterMusicGain.connect(this.dest);

      // Stems
      this.bassGain = this.ctx.createGain();
      this.drumsGain = this.ctx.createGain();
      this.padGain = this.ctx.createGain();
      this.arpGain = this.ctx.createGain();
      this.leadGain = this.ctx.createGain();

      this.bassGain.connect(this.masterMusicGain);
      this.drumsGain.connect(this.masterMusicGain);
      this.padGain.connect(this.masterMusicGain);
      this.arpGain.connect(this.masterMusicGain);
      this.leadGain.connect(this.masterMusicGain);

      // Create Delay Network for Arps
      this.delayNode = this.ctx.createDelay(1.0);
      this.delayNode.delayTime.setValueAtTime(0.18, this.ctx.currentTime);
      this.delayFeedback = this.ctx.createGain();
      this.delayFeedback.gain.setValueAtTime(0.32, this.ctx.currentTime);
      this.delayFilter = this.ctx.createBiquadFilter();
      this.delayFilter.type = "lowpass";
      this.delayFilter.frequency.setValueAtTime(2400, this.ctx.currentTime);

      // Delay loop: arp -> delay -> filter -> feedback -> delay
      this.delayNode.connect(this.delayFilter);
      this.delayFilter.connect(this.delayFeedback);
      this.delayFeedback.connect(this.delayNode);
      this.delayFilter.connect(this.masterMusicGain);

      // Pre-generate White Noise Buffer (2 seconds)
      const bufferSize = this.ctx.sampleRate * 2;
      this.noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = this.noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }
    }

    this.updateStemGains();
  }

  // --------------------------------------------------------------------------
  // SEQUENCER PLAYBACK CONTROLS
  // --------------------------------------------------------------------------
  start(trackKey = null) {
    if (trackKey) this.currentTrack = trackKey;
    if (this.currentTrack === "off") {
      this.stop();
      return;
    }

    this.init();
    if (this.isPlaying) return;

    this.isPlaying = true;
    this.currentStep = 0;
    this.currentPattern = 0;
    this.nextNoteTime = this.ctx.currentTime + 0.05;

    // Apply BPM for chosen track
    const trackDef = this.tracks[this.currentTrack] || this.tracks.dynamic;
    this.bpm = trackDef.bpm;

    // Start lookahead scheduler
    this.scheduler();
  }

  stop() {
    this.isPlaying = false;
    if (this.timerId) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
  }

  setTrack(trackKey) {
    if (!this.tracks[trackKey]) return;
    this.currentTrack = trackKey;
    if (trackKey === "off") {
      this.stop();
      return;
    }
    const trackDef = this.tracks[trackKey];
    this.bpm = trackDef.bpm;
    this.updateStemGains();
    if (!this.isPlaying) {
      this.start();
    }
  }

  setIntensity(level) {
    // 0 = calm exploration, 1 = wave combat, 2 = intense horde / critical HP
    if (this.intensity === level) return;
    this.intensity = level;
    this.updateStemGains();
  }

  updateStemGains() {
    if (!this.ctx || !this.bassGain) return;
    const now = this.ctx.currentTime;
    const rampTime = 0.4;

    if (this.currentTrack === "dynamic") {
      if (this.intensity === 0) {
        // Calm exploration / night incoming / daylight
        this.drumsGain.gain.linearRampToValueAtTime(0.18, now + rampTime);
        this.bassGain.gain.linearRampToValueAtTime(0.55, now + rampTime);
        this.padGain.gain.linearRampToValueAtTime(0.85, now + rampTime);
        this.arpGain.gain.linearRampToValueAtTime(0.40, now + rampTime);
        this.leadGain.gain.linearRampToValueAtTime(0.001, now + rampTime);
      } else if (this.intensity === 1) {
        // Active wave / combat
        this.drumsGain.gain.linearRampToValueAtTime(0.92, now + rampTime);
        this.bassGain.gain.linearRampToValueAtTime(0.95, now + rampTime);
        this.padGain.gain.linearRampToValueAtTime(0.65, now + rampTime);
        this.arpGain.gain.linearRampToValueAtTime(0.80, now + rampTime);
        this.leadGain.gain.linearRampToValueAtTime(0.85, now + rampTime);
      } else {
        // Intense horde / low health / boss
        this.drumsGain.gain.linearRampToValueAtTime(1.0, now + rampTime);
        this.bassGain.gain.linearRampToValueAtTime(1.0, now + rampTime);
        this.padGain.gain.linearRampToValueAtTime(0.60, now + rampTime);
        this.arpGain.gain.linearRampToValueAtTime(0.95, now + rampTime);
        this.leadGain.gain.linearRampToValueAtTime(0.95, now + rampTime);
      }
    } else if (this.currentTrack === "overdrive") {
      // Full power action track
      this.drumsGain.gain.linearRampToValueAtTime(0.95, now + rampTime);
      this.bassGain.gain.linearRampToValueAtTime(0.95, now + rampTime);
      this.padGain.gain.linearRampToValueAtTime(0.65, now + rampTime);
      this.arpGain.gain.linearRampToValueAtTime(0.85, now + rampTime);
      this.leadGain.gain.linearRampToValueAtTime(0.90, now + rampTime);
    } else if (this.currentTrack === "nightfall") {
      // Atmospheric horror
      this.drumsGain.gain.linearRampToValueAtTime(0.45, now + rampTime);
      this.bassGain.gain.linearRampToValueAtTime(0.70, now + rampTime);
      this.padGain.gain.linearRampToValueAtTime(1.00, now + rampTime);
      this.arpGain.gain.linearRampToValueAtTime(0.60, now + rampTime);
      this.leadGain.gain.linearRampToValueAtTime(0.45, now + rampTime);
    } else if (this.currentTrack === "quarantine") {
      // Fast arcade chiptune
      this.drumsGain.gain.linearRampToValueAtTime(0.90, now + rampTime);
      this.bassGain.gain.linearRampToValueAtTime(0.95, now + rampTime);
      this.padGain.gain.linearRampToValueAtTime(0.50, now + rampTime);
      this.arpGain.gain.linearRampToValueAtTime(1.00, now + rampTime);
      this.leadGain.gain.linearRampToValueAtTime(0.85, now + rampTime);
    }
  }

  // --------------------------------------------------------------------------
  // HIGH-PRECISION LOOKAHEAD SEQUENCER (W3C Standard)
  // --------------------------------------------------------------------------
  scheduler() {
    if (!this.isPlaying) return;

    while (this.nextNoteTime < this.ctx.currentTime + this.scheduleAheadTime) {
      this.scheduleStep(this.currentStep, this.currentPattern, this.nextNoteTime);
      this.advanceStep();
    }

    this.timerId = setTimeout(() => this.scheduler(), 25);
  }

  advanceStep() {
    const secondsPerBeat = 60.0 / this.bpm;
    this.nextNoteTime += 0.25 * secondsPerBeat; // 16th note duration

    this.currentStep++;
    if (this.currentStep >= 64) { // 4 bars = 64 sixteenth notes
      this.currentStep = 0;
      this.currentPattern = (this.currentPattern + 1) % 4; // 4 patterns = 16 bars total
    }
  }

  scheduleStep(step, pattern, time) {
    const effectiveTrack = (this.currentTrack === "dynamic") ? "overdrive" : this.currentTrack;

    if (effectiveTrack === "overdrive") {
      this.playOverdriveStep(step, pattern, time);
    } else if (effectiveTrack === "nightfall") {
      this.playNightfallStep(step, pattern, time);
    } else if (effectiveTrack === "quarantine") {
      this.playQuarantineStep(step, pattern, time);
    }
  }

  // --------------------------------------------------------------------------
  // TRACK 1: "DEAD ZONE OVERDRIVE" (Dark Synthwave Action)
  // Key: D minor (Dm -> Bb -> Gm -> A)
  // --------------------------------------------------------------------------
  playOverdriveStep(step, pattern, time) {
    const bar = Math.floor(step / 16);
    const stepInBar = step % 16;
    const isCalm = (this.currentTrack === "dynamic" && this.intensity === 0);

    // Current Chord by Bar:
    let rootBass = NOTE.D2;
    let chordPad = [NOTE.D3, NOTE.F3, NOTE.A3, NOTE.D4];
    let arpScale = [NOTE.D3, NOTE.F3, NOTE.A3, NOTE.D4, NOTE.F4, NOTE.A4];

    if (bar === 1) {
      if (pattern === 1 || pattern === 3) {
        rootBass = NOTE.F2;
        chordPad = [NOTE.F2, NOTE.A2, NOTE.C3, NOTE.F3];
        arpScale = [NOTE.C3, NOTE.F3, NOTE.A3, NOTE.C4, NOTE.F4, NOTE.A4];
      }
    } else if (bar === 2) {
      rootBass = NOTE.Bb1;
      chordPad = [NOTE.Bb2, NOTE.D3, NOTE.F3, NOTE.Bb3];
      arpScale = [NOTE.Bb2, NOTE.D3, NOTE.F3, NOTE.Bb3, NOTE.D4, NOTE.F4];
    } else if (bar === 3) {
      if (pattern % 2 === 1) {
        rootBass = NOTE.A1;
        chordPad = [NOTE.A2, NOTE["C#3"], NOTE.E3, NOTE.A3];
        arpScale = [NOTE.A2, NOTE["C#3"], NOTE.E3, NOTE.G3, NOTE.A3, NOTE["C#4"]];
      } else {
        rootBass = NOTE.G1;
        chordPad = [NOTE.G2, NOTE.Bb2, NOTE.D3, NOTE.G3];
        arpScale = [NOTE.G2, NOTE.Bb2, NOTE.D3, NOTE.G3, NOTE.Bb3, NOTE.D4];
      }
    }

    // 1. DRUMS (Kick, Snare, Hi-Hat, Crash)
    if (!isCalm) {
      // 4-on-the-floor kick + syncopated accents
      if (stepInBar === 0 || stepInBar === 8 || (stepInBar === 10 && pattern % 2 === 1) || (stepInBar === 14 && this.intensity === 2)) {
        this.synthKick(time);
      }
      // Snare on beats 2 and 4 (steps 4 and 12)
      if (stepInBar === 4 || stepInBar === 12) {
        this.synthSnare(time);
      }
      // Snare ghost roll on bar 3 turnaround
      if (bar === 3 && (stepInBar === 14 || stepInBar === 15)) {
        this.synthSnare(time, 0.45);
      }
      // 16th Hi-Hats
      if (stepInBar % 2 === 0) {
        const isOpen = (stepInBar === 2 || stepInBar === 6 || stepInBar === 10 || stepInBar === 14);
        this.synthHiHat(time, isOpen);
      }
      // Crash cymbal at start of phrase
      if (step === 0 && (pattern === 0 || pattern === 2)) {
        this.synthCrash(time);
      }
    } else {
      // Calm ambient hi-hat pulse
      if (stepInBar === 0 || stepInBar === 8) {
        this.synthHiHat(time, false, 0.15);
      }
      // Soft sub-thud on bar downbeats
      if (stepInBar === 0 && (bar === 0 || bar === 2)) {
        this.synthKick(time, 0.4);
      }
    }

    // 2. BASSLINE (Driving 16th Synth Gallop)
    if (isCalm) {
      // Sustained sub drone on step 0
      if (stepInBar === 0) {
        this.synthBassNote(rootBass, time, 0.8, true);
      }
    } else {
      // Syncopated 16th action bass: [Root, Root, Octave, Root, ...]
      const isNote = (stepInBar % 2 === 0) || (stepInBar === 3) || (stepInBar === 7) || (stepInBar === 11);
      if (isNote) {
        const isOctave = (stepInBar === 2 || stepInBar === 10);
        const freq = isOctave ? rootBass * 2 : rootBass;
        this.synthBassNote(freq, time, 0.13);
      }
    }

    // 3. ATMOSPHERIC PAD CHORDS (Sustained on step 0 of each bar)
    if (stepInBar === 0) {
      const padDuration = (60 / this.bpm) * 3.8;
      this.synthPadChord(chordPad, time, padDuration);
    }

    // 4. HYPNOTIC ARPEGGIO (16th notes dancing across chord tones)
    const arpIdx = (stepInBar + (bar * 2)) % arpScale.length;
    const arpFreq = arpScale[arpIdx];
    this.synthArpNote(arpFreq, time);

    // 5. LEAD MELODY MOTIF (Plays during combat / active wave in patterns 1 and 2)
    if (!isCalm && (pattern === 1 || pattern === 2 || this.intensity === 2)) {
      this.scheduleLeadMotif(step, pattern, time);
    }
  }

  scheduleLeadMotif(step, pattern, time) {
    // 64-step melody theme (4 bars)
    const melodyMap = {
      0:  { note: NOTE.D4, dur: 0.35 },
      4:  { note: NOTE.F4, dur: 0.20 },
      6:  { note: NOTE.A4, dur: 0.45 },
      12: { note: NOTE.G4, dur: 0.30 },
      16: { note: NOTE.F4, dur: 0.35 },
      20: { note: NOTE.E4, dur: 0.25 },
      22: { note: NOTE.D4, dur: 0.60 },
      32: { note: NOTE.A4, dur: 0.35 },
      36: { note: NOTE.C5, dur: 0.35 },
      40: { note: NOTE.D5, dur: 0.50 },
      46: { note: NOTE.E5, dur: 0.25 },
      48: { note: NOTE.F5, dur: 0.35 },
      52: { note: NOTE.E5, dur: 0.25 },
      56: { note: NOTE.D5, dur: 0.70 }
    };

    if (melodyMap[step]) {
      const item = melodyMap[step];
      this.synthLeadNote(item.note, time, item.dur);
    }
  }

  // --------------------------------------------------------------------------
  // TRACK 2: "NIGHTFALL OUTPOST" (Survival Horror / Suspense)
  // Key: C minor (Cm -> Ab -> Fm -> G7)
  // --------------------------------------------------------------------------
  playNightfallStep(step, pattern, time) {
    const bar = Math.floor(step / 16);
    const stepInBar = step % 16;

    let root = NOTE.C2;
    let padChord = [NOTE.C2, NOTE.Eb2, NOTE.G2, NOTE.C3];
    let bellNotes = [NOTE.C4, NOTE.Eb4, NOTE.G4, NOTE.Ab4, NOTE.C5];

    if (bar === 1) {
      root = NOTE.Ab1;
      padChord = [NOTE.Ab1, NOTE.C2, NOTE.Eb2, NOTE.Ab2];
      bellNotes = [NOTE.Ab3, NOTE.C4, NOTE.Eb4, NOTE.Ab4, NOTE.C5];
    } else if (bar === 2) {
      root = NOTE.F1;
      padChord = [NOTE.F1, NOTE.Ab1, NOTE.C2, NOTE.F2];
      bellNotes = [NOTE.F3, NOTE.Ab3, NOTE.C4, NOTE.F4, NOTE.Ab4];
    } else if (bar === 3) {
      root = NOTE.G1;
      padChord = [NOTE.G1, NOTE.B1, NOTE.D2, NOTE.G2];
      bellNotes = [NOTE.G3, NOTE.B3, NOTE.D4, NOTE.F4, NOTE.G4];
    }

    // Heavy sparse kick on step 0 and 10
    if (stepInBar === 0 || (stepInBar === 10 && bar % 2 === 1)) {
      this.synthKick(time, 0.8);
    }
    // Deep reverb snare on step 8
    if (stepInBar === 8) {
      this.synthSnare(time, 0.7);
    }
    // Metallic slow tick hi-hat on 4, 8, 12
    if (stepInBar === 4 || stepInBar === 8 || stepInBar === 12) {
      this.synthHiHat(time, false, 0.35);
    }

    // Brooding Sub Bass pulse
    if (stepInBar === 0 || stepInBar === 6) {
      this.synthBassNote(root, time, 0.28, true);
    }

    // Dark swelling horror pad
    if (stepInBar === 0) {
      this.synthPadChord(padChord, time, (60 / this.bpm) * 3.9);
    }

    // Creeping bell arpeggios (sparse 8th notes)
    if (stepInBar % 4 === 0) {
      const bIdx = (stepInBar / 4 + bar) % bellNotes.length;
      this.synthArpNote(bellNotes[bIdx], time, 0.4);
    }

    // Eerie lead drone
    if (step === 0 && pattern % 2 === 1) {
      this.synthLeadNote(NOTE.C5, time, 1.8);
    } else if (step === 32 && pattern % 2 === 1) {
      this.synthLeadNote(NOTE.G4, time, 1.4);
    }
  }

  // --------------------------------------------------------------------------
  // TRACK 3: "NEON QUARANTINE" (Fast Cyberpunk Arcade)
  // Key: A minor (Am -> F -> C -> G)
  // --------------------------------------------------------------------------
  playQuarantineStep(step, pattern, time) {
    const bar = Math.floor(step / 16);
    const stepInBar = step % 16;

    let root = NOTE.A1;
    let chord = [NOTE.A2, NOTE.C3, NOTE.E3, NOTE.A3];
    let arpNotes = [NOTE.A3, NOTE.C4, NOTE.E4, NOTE.A4, NOTE.C5, NOTE.E5];

    if (bar === 1) {
      root = NOTE.F1;
      chord = [NOTE.F2, NOTE.A2, NOTE.C3, NOTE.F3];
      arpNotes = [NOTE.F3, NOTE.A3, NOTE.C4, NOTE.F4, NOTE.A4, NOTE.C5];
    } else if (bar === 2) {
      root = NOTE.F1;
      chord = [NOTE.C2, NOTE.E2, NOTE.G2, NOTE.C3];
      arpNotes = [NOTE.C3, NOTE.E3, NOTE.G3, NOTE.C4, NOTE.E4, NOTE.G4];
    } else if (bar === 3) {
      root = NOTE.G1;
      chord = [NOTE.G2, NOTE.B2, NOTE.D3, NOTE.G3];
      arpNotes = [NOTE.G3, NOTE.B3, NOTE.D4, NOTE.G4, NOTE.B4, NOTE.D5];
    }

    // Rapid electro kick on 0, 4, 8, 12
    if (stepInBar % 4 === 0) {
      this.synthKick(time, 0.95);
    }
    // Snare clap on 4 and 12
    if (stepInBar === 4 || stepInBar === 12) {
      this.synthSnare(time, 0.85);
    }
    // High-tempo 16th hats
    this.synthHiHat(time, stepInBar % 4 === 2, 0.3);

    // Bumping 16th bass
    if (stepInBar % 2 === 0 || stepInBar === 7 || stepInBar === 15) {
      const f = (stepInBar === 2 || stepInBar === 10) ? root * 2 : root;
      this.synthBassNote(f, time, 0.1);
    }

    // Pad
    if (stepInBar === 0) {
      this.synthPadChord(chord, time, (60 / this.bpm) * 3.8);
    }

    // Fast 16th arpeggios
    const aNote = arpNotes[stepInBar % arpNotes.length];
    this.synthArpNote(aNote, time, 0.08);

    // Glitchy lead burst
    if (bar === 2 && stepInBar === 0) {
      this.synthLeadNote(NOTE.E5, time, 0.25);
    } else if (bar === 2 && stepInBar === 4) {
      this.synthLeadNote(NOTE.G5, time, 0.25);
    }
  }

  // --------------------------------------------------------------------------
  // SYNTHESIZER VOICES & SOUND DESIGN
  // --------------------------------------------------------------------------

  // 1. Synth Kick Drum (Pitch-dropping sine wave + transient punch)
  synthKick(time, gainScale = 1.0) {
    if (!this.ctx || !this.drumsGain) return;
    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = "sine";
      osc.frequency.setValueAtTime(155, time);
      osc.frequency.exponentialRampToValueAtTime(36, time + 0.09);

      gain.gain.setValueAtTime(0.95 * gainScale, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.22);

      osc.connect(gain);
      gain.connect(this.drumsGain);

      osc.start(time);
      osc.stop(time + 0.23);
    } catch (e) {}
  }

  // 2. Retro Gated Snare (Triangle tonal body + filtered noise burst)
  synthSnare(time, gainScale = 1.0) {
    if (!this.ctx || !this.drumsGain) return;
    try {
      // Noise component
      if (this.noiseBuffer) {
        const noise = this.ctx.createBufferSource();
        noise.buffer = this.noiseBuffer;
        const filter = this.ctx.createBiquadFilter();
        filter.type = "bandpass";
        filter.frequency.setValueAtTime(2200, time);
        filter.Q.setValueAtTime(1.4, time);

        const noiseGain = this.ctx.createGain();
        noiseGain.gain.setValueAtTime(0.75 * gainScale, time);
        noiseGain.gain.exponentialRampToValueAtTime(0.001, time + 0.14);

        noise.connect(filter);
        filter.connect(noiseGain);
        noiseGain.connect(this.drumsGain);

        noise.start(time);
        noise.stop(time + 0.15);
      }

      // Tonal thump
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(190, time);
      osc.frequency.exponentialRampToValueAtTime(75, time + 0.07);

      gain.gain.setValueAtTime(0.55 * gainScale, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.09);

      osc.connect(gain);
      gain.connect(this.drumsGain);

      osc.start(time);
      osc.stop(time + 0.1);
    } catch (e) {}
  }

  // 3. Hi-Hats (Filtered Noise tick)
  synthHiHat(time, isOpen = false, gainScale = 1.0) {
    if (!this.ctx || !this.drumsGain || !this.noiseBuffer) return;
    try {
      const source = this.ctx.createBufferSource();
      source.buffer = this.noiseBuffer;

      const filter = this.ctx.createBiquadFilter();
      filter.type = "highpass";
      filter.frequency.setValueAtTime(isOpen ? 6800 : 8800, time);

      const dur = isOpen ? 0.18 : 0.04;
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime((isOpen ? 0.45 : 0.32) * gainScale, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + dur);

      source.connect(filter);
      filter.connect(gain);
      gain.connect(this.drumsGain);

      source.start(time);
      source.stop(time + dur + 0.01);
    } catch (e) {}
  }

  // 4. Crash Cymbal (Swept highpass noise)
  synthCrash(time) {
    if (!this.ctx || !this.drumsGain || !this.noiseBuffer) return;
    try {
      const source = this.ctx.createBufferSource();
      source.buffer = this.noiseBuffer;

      const filter = this.ctx.createBiquadFilter();
      filter.type = "highpass";
      filter.frequency.setValueAtTime(5200, time);

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.6, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 1.2);

      source.connect(filter);
      filter.connect(gain);
      gain.connect(this.drumsGain);

      source.start(time);
      source.stop(time + 1.25);
    } catch (e) {}
  }

  // 5. Synth Bass Note (Sawtooth + Sub-Triangle with resonant lowpass filter envelope)
  synthBassNote(freq, time, dur = 0.12, isSubDrone = false) {
    if (!this.ctx || !this.bassGain) return;
    try {
      const osc1 = this.ctx.createOscillator();
      const osc2 = this.ctx.createOscillator();
      const filter = this.ctx.createBiquadFilter();
      const gain = this.ctx.createGain();

      osc1.type = "sawtooth";
      osc1.frequency.setValueAtTime(freq, time);

      osc2.type = "triangle";
      osc2.frequency.setValueAtTime(freq * 0.5, time); // Sub-octave

      // Resonant 24dB lowpass envelope
      filter.type = "lowpass";
      filter.Q.setValueAtTime(isSubDrone ? 2.5 : 4.5, time);
      filter.frequency.setValueAtTime(isSubDrone ? 400 : 1350, time);
      filter.frequency.exponentialRampToValueAtTime(240, time + dur);

      gain.gain.setValueAtTime(0.75, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + dur);

      osc1.connect(filter);
      osc2.connect(filter);
      filter.connect(gain);
      gain.connect(this.bassGain);

      osc1.start(time);
      osc2.start(time);
      osc1.stop(time + dur + 0.02);
      osc2.stop(time + dur + 0.02);
    } catch (e) {}
  }

  // 6. Atmospheric Horror Pad Chords (Detuned dual osc with slow swell)
  synthPadChord(frequencies, time, duration = 3.8) {
    if (!this.ctx || !this.padGain) return;
    try {
      for (const freq of frequencies) {
        const osc1 = this.ctx.createOscillator();
        const osc2 = this.ctx.createOscillator();
        const filter = this.ctx.createBiquadFilter();
        const gain = this.ctx.createGain();

        osc1.type = "sawtooth";
        osc1.frequency.setValueAtTime(freq, time);
        osc1.detune.setValueAtTime(7, time); // +7 cents chorus spread

        osc2.type = "triangle";
        osc2.frequency.setValueAtTime(freq, time);
        osc2.detune.setValueAtTime(-7, time); // -7 cents

        filter.type = "lowpass";
        filter.frequency.setValueAtTime(800, time);
        filter.frequency.linearRampToValueAtTime(1100, time + duration * 0.5);
        filter.frequency.linearRampToValueAtTime(750, time + duration);

        gain.gain.setValueAtTime(0.001, time);
        gain.gain.linearRampToValueAtTime(0.18 / frequencies.length, time + 0.25);
        gain.gain.setValueAtTime(0.18 / frequencies.length, time + duration - 0.4);
        gain.gain.exponentialRampToValueAtTime(0.001, time + duration);

        osc1.connect(filter);
        osc2.connect(filter);
        filter.connect(gain);
        gain.connect(this.padGain);

        osc1.start(time);
        osc2.start(time);
        osc1.stop(time + duration);
        osc2.stop(time + duration);
      }
    } catch (e) {}
  }

  // 7. 16-Bit Arpeggio Note (Square wave with ping-pong echo delay)
  synthArpNote(freq, time, dur = 0.09) {
    if (!this.ctx || !this.arpGain) return;
    try {
      const osc = this.ctx.createOscillator();
      const filter = this.ctx.createBiquadFilter();
      const gain = this.ctx.createGain();

      osc.type = "square";
      osc.frequency.setValueAtTime(freq, time);

      filter.type = "bandpass";
      filter.frequency.setValueAtTime(1600, time);
      filter.Q.setValueAtTime(2.5, time);

      gain.gain.setValueAtTime(0.24, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + dur);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.arpGain);

      // Also send to tape-echo delay line
      if (this.delayNode) {
        gain.connect(this.delayNode);
      }

      osc.start(time);
      osc.stop(time + dur + 0.01);
    } catch (e) {}
  }

  // 8. Lead Synth (Dual saw with portamento & pitch vibrato)
  synthLeadNote(freq, time, dur = 0.45) {
    if (!this.ctx || !this.leadGain) return;
    try {
      const osc = this.ctx.createOscillator();
      const filter = this.ctx.createBiquadFilter();
      const gain = this.ctx.createGain();

      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(freq, time);

      // Pitch vibrato after 0.12s
      const lfo = this.ctx.createOscillator();
      const lfoGain = this.ctx.createGain();
      lfo.frequency.setValueAtTime(5.5, time); // 5.5 Hz vibrato
      lfoGain.gain.setValueAtTime(0, time);
      lfoGain.gain.linearRampToValueAtTime(7, time + 0.15); // vibrato depth
      lfo.connect(osc.detune);

      filter.type = "lowpass";
      filter.frequency.setValueAtTime(2400, time);

      gain.gain.setValueAtTime(0.35, time);
      gain.gain.setValueAtTime(0.35, time + dur * 0.7);
      gain.gain.exponentialRampToValueAtTime(0.001, time + dur);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.leadGain);

      // Also send a splash to delay line
      if (this.delayNode) {
        gain.connect(this.delayNode);
      }

      lfo.start(time);
      osc.start(time);
      lfo.stop(time + dur);
      osc.stop(time + dur);
    } catch (e) {}
  }
}
