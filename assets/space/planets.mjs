// Real-world planets for the flight: how each globe is turned toward the camera, where it is lit from,
// and which surface maps it wears. Pure data and math, so it can be tested without WebGL.
//
// Coordinates: view space is x right, y up, z toward the viewer (a planet is drawn as a disc whose surface
// normal at a pixel is (d.x, d.y, sqrt(1 - |d|^2))). Body space puts latitude on y and longitude as
// atan(x, z), matching an equirectangular map with the prime meridian in the middle.

const radians = degrees => (degrees * Math.PI) / 180;
const unit = v => { const length = Math.hypot(...v); return v.map(x => x / length); };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

// Rotation from view space to body space (column-major, ready for a mat3 uniform) that shows the place at
// (lat, lon) at the view direction `target`, with the body's north along the screen direction nearest to
// `up`, then turned by `heading` degrees about the view axis (-90 sends west toward `up`).
// `pole` is the body's rotation axis in view space: the ring-plane normal for Saturn.
export function orient({ lat = 0, lon = 0, target = [0, 0, 1], up = [0, 1, 0], heading = 0 } = {}) {
  const la = radians(lat), lo = radians(lon);
  const T = [Math.cos(la) * Math.sin(lo), Math.sin(la), Math.cos(la) * Math.cos(lo)];
  const N = unit([-Math.sin(la) * Math.sin(lo), Math.cos(la), -Math.sin(la) * Math.cos(lo)]);
  const E = cross(N, T);
  const tV = unit(target);
  const along = up[0] * tV[0] + up[1] * tV[1] + up[2] * tV[2];
  const n0 = unit([up[0] - along * tV[0], up[1] - along * tV[1], up[2] - along * tV[2]]);
  const e0 = cross(n0, tV);
  const h = radians(heading), ch = Math.cos(h), sh = Math.sin(h);
  const eV = e0.map((x, i) => ch * x + sh * n0[i]);
  const nV = n0.map((x, i) => -sh * e0[i] + ch * x);
  const rotation = [];
  for (let column = 0; column < 3; column++) {
    for (let row = 0; row < 3; row++) rotation.push(E[row] * eV[column] + N[row] * nV[column] + T[row] * tV[column]);
  }
  return { rotation, pole: [rotation[1], rotation[4], rotation[7]] };
}

// How each real planet faces the flight. `sun` is the light direction in view space; spins are radians per
// second of drift time (they stop with everything else when motion is paused or reduced).
export const BODY_VIEWS = {
  // Low Earth orbit above Los Angeles (the hero dial's 34.05 N, 118.24 W), looking west over the Pacific
  // in daylight. `target` is where Los Angeles sits on the disc: the lower middle of the visible limb.
  earth: { lat: 34.05, lon: -118.24, target: [0.12, 0.93, 0.35], heading: -90, sun: [0.35, 0.55, 0.76], spin: 0.008, cloudSpin: 0.004, exposure: 1.1 },
  // Jupiter enters at the right edge; the Great Red Spot (about 20 S, map longitude -47.5) turned onto the visible half.
  // Its real cloud tops are near-white and its disc passes behind project copy, so it is lit from the screen edge: the
  // limb nearest the edge stays vivid and the half under the copy falls toward the terminator (the Clear Column Rule).
  jupiter: { lat: 0, lon: -22.5, sun: [0.62, 0.3, 0.72], spin: 0.012, exposure: 0.55 },
  // Saturn seen 16 degrees above its ring plane, the rings rising to the right: the tilt its fly-by was drawn for.
  saturn: { lat: 16, lon: 0, up: [Math.sin(0.38), Math.cos(0.38), 0], sun: [0.6, 0.35, 0.7], spin: 0.006, exposure: 0.85 },
  // The arrival world is fictional. The western arc of its crescent continent is turned onto the rising limb, in daylight.
  arrival: { lat: 16, lon: -138, target: [-0.1, 0.84, 0.53], sun: [0.46, 0.6, 0.66], spin: 0.003, exposure: 1.3 },
};

// Surface maps by Solar System Scope, built from NASA imagery (CC BY 4.0), re-encoded for the web. The arrival world's map and
// the nebula and galactic-core textures are art generated with Google Gemini for this site (see maps/PROVENANCE.md), artistic impressions, not astronomical images.
export const MAPS = {
  earthDay: 'earth-day', earthClouds: 'earth-clouds', earthNight: 'earth-night',
  jupiter: 'jupiter', saturn: 'saturn', saturnRing: 'saturn-ring',
  arrival: 'arrival-world', orion: 'orion-nebula', core: 'galactic-core',
};
const EXTENSION = { arrival: 'jpg', orion: 'jpg', core: 'jpg' };
export const MAP_CREDIT = {
  text: 'Planet maps: Solar System Scope, CC BY 4.0',
  href: 'https://www.solarsystemscope.com/textures/',
};

export function mapURL(key, size) {
  const name = MAPS[key];
  const file = key === 'saturnRing' ? `${name}.png` : `${name}-${size}.${EXTENSION[key] || 'webp'}`;
  return new URL(`./maps/${file}`, import.meta.url).href;
}

// Phones get the 1k maps (a quarter of the bytes); the disc is small enough there that nobody sees the difference.
export const mapSize = ({ cssWidth }) => (cssWidth <= 700 ? '1k' : '2k');
