// ============================================================================
// UI CONTROLLER & EVENT WIRING (3D ZOMBIE DEFENSE)
// ============================================================================

import { CONFIG } from "./config.js";
import { sound } from "./audio.js";
import { NetworkManager } from "./network.js";
import { GameEngine3D } from "./game3d.js";

// DOM Elements
const lockScreen = document.getElementById("lock-screen");
const passwordInput = document.getElementById("password-input");
const letterCounter = document.getElementById("letter-counter");
const unlockBtn = document.getElementById("unlock-btn");
const lockError = document.getElementById("lock-error");

const lobbyScreen = document.getElementById("lobby-screen");
const playerNameInput = document.getElementById("player-name-input");
const hostBtn = document.getElementById("host-btn");
const joinRoomInput = document.getElementById("join-room-input");
const joinBtn = document.getElementById("join-btn");
const soloBtn = document.getElementById("solo-btn");
const lobbyError = document.getElementById("lobby-error");

const gameContainer = document.getElementById("game-container");
const canvasWrapper = document.getElementById("canvas-wrapper");
const statLives = document.getElementById("stat-lives");
const statScrap = document.getElementById("stat-gold");
const statWave = document.getElementById("stat-wave");
const statEnemies = document.getElementById("stat-enemies");
const roomInfo = document.getElementById("room-info");
const displayRoomCode = document.getElementById("display-room-code");
const copyRoomBtn = document.getElementById("copy-room-btn");
const playerChips = document.getElementById("player-chips");

const towerCards = document.querySelectorAll(".tower-card");
const inspectorCard = document.getElementById("inspector-card");
const inspectName = document.getElementById("inspect-name");
const inspectLevel = document.getElementById("inspect-level");
const inspectDamage = document.getElementById("inspect-damage");
const inspectRange = document.getElementById("inspect-range");
const inspectRate = document.getElementById("inspect-rate");
const upgradeTowerBtn = document.getElementById("upgrade-tower-btn");
const sellTowerBtn = document.getElementById("sell-tower-btn");
const closeInspectBtn = document.getElementById("close-inspect-btn");

const startWaveBtn = document.getElementById("start-wave-btn");
const autoWaveToggle = document.getElementById("auto-wave-toggle");

const chatForm = document.getElementById("chat-form");
const chatInput = document.getElementById("chat-input");
const chatMessages = document.getElementById("chat-messages");

const gameOverModal = document.getElementById("game-over-modal");
const gameOverTitle = document.getElementById("game-over-title");
const gameOverMsg = document.getElementById("game-over-msg");
const restartGameBtn = document.getElementById("restart-game-btn");

// Instantiate 3D subsystems
const network = new NetworkManager();
const engine = new GameEngine3D(canvasWrapper, network);

// ----------------------------------------------------------------------------
// 1. LOCK SCREEN (SECURITY ACCESS GATE)
// ----------------------------------------------------------------------------
function checkPasswordInput() {
  const val = passwordInput.value.trim();
  const len = val.length;
  letterCounter.textContent = `${len} / ${CONFIG.PASSWORD_LENGTH}`;

  if (len === CONFIG.PASSWORD_LENGTH) {
    letterCounter.className = "letter-counter valid";
    unlockBtn.disabled = false;
  } else {
    letterCounter.className = "letter-counter invalid";
    unlockBtn.disabled = true;
  }
}

passwordInput.addEventListener("input", checkPasswordInput);
passwordInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !unlockBtn.disabled) {
    unlockBtn.click();
  }
});

unlockBtn.addEventListener("click", () => {
  sound.init();
  const entered = passwordInput.value.trim();

  if (entered.length !== CONFIG.PASSWORD_LENGTH) {
    lockError.textContent = `Password must be ${CONFIG.PASSWORD_LENGTH} characters (currently ${entered.length}).`;
    return;
  }

  if (entered.toLowerCase() !== CONFIG.DEFAULT_PASSWORD.toLowerCase()) {
    lockError.textContent = "Incorrect access password. Please try again.";
    return;
  }

  // Success: unlock
  lockError.textContent = "";
  lockScreen.classList.add("hidden");
  lobbyScreen.classList.remove("hidden");

  // Check URL parameters for direct room invitation (e.g. ?room=ABCD)
  const params = new URLSearchParams(window.location.search);
  const roomParam = params.get("room");
  if (roomParam) {
    joinRoomInput.value = roomParam.toUpperCase();
  }
});

// ----------------------------------------------------------------------------
// 2. MULTIPLAYER LOBBY
// ----------------------------------------------------------------------------
hostBtn.addEventListener("click", async () => {
  sound.init();
  const name = playerNameInput.value.trim() || "Survivor Host";
  hostBtn.disabled = true;
  hostBtn.textContent = "Creating Outpost...";

  try {
    const code = await network.hostGame(name);
    engine.initLocalPlayer(network.myPeerId);
    enterGame(code, true);
  } catch (err) {
    hostBtn.disabled = false;
    hostBtn.textContent = "👑 Host Co-op Outpost";
    lobbyError.textContent = "Failed to establish room. Please retry.";
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
    await network.joinGame(code, name);
    enterGame(code, false);
  } catch (err) {
    joinBtn.disabled = false;
    joinBtn.textContent = "Join Outpost";
    lobbyError.textContent = "Could not reach outpost. Verify code and ensure Host is online.";
    console.error(err);
  }
});

soloBtn.addEventListener("click", () => {
  sound.init();
  network.isSolo = true;
  network.isHost = true;
  network.playerName = playerNameInput.value.trim() || "Lone Survivor";
  network.myPeerId = "local_solo";
  network.players = [{
    id: "local_solo",
    name: network.playerName,
    color: "#22c55e",
    isHost: true
  }];
  engine.initLocalPlayer("local_solo");
  enterGame(null, false);
});

function enterGame(roomCode, isHost) {
  lobbyScreen.classList.add("hidden");
  gameContainer.classList.remove("hidden");

  if (roomCode) {
    roomInfo.classList.remove("hidden");
    displayRoomCode.textContent = roomCode;
  }

  updatePlayerChips();

  // Resize 3D renderer to fit layout
  setTimeout(() => {
    const w = canvasWrapper.clientWidth;
    const h = canvasWrapper.clientHeight;
    engine.camera.aspect = w / h;
    engine.camera.updateProjectionMatrix();
    engine.renderer.setSize(w, h);
  }, 50);

  engine.start();

  // Periodic HUD update
  setInterval(updateHUD, 100);
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
    chip.innerHTML = `<span>●</span> ${p.name} ${p.isHost ? "👑" : ""}`;
    playerChips.appendChild(chip);
  }
}

network.onPlayerJoined = () => updatePlayerChips();
network.onPlayerLeft = (p) => {
  updatePlayerChips();
  addChatMessage("Radio", `${p.name} lost signal.`, "#94a3b8");
};

// ----------------------------------------------------------------------------
// 3. HUD UPDATES & CONTROLS
// ----------------------------------------------------------------------------
function updateHUD() {
  statLives.textContent = engine.bunkerHealth;
  const localScrap = engine.getLocalScrap();
  statScrap.textContent = localScrap;
  statWave.textContent = engine.wave;
  statEnemies.textContent = engine.zombies.length + engine.spawnQueue.length;

  // Auto wave (Host only)
  if ((network.isHost || network.isSolo) && autoWaveToggle.checked) {
    if (engine.waveState === "idle" && engine.wave > 0) {
      engine.startNextWave();
    }
  }

  // Wave button state
  if (engine.waveState === "spawning" || engine.waveState === "active") {
    startWaveBtn.disabled = true;
    startWaveBtn.textContent = `🧟 Night ${engine.wave} Active`;
  } else {
    startWaveBtn.disabled = false;
    startWaveBtn.textContent = `🚀 Trigger Night ${engine.wave + 1}`;
  }

  // Turret purchase affordances
  towerCards.forEach(card => {
    const type = card.dataset.tower;
    const cfg = CONFIG.TURRETS[type];
    if (cfg && localScrap < cfg.cost) {
      card.classList.add("disabled");
    } else {
      card.classList.remove("disabled");
    }
  });

  // Game over check
  if (engine.waveState === "gameover" && gameOverModal.classList.contains("hidden")) {
    gameOverTitle.textContent = "Bunker Overrun";
    gameOverMsg.textContent = `You defended against the horde until Night ${engine.wave}. The zombies broke through the blast doors!`;
    gameOverModal.classList.remove("hidden");
  }

  // Update inspected turret if open
  if (engine.inspectedTurret) {
    const t = engine.inspectedTurret;
    inspectName.textContent = `${t.name} (Lv. ${t.level})`;
    inspectLevel.textContent = t.level;
    inspectDamage.textContent = t.damage;
    inspectRange.textContent = t.range;
    inspectRate.textContent = `${t.fireRate}s`;

    const upgradeCost = Math.round(t.cost * 0.85);
    const refund = Math.round(t.totalInvested * 0.65);
    upgradeTowerBtn.textContent = `Upgrade (⚙️ ${upgradeCost})`;
    sellTowerBtn.textContent = `Dismantle (+⚙️ ${refund})`;
    upgradeTowerBtn.disabled = localScrap < upgradeCost;
  }
}

// ----------------------------------------------------------------------------
// 4. TURRET SELECTION & INSPECTOR
// ----------------------------------------------------------------------------
towerCards.forEach(card => {
  card.addEventListener("click", () => {
    const type = card.dataset.tower;
    if (engine.selectedTurretType === type) {
      engine.setPlacementType(null);
      card.classList.remove("selected");
    } else {
      towerCards.forEach(c => c.classList.remove("selected"));
      engine.setPlacementType(type);
      engine.inspectedTurret = null;
      inspectorCard.classList.add("hidden");
      card.classList.add("selected");
    }
  });
});

// Inspection callback from 3D engine
engine.onTurretInspected = (turret) => {
  if (turret) {
    inspectorCard.classList.remove("hidden");
    updateHUD();
  } else {
    inspectorCard.classList.add("hidden");
  }
};

closeInspectBtn.addEventListener("click", () => {
  engine.inspectedTurret = null;
  inspectorCard.classList.add("hidden");
});

upgradeTowerBtn.addEventListener("click", () => {
  if (!engine.inspectedTurret) return;
  network.sendCommand({
    type: "UPGRADE_TURRET",
    turretId: engine.inspectedTurret.id
  });
});

sellTowerBtn.addEventListener("click", () => {
  if (!engine.inspectedTurret) return;
  network.sendCommand({
    type: "DISMANTLE_TURRET",
    turretId: engine.inspectedTurret.id
  });
  engine.inspectedTurret = null;
  inspectorCard.classList.add("hidden");
});

// Keyboard hotkeys
window.addEventListener("keydown", (e) => {
  if (e.target.tagName === "INPUT") return;

  if (e.key === "1") selectTurret(0);
  if (e.key === "2") selectTurret(1);
  if (e.key === "3") selectTurret(2);
  if (e.key === "4") selectTurret(3);
  if (e.key === "Escape") {
    engine.setPlacementType(null);
    engine.inspectedTurret = null;
    towerCards.forEach(c => c.classList.remove("selected"));
    inspectorCard.classList.add("hidden");
  }
  if (e.key === " " && !startWaveBtn.disabled) {
    e.preventDefault();
    startWaveBtn.click();
  }
});

function selectTurret(idx) {
  if (towerCards[idx]) {
    towerCards[idx].click();
  }
}

// Wave start button
startWaveBtn.addEventListener("click", () => {
  network.sendCommand({
    type: "START_WAVE"
  });
});

// ----------------------------------------------------------------------------
// 5. CHAT & COMMS
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
