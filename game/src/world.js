// The game world: one fixed-step simulation of the whole run. The renderer
// and the audio layer only read this state; the loop only calls step().
// Events are drained by the loop each step and turned into particles/sound.
import {
  BOSS, BOSS_TIMES, ENEMIES, PLAYER, STEP, SURGE_EVERY, difficultyAt, xpForLevel,
} from './config.js';
import { makeBoss, makeEnemy, pickKind, spawnPoint, updateEnemy } from './enemies.js';
import { freshPlayerStats, rollUpgrades } from './upgrades.js';

export const EVENT_NONE = 0;

export function createWorld(rng, width, height) {
  const world = {
    rng,
    field: { width, height },
    time: 0,
    score: 0,
    kills: 0,
    level: 1,
    xp: 0,
    xpNext: xpForLevel(1),
    player: null,
    bullets: [],
    enemyBullets: [],
    enemies: [],
    gems: [],
    spawnTimer: 1.2,
    surgeCount: 0,
    bossIndex: 0,
    boss: null,
    pendingLevelUps: 0,
    choices: [],
    owned: {},
    over: false,
    events: [],
    shotsFired: 0,
    gemsCollected: 0,
  };
  resetWorld(world);
  return world;
}

export function resetWorld(world) {
  const stats = freshPlayerStats();
  world.time = 0;
  world.score = 0;
  world.kills = 0;
  world.level = 1;
  world.xp = 0;
  world.xpNext = xpForLevel(1);
  world.player = {
    x: world.field.width / 2,
    y: world.field.height / 2,
    vx: 0, vy: 0,
    angle: -Math.PI / 2,
    radius: PLAYER.radius,
    fireTimer: 0,
    hurtTimer: 0,
    novaTimer: 5,
    shieldRegen: 0,
    ...stats,
  };
  world.bullets = [];
  world.enemyBullets = [];
  world.enemies = [];
  world.gems = [];
  world.spawnTimer = 1.2;
  world.surgeCount = 0;
  world.bossIndex = 0;
  world.boss = null;
  world.pendingLevelUps = 0;
  world.choices = [];
  world.owned = {};
  world.over = false;
  world.events = [];
  world.shotsFired = 0;
  world.gemsCollected = 0;
}

// Apply one of the offered upgrades, then roll the next offer if another
// level-up is still waiting.
export function applyUpgrade(world, upgrade) {
  upgrade.apply(world.player);
  world.owned[upgrade.id] = (world.owned[upgrade.id] ?? 0) + 1;
  world.pendingLevelUps -= 1;
  if (world.pendingLevelUps > 0) {
    world.choices = rollUpgrades(world.rng, world.owned);
  } else {
    world.choices = [];
  }
  world.events.push({ type: 'upgrade', name: upgrade.name });
}

function dropGem(world, x, y, value, big) {
  const angle = world.rng.angle();
  const speed = world.rng.range(30, 90);
  world.gems.push({
    x, y,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    value,
    big,
    wobble: world.rng.angle(),
  });
}

function killEnemy(world, enemy, index) {
  world.enemies.splice(index, 1);
  world.kills += 1;
  world.score += enemy.score;
  world.events.push({ type: 'explode', x: enemy.x, y: enemy.y, color: enemy.color, big: enemy.kind === 'boss' || enemy.kind === 'bulwark' });
  if (enemy.kind === 'boss') {
    world.boss = null;
    world.events.push({ type: 'bossDown' });
    for (let i = 0; i < 6; i += 1) dropGem(world, enemy.x, enemy.y, 5, true);
    return;
  }
  // Gems: one per enemy, worth its xp; tanks and splitters pay extra.
  dropGem(world, enemy.x, enemy.y, enemy.xp, enemy.xp >= 4);
  if (enemy.kind === 'mitosis') {
    // Splits into two mites that burst outward.
    for (let i = 0; i < (ENEMIES.mitosis.splits ?? 2); i += 1) {
      const mite = makeEnemy('mite', enemy.x, enemy.y, world.time, world.rng);
      const a = world.rng.angle();
      mite.x += Math.cos(a) * 18;
      mite.y += Math.sin(a) * 18;
      mite.vx = Math.cos(a) * 220;
      mite.vy = Math.sin(a) * 220;
      world.enemies.push(mite);
    }
  }
}

function damagePlayer(world, amount, x, y) {
  const p = world.player;
  if (p.hurtTimer > 0 || world.over) return;
  if (p.shield > 0) {
    p.shield -= 1;
    p.hurtTimer = PLAYER.contactDamageCooldown;
    world.events.push({ type: 'shieldBreak', x: p.x, y: p.y });
    return;
  }
  p.hp -= amount;
  p.hurtTimer = PLAYER.invulnerableAfterHit;
  world.events.push({ type: 'hurt', x: p.x, y: p.y });
  if (p.hp <= 0) {
    p.hp = 0;
    world.over = true;
    world.events.push({ type: 'explode', x: p.x, y: p.y, color: '#4df3ff', big: true });
    world.events.push({ type: 'gameover' });
  }
}

function firePlayerBullet(world, aimX, aimY) {
  const p = world.player;
  const base = Math.atan2(aimY - p.y, aimX - p.x);
  const count = p.projectiles;
  const spread = 0.14;
  for (let i = 0; i < count; i += 1) {
    const offset = (i - (count - 1) / 2) * spread;
    const angle = base + offset;
    world.bullets.push({
      x: p.x + Math.cos(angle) * (p.radius + 8),
      y: p.y + Math.sin(angle) * (p.radius + 8),
      vx: Math.cos(angle) * PLAYER.bulletSpeed,
      vy: Math.sin(angle) * PLAYER.bulletSpeed,
      radius: PLAYER.bulletRadius,
      damage: p.bulletDamage,
      life: PLAYER.bulletLife,
      pierce: p.pierce,
      ricochet: p.ricochet,
      hitIds: new Set(),
    });
  }
  p.angle = base;
  world.shotsFired += 1;
  world.events.push({ type: 'shoot', x: p.x, y: p.y, angle: base });
}

function nearestEnemy(world, x, y, excludeId, maxDist) {
  let best = null;
  let bestDist = maxDist;
  for (const e of world.enemies) {
    if (e.id === excludeId) continue;
    const d = Math.hypot(e.x - x, e.y - y);
    if (d < bestDist) {
      bestDist = d;
      best = e;
    }
  }
  return best;
}

// One fixed step. `input` is {mx, my, aimX, aimY, fire}: movement axis,
// aim point and whether the trigger is held (auto-fire keeps it true).
export function stepWorld(world, input, dt = STEP) {
  if (world.over) return;
  world.time += dt;
  world.score += dt * 5;
  const p = world.player;
  const field = world.field;

  // --- Player movement: acceleration, damping, arena clamp.
  p.vx += input.mx * PLAYER.accel * dt;
  p.vy += input.my * PLAYER.accel * dt;
  const damp = Math.max(0, 1 - PLAYER.damping * dt);
  p.vx *= damp;
  p.vy *= damp;
  const speed = Math.hypot(p.vx, p.vy);
  if (speed > p.maxSpeed) {
    p.vx = (p.vx / speed) * p.maxSpeed;
    p.vy = (p.vy / speed) * p.maxSpeed;
  }
  p.x = Math.max(p.radius, Math.min(field.width - p.radius, p.x + p.vx * dt));
  p.y = Math.max(p.radius, Math.min(field.height - p.radius, p.y + p.vy * dt));
  p.hurtTimer = Math.max(0, p.hurtTimer - dt);

  // Shield recharges one charge every 12 seconds, up to the max.
  if (p.maxShield > 0 && p.shield < p.maxShield) {
    p.shieldRegen += dt;
    if (p.shieldRegen >= 12) {
      p.shieldRegen = 0;
      p.shield += 1;
    }
  }

  // --- Auto-fire toward the aim point.
  p.fireTimer -= dt;
  if (input.fire && p.fireTimer <= 0) {
    p.fireTimer = p.fireInterval;
    firePlayerBullet(world, input.aimX, input.aimY);
  }

  // --- Nova pulse.
  if (p.novaLevel > 0) {
    p.novaTimer -= dt;
    if (p.novaTimer <= 0) {
      p.novaTimer = 6;
      const radius = 170 + p.novaLevel * 30;
      const damage = 20 + p.novaLevel * 12;
      world.events.push({ type: 'nova', x: p.x, y: p.y, radius });
      for (let i = world.enemies.length - 1; i >= 0; i -= 1) {
        const e = world.enemies[i];
        if (Math.hypot(e.x - p.x, e.y - p.y) <= radius + e.radius) {
          e.hp -= damage;
          e.flash = 1;
          if (e.hp <= 0) killEnemy(world, e, i);
        }
      }
    }
  }

  // --- Player bullets: move, age, hit enemies.
  for (let i = world.bullets.length - 1; i >= 0; i -= 1) {
    const b = world.bullets[i];
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.life -= dt;
    let dead = b.life <= 0
      || b.x < -20 || b.x > field.width + 20 || b.y < -20 || b.y > field.height + 20;
    if (!dead) {
      for (let j = world.enemies.length - 1; j >= 0; j -= 1) {
        const e = world.enemies[j];
        if (b.hitIds.has(e.id)) continue;
        const rr = b.radius + e.radius;
        if (Math.abs(b.x - e.x) < rr && Math.abs(b.y - e.y) < rr
          && Math.hypot(b.x - e.x, b.y - e.y) < rr) {
          b.hitIds.add(e.id);
          e.hp -= b.damage;
          e.flash = 1;
          world.events.push({ type: 'hit', x: b.x, y: b.y, color: e.color });
          if (e.hp <= 0) {
            killEnemy(world, e, j);
          }
          if (b.pierce > 0) {
            b.pierce -= 1;
          } else if (b.ricochet > 0) {
            const next = nearestEnemy(world, b.x, b.y, e.id, 300);
            if (next) {
              const a = Math.atan2(next.y - b.y, next.x - b.x);
              const sp = Math.hypot(b.vx, b.vy);
              b.vx = Math.cos(a) * sp;
              b.vy = Math.sin(a) * sp;
              b.ricochet -= 1;
              b.life = Math.max(b.life, 0.35);
            } else {
              dead = true;
            }
          } else {
            dead = true;
          }
          break;
        }
      }
    }
    if (dead) world.bullets.splice(i, 1);
  }

  // --- Enemies: steer, fire, touch the player.
  const ctx = { player: p, rng: world.rng, field };
  for (let i = world.enemies.length - 1; i >= 0; i -= 1) {
    const e = world.enemies[i];
    const fired = updateEnemy(e, ctx, dt);
    for (const shot of fired) {
      world.enemyBullets.push(shot);
      if (e.kind === 'spitter') world.events.push({ type: 'enemyShoot', x: e.x, y: e.y });
    }
    if (e.spawnMinions) {
      const n = e.spawnMinions;
      e.spawnMinions = 0;
      for (let k = 0; k < n; k += 1) {
        const mite = makeEnemy('mite', e.x, e.y, world.time, world.rng);
        const a = world.rng.angle();
        mite.x += Math.cos(a) * (e.radius + 16);
        mite.y += Math.sin(a) * (e.radius + 16);
        world.enemies.push(mite);
      }
    }
    const rr = e.radius + p.radius - 2;
    if (Math.hypot(e.x - p.x, e.y - p.y) < rr) {
      damagePlayer(world, e.damage, e.x, e.y);
      // Shove the enemy back so one touch is not a permanent hug.
      const a = Math.atan2(e.y - p.y, e.x - p.x);
      e.x = p.x + Math.cos(a) * rr;
      e.y = p.y + Math.sin(a) * rr;
      if (world.over) return;
    }
  }

  // --- Hostile bullets.
  for (let i = world.enemyBullets.length - 1; i >= 0; i -= 1) {
    const b = world.enemyBullets[i];
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    let dead = b.x < -30 || b.x > field.width + 30 || b.y < -30 || b.y > field.height + 30;
    if (!dead && Math.hypot(b.x - p.x, b.y - p.y) < b.radius + p.radius - 2) {
      damagePlayer(world, b.damage, b.x, b.y);
      dead = true;
      if (world.over) return;
    }
    if (dead) world.enemyBullets.splice(i, 1);
  }

  // --- Gems: drift, magnetise, collect.
  for (let i = world.gems.length - 1; i >= 0; i -= 1) {
    const g = world.gems[i];
    g.wobble += dt * 3;
    const dx = p.x - g.x;
    const dy = p.y - g.y;
    const dist = Math.hypot(dx, dy) || 1;
    if (dist < p.pickupRadius) {
      const pull = 900 * (1 - dist / (p.pickupRadius + 40));
      g.vx += (dx / dist) * pull * dt;
      g.vy += (dy / dist) * pull * dt;
    } else {
      g.vx *= Math.max(0, 1 - 2 * dt);
      g.vy *= Math.max(0, 1 - 2 * dt);
    }
    g.x += g.vx * dt;
    g.y += g.vy * dt;
    if (dist < p.radius + 12) {
      world.gems.splice(i, 1);
      world.gemsCollected += 1;
      const gained = Math.round(g.value * p.xpGain);
      world.xp += gained;
      world.events.push({ type: 'pickup', x: g.x, y: g.y, color: g.big ? '#b6ff5e' : '#39ff88' });
      while (world.xp >= world.xpNext) {
        world.xp -= world.xpNext;
        world.level += 1;
        world.xpNext = xpForLevel(world.level);
        world.pendingLevelUps += 1;
        world.events.push({ type: 'levelup', level: world.level });
      }
      if (world.pendingLevelUps > 0 && world.choices.length === 0) {
        world.choices = rollUpgrades(world.rng, world.owned);
      }
    }
  }

  // --- Spawning. Groups grow with the clock so the arena stays busy.
  const diff = difficultyAt(world.time);
  world.spawnTimer -= dt;
  if (world.spawnTimer <= 0 && world.enemies.length < diff.maxAlive) {
    world.spawnTimer = diff.spawnInterval * world.rng.range(0.7, 1.3);
    const group = 1 + (world.time > 40 ? 1 : 0) + (world.time > 100 ? 1 : 0);
    for (let g = 0; g < group && world.enemies.length < diff.maxAlive; g += 1) {
      const point = spawnPoint(field, world.rng);
      world.enemies.push(makeEnemy(pickKind(world.time, world.rng), point.x, point.y, world.time, world.rng));
    }
  }

  // --- Surges: every 30 s a banner and a burst of spawns.
  const surgeNow = Math.floor(world.time / SURGE_EVERY);
  if (surgeNow > world.surgeCount) {
    world.surgeCount = surgeNow;
    world.events.push({ type: 'surge', n: surgeNow });
    for (let i = 0; i < 5; i += 1) {
      const point = spawnPoint(field, world.rng);
      world.enemies.push(makeEnemy(pickKind(world.time, world.rng), point.x, point.y, world.time, world.rng));
    }
  }

  // --- Boss schedule.
  if (world.bossIndex < BOSS_TIMES.length && world.time >= BOSS_TIMES[world.bossIndex] && !world.boss) {
    const tier = world.bossIndex + 1;
    const boss = makeBoss(field.width / 2, -BOSS.radius - 10, tier, world.time);
    // Drop it just inside the top edge so the entrance reads on screen.
    boss.y = 90;
    world.enemies.push(boss);
    world.boss = boss;
    world.bossIndex += 1;
    world.events.push({ type: 'boss', tier });
  }
}

// Snapshot of the numbers the HUD and the screens show.
export function hudState(world) {
  return {
    time: world.time,
    score: Math.floor(world.score),
    kills: world.kills,
    level: world.level,
    xp: world.xp,
    xpNext: world.xpNext,
    hp: Math.ceil(world.player.hp),
    maxHp: world.player.maxHp,
    shield: world.player.shield,
    maxShield: world.player.maxShield,
    enemies: world.enemies.length,
    boss: world.boss ? { hp: Math.max(0, Math.ceil(world.boss.hp)), maxHp: world.boss.maxHp, tier: world.boss.tier } : null,
    surge: world.surgeCount,
  };
}
