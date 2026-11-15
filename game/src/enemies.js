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
    id: nextId++,
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
    // Longshot sniping: stalk -> aim (telegraphed) -> fire -> stalk.
    snipeState: 'stalk',
    snipeTimer: rng.range(1.0, def.snipeCooldown ?? 2.9),
    aimAngle: 0,
    aimFrac: 0,
    // Fuse kamikaze: fuseT counts down once lit, -1 while unlit.
    fuseT: -1,
    explodeNow: false,
    // Orbital-blade contact cooldown, decremented here every step.
    bladeCd: 0,
  };
}

export function makeBoss(x, y, tier, seconds) {
  const hp = Math.round(BOSS.hp * (1 + (tier - 1) * 0.85) * (1 + seconds / 240));
  return {
    id: nextId++,
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
    bladeCd: 0,
    fuseT: -1,
    explodeNow: false,
    tier,
    burstCount: 0,
    // Spiral barrage state: while spiralT > 0 the Maw turns in place and
    // streams paired bolts along a rotating pair of emitter arms.
    attackCount: 0,
    spiralT: 0,
    spiralTick: 0,
    spiralAngle: 0,
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
// `enemy.spawnMinions` for the world to materialise, or `enemy.explodeNow`
// when a lit Fuse has burned down to zero.
export function updateEnemy(enemy, ctx, dt) {
  const fired = [];
  enemy.flash = Math.max(0, enemy.flash - dt * 6);
  enemy.bladeCd = Math.max(0, enemy.bladeCd - dt);
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
  } else if (enemy.kind === 'fuse') {
    updateFuse(enemy, dt, nx, ny, dist);
  } else if (enemy.kind === 'longshot') {
    updateLongshot(enemy, ctx, dt, nx, ny, dist, fired);
  }

  enemy.x += enemy.vx * dt;
  enemy.y += enemy.vy * dt;
  return fired;
}

// The Fuse: a kamikaze that sprints straight at the ship. Inside fuse
// range it lights its fuse and slows to a crawl, blinking faster and
// faster; when the fuse burns out the world detonates it. Shot down
// before that, its blast turns on the swarm instead (see world.js).
function updateFuse(enemy, dt, nx, ny, dist) {
  const def = ENEMIES.fuse;
  if (enemy.fuseT >= 0) {
    enemy.fuseT -= dt;
    enemy.vx = nx * enemy.speed * 0.22;
    enemy.vy = ny * enemy.speed * 0.22;
    if (enemy.fuseT <= 0) enemy.explodeNow = true;
    return;
  }
  // Unlit: sprint, gathering speed as it closes in.
  const urge = 1 + Math.max(0, (260 - dist) / 260) * 0.5;
  const wob = Math.sin(enemy.wobble * 1.7) * 0.16;
  enemy.vx = (nx - ny * wob) * enemy.speed * urge;
  enemy.vy = (ny + nx * wob) * enemy.speed * urge;
  if (dist < def.fuseRange) enemy.fuseT = def.fuseTime;
}

// The Longshot: a sniper that holds a long ring around the player. When
// its timer runs out it stops, paints its aim line on the player while
// the charge builds (aimFrac 0 -> 1 for the renderer), then fires one
// fast bolt along the locked angle and goes back to stalking.
function updateLongshot(enemy, ctx, dt, nx, ny, dist, fired) {
  const def = ENEMIES.longshot;
  if (enemy.snipeState === 'aim') {
    enemy.vx = 0;
    enemy.vy = 0;
    enemy.aimAngle = Math.atan2(ny, nx);
    enemy.snipeTimer -= dt;
    enemy.aimFrac = 1 - Math.max(0, enemy.snipeTimer) / def.snipeCharge;
    if (enemy.snipeTimer <= 0) {
      fired.push({
        x: enemy.x + Math.cos(enemy.aimAngle) * (enemy.radius + 6),
        y: enemy.y + Math.sin(enemy.aimAngle) * (enemy.radius + 6),
        vx: Math.cos(enemy.aimAngle) * def.shotSpeed,
        vy: Math.sin(enemy.aimAngle) * def.shotSpeed,
        radius: 5, damage: def.damage, hostile: true, snipe: true,
      });
      enemy.snipeState = 'stalk';
      enemy.aimFrac = 0;
      enemy.snipeTimer = def.snipeCooldown * (0.9 + ctx.rng.next() * 0.25);
    }
    return;
  }
  // Stalk: hold the ring at keepDistance, strafing slowly sideways.
  const want = def.keepDistance;
  const radial = dist > want + 45 ? 1 : dist < want - 45 ? -1 : 0;
  const orbit = 0.45;
  enemy.vx = (nx * radial - ny * orbit) * enemy.speed;
  enemy.vy = (ny * radial + nx * orbit) * enemy.speed;
  enemy.snipeTimer -= dt;
  if (enemy.snipeTimer <= 0 && dist < def.snipeRange) {
    enemy.snipeState = 'aim';
    enemy.snipeTimer = def.snipeCharge;
    enemy.aimAngle = Math.atan2(ny, nx);
    enemy.aimFrac = 0;
  }
}

function updateBoss(boss, ctx, dt, nx, ny, dist, fired) {
  // The Maw drifts toward the player, pauses to fire radial bursts, and
  // periodically charges. Every third volley is a spiral barrage instead:
  // the Maw slows, its twin emitters rotate, and paired bolts stream out
  // in a widening pinwheel the player has to thread. Higher tiers burst
  // more often.
  boss.shotTimer -= dt;
  boss.dashTimer -= dt;

  if (boss.spiralT > 0) {
    boss.spiralT -= dt;
    boss.spiralTick -= dt;
    boss.vx = nx * boss.speed * 0.35;
    boss.vy = ny * boss.speed * 0.35;
    if (boss.spiralTick <= 0) {
      boss.spiralTick = BOSS.spiralTick;
      boss.spiralAngle += BOSS.spiralStep;
      for (const arm of [0, Math.PI]) {
        const a = boss.spiralAngle + arm;
        fired.push({
          x: boss.x + Math.cos(a) * boss.radius * 0.7,
          y: boss.y + Math.sin(a) * boss.radius * 0.7,
          vx: Math.cos(a) * BOSS.spiralShotSpeed,
          vy: Math.sin(a) * BOSS.spiralShotSpeed,
          radius: 7, damage: 10, hostile: true,
        });
      }
    }
    boss.x += boss.vx * dt;
    boss.y += boss.vy * dt;
    clampBoss(boss, ctx);
    return;
  }

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
      boss.attackCount += 1;
      if (boss.attackCount % BOSS.spiralEvery === 0) {
        // Begin the spiral barrage instead of a radial burst.
        boss.spiralT = BOSS.spiralDuration;
        boss.spiralTick = 0;
        boss.spiralAngle = ctx.rng.angle();
      } else {
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
        // Every third radial burst, call in two mites.
        if (boss.burstCount % 3 === 0) boss.spawnMinions = 2;
      }
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
  clampBoss(boss, ctx);
}

function clampBoss(boss, ctx) {
  // The Maw never leaves the arena: it is the fight, not a passer-by.
  boss.x = Math.max(boss.radius, Math.min(ctx.field.width - boss.radius, boss.x));
  boss.y = Math.max(boss.radius, Math.min(ctx.field.height - boss.radius, boss.y));
}
