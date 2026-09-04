// ============================================================================
// 2D PIXEL ART URBAN ZOMBIE SURVIVAL ENGINE
// ============================================================================

import { CONFIG } from "./config.js";
import { sound } from "./audio.js";

export class PixelGameEngine {
  constructor(canvas, network) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.network = network;

    // Viewport & camera
    this.width = canvas.width;
    this.height = canvas.height;
    this.camera = { x: CONFIG.WORLD.WIDTH / 2, y: CONFIG.WORLD.HEIGHT / 2 };

    // World state
    this.worldWidth = CONFIG.WORLD.WIDTH;
    this.worldHeight = CONFIG.WORLD.HEIGHT;
    this.wave = 0;
    this.waveState = "idle"; // "idle", "spawning", "active", "gameover"
    this.teamScore = 0;

    // Assets
    this.mapImage = new Image();
    this.mapImage.src = "assets/urban_map.jpg";
    this.mapLoaded = false;
    this.mapImage.onload = () => { this.mapLoaded = true; };

    // Local player state
    this.myPlayer = {
      id: "local",
      x: this.worldWidth / 2,
      y: this.worldHeight / 2,
      vx: 0,
      vy: 0,
      angle: 0,
      charClass: "commando",
      hp: 120,
      maxHp: 120,
      ammo: 30,
      maxAmmo: 30,
      isReloading: false,
      reloadTimer: 0,
      fireCooldown: 0,
      abilityCooldownTimer: 0,
      isDowned: false
    };

    // Entities
    this.otherPlayers = {}; // peerId -> player object
    this.zombies = [];
    this.bullets = [];
    this.grenades = [];
    this.turrets = [];
    this.pickups = []; // medkits, ammo
    this.particles = [];
    this.floatingTexts = [];
    this.bloodSplats = [];

    // Spawner
    this.spawnQueue = [];
    this.spawnTimer = 0;
    this.spawnInterval = 0.65;

    // Input state
    this.keys = {};
    this.mouse = { screenX: 0, screenY: 0, worldX: 0, worldY: 0, isDown: false };

    // Game loop timing
    this.lastTime = performance.now();
    this.syncTimer = 0;
    this.screenShake = 0;

    this.setupInputListeners();
    this.setupNetworkHooks();
  }

  // --------------------------------------------------------------------------
  // INPUT HANDLING
  // --------------------------------------------------------------------------
  setupInputListeners() {
    window.addEventListener("keydown", (e) => {
      if (e.target.tagName === "INPUT") return;
      this.keys[e.key.toLowerCase()] = true;

      // Reload on R
      if (e.key.toLowerCase() === "r") {
        this.reloadWeapon();
      }
      // Ability on Space or E
      if (e.key === " " || e.key.toLowerCase() === "e") {
        e.preventDefault();
        this.triggerAbility();
      }
    });

    window.addEventListener("keyup", (e) => {
      this.keys[e.key.toLowerCase()] = false;
    });

    this.canvas.addEventListener("mousemove", (e) => {
      const rect = this.canvas.getBoundingClientRect();
      const scaleX = this.canvas.width / rect.width;
      const scaleY = this.canvas.height / rect.height;

      this.mouse.screenX = (e.clientX - rect.left) * scaleX;
      this.mouse.screenY = (e.clientY - rect.top) * scaleY;
      this.mouse.worldX = this.mouse.screenX + this.camera.x - this.width / 2;
      this.mouse.worldY = this.mouse.screenY + this.camera.y - this.height / 2;
    });

    this.canvas.addEventListener("mousedown", (e) => {
      if (e.button === 0) {
        this.mouse.isDown = true;
      } else if (e.button === 2) {
        // Right click ability
        e.preventDefault();
        this.triggerAbility();
      }
    });

    this.canvas.addEventListener("mouseup", (e) => {
      if (e.button === 0) this.mouse.isDown = false;
    });

    this.canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  }

  initLocalPlayer(charClass) {
    const cfg = CONFIG.CHARACTERS[charClass] || CONFIG.CHARACTERS.commando;
    this.myPlayer.id = this.network.myPeerId || "local";
    this.myPlayer.charClass = charClass;
    this.myPlayer.hp = cfg.hp;
    this.myPlayer.maxHp = cfg.hp;
    this.myPlayer.ammo = cfg.magSize;
    this.myPlayer.maxAmmo = cfg.magSize;
    this.myPlayer.x = this.worldWidth / 2 + (Math.random() - 0.5) * 80;
    this.myPlayer.y = this.worldHeight / 2 + (Math.random() - 0.5) * 80;
  }

  // --------------------------------------------------------------------------
  // GAME LOOP
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
    if (this.screenShake > 0) {
      this.screenShake -= dt * 15;
    }

    this.updateLocalPlayer(dt);
    this.updateCamera();
    this.updateBullets(dt);
    this.updateGrenades(dt);
    this.updateTurrets(dt);
    this.updateParticles(dt);
    this.updateFloatingTexts(dt);

    // Host & Solo authoritative updates
    if (this.network.isHost || this.network.isSolo) {
      this.updateSpawner(dt);
      this.updateZombies(dt);

      // Periodic state sync broadcast (18 updates/sec)
      this.syncTimer += dt;
      if (this.syncTimer >= 0.055) {
        this.syncTimer = 0;
        this.broadcastState();
      }
    } else {
      // Client sends local position update to Host
      this.syncTimer += dt;
      if (this.syncTimer >= 0.05) {
        this.syncTimer = 0;
        this.network.sendAction({
          type: "PLAYER_SYNC",
          x: Math.round(this.myPlayer.x),
          y: Math.round(this.myPlayer.y),
          angle: Math.round(this.myPlayer.angle * 100) / 100,
          hp: this.myPlayer.hp,
          charClass: this.myPlayer.charClass,
          isDowned: this.myPlayer.isDowned
        });
      }
    }
  }

  // --------------------------------------------------------------------------
  // LOCAL PLAYER PHYSICS & COMBAT
  // --------------------------------------------------------------------------
  updateLocalPlayer(dt) {
    const p = this.myPlayer;
    if (p.isDowned) return;

    const cfg = CONFIG.CHARACTERS[p.charClass] || CONFIG.CHARACTERS.commando;

    // Movement (WASD)
    let mx = 0;
    let my = 0;
    if (this.keys["w"] || this.keys["arrowup"]) my -= 1;
    if (this.keys["s"] || this.keys["arrowdown"]) my += 1;
    if (this.keys["a"] || this.keys["arrowleft"]) mx -= 1;
    if (this.keys["d"] || this.keys["arrowright"]) mx += 1;

    if (mx !== 0 && my !== 0) {
      mx *= 0.7071;
      my *= 0.7071;
    }

    const moveSpeed = cfg.speed * 60; // pixels per second
    p.x = Math.max(32, Math.min(this.worldWidth - 32, p.x + mx * moveSpeed * dt));
    p.y = Math.max(32, Math.min(this.worldHeight - 32, p.y + my * moveSpeed * dt));

    // Aim angle towards mouse cursor
    this.mouse.worldX = this.mouse.screenX + this.camera.x - this.width / 2;
    this.mouse.worldY = this.mouse.screenY + this.camera.y - this.height / 2;
    p.angle = Math.atan2(this.mouse.worldY - p.y, this.mouse.worldX - p.x);

    // Weapon Cooldown & Reloading
    if (p.fireCooldown > 0) p.fireCooldown -= dt;
    if (p.abilityCooldownTimer > 0) p.abilityCooldownTimer -= dt;

    if (p.isReloading) {
      p.reloadTimer -= dt;
      if (p.reloadTimer <= 0) {
        p.isReloading = false;
        p.ammo = p.maxAmmo;
      }
    }

    // Auto-fire while mouse is held down
    if (this.mouse.isDown && !p.isReloading && p.fireCooldown <= 0) {
      this.shootWeapon();
    }

    // Check pickups (medkits, ammo)
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const item = this.pickups[i];
      const dist = Math.hypot(item.x - p.x, item.y - p.y);
      if (dist < 32) {
        if (item.type === "medkit" && p.hp < p.maxHp) {
          p.hp = Math.min(p.maxHp, p.hp + 45);
          sound.heal();
          this.spawnSparks(p.x, p.y, "#22c55e", 8);
          this.pickups.splice(i, 1);
        } else if (item.type === "ammo" && p.ammo < p.maxAmmo) {
          p.ammo = p.maxAmmo;
          sound.reload();
          this.spawnSparks(p.x, p.y, "#f59e0b", 6);
          this.pickups.splice(i, 1);
        }
      }
    }
  }

  shootWeapon() {
    const p = this.myPlayer;
    const cfg = CONFIG.CHARACTERS[p.charClass];

    if (p.ammo <= 0) {
      this.reloadWeapon();
      return;
    }

    p.ammo--;
    p.fireCooldown = cfg.fireRate;

    // Play class-specific procedural gunshot audio
    if (p.charClass === "commando") sound.shootAssault();
    else if (p.charClass === "sniper") sound.shootSniper();
    else if (p.charClass === "medic") sound.shootSMG();
    else if (p.charClass === "heavy") sound.shootShotgun();
    else if (p.charClass === "engineer") sound.shootAssault();

    this.screenShake = p.charClass === "heavy" ? 4 : p.charClass === "sniper" ? 3 : 1;

    // Gun barrel muzzle offset
    const muzzleDist = 20;
    const originX = p.x + Math.cos(p.angle) * muzzleDist;
    const originY = p.y + Math.sin(p.angle) * muzzleDist;

    const count = cfg.pellets || 1;
    for (let i = 0; i < count; i++) {
      const spread = (Math.random() - 0.5) * (cfg.spread || 0.05);
      const angle = p.angle + spread;

      const bullet = {
        id: "b_" + Math.random().toString(36).substr(2, 9),
        ownerId: p.id,
        x: originX,
        y: originY,
        vx: Math.cos(angle) * (cfg.bulletSpeed * 60),
        vy: Math.sin(angle) * (cfg.bulletSpeed * 60),
        damage: cfg.damage,
        pierce: cfg.piercing || 1,
        color: cfg.color,
        life: 1.2
      };

      this.bullets.push(bullet);

      // Inform host/clients
      this.network.sendAction({
        type: "BULLET_SPAWN",
        bullet: {
          x: Math.round(originX),
          y: Math.round(originY),
          vx: Math.round(bullet.vx),
          vy: Math.round(bullet.vy),
          damage: bullet.damage,
          color: bullet.color
        }
      });
    }

    // Muzzle smoke / flash
    this.spawnMuzzleFlash(originX, originY, p.angle);
  }

  reloadWeapon() {
    const p = this.myPlayer;
    const cfg = CONFIG.CHARACTERS[p.charClass];
    if (p.isReloading || p.ammo === p.maxAmmo) return;

    p.isReloading = true;
    p.reloadTimer = cfg.reloadTime;
    sound.reload();
  }

  triggerAbility() {
    const p = this.myPlayer;
    const cfg = CONFIG.CHARACTERS[p.charClass];
    if (p.abilityCooldownTimer > 0) return;

    p.abilityCooldownTimer = cfg.abilityCooldown;

    if (p.charClass === "commando" || p.charClass === "heavy") {
      // Throw Explosive Grenade / C4
      const dx = this.mouse.worldX - p.x;
      const dy = this.mouse.worldY - p.y;
      const dist = Math.min(Math.hypot(dx, dy), 260);
      const angle = Math.atan2(dy, dx);

      this.grenades.push({
        x: p.x,
        y: p.y,
        targetX: p.x + Math.cos(angle) * dist,
        targetY: p.y + Math.sin(angle) * dist,
        timer: 1.2,
        damage: p.charClass === "heavy" ? 180 : 120,
        radius: p.charClass === "heavy" ? 90 : 70
      });
    } else if (p.charClass === "medic") {
      // Drop Field Medkit
      sound.heal();
      this.pickups.push({
        type: "medkit",
        x: p.x,
        y: p.y
      });
    } else if (p.charClass === "engineer") {
      // Deploy Sentry Turret
      sound.deployTurret();
      this.turrets.push({
        id: "turret_" + Math.random().toString(36).substr(2, 9),
        ownerId: p.id,
        x: p.x,
        y: p.y,
        angle: p.angle,
        range: 220,
        damage: 18,
        fireRate: 0.2,
        cooldown: 0,
        hp: 150
      });
    } else if (p.charClass === "sniper") {
      // Piercing Laser Shot
      sound.shootSniper();
      this.screenShake = 6;
      for (const z of this.zombies) {
        const d = Math.hypot(z.x - p.x, z.y - p.y);
        const a = Math.atan2(z.y - p.y, z.x - p.x);
        if (d < 450 && Math.abs(a - p.angle) < 0.2) {
          this.damageZombie(z, 250, p.id);
        }
      }
    }
  }

  // --------------------------------------------------------------------------
  // BULLETS & GRENADES
  // --------------------------------------------------------------------------
  updateBullets(dt) {
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;

      // Check collision with zombies (Host or Solo)
      if (this.network.isHost || this.network.isSolo) {
        for (let j = this.zombies.length - 1; j >= 0; j--) {
          const z = this.zombies[j];
          const dist = Math.hypot(z.x - b.x, z.y - b.y);
          if (dist < z.radius) {
            this.damageZombie(z, b.damage, b.ownerId);
            sound.zombieHit();
            b.pierce--;
            if (b.pierce <= 0) {
              b.life = 0;
              break;
            }
          }
        }
      }

      if (b.life <= 0 || b.x < 0 || b.x > this.worldWidth || b.y < 0 || b.y > this.worldHeight) {
        this.bullets.splice(i, 1);
      }
    }
  }

  updateGrenades(dt) {
    for (let i = this.grenades.length - 1; i >= 0; i--) {
      const g = this.grenades[i];
      g.timer -= dt;

      // Fly towards target
      g.x += (g.targetX - g.x) * 4 * dt;
      g.y += (g.targetY - g.y) * 4 * dt;

      if (g.timer <= 0) {
        // Boom!
        sound.grenadeExplode();
        this.screenShake = 10;
        this.spawnExplosionParticles(g.x, g.y, g.radius);

        if (this.network.isHost || this.network.isSolo) {
          for (const z of this.zombies) {
            const dist = Math.hypot(z.x - g.x, z.y - g.y);
            if (dist <= g.radius) {
              const falloff = 1 - (dist / g.radius) * 0.4;
              this.damageZombie(z, Math.round(g.damage * falloff), "grenade");
            }
          }
        }
        this.grenades.splice(i, 1);
      }
    }
  }

  updateTurrets(dt) {
    for (const t of this.turrets) {
      if (t.cooldown > 0) t.cooldown -= dt;

      // Find nearest zombie in range
      let nearest = null;
      let minDist = t.range;
      for (const z of this.zombies) {
        const d = Math.hypot(z.x - t.x, z.y - t.y);
        if (d < minDist) {
          minDist = d;
          nearest = z;
        }
      }

      if (nearest) {
        t.angle = Math.atan2(nearest.y - t.y, nearest.x - t.x);
        if (t.cooldown <= 0) {
          t.cooldown = t.fireRate;
          sound.shootAssault();

          this.bullets.push({
            id: "tb_" + Math.random().toString(36).substr(2, 9),
            ownerId: t.ownerId,
            x: t.x + Math.cos(t.angle) * 16,
            y: t.y + Math.sin(t.angle) * 16,
            vx: Math.cos(t.angle) * 800,
            vy: Math.sin(t.angle) * 800,
            damage: t.damage,
            pierce: 1,
            color: "#a855f7",
            life: 0.8
          });
        }
      }
    }
  }

  // --------------------------------------------------------------------------
  // ZOMBIE AI & WAVES (Host authoritative)
  // --------------------------------------------------------------------------
  startNextWave() {
    if (this.waveState === "spawning" || this.waveState === "active") return;

    this.wave++;
    this.waveState = "spawning";
    sound.waveStart();

    // Spawning distribution based on wave
    this.spawnQueue = this.generateWaveQueue(this.wave);
    this.spawnTimer = 0;
  }

  generateWaveQueue(waveNum) {
    const queue = [];
    const count = 12 + waveNum * 6;

    if (waveNum === 1) {
      for (let i = 0; i < 14; i++) queue.push("walker");
    } else if (waveNum === 2) {
      for (let i = 0; i < 12; i++) queue.push("walker");
      for (let i = 0; i < 8; i++) queue.push("sprinter");
    } else if (waveNum === 3) {
      for (let i = 0; i < 15; i++) queue.push("walker");
      for (let i = 0; i < 10; i++) queue.push("sprinter");
      for (let i = 0; i < 4; i++) queue.push("bloater");
    } else if (waveNum % 5 === 0) {
      // Goliath Titan Boss wave!
      for (let i = 0; i < 15; i++) queue.push("sprinter");
      for (let i = 0; i < 6; i++) queue.push("juggernaut");
      queue.push("titan");
    } else {
      for (let i = 0; i < Math.floor(count * 0.4); i++) queue.push("walker");
      for (let i = 0; i < Math.floor(count * 0.35); i++) queue.push("sprinter");
      for (let i = 0; i < Math.floor(count * 0.15); i++) queue.push("bloater");
      for (let i = 0; i < Math.floor(count * 0.1); i++) queue.push("juggernaut");
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
        this.spawnZombie(typeKey);
      } else {
        this.waveState = "active";
      }
    }
  }

  spawnZombie(typeKey) {
    const base = CONFIG.ZOMBIES[typeKey] || CONFIG.ZOMBIES.walker;
    const hpScale = 1 + (this.wave - 1) * 0.14;

    // Pick a random edge point around the big map
    const edge = Math.floor(Math.random() * 4);
    let x, y;
    if (edge === 0) { x = Math.random() * this.worldWidth; y = 20; }
    else if (edge === 1) { x = this.worldWidth - 20; y = Math.random() * this.worldHeight; }
    else if (edge === 2) { x = Math.random() * this.worldWidth; y = this.worldHeight - 20; }
    else { x = 20; y = Math.random() * this.worldHeight; }

    const zombie = {
      id: "zomb_" + Math.random().toString(36).substr(2, 9),
      type: typeKey,
      name: base.name,
      hp: Math.round(base.hp * hpScale),
      maxHp: Math.round(base.hp * hpScale),
      speed: base.speed * 42,
      damage: base.damage,
      score: base.score,
      color: base.color,
      radius: base.radius,
      x,
      y,
      angle: 0,
      animTime: Math.random() * 10
    };

    this.zombies.push(zombie);
    sound.zombieGroan();
  }

  updateZombies(dt) {
    // Collect all living survivor targets
    const targets = [this.myPlayer, ...Object.values(this.otherPlayers)].filter(p => !p.isDowned);

    for (let i = this.zombies.length - 1; i >= 0; i--) {
      const z = this.zombies[i];
      z.animTime += dt * 5;

      // Find closest living player
      let closest = null;
      let minDist = 99999;
      for (const t of targets) {
        const d = Math.hypot(t.x - z.x, t.y - z.y);
        if (d < minDist) {
          minDist = d;
          closest = t;
        }
      }

      if (closest) {
        z.angle = Math.atan2(closest.y - z.y, closest.x - z.x);
        z.x += Math.cos(z.angle) * z.speed * dt;
        z.y += Math.sin(z.angle) * z.speed * dt;

        // Attack player on contact
        if (minDist < z.radius + 14) {
          this.damagePlayer(closest, z.damage * dt * 2);
        }
      }
    }

    if (this.waveState === "active" && this.zombies.length === 0 && this.spawnQueue.length === 0) {
      this.waveState = "idle";
    }
  }

  damageZombie(zombie, amount, attackerId) {
    zombie.hp -= amount;

    this.floatingTexts.push({
      text: `-${amount}`,
      x: zombie.x,
      y: zombie.y - 12,
      color: "#ef4444",
      opacity: 1
    });

    if (zombie.hp <= 0) {
      this.killZombie(zombie);
    }
  }

  killZombie(zombie) {
    const idx = this.zombies.indexOf(zombie);
    if (idx === -1) return;
    this.zombies.splice(idx, 1);

    sound.zombieDeath();
    this.teamScore += zombie.score;

    // Blood splat on ground
    this.bloodSplats.push({
      x: zombie.x,
      y: zombie.y,
      radius: 8 + Math.random() * 8
    });
    if (this.bloodSplats.length > 80) this.bloodSplats.shift();

    // Occasional item drop (medkit or ammo)
    if (Math.random() < 0.12) {
      this.pickups.push({
        type: Math.random() < 0.5 ? "medkit" : "ammo",
        x: zombie.x,
        y: zombie.y
      });
    }

    this.spawnDeathParticles(zombie.x, zombie.y, zombie.color);
  }

  damagePlayer(player, amount) {
    player.hp = Math.max(0, player.hp - amount);
    sound.playerHurt();
    this.screenShake = 3;

    if (player.hp <= 0 && !player.isDowned) {
      player.isDowned = true;
      this.floatingTexts.push({
        text: "DOWNED!",
        x: player.x,
        y: player.y - 20,
        color: "#f43f5e",
        opacity: 1
      });
    }
  }

  // --------------------------------------------------------------------------
  // CAMERA & NETWORKING
  // --------------------------------------------------------------------------
  updateCamera() {
    // Smooth camera lag following local player
    const targetX = this.myPlayer.x;
    const targetY = this.myPlayer.y;

    this.camera.x += (targetX - this.camera.x) * 0.1;
    this.camera.y += (targetY - this.camera.y) * 0.1;

    // Clamp camera within map bounds
    const halfW = this.width / 2;
    const halfH = this.height / 2;
    this.camera.x = Math.max(halfW, Math.min(this.worldWidth - halfW, this.camera.x));
    this.camera.y = Math.max(halfH, Math.min(this.worldHeight - halfH, this.camera.y));
  }

  broadcastState() {
    this.network.broadcast({
      type: "SYNC_STATE",
      state: {
        wave: this.wave,
        waveState: this.waveState,
        teamScore: this.teamScore,
        zombies: this.zombies.map(z => ({
          id: z.id,
          type: z.type,
          x: Math.round(z.x),
          y: Math.round(z.y),
          hp: z.hp,
          maxHp: z.maxHp,
          angle: Math.round(z.angle * 100) / 100
        })),
        turrets: this.turrets,
        pickups: this.pickups
      }
    });
  }

  setupNetworkHooks() {
    this.network.onPlayerAction = (act, senderId) => {
      if (!act) return;

      if (act.type === "PLAYER_SYNC") {
        this.otherPlayers[senderId] = {
          id: senderId,
          x: act.x,
          y: act.y,
          angle: act.angle,
          hp: act.hp,
          charClass: act.charClass,
          isDowned: act.isDowned
        };
      } else if (act.type === "BULLET_SPAWN") {
        this.bullets.push({
          ...act.bullet,
          life: 1.0,
          pierce: 1
        });
      }
    };

    this.network.onStateReceived = (state) => {
      this.wave = state.wave;
      this.waveState = state.waveState;
      this.teamScore = state.teamScore;
      this.zombies = state.zombies;
      this.turrets = state.turrets;
      this.pickups = state.pickups;
    };
  }

  // --------------------------------------------------------------------------
  // PARTICLES & FX
  // --------------------------------------------------------------------------
  spawnMuzzleFlash(x, y, angle) {
    this.particles.push({
      x: x + Math.cos(angle) * 4,
      y: y + Math.sin(angle) * 4,
      vx: Math.cos(angle) * 20,
      vy: Math.sin(angle) * 20,
      radius: 4,
      color: "#fef08a",
      life: 0.08
    });
  }

  spawnExplosionParticles(x, y, radius) {
    for (let i = 0; i < 28; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 40 + Math.random() * 120;
      this.particles.push({
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        radius: 3 + Math.random() * 5,
        color: Math.random() < 0.5 ? "#f97316" : "#ef4444",
        life: 0.4 + Math.random() * 0.3
      });
    }
  }

  spawnDeathParticles(x, y, color) {
    for (let i = 0; i < 14; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 30 + Math.random() * 60;
      this.particles.push({
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        radius: 2.5 + Math.random() * 3,
        color,
        life: 0.35 + Math.random() * 0.25
      });
    }
  }

  spawnSparks(x, y, color, count) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 25 + Math.random() * 40;
      this.particles.push({
        x, y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        radius: 2,
        color,
        life: 0.3
      });
    }
  }

  updateParticles(dt) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
      p.radius = Math.max(0.5, p.radius - dt * 2);
      if (p.life <= 0) this.particles.splice(i, 1);
    }
  }

  updateFloatingTexts(dt) {
    for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
      const ft = this.floatingTexts[i];
      ft.y -= 25 * dt;
      ft.opacity -= 1.2 * dt;
      if (ft.opacity <= 0) this.floatingTexts.splice(i, 1);
    }
  }

  // --------------------------------------------------------------------------
  // RENDERING (Pixel Art Canvas)
  // --------------------------------------------------------------------------
  render() {
    const ctx = this.ctx;
    ctx.save();

    // Camera Screen Shake
    if (this.screenShake > 0) {
      ctx.translate((Math.random() - 0.5) * this.screenShake, (Math.random() - 0.5) * this.screenShake);
    }

    // Clear background
    ctx.fillStyle = "#111827";
    ctx.fillRect(0, 0, this.width, this.height);

    // Camera transform
    ctx.translate(Math.round(this.width / 2 - this.camera.x), Math.round(this.height / 2 - this.camera.y));

    // 1. Draw Big Urban Map Image (2048x2048 tiled 2x2 with generated pixel art)
    if (this.mapLoaded) {
      ctx.drawImage(this.mapImage, 0, 0, 1024, 1024);
      ctx.drawImage(this.mapImage, 1024, 0, 1024, 1024);
      ctx.drawImage(this.mapImage, 0, 1024, 1024, 1024);
      ctx.drawImage(this.mapImage, 1024, 1024, 1024, 1024);
    } else {
      ctx.fillStyle = "#1e293b";
      ctx.fillRect(0, 0, this.worldWidth, this.worldHeight);
    }

    // World border
    ctx.strokeStyle = "#ef4444";
    ctx.lineWidth = 4;
    ctx.strokeRect(0, 0, this.worldWidth, this.worldHeight);

    // 2. Draw Blood Splatters on Ground
    ctx.fillStyle = "rgba(185, 28, 28, 0.4)";
    for (const bs of this.bloodSplats) {
      ctx.beginPath();
      ctx.arc(bs.x, bs.y, bs.radius, 0, Math.PI * 2);
      ctx.fill();
    }

    // 3. Draw Pickups (Medkits & Ammo)
    for (const item of this.pickups) {
      ctx.save();
      ctx.translate(item.x, item.y);
      if (item.type === "medkit") {
        ctx.fillStyle = "#ef4444";
        ctx.fillRect(-10, -8, 20, 16);
        ctx.fillStyle = "#fff";
        ctx.fillRect(-3, -6, 6, 12);
        ctx.fillRect(-6, -3, 12, 6);
      } else {
        ctx.fillStyle = "#f59e0b";
        ctx.fillRect(-8, -6, 16, 12);
        ctx.fillStyle = "#111";
        ctx.font = "bold 8px monospace";
        ctx.fillText("AMMO", -7, 3);
      }
      ctx.restore();
    }

    // 4. Draw Engineer Turrets
    for (const t of this.turrets) {
      ctx.save();
      ctx.translate(t.x, t.y);
      ctx.fillStyle = "#334155";
      ctx.beginPath();
      ctx.arc(0, 0, 12, 0, Math.PI * 2);
      ctx.fill();

      // Gun barrel
      ctx.rotate(t.angle);
      ctx.fillStyle = "#a855f7";
      ctx.fillRect(0, -3, 16, 6);
      ctx.restore();
    }

    // 5. Draw Zombies
    for (const z of this.zombies) {
      this.renderZombie(ctx, z);
    }

    // 6. Draw Grenades
    for (const g of this.grenades) {
      ctx.fillStyle = "#f59e0b";
      ctx.beginPath();
      ctx.arc(g.x, g.y, 6, 0, Math.PI * 2);
      ctx.fill();
    }

    // 7. Draw Bullets
    for (const b of this.bullets) {
      ctx.fillStyle = b.color || "#fbbf24";
      ctx.beginPath();
      ctx.arc(b.x, b.y, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    // 8. Draw Teammates
    for (const p of Object.values(this.otherPlayers)) {
      this.renderPlayer(ctx, p, false);
    }

    // 9. Draw Local Player
    this.renderPlayer(ctx, this.myPlayer, true);

    // 10. Draw Particles
    for (const pt of this.particles) {
      ctx.fillStyle = pt.color;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, pt.radius, 0, Math.PI * 2);
      ctx.fill();
    }

    // 11. Draw Floating Damage Texts
    for (const ft of this.floatingTexts) {
      ctx.save();
      ctx.font = "bold 13px system-ui";
      ctx.fillStyle = ft.color;
      ctx.globalAlpha = Math.max(0, ft.opacity);
      ctx.textAlign = "center";
      ctx.fillText(ft.text, ft.x, ft.y);
      ctx.restore();
    }

    ctx.restore();

    // 12. Draw Minimap / Radar HUD in top right
    this.renderMinimap(ctx);
  }

  renderPlayer(ctx, p, isLocal) {
    ctx.save();
    ctx.translate(p.x, p.y);

    // Downed state
    if (p.isDowned) {
      ctx.fillStyle = "#ef4444";
      ctx.fillRect(-12, -4, 24, 8);
      ctx.fillStyle = "#fff";
      ctx.font = "bold 9px system-ui";
      ctx.fillText("REVIVE!", -14, -10);
      ctx.restore();
      return;
    }

    const cfg = CONFIG.CHARACTERS[p.charClass] || CONFIG.CHARACTERS.commando;

    // Team color aura ring
    ctx.strokeStyle = cfg.color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, 16, 0, Math.PI * 2);
    ctx.stroke();

    // Rotate body towards aim angle
    ctx.rotate(p.angle);

    // Character body (Pixel art soldier)
    ctx.fillStyle = cfg.color;
    ctx.fillRect(-8, -8, 16, 16);

    // Weapon barrel extending forward
    ctx.fillStyle = "#1f2937";
    ctx.fillRect(4, 2, 14, 4);

    // Laser sight for sniper
    if (p.charClass === "sniper") {
      ctx.strokeStyle = "rgba(56, 189, 248, 0.4)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(18, 4);
      ctx.lineTo(350, 4);
      ctx.stroke();
    }

    ctx.restore();

    // Player Health Bar (Non-rotated)
    ctx.save();
    ctx.translate(p.x, p.y);
    const barW = 28;
    const barH = 4;
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillRect(-barW / 2, -24, barW, barH);

    const ratio = Math.max(0, p.hp / p.maxHp);
    ctx.fillStyle = ratio > 0.5 ? "#22c55e" : ratio > 0.25 ? "#f59e0b" : "#ef4444";
    ctx.fillRect(-barW / 2, -24, barW * ratio, barH);

    // Nickname Tag
    ctx.font = "bold 10px system-ui";
    ctx.fillStyle = "#fff";
    ctx.textAlign = "center";
    ctx.fillText(isLocal ? `${this.network.playerName} (You)` : (p.name || "Ally"), 0, -28);
    ctx.restore();
  }

  renderZombie(ctx, z) {
    ctx.save();
    ctx.translate(z.x, z.y);
    ctx.rotate(z.angle);

    // Zombie Body
    ctx.fillStyle = z.color || "#4ade80";
    ctx.beginPath();
    ctx.arc(0, 0, z.radius, 0, Math.PI * 2);
    ctx.fill();

    // Outstretched reaching zombie arms
    ctx.fillStyle = "#1e293b";
    ctx.fillRect(z.radius - 2, -z.radius * 0.7, 8, 4);
    ctx.fillRect(z.radius - 2, z.radius * 0.7 - 4, 8, 4);

    // Glowing red eyes
    ctx.fillStyle = "#ef4444";
    ctx.fillRect(z.radius * 0.4, -3, 3, 2);
    ctx.fillRect(z.radius * 0.4, 2, 3, 2);

    ctx.restore();

    // Health Bar
    ctx.save();
    ctx.translate(z.x, z.y);
    const barW = Math.max(20, z.radius * 2);
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillRect(-barW / 2, -z.radius - 8, barW, 3);
    const r = Math.max(0, z.hp / z.maxHp);
    ctx.fillStyle = r > 0.5 ? "#22c55e" : "#ef4444";
    ctx.fillRect(-barW / 2, -z.radius - 8, barW * r, 3);
    ctx.restore();
  }

  renderMinimap(ctx) {
    const miniSize = 130;
    const pad = 14;
    const miniX = this.width - miniSize - pad;
    const miniY = pad;

    // Minimap Background
    ctx.save();
    ctx.fillStyle = "rgba(15, 23, 42, 0.85)";
    ctx.strokeStyle = "rgba(255, 255, 255, 0.2)";
    ctx.lineWidth = 2;
    ctx.fillRect(miniX, miniY, miniSize, miniSize);
    ctx.strokeRect(miniX, miniY, miniSize, miniSize);

    const scale = miniSize / this.worldWidth;

    // Zombies (Red dots)
    ctx.fillStyle = "#ef4444";
    for (const z of this.zombies) {
      ctx.fillRect(miniX + z.x * scale - 1, miniY + z.y * scale - 1, 2, 2);
    }

    // Teammates (Blue dots)
    ctx.fillStyle = "#38bdf8";
    for (const p of Object.values(this.otherPlayers)) {
      ctx.fillRect(miniX + p.x * scale - 2, miniY + p.y * scale - 2, 4, 4);
    }

    // Local Player (Green dot)
    ctx.fillStyle = "#22c55e";
    ctx.fillRect(miniX + this.myPlayer.x * scale - 2.5, miniY + this.myPlayer.y * scale - 2.5, 5, 5);

    ctx.restore();
  }
}
