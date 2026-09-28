import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const skyURL = new URL('../concepts/space/sky.mjs', import.meta.url);
const rootURL = new URL('../index.html', import.meta.url);
const load = () => import(skyURL);

test('the same seed and viewport always produce the same sky', async () => {
  assert.ok(existsSync(skyURL), 'sky module exists');
  const { createSky } = await load();
  const a = createSky({ width: 1440, height: 900, seed: 7 });
  const b = createSky({ width: 1440, height: 900, seed: 7 });
  const c = createSky({ width: 1440, height: 900, seed: 8 });
  assert.deepEqual(a, b);
  assert.notDeepEqual(a.layers[0].stars.slice(0, 5), c.layers[0].stars.slice(0, 5));
});

test('star count follows viewport area but stays inside a floor and a ceiling', async () => {
  const { createSky, SKY_LIMITS } = await load();
  const total = sky => sky.layers.reduce((sum, layer) => sum + layer.stars.length, 0);
  const phone = total(createSky({ width: 390, height: 844, seed: 1 }));
  const laptop = total(createSky({ width: 1440, height: 900, seed: 1 }));
  const wall = total(createSky({ width: 7680, height: 4320, seed: 1 }));
  assert.ok(phone < laptop, 'a phone gets fewer stars than a laptop');
  assert.ok(phone >= SKY_LIMITS.min, 'tiny screens still get a real sky');
  assert.ok(wall <= SKY_LIMITS.max, 'huge screens are capped');
});

test('three depth layers: far stars are many and slow, near stars are few and fast', async () => {
  const { createSky } = await load();
  const { layers } = createSky({ width: 1440, height: 900, seed: 3 });
  assert.equal(layers.length, 3);
  const [far, mid, near] = layers;
  assert.ok(far.stars.length > mid.stars.length && mid.stars.length > near.stars.length);
  assert.ok(far.depth < mid.depth && mid.depth < near.depth);
  for (const layer of layers) for (const star of layer.stars) {
    assert.ok(star.x >= 0 && star.x < 1440, 'x inside the viewport');
    assert.ok(star.y >= 0 && star.y < layer.fieldHeight, 'y inside the layer field');
    assert.ok(star.alpha > 0 && star.alpha <= 1);
  }
});

test('parallax wraps every star back into its field for any scroll position', async () => {
  const { wrapY } = await load();
  for (const offset of [0, 12.5, 900, 1799.9, 25000, -340]) {
    const y = wrapY(100, offset, 1800);
    assert.ok(y >= 0 && y < 1800, `offset ${offset} gave ${y}`);
  }
  assert.equal(wrapY(100, 0, 1800), 100);
  assert.equal(wrapY(100, 150, 1800), 1750);
});

test('motion policy honours reduced motion, the pause button, and hidden tabs', async () => {
  const { motionPolicy } = await load();
  assert.deepEqual(motionPolicy({ reduced: false, playing: true, hidden: false }), { animate: true, parallax: true });
  assert.deepEqual(motionPolicy({ reduced: true, playing: true, hidden: false }), { animate: false, parallax: false });
  assert.deepEqual(motionPolicy({ reduced: false, playing: false, hidden: false }), { animate: false, parallax: false });
  assert.deepEqual(motionPolicy({ reduced: false, playing: true, hidden: true }), { animate: false, parallax: true });
});

test('twinkling changes brightness over time without leaving the visible range', async () => {
  const { twinkle } = await load();
  const star = { alpha: 0.8, twinkle: 0.5, phase: 1.2, speed: 1.1 };
  const samples = [0, 0.4, 1.3, 2.9, 6.1].map(t => twinkle(star, t));
  for (const value of samples) assert.ok(value > 0 && value <= 1);
  assert.ok(new Set(samples.map(v => v.toFixed(3))).size > 1, 'brightness varies');
  assert.equal(twinkle({ ...star, twinkle: 0 }, 3), 0.8, 'steady stars stay steady');
});

test('the homepage wears the space theme without losing the hybrid portfolio', () => {
  const html = readFileSync(rootURL, 'utf8');
  assert.match(html, /<html lang="en" data-view="2d" data-theme="space">/);
  assert.match(html, /<meta name="theme-color" content="#0b1330">/);
  const hybrid = html.indexOf('concepts/hybrid/hybrid.css');
  const space = html.indexOf('concepts/space/space.css');
  assert.ok(hybrid > 0 && space > hybrid, 'space layer loads after the hybrid layer');
  assert.match(html, /<script src="\.\/concepts\/space\/sky\.js[^"]*" type="module"><\/script>/);
  assert.match(html, /<canvas id="sky" aria-hidden="true"><\/canvas>/);
  assert.match(html, /<div class="playground-stage" data-orbits>/);
  for (const [, path] of html.matchAll(/(?:src|href)="(\.\/concepts\/space\/[^"?]+)/g)) {
    assert.ok(existsSync(new URL(path, rootURL)), path);
  }
});
