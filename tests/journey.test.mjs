import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const journeyURL = new URL('../concepts/space/journey.mjs', import.meta.url);
const rootURL = new URL('../index.html', import.meta.url);
const load = () => import(journeyURL);

test('the journey visits one real destination per homepage section, in page order', async () => {
  assert.ok(existsSync(journeyURL), 'journey module exists');
  const { WAYPOINTS } = await load();
  assert.deepEqual(WAYPOINTS.map(w => w.id), ['hero', 'work', 'approach', 'about', 'experience', 'awards', 'writing', 'contact']);
  assert.deepEqual(WAYPOINTS.map(w => w.name), ['Low Earth orbit', 'Jupiter', 'Saturn', 'The Pleiades', 'Orion Nebula', 'Galactic core', 'Andromeda Galaxy', 'A new world']);
  const html = readFileSync(rootURL, 'utf8');
  for (const { id } of WAYPOINTS.slice(1)) assert.match(html, new RegExp(`id="${id}"`), `section ${id} exists`);
  for (const w of WAYPOINTS) assert.equal(w.palette.length, 3);
});

test('camera depth grows steadily with scroll and lands on each waypoint at its section', async () => {
  const { cameraZ, JOURNEY_STEP } = await load();
  const anchors = [0, 900, 3400, 4000, 4800, 6500, 7300, 8000];
  const max = 8600;
  assert.equal(cameraZ(anchors, 0, max), 0);
  assert.equal(cameraZ(anchors, 900, max), JOURNEY_STEP);
  assert.equal(cameraZ(anchors, 4800, max), 4 * JOURNEY_STEP);
  assert.equal(cameraZ(anchors, max, max), 8 * JOURNEY_STEP);
  assert.equal(cameraZ(anchors, 99999, max), 8 * JOURNEY_STEP, 'clamped past the end');
  assert.equal(cameraZ(anchors, -50, max), 0, 'clamped before the start');
  let previous = -1;
  for (let y = 0; y <= max; y += 37) { const z = cameraZ(anchors, y, max); assert.ok(z >= previous); previous = z; }
});

test('waypointAt reports the current destination and how far through it the camera is', async () => {
  const { waypointAt, JOURNEY_STEP, WAYPOINTS } = await load();
  assert.deepEqual(waypointAt(0), { index: 0, t: 0 });
  assert.deepEqual(waypointAt(JOURNEY_STEP * 2.25), { index: 2, t: 0.25 });
  assert.equal(waypointAt(JOURNEY_STEP * 99).index, WAYPOINTS.length - 1);
});

test('scenery blends into the next destination only near the end of each leg', async () => {
  const { sceneAt, JOURNEY_STEP, WAYPOINTS, hexToRgb } = await load();
  const start = sceneAt(JOURNEY_STEP * 1.1);
  assert.deepEqual(start.palette[0], hexToRgb(WAYPOINTS[1].palette[0]));
  const late = sceneAt(JOURNEY_STEP * 1.95);
  assert.notDeepEqual(late.palette[0], hexToRgb(WAYPOINTS[1].palette[0]));
  assert.ok(late.nebula > Math.min(WAYPOINTS[1].nebula, WAYPOINTS[2].nebula) - 1e-9);
});

test('perspective projection shrinks distant points and drops anything behind the camera', async () => {
  const { project } = await load();
  const near = project({ x: 10, y: 5, z: 20 }, 0, 800);
  const far = project({ x: 10, y: 5, z: 80 }, 0, 800);
  assert.ok(Math.abs(near.x) > Math.abs(far.x) && near.scale > far.scale);
  assert.equal(project({ x: 1, y: 1, z: 10 }, 12, 800), null);
  assert.deepEqual(project({ x: 0, y: 0, z: 50 }, 10, 800), { x: 0, y: 0, scale: 20 });
});

test('warp streaks appear with speed and never grow without limit', async () => {
  const { streakLength } = await load();
  assert.equal(streakLength(0), 0);
  assert.ok(streakLength(60) > streakLength(20));
  assert.equal(streakLength(1e6), streakLength(1e7));
});

test('journey policy: reduced motion never travels, pause stops the drift, hidden tabs stop drawing', async () => {
  const { journeyPolicy } = await load();
  assert.deepEqual(journeyPolicy({ reduced: false, playing: true, hidden: false }), { render: true, drift: true, travel: true });
  assert.deepEqual(journeyPolicy({ reduced: false, playing: false, hidden: false }), { render: true, drift: false, travel: true });
  assert.deepEqual(journeyPolicy({ reduced: true, playing: true, hidden: false }), { render: true, drift: false, travel: false });
  assert.deepEqual(journeyPolicy({ reduced: false, playing: true, hidden: true }), { render: false, drift: false, travel: true });
});

test('the homepage mounts the universe canvas, the flight readout, and its own pause control', () => {
  const html = readFileSync(rootURL, 'utf8');
  assert.match(html, /<canvas id="universe" aria-hidden="true"><\/canvas>/);
  assert.match(html, /<script src="\.\/concepts\/space\/universe\.js[^"]*" type="module"><\/script>/);
  assert.ok(html.indexOf('space/universe.js') < html.indexOf('space/sky.js'), 'universe decides before the 2D fallback runs');
  assert.match(html, /<aside class="flight" aria-label="Flight readout">/);
  assert.match(html, /<button class="flight-pause" type="button" aria-label="Pause motion">/);
  assert.match(html, /<p class="flight-now"><span class="flight-name">Low Earth orbit<\/span>/);
});

test('fly-bys fade in on approach, slide outward toward their edge, and fade out before they fill the screen', async () => {
  const { flyby } = await load();
  const spec = { appear: 105, anchor: [0.56, -0.02], slide: [0.08, -0.04] };
  assert.equal(flyby({ ...spec, rel: 140 }).fade, 0, 'invisible while far away');
  assert.equal(flyby({ ...spec, rel: 60 }).fade, 1, 'fully visible mid-approach');
  assert.ok(flyby({ ...spec, rel: 9 }).fade < 0.2, 'nearly gone as it passes');
  assert.equal(flyby({ ...spec, rel: 7 }).fade, 0, 'gone once passed');
  const early = flyby({ ...spec, rel: 90 }), late = flyby({ ...spec, rel: 20 });
  assert.ok(late.x > early.x && late.y < early.y, 'slides further out toward its own edge');
});

test('the homepage uses drawn icons, not Unicode arrows or asterisks', () => {
  const html = readFileSync(rootURL, 'utf8');
  assert.doesNotMatch(html, /[↗↙↑↓✳]/);
  assert.match(html, /class="arrow"/);
});
