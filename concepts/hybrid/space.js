(() => {
  const canvas = document.createElement('canvas');
  canvas.id = 'starfield';
  canvas.setAttribute('aria-hidden', 'true');
  document.body.prepend(canvas);
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const root = document.documentElement;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let width = 0, height = 0, stars = [], frame = 0, last = 0, elapsed = 0;
  const moving = () => !reduced.matches && !document.hidden && root.dataset.motion !== 'paused';
  function paint(delta = 0) {
    elapsed += delta;
    ctx.clearRect(0, 0, width, height);
    for (const star of stars) {
      star.y -= delta * star.speed;
      if (star.y < -3) star.y = height + 3;
      const shimmer = reduced.matches ? 1 : .85 + .15 * Math.sin(elapsed * .45 + star.phase);
      ctx.fillStyle = `rgba(205,221,247,${star.alpha * shimmer})`;
      ctx.beginPath();
      ctx.arc(star.x, star.y, star.radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  function tick(now) {
    frame = 0;
    if (!moving()) return;
    paint(last ? Math.min((now - last) / 1000, .05) : 0);
    last = now;
    frame = requestAnimationFrame(tick);
  }
  function sync() {
    cancelAnimationFrame(frame);
    frame = 0;
    last = 0;
    paint();
    if (moving()) frame = requestAnimationFrame(tick);
  }
  function resize() {
    width = innerWidth;
    height = innerHeight;
    const ratio = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    let seed = 1701;
    const random = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    stars = Array.from({length: Math.min(150, Math.round(width * height / 8500))}, () => ({
      x: random() * width, y: random() * height,
      radius: .4 + random() * .95, alpha: .2 + random() * .5,
      speed: 1.2 + random() * 3, phase: random() * Math.PI * 2
    }));
    sync();
  }
  new MutationObserver(sync).observe(root, {attributes:true, attributeFilter:['data-motion']});
  reduced.addEventListener('change', sync);
  document.addEventListener('visibilitychange', sync);
  window.addEventListener('resize', resize, {passive:true});
  resize();
})();
