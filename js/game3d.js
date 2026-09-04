// ============================================================================
// 3D ZOMBIE DEFENSE ENGINE (Three.js WebGL)
// ============================================================================

import { CONFIG } from "./config.js";
import { sound } from "./audio.js";

const THREE = window.THREE;

export class GameEngine3D {
  constructor(container, network) {
    this.container = container;
    this.network = network;

    // Game stats
    this.bunkerHealth = CONFIG.BUNKER_HEALTH;
    this.wave = 0;
    this.waveState = "idle"; // "idle", "spawning", "active", "gameover"
    this.playerScrap = {}; // peerId -> scrap
    this.turrets = [];
    this.zombies = [];
    this.projectiles = [];
    this.particles = [];
    this.otherCursors = {}; // peerId -> { x, z, name, color, mesh }

    // Grid definition
    const { COLS, ROWS, TILE_SIZE } = CONFIG.GRID;
    this.cols = COLS;
    this.rows = ROWS;
    this.tileSize = TILE_SIZE;
    this.halfWidth = (COLS * TILE_SIZE) / 2;
    this.halfHeight = (ROWS * TILE_SIZE) / 2;

    this.grid = [];
    this.pathCells = new Set();
    this.waypoints = [];

    // Interaction
    this.selectedTurretType = null;
    this.inspectedTurret = null;
    this.hoverTile = { col: -1, row: -1 };
    this.mouseWorldPos = new THREE.Vector3();

    // Spawning queue
    this.spawnQueue = [];
    this.spawnTimer = 0;
    this.spawnInterval = 0.75;

    // Timing & sync
    this.clock = new THREE.Clock();
    this.syncTimer = 0;
    this.cameraShake = 0;

    // Setup Three.js scene
    this.initThree();
    this.initMap();
    this.initEnvironment();
    this.setupRaycasting();
    this.setupNetworkHooks();
  }

  // --------------------------------------------------------------------------
  // 1. THREE.JS SCENE SETUP
  // --------------------------------------------------------------------------
  initThree() {
    // Scene with dark atmospheric night fog
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0a0f1d);
    this.scene.fog = new THREE.FogExp2(0x0a0f1d, 0.012);

    // Isometric-angled perspective camera
    const aspect = this.container.clientWidth / this.container.clientHeight;
    this.camera = new THREE.PerspectiveCamera(45, aspect, 1, 300);
    this.camera.position.set(0, 48, 56);
    this.camera.lookAt(0, 0, 4);

    // Renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.container.appendChild(this.renderer.domElement);

    // Lighting
    const ambientLight = new THREE.AmbientLight(0x334155, 1.2);
    this.scene.add(ambientLight);

    // Moon directional light with shadows
    this.sunLight = new THREE.DirectionalLight(0x94a3b8, 1.5);
    this.sunLight.position.set(30, 60, 40);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.width = 1024;
    this.sunLight.shadow.mapSize.height = 1024;
    this.sunLight.shadow.camera.near = 10;
    this.sunLight.shadow.camera.far = 150;
    this.sunLight.shadow.camera.left = -45;
    this.sunLight.shadow.camera.right = 45;
    this.sunLight.shadow.camera.top = 35;
    this.sunLight.shadow.camera.bottom = -35;
    this.scene.add(this.sunLight);

    // Orange emergency warning light at bunker
    this.bunkerLight = new THREE.PointLight(0xf59e0b, 2, 25);
    this.scene.add(this.bunkerLight);

    // Handle window resize
    window.addEventListener("resize", () => {
      if (!this.container) return;
      const w = this.container.clientWidth;
      const h = this.container.clientHeight;
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(w, h);
    });
  }

  // --------------------------------------------------------------------------
  // 2. GRID & ROAD MAP
  // --------------------------------------------------------------------------
  initMap() {
    for (let r = 0; r < this.rows; r++) {
      this.grid[r] = [];
      for (let c = 0; c < this.cols; c++) {
        this.grid[r][c] = null; // buildable
      }
    }

    // Winding path through the ruins
    const keyPoints = [
      { col: 0, row: 2 },
      { col: 4, row: 2 },
      { col: 4, row: 8 },
      { col: 9, row: 8 },
      { col: 9, row: 2 },
      { col: 13, row: 2 },
      { col: 13, row: 9 },
      { col: 17, row: 9 }
    ];

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

    // Convert grid cells to 3D world coordinates
    this.waypoints = keyPoints.map(p => this.tileToWorld(p.col, p.row));
  }

  tileToWorld(col, row) {
    const x = col * this.tileSize - this.halfWidth + this.tileSize / 2;
    const z = row * this.tileSize - this.halfHeight + this.tileSize / 2;
    return new THREE.Vector3(x, 0, z);
  }

  worldToTile(x, z) {
    const col = Math.floor((x + this.halfWidth) / this.tileSize);
    const row = Math.floor((z + this.halfHeight) / this.tileSize);
    return { col, row };
  }

  // --------------------------------------------------------------------------
  // 3. 3D APOCALYPTIC ENVIRONMENT & STRUCTURES
  // --------------------------------------------------------------------------
  initEnvironment() {
    // 1. Ruined Ground Terrain
    const groundGeo = new THREE.PlaneGeometry(this.cols * this.tileSize + 16, this.rows * this.tileSize + 16);
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0x131d2e,
      roughness: 0.9,
      metalness: 0.1
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);
    this.groundPlane = ground;

    // 2. Asphalt Road Tiles & Barrier Sandbags
    const roadMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.8 });
    const lineMat = new THREE.MeshBasicMaterial({ color: 0xf59e0b });
    const barrierMat = new THREE.MeshStandardMaterial({ color: 0x475569 });

    for (const key of this.pathCells) {
      const [col, row] = key.split(",").map(Number);
      const pos = this.tileToWorld(col, row);

      // Road tile
      const roadTile = new THREE.Mesh(
        new THREE.PlaneGeometry(this.tileSize, this.tileSize),
        roadMat
      );
      roadTile.rotation.x = -Math.PI / 2;
      roadTile.position.set(pos.x, 0.02, pos.z);
      roadTile.receiveShadow = true;
      this.scene.add(roadTile);

      // Road dash in center
      const dash = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.25), lineMat);
      dash.rotation.x = -Math.PI / 2;
      dash.position.set(pos.x, 0.03, pos.z);
      this.scene.add(dash);
    }

    // 3. Zombie Spawner Tunnel (Quarantine breach)
    const spawnPos = this.waypoints[0];
    const tunnelGroup = new THREE.Group();
    tunnelGroup.position.set(spawnPos.x, 0, spawnPos.z);

    const arch = new THREE.Mesh(
      new THREE.BoxGeometry(4.2, 4, 1.2),
      new THREE.MeshStandardMaterial({ color: 0x0f172a })
    );
    arch.position.y = 2;
    tunnelGroup.add(arch);

    // Glowing biohazard red portal hole
    const portal = new THREE.Mesh(
      new THREE.PlaneGeometry(3.2, 3),
      new THREE.MeshBasicMaterial({ color: 0xef4444 })
    );
    portal.position.set(0, 1.5, 0.61);
    tunnelGroup.add(portal);
    this.scene.add(tunnelGroup);

    // 4. Survivor Safehouse Bunker (The base we must defend!)
    const bunkerPos = this.waypoints[this.waypoints.length - 1];
    this.bunkerGroup = new THREE.Group();
    this.bunkerGroup.position.set(bunkerPos.x, 0, bunkerPos.z);

    // Fortified bunker box
    const bunkerMesh = new THREE.Mesh(
      new THREE.BoxGeometry(5, 3.5, 5),
      new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.4 })
    );
    bunkerMesh.position.y = 1.75;
    bunkerMesh.castShadow = true;
    bunkerMesh.receiveShadow = true;
    this.bunkerGroup.add(bunkerMesh);

    // Reinforced metal vault door
    const door = new THREE.Mesh(
      new THREE.BoxGeometry(2.4, 2.5, 0.4),
      new THREE.MeshStandardMaterial({ color: 0x0ea5e9, roughness: 0.3 })
    );
    door.position.set(-2.55, 1.25, 0);
    this.bunkerGroup.add(door);

    // Radio communication dish on bunker roof
    const dish = new THREE.Mesh(
      new THREE.CylinderGeometry(0.8, 0.1, 0.6, 12),
      new THREE.MeshStandardMaterial({ color: 0x94a3b8 })
    );
    dish.position.set(0, 3.8, 0);
    this.bunkerGroup.add(dish);

    this.scene.add(this.bunkerGroup);
    this.bunkerLight.position.set(bunkerPos.x - 2, 4, bunkerPos.z);

    // 5. 3D Holographic Turret Placement Ghost
    this.ghostGroup = new THREE.Group();
    this.ghostGroup.visible = false;

    this.ghostMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(1.2, 1.4, 1.5, 8),
      new THREE.MeshBasicMaterial({ color: 0x22c55e, wireframe: true, transparent: true, opacity: 0.7 })
    );
    this.ghostMesh.position.y = 0.75;
    this.ghostGroup.add(this.ghostMesh);

    // Range cylinder preview
    this.ghostRange = new THREE.Mesh(
      new THREE.RingGeometry(0.1, 15, 32),
      new THREE.MeshBasicMaterial({ color: 0x22c55e, side: THREE.DoubleSide, transparent: true, opacity: 0.2 })
    );
    this.ghostRange.rotation.x = -Math.PI / 2;
    this.ghostRange.position.y = 0.05;
    this.ghostGroup.add(this.ghostRange);

    this.scene.add(this.ghostGroup);
  }

  // --------------------------------------------------------------------------
  // 4. RAYCASTING & INTERACTION
  // --------------------------------------------------------------------------
  setupRaycasting() {
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2(-999, -999);

    const onPointerMove = (e) => {
      const rect = this.container.getBoundingClientRect();
      this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      this.raycaster.setFromCamera(this.mouse, this.camera);
      const intersects = this.raycaster.intersectObject(this.groundPlane);

      if (intersects.length > 0) {
        const pt = intersects[0].point;
        this.mouseWorldPos.copy(pt);
        const tile = this.worldToTile(pt.x, pt.z);

        if (tile.col >= 0 && tile.col < this.cols && tile.row >= 0 && tile.row < this.rows) {
          this.hoverTile = tile;
          const pos = this.tileToWorld(tile.col, tile.row);
          this.ghostGroup.position.set(pos.x, 0, pos.z);

          const isValid = this.grid[tile.row][tile.col] === null;
          const color = isValid ? 0x22c55e : 0xef4444;
          this.ghostMesh.material.color.setHex(color);
          this.ghostRange.material.color.setHex(color);

          // Broadcast cursor to co-op teammates
          this.network.sendCursor(Math.round(pos.x * 10) / 10, Math.round(pos.z * 10) / 10);
        } else {
          this.hoverTile = { col: -1, row: -1 };
        }
      }
    };

    this.container.addEventListener("pointermove", onPointerMove);
    this.container.addEventListener("pointerleave", () => {
      this.hoverTile = { col: -1, row: -1 };
      this.ghostGroup.visible = false;
    });

    this.container.addEventListener("click", () => {
      this.handleMapClick();
    });
  }

  handleMapClick() {
    const { col, row } = this.hoverTile;
    if (col < 0 || row < 0) return;

    // 1. Placing a new turret
    if (this.selectedTurretType) {
      const cfg = CONFIG.TURRETS[this.selectedTurretType];
      const localScrap = this.getLocalScrap();

      if (localScrap < cfg.cost) {
        this.triggerNotification("Need more scrap metal!");
        return;
      }

      if (this.grid[row][col] !== null) {
        this.triggerNotification("Tile is occupied or blocked by road!");
        return;
      }

      // Dispatch build command to network
      this.network.sendCommand({
        type: "BUILD_TURRET",
        turretType: this.selectedTurretType,
        col,
        row
      });

      // Clear placement ghost
      this.selectedTurretType = null;
      this.ghostGroup.visible = false;
      document.querySelectorAll(".tower-card").forEach(c => c.classList.remove("selected"));
      return;
    }

    // 2. Clicking on an existing turret to inspect
    const existing = this.turrets.find(t => t.col === col && t.row === row);
    if (existing) {
      this.inspectedTurret = existing;
      if (this.onTurretInspected) this.onTurretInspected(existing);
    } else {
      this.inspectedTurret = null;
      if (this.onTurretInspected) this.onTurretInspected(null);
    }
  }

  setPlacementType(type) {
    this.selectedTurretType = type;
    if (type) {
      const cfg = CONFIG.TURRETS[type];
      this.ghostRange.geometry.dispose();
      this.ghostRange.geometry = new THREE.RingGeometry(0.1, cfg.range, 32);
      this.ghostGroup.visible = true;
    } else {
      this.ghostGroup.visible = false;
    }
  }

  // --------------------------------------------------------------------------
  // 5. PROCEDURAL 3D ZOMBIE MODELS & ANIMATIONS
  // --------------------------------------------------------------------------
  createZombieMesh(zombie) {
    const cfg = CONFIG.ZOMBIES[zombie.type] || CONFIG.ZOMBIES.walker;
    const group = new THREE.Group();
    const scale = cfg.scale || 1.0;
    group.scale.set(scale, scale, scale);

    const skinColor = cfg.color;
    const bodyColor = cfg.bodyColor;

    const skinMat = new THREE.MeshStandardMaterial({ color: skinColor, roughness: 0.9 });
    const clothesMat = new THREE.MeshStandardMaterial({ color: bodyColor, roughness: 0.8 });
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xef4444 }); // glowing red eyes

    // Torso
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.1, 0.5), clothesMat);
    torso.position.y = 1.6;
    torso.castShadow = true;
    group.add(torso);

    // Head
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.55, 0.55), skinMat);
    head.position.y = 2.45;
    head.castShadow = true;
    group.add(head);

    // Glowing red eyes
    const eyeL = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.08, 0.1), eyeMat);
    eyeL.position.set(0.15, 2.5, 0.28);
    const eyeR = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.08, 0.1), eyeMat);
    eyeR.position.set(-0.15, 2.5, 0.28);
    group.add(eyeL);
    group.add(eyeR);

    // Outstretched zombie arms (reaching forward)
    const armGeo = new THREE.BoxGeometry(0.24, 0.8, 0.24);
    const leftArm = new THREE.Mesh(armGeo, skinMat);
    leftArm.position.set(0.52, 1.7, 0.35);
    leftArm.rotation.x = -Math.PI / 2.2;
    leftArm.castShadow = true;
    group.add(leftArm);

    const rightArm = new THREE.Mesh(armGeo, skinMat);
    rightArm.position.set(-0.52, 1.7, 0.35);
    rightArm.rotation.x = -Math.PI / 2.2;
    rightArm.castShadow = true;
    group.add(rightArm);

    // Shambling legs
    const legGeo = new THREE.BoxGeometry(0.28, 0.95, 0.28);
    const leftLeg = new THREE.Mesh(legGeo, clothesMat);
    leftLeg.position.set(0.22, 0.5, 0);
    leftLeg.castShadow = true;
    group.add(leftLeg);

    const rightLeg = new THREE.Mesh(legGeo, clothesMat);
    rightLeg.position.set(-0.22, 0.5, 0);
    rightLeg.castShadow = true;
    group.add(rightLeg);

    // Health bar billboard (canvas plane in 3D)
    const hpCanvas = document.createElement("canvas");
    hpCanvas.width = 64;
    hpCanvas.height = 12;
    const hpTex = new THREE.CanvasTexture(hpCanvas);
    const hpMat = new THREE.MeshBasicMaterial({ map: hpTex, transparent: true });
    const hpBar = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.3), hpMat);
    hpBar.position.y = 3.0;
    group.add(hpBar);

    group.position.copy(this.waypoints[0]);
    this.scene.add(group);

    return {
      group,
      torso,
      head,
      leftArm,
      rightArm,
      leftLeg,
      rightLeg,
      hpBar,
      hpCanvas,
      hpTex,
      walkCycle: Math.random() * Math.PI * 2
    };
  }

  updateZombieMesh(zombie, dt) {
    if (!zombie.meshObj) return;
    const { group, leftArm, rightArm, leftLeg, rightLeg, hpCanvas, hpTex } = zombie.meshObj;

    // Position & rotation towards waypoint
    group.position.set(zombie.x, 0, zombie.z);
    group.rotation.y = zombie.angle || 0;

    // Procedural walk animation
    zombie.meshObj.walkCycle += dt * (zombie.speed / 10) * 4;
    const wc = zombie.meshObj.walkCycle;

    leftLeg.rotation.x = Math.sin(wc) * 0.45;
    rightLeg.rotation.x = -Math.sin(wc) * 0.45;
    leftArm.rotation.x = -Math.PI / 2.3 + Math.sin(wc) * 0.15;
    rightArm.rotation.x = -Math.PI / 2.3 - Math.sin(wc) * 0.15;

    // Draw health bar texture
    const ctx = hpCanvas.getContext("2d");
    ctx.clearRect(0, 0, 64, 12);
    ctx.fillStyle = "rgba(0,0,0,0.7)";
    ctx.fillRect(0, 0, 64, 12);

    const ratio = Math.max(0, zombie.hp / zombie.maxHp);
    ctx.fillStyle = ratio > 0.5 ? "#22c55e" : ratio > 0.25 ? "#f59e0b" : "#ef4444";
    ctx.fillRect(2, 2, Math.round(60 * ratio), 8);
    hpTex.needsUpdate = true;

    // Face billboard to camera
    zombie.meshObj.hpBar.quaternion.copy(this.camera.quaternion);
  }

  // --------------------------------------------------------------------------
  // 6. PROCEDURAL 3D TURRET MODELS
  // --------------------------------------------------------------------------
  createTurretMesh(turret) {
    const cfg = CONFIG.TURRETS[turret.type] || CONFIG.TURRETS.sentry;
    const group = new THREE.Group();
    const pos = this.tileToWorld(turret.col, turret.row);
    group.position.set(pos.x, 0, pos.z);

    // Concrete base
    const baseMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.7 });
    const base = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.8, 0.6, 8), baseMat);
    base.position.y = 0.3;
    base.castShadow = true;
    base.receiveShadow = true;
    group.add(base);

    // Owner team color player ring
    const ringMat = new THREE.MeshBasicMaterial({ color: turret.ownerColor || 0x38bdf8 });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.65, 0.08, 6, 16), ringMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.4;
    group.add(ring);

    // Swivel Turret Head
    const swivel = new THREE.Group();
    swivel.position.y = 0.7;

    const headMat = new THREE.MeshStandardMaterial({ color: cfg.color, metalness: 0.6, roughness: 0.3 });

    if (turret.type === "sentry") {
      // Twin machine gun barrels
      const body = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.8, 1.2), headMat);
      swivel.add(body);

      const barrelGeo = new THREE.CylinderGeometry(0.1, 0.1, 1.4, 8);
      const barrelMat = new THREE.MeshStandardMaterial({ color: 0x111827, metalness: 0.9 });

      const barrel1 = new THREE.Mesh(barrelGeo, barrelMat);
      barrel1.rotation.x = Math.PI / 2;
      barrel1.position.set(0.3, 0.1, 0.8);
      const barrel2 = new THREE.Mesh(barrelGeo, barrelMat);
      barrel2.rotation.x = Math.PI / 2;
      barrel2.position.set(-0.3, 0.1, 0.8);
      swivel.add(barrel1);
      swivel.add(barrel2);
    } else if (turret.type === "flamethrower") {
      // Napalm nozzle and canister
      const canister = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 1.0, 10), headMat);
      swivel.add(canister);

      const nozzle = new THREE.Mesh(
        new THREE.ConeGeometry(0.4, 1.2, 8),
        new THREE.MeshStandardMaterial({ color: 0x334155 })
      );
      nozzle.rotation.x = -Math.PI / 2;
      nozzle.position.set(0, 0.2, 0.8);
      swivel.add(nozzle);
    } else if (turret.type === "cryo") {
      // Glowing ice crystal sphere
      const sphere = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.7, 1),
        new THREE.MeshStandardMaterial({ color: 0x67e8f9, emissive: 0x0891b2, roughness: 0.2 })
      );
      swivel.add(sphere);
    } else if (turret.type === "rocket") {
      // Rocket launcher quad box
      const box = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.0, 1.6), headMat);
      swivel.add(box);

      const tubeGeo = new THREE.CylinderGeometry(0.18, 0.18, 1.62, 8);
      const tubeMat = new THREE.MeshBasicMaterial({ color: 0x0f172a });
      const offsets = [[0.35, 0.25], [-0.35, 0.25], [0.35, -0.25], [-0.35, -0.25]];
      for (const [ox, oy] of offsets) {
        const tube = new THREE.Mesh(tubeGeo, tubeMat);
        tube.rotation.x = Math.PI / 2;
        tube.position.set(ox, oy, 0);
        swivel.add(tube);
      }
    }

    group.add(swivel);
    this.scene.add(group);

    return { group, swivel };
  }

  // --------------------------------------------------------------------------
  // 7. SIMULATION LOOP (Host & Solo Authoritative)
  // --------------------------------------------------------------------------
  start() {
    const loop = () => {
      const dt = Math.min(this.clock.getDelta(), 0.1);

      this.update(dt);
      this.render();

      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  update(dt) {
    // Camera shake decay
    if (this.cameraShake > 0) {
      this.cameraShake -= dt;
      this.camera.position.x += (Math.random() - 0.5) * 0.4;
      this.camera.position.z += (Math.random() - 0.5) * 0.4;
    }

    // Update 3D projectiles
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      const target = this.zombies.find(z => z.id === p.targetId);

      if (target) {
        p.targetPos.set(target.x, 1.2, target.z);
      }

      const dir = new THREE.Vector3().subVectors(p.targetPos, p.mesh.position);
      const dist = dir.length();
      const step = p.speed * dt;

      if (dist <= step || dist < 0.8) {
        // Hit
        this.onProjectileHit(p, target);
        this.scene.remove(p.mesh);
        this.projectiles.splice(i, 1);
      } else {
        dir.normalize();
        p.mesh.position.addScaledVector(dir, step);
      }
    }

    // Update 3D particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const pt = this.particles[i];
      pt.mesh.position.addScaledVector(pt.velocity, dt);
      pt.life -= dt;
      pt.mesh.scale.multiplyScalar(0.96);
      if (pt.life <= 0) {
        this.scene.remove(pt.mesh);
        this.particles.splice(i, 1);
      }
    }

    // Only Host / Solo executes gameplay logic
    if (this.network.isHost || this.network.isSolo) {
      this.updateSpawner(dt);
      this.updateZombies(dt);
      this.updateTurrets(dt);

      // Periodic state broadcast (15 times/sec)
      this.syncTimer += dt;
      if (this.syncTimer >= 0.066) {
        this.syncTimer = 0;
        this.broadcastState();
      }
    } else {
      // Client-side visual interpolation
      for (const z of this.zombies) {
        this.updateZombieMesh(z, dt);
      }
    }
  }

  // --------------------------------------------------------------------------
  // 8. WAVE MANAGEMENT & SPAWNER
  // --------------------------------------------------------------------------
  startNextWave() {
    if (this.waveState === "spawning" || this.waveState === "active") return;

    this.wave++;
    this.waveState = "spawning";
    sound.waveStart();
    this.triggerNotification(`🚨 NIGHT ${this.wave}: THE HORDE APPROACHES!`);

    this.spawnQueue = this.generateWaveQueue(this.wave);
    this.spawnTimer = 0;
  }

  generateWaveQueue(waveNum) {
    const queue = [];
    const count = 7 + waveNum * 3;

    if (waveNum === 1) {
      for (let i = 0; i < 8; i++) queue.push("walker");
    } else if (waveNum === 2) {
      for (let i = 0; i < 6; i++) queue.push("walker");
      for (let i = 0; i < 6; i++) queue.push("runner");
    } else if (waveNum === 3) {
      for (let i = 0; i < 10; i++) queue.push("walker");
      for (let i = 0; i < 4; i++) queue.push("brute");
    } else if (waveNum % 5 === 0) {
      // Goliath Titan Boss wave!
      for (let i = 0; i < 8; i++) queue.push("runner");
      for (let i = 0; i < 4; i++) queue.push("brute");
      queue.push("titan");
    } else {
      const walkers = Math.floor(count * 0.45);
      const runners = Math.floor(count * 0.35);
      const brutes = Math.floor(count * 0.2);
      for (let i = 0; i < walkers; i++) queue.push("walker");
      for (let i = 0; i < runners; i++) queue.push("runner");
      for (let i = 0; i < brutes; i++) queue.push("brute");
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
    const hpScale = 1 + (this.wave - 1) * 0.15;

    const startPos = this.waypoints[0];
    const zombie = {
      id: "zomb_" + Math.random().toString(36).substr(2, 9),
      type: typeKey,
      name: base.name,
      hp: Math.round(base.hp * hpScale),
      maxHp: Math.round(base.hp * hpScale),
      speed: base.speed * 4.2, // world units/sec
      reward: base.reward,
      x: startPos.x,
      z: startPos.z,
      waypointIdx: 0,
      slowTimer: 0,
      slowFactor: 1,
      angle: 0
    };

    zombie.meshObj = this.createZombieMesh(zombie);
    this.zombies.push(zombie);
    sound.zombieGroan();
  }

  // --------------------------------------------------------------------------
  // 9. ZOMBIE MOVEMENT & BUNKER DEFENSE
  // --------------------------------------------------------------------------
  updateZombies(dt) {
    for (let i = this.zombies.length - 1; i >= 0; i--) {
      const z = this.zombies[i];

      // Slow effect decay
      if (z.slowTimer > 0) {
        z.slowTimer -= dt;
        if (z.slowTimer <= 0) z.slowFactor = 1;
      }

      // Move to next waypoint
      const targetWp = this.waypoints[z.waypointIdx + 1];
      if (!targetWp) {
        // Breached the survivor bunker!
        this.onZombieBreach(z, i);
        continue;
      }

      const dx = targetWp.x - z.x;
      const dz = targetWp.z - z.z;
      const dist = Math.hypot(dx, dz);
      const moveDist = z.speed * z.slowFactor * dt;

      z.angle = Math.atan2(dx, dz);

      if (dist <= moveDist) {
        z.x = targetWp.x;
        z.z = targetWp.z;
        z.waypointIdx++;
      } else {
        z.x += (dx / dist) * moveDist;
        z.z += (dz / dist) * moveDist;
      }

      this.updateZombieMesh(z, dt);
    }

    if (this.waveState === "active" && this.zombies.length === 0 && this.spawnQueue.length === 0) {
      this.waveState = "idle";
      this.triggerNotification("✅ Wave cleared! Fortify your defenses.");
    }
  }

  onZombieBreach(zombie, idx) {
    this.scene.remove(zombie.meshObj.group);
    this.zombies.splice(idx, 1);

    const dmg = zombie.type === "titan" ? 6 : 1;
    this.bunkerHealth = Math.max(0, this.bunkerHealth - dmg);
    this.cameraShake = 0.4;
    sound.bunkerBreach();

    if (this.bunkerHealth <= 0 && this.waveState !== "gameover") {
      this.waveState = "gameover";
      sound.defeat();
    }
  }

  // --------------------------------------------------------------------------
  // 10. TURRETS & APOCALYPTIC WEAPON FIRE
  // --------------------------------------------------------------------------
  updateTurrets(dt) {
    for (const turret of this.turrets) {
      if (turret.cooldown > 0) {
        turret.cooldown -= dt;
      }

      const target = this.findTargetForTurret(turret);
      if (target) {
        // Rotate turret head towards target
        const dx = target.x - turret.meshObj.group.position.x;
        const dz = target.z - turret.meshObj.group.position.z;
        turret.meshObj.swivel.rotation.y = Math.atan2(dx, dz);

        if (turret.cooldown <= 0) {
          this.fireTurret(turret, target);
          turret.cooldown = turret.fireRate;
        }
      }
    }
  }

  findTargetForTurret(turret) {
    let best = null;
    let maxProg = -1;
    const pos = turret.meshObj.group.position;

    for (const z of this.zombies) {
      const d = Math.hypot(z.x - pos.x, z.z - pos.z);
      if (d <= turret.range) {
        const prog = z.waypointIdx * 1000 + Math.hypot(z.x, z.z);
        if (prog > maxProg) {
          maxProg = prog;
          best = z;
        }
      }
    }
    return best;
  }

  fireTurret(turret, target) {
    const origin = turret.meshObj.group.position.clone().add(new THREE.Vector3(0, 1.2, 0));

    if (turret.type === "sentry") sound.shootSentry();
    if (turret.type === "flamethrower") sound.shootFlame();
    if (turret.type === "cryo") sound.shootCryo();
    if (turret.type === "rocket") sound.shootRocket();

    // 3D projectile mesh
    const projMat = new THREE.MeshBasicMaterial({ color: turret.bulletColor });
    const projGeo = turret.type === "rocket" 
      ? new THREE.CylinderGeometry(0.18, 0.18, 0.8, 6)
      : new THREE.SphereGeometry(turret.type === "flamethrower" ? 0.35 : 0.2, 8, 8);

    const projMesh = new THREE.Mesh(projGeo, projMat);
    projMesh.position.copy(origin);
    this.scene.add(projMesh);

    this.projectiles.push({
      id: "p_" + Math.random().toString(36).substr(2, 9),
      type: turret.type,
      mesh: projMesh,
      speed: turret.bulletSpeed,
      damage: turret.damage,
      splashRadius: turret.splashRadius || 0,
      slowFactor: turret.slowFactor || 1,
      slowDuration: turret.slowDuration || 0,
      ownerId: turret.ownerId,
      targetId: target.id,
      targetPos: new THREE.Vector3(target.x, 1.2, target.z)
    });
  }

  onProjectileHit(proj, target) {
    if (proj.splashRadius > 0) {
      // Explosive splash (Rocket or Flamethrower)
      sound.rocketExplosion();
      this.spawn3DExplosion(proj.mesh.position, 0xf97316, 16);

      for (const z of this.zombies) {
        const d = Math.hypot(z.x - proj.mesh.position.x, z.z - proj.mesh.position.z);
        if (d <= proj.splashRadius) {
          const falloff = 1 - (d / proj.splashRadius) * 0.4;
          this.damageZombie(z, Math.round(proj.damage * falloff), proj.ownerId);
        }
      }
    } else {
      // Single target hit
      if (target) {
        this.damageZombie(target, proj.damage, proj.ownerId);
        if (proj.slowFactor < 1) {
          target.slowFactor = proj.slowFactor;
          target.slowTimer = proj.slowDuration;
          this.spawn3DExplosion(target.meshObj.group.position, 0x06b6d4, 8);
        } else {
          this.spawn3DExplosion(target.meshObj.group.position, 0xfacc15, 5);
        }
      }
    }
  }

  damageZombie(zombie, amount, attackerId) {
    zombie.hp -= amount;
    if (zombie.hp <= 0) {
      this.killZombie(zombie, attackerId);
    }
  }

  killZombie(zombie, killerId) {
    const idx = this.zombies.indexOf(zombie);
    if (idx === -1) return;

    this.scene.remove(zombie.meshObj.group);
    this.zombies.splice(idx, 1);

    sound.zombieDeath();
    this.spawn3DExplosion(new THREE.Vector3(zombie.x, 1.2, zombie.z), 0x22c55e, 14);

    // Bounty distribution: killer gets full scrap, team gets 50% assist!
    const reward = zombie.reward;
    const assist = Math.round(reward * CONFIG.COOP_BOUNTY_SHARE_RATIO);

    for (const pid of Object.keys(this.playerScrap)) {
      if (pid === killerId) {
        this.playerScrap[pid] += reward;
      } else {
        this.playerScrap[pid] += assist;
      }
    }
  }

  spawn3DExplosion(pos, color, count = 10) {
    for (let i = 0; i < count; i++) {
      const geo = new THREE.BoxGeometry(0.18, 0.18, 0.18);
      const mat = new THREE.MeshBasicMaterial({ color });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.copy(pos);
      this.scene.add(mesh);

      const vel = new THREE.Vector3(
        (Math.random() - 0.5) * 12,
        Math.random() * 8 + 2,
        (Math.random() - 0.5) * 12
      );

      this.particles.push({ mesh, velocity: vel, life: 0.4 + Math.random() * 0.3 });
    }
  }

  // --------------------------------------------------------------------------
  // 11. COMMANDS & NETWORKING (Co-op P2P)
  // --------------------------------------------------------------------------
  setupNetworkHooks() {
    this.network.onCommandReceived = (cmd, senderId) => {
      this.handleCommand(cmd, senderId);
    };

    this.network.onStateReceived = (state) => {
      this.applyStateSync(state);
    };

    this.network.onCursorReceived = (peerId, x, z, name, color) => {
      this.updateTeammateCursor(peerId, x, z, name, color);
    };

    this.network.onPlayerJoined = (player) => {
      if (this.network.isHost || this.network.isSolo) {
        if (!this.playerScrap[player.id]) {
          this.playerScrap[player.id] = CONFIG.STARTING_SCRAP;
        }
      }
    };
  }

  initLocalPlayer(id) {
    this.playerScrap[id] = CONFIG.STARTING_SCRAP;
  }

  getLocalScrap() {
    const id = this.network.myPeerId || "local";
    return this.playerScrap[id] !== undefined ? this.playerScrap[id] : CONFIG.STARTING_SCRAP;
  }

  handleCommand(cmd, senderId) {
    if (!cmd) return;

    switch (cmd.type) {
      case "BUILD_TURRET": {
        const { turretType, col, row } = cmd;
        const cfg = CONFIG.TURRETS[turretType];
        if (!cfg) return;

        const scrap = this.playerScrap[senderId] || 0;
        if (scrap < cfg.cost) return;

        if (row < 0 || row >= this.rows || col < 0 || col >= this.cols) return;
        if (this.grid[row][col] !== null) return;

        this.playerScrap[senderId] -= cfg.cost;

        const player = this.network.players.find(p => p.id === senderId);
        const ownerColor = player ? player.color : "#38bdf8";

        const newTurret = {
          id: "turret_" + Math.random().toString(36).substr(2, 9),
          ownerId: senderId,
          ownerColor,
          type: turretType,
          name: cfg.name,
          col,
          row,
          level: 1,
          cost: cfg.cost,
          totalInvested: cfg.cost,
          range: cfg.range,
          damage: cfg.damage,
          fireRate: cfg.fireRate,
          bulletSpeed: cfg.bulletSpeed,
          bulletColor: cfg.bulletColor,
          splashRadius: cfg.splashRadius || 0,
          slowFactor: cfg.slowFactor || 1,
          slowDuration: cfg.slowDuration || 0,
          cooldown: 0
        };

        newTurret.meshObj = this.createTurretMesh(newTurret);
        this.turrets.push(newTurret);
        this.grid[row][col] = newTurret.id;

        sound.buildTurret();
        const pos = this.tileToWorld(col, row);
        this.spawn3DExplosion(pos, 0x38bdf8, 8);
        break;
      }

      case "UPGRADE_TURRET": {
        const turret = this.turrets.find(t => t.id === cmd.turretId);
        if (!turret) return;

        const upgradeCost = Math.round(turret.cost * 0.85);
        const scrap = this.playerScrap[senderId] || 0;
        if (scrap < upgradeCost) return;

        this.playerScrap[senderId] -= upgradeCost;
        turret.level++;
        turret.totalInvested += upgradeCost;
        turret.damage = Math.round(turret.damage * 1.35);
        turret.range = Math.round(turret.range * 1.1);
        turret.fireRate = Math.max(0.15, turret.fireRate * 0.9);

        sound.upgradeTurret();
        const pos = this.tileToWorld(turret.col, turret.row);
        this.spawn3DExplosion(pos, 0x22c55e, 10);
        break;
      }

      case "DISMANTLE_TURRET": {
        const idx = this.turrets.findIndex(t => t.id === cmd.turretId);
        if (idx === -1) return;
        const turret = this.turrets[idx];

        const refund = Math.round(turret.totalInvested * 0.65);
        if (this.playerScrap[senderId] !== undefined) {
          this.playerScrap[senderId] += refund;
        }

        this.scene.remove(turret.meshObj.group);
        this.grid[turret.row][turret.col] = null;
        this.turrets.splice(idx, 1);

        sound.dismantle();
        break;
      }

      case "START_WAVE":
        this.startNextWave();
        break;
    }
  }

  broadcastState() {
    const payload = {
      type: "SYNC_STATE",
      state: {
        bunkerHealth: this.bunkerHealth,
        wave: this.wave,
        waveState: this.waveState,
        playerScrap: this.playerScrap,
        turrets: this.turrets.map(t => ({
          id: t.id,
          type: t.type,
          col: t.col,
          row: t.row,
          level: t.level,
          ownerColor: t.ownerColor,
          cost: t.cost,
          damage: t.damage,
          range: t.range,
          fireRate: t.fireRate,
          totalInvested: t.totalInvested
        })),
        zombies: this.zombies.map(z => ({
          id: z.id,
          type: z.type,
          hp: z.hp,
          maxHp: z.maxHp,
          x: Math.round(z.x * 10) / 10,
          z: Math.round(z.z * 10) / 10,
          angle: Math.round(z.angle * 100) / 100
        }))
      }
    };
    this.network.broadcast(payload);
  }

  applyStateSync(state) {
    this.bunkerHealth = state.bunkerHealth;
    this.wave = state.wave;
    this.waveState = state.waveState;
    this.playerScrap = state.playerScrap;

    // Sync turrets
    for (const st of state.turrets) {
      let existing = this.turrets.find(t => t.id === st.id);
      if (!existing) {
        existing = { ...st };
        existing.meshObj = this.createTurretMesh(existing);
        this.turrets.push(existing);
        this.grid[st.row][st.col] = existing.id;
      } else {
        existing.level = st.level;
        existing.damage = st.damage;
      }
    }

    // Sync zombies
    const currentIds = new Set(state.zombies.map(z => z.id));
    for (let i = this.zombies.length - 1; i >= 0; i--) {
      if (!currentIds.has(this.zombies[i].id)) {
        this.scene.remove(this.zombies[i].meshObj.group);
        this.zombies.splice(i, 1);
      }
    }

    for (const sz of state.zombies) {
      let existing = this.zombies.find(z => z.id === sz.id);
      if (!existing) {
        existing = { ...sz, speed: 4 };
        existing.meshObj = this.createZombieMesh(existing);
        this.zombies.push(existing);
      } else {
        existing.hp = sz.hp;
        existing.x = sz.x;
        existing.z = sz.z;
        existing.angle = sz.angle;
      }
    }
  }

  updateTeammateCursor(peerId, x, z, name, color) {
    let cur = this.otherCursors[peerId];
    if (!cur) {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.8, 1.2, 16),
        new THREE.MeshBasicMaterial({ color: color || 0x38bdf8, side: THREE.DoubleSide })
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.08;
      this.scene.add(ring);
      cur = { ring, color, name };
      this.otherCursors[peerId] = cur;
    }
    cur.ring.position.set(x, 0.08, z);
  }

  triggerNotification(msg) {
    const banner = document.getElementById("canvas-banner");
    if (banner) {
      banner.textContent = msg;
      banner.classList.add("show");
      setTimeout(() => banner.classList.remove("show"), 2200);
    }
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }
}
