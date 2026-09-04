// ============================================================================
// 3D ZOMBIE DEFENSE - CONFIGURATION & BALANCING
// ============================================================================

export const CONFIG = {
  // --------------------------------------------------------------------------
  // ACCESS PASSWORD (Your chosen custom password)
  // --------------------------------------------------------------------------
  DEFAULT_PASSWORD: "dakustowerGame69",
  PASSWORD_LENGTH: 16,

  // --------------------------------------------------------------------------
  // GAMEPLAY & BUNKER BALANCING
  // --------------------------------------------------------------------------
  BUNKER_HEALTH: 25,
  STARTING_SCRAP: 180, // Gold / Currency renamed to "Scrap"
  COOP_BOUNTY_SHARE_RATIO: 0.5,

  // 3D Grid dimensions (18x12 tiles, each tile is 4 units in Three.js)
  GRID: {
    COLS: 18,
    ROWS: 12,
    TILE_SIZE: 4
  },

  // --------------------------------------------------------------------------
  // ANTI-ZOMBIE TURRETS (3D WEAPONS)
  // --------------------------------------------------------------------------
  TURRETS: {
    sentry: {
      name: "Sentry Minigun",
      cost: 65,
      range: 15,
      damage: 16,
      fireRate: 0.25, // 4 shots/sec
      bulletSpeed: 38,
      color: "#f59e0b",
      bulletColor: "#fbbf24",
      icon: "🔫",
      desc: "Rapid-fire twin rotary barrels shredding individual zombies."
    },
    flamethrower: {
      name: "Incinerator",
      cost: 115,
      range: 12,
      damage: 32,
      fireRate: 0.6,
      splashRadius: 6,
      bulletSpeed: 22,
      color: "#ef4444",
      bulletColor: "#f97316",
      icon: "🔥",
      desc: "Blasts pressurized napalm, igniting clusters of walking corpses."
    },
    cryo: {
      name: "Cryo Pylon",
      cost: 90,
      range: 13,
      damage: 8,
      fireRate: 0.75,
      slowFactor: 0.45, // slows zombie to 45% speed
      slowDuration: 2.8,
      bulletSpeed: 28,
      color: "#06b6d4",
      bulletColor: "#67e8f9",
      icon: "❄️",
      desc: "Sub-zero liquid nitrogen emitter chilling and freezing the horde."
    },
    rocket: {
      name: "Missile Silo",
      cost: 175,
      range: 18,
      damage: 75,
      fireRate: 1.6,
      splashRadius: 7.5,
      bulletSpeed: 20,
      color: "#8b5cf6",
      bulletColor: "#c084fc",
      icon: "🚀",
      desc: "Heavy guided cluster rockets obliterating high-threat mutants."
    }
  },

  // --------------------------------------------------------------------------
  // ZOMBIE MUTATIONS (ENEMIES)
  // --------------------------------------------------------------------------
  ZOMBIES: {
    walker: {
      name: "Decayed Shambler",
      hp: 60,
      speed: 1.2,
      reward: 14,
      color: "#4ade80",
      bodyColor: "#335c3d",
      scale: 1.0
    },
    runner: {
      name: "Infected Sprinter",
      hp: 40,
      speed: 2.6,
      reward: 18,
      color: "#f87171",
      bodyColor: "#7f1d1d",
      scale: 0.85
    },
    brute: {
      name: "Armored Juggernaut",
      hp: 340,
      speed: 0.75,
      reward: 45,
      color: "#94a3b8",
      bodyColor: "#334155",
      scale: 1.5
    },
    titan: {
      name: "Goliath Abomination",
      hp: 1200,
      speed: 0.55,
      reward: 160,
      color: "#c084fc",
      bodyColor: "#581c87",
      scale: 2.2
    }
  }
};
