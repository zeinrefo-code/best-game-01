// All canvas drawing: the layered void background, the entities, the HUD
// and the four screens (title, level-up, paused, game over). Nothing here
// mutates the world; the loop hands it the state and the time.
import { PALETTE, TAU } from './config.js';
import { createRandom } from './random.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_LEVELUP = 'levelup';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';

// The three upgrade cards, laid out for the field size. main.js uses the
// same rects for click detection, so a click and a drawing can never drift.
export function levelUpCards(field) {
  const w = 300;
  const h = 210;
  const gap = 26;
  const total = w * 3 + gap * 2;
  const x0 = (field.width - total) / 2;
  const y = Math.max(96, (field.height - h) / 2 - 8);
  return [0, 1, 2].map((i) => ({ x: x0 + i * (w + gap), y, w, h }));
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  const starRng = createRandom(1337);
  // Two star layers: the far sheet barely moves, the near sheet drifts
  // against the player's position, so the void has depth (parallax).
  const starsFar = [];
  for (let i = 0; i < 110; i += 1) {
    starsFar.push({
      x: starRng.next(), y: starRng.next(),
      r: 0.6 + starRng.next() * 1.4,
      tw: starRng.range(0.5, 2.4),
      phase: starRng.range(0, TAU),
    });
  }
  const starsNear = [];
  for (let i = 0; i < 44; i += 1) {
    starsNear.push({
      x: starRng.next(), y: starRng.next(),
      r: 1.4 + starRng.next() * 1.8,
      tw: starRng.range(0.8, 3.2),
      phase: starRng.range(0, TAU),
    });
  }
  const nebulae = [];
  for (let i = 0; i < 6; i += 1) {
    nebulae.push({
      x: starRng.next(), y: starRng.next(),
      r: 120 + starRng.next() * 220,
      hue: starRng.pick(['124, 92, 255', '255, 46, 99', '77, 243, 255', '57, 255, 136']),
      alpha: 0.05 + starRng.next() * 0.05,
      drift: starRng.range(0.04, 0.11),
      phase: starRng.range(0, TAU),
    });
  }

  function fmtTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  function drawStarLayer(layer, field, time, offsetX, offsetY, tint) {
    for (const s of layer) {
      const a = 0.25 + 0.55 * (0.5 + 0.5 * Math.sin(time * s.tw + s.phase));
      ctx.globalAlpha = a;
      ctx.fillStyle = tint;
      ctx.beginPath();
      ctx.arc(s.x * field.width + offsetX, s.y * field.height + offsetY, s.r, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawBackground(field, time, focus) {
    const grad = ctx.createLinearGradient(0, 0, 0, field.height);
    grad.addColorStop(0, PALETTE.voidTop);
    grad.addColorStop(1, PALETTE.voidBottom);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, field.width, field.height);

    // Parallax offsets: how far the view leans toward the player, scaled
    // per layer so near stars swing wider than far ones.
    const leanX = focus ? focus.x - field.width / 2 : 0;
    const leanY = focus ? focus.y - field.height / 2 : 0;

    // Nebulae breathe and wander very slowly.
    for (let i = 0; i < nebulae.length; i += 1) {
      const n = nebulae[i];
      const cx = (n.x + Math.sin(time * n.drift + n.phase) * 0.03) * field.width - leanX * 0.02;
      const cy = (n.y + Math.cos(time * n.drift * 0.8 + n.phase) * 0.03) * field.height - leanY * 0.02;
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, n.r);
      g.addColorStop(0, `rgba(${n.hue}, ${n.alpha})`);
      g.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, field.width, field.height);
    }

    // Aurora veils: two wide diagonal ribbons of coloured light that
    // drift and breathe behind everything, so the void is never flat.
    for (let i = 0; i < 2; i += 1) {
      const drift = Math.sin(time * 0.07 + i * 2.4) * 46;
      const sway = Math.sin(time * 0.045 + i * 1.7) * 0.05;
      ctx.save();
      ctx.translate(field.width / 2, field.height / 2);
      ctx.rotate(-0.52 + sway + i * 0.24);
      const ag = ctx.createLinearGradient(-field.width, 0, field.width, 0);
      const hue = i === 0 ? '77, 243, 255' : '255, 46, 99';
      const peak = 0.045 + 0.02 * (0.5 + 0.5 * Math.sin(time * 0.11 + i * 2.1));
      ag.addColorStop(0, `rgba(${hue}, 0)`);
      ag.addColorStop(0.5, `rgba(${hue}, ${peak})`);
      ag.addColorStop(1, `rgba(${hue}, 0)`);
      ctx.fillStyle = ag;
      ctx.fillRect(-field.width, -58 + drift + i * 130, field.width * 2, 116);
      ctx.restore();
    }

    drawStarLayer(starsFar, field, time, -leanX * 0.012, -leanY * 0.012, '#cfc6ff');

    // Grid, drifting slowly downward so the void feels alive — and it
    // pulses: a bright band sweeps the field while every fourth line
    // breathes with the clock.
    const step = 64;
    const offset = (time * 12) % step;
    ctx.strokeStyle = PALETTE.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x <= field.width; x += step) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, field.height);
    }
    for (let y = -step + offset; y <= field.height; y += step) {
      ctx.moveTo(0, y);
      ctx.lineTo(field.width, y);
    }
    ctx.stroke();
    const pulse = 0.5 + 0.5 * Math.sin(time * 2.1);
    ctx.strokeStyle = `rgba(150, 120, 255, ${0.05 + pulse * 0.09})`;
    ctx.beginPath();
    for (let x = 0; x <= field.width; x += step * 4) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, field.height);
    }
    for (let y = -step + offset; y <= field.height; y += step * 4) {
      ctx.moveTo(0, y);
      ctx.lineTo(field.width, y);
    }
    ctx.stroke();
    // The sweeping pulse band: a soft wall of light crossing the arena.
    const bandY = ((time * 85) % (field.height + 220)) - 110;
    const band = ctx.createLinearGradient(0, bandY - 70, 0, bandY + 70);
    band.addColorStop(0, 'rgba(124, 92, 255, 0)');
    band.addColorStop(0.5, 'rgba(124, 92, 255, 0.10)');
    band.addColorStop(1, 'rgba(124, 92, 255, 0)');
    ctx.fillStyle = band;
    ctx.fillRect(0, bandY - 70, field.width, 140);

    drawStarLayer(starsNear, field, time, -leanX * 0.035, -leanY * 0.035, '#efeaff');

    // Shooting stars: brief bright streaks on fixed cycles. Every part
    // is a function of the clock (a hashed cycle index picks the start
    // point), so a staged screenshot always catches the same sky.
    for (let i = 0; i < 3; i += 1) {
      const period = 6.5 + i * 3.1;
      const cycle = Math.floor(time / period) + i * 7;
      const frac = (time % period) / period;
      if (frac > 0.085) continue;
      const prog = frac / 0.085;
      const hash = (n) => {
        const v = Math.sin(cycle * 12.9898 + n * 78.233) * 43758.5453;
        return v - Math.floor(v);
      };
      const sx = hash(1) * field.width * 0.8;
      const sy = hash(2) * field.height * 0.4;
      const dx = 0.82;
      const dy = 0.45;
      const hx = sx + dx * prog * 460;
      const hy = sy + dy * prog * 460;
      const tail = 90 * Math.sin(prog * Math.PI);
      const grad = ctx.createLinearGradient(hx - dx * tail, hy - dy * tail, hx, hy);
      grad.addColorStop(0, 'rgba(239, 234, 255, 0)');
      grad.addColorStop(1, `rgba(239, 234, 255, ${0.75 * Math.sin(prog * Math.PI)})`);
      ctx.save();
      ctx.strokeStyle = grad;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(hx - dx * tail, hy - dy * tail);
      ctx.lineTo(hx, hy);
      ctx.stroke();
      ctx.restore();
    }

    // A soft vignette keeps the edges dark and the centre readable.
    const v = ctx.createRadialGradient(
      field.width / 2, field.height / 2, Math.min(field.width, field.height) * 0.35,
      field.width / 2, field.height / 2, Math.max(field.width, field.height) * 0.72,
    );
    v.addColorStop(0, 'rgba(0, 0, 0, 0)');
    v.addColorStop(1, 'rgba(2, 0, 10, 0.55)');
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, field.width, field.height);
  }

  function drawGem(g, time) {
    const pulse = 1 + 0.18 * Math.sin(time * 5 + g.wobble);
    const size = (g.big ? 9 : 6) * pulse;
    ctx.save();
    ctx.translate(g.x, g.y);
    ctx.rotate(time * 1.5 + g.wobble);
    ctx.shadowColor = g.big ? PALETTE.gemBig : PALETTE.gem;
    ctx.shadowBlur = 10;
    ctx.fillStyle = g.big ? PALETTE.gemBig : PALETTE.gem;
    ctx.beginPath();
    ctx.moveTo(0, -size);
    ctx.lineTo(size * 0.7, 0);
    ctx.lineTo(0, size);
    ctx.lineTo(-size * 0.7, 0);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawEnemy(e, time) {
    // The Longshot's telegraph paints under everything else: a thin red
    // line along its locked aim that brightens as the charge completes.
    if (e.shape === 'lens' && e.snipeState === 'aim') {
      ctx.save();
      ctx.translate(e.x, e.y);
      ctx.rotate(e.aimAngle);
      const flicker = 0.75 + 0.25 * Math.sin(time * 42);
      ctx.strokeStyle = `rgba(255, 64, 64, ${(0.16 + e.aimFrac * 0.4) * flicker})`;
      ctx.lineWidth = 2;
      ctx.setLineDash([10, 7]);
      ctx.beginPath();
      ctx.moveTo(e.radius + 4, 0);
      ctx.lineTo(640, 0);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }
    // A lit Fuse advertises its blast radius so the danger reads fairly.
    if (e.shape === 'bomb' && e.fuseT >= 0) {
      ctx.save();
      ctx.globalAlpha = 0.13 + 0.07 * Math.sin(time * 26);
      ctx.strokeStyle = '#ff6b35';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 8]);
      ctx.beginPath();
      ctx.arc(e.x, e.y, 98, 0, TAU);
      ctx.stroke();
      ctx.restore();
    }

    ctx.save();
    ctx.translate(e.x, e.y);
    // Hit-flash: a white flash and a small scale pop on the step a blow
    // lands, decaying with the flash timer the world sets.
    const flash = e.flash > 0;
    const pop = 1 + Math.max(0, e.flash) * 0.13;
    ctx.scale(pop, pop);
    ctx.shadowColor = e.color;
    ctx.shadowBlur = flash ? 24 : 12;
    ctx.fillStyle = flash ? '#ffffff' : e.color;
    ctx.strokeStyle = flash ? '#ffffff' : e.core;
    ctx.lineWidth = 2;
    const r = e.radius;
    if (e.shape === 'tri') {
      const a = Math.atan2(e.vy, e.vx);
      ctx.rotate(Number.isFinite(a) ? a : 0);
      ctx.beginPath();
      ctx.moveTo(r, 0);
      ctx.lineTo(-r * 0.8, r * 0.75);
      ctx.lineTo(-r * 0.4, 0);
      ctx.lineTo(-r * 0.8, -r * 0.75);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else if (e.shape === 'diamond') {
      ctx.rotate(time * 0.8);
      ctx.beginPath();
      ctx.moveTo(0, -r);
      ctx.lineTo(r * 0.8, 0);
      ctx.lineTo(0, r);
      ctx.lineTo(-r * 0.8, 0);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else if (e.shape === 'dart') {
      const winding = e.dashState === 'windup';
      const a = Math.atan2(e.vy, e.vx);
      ctx.rotate(Number.isFinite(a) ? a : 0);
      if (winding) {
        ctx.globalAlpha = 0.55 + 0.45 * Math.sin(time * 30);
      }
      ctx.beginPath();
      ctx.moveTo(r * 1.2, 0);
      ctx.lineTo(-r, r * 0.7);
      ctx.lineTo(-r * 0.5, 0);
      ctx.lineTo(-r, -r * 0.7);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else if (e.shape === 'hex') {
      ctx.rotate(Math.sin(e.wobble) * 0.2);
      ctx.beginPath();
      for (let i = 0; i < 6; i += 1) {
        const a = (i / 6) * TAU;
        const px = Math.cos(a) * r;
        const py = Math.sin(a) * r;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      // Inner nucleus.
      ctx.fillStyle = e.core;
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.38, 0, TAU);
      ctx.fill();
    } else if (e.shape === 'square') {
      ctx.rotate(0.35 + Math.sin(time * 0.6) * 0.08);
      ctx.beginPath();
      ctx.rect(-r * 0.85, -r * 0.85, r * 1.7, r * 1.7);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = e.core;
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.3, 0, TAU);
      ctx.fill();
    } else if (e.shape === 'bomb') {
      // The Fuse: a spiked mine whose core blinks — slowly while it
      // hunts, frantically once its fuse is lit.
      const lit = e.fuseT >= 0;
      const blinkRate = lit ? 30 : 7;
      const blink = Math.sin(time * blinkRate + e.wobble) > 0;
      ctx.rotate(time * 1.4);
      ctx.beginPath();
      for (let i = 0; i < 8; i += 1) {
        const a = (i / 8) * TAU;
        const a2 = ((i + 0.5) / 8) * TAU;
        ctx.moveTo(Math.cos(a) * r * 0.78, Math.sin(a) * r * 0.78);
        ctx.lineTo(Math.cos(a2) * r * 1.18, Math.sin(a2) * r * 1.18);
        ctx.lineTo(Math.cos(a + TAU / 8) * r * 0.78, Math.sin(a + TAU / 8) * r * 0.78);
      }
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = blink ? '#ffffff' : e.core;
      ctx.beginPath();
      ctx.arc(0, 0, r * (lit ? 0.52 : 0.4), 0, TAU);
      ctx.fill();
    } else if (e.shape === 'lens') {
      // The Longshot: a diamond hull around a single glaring eye. While
      // it aims, a charge ring closes in on the eye.
      const facing = Math.atan2(e.vy, e.vx);
      ctx.rotate(Number.isFinite(facing) && (e.vx !== 0 || e.vy !== 0) ? facing : 0);
      ctx.beginPath();
      ctx.moveTo(r * 1.25, 0);
      ctx.lineTo(0, r * 0.78);
      ctx.lineTo(-r * 1.05, 0);
      ctx.lineTo(0, -r * 0.78);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = e.core;
      ctx.beginPath();
      ctx.arc(r * 0.25, 0, r * 0.34, 0, TAU);
      ctx.fill();
      ctx.restore();
      ctx.save();
      ctx.translate(e.x, e.y);
      if (e.snipeState === 'aim') {
        ctx.strokeStyle = '#ff4040';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, r + 10 - e.aimFrac * 6, -Math.PI / 2, -Math.PI / 2 + e.aimFrac * TAU);
        ctx.stroke();
      }
    } else if (e.shape === 'orb') {
      // The Weaver: a gun-ring with three satellite sparks in orbit, so
      // even standing still it never stops moving.
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, TAU);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = e.core;
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.42, 0, TAU);
      ctx.fill();
      for (let k = 0; k < 3; k += 1) {
        const a = time * 3.4 + e.wobble + (k / 3) * TAU;
        ctx.beginPath();
        ctx.arc(Math.cos(a) * r * 1.45, Math.sin(a) * r * 1.45, 3.2, 0, TAU);
        ctx.fill();
      }
    } else if (e.shape === 'maw') {
      // A slow dashed halo turns around the Maw, and a nova burst sheds
      // an expanding shockwave ring while its flash lasts.
      ctx.save();
      ctx.rotate(-time * 0.45);
      ctx.strokeStyle = 'rgba(255, 46, 99, 0.38)';
      ctx.lineWidth = 2;
      ctx.setLineDash([16, 12]);
      ctx.beginPath();
      ctx.arc(0, 0, r * 1.32, 0, TAU);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
      if (e.novaFlash > 0) {
        ctx.save();
        ctx.globalAlpha = e.novaFlash * 0.55;
        ctx.strokeStyle = '#ffd3da';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(0, 0, r + (1 - e.novaFlash) * 240, 0, TAU);
        ctx.stroke();
        ctx.restore();
      }
      // The Void Maw: a toothed ring around a pulsing core.
      const teeth = 12;
      const pulse = 1 + 0.06 * Math.sin(time * 4);
      ctx.rotate(time * 0.25);
      ctx.beginPath();
      for (let i = 0; i < teeth; i += 1) {
        const a = (i / teeth) * TAU;
        const a2 = ((i + 0.5) / teeth) * TAU;
        const a3 = ((i + 1) / teeth) * TAU;
        ctx.moveTo(Math.cos(a) * r * 0.82, Math.sin(a) * r * 0.82);
        ctx.lineTo(Math.cos(a2) * r * 1.12, Math.sin(a2) * r * 1.12);
        ctx.lineTo(Math.cos(a3) * r * 0.82, Math.sin(a3) * r * 0.82);
      }
      ctx.fill();
      ctx.rotate(-time * 0.25);
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.8 * pulse, 0, TAU);
      ctx.fillStyle = flash ? '#ffffff' : '#3d0a1e';
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = e.core;
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.34 * pulse, 0, TAU);
      ctx.fill();
      // Spiral barrage emitters: two bright nubs riding the rotating
      // arms the bolts stream from, lit only while the spiral runs.
      if (e.spiralT > 0) {
        for (const arm of [0, Math.PI]) {
          const a = e.spiralAngle + arm;
          ctx.fillStyle = '#ffd166';
          ctx.shadowColor = '#ffd166';
          ctx.shadowBlur = 16;
          ctx.beginPath();
          ctx.arc(Math.cos(a) * r * 0.7, Math.sin(a) * r * 0.7, 6.5, 0, TAU);
          ctx.fill();
        }
        ctx.shadowBlur = 12;
      }
    }
    ctx.restore();

    // Health bar over anything hurt and bigger than a mite.
    if (e.hp < e.maxHp && e.maxHp > 20) {
      const w = e.radius * 2;
      const y = e.y - e.radius - 10;
      ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
      ctx.fillRect(e.x - w / 2, y, w, 4);
      ctx.fillStyle = e.color;
      ctx.fillRect(e.x - w / 2, y, w * Math.max(0, e.hp / e.maxHp), 4);
    }
  }

  function drawPlayer(p, time) {
    // Blink while invulnerable after a hit — but never mid-dash: the
    // streak has to stay visible for the dash to read.
    if (p.dashTimer <= 0 && p.hurtTimer > 0 && Math.floor(time * 14) % 2 === 0) return;
    // Dash streaks: three light trails streaming off the tail.
    if (p.dashTimer > 0) {
      ctx.save();
      ctx.strokeStyle = PALETTE.player;
      ctx.lineWidth = 3;
      for (const side of [-1, 0, 1]) {
        const px = -p.dashDirY * side * 9;
        const py = p.dashDirX * side * 9;
        ctx.globalAlpha = 0.5 - Math.abs(side) * 0.15;
        ctx.beginPath();
        ctx.moveTo(p.x + px, p.y + py);
        ctx.lineTo(p.x + px - p.dashDirX * 74, p.y + py - p.dashDirY * 74);
        ctx.stroke();
      }
      ctx.restore();
    }
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.angle);
    ctx.shadowColor = PALETTE.player;
    ctx.shadowBlur = 18;
    // Engine flame, flickering with speed.
    const speed = Math.hypot(p.vx, p.vy);
    const flame = 10 + Math.min(14, speed * 0.03) + Math.sin(time * 40) * 3;
    ctx.fillStyle = '#ff9d00';
    ctx.beginPath();
    ctx.moveTo(-12, 5);
    ctx.lineTo(-12 - flame, 0);
    ctx.lineTo(-12, -5);
    ctx.closePath();
    ctx.fill();
    // Hull: a dart with swept wings.
    ctx.fillStyle = PALETTE.player;
    ctx.beginPath();
    ctx.moveTo(20, 0);
    ctx.lineTo(-10, 12);
    ctx.lineTo(-5, 0);
    ctx.lineTo(-10, -12);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = PALETTE.playerCore;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = PALETTE.playerCore;
    ctx.beginPath();
    ctx.arc(4, 0, 4.5, 0, TAU);
    ctx.fill();
    ctx.restore();

    // Shield ring.
    if (p.shield > 0) {
      ctx.save();
      ctx.globalAlpha = 0.55 + 0.2 * Math.sin(time * 5);
      ctx.strokeStyle = PALETTE.shield;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius + 9, 0, TAU);
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawOrbitBlades(world, time) {
    // The Orbital Blades upgrade: spinning shards of light on a ring
    // around the ship, with a faint guide circle so the ring reads.
    if (!world.bladePositions || world.bladePositions.length === 0) return;
    const p = world.player;
    ctx.save();
    ctx.globalAlpha = 0.16;
    ctx.strokeStyle = PALETTE.player;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 9]);
    ctx.beginPath();
    ctx.arc(p.x, p.y, 68, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
    for (const b of world.bladePositions) {
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(time * 9 + b.angle);
      ctx.shadowColor = PALETTE.player;
      ctx.shadowBlur = 14;
      ctx.fillStyle = '#bffbff';
      ctx.beginPath();
      ctx.moveTo(13, 0);
      ctx.lineTo(-9, 6.5);
      ctx.lineTo(-4, 0);
      ctx.lineTo(-9, -6.5);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  function drawBullets(world) {
    for (const b of world.bullets) {
      ctx.save();
      ctx.shadowColor = PALETTE.bullet;
      ctx.shadowBlur = 10;
      ctx.strokeStyle = PALETTE.bullet;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(b.x - b.vx * 0.03, b.y - b.vy * 0.03);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      ctx.fillStyle = '#fffbe8';
      ctx.beginPath();
      ctx.arc(b.x, b.y, 2.5, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
    for (const b of world.enemyBullets) {
      ctx.save();
      // A snipe bolt is a stretched red dart, not a round orb.
      if (b.snipe) {
        const a = Math.atan2(b.vy, b.vx);
        ctx.translate(b.x, b.y);
        ctx.rotate(a);
        ctx.shadowColor = '#ff4040';
        ctx.shadowBlur = 14;
        ctx.fillStyle = '#ff5c5c';
        ctx.beginPath();
        ctx.moveTo(13, 0);
        ctx.lineTo(-9, 4);
        ctx.lineTo(-9, -4);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#ffe3e3';
        ctx.beginPath();
        ctx.arc(2, 0, 2.4, 0, TAU);
        ctx.fill();
        ctx.restore();
        continue;
      }
      ctx.shadowColor = '#ff2e63';
      ctx.shadowBlur = 12;
      ctx.fillStyle = '#ff5c8a';
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.radius, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#ffd3da';
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.radius * 0.45, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
  }

  function bar(x, y, w, h, frac, fill, back = 'rgba(0, 0, 0, 0.55)') {
    ctx.fillStyle = back;
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = fill;
    ctx.fillRect(x, y, w * Math.max(0, Math.min(1, frac)), h);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w, h);
  }

  function drawHud(world, time) {
    const p = world.player;
    const field = world.field;
    ctx.textBaseline = 'alphabetic';
    // Top-left: score, time, kills.
    ctx.textAlign = 'left';
    ctx.fillStyle = PALETTE.text;
    ctx.font = 'bold 26px "Segoe UI", system-ui, sans-serif';
    ctx.fillText(`SCORE ${Math.floor(world.score)}`, 16, 34);
    ctx.font = '600 15px "Segoe UI", system-ui, sans-serif';
    ctx.fillStyle = PALETTE.dim;
    ctx.fillText(`TIME ${fmtTime(world.time)}   KILLS ${world.kills}   LEVEL ${world.level}`, 16, 58);

    // Combo meter: while a chain is alive it shows the multiplier and
    // how much of its window is left, draining in gold under the score.
    if (world.combo && world.combo.count >= 3) {
      const frac = Math.max(0, Math.min(1, world.combo.timer / 2.5));
      ctx.fillStyle = PALETTE.gold;
      ctx.font = 'bold 17px "Segoe UI", system-ui, sans-serif';
      ctx.fillText(`COMBO ×${world.combo.mult}  ·  ${world.combo.count} CHAIN`, 16, 84);
      bar(16, 92, 150, 5, frac, PALETTE.gold);
    }

    // Top-right: level + XP bar.
    ctx.textAlign = 'right';
    ctx.fillStyle = PALETTE.text;
    ctx.font = 'bold 20px "Segoe UI", system-ui, sans-serif';
    ctx.fillText(`LEVEL ${world.level}`, field.width - 16, 32);
    bar(field.width - 216, 42, 200, 10, world.xp / world.xpNext, PALETTE.xp);
    ctx.font = '600 12px "Segoe UI", system-ui, sans-serif';
    ctx.fillStyle = PALETTE.dim;
    ctx.fillText(`XP ${world.xp}/${world.xpNext}`, field.width - 16, 68);

    // Bottom-left: hull integrity + shield pips + the dash gauge.
    ctx.textAlign = 'left';
    ctx.fillStyle = PALETTE.text;
    ctx.font = 'bold 13px "Segoe UI", system-ui, sans-serif';
    ctx.fillText('HULL', 16, field.height - 50);
    bar(16, field.height - 44, 220, 14, p.hp / p.maxHp, p.hp / p.maxHp > 0.3 ? PALETTE.hp : '#ff0000');
    ctx.fillStyle = PALETTE.text;
    ctx.font = 'bold 13px "Segoe UI", system-ui, sans-serif';
    ctx.fillText(`${Math.ceil(p.hp)} / ${p.maxHp}`, 244, field.height - 32);
    if (p.maxShield > 0) {
      ctx.fillStyle = PALETTE.shield;
      ctx.font = 'bold 13px "Segoe UI", system-ui, sans-serif';
      ctx.fillText(`🛡 ×${p.shield}`, 330, field.height - 32);
    }
    // Dash gauge: fills as the dash recharges, glows when it is ready.
    const dashFrac = 1 - Math.max(0, p.dashCooldownT) / Math.max(0.01, p.dashCooldown);
    ctx.fillStyle = dashFrac >= 1 ? PALETTE.player : PALETTE.dim;
    ctx.font = 'bold 13px "Segoe UI", system-ui, sans-serif';
    ctx.fillText('DASH', 16, field.height - 12);
    if (dashFrac >= 1) {
      ctx.save();
      ctx.shadowColor = PALETTE.player;
      ctx.shadowBlur = 8 + 4 * Math.sin(time * 6);
      bar(62, field.height - 22, 110, 9, 1, PALETTE.player);
      ctx.restore();
    } else {
      bar(62, field.height - 22, 110, 9, dashFrac, PALETTE.player);
    }

    // Bottom-right: controls hint.
    ctx.textAlign = 'right';
    ctx.fillStyle = PALETTE.dim;
    ctx.font = '600 12px "Segoe UI", system-ui, sans-serif';
    ctx.fillText('WASD move · mouse aim · SHIFT dash · P pause · M mute', field.width - 16, field.height - 16);

    // Boss bar, top centre.
    if (world.boss) {
      const bw = Math.min(520, field.width * 0.42);
      const bx = (field.width - bw) / 2;
      const by = 14;
      ctx.textAlign = 'center';
      ctx.fillStyle = PALETTE.boss;
      ctx.font = 'bold 15px "Segoe UI", system-ui, sans-serif';
      ctx.fillText(`☠ VOID MAW — TIER ${world.boss.tier}`, field.width / 2, by + 12);
      bar(bx, by + 18, bw, 12, world.boss.hp / world.boss.maxHp, PALETTE.boss);
    }
  }

  function drawBanner(text, alpha) {
    if (!text || alpha <= 0) return;
    ctx.save();
    ctx.globalAlpha = Math.min(1, alpha);
    ctx.textAlign = 'center';
    ctx.font = 'bold 30px "Segoe UI", system-ui, sans-serif';
    ctx.shadowColor = '#ff2e63';
    ctx.shadowBlur = 18;
    ctx.fillStyle = '#ffd166';
    ctx.fillText(text, ctx.canvas.width / 2, 96);
    ctx.restore();
  }

  function dimField(field, alpha) {
    ctx.fillStyle = `rgba(4, 2, 12, ${alpha})`;
    ctx.fillRect(0, 0, field.width, field.height);
  }

  function panel(x, y, w, h) {
    ctx.save();
    ctx.fillStyle = 'rgba(16, 8, 38, 0.78)';
    ctx.strokeStyle = 'rgba(124, 92, 255, 0.55)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 12);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  function drawTitle(world, best, time) {
    const field = world.field;
    const cx = field.width / 2;
    dimField(field, 0.45);
    ctx.textAlign = 'center';
    // Title with a neon glow.
    ctx.save();
    ctx.shadowColor = '#7c5cff';
    ctx.shadowBlur = 32;
    ctx.fillStyle = '#efeaff';
    ctx.font = 'bold 78px "Segoe UI", system-ui, sans-serif';
    ctx.fillText('VOIDPULSE', cx, field.height * 0.24);
    ctx.restore();
    ctx.fillStyle = PALETTE.player;
    ctx.font = '600 23px "Segoe UI", system-ui, sans-serif';
    ctx.fillText('N E O N   A R E N A   S U R V I V A L', cx, field.height * 0.24 + 38);

    // A dashed halo ellipse hugs the title, its dashes crawling and six
    // sparks riding the rim — the menu itself is alive.
    ctx.save();
    ctx.translate(cx, field.height * 0.24 - 10);
    ctx.strokeStyle = 'rgba(124, 92, 255, 0.45)';
    ctx.lineWidth = 2;
    ctx.setLineDash([22, 16]);
    ctx.lineDashOffset = -time * 26;
    ctx.beginPath();
    ctx.ellipse(0, 0, 252, 76, 0, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = PALETTE.player;
    ctx.shadowColor = PALETTE.player;
    ctx.shadowBlur = 12;
    for (let k = 0; k < 6; k += 1) {
      const a = (k / 6) * TAU + time * 0.22;
      ctx.beginPath();
      ctx.arc(Math.cos(a) * 252, Math.sin(a) * 76, 3.4, 0, TAU);
      ctx.fill();
    }
    ctx.restore();

    // The how-to-play panel: controls on the left, the mission on the
    // right, so a first-time player knows everything before they start.
    const pw = Math.min(820, field.width - 72);
    const ph = 148;
    const px = cx - pw / 2;
    const py = field.height * 0.40;
    panel(px, py, pw, ph);
    const colL = px + 30;
    const colR = px + pw / 2 + 22;
    ctx.textAlign = 'left';
    ctx.fillStyle = PALETTE.gold;
    ctx.font = 'bold 15px "Segoe UI", system-ui, sans-serif';
    ctx.fillText('HOW TO PLAY', colL, py + 30);
    ctx.fillText('THE MISSION', colR, py + 30);
    ctx.fillStyle = PALETTE.text;
    ctx.font = '600 14.5px "Segoe UI", system-ui, sans-serif';
    const left = [
      'Move — WASD / arrow keys',
      'Aim — mouse · auto-fire is always on',
      'Dash — SHIFT, SPACE or right-click',
      'Untouchable mid-dash · P pause · M mute',
    ];
    const right = [
      'Survive the swarm — gems are XP',
      'Level up: pick 1 of 3 upgrades (16 exist)',
      'The Void Maw attacks at 1:00 · 2:30 · 4:10',
      'Chain kills: combos multiply your score',
    ];
    left.forEach((line, i) => ctx.fillText(line, colL, py + 58 + i * 23));
    right.forEach((line, i) => ctx.fillText(line, colR, py + 58 + i * 23));

    ctx.textAlign = 'center';
    if (best > 0) {
      ctx.fillStyle = PALETTE.gold;
      ctx.font = 'bold 17px "Segoe UI", system-ui, sans-serif';
      ctx.fillText(`BEST SCORE  ${best}`, cx, py + ph + 30);
    }
    ctx.save();
    const pulseA = 0.65 + 0.35 * Math.sin(time * 3.5);
    ctx.globalAlpha = pulseA;
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 21px "Segoe UI", system-ui, sans-serif';
    ctx.fillText('—  PRESS ENTER OR CLICK TO START  —', cx, field.height - 34);
    ctx.restore();
  }

  function drawLevelUp(world) {
    const field = world.field;
    dimField(field, 0.62);
    ctx.textAlign = 'center';
    ctx.fillStyle = PALETTE.gold;
    ctx.font = 'bold 34px "Segoe UI", system-ui, sans-serif';
    ctx.fillText(`LEVEL ${world.level} — CHOOSE AN UPGRADE`, field.width / 2, 74);
    ctx.fillStyle = PALETTE.dim;
    ctx.font = '600 15px "Segoe UI", system-ui, sans-serif';
    ctx.fillText('Click a card or press 1 / 2 / 3', field.width / 2, 100);

    const cards = levelUpCards(field);
    world.choices.forEach((u, i) => {
      const c = cards[i];
      if (!c) return;
      ctx.save();
      // Card body.
      ctx.fillStyle = 'rgba(24, 12, 54, 0.92)';
      ctx.strokeStyle = '#7c5cff';
      ctx.lineWidth = 2;
      ctx.shadowColor = '#7c5cff';
      ctx.shadowBlur = 16;
      ctx.beginPath();
      ctx.roundRect(c.x, c.y, c.w, c.h, 12);
      ctx.fill();
      ctx.stroke();
      ctx.shadowBlur = 0;
      // Key number.
      ctx.fillStyle = PALETTE.dim;
      ctx.font = 'bold 13px "Segoe UI", system-ui, sans-serif';
      ctx.fillText(`[${i + 1}]`, c.x + c.w / 2, c.y + 26);
      // Icon, name, description, owned count.
      ctx.font = '44px "Segoe UI", system-ui, sans-serif';
      ctx.fillText(u.icon, c.x + c.w / 2, c.y + 84);
      ctx.fillStyle = PALETTE.text;
      ctx.font = 'bold 21px "Segoe UI", system-ui, sans-serif';
      ctx.fillText(u.name, c.x + c.w / 2, c.y + 122);
      ctx.fillStyle = PALETTE.dim;
      ctx.font = '600 15px "Segoe UI", system-ui, sans-serif';
      ctx.fillText(u.desc, c.x + c.w / 2, c.y + 150);
      const owned = world.owned[u.id] ?? 0;
      ctx.fillStyle = PALETTE.gold;
      ctx.font = '600 13px "Segoe UI", system-ui, sans-serif';
      ctx.fillText(owned > 0 ? `Owned ×${owned}  ·  max ${u.max}` : `Max ${u.max}`, c.x + c.w / 2, c.y + 182);
      ctx.restore();
    });
  }

  function drawPaused() {
    const field = { width: ctx.canvas.width, height: ctx.canvas.height };
    dimField(field, 0.55);
    ctx.textAlign = 'center';
    ctx.fillStyle = PALETTE.text;
    ctx.font = 'bold 44px "Segoe UI", system-ui, sans-serif';
    ctx.fillText('PAUSED', field.width / 2, field.height / 2 - 8);
    ctx.fillStyle = PALETTE.dim;
    ctx.font = '600 16px "Segoe UI", system-ui, sans-serif';
    ctx.fillText('Press P or Esc to resume', field.width / 2, field.height / 2 + 28);
  }

  function drawOver(world, best, time) {
    const field = world.field;
    const cx = field.width / 2;
    dimField(field, 0.6);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ff4d6d';
    ctx.font = 'bold 54px "Segoe UI", system-ui, sans-serif';
    ctx.fillText('SIGNAL LOST', cx, field.height / 2 - 104);
    ctx.fillStyle = PALETTE.text;
    ctx.font = 'bold 32px "Segoe UI", system-ui, sans-serif';
    ctx.fillText(`SCORE  ${Math.floor(world.score)}`, cx, field.height / 2 - 58);
    // The full run report: two rows of everything the run achieved.
    ctx.fillStyle = PALETTE.dim;
    ctx.font = '600 17px "Segoe UI", system-ui, sans-serif';
    ctx.fillText(
      `Survived ${fmtTime(world.time)}  ·  Level ${world.level}  ·  ${world.kills} kills`,
      cx, field.height / 2 - 18,
    );
    ctx.fillText(
      `Damage dealt ${Math.floor(world.damageDealt)}  ·  Gems ${world.gemsCollected}  ·  Shots ${world.shotsFired}`,
      cx, field.height / 2 + 12,
    );
    ctx.fillText(
      `Void Maws slain ${world.bossesSlain}  ·  Dashes ${world.dashesUsed}  ·  Best chain ×${world.bestChain}`,
      cx, field.height / 2 + 42,
    );
    if (Math.floor(world.score) >= best && best > 0) {
      ctx.fillStyle = PALETTE.gold;
      ctx.font = 'bold 20px "Segoe UI", system-ui, sans-serif';
      ctx.fillText('★ NEW BEST SCORE ★', cx, field.height / 2 + 80);
    } else if (best > 0) {
      ctx.fillStyle = PALETTE.gold;
      ctx.font = '600 17px "Segoe UI", system-ui, sans-serif';
      ctx.fillText(`Best score  ${best}`, cx, field.height / 2 + 80);
    }
    ctx.save();
    const pulseA = 0.65 + 0.35 * Math.sin(time * 3.5);
    ctx.globalAlpha = pulseA;
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 20px "Segoe UI", system-ui, sans-serif';
    ctx.fillText('—  PRESS ENTER OR CLICK TO PLAY AGAIN  —', cx, field.height - 40);
    ctx.restore();
  }

  return {
    // Draw one frame. `screen` is one of the SCREEN_* constants, `banner`
    // is {text, alpha} or null, `particles` the particle system to paint.
    draw(world, screen, time, particles, banner, best) {
      const field = world.field;
      drawBackground(field, time, world.player);
      for (const g of world.gems) drawGem(g, time);
      for (const e of world.enemies) drawEnemy(e, time);
      drawBullets(world);
      if (!world.over) drawPlayer(world.player, time);
      drawOrbitBlades(world, time);
      particles.draw(ctx);
      if (screen === SCREEN_PLAY || screen === SCREEN_LEVELUP || screen === SCREEN_PAUSED) {
        drawHud(world, time);
      }
      drawBanner(banner?.text, banner?.alpha ?? 0);
      if (screen === SCREEN_TITLE) drawTitle(world, best, time);
      else if (screen === SCREEN_LEVELUP) drawLevelUp(world);
      else if (screen === SCREEN_PAUSED) drawPaused();
      else if (screen === SCREEN_OVER) drawOver(world, best, time);
    },
    fmtTime,
  };
}
