// Particles, floating score text and screen shake. Everything here is pure
// visual feedback: the world never reads a particle back.
export function createParticles() {
  const list = [];
  const texts = [];
  let trauma = 0;

  function addShake(amount) {
    trauma = Math.min(1, trauma + amount);
  }

  function burst(x, y, color, count, speed, life, size) {
    for (let i = 0; i < count; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const v = speed * (0.3 + Math.random() * 0.7);
      list.push({
        x, y,
        vx: Math.cos(angle) * v,
        vy: Math.sin(angle) * v,
        life: life * (0.6 + Math.random() * 0.4),
        maxLife: life,
        size: size * (0.6 + Math.random() * 0.8),
        color,
        drag: 3.2,
      });
    }
  }

  return {
    get count() { return list.length; },
    addShake,
    explosion(x, y, color, big) {
      burst(x, y, color, big ? 34 : 18, big ? 340 : 260, big ? 0.8 : 0.55, big ? 5 : 3.5);
      burst(x, y, '#ffffff', big ? 8 : 4, 180, 0.3, 2.5);
      addShake(big ? 0.5 : 0.22);
    },
    sparks(x, y, color, count = 6) {
      burst(x, y, color, count, 200, 0.35, 2.5);
    },
    muzzle(x, y, angle) {
      for (let i = 0; i < 3; i += 1) {
        list.push({
          x, y,
          vx: Math.cos(angle) * (300 + Math.random() * 120),
          vy: Math.sin(angle) * (300 + Math.random() * 120),
          life: 0.12, maxLife: 0.12, size: 3, color: '#ffe45e', drag: 1,
        });
      }
    },
    pickupSparkle(x, y, color) {
      burst(x, y, color, 5, 120, 0.4, 2);
    },
    ring(x, y, color, maxRadius) {
      list.push({
        x, y, vx: 0, vy: 0, life: 0.5, maxLife: 0.5,
        size: maxRadius, color, drag: 0, ring: true, startSize: 6,
      });
    },
    floatText(x, y, text, color) {
      texts.push({ x, y, text, color, life: 0.9, maxLife: 0.9 });
    },
    update(dt) {
      trauma = Math.max(0, trauma - dt * 1.6);
      for (let i = list.length - 1; i >= 0; i -= 1) {
        const p = list[i];
        p.life -= dt;
        if (p.life <= 0) {
          list.splice(i, 1);
          continue;
        }
        const drag = Math.max(0, 1 - p.drag * dt);
        p.vx *= drag;
        p.vy *= drag;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
      }
      for (let i = texts.length - 1; i >= 0; i -= 1) {
        const t = texts[i];
        t.life -= dt;
        t.y -= 42 * dt;
        if (t.life <= 0) texts.splice(i, 1);
      }
    },
    // The current shake offset, in pixels. Zero when calm.
    offset(time) {
      const s = trauma * trauma;
      return {
        x: s * 14 * Math.sin(time * 91.7),
        y: s * 14 * Math.cos(time * 113.3),
      };
    },
    draw(ctx) {
      for (const p of list) {
        const alpha = Math.max(0, p.life / p.maxLife);
        if (p.ring) {
          const progress = 1 - alpha;
          const radius = p.startSize + (p.size - p.startSize) * progress;
          ctx.globalAlpha = alpha * 0.9;
          ctx.strokeStyle = p.color;
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
          ctx.stroke();
        } else {
          ctx.globalAlpha = alpha;
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * alpha + 0.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
      ctx.textAlign = 'center';
      ctx.font = 'bold 14px "Segoe UI", system-ui, sans-serif';
      for (const t of texts) {
        ctx.globalAlpha = Math.max(0, t.life / t.maxLife);
        ctx.fillStyle = t.color;
        ctx.fillText(t.text, t.x, t.y);
      }
      ctx.globalAlpha = 1;
    },
    clear() {
      list.length = 0;
      texts.length = 0;
      trauma = 0;
    },
  };
}
