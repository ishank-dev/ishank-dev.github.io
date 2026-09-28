import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';

const galaxyURL = new URL('../concepts/space/galaxy.mjs', import.meta.url);
const load = () => import(galaxyURL);
const STRIDE = 9; // x, y, height, r, g, b, alpha, size, inDisk

test('the particle galaxy is the same every time for a given seed', async () => {
  assert.ok(existsSync(galaxyURL), 'galaxy module exists');
  const { galaxyParticles } = await load();
  const a = galaxyParticles({ count: 4000, seed: 7 });
  const b = galaxyParticles({ count: 4000, seed: 7 });
  assert.deepEqual(a, b);
  assert.equal(a.length % STRIDE, 0);
});

test('disk stars stay inside the galaxy radius and companions sit apart from the disk', async () => {
  const { galaxyParticles } = await load();
  const data = galaxyParticles({ count: 6000, seed: 3 });
  let disk = 0, companions = 0;
  for (let i = 0; i < data.length; i += STRIDE) {
    const r = Math.hypot(data[i], data[i + 1]);
    if (data[i + 8] === 1) { disk++; assert.ok(r <= 1.05, `disk star at ${r.toFixed(2)}`); }
    else { companions++; assert.ok(r > 0.12, 'companions are not in the nucleus'); }
  }
  assert.ok(disk > companions * 8, 'the disk dominates');
  assert.ok(companions > 0, 'M32 and M110 are present');
});

test('the core glows warm and the outer arms run cool, like a real spiral', async () => {
  const { galaxyParticles } = await load();
  const data = galaxyParticles({ count: 8000, seed: 11 });
  const warmth = (lo, hi) => {
    let sum = 0, n = 0;
    for (let i = 0; i < data.length; i += STRIDE) {
      if (data[i + 8] !== 1) continue;
      const r = Math.hypot(data[i], data[i + 1]);
      if (r >= lo && r < hi) { sum += data[i + 3] - data[i + 5]; n++; }
    }
    return sum / n;
  };
  assert.ok(warmth(0, 0.12) > 0.15, 'nucleus leans gold');
  assert.ok(warmth(0.55, 1.05) < 0, 'outskirts lean blue');
});

test('particle count scales with the request and every star is visible but small', async () => {
  const { galaxyParticles } = await load();
  const small = galaxyParticles({ count: 2000, seed: 1 }).length / STRIDE;
  const large = galaxyParticles({ count: 9000, seed: 1 }).length / STRIDE;
  assert.ok(large > small * 3);
  const data = galaxyParticles({ count: 3000, seed: 5 });
  for (let i = 0; i < data.length; i += STRIDE) {
    assert.ok(data[i + 6] > 0 && data[i + 6] <= 1, 'alpha in range');
    assert.ok(data[i + 7] >= 0.8 && data[i + 7] <= 3.2, `size ${data[i + 7]}`);
  }
});

test('text shelters: visible text blocks become padded device-pixel boxes, flipped for GL, capped', async () => {
  const { shelterRects } = await load();
  const rects = [
    { left: 100, top: 50, right: 300, bottom: 150, width: 200, height: 100 },
    { left: 0, top: -500, right: 100, bottom: -200, width: 100, height: 300 },  // far above the viewport
    { left: 10, top: 20, right: 10, bottom: 20, width: 0, height: 0 },          // hidden element
    { left: 400, top: 700, right: 600, bottom: 1200, width: 200, height: 500 }, // straddles the bottom edge
  ];
  const { data, count } = shelterRects(rects, { ratio: 2, viewportHeight: 900, pad: 6, max: 16 });
  assert.equal(count, 2);
  assert.deepEqual([...data.slice(0, 4)], [188, 1488, 612, 1712]);
  assert.equal(data[4], 788);
  const many = Array.from({ length: 30 }, (_, i) => ({ left: 0, top: i * 20, right: 50, bottom: i * 20 + 10, width: 50, height: 10 }));
  assert.equal(shelterRects(many, { ratio: 1, viewportHeight: 900, pad: 0, max: 16 }).count, 16);
});
