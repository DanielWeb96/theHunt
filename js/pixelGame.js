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

    // Viewport & camera (Dynamic Fullscreen)
    this.resize();
    window.addEventListener("resize", () => this.resize());
    this.camera = { x: CONFIG.WORLD.WIDTH / 2, y: CONFIG.WORLD.HEIGHT / 2 };

    // World state
    this.worldWidth = CONFIG.WORLD.WIDTH;
    this.worldHeight = CONFIG.WORLD.HEIGHT;
    this.wave = 0;
    this.waveState = "idle"; // "idle", "spawning", "active", "gameover"
    this.teamScore = 0;

    // Assets: Nano Banana Generated Clean Urban Map (Crossroads)
    this.mapLoaded = false;
    this.mapImage = new Image();
    this.mapImage.onload = () => {
      this.mapLoaded = true;
      console.log("Urban map loaded successfully:", this.mapImage.naturalWidth, "x", this.mapImage.naturalHeight);
    };
    this.mapImage.onerror = (err) => {
      console.warn("Retrying map image with ./assets/urban_map.jpg", err);
      if (!this.mapImage.src.includes("./assets/")) {
        this.mapImage.src = "./assets/urban_map.jpg";
      }
    };
    this.mapImage.src = "assets/urban_map.jpg";
    if (this.mapImage.complete && this.mapImage.naturalWidth > 0) {
      this.mapLoaded = true;
    }

    // Preload Character Portrait Images (Commando, Sniper, Medic, Heavy, Engineer)
    this.characterImages = {};
    for (const [key, charCfg] of Object.entries(CONFIG.CHARACTERS)) {
      const img = new Image();
      img.src = charCfg.portrait;
      this.characterImages[key] = img;
    }

    // Urban Map Hitboxes (Buildings, Fortification Bunker, Sandbags, Vehicles)
    this.hitboxes = CONFIG.HITBOXES || CONFIG.HOUSES || [];
    this.houses = this.hitboxes; // Backwards compatibility alias
    this.showHitboxes = false; // Toggle with 'H' for visual hitbox inspect

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
      isDowned: false,
      isMoving: false,
      walkAnim: 0
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

  resize() {
    this.width = this.canvas.width = window.innerWidth;
    this.height = this.canvas.height = window.innerHeight;
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
      // Toggle Hitbox debug outline on H
      if (e.key.toLowerCase() === "h") {
        this.showHitboxes = !this.showHitboxes;
      }
    });

    window.addEventListener("keyup", (e) => {
      this.keys[e.key.toLowerCase()] = false;
    });

    this.canvas.addEventListener("mousemove", (e) => {
      this.mouse.screenX = e.clientX;
      this.mouse.screenY = e.clientY;
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
    this.resolveCollisions(this.myPlayer, 16);
  }

  // --------------------------------------------------------------------------
  // ADVANCED HITBOX COLLISION & RAYCAST SYSTEM
  // --------------------------------------------------------------------------
  checkHitboxCollision(x, y, radius = 14) {
    for (const b of this.hitboxes) {
      const closestX = Math.max(b.x, Math.min(x, b.x + b.w));
      const closestY = Math.max(b.y, Math.min(y, b.y + b.h));
      const dx = x - closestX;
      const dy = y - closestY;
      if (dx * dx + dy * dy < radius * radius) {
        return b;
      }
    }
    return null;
  }

  checkHouseCollision(x, y, radius = 14) {
    return this.checkHitboxCollision(x, y, radius) !== null;
  }

  resolveCollisions(entity, radius = 14, iterations = 3) {
    for (let iter = 0; iter < iterations; iter++) {
      let resolvedAny = false;

      for (const b of this.hitboxes) {
        const closestX = Math.max(b.x, Math.min(entity.x, b.x + b.w));
        const closestY = Math.max(b.y, Math.min(entity.y, b.y + b.h));
        const dx = entity.x - closestX;
        const dy = entity.y - closestY;
        const distSq = dx * dx + dy * dy;

        if (distSq < radius * radius) {
          resolvedAny = true;
          const dist = Math.sqrt(distSq);
          if (dist > 0.001) {
            const overlap = radius - dist;
            entity.x += (dx / dist) * overlap;
            entity.y += (dy / dist) * overlap;
          } else {
            // Center is deeply inside hitbox: eject to closest exterior face
            const distLeft = entity.x - b.x;
            const distRight = (b.x + b.w) - entity.x;
            const distTop = entity.y - b.y;
            const distBottom = (b.y + b.h) - entity.y;
            const minDist = Math.min(distLeft, distRight, distTop, distBottom);

            if (minDist === distLeft) entity.x = b.x - radius;
            else if (minDist === distRight) entity.x = b.x + b.w + radius;
            else if (minDist === distTop) entity.y = b.y - radius;
            else entity.y = b.y + b.h + radius;
          }
        }
      }

      if (!resolvedAny) break;
    }
  }

  resolveHouseCollisions(entity, radius = 14) {
    this.resolveCollisions(entity, radius, 3);
  }

  // Continuous Raycast / Segment-AABB Intersection (Fast Liang-Barsky / Slab algorithm)
  // Ensures fast-moving bullets never tunnel through obstacles
  checkRayHitboxCollision(x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    let closestT = 1.0;
    let hitResult = null;

    for (const b of this.hitboxes) {
      let tMin = 0.0;
      let tMax = closestT;

      // X-slab
      if (Math.abs(dx) < 1e-7) {
        if (x1 < b.x || x1 > b.x + b.w) continue;
      } else {
        let t1 = (b.x - x1) / dx;
        let t2 = (b.x + b.w - x1) / dx;
        if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
        tMin = Math.max(tMin, t1);
        tMax = Math.min(tMax, t2);
        if (tMin > tMax) continue;
      }

      // Y-slab
      if (Math.abs(dy) < 1e-7) {
        if (y1 < b.y || y1 > b.y + b.h) continue;
      } else {
        let t1 = (b.y - y1) / dy;
        let t2 = (b.y + b.h - y1) / dy;
        if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
        tMin = Math.max(tMin, t1);
        tMax = Math.min(tMax, t2);
        if (tMin > tMax) continue;
      }

      if (tMin >= 0 && tMin < closestT) {
        closestT = tMin;
        hitResult = {
          hit: true,
          t: tMin,
          x: x1 + dx * tMin,
          y: y1 + dy * tMin,
          hitbox: b
        };
      }
    }

    return hitResult;
  }

  spawnWallHitParticles(x, y) {
    for (let i = 0; i < 7; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 35 + Math.random() * 65;
      this.particles.push({
        x, y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        radius: 1.5 + Math.random() * 2,
        color: Math.random() < 0.35 ? "#f59e0b" : Math.random() < 0.7 ? "#94a3b8" : "#e2e8f0",
        life: 0.2 + Math.random() * 0.15
      });
    }
  }

  // --------------------------------------------------------------------------
  // GAME LOOP
  // --------------------------------------------------------------------------
  start() {
    this.lastTime = performance.now();
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
    const pRadius = 14;

    const isMoving = mx !== 0 || my !== 0;
    p.isMoving = isMoving;
    if (isMoving) {
      p.walkAnim = (p.walkAnim || 0) + dt * 10;
    }

    // Move X axis (with smooth hitbox sliding)
    if (mx !== 0) {
      p.x += mx * moveSpeed * dt;
      p.x = Math.max(pRadius, Math.min(this.worldWidth - pRadius, p.x));
      this.resolveCollisions(p, pRadius);
    }

    // Move Y axis (with smooth hitbox sliding)
    if (my !== 0) {
      p.y += my * moveSpeed * dt;
      p.y = Math.max(pRadius, Math.min(this.worldHeight - pRadius, p.y));
      this.resolveCollisions(p, pRadius);
    }

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
      const prevX = b.x;
      const prevY = b.y;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;

      // Continuous raycast collision check against all solid hitboxes
      const rayHit = this.checkRayHitboxCollision(prevX, prevY, b.x, b.y);
      if (rayHit) {
        this.spawnWallHitParticles(rayHit.x, rayHit.y);
        sound.bulletWallHit();
        b.life = 0;
        this.bullets.splice(i, 1);
        continue;
      }

      // Point-circle safeguard
      if (this.checkHitboxCollision(b.x, b.y, 4)) {
        this.spawnWallHitParticles(b.x, b.y);
        sound.bulletWallHit();
        b.life = 0;
        this.bullets.splice(i, 1);
        continue;
      }

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

      // Detonate immediately if grenade impacts house wall
      if (this.checkHouseCollision(g.x, g.y, 8)) {
        g.timer = 0;
      }

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

    // Spawn zombies at the 4 street avenues entering the city
    const entrance = Math.floor(Math.random() * 4);
    let x, y;
    if (entrance === 0) {
      // North Avenue (between northwest and northeast houses)
      x = 800 + Math.random() * 440;
      y = 20;
    } else if (entrance === 1) {
      // South Boulevard (between southwest and southeast houses)
      x = 800 + Math.random() * 440;
      y = this.worldHeight - 20;
    } else if (entrance === 2) {
      // West Street (between northwest and southwest houses)
      x = 20;
      y = 780 + Math.random() * 480;
    } else {
      // East Highway (between northeast and southeast houses)
      x = this.worldWidth - 20;
      y = 780 + Math.random() * 480;
    }

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

    this.resolveCollisions(zombie, zombie.radius);
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
        const vx = Math.cos(z.angle) * z.speed;
        const vy = Math.sin(z.angle) * z.speed;

        const startX = z.x;
        const startY = z.y;

        // Move X with hitbox collision (smooth wall-sliding around building corners)
        z.x += vx * dt;
        z.x = Math.max(z.radius, Math.min(this.worldWidth - z.radius, z.x));
        this.resolveCollisions(z, z.radius);

        // Move Y with hitbox collision (smooth wall-sliding around building corners)
        z.y += vy * dt;
        z.y = Math.max(z.radius, Math.min(this.worldHeight - z.radius, z.y));
        this.resolveCollisions(z, z.radius);

        // Corner slip assist: if movement was heavily blocked by obstacle, glide along perpendicular tangent
        const movedDist = Math.hypot(z.x - startX, z.y - startY);
        const expectedDist = z.speed * dt;
        if (movedDist < expectedDist * 0.4 && expectedDist > 0.001) {
          const perpAngle = z.angle + Math.PI / 2;
          const slipX = Math.cos(perpAngle) * z.speed * dt * 0.65;
          const slipY = Math.sin(perpAngle) * z.speed * dt * 0.65;
          z.x += slipX;
          z.y += slipY;
          this.resolveCollisions(z, z.radius);
        }

        // Soft zombie-zombie flocking separation so hordes flow around obstacles
        const checkWindow = Math.min(this.zombies.length, i + 6);
        for (let j = Math.max(0, i - 6); j < checkWindow; j++) {
          if (i === j) continue;
          const other = this.zombies[j];
          const cdx = z.x - other.x;
          const cdy = z.y - other.y;
          const cdist = Math.hypot(cdx, cdy);
          const minSep = z.radius + other.radius;
          if (cdist > 0 && cdist < minSep) {
            const push = (minSep - cdist) * 0.12;
            z.x += (cdx / cdist) * push;
            z.y += (cdy / cdist) * push;
          }
        }

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
    if (this.width >= this.worldWidth) {
      this.camera.x = this.worldWidth / 2;
    } else {
      this.camera.x = Math.max(halfW, Math.min(this.worldWidth - halfW, this.camera.x));
    }
    if (this.height >= this.worldHeight) {
      this.camera.y = this.worldHeight / 2;
    } else {
      this.camera.y = Math.max(halfH, Math.min(this.worldHeight - halfH, this.camera.y));
    }
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

    // 1. Draw Big Urban Map Image (Scaled across full 2048x2048 world)
    const isMapReady = this.mapLoaded || (this.mapImage.complete && this.mapImage.naturalWidth > 0);
    if (isMapReady) {
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(this.mapImage, 0, 0, this.worldWidth, this.worldHeight);
    } else {
      this.drawFallbackUrbanMap(ctx);
    }

    // World border
    ctx.strokeStyle = "#ef4444";
    ctx.lineWidth = 4;
    ctx.strokeRect(0, 0, this.worldWidth, this.worldHeight);

    // Debug: Draw Hitbox Outlines & Tactical Information (Toggle with H)
    if (this.showHitboxes) {
      ctx.save();
      ctx.font = "bold 13px monospace";
      for (const h of this.hitboxes) {
        let strokeCol = "#f43f5e";
        let fillCol = "rgba(244, 63, 94, 0.22)";
        let icon = "🏠";
        if (h.type === "fortification") {
          strokeCol = "#84cc16";
          fillCol = "rgba(132, 204, 22, 0.25)";
          icon = "🛡️";
        } else if (h.type === "cover") {
          strokeCol = "#eab308";
          fillCol = "rgba(234, 179, 8, 0.25)";
          icon = "🧱";
        } else if (h.type === "vehicle") {
          strokeCol = "#38bdf8";
          fillCol = "rgba(56, 189, 248, 0.25)";
          icon = "🚗";
        }

        ctx.fillStyle = fillCol;
        ctx.fillRect(h.x, h.y, h.w, h.h);
        ctx.strokeStyle = strokeCol;
        ctx.lineWidth = 2.5;
        ctx.strokeRect(h.x, h.y, h.w, h.h);

        // Corner bracket accents
        const bLen = Math.min(22, h.w / 4, h.h / 4);
        ctx.lineWidth = 4;
        ctx.beginPath();
        // Top-left
        ctx.moveTo(h.x, h.y + bLen); ctx.lineTo(h.x, h.y); ctx.lineTo(h.x + bLen, h.y);
        // Top-right
        ctx.moveTo(h.x + h.w - bLen, h.y); ctx.lineTo(h.x + h.w, h.y); ctx.lineTo(h.x + h.w, h.y + bLen);
        // Bottom-left
        ctx.moveTo(h.x, h.y + h.h - bLen); ctx.lineTo(h.x, h.y + h.h); ctx.lineTo(h.x + bLen, h.y + h.h);
        // Bottom-right
        ctx.moveTo(h.x + h.w - bLen, h.y + h.h); ctx.lineTo(h.x + h.w, h.y + h.h); ctx.lineTo(h.x + h.w, h.y + h.h - bLen);
        ctx.stroke();

        // Header pill badge
        const badgeText = `${icon} ${h.name} [${Math.round(h.w)}×${Math.round(h.h)}]`;
        const textWidth = ctx.measureText(badgeText).width;
        const textX = Math.max(10, Math.min(h.x + 12, this.worldWidth - textWidth - 20));
        const textY = Math.max(24, Math.min(h.y + 24, this.worldHeight - 12));

        ctx.fillStyle = "rgba(15, 23, 42, 0.9)";
        ctx.fillRect(textX - 6, textY - 14, textWidth + 12, 20);
        ctx.strokeStyle = strokeCol;
        ctx.lineWidth = 1.5;
        ctx.strokeRect(textX - 6, textY - 14, textWidth + 12, 20);

        ctx.fillStyle = "#ffffff";
        ctx.fillText(badgeText, textX, textY);
      }
      ctx.restore();
    }

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
    const cfg = CONFIG.CHARACTERS[p.charClass] || CONFIG.CHARACTERS.commando;
    const isMoving = p.isMoving || (p.vx && Math.abs(p.vx) > 0.1) || (p.vy && Math.abs(p.vy) > 0.1);
    const walkAnim = p.walkAnim || 0;

    ctx.save();
    ctx.translate(p.x, p.y);

    // 1. Soft Ambient Drop Shadow on Asphalt
    ctx.fillStyle = "rgba(0, 0, 0, 0.45)";
    ctx.beginPath();
    ctx.ellipse(0, 4, 22, 15, 0, 0, Math.PI * 2);
    ctx.fill();

    // Downed state
    if (p.isDowned) {
      ctx.fillStyle = "rgba(239, 68, 68, 0.25)";
      ctx.beginPath();
      ctx.arc(0, 0, 26 + Math.sin(Date.now() * 0.008) * 4, 0, Math.PI * 2);
      ctx.fill();

      // Prone human body
      ctx.save();
      ctx.rotate(p.angle + Math.PI / 2);
      ctx.fillStyle = "#1e293b";
      ctx.fillRect(-14, -8, 28, 16);
      ctx.fillStyle = cfg.color;
      ctx.fillRect(-10, -6, 20, 12);
      ctx.restore();

      ctx.font = "bold 10px monospace";
      ctx.fillStyle = "#ef4444";
      ctx.textAlign = "center";
      ctx.fillText("⚠️ DOWNED - REVIVE [SPACE]!", 0, -32);
      ctx.restore();
      return;
    }

    // ------------------------------------------------------------------------
    // TOP-DOWN HUMAN PERSON SPRITE (Rotated to aim direction)
    // ------------------------------------------------------------------------
    ctx.save();
    ctx.rotate(p.angle);
    ctx.scale(1.28, 1.28); // Heroic arcade scale for clear character silhouette

    const recoil = (p.fireCooldown > 0) ? -3.5 : 0;
    const step = isMoving ? Math.sin(walkAnim) * 7 : 0;

    // STEP 1: WALKING LEGS & COMBAT BOOTS
    let pantsCol = "#3f4a36"; // Commando olive
    let bootCol = "#111827";
    if (p.charClass === "sniper") {
      pantsCol = "#1e293b";
      bootCol = "#0f172a";
    } else if (p.charClass === "medic") {
      pantsCol = "#334155";
      bootCol = "#1e293b";
    } else if (p.charClass === "heavy") {
      pantsCol = "#293241";
      bootCol = "#0f172a";
    } else if (p.charClass === "engineer") {
      pantsCol = "#573a1e";
      bootCol = "#38220f";
    }

    // Left leg & boot
    ctx.fillStyle = pantsCol;
    ctx.fillRect(-13 - step, -11, 11, 6);
    ctx.fillStyle = bootCol;
    ctx.fillRect(-6 - step, -11.5, 6, 7);

    // Right leg & boot
    ctx.fillStyle = pantsCol;
    ctx.fillRect(-13 + step, 5, 11, 6);
    ctx.fillStyle = bootCol;
    ctx.fillRect(-6 + step, 4.5, 6, 7);

    // STEP 2: CLASS-SPECIFIC TORSO, SHOULDERS & GEAR
    if (p.charClass === "commando") {
      // Commando Military Camo Vest & Radio Pack
      // Backpack / radio on rear
      ctx.fillStyle = "#1e293b";
      ctx.fillRect(-13, -7, 6, 14);
      // Radio antenna
      ctx.fillStyle = "#0f172a";
      ctx.fillRect(-16, -9, 4, 1.5);

      // Shoulders & Torso
      ctx.fillStyle = "#2d3b26"; // olive drab vest
      ctx.beginPath();
      ctx.roundRect(-8, -12, 17, 24, 4);
      ctx.fill();

      // Chest ammo mag pouches
      ctx.fillStyle = "#41533b";
      ctx.fillRect(0, -9, 6, 5);
      ctx.fillRect(0, -2, 6, 5);
      ctx.fillRect(0, 5, 6, 5);

      // Commando Camo Combat Helmet
      ctx.fillStyle = "#3f4a36";
      ctx.beginPath();
      ctx.arc(1, 0, 7.5, 0, Math.PI * 2);
      ctx.fill();
      // Camo splotches
      ctx.fillStyle = "#283624";
      ctx.fillRect(-2, -3, 5, 4);
      // NVG Mount
      ctx.fillStyle = "#111827";
      ctx.fillRect(6, -2, 3, 4);
      // Headset earmuffs
      ctx.fillStyle = "#1e293b";
      ctx.fillRect(0, -8.5, 4, 2);
      ctx.fillRect(0, 6.5, 4, 2);

      // Arms & M4A1 Assault Rifle
      ctx.fillStyle = "#3f4a36";
      // Right arm to trigger
      ctx.fillRect(-2, 6, 12, 5);
      // Left arm forward to foregrip
      ctx.beginPath();
      ctx.moveTo(-2, -10);
      ctx.lineTo(16 + recoil, -3);
      ctx.lineTo(14 + recoil, 1);
      ctx.lineTo(-4, -6);
      ctx.closePath();
      ctx.fill();

      // Hands
      ctx.fillStyle = "#334155";
      ctx.fillRect(8 + recoil, 4, 4, 4);
      ctx.fillRect(15 + recoil, -3, 4, 4);

      // M4A1 Rifle
      ctx.fillStyle = "#111827";
      ctx.fillRect(1 + recoil, 3.5, 8, 4); // stock
      ctx.fillRect(9 + recoil, 2.5, 10, 4.5); // receiver
      ctx.fillStyle = "#334155";
      ctx.fillRect(11 + recoil, 0.5, 5, 2.5); // optic sight
      ctx.fillStyle = "#0f172a";
      ctx.fillRect(13 + recoil, 6.5, 3, 5); // curved mag
      ctx.fillStyle = "#41533b";
      ctx.fillRect(18 + recoil, 3, 7, 3.5); // camo handguard
      ctx.fillStyle = "#111827";
      ctx.fillRect(25 + recoil, 3.5, 6, 2.5); // barrel & flash hider

    } else if (p.charClass === "sniper") {
      // Sniper Dark Cloak & Barrett .50 Cal
      // Back ghillie roll
      ctx.fillStyle = "#121814";
      ctx.fillRect(-14, -8, 6, 16);

      // Dark shrouded cloak over shoulders
      ctx.fillStyle = "#18201a";
      ctx.beginPath();
      ctx.roundRect(-9, -13, 18, 26, 6);
      ctx.fill();

      // Cloak folds / highlights
      ctx.strokeStyle = "#28362b";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(-8, -8); ctx.lineTo(2, -11);
      ctx.moveTo(-8, 8); ctx.lineTo(2, 11);
      ctx.stroke();

      // Dark Hood pulled forward
      ctx.fillStyle = "#141a16";
      ctx.beginPath();
      ctx.arc(1, 0, 7.5, 0, Math.PI * 2);
      ctx.fill();

      // Glowing Green NVG Optics (Dual Night Vision)
      ctx.fillStyle = "#22c55e";
      ctx.fillRect(6, -3.5, 3, 2.5);
      ctx.fillRect(6, 1, 3, 2.5);
      ctx.fillStyle = "#86efac";
      ctx.fillRect(7, -3, 1.5, 1.5);
      ctx.fillRect(7, 1.5, 1.5, 1.5);

      // Arms & Barrett .50 Cal Sniper
      ctx.fillStyle = "#18201a";
      ctx.fillRect(-2, 7, 11, 5);
      ctx.beginPath();
      ctx.moveTo(-2, -11);
      ctx.lineTo(18 + recoil, -4);
      ctx.lineTo(16 + recoil, 0);
      ctx.lineTo(-4, -7);
      ctx.closePath();
      ctx.fill();

      // Hands
      ctx.fillStyle = "#0f172a";
      ctx.fillRect(7 + recoil, 5, 4, 4);
      ctx.fillRect(17 + recoil, -3, 4, 4);

      // Barrett .50 Cal Sniper Rifle
      ctx.fillStyle = "#0f172a";
      ctx.fillRect(0 + recoil, 3, 8, 4); // stock
      ctx.fillRect(7 + recoil, 2, 14, 5.5); // heavy receiver
      ctx.fillStyle = "#1e293b";
      ctx.fillRect(10 + recoil, -1.5, 11, 3.5); // sniper scope
      ctx.fillStyle = "#38bdf8";
      ctx.fillRect(19 + recoil, -1, 2, 2.5); // scope lens
      ctx.fillStyle = "#0f172a";
      ctx.fillRect(20 + recoil, 3, 18, 3.2); // long heavy barrel
      ctx.fillRect(36 + recoil, 1.5, 5, 6); // massive muzzle brake

      // Tactical Cyan Laser Sight Beam
      ctx.save();
      ctx.strokeStyle = "rgba(56, 189, 248, 0.65)";
      ctx.lineWidth = 1.2;
      ctx.setLineDash([8, 6]);
      ctx.beginPath();
      ctx.moveTo(40 + recoil, 3);
      ctx.lineTo(440, 3);
      ctx.stroke();
      ctx.restore();

    } else if (p.charClass === "medic") {
      // Combat Field Medic (Dr. Elena) with Red Cross & Dual SMGs
      // Medical Trauma Backpack on rear with Red Cross
      ctx.fillStyle = "#334155";
      ctx.fillRect(-14, -8, 6, 16);
      // White patch with Red Cross
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(-13, -4, 4, 8);
      ctx.fillStyle = "#ef4444";
      ctx.fillRect(-13, -1, 4, 2);
      ctx.fillRect(-12, -3, 2, 6);

      // White & Light-Grey Tactical Jacket
      ctx.fillStyle = "#e2e8f0";
      ctx.beginPath();
      ctx.roundRect(-8, -11, 16, 22, 4);
      ctx.fill();

      // Red medical stripes on shoulders
      ctx.fillStyle = "#ef4444";
      ctx.fillRect(-4, -11.5, 6, 2.5);
      ctx.fillRect(-4, 9, 6, 2.5);

      // Head with high ponytail & headband
      // Brunette hair
      ctx.fillStyle = "#451a03";
      ctx.beginPath();
      ctx.arc(0, 0, 7, 0, Math.PI * 2);
      ctx.fill();
      // High combat ponytail extending backward with gentle motion sway
      const hairSway = isMoving ? Math.sin(walkAnim * 1.5) * 3 : 0;
      ctx.beginPath();
      ctx.ellipse(-10, hairSway, 6, 3.5, -0.15, 0, Math.PI * 2);
      ctx.fill();
      // Tactical headband
      ctx.fillStyle = "#1e293b";
      ctx.fillRect(-2, -6, 3, 12);
      // Comms headset
      ctx.fillStyle = "#0f172a";
      ctx.fillRect(-1, 5.5, 3, 2);

      // Dual Vector SMGs (Akimbo Arms)
      ctx.fillStyle = "#cbd5e1"; // jacket sleeves
      ctx.fillRect(-2, -10, 10, 4.5);
      ctx.fillRect(-2, 5.5, 10, 4.5);

      // Hands
      ctx.fillStyle = "#334155";
      ctx.fillRect(7 + recoil, -10, 3.5, 4);
      ctx.fillRect(7 + recoil, 5.5, 3.5, 4);

      // Top Vector SMG
      ctx.fillStyle = "#1e293b";
      ctx.fillRect(7 + recoil, -11, 13, 4.5);
      ctx.fillStyle = "#ef4444";
      ctx.fillRect(10 + recoil, -12.5, 3, 2); // red dot
      ctx.fillStyle = "#0f172a";
      ctx.fillRect(11 + recoil, -6.5, 3, 4); // mag

      // Bottom Vector SMG
      ctx.fillStyle = "#1e293b";
      ctx.fillRect(7 + recoil, 5.5, 13, 4.5);
      ctx.fillStyle = "#ef4444";
      ctx.fillRect(10 + recoil, 4, 3, 2); // red dot
      ctx.fillStyle = "#0f172a";
      ctx.fillRect(11 + recoil, 10, 3, 4); // mag

    } else if (p.charClass === "heavy") {
      // Heavy Blast Demolitionist with Hazard Shoulders & SPAS-12 Shotgun
      // Ammo canister drum pack on back
      ctx.fillStyle = "#1e293b";
      ctx.fillRect(-15, -9, 7, 18);

      // Massive 26px Broad Blast Armor
      ctx.fillStyle = "#293241";
      ctx.beginPath();
      ctx.roundRect(-9, -14, 18, 28, 5);
      ctx.fill();

      // Yellow & Black Hazard Stripes on Shoulder Pauldrons
      // Left shoulder hazard stripes
      ctx.fillStyle = "#eab308";
      ctx.fillRect(-5, -14, 10, 5);
      ctx.fillStyle = "#0f172a";
      ctx.fillRect(-3, -14, 2.5, 5);
      ctx.fillRect(2, -14, 2.5, 5);

      // Right shoulder hazard stripes
      ctx.fillStyle = "#eab308";
      ctx.fillRect(-5, 9, 10, 5);
      ctx.fillStyle = "#0f172a";
      ctx.fillRect(-3, 9, 2.5, 5);
      ctx.fillRect(2, 9, 2.5, 5);

      // Shotgun shell bandolier across chest
      ctx.fillStyle = "#ef4444";
      ctx.fillRect(-3, -7, 4, 3);
      ctx.fillRect(0, -3, 4, 3);
      ctx.fillRect(3, 1, 4, 3);
      ctx.fillStyle = "#fbbf24";
      ctx.fillRect(-4, -7, 1.5, 3);
      ctx.fillRect(-1, -3, 1.5, 3);
      ctx.fillRect(2, 1, 1.5, 3);

      // Heavy Blast Helmet with Face Visor & Respirator
      ctx.fillStyle = "#3f4a36";
      ctx.beginPath();
      ctx.arc(1, 0, 8.5, 0, Math.PI * 2);
      ctx.fill();
      // Dark Visor
      ctx.fillStyle = "#0f172a";
      ctx.fillRect(3, -4, 4, 8);
      // Respirator filter
      ctx.fillStyle = "#64748b";
      ctx.beginPath();
      ctx.arc(7, 0, 3, 0, Math.PI * 2);
      ctx.fill();

      // Armored Arms & SPAS-12 Shotgun
      ctx.fillStyle = "#293241";
      ctx.fillRect(-2, 7, 12, 6);
      ctx.beginPath();
      ctx.moveTo(-2, -12);
      ctx.lineTo(16 + recoil, -3);
      ctx.lineTo(14 + recoil, 2);
      ctx.lineTo(-4, -7);
      ctx.closePath();
      ctx.fill();

      // Heavy Gloves
      ctx.fillStyle = "#1e293b";
      ctx.fillRect(7 + recoil, 5.5, 5, 5);
      ctx.fillRect(15 + recoil, -3, 5, 5);

      // SPAS-12 Heavy Shotgun
      ctx.fillStyle = "#0f172a";
      ctx.fillRect(2 + recoil, 3, 6, 5); // folding stock
      ctx.fillRect(7 + recoil, 2, 14, 6.5); // wide receiver
      ctx.fillStyle = "#f59e0b";
      ctx.fillRect(9 + recoil, 3.5, 5, 2); // hazard accent
      ctx.fillStyle = "#475569";
      ctx.fillRect(15 + recoil, 3, 6, 4.5); // ribbed pump
      ctx.fillStyle = "#1e293b";
      ctx.fillRect(20 + recoil, 3, 9, 3.5); // twin heavy barrels

    } else {
      // Combat Engineer (Hank 'Spanner') with High-Vis Orange Vest, Wrench & Riot Carbine
      // Tool backpack on rear
      ctx.fillStyle = "#451a03";
      ctx.fillRect(-13, -7, 6, 14);

      // Steel Pipe Wrench strapped across back (Silver jaw head visible!)
      ctx.fillStyle = "#cbd5e1";
      ctx.fillRect(-15, -12, 7, 5);
      ctx.fillStyle = "#64748b";
      ctx.fillRect(-13, -10, 3, 3); // wrench hole
      ctx.fillStyle = "#94a3b8";
      ctx.fillRect(-12, -8, 2.5, 12); // wrench handle

      // Shoulder Sentry Camera / Sensor Pod on right shoulder
      ctx.fillStyle = "#334155";
      ctx.fillRect(-8, 8, 7, 5);
      ctx.fillStyle = "#ef4444";
      ctx.beginPath();
      ctx.arc(-4, 10.5, 1.5, 0, Math.PI * 2); // sensor lens
      ctx.fill();

      // High-Visibility Safety Orange Vest
      ctx.fillStyle = "#ea580c";
      ctx.beginPath();
      ctx.roundRect(-8, -11, 16, 22, 4);
      ctx.fill();

      // Reflective Silver Safety Stripes
      ctx.fillStyle = "#e2e8f0";
      ctx.fillRect(-6, -7, 12, 2.5);
      ctx.fillRect(-6, 3, 12, 2.5);

      // Head with tousled hair & workshop safety goggles
      ctx.fillStyle = "#5c3a21"; // brown hair
      ctx.beginPath();
      ctx.arc(0, 0, 7.5, 0, Math.PI * 2);
      ctx.fill();
      // Workshop safety goggles on forehead
      ctx.fillStyle = "#0f172a";
      ctx.fillRect(1, -5, 4, 10);
      ctx.fillStyle = "#38bdf8";
      ctx.fillRect(2, -4, 2, 3.5);
      ctx.fillRect(2, 0.5, 2, 3.5);

      // Tanned Arms with Leather Gloves
      ctx.fillStyle = "#fed7aa"; // bare arms
      ctx.fillRect(-2, 6, 11, 5);
      ctx.beginPath();
      ctx.moveTo(-2, -9);
      ctx.lineTo(15 + recoil, -2);
      ctx.lineTo(13 + recoil, 2);
      ctx.lineTo(-4, -5);
      ctx.closePath();
      ctx.fill();

      // Leather work gloves
      ctx.fillStyle = "#78350f";
      ctx.fillRect(7 + recoil, 4.5, 4, 4);
      ctx.fillRect(14 + recoil, -2, 4, 4);

      // Riot Carbine
      ctx.fillStyle = "#1e293b";
      ctx.fillRect(2 + recoil, 3, 6, 4);
      ctx.fillRect(8 + recoil, 2, 12, 5);
      ctx.fillStyle = "#a855f7";
      ctx.fillRect(11 + recoil, 0, 4, 2); // holographic optic
      ctx.fillStyle = "#111827";
      ctx.fillRect(19 + recoil, 3, 7, 3); // barrel

      // Flashlight cone casting forward
      const grad = ctx.createRadialGradient(24, 3, 4, 180, 3, 80);
      grad.addColorStop(0, "rgba(255, 255, 200, 0.22)");
      grad.addColorStop(1, "rgba(255, 255, 200, 0)");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(24, 3);
      ctx.arc(24, 3, 160, -0.25, 0.25);
      ctx.closePath();
      ctx.fill();
    }

    // STEP 3: MUZZLE FLASH ON FIRING
    if (p.fireCooldown > 0 && p.fireCooldown > cfg.fireRate * 0.52) {
      let muzzleX = 27;
      let muzzleY = 3.5;
      if (p.charClass === "sniper") { muzzleX = 41; muzzleY = 3; }
      else if (p.charClass === "medic") { muzzleX = 20; muzzleY = -9; }
      else if (p.charClass === "heavy") { muzzleX = 29; muzzleY = 4.5; }
      else if (p.charClass === "engineer") { muzzleX = 26; muzzleY = 4; }

      // Outer orange star
      ctx.fillStyle = "#f59e0b";
      ctx.beginPath();
      ctx.arc(muzzleX, muzzleY, 7, 0, Math.PI * 2);
      ctx.fill();
      // Inner yellow bright core
      ctx.fillStyle = "#fef08a";
      ctx.beginPath();
      ctx.arc(muzzleX + 1, muzzleY, 3.5, 0, Math.PI * 2);
      ctx.fill();

      // Medic second muzzle flash for akimbo
      if (p.charClass === "medic") {
        ctx.fillStyle = "#f59e0b";
        ctx.beginPath();
        ctx.arc(muzzleX, 7.5, 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#fef08a";
        ctx.beginPath();
        ctx.arc(muzzleX + 1, 7.5, 3.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.restore(); // end person rotation

    // STEP 4: FLOATING HUD ABOVE SURVIVOR (Health bar, Class Icon, Name Tag)
    // Reloading indicator
    if (p.isReloading) {
      const cfgReload = cfg.reloadTime || 1.5;
      const progress = 1 - (p.reloadTimer / cfgReload);
      ctx.save();
      ctx.strokeStyle = "#f59e0b";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, -6, 22, -Math.PI / 2, -Math.PI / 2 + progress * Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = "#fbbf24";
      ctx.font = "bold 9px monospace";
      ctx.textAlign = "center";
      ctx.fillText("RELOAD", 0, -32);
      ctx.restore();
    }

    // Health Bar
    const barW = 34;
    const barH = 4;
    const barY = -30;
    ctx.fillStyle = "rgba(15, 23, 42, 0.85)";
    ctx.fillRect(-barW / 2 - 1, barY - 1, barW + 2, barH + 2);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.25)";
    ctx.lineWidth = 1;
    ctx.strokeRect(-barW / 2 - 1, barY - 1, barW + 2, barH + 2);

    const ratio = Math.max(0, p.hp / p.maxHp);
    ctx.fillStyle = ratio > 0.5 ? "#22c55e" : ratio > 0.25 ? "#f59e0b" : "#ef4444";
    ctx.fillRect(-barW / 2, barY, barW * ratio, barH);

    // Class icon badge
    let classIcon = "⭐";
    if (p.charClass === "sniper") classIcon = "🎯";
    else if (p.charClass === "medic") classIcon = "✚";
    else if (p.charClass === "heavy") classIcon = "💥";
    else if (p.charClass === "engineer") classIcon = "⚙️";

    // Name Tag
    const displayName = isLocal ? `${classIcon} ${cfg.name} (You)` : `${classIcon} ${p.name || cfg.name}`;
    ctx.font = "bold 10px system-ui";
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.shadowColor = "rgba(0, 0, 0, 0.9)";
    ctx.shadowBlur = 4;
    ctx.fillText(displayName, 0, barY - 5);
    ctx.shadowBlur = 0;

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

  drawFallbackUrbanMap(ctx) {
    // Asphalt road base
    ctx.fillStyle = "#1e232a";
    ctx.fillRect(0, 0, this.worldWidth, this.worldHeight);

    const midX = this.worldWidth / 2;
    const midY = this.worldHeight / 2;
    const roadW = 280;

    // Hitbox structures (Buildings, Outpost Bunker, Sandbags, Vehicles)
    for (const h of this.hitboxes) {
      if (h.type === "fortification") {
        ctx.fillStyle = "#365314";
        ctx.strokeStyle = "#84cc16";
      } else if (h.type === "cover") {
        ctx.fillStyle = "#713f12";
        ctx.strokeStyle = "#eab308";
      } else if (h.type === "vehicle") {
        ctx.fillStyle = h.id === "car_red" ? "#7f1d1d" : "#0c4a6e";
        ctx.strokeStyle = h.id === "car_red" ? "#ef4444" : "#38bdf8";
      } else {
        ctx.fillStyle = "#14171f";
        ctx.strokeStyle = "#334155";
      }
      ctx.lineWidth = 2;
      ctx.fillRect(h.x, h.y, h.w, h.h);
      ctx.strokeRect(h.x, h.y, h.w, h.h);
    }

    // Sidewalk curbs
    ctx.fillStyle = "#374151";
    ctx.fillRect(midX - roadW / 2 - 20, 0, 20, this.worldHeight);
    ctx.fillRect(midX + roadW / 2, 0, 20, this.worldHeight);
    ctx.fillRect(0, midY - roadW / 2 - 20, this.worldWidth, 20);
    ctx.fillRect(0, midY + roadW / 2, this.worldWidth, 20);

    // Double yellow center lines (North-South)
    ctx.fillStyle = "#eab308";
    ctx.fillRect(midX - 3, 0, 2, midY - roadW / 2);
    ctx.fillRect(midX + 2, 0, 2, midY - roadW / 2);
    ctx.fillRect(midX - 3, midY + roadW / 2, 2, midY - roadW / 2);
    ctx.fillRect(midX + 2, midY + roadW / 2, 2, midY - roadW / 2);

    // Double yellow center lines (East-West)
    ctx.fillRect(0, midY - 3, midX - roadW / 2, 2);
    ctx.fillRect(0, midY + 2, midX - roadW / 2, 2);
    ctx.fillRect(midX + roadW / 2, midY - 3, midX - roadW / 2, 2);
    ctx.fillRect(midX + roadW / 2, midY + 2, midX - roadW / 2, 2);

    // Crosswalk zebra stripes
    ctx.fillStyle = "#cbd5e1";
    for (let i = 0; i < 7; i++) {
      ctx.fillRect(midX - roadW / 2 + 16 + i * 36, midY - roadW / 2 - 32, 20, 28);
      ctx.fillRect(midX - roadW / 2 + 16 + i * 36, midY + roadW / 2 + 4, 20, 28);
      ctx.fillRect(midX - roadW / 2 - 32, midY - roadW / 2 + 16 + i * 36, 28, 20);
      ctx.fillRect(midX + roadW / 2 + 4, midY - roadW / 2 + 16 + i * 36, 28, 20);
    }
  }

  renderMinimap(ctx) {
    const miniSize = 135;
    const pad = 16;
    const miniX = this.width - miniSize - pad;
    const miniY = 96; // below the top-right score and session box

    // Minimap Background
    ctx.save();
    ctx.fillStyle = "rgba(15, 23, 42, 0.88)";
    ctx.fillRect(miniX, miniY, miniSize, miniSize);

    const scale = miniSize / this.worldWidth;

    // Draw building & tactical obstacle footprints on minimap
    for (const h of this.hitboxes) {
      if (h.type === "fortification") ctx.fillStyle = "rgba(132, 204, 22, 0.85)";
      else if (h.type === "cover") ctx.fillStyle = "rgba(234, 179, 8, 0.85)";
      else if (h.type === "vehicle") ctx.fillStyle = "rgba(56, 189, 248, 0.85)";
      else ctx.fillStyle = "rgba(51, 65, 85, 0.85)";
      ctx.fillRect(miniX + h.x * scale, miniY + h.y * scale, Math.max(1.5, h.w * scale), Math.max(1.5, h.h * scale));
    }

    const isMapReady = this.mapLoaded || (this.mapImage.complete && this.mapImage.naturalWidth > 0);
    if (isMapReady) {
      ctx.globalAlpha = 0.55;
      ctx.drawImage(this.mapImage, miniX, miniY, miniSize, miniSize);
      ctx.globalAlpha = 1.0;
    }

    ctx.strokeStyle = "rgba(255, 255, 255, 0.25)";
    ctx.lineWidth = 2;
    ctx.strokeRect(miniX, miniY, miniSize, miniSize);

    // Zombies (Red dots)
    ctx.fillStyle = "#ef4444";
    for (const z of this.zombies) {
      ctx.fillRect(miniX + z.x * scale - 1, miniY + z.y * scale - 1, 2, 2);
    }

    // Teammates (Class-colored dots)
    for (const p of Object.values(this.otherPlayers)) {
      const pCfg = CONFIG.CHARACTERS[p.charClass] || CONFIG.CHARACTERS.commando;
      ctx.fillStyle = pCfg.color || "#38bdf8";
      ctx.fillRect(miniX + p.x * scale - 2, miniY + p.y * scale - 2, 4, 4);
    }

    // Local Player (Chosen Character color dot)
    const myCfg = CONFIG.CHARACTERS[this.myPlayer.charClass] || CONFIG.CHARACTERS.commando;
    ctx.fillStyle = myCfg.color || "#22c55e";
    ctx.fillRect(miniX + this.myPlayer.x * scale - 2.5, miniY + this.myPlayer.y * scale - 2.5, 5, 5);

    ctx.restore();
  }
}
