// Andromeda as thousands of individual stars, and the text shelters that keep copy readable over scenery.
// Pure data and maths, so both run in Node tests and in the browser.

// One particle is 9 floats: x, y, height (galaxy plane, radius 1), r, g, b, alpha, size (css px), inDisk (1 disk, 0 companion).
export const GALAXY_STRIDE = 9;

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const mix = (a, b, t) => a.map((x, i) => x + (b[i] - x) * t);
const smoothstep = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };

const GOLD = [1, 0.8, 0.52], CREAM = [1, 0.92, 0.78], WARM_WHITE = [1, 0.9, 0.8];
const ARM_BLUE = [0.52, 0.6, 1], ARM_VIOLET = [0.7, 0.52, 1], HII_PINK = [1, 0.54, 0.74];
const HAZE_WARM = [0.95, 0.85, 0.7], HAZE_BLUE = [0.6, 0.66, 0.92];

export function galaxyParticles({ count = 12000, seed = 250 } = {}) {
  const random = mulberry32(seed);
  const gauss = () => (random() + random() + random() + random() - 2) / 0.577;
  const out = [];
  const push = (x, y, h, color, alpha, size, inDisk) => out.push(x, y, h, color[0], color[1], color[2], Math.min(1, Math.max(0.05, alpha)), size, inDisk);
  const bulge = Math.round(count * 0.16), arms = Math.round(count * 0.52), m32 = Math.round(count * 0.02), m110 = Math.round(count * 0.03);
  const haze = Math.max(0, count - bulge - arms - m32 - m110);

  // Nucleus and bulge: dense, warm, slightly larger points.
  for (let i = 0; i < bulge; i++) {
    const r = Math.min(0.3, Math.abs(gauss()) * 0.09), a = random() * Math.PI * 2;
    push(r * Math.cos(a), r * Math.sin(a), gauss() * 0.04, mix(GOLD, CREAM, random()), 0.55 + random() * 0.45, 1.4 + random() * 1.2, 1);
  }
  // Two logarithmic spiral arms: warm near the core, blue and violet outward, with pink star-forming knots.
  for (let i = 0; i < arms; i++) {
    const arm = i % 2, t = random() ** 0.85, r = Math.min(1, 0.1 + t * 0.9 + gauss() * 0.02);
    const theta = arm * Math.PI + Math.log(r / 0.1) * 2.35 + gauss() * 0.22 * (1.1 - t * 0.5);
    const knot = random() < 0.04;
    const cool = mix(ARM_BLUE, ARM_VIOLET, random());
    const color = knot ? HII_PINK : mix(WARM_WHITE, cool, smoothstep(0.12, 0.55, r));
    push(r * Math.cos(theta), r * Math.sin(theta), gauss() * 0.015, color, (0.55 + 0.45 * (1 - t * 0.4) * random()) * (knot ? 1.25 : 1), knot ? 1.9 + random() * 0.8 : 1.2 + random() * 1.2, 1);
  }
  // Diffuse disk between the arms: faint, warm at the centre, cooling outward.
  for (let i = 0; i < haze; i++) {
    const r = Math.min(1, -Math.log(1 - random() * 0.95) * 0.28), a = random() * Math.PI * 2;
    push(r * Math.cos(a), r * Math.sin(a), gauss() * 0.02, mix(HAZE_WARM, HAZE_BLUE, smoothstep(0.08, 0.5, r)), 0.22 + random() * 0.3, 0.9 + random() * 0.8, 1);
  }
  // Companions, placed on screen relative to the tilted disk: compact M32 near the nucleus, elongated M110 further out.
  for (let i = 0; i < m32; i++) push(0.14 + gauss() * 0.022, -0.2 + gauss() * 0.022, 0, mix(CREAM, GOLD, random() * 0.5), 0.5 + random() * 0.4, 1 + random() * 0.8, 0);
  const c = Math.cos(0.6), s = Math.sin(0.6);
  for (let i = 0; i < m110; i++) {
    const u = gauss() * 0.06, v = gauss() * 0.03;
    push(-0.34 + u * c - v * s, 0.46 + u * s + v * c, 0, mix(CREAM, WARM_WHITE, random()), 0.3 + random() * 0.3, 0.9 + random() * 0.7, 0);
  }
  return new Float32Array(out);
}

// Text shelters: the boxes (device pixels, GL origin at the bottom) behind visible text blocks, where scenery steps back.
export function shelterRects(rects, { ratio = 1, viewportHeight, pad = 8, max = 16, margin = 60 }) {
  const data = new Float32Array(max * 4);
  let count = 0;
  for (const r of rects) {
    if (count >= max) break;
    if (!r.width || !r.height || r.bottom < -margin || r.top > viewportHeight + margin) continue;
    const i = count++ * 4;
    data[i] = (r.left - pad) * ratio;
    data[i + 1] = (viewportHeight - (r.bottom + pad)) * ratio;
    data[i + 2] = (r.right + pad) * ratio;
    data[i + 3] = (viewportHeight - (r.top - pad)) * ratio;
  }
  return { data, count };
}
