// Tiny canvas confetti burst. No sound; skipped when the user prefers reduced motion.
const COLORS = ['#ea580c', '#f97316', '#f59e0b', '#fde047', '#16a34a', '#0d9488', '#3b82f6', '#ec4899'];

export function celebrate({ big = false } = {}) {
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
  const canvas = document.createElement('canvas');
  canvas.className = 'confetti';
  canvas.setAttribute('aria-hidden', 'true');
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = window.innerWidth;
  const h = window.innerHeight;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  document.body.append(canvas);
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  const count = big ? 220 : 110;
  const parts = Array.from({ length: count }, (_, i) => {
    const fromLeft = big ? i % 2 === 0 : true;
    const angle = big
      ? (fromLeft ? -Math.PI / 3 : -2 * Math.PI / 3) + (Math.random() - 0.5) * 0.9
      : -Math.PI / 2 + (Math.random() - 0.5) * 1.6;
    const speed = (big ? 11 : 9) + Math.random() * 7;
    return {
      x: big ? (fromLeft ? 0 : w) : w / 2,
      y: big ? h * 0.75 : h * 0.3,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      size: 5 + Math.random() * 6,
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.3,
      color: COLORS[(Math.random() * COLORS.length) | 0],
    };
  });

  const start = performance.now();
  const duration = big ? 2600 : 1800;
  function frame(now) {
    const t = now - start;
    ctx.clearRect(0, 0, w, h);
    const fade = Math.max(0, 1 - Math.max(0, t - duration * 0.6) / (duration * 0.4));
    ctx.globalAlpha = fade;
    for (const p of parts) {
      p.vy += 0.32;
      p.vx *= 0.99;
      p.vy *= 0.99;
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vr;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      ctx.restore();
    }
    if (t < duration) requestAnimationFrame(frame);
    else canvas.remove();
  }
  requestAnimationFrame(frame);
}
