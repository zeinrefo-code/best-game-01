// Screenshot scenes: each one plays the real rules forward from a fresh
// world for a fixed number of steps, steered by a simple autopilot, so the
// frame is what a short game really looks like and the same seed always
// gives the same frame. No hand-placed props: every dot on screen earned
// its place by the simulation.
import { STEP } from './config.js';
import { stepWorld } from './world.js';
import { SCREEN_LEVELUP, SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE } from './render.js';

const SAMPLE = STEP;

// Autopilot: aim at the nearest enemy, run from anything too close, chase
// the nearest gem when it is safe, and kite the boss at mid range. When
// something closes inside dash range it bursts out, untouchable.
export function autopilot(world) {
  const p = world.player;
  const input = { mx: 0, my: 0, aimX: p.x, aimY: p.y - 100, fire: true, dash: false };

  let nearest = null;
  let nearestDist = Infinity;
  for (const e of world.enemies) {
    const d = Math.hypot(e.x - p.x, e.y - p.y);
    if (d < nearestDist) {
      nearestDist = d;
      nearest = e;
    }
  }
  if (nearest) {
    input.aimX = nearest.x;
    input.aimY = nearest.y;
  }

  // Flee vector: away from the nearest enemy and the nearest hostile bullet.
  let fx = 0;
  let fy = 0;
  if (nearest && nearestDist < 170) {
    const d = Math.max(1, nearestDist);
    fx += ((p.x - nearest.x) / d) * (170 - nearestDist) / 70;
    fy += ((p.y - nearest.y) / d) * (170 - nearestDist) / 70;
  }
  let nearestBullet = null;
  let nearestBulletDist = Infinity;
  for (const b of world.enemyBullets) {
    const d = Math.hypot(b.x - p.x, b.y - p.y);
    if (d < nearestBulletDist) {
      nearestBulletDist = d;
      nearestBullet = b;
    }
  }
  if (nearestBullet && nearestBulletDist < 110) {
    const d = Math.max(1, nearestBulletDist);
    fx += ((p.x - nearestBullet.x) / d) * 1.4;
    fy += ((p.y - nearestBullet.y) / d) * 1.4;
  }

  // Boss kiting: hold a ring at 280 px and strafe around it.
  if (world.boss) {
    const b = world.boss;
    const d = Math.hypot(b.x - p.x, b.y - p.y) || 1;
    const nx = (p.x - b.x) / d;
    const ny = (p.y - b.y) / d;
    const radial = d < 240 ? 1 : d > 330 ? -1 : 0;
    fx += nx * radial * 1.2 - ny * 0.9;
    fy += ny * radial * 1.2 + nx * 0.9;
  }

  // Chase the nearest gem when nothing is breathing down our neck.
  if (nearestDist > 120) {
    let gem = null;
    let gemDist = Infinity;
    for (const g of world.gems) {
      const d = Math.hypot(g.x - p.x, g.y - p.y);
      if (d < gemDist) {
        gemDist = d;
        gem = g;
      }
    }
    if (gem && gemDist < 420) {
      const d = Math.max(1, gemDist);
      fx += ((gem.x - p.x) / d) * 0.8;
      fy += ((gem.y - p.y) / d) * 0.8;
    }
  }

  // Drift back toward the centre when there is nothing to do.
  if (Math.abs(fx) < 0.05 && Math.abs(fy) < 0.05) {
    const cx = world.field.width / 2 - p.x;
    const cy = world.field.height / 2 - p.y;
    const d = Math.hypot(cx, cy);
    if (d > 120) {
      fx = (cx / d) * 0.5;
      fy = (cy / d) * 0.5;
    }
  }

  const len = Math.hypot(fx, fy);
  if (len > 0.01) {
    input.mx = fx / len;
    input.my = fy / len;
  }
  // Point-blank is dash territory: burst out along the flee vector.
  if (nearest && nearestDist < 84 && p.dashCooldownT <= 0) input.dash = true;
  return input;
}

// Run the world forward with the autopilot. Stops early at a level-up
// offer (so the caller can draw it) or at game over. Returns the
// simulated seconds.
export function simulate(world, seconds) {
  const steps = Math.floor(seconds / SAMPLE);
  let elapsed = 0;
  for (let i = 0; i < steps; i += 1) {
    if (world.over) break;
    if (world.pendingLevelUps > 0 && world.choices.length > 0) break;
    stepWorld(world, autopilot(world), SAMPLE);
    elapsed += SAMPLE;
  }
  return elapsed;
}

// Stage one named scene and return the screen to draw over it.
export function stageShot(name, world, applyUpgradeFn) {
  if (name === 'title') {
    simulate(world, 5);
    return { screen: SCREEN_TITLE, best: 0, simulated: 5 };
  }
  if (name === 'play') {
    // A busy mid-game frame: auto-pick upgrades as they come so the run
    // reaches the thick of the swarm instead of stopping at level 2.
    let elapsed = 0;
    while (elapsed < 58 && !world.over) {
      if (world.pendingLevelUps > 0 && world.choices.length > 0) {
        applyUpgradeFn(world, world.choices[0]);
      }
      stepWorld(world, autopilot(world), SAMPLE);
      elapsed += SAMPLE;
    }
    // Then wait for a frameable moment: the ship near the centre with a
    // crowd around it — ideally including one of the new horrors, a Fuse
    // or a Longshot — so the screenshot reads as a fight, not an empty
    // corner of the void.
    let framed = 0;
    while (framed < 14 && !world.over) {
      if (world.pendingLevelUps > 0 && world.choices.length > 0) {
        applyUpgradeFn(world, world.choices[0]);
      }
      const p = world.player;
      const cx = p.x > world.field.width * 0.3 && p.x < world.field.width * 0.7;
      const cy = p.y > world.field.height * 0.25 && p.y < world.field.height * 0.75;
      let near = 0;
      let newNear = false;
      for (const e of world.enemies) {
        if (Math.hypot(e.x - p.x, e.y - p.y) < 430) {
          near += 1;
          if (e.shape === 'bomb' || e.shape === 'lens') newNear = true;
        }
      }
      if (cx && cy && near >= 6 && (newNear || framed > 8)) break;
      stepWorld(world, autopilot(world), SAMPLE);
      elapsed += SAMPLE;
      framed += SAMPLE;
    }
    return { screen: world.over ? SCREEN_OVER : SCREEN_PLAY, best: 0, simulated: elapsed };
  }
  if (name === 'upgrade') {
    // Play until the first level-up offer appears (or the cap), taking no
    // card yet: the frame shows the offer itself.
    let waited = 0;
    while (waited < 150 && world.pendingLevelUps === 0 && !world.over) {
      stepWorld(world, autopilot(world), SAMPLE);
      waited += SAMPLE;
    }
    if (world.over) return { screen: SCREEN_OVER, best: 0, simulated: waited };
    return { screen: SCREEN_LEVELUP, best: 0, simulated: waited };
  }
  if (name === 'boss') {
    // Survive to the first boss, then fight it for a while.
    let waited = 0;
    while (waited < 100 && !world.boss && !world.over) {
      stepWorld(world, autopilot(world), SAMPLE);
      waited += SAMPLE;
    }
    if (world.over) return { screen: SCREEN_OVER, best: 0, simulated: waited };
    // Auto-pick any level-up that appears on the way so the fight
    // continues — and stop mid spiral-barrage, so the frame catches the
    // Maw's new attack pattern streaming.
    let fought = 0;
    while (fought < 22 && !world.over) {
      if (world.pendingLevelUps > 0 && world.choices.length > 0) {
        applyUpgradeFn(world, world.choices[0]);
      }
      stepWorld(world, autopilot(world), SAMPLE);
      fought += SAMPLE;
      if (world.boss && world.boss.spiralT > 0.35 && fought > 2) break;
    }
    return { screen: world.over ? SCREEN_OVER : SCREEN_PLAY, best: 0, simulated: waited + fought };
  }
  simulate(world, 5);
  return { screen: SCREEN_TITLE, best: 0, simulated: 5 };
}
