import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const orbits = new URL('../concepts/space/orbits/', import.meta.url);
const read = name => readFileSync(new URL(name, orbits), 'utf8');
const home = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('the hero story keeps the six phases in order, one planet each', async () => {
  const { PHASES, COPY, stateCopy } = await import(new URL('story.mjs', orbits));
  assert.deepEqual(PHASES.map(p => p.messy), ['A vague ask', 'People', 'Legacy tools', 'Messy data', 'Unknowns', 'Who owns it?']);
  assert.deepEqual(PHASES.map(p => p.clear), ['Discover', 'Frame', 'Build', 'Validate', 'Operate', 'Transfer']);
  assert.deepEqual(COPY.button, ['Make it make sense', 'Back to the messy part']);
  assert.equal(stateCopy(false).caption, 'A little like my day job. Give it a click.');
  assert.equal(stateCopy(true).caption, 'Discover → Frame → Build → Validate → Operate → Transfer.');
  for (const phase of PHASES) assert.ok(phase.messyDetail && phase.clearDetail && /^#[0-9a-f]{6}$/.test(phase.tone), phase.id);
});

test('the homepage mounts the swarms hero in place of the old field map', () => {
  assert.match(home, /<div class="problem-playground" id="playground">\s*<div class="playground-stage" data-orbits>/);
  assert.match(home, /<script src="\.\/concepts\/space\/orbits\/orbits\.js\?v=\d+" type="module"><\/script>/);
  assert.match(home, /<link rel="stylesheet" href="\.\/concepts\/space\/orbits\/orbits\.css\?v=\d+">/);
  assert.match(home, /class="untangle-button" aria-pressed="false" aria-describedby="playground-caption">Make it make sense /);
  assert.match(home, /<p id="playground-caption" aria-live="polite">A little like my day job\. Give it a click\.<\/p>/);
  assert.match(home, /<button id="motion-toggle" type="button" hidden>Pause motion<\/button>/, 'the site pause control stays');
  assert.doesNotMatch(home, /class="problem-art|sky-dial|fieldwork\/script\.js|fieldwork-hero|three-hint/, 'the old hero is gone');
  // Without the script the stage still tells the story.
  for (const word of ['A vague ask', 'Discover', 'Who owns it?', 'Transfer']) assert.ok(home.includes(word), word);
});

test('the hero module is self-contained, follows the site motion control, and credits the planet maps', () => {
  for (const file of ['orbits.js', 'bodies-gl.js', 'story.mjs', 'orbits.css']) assert.ok(existsSync(new URL(file, orbits)), file);
  const js = read('orbits.js') + read('bodies-gl.js');
  assert.doesNotMatch(js, /hero-lab|lab\.js|PIECE_STYLES|\?pieces=/, 'no lab code or picker');
  assert.match(read('orbits.js'), /dataset\.motion !== 'paused'/);
  assert.match(read('orbits.js'), /prefers-reduced-motion: reduce/);
  assert.doesNotMatch(read('orbits.js'), /dataset\.motion\s*=/, 'the hero never overrides the site pause control');
  assert.match(home, /class="map-credit" href="https:\/\/www\.solarsystemscope\.com\/textures\/"[^>]*>Planet maps: Solar System Scope, CC BY 4\.0</);
});
