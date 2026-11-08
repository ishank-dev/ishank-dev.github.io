import { createSky, wrapY, motionPolicy, twinkle } from './sky.mjs?v=1';

// The 2D sky is the fallback: it runs only when the WebGL universe is unavailable or fails.
function startSky() {
const canvas = document.getElementById('sky');
const context = canvas?.getContext('2d', { alpha: false });

if (canvas && context) {
  const root = document.documentElement;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const SEED = 3411824; // Los Angeles, 34.1° N 118.24° W
  const TOP = '#070c22', BOTTOM = '#0c1636';
  let sky, haze, width = 0, height = 0, builtWidth = 0, builtHeight = 0, ratio = 1;
  let offsets = [0, 0, 0], scroll = window.scrollY, clock = 0, last = 0, frame = 0;
  const pointer = { x: 0, y: 0 }, eased = { x: 0, y: 0 };
  let meteor = null, nextMeteor = 0;
  const sprites = new Map();

  const policy = () => motionPolicy({ reduced: reduced.matches, playing: root.dataset.motion !== 'paused', hidden: document.hidden });

  // A soft halo for the brightest stars, drawn once per colour instead of every frame.
  function sprite(color) {
    if (sprites.has(color)) return sprites.get(color);
    const size = 48, image = document.createElement('canvas');
    image.width = image.height = size;
    const paint = image.getContext('2d'), glow = paint.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    glow.addColorStop(0, color); glow.addColorStop(0.12, color + 'aa'); glow.addColorStop(0.35, color + '22'); glow.addColorStop(1, color + '00');
    paint.fillStyle = glow; paint.fillRect(0, 0, size, size);
    sprites.set(color, image); return image;
  }

  // The Milky Way: faint cool haze along the same diagonal the band stars favour, with a darker dust lane.
  function paintHaze(fieldHeight) {
    const image = document.createElement('canvas');
    image.width = Math.max(1, Math.round(width / 2)); image.height = Math.max(1, Math.round(fieldHeight / 2));
    const paint = image.getContext('2d'), w = image.width, h = image.height;
    for (let i = 0; i <= 14; i++) {
      const along = i / 14, x = along * w, y = h * (0.12 + along * 0.62), r = Math.max(w, h) * (0.16 + (i % 3) * 0.035);
      const cloud = paint.createRadialGradient(x, y, 0, x, y, r);
      cloud.addColorStop(0, 'rgba(150, 168, 226, 0.055)'); cloud.addColorStop(1, 'rgba(150, 168, 226, 0)');
      paint.fillStyle = cloud; paint.fillRect(0, 0, w, h);
    }
    paint.globalCompositeOperation = 'destination-out';
    paint.lineWidth = Math.max(8, h * 0.035); paint.lineCap = 'round'; paint.strokeStyle = 'rgba(0, 0, 0, 0.45)';
    paint.filter = 'blur(12px)';
    paint.beginPath(); paint.moveTo(0, h * 0.15); paint.bezierCurveTo(w * 0.35, h * 0.3, w * 0.62, h * 0.52, w, h * 0.77); paint.stroke();
    return image;
  }

  function build() {
    width = canvas.clientWidth || window.innerWidth; height = canvas.clientHeight || window.innerHeight;
    ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio);
    // Mobile browsers resize the viewport as the address bar moves; only reseed when the sky really changes shape.
    if (!sky || width !== builtWidth || height > builtHeight * 1.2) {
      sky = createSky({ width, height, seed: SEED });
      haze = paintHaze(sky.layers[0].fieldHeight);
      builtWidth = width; builtHeight = height;
    }
  }

  function drawMeteor(now) {
    if (!meteor) {
      if (now < nextMeteor) return;
      const angle = Math.PI * (0.8 + Math.random() * 0.12);
      meteor = { x: width * (0.35 + Math.random() * 0.6), y: height * (0.05 + Math.random() * 0.4), angle, length: 110 + Math.random() * 110, born: now, life: 900 };
    }
    const progress = (now - meteor.born) / meteor.life;
    if (progress >= 1) { meteor = null; nextMeteor = now + 9000 + Math.random() * 9000; return; }
    const travel = progress * 260, fade = Math.sin(progress * Math.PI);
    const hx = meteor.x + Math.cos(meteor.angle) * travel, hy = meteor.y - Math.sin(meteor.angle) * travel * -1;
    const tx = hx - Math.cos(meteor.angle) * meteor.length, ty = hy - Math.sin(meteor.angle) * meteor.length;
    const trail = context.createLinearGradient(hx, hy, tx, ty);
    trail.addColorStop(0, `rgba(255, 236, 214, ${0.85 * fade})`); trail.addColorStop(1, 'rgba(255, 236, 214, 0)');
    context.strokeStyle = trail; context.lineWidth = 1.2; context.lineCap = 'round';
    context.beginPath(); context.moveTo(hx, hy); context.lineTo(tx, ty); context.stroke();
  }

  function render(now) {
    frame = 0;
    const state = policy();
    const delta = last ? Math.min((now - last) / 1000, 0.05) : 0; last = now;
    if (state.animate) clock += delta;
    if (state.parallax) { offsets = sky.layers.map(layer => scroll * layer.depth); eased.x += (pointer.x - eased.x) * 0.04; eased.y += (pointer.y - eased.y) * 0.04; }

    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    const ground = context.createLinearGradient(0, 0, 0, height);
    ground.addColorStop(0, TOP); ground.addColorStop(1, BOTTOM);
    context.fillStyle = ground; context.fillRect(0, 0, width, height);

    const fieldHeight = sky.layers[0].fieldHeight, hazeOffset = wrapY(0, offsets[0], fieldHeight);
    context.drawImage(haze, 0, hazeOffset - fieldHeight, width, fieldHeight);
    context.drawImage(haze, 0, hazeOffset, width, fieldHeight);

    sky.layers.forEach((layer, index) => {
      const shiftX = eased.x * index * 3, shiftY = eased.y * index * 3;
      for (const star of layer.stars) {
        const y = wrapY(star.y, offsets[index], layer.fieldHeight) + shiftY;
        if (y < -4 || y > height + 4) continue;
        const x = star.x + shiftX, alpha = state.animate ? twinkle(star, clock) : star.alpha;
        context.globalAlpha = alpha;
        if (index === 2) {
          const halo = star.r * 9;
          context.drawImage(sprite(star.color), x - halo / 2, y - halo / 2, halo, halo);
        }
        context.fillStyle = star.color;
        if (star.r < 0.9) context.fillRect(x - star.r, y - star.r, star.r * 2, star.r * 2);
        else { context.beginPath(); context.arc(x, y, star.r, 0, Math.PI * 2); context.fill(); }
      }
    });
    context.globalAlpha = 1;
    if (state.animate) { drawMeteor(now); frame = requestAnimationFrame(render); }
    else last = 0;
  }

  const request = () => { if (!frame) frame = requestAnimationFrame(render); };
  let resizeTimer = 0;
  window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => { build(); request(); }, 120); }, { passive: true });
  window.addEventListener('scroll', () => { scroll = window.scrollY; if (policy().parallax) request(); }, { passive: true });
  window.addEventListener('pointermove', event => { pointer.x = event.clientX / width - 0.5; pointer.y = event.clientY / height - 0.5; }, { passive: true });
  document.addEventListener('visibilitychange', request);
  reduced.addEventListener('change', request);
  new MutationObserver(request).observe(root, { attributes: true, attributeFilter: ['data-motion'] });

  nextMeteor = performance.now() + 5000;
  build(); request();
}
}

if (document.documentElement.dataset.universe === 'on') window.addEventListener('universe-failed', startSky, { once: true });
else startSky();
