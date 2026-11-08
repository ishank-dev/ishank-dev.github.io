// Pure starfield maths. No DOM here, so it can be tested in Node.
export const SKY_LIMITS = { min: 220, max: 900, pixelsPerStar: 3200 };

// Real star colours by spectral class, weighted toward the white-blue stars the eye sees most.
const SPECTRAL = [
  ['#cdd8ff', 0.22], // B: blue-white
  ['#eef1ff', 0.38], // A: white
  ['#fff6e6', 0.2],  // G: sun-like
  ['#ffd9ad', 0.13], // K: amber
  ['#ffbd9c', 0.07], // M: red
];

const LAYERS = [
  { depth: 0.06, share: 0.62, radius: [0.35, 0.8], alpha: [0.22, 0.58], twinkle: [0, 0.12], band: 0.42 },
  { depth: 0.16, share: 0.28, radius: [0.6, 1.2], alpha: [0.38, 0.8], twinkle: [0.1, 0.32], band: 0.3 },
  { depth: 0.32, share: 0.1, radius: [1, 1.9], alpha: [0.6, 1], twinkle: [0.2, 0.5], band: 0 },
];

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

const between = (random, [low, high]) => low + random() * (high - low);

function pickColor(random) {
  let roll = random();
  for (const [color, weight] of SPECTRAL) {
    roll -= weight;
    if (roll <= 0) return color;
  }
  return SPECTRAL[1][0];
}

// A soft diagonal band where extra faint stars gather, like the Milky Way crossing the chart.
function bandPoint(random, width, fieldHeight) {
  const along = random();
  const x = along * width;
  const centre = fieldHeight * (0.12 + along * 0.62);
  const spread = fieldHeight * 0.11;
  const gauss = (random() + random() + random() - 1.5) / 1.5;
  const y = centre + gauss * spread;
  return { x, y: ((y % fieldHeight) + fieldHeight) % fieldHeight };
}

export function createSky({ width, height, seed = 1 }) {
  const random = mulberry32(seed);
  const total = Math.max(SKY_LIMITS.min, Math.min(SKY_LIMITS.max, Math.round((width * height) / SKY_LIMITS.pixelsPerStar)));
  const fieldHeight = Math.ceil(height * 1.25);
  const layers = LAYERS.map(spec => {
    const count = Math.max(1, Math.round(total * spec.share));
    const stars = Array.from({ length: count }, () => {
      const inBand = random() < spec.band;
      const point = inBand ? bandPoint(random, width, fieldHeight) : { x: random() * width, y: random() * fieldHeight };
      return {
        x: Math.min(width - 0.001, Math.max(0, point.x)),
        y: Math.min(fieldHeight - 0.001, Math.max(0, point.y)),
        r: between(random, spec.radius),
        alpha: between(random, spec.alpha),
        color: pickColor(random),
        twinkle: between(random, spec.twinkle),
        phase: random() * Math.PI * 2,
        speed: 0.5 + random() * 1.4,
      };
    });
    return { depth: spec.depth, fieldHeight, stars };
  });
  return { width, height, layers };
}

export function wrapY(y, offset, fieldHeight) {
  return (((y - offset) % fieldHeight) + fieldHeight) % fieldHeight;
}

export function motionPolicy({ reduced, playing, hidden }) {
  if (reduced || !playing) return { animate: false, parallax: false };
  return { animate: !hidden, parallax: true };
}

export function twinkle(star, time) {
  if (!star.twinkle) return star.alpha;
  const wave = 0.5 + 0.5 * Math.sin(time * star.speed + star.phase);
  return Math.min(1, Math.max(0.02, star.alpha * (1 - star.twinkle * wave)));
}
