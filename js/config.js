// ============================================================================
// GAME CONFIGURATION
// ============================================================================

export const CONFIG = {
  // --------------------------------------------------------------------------
  // PASSWORD CONFIGURATION (Must be exactly 20 letters)
  // --------------------------------------------------------------------------
  // The default 20-letter password:
  // "cooptowerdefensepass" (20 characters)
  // You can change this string at any time to your own 20-letter password!
  DEFAULT_PASSWORD: "cooptowerdefensepass",
  
  // Enforce strict 20 character length on password input
  PASSWORD_LENGTH: 20,

  // --------------------------------------------------------------------------
  // GAMEPLAY BALANCING
  // --------------------------------------------------------------------------
  STARTING_LIVES: 20,
  STARTING_GOLD: 160,
  COOP_BOUNTY_SHARE_RATIO: 0.5, // When an enemy dies, non-killer teammates get 50% gold assist

  // Grid dimensions for the map (24 columns x 14 rows, each cell is 36x36 px)
  GRID: {
    COLS: 24,
    ROWS: 14,
    CELL_SIZE: 36
  },

  // --------------------------------------------------------------------------
  // TOWERS SPECIFICATION
  // --------------------------------------------------------------------------
  TOWERS: {
    archer: {
      name: "Archer Spire",
      cost: 60,
      range: 115,
      damage: 15,
      fireRate: 0.5, // seconds per shot (2 shots/sec)
      bulletSpeed: 7.5,
      color: "#22c55e",
      bulletColor: "#86efac",
      icon: "🏹",
      desc: "Rapid single-target physical arrows."
    },
    cannon: {
      name: "Blast Cannon",
      cost: 110,
      range: 130,
      damage: 42,
      fireRate: 1.4, // slower fire rate
      bulletSpeed: 5,
      splashRadius: 52,
      color: "#f97316",
      bulletColor: "#fed7aa",
      icon: "💣",
      desc: "Heavy artillery dealing area-of-effect damage."
    },
    frost: {
      name: "Frost Obelisk",
      cost: 85,
      range: 100,
      damage: 6,
      fireRate: 0.8,
      bulletSpeed: 6,
      slowFactor: 0.5, // slows to 50% speed
      slowDuration: 2.5, // seconds
      color: "#38bdf8",
      bulletColor: "#bae6fd",
      icon: "❄️",
      desc: "Chills enemies, cutting their speed in half."
    },
    tesla: {
      name: "Storm Conductor",
      cost: 160,
      range: 125,
      damage: 30,
      fireRate: 1.0,
      chainTargets: 3, // jumps to 3 enemies
      color: "#a855f7",
      bulletColor: "#e9d5ff",
      icon: "⚡",
      desc: "High-voltage chain lightning striking multiple foes."
    }
  },

  // --------------------------------------------------------------------------
  // ENEMY TYPES
  // --------------------------------------------------------------------------
  CREEPS: {
    scout: {
      name: "Scout Goblin",
      hp: 45,
      speed: 2.0,
      reward: 12,
      color: "#84cc16",
      radius: 8
    },
    soldier: {
      name: "Orc Raider",
      hp: 110,
      speed: 1.25,
      reward: 20,
      color: "#ef4444",
      radius: 11
    },
    knight: {
      name: "Iron Golem",
      hp: 310,
      speed: 0.75,
      reward: 45,
      color: "#64748b",
      radius: 14
    },
    boss: {
      name: "Chaos Drake",
      hp: 950,
      speed: 0.6,
      reward: 150,
      color: "#e11d48",
      radius: 18
    }
  }
};
