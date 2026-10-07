// Procedural placeholder "films" drawn onto a canvas. Each generator is a
// factory `(width, height) => ({ duration, draw(ctx, t) })` so it can keep
// per-instance state (e.g. star positions).

const TAU = Math.PI * 2;

function idle(w, h) {
  return {
    duration: Infinity,
    draw(ctx, t) {
      const g = ctx.createRadialGradient(w / 2, h * 0.45, 10, w / 2, h / 2, w * 0.6);
      g.addColorStop(0, '#2a1d22');
      g.addColorStop(1, '#0b0909');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      ctx.textAlign = 'center';
      ctx.fillStyle = '#d9c39a';
      ctx.font = `500 ${h * 0.05}px Inter, sans-serif`;
      ctx.fillText('N O W   S H O W I N G', w / 2, h * 0.36);
      ctx.fillStyle = '#f3ece0';
      ctx.font = `600 ${h * 0.17}px "Cormorant Garamond", Georgia, serif`;
      ctx.fillText('The Little Cinema', w / 2, h * 0.56);
      ctx.globalAlpha = 0.55 + 0.35 * Math.sin(t * 2.2);
      ctx.fillStyle = '#d9c39a';
      ctx.font = `italic 500 ${h * 0.055}px "Cormorant Garamond", Georgia, serif`;
      ctx.fillText('click the screen to choose a film', w / 2, h * 0.7);
      ctx.globalAlpha = 1;
    },
  };
}

function leader(w, h) {
  return {
    duration: 9,
    draw(ctx, t) {
      const second = Math.floor(t % 9);
      const frac = t % 1;
      if (second === 8) { ctx.fillStyle = frac < 0.08 ? '#fff' : '#000'; ctx.fillRect(0, 0, w, h); return; }
      ctx.fillStyle = '#8d8a84';
      ctx.fillRect(0, 0, w, h);
      const cx = w / 2, cy = h / 2, r = h * 0.42;
      // Sweep wedge
      ctx.fillStyle = '#5d5a55';
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, w, -Math.PI / 2, -Math.PI / 2 + frac * TAU);
      ctx.fill();
      ctx.strokeStyle = '#e9e6df';
      ctx.lineWidth = h * 0.012;
      for (const rr of [r, r * 0.85]) { ctx.beginPath(); ctx.arc(cx, cy, rr, 0, TAU); ctx.stroke(); }
      ctx.lineWidth = h * 0.006;
      ctx.beginPath(); ctx.moveTo(0, cy); ctx.lineTo(w, cy); ctx.moveTo(cx, 0); ctx.lineTo(cx, h); ctx.stroke();
      ctx.fillStyle = '#111';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `600 ${h * 0.6}px Georgia, serif`;
      ctx.fillText(String(8 - second), cx, cy + h * 0.03);
      ctx.textBaseline = 'alphabetic';
      grain(ctx, w, h, 0.07);
    },
  };
}

function bars(w, h) {
  const top = ['#c0c0c0', '#c0c000', '#00c0c0', '#00c000', '#c000c0', '#c00000', '#0000c0'];
  return {
    duration: Infinity,
    draw(ctx, t) {
      const bw = w / top.length;
      top.forEach((c, i) => { ctx.fillStyle = c; ctx.fillRect(i * bw, 0, bw + 1, h * 0.67); });
      const mid = ['#0000c0', '#131313', '#c000c0', '#131313', '#00c0c0', '#131313', '#c0c0c0'];
      mid.forEach((c, i) => { ctx.fillStyle = c; ctx.fillRect(i * bw, h * 0.67, bw + 1, h * 0.08); });
      ctx.fillStyle = '#101010';
      ctx.fillRect(0, h * 0.75, w, h * 0.25);
      // Moving sweep so it obviously plays.
      const x = ((t * 0.25) % 1) * w;
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.fillRect(x, 0, w * 0.02, h * 0.75);
      ctx.fillStyle = '#eee';
      ctx.font = `500 ${h * 0.07}px ui-monospace, Menlo, monospace`;
      ctx.textAlign = 'left';
      const s = Math.floor(t);
      const tc = [Math.floor(s / 3600), Math.floor(s / 60) % 60, s % 60, Math.floor((t % 1) * 24)]
        .map((n) => String(n).padStart(2, '0')).join(':');
      ctx.fillText(tc, w * 0.06, h * 0.9);
      ctx.textAlign = 'right';
      ctx.fillText('TEST PATTERN No. 5', w * 0.94, h * 0.9);
    },
  };
}

function aurora(w, h) {
  return {
    duration: Infinity,
    draw(ctx, t) {
      const sky = ctx.createLinearGradient(0, 0, 0, h);
      sky.addColorStop(0, '#02060f');
      sky.addColorStop(1, '#0a1626');
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'lighter';
      const hues = [150, 175, 280];
      hues.forEach((hue, k) => {
        ctx.beginPath();
        for (let x = 0; x <= w; x += 8) {
          const y = h * (0.35 + 0.08 * k) + Math.sin(x * 0.004 + t * (0.4 + k * 0.15) + k) * h * 0.08
            + Math.sin(x * 0.011 - t * 0.7) * h * 0.03;
          x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.lineTo(w, 0); ctx.lineTo(0, 0); ctx.closePath();
        const g = ctx.createLinearGradient(0, 0, 0, h * 0.6);
        g.addColorStop(0, `hsla(${hue}, 90%, 50%, 0)`);
        g.addColorStop(1, `hsla(${hue}, 90%, 55%, 0.35)`);
        ctx.fillStyle = g;
        ctx.fill();
      });
      ctx.globalCompositeOperation = 'source-over';
      // Mountains
      ctx.fillStyle = '#010204';
      ctx.beginPath();
      ctx.moveTo(0, h);
      for (let x = 0; x <= w; x += 20) ctx.lineTo(x, h * 0.8 - Math.abs(Math.sin(x * 0.006)) * h * 0.12 - Math.sin(x * 0.021) * h * 0.02);
      ctx.lineTo(w, h);
      ctx.fill();
    },
  };
}

function starfield(w, h) {
  const stars = Array.from({ length: 500 }, () => ({ x: Math.random() * 2 - 1, y: Math.random() * 2 - 1, z: Math.random() }));
  let last = 0;
  return {
    duration: Infinity,
    draw(ctx, t) {
      const dt = Math.min(0.1, Math.max(0, t - last));
      last = t;
      ctx.fillStyle = 'rgba(3, 4, 10, 0.35)';
      ctx.fillRect(0, 0, w, h);
      for (const s of stars) {
        s.z -= dt * 0.25;
        if (s.z <= 0.01) { s.x = Math.random() * 2 - 1; s.y = Math.random() * 2 - 1; s.z = 1; }
        const px = w / 2 + (s.x / s.z) * w * 0.3;
        const py = h / 2 + (s.y / s.z) * h * 0.3;
        const size = (1 - s.z) * 3.2;
        ctx.fillStyle = `rgba(220, 230, 255, ${1 - s.z})`;
        ctx.fillRect(px, py, size, size);
      }
    },
  };
}

function grain(ctx, w, h, amount) {
  ctx.fillStyle = `rgba(0,0,0,${amount})`;
  for (let i = 0; i < 160; i++) ctx.fillRect(Math.random() * w, Math.random() * h, 2, 2);
  ctx.fillStyle = `rgba(255,255,255,${amount})`;
  for (let i = 0; i < 2; i++) ctx.fillRect(Math.random() * w, 0, 1.5, h); // scratches
}

export const GENERATORS = { idle, leader, bars, aurora, starfield };
