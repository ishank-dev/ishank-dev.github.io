import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const rootURL = new URL('../index.html', import.meta.url);
const html = readFileSync(rootURL, 'utf8');

test('the homepage is the Apple-style redesign over the space flight', () => {
  assert.match(html, /<h1 class="display reveal">From messy problems<br>to working products\.<\/h1>/);
  assert.match(html, /<html lang="en" data-theme="dark" data-space data-view="2d">/);
  assert.match(html, /<canvas id="universe" aria-hidden="true"><\/canvas>/);
  assert.match(html, /<div class="problem-playground reveal" id="playground">/);
  assert.match(html, /<ul class="work-grid-list">/, 'the workbench is a grid, not the horizontal rail');
  assert.doesNotMatch(html, /data-rail\b/);
});

test('every local file the homepage references exists', () => {
  const refs = [...html.matchAll(/(?:src|href)="(\.\/[^"#]+)"/g)].map(m => m[1].split('?')[0]);
  assert.ok(refs.length > 10, 'found the page references');
  for (const ref of refs) assert.ok(existsSync(new URL(ref, rootURL)), ref);
});

test('every module the homepage scripts import exists', () => {
  for (const script of ['universe.js', 'sky.js', 'orbits.js', 'bodies-gl.js', 'links.js', 'motion.js']) {
    const url = new URL(`../assets/space/${script}`, import.meta.url);
    const source = readFileSync(url, 'utf8');
    for (const [, path] of source.matchAll(/from '(\.[^']+)'/g)) assert.ok(existsSync(new URL(path.split('?')[0], url)), `${script} -> ${path}`);
  }
});

test('the previous space homepage stays reachable at /space.html', () => {
  assert.ok(existsSync(new URL('../space.html', import.meta.url)));
});
