// ============================================================================
// UI CONTROLLER & EVENT WIRING
// ============================================================================

import { CONFIG } from "./config.js";
import { sound } from "./audio.js";
import { NetworkManager } from "./network.js";
import { GameEngine } from "./game.js";

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
const canvas = document.getElementById("game-canvas");
const statLives = document.getElementById("stat-lives");
const statGold = document.getElementById("stat-gold");
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
const inspectSpecial = document.getElementById("inspect-special");
const upgradeTowerBtn = document.getElementById("upgrade-tower-btn");
const sellTowerBtn = document.getElementById("sell-tower-btn");
const closeInspectBtn = document.getElementById("close-inspect-btn");

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

// Instantiate subsystems
const network = new NetworkManager();
const engine = new GameEngine(canvas, network);

// ----------------------------------------------------------------------------
// 1. LOCK SCREEN (20-LETTER PASSWORD GATE)
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

  // Validate length
  if (entered.length !== CONFIG.PASSWORD_LENGTH) {
    lockError.textContent = `Password must be exactly ${CONFIG.PASSWORD_LENGTH} letters (currently ${entered.length}).`;
    return;
  }

  // Validate match against CONFIG.DEFAULT_PASSWORD
  if (entered.toLowerCase() !== CONFIG.DEFAULT_PASSWORD.toLowerCase()) {
    lockError.textContent = "Incorrect security password. Please try again.";
    return;
  }

  // Success: unlock gate
  lockError.textContent = "";
  lockScreen.classList.add("hidden");
  lobbyScreen.classList.remove("hidden");

  // Check URL parameters for direct room join invitation (e.g. ?room=ABCD)
  const params = new URLSearchParams(window.location.search);
  const roomParam = params.get("room");
  if (roomParam) {
    joinRoomInput.value = roomParam.toUpperCase();
  }
});

// ----------------------------------------------------------------------------
// 2. LOBBY ACTIONS
// ----------------------------------------------------------------------------
hostBtn.addEventListener("click", async () => {
  sound.init();
  const name = playerNameInput.value.trim() || "Host Commander";
  hostBtn.disabled = true;
  hostBtn.textContent = "Creating Room...";

  try {
    const code = await network.hostGame(name);
    engine.initLocalPlayer(network.myPeerId);
    enterGame(code, true);
  } catch (err) {
    hostBtn.disabled = false;
    hostBtn.textContent = "👑 Host Co-op Match";
    lobbyError.textContent = "Failed to create room. Please retry.";
    console.error(err);
  }
});

joinBtn.addEventListener("click", async () => {
  sound.init();
  const name = playerNameInput.value.trim() || "Defender";
  const code = joinRoomInput.value.trim();

  if (!code) {
    lobbyError.textContent = "Please enter a valid room code.";
    return;
  }

  joinBtn.disabled = true;
  joinBtn.textContent = "Joining...";

  try {
    await network.joinGame(code, name);
    enterGame(code, false);
  } catch (err) {
    joinBtn.disabled = false;
    joinBtn.textContent = "Join";
    lobbyError.textContent = "Could not connect to room. Check code and ensure Host is online.";
    console.error(err);
  }
});

soloBtn.addEventListener("click", () => {
  sound.init();
  network.isSolo = true;
  network.isHost = true;
  network.playerName = playerNameInput.value.trim() || "Solo Defender";
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
  engine.start();

  // Start HUD update timer
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
  addChatMessage("System", `${p.name} disconnected.`, "#94a3b8");
};

// ----------------------------------------------------------------------------
// 3. HUD UPDATES & CONTROLS
// ----------------------------------------------------------------------------
function updateHUD() {
  statLives.textContent = engine.lives;
  const localGold = engine.getLocalGold();
  statGold.textContent = localGold;
  statWave.textContent = engine.wave;
  statEnemies.textContent = engine.creeps.length + engine.spawnQueue.length;

  // Auto-wave triggering (Host only)
  if ((network.isHost || network.isSolo) && autoWaveToggle.checked) {
    if (engine.waveState === "idle" && engine.wave > 0) {
      engine.startNextWave();
    }
  }

  // Update Wave button text
  if (engine.waveState === "spawning" || engine.waveState === "active") {
    startWaveBtn.disabled = true;
    startWaveBtn.textContent = `⚔️ Wave ${engine.wave} In Progress`;
  } else {
    startWaveBtn.disabled = false;
    startWaveBtn.textContent = `🚀 Start Wave ${engine.wave + 1}`;
  }

  // Update tower purchase affordances
  towerCards.forEach(card => {
    const type = card.dataset.tower;
    const cfg = CONFIG.TOWERS[type];
    if (cfg && localGold < cfg.cost) {
      card.classList.add("disabled");
    } else {
      card.classList.remove("disabled");
    }
  });

  // Game over check
  if (engine.waveState === "gameover" && gameOverModal.classList.contains("hidden")) {
    gameOverTitle.textContent = "Sanctum Defeated";
    gameOverMsg.textContent = `You survived up to Wave ${engine.wave}. The horde overwhelmed your defenses!`;
    gameOverModal.classList.remove("hidden");
  }

  // Update inspected tower values if open
  if (engine.inspectedTower) {
    const t = engine.inspectedTower;
    inspectName.textContent = `${t.name} (Lv. ${t.level})`;
    inspectLevel.textContent = t.level;
    inspectDamage.textContent = t.damage;
    inspectRange.textContent = t.range;
    inspectRate.textContent = `${t.fireRate}s`;

    const upgradeCost = Math.round(t.cost * 0.85);
    const refund = Math.round(t.totalInvested * 0.65);
    upgradeTowerBtn.textContent = `Upgrade (🪙 ${upgradeCost})`;
    sellTowerBtn.textContent = `Sell (+🪙 ${refund})`;
    upgradeTowerBtn.disabled = localGold < upgradeCost;
  }
}

// ----------------------------------------------------------------------------
// 4. ARSENAL & BUILDING INTERACTION
// ----------------------------------------------------------------------------
towerCards.forEach(card => {
  card.addEventListener("click", () => {
    const type = card.dataset.tower;
    if (engine.selectedTowerType === type) {
      engine.selectedTowerType = null;
      card.classList.remove("selected");
    } else {
      towerCards.forEach(c => c.classList.remove("selected"));
      engine.selectedTowerType = type;
      engine.inspectedTower = null;
      inspectorCard.classList.add("hidden");
      card.classList.add("selected");
    }
  });
});

// Hotkeys for towers
window.addEventListener("keydown", (e) => {
  if (e.target.tagName === "INPUT") return;

  if (e.key === "1") selectTowerIndex(0);
  if (e.key === "2") selectTowerIndex(1);
  if (e.key === "3") selectTowerIndex(2);
  if (e.key === "4") selectTowerIndex(3);
  if (e.key === "Escape") {
    engine.selectedTowerType = null;
    engine.inspectedTower = null;
    towerCards.forEach(c => c.classList.remove("selected"));
    inspectorCard.classList.add("hidden");
  }
  if (e.key === " " && !startWaveBtn.disabled) {
    e.preventDefault();
    startWaveBtn.click();
  }
});

function selectTowerIndex(idx) {
  if (towerCards[idx]) {
    towerCards[idx].click();
  }
}

// Canvas Mouse Interactions
canvas.addEventListener("mousemove", (e) => {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;

  const mouseX = (e.clientX - rect.x) * scaleX;
  const mouseY = (e.clientY - rect.y) * scaleY;

  const col = Math.floor(mouseX / CONFIG.GRID.CELL_SIZE);
  const row = Math.floor(mouseY / CONFIG.GRID.CELL_SIZE);

  engine.hoverGrid = { col, row };

  // Broadcast cursor to teammates (throttled)
  network.sendCursor(Math.round(mouseX), Math.round(mouseY));
});

canvas.addEventListener("mouseleave", () => {
  engine.hoverGrid = { col: -1, row: -1 };
});

canvas.addEventListener("click", (e) => {
  const { col, row } = engine.hoverGrid;
  if (col < 0 || row < 0) return;

  // 1. If we are currently placing a tower
  if (engine.selectedTowerType) {
    const cfg = CONFIG.TOWERS[engine.selectedTowerType];
    const localGold = engine.getLocalGold();

    if (localGold < cfg.cost) {
      showBanner("Not enough gold!");
      return;
    }

    if (engine.grid[row] && engine.grid[row][col] !== null) {
      showBanner("Cannot build on path or existing tower!");
      return;
    }

    // Dispatch build command
    network.sendCommand({
      type: "BUILD_TOWER",
      towerType: engine.selectedTowerType,
      col,
      row
    });

    // Deselect after placing
    if (!e.shiftKey) {
      engine.selectedTowerType = null;
      towerCards.forEach(c => c.classList.remove("selected"));
    }
    return;
  }

  // 2. If clicking on an existing tower -> Inspect it
  const clickedTower = engine.towers.find(t => t.col === col && t.row === row);
  if (clickedTower) {
    engine.inspectedTower = clickedTower;
    inspectorCard.classList.remove("hidden");
    updateHUD();
  } else {
    engine.inspectedTower = null;
    inspectorCard.classList.add("hidden");
  }
});

// Inspector buttons
closeInspectBtn.addEventListener("click", () => {
  engine.inspectedTower = null;
  inspectorCard.classList.add("hidden");
});

upgradeTowerBtn.addEventListener("click", () => {
  if (!engine.inspectedTower) return;
  network.sendCommand({
    type: "UPGRADE_TOWER",
    towerId: engine.inspectedTower.id
  });
});

sellTowerBtn.addEventListener("click", () => {
  if (!engine.inspectedTower) return;
  network.sendCommand({
    type: "SELL_TOWER",
    towerId: engine.inspectedTower.id
  });
  engine.inspectedTower = null;
  inspectorCard.classList.add("hidden");
});

// Wave start button
startWaveBtn.addEventListener("click", () => {
  network.sendCommand({
    type: "START_WAVE"
  });
});

function showBanner(text) {
  canvasBanner.textContent = text;
  canvasBanner.classList.add("show");
  setTimeout(() => canvasBanner.classList.remove("show"), 2000);
}

// ----------------------------------------------------------------------------
// 5. CHAT SYSTEM
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
