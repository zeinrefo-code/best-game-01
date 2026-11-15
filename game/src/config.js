// VOIDPULSE — Neon Arena Survival. Shared constants: tuning, palette and the
// enemy roster. Everything gameplay-visible reads from here so the balance
// lives in one place.
export const STEP = 1 / 60;
export const BEST_KEY = 'voidpulse-best';
export const TAU = Math.PI * 2;

// The arena is the canvas itself: the world reads the canvas size at boot
// (1280x480 in the screenshot runs, the window size when a person plays).
export const ARENA = { minWidth: 640, minHeight: 360 };

// Palette: a dark violet void with hot neon accents, one colour per system
// so a screenshot reads at a glance.
export const PALETTE = {
  voidTop: '#0b0618',
  voidBottom: '#14082e',
  grid: 'rgba(124, 92, 255, 0.10)',
  gridBright: 'rgba(124, 92, 255, 0.20)',
  player: '#4df3ff',
  playerCore: '#e8feff',
  bullet: '#ffe45e',
  gem: '#39ff88',
  gemBig: '#b6ff5e',
  xp: '#39ff88',
  hp: '#ff4d6d',
  shield: '#7cc7ff',
  text: '#efeaff',
  dim: '#9d8fc7',
  gold: '#ffd166',
  boss: '#ff2e63',
};

// Player tuning. Speeds are pixels per second, times are seconds.
export const PLAYER = {
  radius: 15,
  accel: 2400,
  maxSpeed: 330,
  damping: 5.2,
  maxHp: 100,
  fireInterval: 0.22,
  bulletSpeed: 640,
  bulletDamage: 14,
  bulletRadius: 5,
  bulletLife: 0.9,
  pickupRadius: 90,
  contactDamageCooldown: 0.55,
  invulnerableAfterHit: 0.9,
  // The dash: a short burst at dashSpeed that ignores damage while it lasts.
  dashSpeed: 1280,
  dashDuration: 0.16,
};

// Experience curve: xp needed to go from level L to L+1.
export function xpForLevel(level) {
  return Math.floor(6 + level * 5 + Math.pow(level, 1.7) * 2);
}

// Difficulty ramps with the clock: spawn interval shrinks, enemy health grows.
export function difficultyAt(seconds) {
  const minutes = seconds / 60;
  return {
    spawnInterval: Math.max(0.32, 1.15 - minutes * 0.28),
    hpScale: 1 + minutes * 0.55 + Math.pow(minutes, 2) * 0.12,
    speedScale: 1 + Math.min(0.35, minutes * 0.06),
    maxAlive: Math.min(64, 14 + Math.floor(seconds / 9)),
  };
}

// Bosses arrive on this schedule (seconds into the run).
export const BOSS_TIMES = [60, 150, 250];
export const BOSS = {
  radius: 54,
  hp: 900,
  speed: 62,
  contactDamage: 22,
  score: 500,
  xp: 40,
  // Every Nth volley is not a radial burst but a rotating spiral barrage.
  spiralEvery: 3,
  spiralDuration: 1.5,
  spiralTick: 0.07,
  spiralStep: 0.46,
  spiralShotSpeed: 185,
};

// One row per enemy kind. `kind` is the id the world and renderer switch on.
export const ENEMIES = {
  mite: {
    name: 'Mite', radius: 12, hp: 18, speed: 150, score: 10, xp: 1,
    damage: 8, color: '#ff5e7a', core: '#ffd3da', shape: 'tri',
  },
  spitter: {
    name: 'Spitter', radius: 15, hp: 30, speed: 95, score: 20, xp: 2,
    damage: 10, color: '#c77dff', core: '#eedcff', shape: 'diamond',
    shoots: true, shotInterval: 2.4, shotSpeed: 190,
  },
  lancer: {
    name: 'Lancer', radius: 13, hp: 26, speed: 110, score: 25, xp: 2,
    damage: 12, color: '#ffb703', core: '#fff3c4', shape: 'dart',
    dashes: true, dashSpeed: 520, dashWindup: 0.55, dashCooldown: 2.6,
  },
  mitosis: {
    name: 'Mitosis', radius: 19, hp: 44, speed: 82, score: 30, xp: 2,
    damage: 10, color: '#39ff88', core: '#d8ffe9', shape: 'hex',
    splits: 2,
  },
  fuse: {
    // Kamikaze: sprints at the ship, lights its fuse up close and blows.
    // Shot down first, its blast turns on the swarm instead.
    name: 'Fuse', radius: 13, hp: 16, speed: 178, score: 30, xp: 2,
    damage: 20, color: '#ff6b35', core: '#ffe3c2', shape: 'bomb',
    explodes: true, fuseRange: 74, fuseTime: 0.38, blastRadius: 98, blastDamage: 42,
  },
  longshot: {
    // A sniper: holds long range, paints a telegraphed aim line while it
    // charges, then fires one fast bolt the player has to dodge or dash.
    name: 'Longshot', radius: 14, hp: 34, speed: 92, score: 35, xp: 3,
    damage: 14, color: '#ff9f1c', core: '#ffedc2', shape: 'lens',
    snipes: true, keepDistance: 405, snipeRange: 640,
    snipeCharge: 0.85, snipeCooldown: 2.9, shotSpeed: 580,
  },
  bulwark: {
    name: 'Bulwark', radius: 26, hp: 130, speed: 46, score: 50, xp: 4,
    damage: 16, color: '#8d99ae', core: '#e9edf2', shape: 'square',
  },
};

// Waves of spawning: weights shift as the clock advances so new kinds appear.
export function spawnWeights(seconds) {
  const table = [
    { kind: 'mite', weight: 10 },
    { kind: 'spitter', weight: seconds > 18 ? 4 : 0 },
    { kind: 'lancer', weight: seconds > 35 ? 4 : 0 },
    { kind: 'fuse', weight: seconds > 40 ? 4 : 0 },
    { kind: 'mitosis', weight: seconds > 55 ? 3 : 0 },
    { kind: 'longshot', weight: seconds > 65 ? 3 : 0 },
    { kind: 'bulwark', weight: seconds > 80 ? 3 : 0 },
  ];
  return table.filter((row) => row.weight > 0);
}

// A surge every 30 seconds: a banner plus a burst of spawns.
export const SURGE_EVERY = 30;
