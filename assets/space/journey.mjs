// The scroll journey: one real destination per homepage section, with its true distance from Earth.
// Pure maths only, so it runs in Node tests and in the browser.
export const JOURNEY_STEP = 100; // world units the camera travels per section

export const WAYPOINTS = [
  { id: 'top', name: 'Low Earth orbit', distance: '408 km up', palette: ['#10245e', '#2f6fc2', '#9cc8ff'], nebula: 0.1, feature: 'earth' },
  { id: 'work', name: 'Jupiter', distance: '628 million km', palette: ['#3a2a1c', '#b8834a', '#f1d6a4'], nebula: 0.16, feature: 'jupiter' },
  { id: 'approach', name: 'Saturn', distance: '1.2 billion km', palette: ['#26263f', '#bf9f63', '#ecdcb4'], nebula: 0.14, feature: 'saturn' },
  { id: 'about', name: 'The Pleiades', distance: '444 light-years', palette: ['#0f2a66', '#3e7be0', '#c4dcff'], nebula: 0.36, feature: 'cluster' },
  { id: 'experience', name: 'Orion Nebula', distance: '1,344 light-years', palette: ['#0c5a64', '#d69f45', '#e46a7e'], nebula: 0.62, feature: 'nebula' },
  { id: 'awards', name: 'Galactic core', distance: '26,000 light-years', palette: ['#2e2016', '#c99655', '#f3dfbd'], nebula: 0.26, feature: 'core' },
  { id: 'writing', name: 'Andromeda Galaxy', distance: '2.5 million light-years', palette: ['#10173e', '#5670c4', '#ead7b4'], nebula: 0.18, feature: 'galaxy' },
  { id: 'contact', name: 'A new world', distance: 'Let’s find out', palette: ['#0b3434', '#3c8c74', '#bfe0a6'], nebula: 0.2, feature: 'arrival' },
];

const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
const smoothstep = (edge0, edge1, x) => { const t = clamp((x - edge0) / (edge1 - edge0), 0, 1); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a + (b - a) * t;

export function hexToRgb(hex) {
  const value = parseInt(hex.slice(1), 16);
  return [(value >> 16 & 255) / 255, (value >> 8 & 255) / 255, (value & 255) / 255];
}

// anchors: the scroll position where each waypoint begins, ascending, one per waypoint.
export function cameraZ(anchors, scroll, maxScroll) {
  const position = clamp(scroll, 0, maxScroll);
  let index = 0;
  while (index + 1 < anchors.length && anchors[index + 1] <= position) index++;
  const next = index + 1 < anchors.length ? anchors[index + 1] : maxScroll;
  const t = clamp((position - anchors[index]) / Math.max(1, next - anchors[index]), 0, 1);
  return (index + t) * JOURNEY_STEP;
}

export function waypointAt(z) {
  const index = clamp(Math.floor(z / JOURNEY_STEP), 0, WAYPOINTS.length - 1);
  return { index, t: clamp(z / JOURNEY_STEP - index, 0, 1) };
}

export function sceneAt(z) {
  const { index, t } = waypointAt(z);
  const here = WAYPOINTS[index], there = WAYPOINTS[Math.min(index + 1, WAYPOINTS.length - 1)];
  const blend = smoothstep(0.6, 1, t);
  const palette = here.palette.map((hex, i) => {
    const a = hexToRgb(hex), b = hexToRgb(there.palette[i]);
    return a.map((channel, c) => mix(channel, b[c], blend));
  });
  return { index, t, blend, palette, nebula: mix(here.nebula, there.nebula, blend) };
}

export function project(point, camZ, focal) {
  const depth = point.z - camZ;
  if (depth <= 0.5) return null;
  const scale = focal / depth;
  return { x: point.x * scale, y: point.y * scale, scale };
}

// Streak length as a fraction of each star's depth, so streaks read at any distance: the classic hyperspace look.
export function streakLength(velocity) {
  return Math.min(0.45, Math.max(0, velocity) * 0.003);
}

// Art-directed fly-by: a landmark holds an anchor near a screen edge (fractions of the viewport from its centre, +y up),
// slides further toward that edge as the camera closes in, fades in on approach and out before it fills the screen.
export function flyby({ rel, appear = 105, vanish = [18, 8], anchor, slide = [0, 0] }) {
  const fadeIn = clamp((appear - rel) / 25, 0, 1);
  const fadeOut = clamp((rel - vanish[1]) / (vanish[0] - vanish[1]), 0, 1);
  const progress = clamp((appear - rel) / (appear - vanish[1]), 0, 1);
  return { x: anchor[0] + slide[0] * progress, y: anchor[1] + slide[1] * progress, fade: Math.min(fadeIn, fadeOut), progress };
}

export function journeyPolicy({ reduced, playing, hidden }) {
  return { render: !hidden, drift: playing && !reduced && !hidden, travel: !reduced };
}
