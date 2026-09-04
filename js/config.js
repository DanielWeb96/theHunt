// ============================================================================
// PIXEL ART URBAN ZOMBIE SURVIVAL - CONFIGURATION
// ============================================================================

export const CONFIG = {
  DEFAULT_PASSWORD: "dakustowerGame69",
  PASSWORD_LENGTH: 16,

  // Big Map World Dimensions (in pixels)
  WORLD: {
    WIDTH: 2048,
    HEIGHT: 2048,
    SAFE_ZONE_RADIUS: 160
  },

  // --------------------------------------------------------------------------
  // 5 PLAYABLE CHARACTER CLASSES
  // --------------------------------------------------------------------------
  CHARACTERS: {
    commando: {
      id: "commando",
      name: "Jack 'Viper' Vance",
      title: "Assault Commando",
      portrait: "assets/char_commando.jpg",
      hp: 120,
      speed: 3.6,
      weapon: "M4A1 Assault Rifle",
      damage: 24,
      fireRate: 0.12, // rapid fire
      magSize: 30,
      reloadTime: 1.4,
      spread: 0.08,
      bulletSpeed: 14,
      color: "#22c55e",
      ability: "Frag Grenade (Area Explosive)",
      abilityCooldown: 8,
      desc: "Balanced combat soldier with high-capacity assault rifle and explosive grenades."
    },
    sniper: {
      id: "sniper",
      name: "Cole 'Ghost' Walker",
      title: "Recon Sniper",
      portrait: "assets/char_sniper.jpg",
      hp: 85,
      speed: 3.4,
      weapon: "Barrett .50 Cal",
      damage: 125,
      fireRate: 0.9,
      magSize: 6,
      reloadTime: 2.2,
      spread: 0.01,
      bulletSpeed: 22,
      piercing: 3, // shots pass through up to 3 zombies
      color: "#38bdf8",
      ability: "Piercing Overcharge (Laser beam)",
      abilityCooldown: 10,
      desc: "Long-range marksman capable of piercing through multiple zombies with immense damage."
    },
    medic: {
      id: "medic",
      name: "Dr. Elena Rostova",
      title: "Combat Field Medic",
      portrait: "assets/char_medic.jpg",
      hp: 100,
      speed: 4.1,
      weapon: "Dual Vector SMGs",
      damage: 16,
      fireRate: 0.09,
      magSize: 36,
      reloadTime: 1.2,
      spread: 0.14,
      bulletSpeed: 13,
      color: "#f43f5e",
      ability: "Field Medkit Drop (Heals 50 HP for team)",
      abilityCooldown: 12,
      desc: "High mobility healer who sprays bullets and drops medical kits for team survival."
    },
    heavy: {
      id: "heavy",
      name: "Marcus 'Anvil' Kane",
      title: "Blast Demolitionist",
      portrait: "assets/char_heavy.jpg",
      hp: 160,
      speed: 3.0,
      weapon: "SPAS-12 Combat Shotgun",
      damage: 18, // per pellet (6 pellets per blast)
      pellets: 6,
      fireRate: 0.65,
      magSize: 8,
      reloadTime: 1.8,
      spread: 0.22,
      bulletSpeed: 12,
      knockback: 6,
      color: "#f59e0b",
      ability: "Sticky C4 Satchel (Massive blast)",
      abilityCooldown: 11,
      desc: "Heavily armored juggernaut devastating close-quarters crowds with shotgun spread."
    },
    engineer: {
      id: "engineer",
      name: "Hank 'Spanner' Miller",
      title: "Combat Engineer",
      portrait: "assets/char_engineer.jpg",
      hp: 105,
      speed: 3.3,
      weapon: "Riot Carbine & Wrench",
      damage: 20,
      fireRate: 0.22,
      magSize: 20,
      reloadTime: 1.3,
      spread: 0.09,
      bulletSpeed: 13,
      color: "#a855f7",
      ability: "Deploy Automated Sentry Turret",
      abilityCooldown: 15,
      desc: "Tech specialist who deploys automated defensive sentry guns and fortifies positions."
    }
  },

  // --------------------------------------------------------------------------
  // ZOMBIE MUTATIONS
  // --------------------------------------------------------------------------
  ZOMBIES: {
    walker: {
      name: "City Shambler",
      hp: 40,
      speed: 1.5,
      damage: 10,
      score: 15,
      color: "#4ade80",
      radius: 12
    },
    sprinter: {
      name: "Infected Sprinter",
      hp: 28,
      speed: 3.2,
      damage: 8,
      score: 20,
      color: "#ef4444",
      radius: 10
    },
    bloater: {
      name: "Toxic Bloater",
      hp: 90,
      speed: 1.0,
      damage: 25,
      score: 40,
      color: "#84cc16",
      radius: 18,
      explodesOnDeath: true
    },
    juggernaut: {
      name: "Mutant Brute",
      hp: 280,
      speed: 0.9,
      damage: 30,
      score: 85,
      color: "#64748b",
      radius: 22
    },
    titan: {
      name: "Goliath Titan",
      hp: 1100,
      speed: 0.75,
      damage: 50,
      score: 300,
      color: "#c084fc",
      radius: 32,
      isBoss: true
    }
  }
};
