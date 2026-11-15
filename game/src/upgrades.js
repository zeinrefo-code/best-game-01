// The upgrade pool: sixteen upgrades the level-up screen offers three of.
// Each one mutates the player's stats in place and reports what changed so
// the level-up screen can show it. `max` caps how often one can repeat.
export const UPGRADES = [
  {
    id: 'overclock', name: 'Overclock', icon: '⚡', max: 5,
    desc: '+20% fire rate',
    apply(p) { p.fireInterval *= 0.83; },
  },
  {
    id: 'heavy', name: 'Heavy Rounds', icon: '💥', max: 5,
    desc: '+25% bullet damage',
    apply(p) { p.bulletDamage *= 1.25; },
  },
  {
    id: 'split', name: 'Split Shot', icon: '✦', max: 3,
    desc: '+1 projectile per shot',
    apply(p) { p.projectiles += 1; },
  },
  {
    id: 'swift', name: 'Swift Hull', icon: '➤', max: 4,
    desc: '+12% move speed',
    apply(p) { p.maxSpeed *= 1.12; },
  },
  {
    id: 'magnet', name: 'Magnet Core', icon: '🧲', max: 4,
    desc: '+60% gem pickup radius',
    apply(p) { p.pickupRadius *= 1.6; },
  },
  {
    id: 'aegis', name: 'Aegis Shield', icon: '🛡', max: 3,
    desc: '+1 shield charge (blocks a hit)',
    apply(p) { p.maxShield += 1; p.shield = p.maxShield; },
  },
  {
    id: 'pierce', name: 'Piercing Rounds', icon: '➶', max: 3,
    desc: 'Bullets pierce +1 enemy',
    apply(p) { p.pierce += 1; },
  },
  {
    id: 'ricochet', name: 'Ricochet', icon: '↩', max: 2,
    desc: 'Bullets bounce to a nearby enemy',
    apply(p) { p.ricochet += 1; },
  },
  {
    id: 'nova', name: 'Nova Pulse', icon: '◎', max: 3,
    desc: 'Shockwave hits nearby enemies every 6s',
    apply(p) { p.novaLevel += 1; },
  },
  {
    id: 'adrenal', name: 'Adrenal Core', icon: '🔥', max: 4,
    desc: '+15% fire rate, +10% speed',
    apply(p) { p.fireInterval *= 0.87; p.maxSpeed *= 1.1; },
  },
  {
    id: 'plating', name: 'Vital Plating', icon: '✚', max: 4,
    desc: '+25 max HP and heal 25',
    apply(p) { p.maxHp += 25; p.hp = Math.min(p.maxHp, p.hp + 25); },
  },
  {
    id: 'greed', name: 'Gem Greed', icon: '◆', max: 3,
    desc: '+25% XP from gems',
    apply(p) { p.xpGain *= 1.25; },
  },
  {
    id: 'crit', name: 'Critical Matrix', icon: '✹', max: 4,
    desc: '+12% crit chance (crits deal 2× damage)',
    apply(p) { p.critChance += 0.12; },
  },
  {
    id: 'blades', name: 'Orbital Blades', icon: '🌀', max: 3,
    desc: '+1 orbiting blade, shreds on contact',
    apply(p) { p.orbitBlades += 1; },
  },
  {
    id: 'phase', name: 'Phase Boots', icon: '»', max: 3,
    desc: 'Dash recharges 30% faster',
    apply(p) { p.dashCooldown *= 0.7; },
  },
  {
    id: 'nanorepair', name: 'Nano Repair', icon: '♥', max: 3,
    desc: 'Regenerate 1.2 hull per second',
    apply(p) { p.regen += 1.2; },
  },
];

// The player's upgrade-derived stats, fresh at the start of every run.
export function freshPlayerStats() {
  return {
    fireInterval: 0.22,
    bulletDamage: 14,
    projectiles: 1,
    maxSpeed: 330,
    pickupRadius: 90,
    maxShield: 0,
    shield: 0,
    pierce: 0,
    ricochet: 0,
    novaLevel: 0,
    maxHp: 100,
    hp: 100,
    xpGain: 1,
    critChance: 0,
    orbitBlades: 0,
    regen: 0,
    dashCooldown: 2.6,
  };
}

// Roll three distinct upgrades the player can still take.
export function rollUpgrades(rng, owned) {
  const available = UPGRADES.filter((u) => (owned[u.id] ?? 0) < u.max);
  const pool = available.length >= 3 ? available : UPGRADES.filter((u) => (owned[u.id] ?? 0) < u.max);
  const picks = [];
  const copy = [...pool];
  while (picks.length < 3 && copy.length > 0) {
    const index = Math.floor(rng.next() * copy.length);
    picks.push(copy.splice(index, 1)[0]);
  }
  // If the pool ran dry (nearly everything maxed), pad with the first ones.
  while (picks.length < 3) picks.push(UPGRADES[picks.length % UPGRADES.length]);
  return picks;
}
