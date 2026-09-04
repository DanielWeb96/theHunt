// ============================================================================
// UI CONTROLLER & EVENT WIRING (PIXEL ZOMBIE SURVIVAL)
// ============================================================================

import { CONFIG } from "./config.js";
import { sound } from "./audio.js";
import { NetworkManager } from "./network.js";
import { PixelGameEngine } from "./pixelGame.js";

// DOM Elements
const lobbyScreen = document.getElementById("lobby-screen");
const playerNameInput = document.getElementById("player-name-input");
const charCards = document.querySelectorAll(".char-card");
const hostBtn = document.getElementById("host-btn");
const joinRoomInput = document.getElementById("join-room-input");
const joinBtn = document.getElementById("join-btn");
const soloBtn = document.getElementById("solo-btn");
const lobbyError = document.getElementById("lobby-error");

const gameContainer = document.getElementById("game-container");
const canvas = document.getElementById("game-canvas");
const statHp = document.getElementById("stat-hp");
const statAmmo = document.getElementById("stat-ammo");
const statMaxAmmo = document.getElementById("stat-max-ammo");
const statWave = document.getElementById("stat-wave");
const statEnemies = document.getElementById("stat-enemies");
const statScore = document.getElementById("stat-score");
const roomInfo = document.getElementById("room-info");
const displayRoomCode = document.getElementById("display-room-code");
const copyRoomBtn = document.getElementById("copy-room-btn");
const playerChips = document.getElementById("player-chips");
const fullscreenBtn = document.getElementById("fullscreen-btn");
const hudHpFill = document.getElementById("hud-hp-fill");

// Active Character HUD
const hudCharImg = document.getElementById("hud-char-img");
const hudCharName = document.getElementById("hud-char-name");
const hudCharTitle = document.getElementById("hud-char-title");
const hudWeaponName = document.getElementById("hud-weapon-name");
const hudAbilityName = document.getElementById("hud-ability-name");
const abilityBtn = document.getElementById("ability-btn");

const startWaveBtn = document.getElementById("start-wave-btn");
const autoWaveToggle = document.getElementById("auto-wave-toggle");
const canvasBanner = document.getElementById("canvas-banner");

const chatForm = document.getElementById("chat-form");
const chatInput = document.getElementById("chat-input");
const chatMessages = document.getElementById("chat-messages");

const gameOverModal = document.getElementById("game-over-modal");
const gameOverTitle = document.getElementById("game-over-title");
const gameOverMsg = document.getElementById("game-over-msg");
const restartGameBtn = document.getElementById("restart-game-btn");

// Lobby Audio Controls
const lobbyPlayMusicBtn = document.getElementById("lobby-play-music-btn");
const lobbyMuteBtn = document.getElementById("lobby-mute-btn");
const lobbyMasterVol = document.getElementById("lobby-master-vol");
const lobbyMasterVolTxt = document.getElementById("lobby-master-vol-txt");
const lobbyMusicVol = document.getElementById("lobby-music-vol");
const lobbyMusicVolTxt = document.getElementById("lobby-music-vol-txt");
const lobbySfxVol = document.getElementById("lobby-sfx-vol");
const lobbySfxVolTxt = document.getElementById("lobby-sfx-vol-txt");
const lobbyTrackSelect = document.getElementById("lobby-track-select");

// In-Game Audio Controls
const hudAudioBtn = document.getElementById("hud-audio-btn");
const inGameAudioModal = document.getElementById("in-game-audio-modal");
const closeAudioModalBtn = document.getElementById("close-audio-modal-btn");
const hudMasterVol = document.getElementById("hud-master-vol");
const hudMasterVolTxt = document.getElementById("hud-master-vol-txt");
const hudMusicVol = document.getElementById("hud-music-vol");
const hudMusicVolTxt = document.getElementById("hud-music-vol-txt");
const hudSfxVol = document.getElementById("hud-sfx-vol");
const hudSfxVolTxt = document.getElementById("hud-sfx-vol-txt");
const hudTrackSelect = document.getElementById("hud-track-select");
const hudMuteBtn = document.getElementById("hud-mute-btn");

let selectedClass = "commando";

const network = new NetworkManager();
const engine = new PixelGameEngine(canvas, network);
window.engine = engine;
window.network = network;
window.sound = sound;

// ----------------------------------------------------------------------------
// URL ROOM INVITE PRE-FILL
// ----------------------------------------------------------------------------
const params = new URLSearchParams(window.location.search);
const roomParam = params.get("room");
if (roomParam && joinRoomInput) {
  joinRoomInput.value = roomParam.toUpperCase();
}

// ----------------------------------------------------------------------------
// 2. CHARACTER SELECTION & LOBBY
// ----------------------------------------------------------------------------
charCards.forEach(card => {
  card.addEventListener("click", () => {
    charCards.forEach(c => c.classList.remove("selected"));
    card.classList.add("selected");
    selectedClass = card.dataset.class;
    sound.reload();
  });
});

hostBtn.addEventListener("click", async () => {
  sound.init();
  const name = playerNameInput.value.trim() || "Commander";
  hostBtn.disabled = true;
  hostBtn.textContent = "Establishing Outpost...";

  try {
    const code = await network.hostGame(name, selectedClass);
    engine.initLocalPlayer(selectedClass);
    enterGame(code, true);
  } catch (err) {
    hostBtn.disabled = false;
    hostBtn.textContent = "👑 Host Co-op Match";
    lobbyError.textContent = "Failed to establish match. Please retry.";
    console.error(err);
  }
});

joinBtn.addEventListener("click", async () => {
  sound.init();
  const name = playerNameInput.value.trim() || "Survivor";
  const code = joinRoomInput.value.trim();

  if (!code) {
    lobbyError.textContent = "Please enter a valid room code.";
    return;
  }

  joinBtn.disabled = true;
  joinBtn.textContent = "Connecting...";

  try {
    await network.joinGame(code, name, selectedClass);
    engine.initLocalPlayer(selectedClass);
    enterGame(code, false);
  } catch (err) {
    joinBtn.disabled = false;
    joinBtn.textContent = "Join";
    lobbyError.textContent = "Could not connect to room. Check code & host status.";
    console.error(err);
  }
});

soloBtn.addEventListener("click", () => {
  sound.init();
  network.isSolo = true;
  network.isHost = true;
  network.playerName = playerNameInput.value.trim() || "Lone Survivor";
  network.charClass = selectedClass;
  network.myPeerId = "local_solo";
  const charCfg = CONFIG.CHARACTERS[selectedClass] || CONFIG.CHARACTERS.commando;
  network.players = [{
    id: "local_solo",
    name: network.playerName,
    charClass: selectedClass,
    color: charCfg.color,
    isHost: true
  }];
  engine.initLocalPlayer(selectedClass);
  enterGame(null, false);
});

function enterGame(roomCode, isHost) {
  lobbyScreen.classList.add("hidden");
  gameContainer.classList.remove("hidden");

  // Launch procedural retro soundtrack
  sound.startMusic();

  if (roomCode) {
    roomInfo.classList.remove("hidden");
    displayRoomCode.textContent = roomCode;
  }

  // Populate active character card in side HUD
  const cfg = CONFIG.CHARACTERS[selectedClass];
  if (hudCharImg && cfg.portrait) hudCharImg.src = cfg.portrait;
  if (hudCharName) hudCharName.textContent = cfg.name;
  if (hudCharTitle) hudCharTitle.textContent = cfg.title;
  if (hudWeaponName) hudWeaponName.textContent = cfg.weapon;
  if (hudAbilityName) hudAbilityName.textContent = `Special: ${cfg.ability}`;

  updatePlayerChips();
  engine.resize();
  engine.start();

  // Periodic HUD update
  setInterval(updateHUD, 80);
}

// Fullscreen Toggle
if (fullscreenBtn) {
  fullscreenBtn.addEventListener("click", () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  });

  document.addEventListener("fullscreenchange", () => {
    if (document.fullscreenElement) {
      fullscreenBtn.textContent = "✕";
    } else {
      fullscreenBtn.textContent = "⛶";
    }
    engine.resize();
  });
}

copyRoomBtn.addEventListener("click", () => {
  const url = `${window.location.origin}${window.location.pathname}?room=${network.roomCode}`;
  navigator.clipboard.writeText(url).then(() => {
    const orig = copyRoomBtn.textContent;
    copyRoomBtn.textContent = "Copied!";
    setTimeout(() => copyRoomBtn.textContent = orig, 1800);
  });
});

function updatePlayerChips() {
  playerChips.innerHTML = "";
  for (const p of network.players) {
    const chip = document.createElement("div");
    chip.className = "player-chip";
    chip.style.backgroundColor = `${p.color}22`;
    chip.style.border = `1px solid ${p.color}`;
    chip.style.color = p.color;
    chip.innerHTML = `<span>●</span> ${p.name} (${p.charClass || "Hero"})`;
    playerChips.appendChild(chip);
  }
}

network.onPlayerJoined = () => updatePlayerChips();
network.onPlayerLeft = (p) => {
  updatePlayerChips();
  addChatMessage("Radio", `${p.name} disconnected.`, "#94a3b8");
};

// ----------------------------------------------------------------------------
// 3. HUD UPDATES & CONTROLS
// ----------------------------------------------------------------------------
function updateHUD() {
  const p = engine.myPlayer;
  statHp.textContent = Math.round(p.hp);
  statAmmo.textContent = p.isReloading ? "RELOAD" : p.ammo;
  statMaxAmmo.textContent = p.maxAmmo;
  statWave.textContent = engine.wave;
  statEnemies.textContent = engine.zombies.length + engine.spawnQueue.length;
  statScore.textContent = engine.teamScore;

  // HP Bar fill width
  if (hudHpFill) {
    const hpRatio = Math.max(0, Math.min(100, (p.hp / p.maxHp) * 100));
    hudHpFill.style.width = `${hpRatio}%`;
    hudHpFill.style.background = hpRatio > 50 ? "linear-gradient(90deg, #10b981, #22c55e)" : hpRatio > 25 ? "#f59e0b" : "#ef4444";
  }

  // Ability Button Cooldown Visualizer
  if (p.abilityCooldownTimer > 0) {
    abilityBtn.disabled = true;
    abilityBtn.textContent = `⏳ Recharging (${p.abilityCooldownTimer.toFixed(1)}s)`;
  } else {
    abilityBtn.disabled = false;
    abilityBtn.textContent = `⚡ Use Special Ability [Space]`;
  }

  // Auto wave (Host only)
  if ((network.isHost || network.isSolo) && autoWaveToggle && autoWaveToggle.checked) {
    if (engine.waveState === "idle" && engine.wave > 0) {
      engine.startNextWave();
    }
  }

  // Wave button state
  if (engine.waveState === "spawning" || engine.waveState === "active") {
    startWaveBtn.disabled = true;
    startWaveBtn.textContent = `🧟 Night ${engine.wave} Swarming`;
  } else {
    startWaveBtn.disabled = false;
    startWaveBtn.textContent = `🚀 Trigger Night ${engine.wave + 1}`;
  }

  // Check Game Over
  if (p.isDowned && gameOverModal.classList.contains("hidden")) {
    gameOverTitle.textContent = "You Were Overrun!";
    gameOverMsg.textContent = `You survived up to Night ${engine.wave} with a final score of ${engine.teamScore} points.`;
    gameOverModal.classList.remove("hidden");
  }
}

// Ability button click
abilityBtn.addEventListener("click", () => {
  engine.triggerAbility();
});

// Wave start button
startWaveBtn.addEventListener("click", () => {
  if (network.isHost || network.isSolo) {
    engine.startNextWave();
  } else {
    network.sendAction({ type: "TRIGGER_WAVE" });
  }
});

// ----------------------------------------------------------------------------
// 4. CHAT SYSTEM
// ----------------------------------------------------------------------------
chatForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const text = chatInput.value.trim();
  if (!text) return;

  network.sendChat(text);
  chatInput.value = "";
});

network.onChatReceived = (sender, text, color) => {
  addChatMessage(sender, text, color);
};

function addChatMessage(sender, text, color = "#fff") {
  const msgEl = document.createElement("div");
  msgEl.className = "chat-msg";

  const senderSpan = document.createElement("span");
  senderSpan.className = "sender";
  senderSpan.style.color = color;
  senderSpan.textContent = `${sender}: `;

  const textNode = document.createTextNode(text);

  msgEl.appendChild(senderSpan);
  msgEl.appendChild(textNode);
  chatMessages.appendChild(msgEl);

  chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Restart button
restartGameBtn.addEventListener("click", () => {
  window.location.reload();
});

// ----------------------------------------------------------------------------
// 5. AUDIO & SOUNDTRACK UI CONTROLLERS
// ----------------------------------------------------------------------------

function showNotification(text, duration = 2200) {
  if (!canvasBanner) return;
  canvasBanner.textContent = text;
  canvasBanner.classList.add("show");
  clearTimeout(canvasBanner._timer);
  canvasBanner._timer = setTimeout(() => {
    canvasBanner.classList.remove("show");
  }, duration);
}

function syncAudioUI() {
  const masterPct = Math.round(sound.masterVolume * 100);
  const musicPct = Math.round(sound.musicVolume * 100);
  const sfxPct = Math.round(sound.sfxVolume * 100);
  const isMuted = sound.isMuted();
  const currentTrack = sound.getCurrentTrack();
  const isMusicPlaying = sound.isMusicPlaying();

  // Lobby Sliders & Readouts
  if (lobbyMasterVol) lobbyMasterVol.value = masterPct;
  if (lobbyMasterVolTxt) lobbyMasterVolTxt.textContent = `${masterPct}%`;
  if (lobbyMusicVol) lobbyMusicVol.value = musicPct;
  if (lobbyMusicVolTxt) lobbyMusicVolTxt.textContent = `${musicPct}%`;
  if (lobbySfxVol) lobbySfxVol.value = sfxPct;
  if (lobbySfxVolTxt) lobbySfxVolTxt.textContent = `${sfxPct}%`;
  if (lobbyTrackSelect) lobbyTrackSelect.value = currentTrack;

  // Lobby Buttons
  if (lobbyMuteBtn) {
    lobbyMuteBtn.textContent = isMuted ? "🔇 Muted" : "🔊 Sound ON";
    lobbyMuteBtn.classList.toggle("muted", isMuted);
  }
  if (lobbyPlayMusicBtn) {
    lobbyPlayMusicBtn.textContent = isMusicPlaying ? "⏸ Pause Music" : "▶ Play Music";
    lobbyPlayMusicBtn.classList.toggle("active", isMusicPlaying);
  }

  // HUD In-Game Sliders & Readouts
  if (hudMasterVol) hudMasterVol.value = masterPct;
  if (hudMasterVolTxt) hudMasterVolTxt.textContent = `${masterPct}%`;
  if (hudMusicVol) hudMusicVol.value = musicPct;
  if (hudMusicVolTxt) hudMusicVolTxt.textContent = `${musicPct}%`;
  if (hudSfxVol) hudSfxVol.value = sfxPct;
  if (hudSfxVolTxt) hudSfxVolTxt.textContent = `${sfxPct}%`;
  if (hudTrackSelect) hudTrackSelect.value = currentTrack;

  // HUD In-Game Buttons
  if (hudMuteBtn) {
    hudMuteBtn.textContent = isMuted ? "🔇 Muted" : "🔊 Sound ON";
    hudMuteBtn.classList.toggle("muted", isMuted);
  }
  if (hudAudioBtn) {
    hudAudioBtn.textContent = isMuted ? "🔇" : "🔊";
  }
}

// Master Volume Sliders
if (lobbyMasterVol) {
  lobbyMasterVol.addEventListener("input", (e) => sound.setMasterVolume(e.target.value / 100));
}
if (hudMasterVol) {
  hudMasterVol.addEventListener("input", (e) => sound.setMasterVolume(e.target.value / 100));
}

// Music Volume Sliders
if (lobbyMusicVol) {
  lobbyMusicVol.addEventListener("input", (e) => sound.setMusicVolume(e.target.value / 100));
}
if (hudMusicVol) {
  hudMusicVol.addEventListener("input", (e) => sound.setMusicVolume(e.target.value / 100));
}

// SFX Volume Sliders
if (lobbySfxVol) {
  lobbySfxVol.addEventListener("input", (e) => sound.setSfxVolume(e.target.value / 100));
}
if (hudSfxVol) {
  hudSfxVol.addEventListener("input", (e) => sound.setSfxVolume(e.target.value / 100));
}

// Track Selection Dropdowns
if (lobbyTrackSelect) {
  lobbyTrackSelect.addEventListener("change", (e) => sound.setMusicTrack(e.target.value));
}
if (hudTrackSelect) {
  hudTrackSelect.addEventListener("change", (e) => sound.setMusicTrack(e.target.value));
}

// Mute Toggles
if (lobbyMuteBtn) {
  lobbyMuteBtn.addEventListener("click", () => sound.toggleMute());
}
if (hudMuteBtn) {
  hudMuteBtn.addEventListener("click", () => sound.toggleMute());
}

// Lobby Soundtrack Preview Play/Pause
if (lobbyPlayMusicBtn) {
  lobbyPlayMusicBtn.addEventListener("click", () => {
    sound.init();
    if (sound.isMusicPlaying()) {
      sound.stopMusic();
    } else {
      const trk = lobbyTrackSelect ? lobbyTrackSelect.value : "dynamic";
      sound.startMusic(trk);
    }
  });
}

// HUD In-Game Audio Modal Toggle
if (hudAudioBtn) {
  hudAudioBtn.addEventListener("click", () => {
    if (inGameAudioModal) {
      inGameAudioModal.classList.toggle("hidden");
    }
  });
}

if (closeAudioModalBtn) {
  closeAudioModalBtn.addEventListener("click", () => {
    if (inGameAudioModal) {
      inGameAudioModal.classList.add("hidden");
    }
  });
}

// Keyboard shortcuts for Audio: [M] Mute, [O] Audio Options, [Esc] Close Audio Modal
window.addEventListener("keydown", (e) => {
  if (e.target.tagName === "INPUT" || e.target.tagName === "SELECT") return;

  // Toggle Mute on [M]
  if (e.key.toLowerCase() === "m") {
    const isMuted = sound.toggleMute();
    showNotification(isMuted ? "🔇 Audio Muted [M]" : "🔊 Audio Unmuted [M]");
  }

  // Toggle In-Game Audio Modal on [O]
  if (e.key.toLowerCase() === "o") {
    if (inGameAudioModal) {
      inGameAudioModal.classList.toggle("hidden");
    }
  }

  // Close In-Game Audio Modal on [Escape]
  if (e.key === "Escape") {
    if (inGameAudioModal && !inGameAudioModal.classList.contains("hidden")) {
      inGameAudioModal.classList.add("hidden");
    }
  }
});

// Sync UI on startup and subscribe to audio state changes
sound.onSettingsChanged(syncAudioUI);
syncAudioUI();

