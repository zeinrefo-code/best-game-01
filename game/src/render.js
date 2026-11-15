// All canvas drawing: the void background, the entities, the HUD and the
// four screens (title, level-up, paused, game over). Nothing here mutates
// the world; the loop hands it the state and the time.
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
  const stars = [];
  for (let i = 0; i < 110; i += 1) {
    stars.push({
      x: starRng.next(), y: starRng.next(),
      r: 0.6 + starRng.next() * 1.6,
      tw: starRng.range(0.5, 2.4),
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
    });
  }

  function fmtTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  function drawBackground(field, time) {
    const grad = ctx.createLinearGradient(0, 0, 0, field.height);
    grad.addColorStop(0, PALETTE.voidTop);
    grad.addColorStop(1, PALETTE.voidBottom);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, field.width, field.height);

    for (const n of nebulae) {
      const g = ctx.createRadialGradient(
        n.x * field.width, n.y * field.height, 0,
        n.x * field.width, n.y * field.height, n.r,
      );
      g.addColorStop(0, `rgba(${n.hue}, ${n.alpha})`);
      g.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, field.width, field.height);
    }

    // Starfield with a slow twinkle.
    for (const s of stars) {
      const a = 0.25 + 0.55 * (0.5 + 0.5 * Math.sin(time * s.tw + s.phase));
      ctx.globalAlpha = a;
      ctx.fillStyle = '#cfc6ff';
      ctx.beginPath();
      ctx.arc(s.x * field.width, s.y * field.height, s.r, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Grid, drifting slowly downward so the void feels alive.
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
    ctx.save();
    ctx.translate(e.x, e.y);
    const flash = e.flash > 0;
    ctx.shadowColor = e.color;
    ctx.shadowBlur = flash ? 22 : 12;
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
      const a = e.dashState === 'dash' ? Math.atan2(e.vy, e.vx) : Math.atan2(e.vy, e.vx);
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
    } else if (e.shape === 'maw') {
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
    // Blink while invulnerable after a hit.
    if (p.hurtTimer > 0 && Math.floor(time * 14) % 2 === 0) return;
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

    // Top-right: level + XP bar.
    ctx.textAlign = 'right';
    ctx.fillStyle = PALETTE.text;
    ctx.font = 'bold 20px "Segoe UI", system-ui, sans-serif';
    ctx.fillText(`LEVEL ${world.level}`, field.width - 16, 32);
    bar(field.width - 216, 42, 200, 10, world.xp / world.xpNext, PALETTE.xp);
    ctx.font = '600 12px "Segoe UI", system-ui, sans-serif';
    ctx.fillStyle = PALETTE.dim;
    ctx.fillText(`XP ${world.xp}/${world.xpNext}`, field.width - 16, 68);

    // Bottom-left: hull integrity + shield pips.
    ctx.textAlign = 'left';
    ctx.fillStyle = PALETTE.text;
    ctx.font = 'bold 13px "Segoe UI", system-ui, sans-serif';
    ctx.fillText('HULL', 16, field.height - 34);
    bar(16, field.height - 28, 220, 14, p.hp / p.maxHp, p.hp / p.maxHp > 0.3 ? PALETTE.hp : '#ff0000');
    ctx.fillStyle = PALETTE.text;
    ctx.font = 'bold 13px "Segoe UI", system-ui, sans-serif';
    ctx.fillText(`${Math.ceil(p.hp)} / ${p.maxHp}`, 244, field.height - 16);
    if (p.maxShield > 0) {
      ctx.fillStyle = PALETTE.shield;
      ctx.font = 'bold 13px "Segoe UI", system-ui, sans-serif';
      ctx.fillText(`🛡 ×${p.shield}`, 330, field.height - 16);
    }

    // Bottom-right: controls hint.
    ctx.textAlign = 'right';
    ctx.fillStyle = PALETTE.dim;
    ctx.font = '600 12px "Segoe UI", system-ui, sans-serif';
    ctx.fillText('WASD move · mouse aim · auto-fire · P pause · M mute', field.width - 16, field.height - 16);

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

  function drawTitle(world, best, time) {
    const field = world.field;
    dimField(field, 0.45);
    ctx.textAlign = 'center';
    // Title with a neon glow.
    ctx.save();
    ctx.shadowColor = '#7c5cff';
    ctx.shadowBlur = 32;
    ctx.fillStyle = '#efeaff';
    ctx.font = 'bold 84px "Segoe UI", system-ui, sans-serif';
    ctx.fillText('VOIDPULSE', field.width / 2, field.height / 2 - 72);
    ctx.restore();
    ctx.fillStyle = PALETTE.player;
    ctx.font = '600 24px "Segoe UI", system-ui, sans-serif';
    ctx.fillText('N E O N   A R E N A   S U R V I V A L', field.width / 2, field.height / 2 - 32);

    ctx.fillStyle = PALETTE.dim;
    ctx.font = '600 16px "Segoe UI", system-ui, sans-serif';
    ctx.fillText('Survive the swarm. Collect gems. Level up. Slay the Void Maw.', field.width / 2, field.height / 2 + 8);
    ctx.fillText('WASD / arrows — move      Mouse — aim      Auto-fire is always on', field.width / 2, field.height / 2 + 38);
    ctx.fillText('P — pause      M — mute      1 / 2 / 3 or click — pick an upgrade', field.width / 2, field.height / 2 + 64);

    if (best > 0) {
      ctx.fillStyle = PALETTE.gold;
      ctx.font = 'bold 18px "Segoe UI", system-ui, sans-serif';
      ctx.fillText(`BEST SCORE  ${best}`, field.width / 2, field.height / 2 + 100);
    }
    ctx.save();
    const pulse = 0.65 + 0.35 * Math.sin(time * 3.5);
    ctx.globalAlpha = pulse;
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 22px "Segoe UI", system-ui, sans-serif';
    ctx.fillText('—  PRESS ENTER OR CLICK TO START  —', field.width / 2, field.height - 56);
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
    dimField(field, 0.6);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ff4d6d';
    ctx.font = 'bold 56px "Segoe UI", system-ui, sans-serif';
    ctx.fillText('SIGNAL LOST', field.width / 2, field.height / 2 - 96);
    ctx.fillStyle = PALETTE.text;
    ctx.font = 'bold 30px "Segoe UI", system-ui, sans-serif';
    ctx.fillText(`SCORE  ${Math.floor(world.score)}`, field.width / 2, field.height / 2 - 44);
    ctx.fillStyle = PALETTE.dim;
    ctx.font = '600 17px "Segoe UI", system-ui, sans-serif';
    const mins = Math.floor(world.time / 60);
    const secs = Math.floor(world.time % 60);
    ctx.fillText(
      `Survived ${mins}:${String(secs).padStart(2, '0')}  ·  ${world.kills} kills  ·  Level ${world.level}`,
      field.width / 2, field.height / 2 - 8,
    );
    if (Math.floor(world.score) >= best && best > 0) {
      ctx.fillStyle = PALETTE.gold;
      ctx.font = 'bold 20px "Segoe UI", system-ui, sans-serif';
      ctx.fillText('★ NEW BEST SCORE ★', field.width / 2, field.height / 2 + 30);
    } else if (best > 0) {
      ctx.fillStyle = PALETTE.gold;
      ctx.font = '600 17px "Segoe UI", system-ui, sans-serif';
      ctx.fillText(`Best score  ${best}`, field.width / 2, field.height / 2 + 30);
    }
    ctx.save();
    const pulse = 0.65 + 0.35 * Math.sin(time * 3.5);
    ctx.globalAlpha = pulse;
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 20px "Segoe UI", system-ui, sans-serif';
    ctx.fillText('—  PRESS ENTER OR CLICK TO PLAY AGAIN  —', field.width / 2, field.height - 56);
    ctx.restore();
  }

  return {
    // Draw one frame. `screen` is one of the SCREEN_* constants, `banner`
    // is {text, alpha} or null, `particles` the particle system to paint.
    draw(world, screen, time, particles, banner, best) {
      const field = world.field;
      drawBackground(field, time);
      for (const g of world.gems) drawGem(g, time);
      for (const e of world.enemies) drawEnemy(e, time);
      drawBullets(world);
      if (!world.over) drawPlayer(world.player, time);
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
