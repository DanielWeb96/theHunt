// ============================================================================
// CORE TOWER DEFENSE GAME ENGINE
// ============================================================================

import { CONFIG } from "./config.js";
import { sound } from "./audio.js";

export class GameEngine {
  constructor(canvas, network) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.network = network;

    // Game state
    this.lives = CONFIG.STARTING_LIVES;
    this.wave = 0;
    this.waveState = "idle"; // "idle", "spawning", "active", "gameover", "victory"
    this.playerGold = {}; // Map of peerId -> gold amount
    this.towers = [];
    this.creeps = [];
    this.projectiles = [];
    this.particles = [];
    this.floatingTexts = [];
    this.otherCursors = {}; // peerId -> { x, y, name, color }

    // Path grid representation
    this.grid = [];
    this.waypoints = [];
    this.pathCells = new Set();
    this.initMap();

    // Wave spawning queues
    this.spawnQueue = [];
    this.spawnTimer = 0;
    this.spawnInterval = 0.8; // seconds between creep spawns

    // Selected tower for inspection or placement
    this.selectedTowerType = null;
    this.inspectedTower = null;
    this.hoverGrid = { col: -1, row: -1 };

    // Timing loop
    this.lastTime = performance.now();
    this.syncTimer = 0;

    // Shake effect for base damage
    this.shakeDuration = 0;

    // Bind event handlers from network
    this.setupNetworkHooks();
  }

  // Define tactical winding path across 24x14 grid
  initMap() {
    const { COLS, ROWS, CELL_SIZE } = CONFIG.GRID;
    for (let r = 0; r < ROWS; r++) {
      this.grid[r] = [];
      for (let c = 0; c < COLS; c++) {
        this.grid[r][c] = null; // null = buildable grass
      }
    }

    // Grid coordinates defining key turns along the path
    const keyPoints = [
      { col: 0, row: 3 },
      { col: 5, row: 3 },
      { col: 5, row: 10 },
      { col: 11, row: 10 },
      { col: 11, row: 2 },
      { col: 17, row: 2 },
      { col: 17, row: 11 },
      { col: 23, row: 11 }
    ];

    // Rasterize path line between key points
    this.pathCells.clear();
    this.waypoints = [];

    for (let i = 0; i < keyPoints.length - 1; i++) {
      const p1 = keyPoints[i];
      const p2 = keyPoints[i + 1];

      if (p1.col === p2.col) {
        const step = p2.row > p1.row ? 1 : -1;
        for (let r = p1.row; r !== p2.row + step; r += step) {
          this.pathCells.add(`${p1.col},${r}`);
          this.grid[r][p1.col] = "PATH";
        }
      } else {
        const step = p2.col > p1.col ? 1 : -1;
        for (let c = p1.col; c !== p2.col + step; c += step) {
          this.pathCells.add(`${c},${p1.row}`);
          this.grid[p1.row][c] = "PATH";
        }
      }
    }

    // Convert keyPoints into world coordinate pixel waypoints
    this.waypoints = keyPoints.map(p => ({
      x: p.col * CELL_SIZE + CELL_SIZE / 2,
      y: p.row * CELL_SIZE + CELL_SIZE / 2
    }));
  }

  setupNetworkHooks() {
    this.network.onCommandReceived = (cmd, senderId) => {
      this.handleCommand(cmd, senderId);
    };

    this.network.onStateReceived = (state) => {
      this.applyStateSync(state);
    };

    this.network.onCursorReceived = (peerId, x, y, name, color) => {
      this.otherCursors[peerId] = { x, y, name, color, lastSeen: performance.now() };
    };

    this.network.onPlayerJoined = (player) => {
      if (this.network.isHost || this.network.isSolo) {
        if (!this.playerGold[player.id]) {
          this.playerGold[player.id] = CONFIG.STARTING_GOLD;
        }
      }
    };
  }

  initLocalPlayer(playerId) {
    this.playerGold[playerId] = CONFIG.STARTING_GOLD;
  }

  getLocalGold() {
    const id = this.network.myPeerId || "local";
    return this.playerGold[id] !== undefined ? this.playerGold[id] : CONFIG.STARTING_GOLD;
  }

  // --------------------------------------------------------------------------
  // GAME LOOP & TICKS
  // --------------------------------------------------------------------------
  start() {
    const loop = (time) => {
      const dt = Math.min((time - this.lastTime) / 1000, 0.1);
      this.lastTime = time;

      this.update(dt);
      this.render();

      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  update(dt) {
    // Shake decay
    if (this.shakeDuration > 0) {
      this.shakeDuration -= dt;
    }

    // Floating text update
    for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
      const ft = this.floatingTexts[i];
      ft.y -= 25 * dt;
      ft.opacity -= 1.2 * dt;
      if (ft.opacity <= 0) {
        this.floatingTexts.splice(i, 1);
      }
    }

    // Particles update
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
      p.size = Math.max(0, p.size - dt * 2);
      if (p.life <= 0) {
        this.particles.splice(i, 1);
      }
    }

    // Only host runs authoritative simulation
    if (this.network.isHost || this.network.isSolo) {
      this.updateSpawner(dt);
      this.updateCreeps(dt);
      this.updateTowers(dt);
      this.updateProjectiles(dt);

      // Periodic state broadcast (15 times per second)
      this.syncTimer += dt;
      if (this.syncTimer >= 0.066) {
        this.syncTimer = 0;
        this.broadcastState();
      }
    }
  }

  // --------------------------------------------------------------------------
  // WAVE GENERATOR & SPAWNER
  // --------------------------------------------------------------------------
  startNextWave() {
    if (this.waveState === "spawning" || this.waveState === "active") return;

    this.wave++;
    this.waveState = "spawning";
    sound.waveStart();

    // Generate wave enemy distribution
    this.spawnQueue = this.generateWaveComposition(this.wave);
    this.spawnTimer = 0;
  }

  generateWaveComposition(waveNum) {
    const queue = [];
    const baseCount = 6 + waveNum * 3;

    if (waveNum === 1) {
      for (let i = 0; i < 8; i++) queue.push("scout");
    } else if (waveNum === 2) {
      for (let i = 0; i < 12; i++) queue.push("scout");
    } else if (waveNum === 3) {
      for (let i = 0; i < 8; i++) queue.push("scout");
      for (let i = 0; i < 6; i++) queue.push("soldier");
    } else if (waveNum === 4) {
      for (let i = 0; i < 14; i++) queue.push("soldier");
      for (let i = 0; i < 2; i++) queue.push("knight");
    } else if (waveNum % 5 === 0) {
      // Boss wave every 5 waves!
      for (let i = 0; i < 6; i++) queue.push("soldier");
      for (let i = 0; i < 4; i++) queue.push("knight");
      queue.push("boss");
    } else {
      // Scaled procedural mix
      const scouts = Math.floor(baseCount * 0.4);
      const soldiers = Math.floor(baseCount * 0.4);
      const knights = Math.floor(baseCount * 0.2);
      for (let i = 0; i < scouts; i++) queue.push("scout");
      for (let i = 0; i < soldiers; i++) queue.push("soldier");
      for (let i = 0; i < knights; i++) queue.push("knight");
    }

    return queue;
  }

  updateSpawner(dt) {
    if (this.waveState !== "spawning") return;

    this.spawnTimer += dt;
    if (this.spawnTimer >= this.spawnInterval) {
      this.spawnTimer = 0;
      if (this.spawnQueue.length > 0) {
        const typeKey = this.spawnQueue.shift();
        this.spawnCreep(typeKey);
      } else {
        this.waveState = "active";
      }
    }
  }

  spawnCreep(typeKey) {
    const base = CONFIG.CREEPS[typeKey] || CONFIG.CREEPS.scout;
    // Health scales gently with wave progression
    const hpScale = 1 + (this.wave - 1) * 0.12;

    const creep = {
      id: "creep_" + Math.random().toString(36).substr(2, 9),
      type: typeKey,
      name: base.name,
      hp: Math.round(base.hp * hpScale),
      maxHp: Math.round(base.hp * hpScale),
      speed: base.speed * 40, // pixels per second
      baseSpeed: base.speed * 40,
      reward: base.reward,
      color: base.color,
      radius: base.radius,
      x: this.waypoints[0].x,
      y: this.waypoints[0].y,
      waypointIdx: 0,
      slowTimer: 0,
      slowFactor: 1
    };

    this.creeps.push(creep);
  }

  // --------------------------------------------------------------------------
  // CREEP LOGIC
  // --------------------------------------------------------------------------
  updateCreeps(dt) {
    for (let i = this.creeps.length - 1; i >= 0; i--) {
      const creep = this.creeps[i];

      // Handle frost slow effect decay
      if (creep.slowTimer > 0) {
        creep.slowTimer -= dt;
        if (creep.slowTimer <= 0) {
          creep.slowFactor = 1;
        }
      }

      // Move towards next waypoint
      const targetWp = this.waypoints[creep.waypointIdx + 1];
      if (!targetWp) {
        // Reached the Sanctum Base!
        this.onCreepReachBase(creep, i);
        continue;
      }

      const dx = targetWp.x - creep.x;
      const dy = targetWp.y - creep.y;
      const dist = Math.hypot(dx, dy);
      const moveDist = creep.speed * creep.slowFactor * dt;

      if (dist <= moveDist) {
        creep.x = targetWp.x;
        creep.y = targetWp.y;
        creep.waypointIdx++;
      } else {
        creep.x += (dx / dist) * moveDist;
        creep.y += (dy / dist) * moveDist;
      }
    }

    // Check if wave is cleared
    if (this.waveState === "active" && this.creeps.length === 0 && this.spawnQueue.length === 0) {
      this.waveState = "idle";
    }
  }

  onCreepReachBase(creep, idx) {
    this.creeps.splice(idx, 1);
    const damage = creep.type === "boss" ? 5 : 1;
    this.lives = Math.max(0, this.lives - damage);
    this.shakeDuration = 0.3;
    sound.baseDamaged();

    if (this.lives <= 0 && this.waveState !== "gameover") {
      this.waveState = "gameover";
      sound.defeat();
    }
  }

  // --------------------------------------------------------------------------
  // TOWERS & COMBAT
  // --------------------------------------------------------------------------
  updateTowers(dt) {
    for (const tower of this.towers) {
      if (tower.cooldown > 0) {
        tower.cooldown -= dt;
      }

      if (tower.cooldown <= 0) {
        const target = this.findTargetForTower(tower);
        if (target) {
          this.fireTower(tower, target);
          tower.cooldown = tower.fireRate;
        }
      }
    }
  }

  findTargetForTower(tower) {
    let bestTarget = null;
    let maxProgress = -1;

    for (const creep of this.creeps) {
      const dist = Math.hypot(creep.x - tower.x, creep.y - tower.y);
      if (dist <= tower.range) {
        // "First" target priority: creep furthest along waypoints
        const progress = creep.waypointIdx * 1000 + Math.hypot(creep.x, creep.y);
        if (progress > maxProgress) {
          maxProgress = progress;
          bestTarget = creep;
        }
      }
    }
    return bestTarget;
  }

  fireTower(tower, target) {
    tower.angle = Math.atan2(target.y - tower.y, target.x - tower.x);

    if (tower.type === "tesla") {
      // Instant chain lightning
      sound.shootTesla();
      this.triggerTeslaStrike(tower, target);
      return;
    }

    if (tower.type === "archer") sound.shootArrow();
    if (tower.type === "cannon") sound.shootCannon();
    if (tower.type === "frost") sound.shootFrost();

    this.projectiles.push({
      id: "proj_" + Math.random().toString(36).substr(2, 9),
      towerType: tower.type,
      damage: tower.damage,
      speed: tower.bulletSpeed * 50,
      color: tower.bulletColor,
      splashRadius: tower.splashRadius || 0,
      slowFactor: tower.slowFactor || 1,
      slowDuration: tower.slowDuration || 0,
      ownerId: tower.ownerId,
      x: tower.x,
      y: tower.y,
      targetId: target.id,
      targetX: target.x,
      targetY: target.y
    });
  }

  triggerTeslaStrike(tower, primaryTarget) {
    const hitList = [primaryTarget];
    let current = primaryTarget;

    // Chain to nearby creeps
    for (let i = 1; i < (tower.chainTargets || 3); i++) {
      let nextTarget = null;
      let closestDist = 90;

      for (const c of this.creeps) {
        if (!hitList.includes(c)) {
          const d = Math.hypot(c.x - current.x, c.y - current.y);
          if (d < closestDist) {
            closestDist = d;
            nextTarget = c;
          }
        }
      }

      if (nextTarget) {
        hitList.push(nextTarget);
        current = nextTarget;
      } else {
        break;
      }
    }

    // Apply damage and spawn lightning spark particles
    for (let i = 0; i < hitList.length; i++) {
      const c = hitList[i];
      const damage = Math.round(tower.damage * (1 - i * 0.2));
      this.damageCreep(c, damage, tower.ownerId);
      this.spawnSparks(c.x, c.y, "#c084fc", 6);
    }
  }

  updateProjectiles(dt) {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      const target = this.creeps.find(c => c.id === p.targetId);

      if (target) {
        p.targetX = target.x;
        p.targetY = target.y;
      }

      const dx = p.targetX - p.x;
      const dy = p.targetY - p.y;
      const dist = Math.hypot(dx, dy);
      const step = p.speed * dt;

      if (dist <= step || dist < 8) {
        // Hit target
        this.onProjectileHit(p, target);
        this.projectiles.splice(i, 1);
      } else {
        p.x += (dx / dist) * step;
        p.y += (dy / dist) * step;
      }
    }
  }

  onProjectileHit(proj, directTarget) {
    if (proj.splashRadius > 0) {
      // Cannon Area of Effect Splash
      this.spawnSparks(proj.targetX, proj.targetY, "#f97316", 14);
      for (const creep of this.creeps) {
        const d = Math.hypot(creep.x - proj.targetX, creep.y - proj.targetY);
        if (d <= proj.splashRadius) {
          const falloff = 1 - (d / proj.splashRadius) * 0.4;
          this.damageCreep(creep, Math.round(proj.damage * falloff), proj.ownerId);
        }
      }
    } else {
      // Single target hit
      if (directTarget) {
        this.damageCreep(directTarget, proj.damage, proj.ownerId);

        // Apply Frost slow effect
        if (proj.slowFactor < 1) {
          directTarget.slowFactor = proj.slowFactor;
          directTarget.slowTimer = proj.slowDuration;
          this.spawnSparks(directTarget.x, directTarget.y, "#38bdf8", 8);
        } else {
          this.spawnSparks(directTarget.x, directTarget.y, proj.color, 5);
        }
      }
    }
  }

  damageCreep(creep, amount, attackerId) {
    creep.hp -= amount;

    if (creep.hp <= 0) {
      this.killCreep(creep, attackerId);
    }
  }

  killCreep(creep, killerId) {
    const idx = this.creeps.indexOf(creep);
    if (idx === -1) return;
    this.creeps.splice(idx, 1);

    sound.enemyKilled();
    this.spawnDeathParticles(creep.x, creep.y, creep.color);

    // Bounty distribution: killer gets full bounty, team gets co-op assist!
    const reward = creep.reward;
    const assist = Math.round(reward * CONFIG.COOP_BOUNTY_SHARE_RATIO);

    for (const pid of Object.keys(this.playerGold)) {
      if (pid === killerId) {
        this.playerGold[pid] += reward;
      } else {
        this.playerGold[pid] += assist;
      }
    }

    this.floatingTexts.push({
      text: `+🪙${reward}`,
      x: creep.x,
      y: creep.y - 12,
      color: "#fbbf24",
      opacity: 1
    });
  }

  // --------------------------------------------------------------------------
  // BUILDING & MANAGEMENT COMMANDS
  // --------------------------------------------------------------------------
  handleCommand(cmd, senderId) {
    if (!cmd) return;

    switch (cmd.type) {
      case "BUILD_TOWER": {
        const { towerType, col, row } = cmd;
        const config = CONFIG.TOWERS[towerType];
        if (!config) return;

        const senderGold = this.playerGold[senderId] || 0;
        if (senderGold < config.cost) return;

        // Check grid validity
        if (row < 0 || row >= CONFIG.GRID.ROWS || col < 0 || col >= CONFIG.GRID.COLS) return;
        if (this.grid[row][col] !== null) return; // Already occupied or path

        // Deduct gold
        this.playerGold[senderId] -= config.cost;

        // Find sender metadata for color/name
        const player = this.network.players.find(p => p.id === senderId);
        const ownerName = player ? player.name : "Ally";
        const ownerColor = player ? player.color : "#38bdf8";

        const newTower = {
          id: "tower_" + Math.random().toString(36).substr(2, 9),
          ownerId: senderId,
          ownerName,
          ownerColor,
          type: towerType,
          name: config.name,
          col,
          row,
          x: col * CONFIG.GRID.CELL_SIZE + CONFIG.GRID.CELL_SIZE / 2,
          y: row * CONFIG.GRID.CELL_SIZE + CONFIG.GRID.CELL_SIZE / 2,
          level: 1,
          cost: config.cost,
          totalInvested: config.cost,
          range: config.range,
          damage: config.damage,
          fireRate: config.fireRate,
          bulletSpeed: config.bulletSpeed,
          bulletColor: config.bulletColor,
          splashRadius: config.splashRadius || 0,
          slowFactor: config.slowFactor || 1,
          slowDuration: config.slowDuration || 0,
          chainTargets: config.chainTargets || 0,
          cooldown: 0,
          angle: 0
        };

        this.towers.push(newTower);
        this.grid[row][col] = newTower.id;

        sound.build();
        this.spawnSparks(newTower.x, newTower.y, ownerColor, 10);
        break;
      }

      case "UPGRADE_TOWER": {
        const tower = this.towers.find(t => t.id === cmd.towerId);
        if (!tower) return;

        const upgradeCost = Math.round(tower.cost * 0.85);
        const senderGold = this.playerGold[senderId] || 0;
        if (senderGold < upgradeCost) return;

        this.playerGold[senderId] -= upgradeCost;
        tower.level++;
        tower.totalInvested += upgradeCost;
        tower.damage = Math.round(tower.damage * 1.35);
        tower.range = Math.round(tower.range * 1.1);
        tower.fireRate = Math.max(0.2, tower.fireRate * 0.9);

        sound.upgrade();
        this.spawnSparks(tower.x, tower.y, "#86efac", 12);
        break;
      }

      case "SELL_TOWER": {
        const towerIdx = this.towers.findIndex(t => t.id === cmd.towerId);
        if (towerIdx === -1) return;
        const tower = this.towers[towerIdx];

        const refund = Math.round(tower.totalInvested * 0.65);
        if (this.playerGold[senderId] !== undefined) {
          this.playerGold[senderId] += refund;
        }

        this.grid[tower.row][tower.col] = null;
        this.towers.splice(towerIdx, 1);

        sound.sell();
        this.spawnSparks(tower.x, tower.y, "#f43f5e", 8);
        break;
      }

      case "START_WAVE":
        this.startNextWave();
        break;
    }
  }

  // --------------------------------------------------------------------------
  // STATE NETWORKING (Host -> Clients)
  // --------------------------------------------------------------------------
  broadcastState() {
    const payload = {
      type: "SYNC_STATE",
      state: {
        lives: this.lives,
        wave: this.wave,
        waveState: this.waveState,
        playerGold: this.playerGold,
        towers: this.towers,
        creeps: this.creeps.map(c => ({
          id: c.id,
          type: c.type,
          hp: c.hp,
          maxHp: c.maxHp,
          x: Math.round(c.x),
          y: Math.round(c.y),
          radius: c.radius,
          color: c.color,
          slowTimer: c.slowTimer
        })),
        projectiles: this.projectiles.map(p => ({
          x: Math.round(p.x),
          y: Math.round(p.y),
          color: p.color
        }))
      }
    };
    this.network.broadcast(payload);
  }

  applyStateSync(state) {
    this.lives = state.lives;
    this.wave = state.wave;
    this.waveState = state.waveState;
    this.playerGold = state.playerGold;
    this.towers = state.towers;
    this.creeps = state.creeps;
    this.projectiles = state.projectiles;

    // Refresh grid collision state for clients
    const { COLS, ROWS } = CONFIG.GRID;
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (!this.pathCells.has(`${c},${r}`)) {
          this.grid[r][c] = null;
        }
      }
    }
    for (const t of this.towers) {
      if (this.grid[t.row] && this.grid[t.row][t.col] !== undefined) {
        this.grid[t.row][t.col] = t.id;
      }
    }
  }

  // --------------------------------------------------------------------------
  // VISUAL PARTICLES
  // --------------------------------------------------------------------------
  spawnSparks(x, y, color, count = 8) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 25 + Math.random() * 50;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: 3 + Math.random() * 3,
        color,
        life: 0.35 + Math.random() * 0.25
      });
    }
  }

  spawnDeathParticles(x, y, color) {
    for (let i = 0; i < 12; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 40 + Math.random() * 70;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: 4 + Math.random() * 4,
        color,
        life: 0.5 + Math.random() * 0.3
      });
    }
  }

  // --------------------------------------------------------------------------
  // RENDERING
  // --------------------------------------------------------------------------
  render() {
    const ctx = this.ctx;
    const { width, height } = this.canvas;
    const { COLS, ROWS, CELL_SIZE } = CONFIG.GRID;

    ctx.save();

    // Camera shake effect
    if (this.shakeDuration > 0) {
      const shakeAmt = 5 * (this.shakeDuration / 0.3);
      ctx.translate((Math.random() - 0.5) * shakeAmt, (Math.random() - 0.5) * shakeAmt);
    }

    // Clear background
    ctx.fillStyle = "#0c1322";
    ctx.fillRect(0, 0, width, height);

    // 1. Draw Grid Lines & Grass
    ctx.strokeStyle = "rgba(255, 255, 255, 0.03)";
    ctx.lineWidth = 1;
    for (let r = 0; r <= ROWS; r++) {
      ctx.beginPath();
      ctx.moveTo(0, r * CELL_SIZE);
      ctx.lineTo(width, r * CELL_SIZE);
      ctx.stroke();
    }
    for (let c = 0; c <= COLS; c++) {
      ctx.beginPath();
      ctx.moveTo(c * CELL_SIZE, 0);
      ctx.lineTo(c * CELL_SIZE, height);
      ctx.stroke();
    }

    // 2. Draw The Winding Path
    ctx.fillStyle = "#1e293b";
    for (const key of this.pathCells) {
      const [c, r] = key.split(",").map(Number);
      ctx.fillRect(c * CELL_SIZE, r * CELL_SIZE, CELL_SIZE, CELL_SIZE);
    }

    // Decorative path center guideline
    ctx.strokeStyle = "#334155";
    ctx.lineWidth = 4;
    ctx.lineCap = "round";
    ctx.beginPath();
    for (let i = 0; i < this.waypoints.length; i++) {
      const wp = this.waypoints[i];
      if (i === 0) ctx.moveTo(wp.x, wp.y);
      else ctx.lineTo(wp.x, wp.y);
    }
    ctx.stroke();

    // Spawn Portal & Sanctum Base
    this.renderPortals(ctx);

    // 3. Draw Hover Placement Ghost & Range Preview
    this.renderPlacementPreview(ctx);

    // 4. Draw Towers
    for (const tower of this.towers) {
      this.renderTower(ctx, tower);
    }

    // Range preview for currently inspected tower
    if (this.inspectedTower) {
      ctx.strokeStyle = "rgba(56, 189, 248, 0.6)";
      ctx.lineWidth = 2;
      ctx.fillStyle = "rgba(56, 189, 248, 0.08)";
      ctx.beginPath();
      ctx.arc(this.inspectedTower.x, this.inspectedTower.y, this.inspectedTower.range, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    // 5. Draw Creeps
    for (const creep of this.creeps) {
      this.renderCreep(ctx, creep);
    }

    // 6. Draw Projectiles
    for (const p of this.projectiles) {
      ctx.fillStyle = p.color || "#fff";
      ctx.beginPath();
      ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    // 7. Draw Particles
    for (const pt of this.particles) {
      ctx.fillStyle = pt.color;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2);
      ctx.fill();
    }

    // 8. Draw Floating Texts
    for (const ft of this.floatingTexts) {
      ctx.save();
      ctx.fillStyle = ft.color;
      ctx.font = "bold 13px system-ui";
      ctx.globalAlpha = Math.max(0, ft.opacity);
      ctx.textAlign = "center";
      ctx.fillText(ft.text, ft.x, ft.y);
      ctx.restore();
    }

    // 9. Draw Co-op Teammate Cursors
    this.renderTeammateCursors(ctx);

    ctx.restore();
  }

  renderPortals(ctx) {
    const { CELL_SIZE } = CONFIG.GRID;
    const start = this.waypoints[0];
    const end = this.waypoints[this.waypoints.length - 1];

    // Spawn portal (Red glow)
    ctx.save();
    ctx.fillStyle = "#ef4444";
    ctx.shadowColor = "#ef4444";
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(start.x, start.y, CELL_SIZE * 0.35, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.font = "11px system-ui";
    ctx.textAlign = "center";
    ctx.fillText("SPAWN", start.x, start.y - 18);
    ctx.restore();

    // Sanctum Base (Cyan crystal)
    ctx.save();
    ctx.fillStyle = "#38bdf8";
    ctx.shadowColor = "#38bdf8";
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.arc(end.x, end.y, CELL_SIZE * 0.38, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.font = "bold 11px system-ui";
    ctx.textAlign = "center";
    ctx.fillText("SANCTUM", end.x, end.y - 18);
    ctx.restore();
  }

  renderPlacementPreview(ctx) {
    if (!this.selectedTowerType) return;
    const { col, row } = this.hoverGrid;
    if (col < 0 || row < 0) return;

    const { CELL_SIZE } = CONFIG.GRID;
    const x = col * CELL_SIZE;
    const y = row * CELL_SIZE;
    const cx = x + CELL_SIZE / 2;
    const cy = y + CELL_SIZE / 2;

    const isValid = this.grid[row] && this.grid[row][col] === null;
    const cfg = CONFIG.TOWERS[this.selectedTowerType];
    if (!cfg) return;

    // Range preview circle
    ctx.save();
    ctx.strokeStyle = isValid ? "rgba(34, 197, 94, 0.6)" : "rgba(239, 68, 68, 0.6)";
    ctx.fillStyle = isValid ? "rgba(34, 197, 94, 0.1)" : "rgba(239, 68, 68, 0.1)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(cx, cy, cfg.range, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Cell box highlight
    ctx.fillStyle = isValid ? "rgba(34, 197, 94, 0.3)" : "rgba(239, 68, 68, 0.3)";
    ctx.fillRect(x, y, CELL_SIZE, CELL_SIZE);
    ctx.restore();
  }

  renderTower(ctx, tower) {
    const { CELL_SIZE } = CONFIG.GRID;
    ctx.save();

    // Tower base platform
    ctx.fillStyle = "#1e293b";
    ctx.beginPath();
    ctx.arc(tower.x, tower.y, CELL_SIZE * 0.42, 0, Math.PI * 2);
    ctx.fill();

    // Owner player ring accent
    ctx.strokeStyle = tower.ownerColor || "#38bdf8";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(tower.x, tower.y, CELL_SIZE * 0.42, 0, Math.PI * 2);
    ctx.stroke();

    // Tower icon or core
    const cfg = CONFIG.TOWERS[tower.type];
    ctx.fillStyle = cfg ? cfg.color : "#fff";
    ctx.beginPath();
    ctx.arc(tower.x, tower.y, CELL_SIZE * 0.26, 0, Math.PI * 2);
    ctx.fill();

    // Level star badge if upgraded
    if (tower.level > 1) {
      ctx.fillStyle = "#facc15";
      ctx.font = "bold 10px system-ui";
      ctx.textAlign = "center";
      ctx.fillText(`★${tower.level}`, tower.x, tower.y + CELL_SIZE * 0.45);
    }

    ctx.restore();
  }

  renderCreep(ctx, creep) {
    ctx.save();

    // Frost aura indicator if chilled
    if (creep.slowTimer > 0) {
      ctx.strokeStyle = "#38bdf8";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(creep.x, creep.y, creep.radius + 3, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Creep Body
    ctx.fillStyle = creep.color || "#84cc16";
    ctx.beginPath();
    ctx.arc(creep.x, creep.y, creep.radius, 0, Math.PI * 2);
    ctx.fill();

    // Health Bar
    const barW = Math.max(22, creep.radius * 2);
    const barH = 4;
    const barX = creep.x - barW / 2;
    const barY = creep.y - creep.radius - 8;

    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillRect(barX, barY, barW, barH);

    const hpPercent = Math.max(0, creep.hp / creep.maxHp);
    ctx.fillStyle = hpPercent > 0.5 ? "#22c55e" : hpPercent > 0.25 ? "#f59e0b" : "#ef4444";
    ctx.fillRect(barX, barY, barW * hpPercent, barH);

    ctx.restore();
  }

  renderTeammateCursors(ctx) {
    const now = performance.now();
    for (const [id, cur] of Object.entries(this.otherCursors)) {
      if (now - cur.lastSeen > 3000) continue; // skip inactive cursors

      ctx.save();
      ctx.fillStyle = cur.color;
      ctx.beginPath();
      ctx.arc(cur.x, cur.y, 5, 0, Math.PI * 2);
      ctx.fill();

      // Teammate name tag
      ctx.font = "10px system-ui";
      ctx.fillStyle = "#fff";
      ctx.fillText(cur.name, cur.x + 8, cur.y - 4);
      ctx.restore();
    }
  }
}
