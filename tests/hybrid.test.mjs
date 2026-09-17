import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const source = new URL('../concepts/hybrid/interactions.mjs', import.meta.url);
const htmlURL = new URL('../concepts/hybrid/index.html', import.meta.url);
const html = readFileSync(htmlURL, 'utf8');
const rootURL = new URL('../index.html', import.meta.url);
const rootHtml = readFileSync(rootURL, 'utf8');
test('hybrid keeps complete portfolio sections, valid anchors, and local assets', () => {
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
  assert.equal(new Set(ids).size, ids.length, 'IDs are unique');
  for (const id of ['work', 'approach', 'about', 'experience', 'awards', 'writing', 'contact']) assert.ok(ids.includes(id));
  for (const [, id] of html.matchAll(/href="#([^"]+)"/g)) assert.ok(ids.includes(id), `anchor ${id}`);
  for (const [, path] of html.matchAll(/(?:src|href)="((?:\.\/|\.\.\/)[^"]+)"/g)) {
    if (path.includes('?view=')) continue;
    assert.ok(existsSync(new URL(path.split('?')[0], htmlURL)), path);
  }
  assert.equal((html.match(/ data-project data-category=/g) || []).length, 6);
  assert.equal((html.match(/<time datetime=/g) || []).length, 6);
  assert.match(html, /data-view="2d"/);
  assert.match(html, /noindex, nofollow, noarchive/);
  assert.doesNotMatch(html, /scene\.js|EPF-653|EZ-CAP|1,700|96%/);
});
test('hybrid preserves the approved hero artwork and portrait About block', () => {
  const original = readFileSync(new URL('../concepts/fieldwork/index.html', import.meta.url), 'utf8');
  const extract = (text, start, end) => text.slice(text.indexOf(start), text.indexOf(end, text.indexOf(start)));
  assert.equal(extract(html, '<svg class="problem-art', '</svg>'), extract(original, '<svg class="problem-art', '</svg>'));
  assert.equal(extract(html, '<div class="about-heading">', '<div class="about-links">'), extract(original, '<div class="about-heading">', '<div class="about-links">'));
});
test('every workbench project has its own inline animated visual instead of a static thumbnail', () => {
  const visuals = [...html.matchAll(/class="archive-image project-motion" data-project-visual="([^"]+)"/g)].map(match => match[1]);
  assert.deepEqual(visuals, ['ella', 'semantic', 'neural', 'geospatial', 'mock-server', 'beats']);
  assert.equal((html.match(/class="project-motion-svg"/g) || []).length, 6);
  const library = html.slice(html.indexOf('<section class="project-library"'), html.indexOf('</section>', html.indexOf('<section class="project-library"')));
  assert.doesNotMatch(library, /<img\b/);
});
test('project filters return all projects or only the selected category without losing order', async () => {
  assert.ok(existsSync(source), 'hybrid interaction module exists');
  const { filterProjects } = await import(source);
  const projects = [{ id: 'ella', category: 'ai/ml' }, { id: 'map', category: 'data engineering' }, { id: 'rag', category: 'ai/ml' }];
  assert.deepEqual(filterProjects(projects, 'all').map(p => p.id), ['ella', 'map', 'rag']);
  assert.deepEqual(filterProjects(projects, ' AI/ML ').map(p => p.id), ['ella', 'rag']);
  assert.deepEqual(filterProjects(projects, 'backend systems'), []);
  assert.equal(projects.length, 3);
});
test('contact drafts preserve visitor text and encode it as data in a fixed mailto destination', async () => {
  assert.ok(existsSync(source), 'hybrid interaction module exists');
  const { contactDraft } = await import(source);
  const url = new URL(contactDraft({ name: '  A & B  ', email: 'a+b@example.com', subject: 'Question & idea?', message: 'Hello\n#scope & next step' }));
  assert.equal(url.protocol, 'mailto:');
  assert.equal(url.pathname, 'ishankdev@gmail.com');
  assert.equal(url.searchParams.get('subject'), 'Question & idea?');
  assert.equal(url.searchParams.get('body'), 'From: A & B\nEmail: a+b@example.com\n\nHello\n#scope & next step');
  assert.equal(new URL(contactDraft({name:'Alex',email:'a@example.com',subject:' ',message:'Hi'})).searchParams.get('subject'), 'Portfolio enquiry from Alex');
});

test('root homepage publishes the hybrid portfolio while preserving the old portfolio in archive', () => {
  assert.match(rootHtml, /<body>/);
  assert.match(rootHtml, /<h1 id="hero-title">The messy part/);
  assert.match(rootHtml, /Forward Deployed Engineer<\/p>/);
  assert.doesNotMatch(rootHtml, /Forward Deployed Engineer at Prentis AI<\/p>/);
  assert.doesNotMatch(rootHtml, /class="header-resume"/);
  assert.doesNotMatch(rootHtml, /noindex, nofollow, noarchive/);
  for (const [, path] of rootHtml.matchAll(/(?:src|href)="((?:\.\/)?(?:assets|concepts)\/[^"]+)"/g)) {
    assert.ok(existsSync(new URL(path.split('?')[0], rootURL)), path);
  }

  const archiveURL = new URL('../archive/original/index.html', import.meta.url);
  assert.ok(existsSync(archiveURL), 'archived original portfolio exists');
  const archiveHtml = readFileSync(archiveURL, 'utf8');
  assert.match(archiveHtml, /<body class="dark-theme">/);
  assert.match(archiveHtml, /data-page="resume"/);
});
