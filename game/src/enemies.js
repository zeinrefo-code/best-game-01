// Enemy kinds, spawning and per-kind behaviour. The world owns the lists;
// this module decides what an enemy is and how it moves and attacks.
// Every function takes the world state as a plain context, so the logic is
// testable from the screenshot stager without a live loop.
import { BOSS, ENEMIES, TAU, difficultyAt, spawnWeights } from './config.js';

let nextId = 1;

export function makeEnemy(kind, x, y, seconds, rng) {
  const def = ENEMIES[kind];
  const diff = difficultyAt(seconds);
  const hp = Math.round(def.hp * diff.hpScale * (0.9 + rng.next() * 0.2));
  return {
    id: nextId,
    kind,
    x, y,
    vx: 0, vy: 0,
    radius: def.radius,
    hp, maxHp: hp,
    speed: def.speed * diff.speedScale * (0.9 + rng.next() * 0.2),
    score: def.score,
    xp: def.xp,
    damage: def.damage,
    color: def.color,
    core: def.core,
    shape: def.shape,
    // Behaviour timers, per kind.
    shotTimer: rng.range(0.8, def.shotInterval ?? 2),
    dashTimer: rng.range(1.2, 2.6),
    dashState: 'idle', // idle | windup | dash
    dashX: 0, dashY: 0,
    wobble: rng.angle(),
    flash: 0,
    spawnAge: 0,
  };
}

export function makeBoss(x, y, tier, seconds) {
  const hp = Math.round(BOSS.hp * (1 + (tier - 1) * 0.85) * (1 + seconds / 240));
  return {
    id: nextId,
    kind: 'boss',
    x, y,
    vx: 0, vy: 0,
    radius: BOSS.radius,
    hp, maxHp: hp,
    speed: BOSS.speed,
    score: BOSS.score,
    xp: BOSS.xp,
    damage: BOSS.contactDamage,
    color: '#ff2e63',
    core: '#ffd3da',
    shape: 'maw',
    shotTimer: 1.6,
    dashTimer: 3,
    dashState: 'idle',
    dashX: 0, dashY: 0,
    wobble: 0,
    flash: 0,
    spawnAge: 0,
    tier,
    burstCount: 0,
  };
}

// Pick a spawn point just outside the arena, on a random edge.
export function spawnPoint(field, rng) {
  const edge = rng.int(0, 3);
  const m = 30;
  if (edge === 0) return { x: rng.range(0, field.width), y: -m };
  if (edge === 1) return { x: field.width + m, y: rng.range(0, field.height) };
  if (edge === 2) return { x: rng.range(0, field.width), y: field.height + m };
  return { x: -m, y: rng.range(0, field.height) };
}

// Weighted pick from the spawn table for this moment in the run.
export function pickKind(seconds, rng) {
  const table = spawnWeights(seconds);
  let total = 0;
  for (const row of table) total += row.weight;
  let roll = rng.next() * total;
  for (const row of table) {
    roll -= row.weight;
    if (roll <= 0) return row.kind;
  }
  return 'mite';
}

// Steer one enemy for a fixed step. Returns enemy bullets it fired
// (an array of {x, y, vx, vy, radius, damage, hostile}) and may set
// `enemy.spawnMinions` for the world to materialise.
export function updateEnemy(enemy, ctx, dt) {
  const fired = [];
  enemy.flash = Math.max(0, enemy.flash - dt * 6);
  enemy.spawnAge += dt;
  enemy.wobble += dt * 2.2;
  const dx = ctx.player.x - enemy.x;
  const dy = ctx.player.y - enemy.y;
  const dist = Math.hypot(dx, dy) || 1;
  const nx = dx / dist;
  const ny = dy / dist;

  if (enemy.kind === 'boss') {
    updateBoss(enemy, ctx, dt, nx, ny, dist, fired);
    return fired;
  }

  const def = ENEMIES[enemy.kind];
  if (enemy.kind === 'mite' || enemy.kind === 'bulwark') {
    // Straight chase, with a slow sinusoidal wobble so packs don't stack.
    const wob = Math.sin(enemy.wobble) * 0.35;
    const px = -ny * wob;
    const py = nx * wob;
    enemy.vx = (nx + px) * enemy.speed;
    enemy.vy = (ny + py) * enemy.speed;
  } else if (enemy.kind === 'spitter') {
    // Hold a ring around the player and fire slow orbs.
    const want = 260;
    const radial = dist > want + 30 ? 1 : dist < want - 30 ? -1 : 0;
    const orbit = 0.7;
    enemy.vx = (nx * radial - ny * orbit) * enemy.speed;
    enemy.vy = (ny * radial + nx * orbit) * enemy.speed;
    enemy.shotTimer -= dt;
    if (enemy.shotTimer <= 0 && dist < 520) {
      enemy.shotTimer = def.shotInterval * (0.9 + ctx.rng.next() * 0.2);
      fired.push({
        x: enemy.x, y: enemy.y,
        vx: nx * def.shotSpeed, vy: ny * def.shotSpeed,
        radius: 7, damage: def.damage, hostile: true,
      });
    }
  } else if (enemy.kind === 'lancer') {
    if (enemy.dashState === 'idle') {
      enemy.vx = nx * enemy.speed;
      enemy.vy = ny * enemy.speed;
      enemy.dashTimer -= dt;
      if (enemy.dashTimer <= 0 && dist < 420) {
        enemy.dashState = 'windup';
        enemy.dashTimer = def.dashWindup;
        enemy.dashX = nx;
        enemy.dashY = ny;
      }
    } else if (enemy.dashState === 'windup') {
      enemy.vx = 0;
      enemy.vy = 0;
      enemy.dashTimer -= dt;
      if (enemy.dashTimer <= 0) {
        enemy.dashState = 'dash';
        enemy.dashTimer = 0.42;
      }
    } else {
      enemy.vx = enemy.dashX * def.dashSpeed;
      enemy.vy = enemy.dashY * def.dashSpeed;
      enemy.dashTimer -= dt;
      if (enemy.dashTimer <= 0) {
        enemy.dashState = 'idle';
        enemy.dashTimer = def.dashCooldown * (0.8 + ctx.rng.next() * 0.4);
      }
    }
  } else if (enemy.kind === 'mitosis') {
    // Drifts in, pulsing: speeds up as it nears the player.
    const urge = 1 + Math.max(0, (300 - dist) / 300);
    enemy.vx = nx * enemy.speed * urge;
    enemy.vy = ny * enemy.speed * urge;
  }

  enemy.x += enemy.vx * dt;
  enemy.y += enemy.vy * dt;
  return fired;
}

function updateBoss(boss, ctx, dt, nx, ny, dist, fired) {
  // The Maw drifts toward the player, pauses to fire radial bursts, and
  // periodically charges. Higher tiers burst more often.
  boss.shotTimer -= dt;
  boss.dashTimer -= dt;
  if (boss.dashState === 'idle') {
    boss.vx = nx * boss.speed;
    boss.vy = ny * boss.speed;
    if (boss.dashTimer <= 0 && dist < 480) {
      boss.dashState = 'windup';
      boss.dashTimer = 0.6;
      boss.dashX = nx;
      boss.dashY = ny;
    }
    if (boss.shotTimer <= 0) {
      boss.shotTimer = Math.max(1.1, 2.2 - boss.tier * 0.25);
      const count = 8 + boss.tier * 2;
      const offset = ctx.rng.angle();
      for (let i = 0; i < count; i += 1) {
        const a = offset + (i / count) * TAU;
        fired.push({
          x: boss.x, y: boss.y,
          vx: Math.cos(a) * 170, vy: Math.sin(a) * 170,
          radius: 8, damage: 12, hostile: true,
        });
      }
      boss.burstCount += 1;
      // Every third burst, call in two mites.
      if (boss.burstCount % 3 === 0) boss.spawnMinions = 2;
    }
  } else if (boss.dashState === 'windup') {
    boss.vx = 0;
    boss.vy = 0;
    if (boss.dashTimer <= 0) {
      boss.dashState = 'dash';
      boss.dashTimer = 0.55;
    }
  } else {
    boss.vx = boss.dashX * 430;
    boss.vy = boss.dashY * 430;
    if (boss.dashTimer <= 0) {
      boss.dashState = 'idle';
      boss.dashTimer = 3.2;
    }
  }
  boss.x += boss.vx * dt;
  boss.y += boss.vy * dt;
  // The Maw never leaves the arena: it is the fight, not a passer-by.
  boss.x = Math.max(boss.radius, Math.min(ctx.field.width - boss.radius, boss.x));
  boss.y = Math.max(boss.radius, Math.min(ctx.field.height - boss.radius, boss.y));
}
