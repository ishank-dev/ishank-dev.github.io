import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';

const planetsURL = new URL('../concepts/space/planets.mjs', import.meta.url);
const rootURL = new URL('../space.html', import.meta.url);
const load = () => import(planetsURL);

// Column-major 3x3 helpers, matching how GLSL reads a mat3 uniform.
const mul = (m, v) => [0, 1, 2].map(r => m[r] * v[0] + m[3 + r] * v[1] + m[6 + r] * v[2]);
const mulT = (m, v) => [0, 1, 2].map(c => m[c * 3] * v[0] + m[c * 3 + 1] * v[1] + m[c * 3 + 2] * v[2]);
const unit = v => { const l = Math.hypot(...v); return v.map(x => x / l); };
const near = (a, b, eps = 1e-6) => a.length === b.length && a.every((x, i) => Math.abs(x - b[i]) < eps);
const place = (lat, lon) => {
  const la = lat * Math.PI / 180, lo = lon * Math.PI / 180;
  return [Math.cos(la) * Math.sin(lo), Math.sin(la), Math.cos(la) * Math.cos(lo)];
};

test('orient puts the chosen place at the chosen spot on the disc', async () => {
  const { orient } = await load();
  const target = [0.12, 0.93, 0.35];
  const { rotation } = orient({ lat: 34.05, lon: -118.24, target, heading: -90 });
  assert.ok(near(mul(rotation, unit(target)), place(34.05, -118.24)), 'view direction maps onto Los Angeles');
});

test('orient is a proper rotation, so the globe is never mirrored or stretched', async () => {
  const { orient } = await load();
  for (const view of [{}, { lat: 34.05, lon: -118.24, target: [0.12, 0.93, 0.35], heading: -90 }, { lat: -20, lon: 150, up: [0.3, 0.95, 0] }]) {
    const R = orient(view).rotation;
    for (const [i, e] of [[1, 0, 0], [0, 1, 0], [0, 0, 1]].entries()) {
      const back = mulT(R, mul(R, e));
      assert.ok(near(back, e), `R^T R = I for axis ${i}`);
    }
    const det = R[0] * (R[4] * R[8] - R[7] * R[5]) - R[3] * (R[1] * R[8] - R[7] * R[2]) + R[6] * (R[1] * R[5] - R[4] * R[2]);
    assert.ok(Math.abs(det - 1) < 1e-6, 'determinant is +1');
  }
});

test('with no heading, north points up the screen and the prime meridian faces the viewer', async () => {
  const { orient } = await load();
  const { rotation, pole } = orient({});
  assert.ok(near(mul(rotation, [0, 0, 1]), [0, 0, 1]));
  assert.ok(near(pole, [0, 1, 0]));
});

test('a -90 degree heading turns west toward the horizon (the hero looks out over the Pacific)', async () => {
  const { orient } = await load();
  const target = unit([0.12, 0.93, 0.35]);
  const { rotation } = orient({ lat: 34.05, lon: -118.24, target, heading: -90 });
  const lo = -118.24 * Math.PI / 180;
  const west = [-Math.cos(lo), 0, Math.sin(lo)];              // local west at Los Angeles, body space
  const towardHorizon = unit([-target[1] * target[0], 1 - target[1] * target[1], -target[1] * target[2]]);
  assert.ok(near(mulT(rotation, west), towardHorizon, 1e-6));
});

test('Saturn keeps the ring tilt its fly-by was art-directed for', async () => {
  const { orient, BODY_VIEWS } = await load();
  const { pole } = orient(BODY_VIEWS.saturn);
  assert.ok(near(pole, [0.357, 0.893, 0.276], 0.01), `pole ${pole.map(x => x.toFixed(3))}`);
});

test('the hero Earth is in daylight where the camera looks, as chosen', async () => {
  const { BODY_VIEWS } = await load();
  const { sun, target } = BODY_VIEWS.earth;
  const lit = unit(sun).reduce((s, x, i) => s + x * unit(target)[i], 0);
  assert.ok(lit > 0.5, `sun angle at Los Angeles: ${lit.toFixed(2)}`);
});

test('phones get the lighter maps, larger screens get the sharp ones', async () => {
  const { mapSize } = await load();
  assert.equal(mapSize({ cssWidth: 390 }), '1k');
  assert.equal(mapSize({ cssWidth: 700 }), '1k');
  assert.equal(mapSize({ cssWidth: 820 }), '2k');
  assert.equal(mapSize({ cssWidth: 1440 }), '2k');
});

test('every planet map exists and the first paint stays within its weight budget', async () => {
  const { MAPS, mapURL } = await load();
  const bytes = (key, size) => statSync(new URL(mapURL(key, size))).size;
  for (const size of ['1k', '2k']) for (const key of Object.keys(MAPS)) {
    assert.ok(existsSync(new URL(mapURL(key, size))), `${key} ${size}`);
  }
  const hero2k = bytes('earthDay', '2k') + bytes('earthClouds', '2k');
  const hero1k = bytes('earthDay', '1k') + bytes('earthClouds', '1k');
  const all2k = Object.keys(MAPS).reduce((s, key) => s + bytes(key, '2k'), 0);
  assert.ok(hero2k <= 650 * 1024, `hero maps (desktop) ${Math.round(hero2k / 1024)} KB`);
  assert.ok(hero1k <= 220 * 1024, `hero maps (phone) ${Math.round(hero1k / 1024)} KB`);
  assert.ok(all2k <= 1400 * 1024, `all maps (desktop) ${Math.round(all2k / 1024)} KB`);
});

test('the page credits the planet maps as their licence requires', async () => {
  const { MAP_CREDIT } = await load();
  const html = readFileSync(rootURL, 'utf8');
  assert.match(MAP_CREDIT.text, /Solar System Scope/);
  assert.match(MAP_CREDIT.text, /CC BY 4\.0/);
  assert.ok(html.includes(MAP_CREDIT.text), 'credit text is on the page');
  assert.ok(html.includes(MAP_CREDIT.href), 'credit links to the source');
});
