// VOIDPULSE — Neon Arena Survival. Boot and the one loop: input is read
// every frame, the world advances in fixed 1/60 s steps, and the renderer
// paints what is there. The game moves between five screens: title, play,
// level-up, paused and game over.
//
// ?seed=N fixes the spawn pattern. ?shot=title|play|upgrade|boss (with
// &seed=N) stages that scene instead of running the loop, paints it twice
// and sets window.__shotReady for a screenshot. ?soak=1 plays with the
// autopilot and reports window.__soakResult when the run ends.
import { BEST_KEY, STEP } from './config.js';
import { createRandom } from './random.js';
import { applyUpgrade, createWorld, resetWorld, stepWorld } from './world.js';
import { ACTION_CONFIRM, ACTION_MUTE, ACTION_PAUSE, ACTION_RESTART, createInput } from './input.js';
import { createAudio } from './audio.js';
import { createParticles } from './particles.js';
import {
  SCREEN_LEVELUP, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE,
  createRenderer, levelUpCards,
} from './render.js';
import { autopilot, stageShot } from './shots.js';

const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const soak = params.get('soak') === '1';
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');

function sizeCanvas() {
  canvas.width = Math.max(640, window.innerWidth);
  canvas.height = Math.max(360, window.innerHeight);
}
sizeCanvas();

const world = createWorld(createRandom(seed), canvas.width, canvas.height);
const renderer = createRenderer(canvas);
const audio = createAudio();
const particles = createParticles();
const input = createInput(canvas);

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off (private windows): the best score then lasts
    // this visit only.
  }
}

let best = readBest();
let screen = SCREEN_TITLE;
let time = 0;
let banner = null;
let mouseMoved = false;
let soakDone = false;
let soakRestarts = 0;
const soakMarks = { levelUp: false, boss: false, died: false, restarted: false };
let lastMouse = { x: -1, y: -1 };

canvas.addEventListener('mousemove', () => {
  const m = input.mouse;
  if (m.x !== lastMouse.x || m.y !== lastMouse.y) {
    mouseMoved = true;
    lastMouse = { x: m.x, y: m.y };
  }
});

// Drain the world's event queue into particles and sound.
function handleEvents() {
  for (const event of world.events) {
    if (event.type === 'shoot') {
      particles.muzzle(event.x, event.y, event.angle);
      audio.shoot();
    } else if (event.type === 'enemyShoot') {
      audio.enemyShoot();
    } else if (event.type === 'explode') {
      particles.explosion(event.x, event.y, event.color, event.big);
      audio.explode(event.big);
    } else if (event.type === 'hit') {
      particles.sparks(event.x, event.y, event.color, 5);
    } else if (event.type === 'pickup') {
      particles.pickupSparkle(event.x, event.y, event.color);
      audio.pickup();
    } else if (event.type === 'hurt') {
      particles.addShake(0.45);
      audio.hurt();
    } else if (event.type === 'shieldBreak') {
      particles.ring(event.x, event.y, '#7cc7ff', 46);
      audio.hurt();
    } else if (event.type === 'levelup') {
      soakMarks.levelUp = true;
      particles.ring(world.player.x, world.player.y, '#39ff88', 90);
      audio.levelUp();
    } else if (event.type === 'upgrade') {
      particles.floatText(world.player.x, world.player.y - 30, event.name, '#ffd166');
    } else if (event.type === 'nova') {
      particles.ring(event.x, event.y, '#4df3ff', event.radius);
      audio.explode(false);
    } else if (event.type === 'surge') {
      banner = { text: `⚠ SURGE ${event.n} — THE SWARM THICKENS`, alpha: 1, age: 0 };
    } else if (event.type === 'boss') {
      soakMarks.boss = true;
      banner = { text: `☠ VOID MAW — TIER ${event.tier}`, alpha: 1, age: 0 };
      audio.bossAlarm();
    } else if (event.type === 'bossDown') {
      particles.floatText(world.player.x, world.player.y - 40, '+500  VOID MAW DOWN', '#ff2e63');
      banner = { text: 'VOID MAW DESTROYED', alpha: 1, age: 0 };
    } else if (event.type === 'gameover') {
      soakMarks.died = true;
      audio.gameOver();
      const score = Math.floor(world.score);
      if (score > best) {
        best = score;
        saveBest(best);
      }
    }
  }
  world.events.length = 0;
}

// Aim point: the mouse once it has moved, else the nearest enemy.
function aimPoint() {
  if (mouseMoved) return { x: input.mouse.x, y: input.mouse.y };
  let nearest = null;
  let nearestDist = Infinity;
  for (const e of world.enemies) {
    const d = Math.hypot(e.x - world.player.x, e.y - world.player.y);
    if (d < nearestDist) {
      nearestDist = d;
      nearest = e;
    }
  }
  if (nearest) return { x: nearest.x, y: nearest.y };
  return { x: world.player.x, y: world.player.y - 100 };
}

function liveControl() {
  const axis = input.moveAxis();
  const aim = aimPoint();
  return { mx: axis.x, my: axis.y, aimX: aim.x, aimY: aim.y, fire: true };
}

function startRun() {
  resetWorld(world);
  particles.clear();
  banner = null;
  screen = SCREEN_PLAY;
  audio.unlock();
  input.clearPressed();
}

function pickUpgrade(index) {
  const choice = world.choices[index];
  if (!choice) return;
  audio.click();
  applyUpgrade(world, choice);
  handleEvents();
  if (world.pendingLevelUps <= 0) {
    screen = SCREEN_PLAY;
    input.clearPressed();
  }
}

function levelUpClick() {
  const cards = levelUpCards(world.field);
  const m = input.mouse;
  for (let i = 0; i < cards.length; i += 1) {
    const c = cards[i];
    if (m.x >= c.x && m.x <= c.x + c.w && m.y >= c.y && m.y <= c.y + c.h) {
      pickUpgrade(i);
      return;
    }
  }
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(MAX_FRAME, (now - last) / 1000 || 0);
  last = now;
  time += dt;
  if (banner) {
    banner.age += dt;
    banner.alpha = Math.max(0, 1 - banner.age / 2.6);
    if (banner.alpha <= 0) banner = null;
  }
  particles.update(dt);

  if (screen === SCREEN_TITLE) {
    // The title idles over a live world: step it gently with the autopilot
    // so the background is a real game in progress, not a still image.
    stepWorld(world, autopilot(world), STEP);
    handleEvents();
    if (world.over) resetWorld(world);
    if (input.take(ACTION_CONFIRM) || input.take(ACTION_RESTART)) startRun();
  } else if (screen === SCREEN_PLAY) {
    if (input.take(ACTION_PAUSE)) {
      screen = SCREEN_PAUSED;
      input.clearPressed();
    } else if (input.take(ACTION_MUTE)) {
      audio.toggleMute();
    } else {
      const control = soak ? autopilot(world) : liveControl();
      let accumulator = dt;
      while (accumulator >= STEP) {
        if (world.over) break;
        stepWorld(world, control, STEP);
        accumulator -= STEP;
        if (world.pendingLevelUps > 0 && world.choices.length > 0) break;
      }
      handleEvents();
      if (world.over) {
        screen = SCREEN_OVER;
      } else if (world.pendingLevelUps > 0 && world.choices.length > 0) {
        screen = SCREEN_LEVELUP;
      }
    }
  } else if (screen === SCREEN_LEVELUP) {
    if (input.take('pick1')) pickUpgrade(0);
    else if (input.take('pick2')) pickUpgrade(1);
    else if (input.take('pick3')) pickUpgrade(2);
    else if (input.take(ACTION_CONFIRM)) levelUpClick();
  } else if (screen === SCREEN_PAUSED) {
    if (input.take(ACTION_PAUSE) || input.take(ACTION_CONFIRM)) {
      screen = SCREEN_PLAY;
      input.clearPressed();
    }
  } else if (screen === SCREEN_OVER) {
    if (input.take(ACTION_CONFIRM) || input.take(ACTION_RESTART)) startRun();
  }

  // Soak mode: the autopilot plays, restarts once after death, and reports.
  if (soak && !soakDone) {
    if (screen === SCREEN_LEVELUP && world.choices.length > 0) {
      pickUpgrade(0);
    }
    if (screen === SCREEN_TITLE) {
      screen = SCREEN_PLAY;
    }
    if (screen === SCREEN_OVER && soakRestarts < 1) {
      soakRestarts += 1;
      soakMarks.restarted = true;
      startRun();
    }
    const done = world.time >= 150 || (screen === SCREEN_OVER && soakRestarts >= 1);
    if (done) {
      soakDone = true;
      window.__soakResult = {
        survivedSeconds: Math.round(world.time * 10) / 10,
        score: Math.floor(world.score),
        kills: world.kills,
        level: world.level,
        levelUpSeen: soakMarks.levelUp,
        bossSeen: soakMarks.boss,
        died: soakMarks.died,
        restarted: soakMarks.restarted,
        restarts: soakRestarts,
        gemsCollected: world.gemsCollected,
        shotsFired: world.shotsFired,
        screen,
      };
    }
  }

  const offset = particles.offset(time);
  const ctx = canvas.getContext('2d');
  ctx.save();
  ctx.translate(offset.x, offset.y);
  renderer.draw(world, screen, time, particles, banner, best);
  ctx.restore();
}

function runShot(name) {
  const staged = stageShot(name, world, applyUpgrade);
  screen = staged.screen;
  // Paint twice so glow and shadows settle, then signal readiness.
  let painted = 0;
  function paint() {
    renderer.draw(world, screen, staged.simulated, particles, null, staged.best);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else {
      window.__shotReady = true;
      window.__shotInfo = {
        name,
        screen: staged.screen,
        simulatedSeconds: Math.round(staged.simulated * 10) / 10,
        score: Math.floor(world.score),
        kills: world.kills,
        level: world.level,
        enemies: world.enemies.length,
        boss: world.boss ? world.boss.tier : 0,
      };
    }
  }
  requestAnimationFrame(paint);
}

window.addEventListener('resize', () => {
  sizeCanvas();
  world.field.width = canvas.width;
  world.field.height = canvas.height;
});

let last = performance.now();
if (shot) {
  runShot(shot);
} else {
  if (soak) screen = SCREEN_PLAY;
  status.textContent = 'VOIDPULSE: WASD to move, mouse to aim, auto-fire on. P pauses, M mutes.';
  requestAnimationFrame(frame);
}
