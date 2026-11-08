// The hero: from a dust cloud to a working system.
// Messy: six swarms of dust drift through a turbulent cloud, each one a messy starting point, around a dull ember. The
// cursor is a small gravity well. Press and hold (or "Make it make sense") to collapse the cloud: the dust spirals in, the
// ember heats, and at full charge the star ignites. Each swarm condenses into a real planet on its own orbit, Discover
// innermost as Mercury out to Transfer as Saturn. Once formed, drag to tilt the system. "Back to the messy part" gutters
// the star and blows the dust back out. Motion follows the site's pause control and prefers-reduced-motion.
// Most visitors never press anything, so the first time the hero has been on screen for a few seconds with motion playing,
// the cloud collapses by itself once; after that it waits for the visitor.
import { PHASES, COPY, stateCopy } from './story.mjs?v=1';
import { createBodyRenderer } from './bodies-gl.js?v=5';

const SVG_NS = 'http://www.w3.org/2000/svg';
function svg(tag, attrs = {}, parent) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  if (parent) parent.appendChild(node);
  return node;
}

const TAU = Math.PI * 2;
const W = 520, H = 420, CX = 260, CY = 196, FLOOR = 390;
const ORBIT = [84, 115, 146, 178, 211, 244];                                   // semi-major axes, Discover innermost
const SPEED = ORBIT.map(a => TAU / (30 * (a / ORBIT[0]) ** 1.5));              // Kepler: Discover laps in 30 s
const SLOT = [0.35, 2.55, 4.6, 1.5, 3.55, 5.55];                               // starting phases, spread so labels breathe
const PLANET = [10, 12, 12.5, 10.5, 19, 15.5];                                 // Mercury, Venus, Earth, Mars, Jupiter, Saturn
const SWARM = 15;                                                              // a swarm's radius before it condenses
const CHARGE_UP = 1.15, CHARGE_DOWN = 0.7, AUTO_UP = 0.85, FORM = 2.3, SCATTER = 1.4;
const SELF_FORM_AFTER = 3.2;                                                   // seconds on screen before the one self-collapse
const TONES = ['#aebcff', '#cbbdf2', '#e6ebff', '#ffc9a3', '#8ea6ff'];
const SWARM_DUST = [214, 204, 190];

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const smooth = t => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const easeOut = t => 1 - (1 - clamp(t, 0, 1)) ** 3;
const mix = (a, b, t) => a + (b - a) * t;
let seed = 250;
const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const gauss = () => (random() + random() + random() - 1.5) / 0.5;
const hexRgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));

const playground = document.getElementById('playground');
const art = playground?.querySelector('[data-orbits]');
if (art) mount();

function mount() {
  const html = document.documentElement;
  const button = playground.querySelector('.untangle-button');
  const caption = document.getElementById('playground-caption');
  const reducedQuery = matchMedia('(prefers-reduced-motion: reduce)');
  art.replaceChildren();

  // ---- Stage: dust canvas, orbit rings, WebGL bodies, then the plate with labels on top ----
  const canvas = document.createElement('canvas');
  canvas.className = 'o-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  art.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  const orbitPlate = svg('svg', { viewBox: `0 0 ${W} ${H}`, class: 'o-orbit-plate', 'aria-hidden': 'true', focusable: 'false' }, art);
  const bodyCanvas = document.createElement('canvas');
  bodyCanvas.className = 'o-bodies';
  bodyCanvas.setAttribute('aria-hidden', 'true');
  art.appendChild(bodyCanvas);
  const plate = svg('svg', { viewBox: `0 0 ${W} ${H}`, class: 'o-plate', role: 'group', 'aria-labelledby': 'o-title', 'aria-describedby': 'o-desc' }, art);
  svg('title', { id: 'o-title' }, plate).textContent = COPY.title;
  const desc = svg('desc', { id: 'o-desc' }, plate);
  const defs = svg('defs', {}, plate);
  // Vector planets for browsers without WebGL2: each has its own gradient so its lit side can turn toward the star.
  PHASES.forEach((phase, i) => {
    const g = svg('radialGradient', { id: `o-planet-${i}`, cx: '0.5', cy: '0.5', r: '0.62', fx: '0.3', fy: '0.3' }, defs);
    [['0', '#ffffff', 0.92], ['0.16', phase.tone, 1], ['0.6', phase.tone, 0.62], ['1', '#070c22', 1]]
      .forEach(([offset, color, opacity]) => svg('stop', { offset, 'stop-color': color, 'stop-opacity': opacity }, g));
  });
  const coreGradient = svg('radialGradient', { id: 'o-core' }, defs);
  [['0', '#fff8ec'], ['0.45', '#ffd49a'], ['1', '#ffb86b']].forEach(([offset, color]) => svg('stop', { offset, 'stop-color': color }, coreGradient));

  const system = svg('g', {}, orbitPlate);    // rotated by the roll of the orbital plane
  const rings = ORBIT.map((a, i) => svg('ellipse', { cx: CX, cy: CY, rx: a, ry: a * 0.4, class: 'o-ring', style: `--tone:${PHASES[i].tone}` }, system));
  const backLayer = svg('g', { 'aria-hidden': 'true' }, plate);
  const core = svg('circle', { cx: CX, cy: CY, r: 0, fill: 'url(#o-core)', class: 'o-core', 'aria-hidden': 'true' }, plate);
  const frontLayer = svg('g', {}, plate);
  const leaderLayer = svg('g', { 'aria-hidden': 'true' }, plate);
  const labelLayer = svg('g', { 'aria-hidden': 'true' }, plate);
  const footnote = svg('text', { x: W / 2, y: 410, class: 'o-footnote', 'text-anchor': 'middle' }, plate);
  // The hint sits with the button it explains, right under the cloud.
  const hint = document.createElement('p');
  hint.className = 'o-hint';
  button.before(hint);

  // ---- Dust ----
  // The cloud has structure: soft lobes plus two curling filaments, so it reads as a nebula rather than a scatter of dots.
  const DUST = art.clientWidth < 420 ? 520 : 950;
  const LOBES = [[-70, -18, 70, 50], [78, 26, 66, 46], [4, -58, 58, 36], [-12, 52, 64, 34]];
  const FILAMENTS = [[[-190, 40], [-80, -120], [60, 90], [190, -30]], [[-160, -80], [-20, 30], [40, -110], [170, 70]]];
  const bez = (q, t) => { const u = 1 - t; return [0, 1].map(k => u * u * u * q[0][k] + 3 * u * u * t * q[1][k] + 3 * u * t * t * q[2][k] + t * t * t * q[3][k]); };
  const dust = Array.from({ length: DUST }, (_, n) => {
    let x, y;
    if (n % 20 < 11) { const [ox, oy, sx, sy] = LOBES[n % LOBES.length]; x = CX + ox + gauss() * sx * 0.55; y = CY + oy + gauss() * sy * 0.55; }
    else { const [fx, fy] = bez(FILAMENTS[n % 2], random()); x = CX + fx * 0.95 + gauss() * 7; y = CY + fy * 0.75 + gauss() * 6; }
    const rgb = hexRgb(TONES[Math.floor(random() * TONES.length)]);
    return {
      x, y, hx: x, hy: y, vx: 0, vy: 0, size: 0.6 + random() ** 2.2 * 1.9, alpha: 0.2 + random() * 0.6, rgb,
      orbit: 70 + random() * 205, phase: random() * TAU, keep: random() < 0.18, life: 1,
    };
  });

  // ---- Bodies: the six swarms, which condense into planets ----
  const bodies = PHASES.map((phase, i) => {
    const g = svg('g', { class: 'o-body' }, frontLayer);
    const planet = svg('circle', { class: 'o-planet', r: 0, fill: `url(#o-planet-${i})` }, g);
    const swarm = Array.from({ length: 72 }, () => ({ r: 0.25 + random() ** 0.8 * 1.1, a: random() * TAU, w: (0.7 + random() * 1.3) * (random() < 0.85 ? 1 : -1), s: 0.9 + random() * 1.2, o: 0.55 + random() * 0.45 }));
    const hit = svg('circle', { r: 18, class: 'o-hit' }, g);
    const label = svg('g', { class: 'o-label' }, labelLayer);
    const texts = [
      svg('text', { class: 'o-name messy' }, label), svg('text', { class: 'o-detail messy', dy: 15 }, label),
      svg('text', { class: 'o-name clear' }, label), svg('text', { class: 'o-detail clear', dy: 15 }, label),
    ];
    texts[0].textContent = phase.messy; texts[1].textContent = phase.messyDetail;
    texts[2].textContent = phase.clear; texts[3].textContent = phase.clearDetail;
    const leader = svg('line', { class: 'o-leader' }, leaderLayer);
    const angle = (i / PHASES.length) * TAU + 0.4;
    const hx = CX + Math.cos(angle) * (74 + (i % 3) * 30), hy = CY + Math.sin(angle) * (50 + (i % 2) * 22);
    return {
      i, phase, g, planet, swarm, hit, label, texts, leader, tilt: random() * TAU,
      hx, hy, x: hx, y: hy, z: 0, spin: random() * TAU, spinRate: (random() - 0.5) * 0.7, round: 0, size: SWARM,
      phi: SLOT[i], from: null, delay: 0, speed: 1, hot: false, lx: null, ly: null, cand: -1, w: 0,
      drift: [0.21 + random() * 0.2, 0.17 + random() * 0.2, random() * TAU, random() * TAU],
    };
  });

  // ---- State ----
  let phase = 'nebula', charge = 0, holding = false, auto = false, phaseT = 0, time = 0, flash = 0, wave = -1;
  let ratio = 0.4, roll = -0.12, ratioGoal = 0.4, rollGoal = -0.12, pointer = null, tilting = null;
  let raf = 0, last = 0, inView = true, mostlyInView = false, clear = false, touched = false, selfFormed = false, onScreen = 0;
  const renderer = createBodyRenderer(bodyCanvas, { onReady: () => { if (!raf) render(); } });
  if (renderer) art.classList.add('is-gl');

  function setClear(next, source = 'button') {
    if (next === clear) return;
    clear = next;
    const copy = stateCopy(clear);
    button.setAttribute('aria-pressed', String(clear));
    button.firstChild.textContent = `${copy.button} `;
    caption.textContent = copy.caption;
    playground.classList.toggle('is-clear', clear);
    if (source === 'button') onChange(clear);
  }
  button.addEventListener('click', () => { touched = true; setClear(!clear); });

  function describe() {
    const formed = phase === 'forming' || phase === 'system';
    const copy = stateCopy(formed);
    desc.textContent = copy.description;
    hint.textContent = copy.hint;
    footnote.textContent = copy.footnote;
  }

  // Where a planet sits on its orbit, in the tilted and rolled plane. z > 0 is the near half.
  function orbitPoint(i, phi) {
    const a = ORBIT[i], x = a * Math.cos(phi), y = a * ratio * Math.sin(phi);
    const c = Math.cos(roll), s = Math.sin(roll);
    return { x: CX + x * c - y * s, y: CY + x * s + y * c, z: Math.sin(phi) };
  }

  // A smooth swirling flow for the cloud: the curl of a few layered waves, so dust eddies instead of jittering.
  function flow(x, y, t) {
    const e = 0.9;
    const psi = (px, py) => Math.sin(px * 0.021 + t * 0.23) * Math.cos(py * 0.026 - t * 0.17) + 0.6 * Math.sin((px + py) * 0.013 + t * 0.31) + 0.35 * Math.cos(px * 0.047 - py * 0.019 - t * 0.4);
    return [(psi(x, y + e) - psi(x, y - e)) / (2 * e) * 780, -(psi(x + e, y) - psi(x - e, y)) / (2 * e) * 780];
  }

  // ---- Transitions ----
  function ignite(instant) {
    phase = 'forming'; phaseT = 0; charge = 1; auto = false; holding = false; flash = instant ? 0 : 1; wave = instant ? -1 : 0;
    bodies.forEach((b, i) => {
      b.from = { x: b.x, y: b.y, size: b.size };
      b.delay = 0.18 + i * 0.12; b.speed = 1;
      b.phi = SLOT[i] - (instant ? 0 : SPEED[i] * FORM);   // so each lands on its slot as the formation ends
    });
    dust.forEach(d => { d.life = 1; });
    setClear(true, 'gesture');
    describe();
    window.dispatchEvent(new CustomEvent('sky:ignite', { detail: { formed: true, instant } }));   // the background sky answers
    if (instant) { phase = 'system'; bodies.forEach(b => { b.round = 1; b.size = PLANET[b.i]; }); }
  }
  function scatter(instant) {
    phase = 'dispersing'; phaseT = 0; charge = 0; auto = false; flash = 0; wave = -1;
    bodies.forEach(b => { b.from = { x: b.x, y: b.y, size: b.size }; b.delay = (5 - b.i) * 0.05; });
    dust.forEach(d => {
      const a = random() * TAU, s = 40 + random() * 120;
      d.x = CX + Math.cos(a) * 6; d.y = CY + Math.sin(a) * 6; d.vx = Math.cos(a) * s; d.vy = Math.sin(a) * s; d.life = 1;
    });
    describe();
    window.dispatchEvent(new CustomEvent('sky:ignite', { detail: { formed: false, instant } }));
    if (instant) finishScatter();
  }
  function finishScatter() {
    phase = 'nebula'; phaseT = 0;
    bodies.forEach(b => { b.round = 0; b.size = SWARM; b.x = b.hx; b.y = b.hy; b.from = null; });
    dust.forEach(d => { d.x = d.hx; d.y = d.hy; d.vx = d.vy = 0; d.life = 1; });
    describe();
  }
  function onChange(next) {
    const instant = !canRun();
    if (next) {
      if (phase === 'nebula' || phase === 'dispersing') { if (instant) ignite(true); else auto = true; }
    } else if (phase === 'forming' || phase === 'system') scatter(instant);
    else auto = false;
    kick();
  }

  // ---- Simulation ----
  function step(dt) {
    time += dt; phaseT += dt;
    if (phase === 'nebula') {
      const up = auto ? 1 / AUTO_UP : holding ? 1 / CHARGE_UP : 0;
      charge = up ? Math.min(1, charge + dt * up) : Math.max(0, charge - dt / CHARGE_DOWN);
      if (charge >= 1) ignite(false);
    }
    flash = Math.max(0, flash - dt * 1.6);
    if (wave >= 0) wave = wave + dt > 1.6 ? -1 : wave + dt;
    ratio += (ratioGoal - ratio) * (1 - Math.exp(-dt * 8));
    roll += (rollGoal - roll) * (1 - Math.exp(-dt * 8));

    const pull = phase === 'nebula' ? charge : 0;
    for (const d of dust) {
      if (phase === 'nebula') {
        let [fx, fy] = flow(d.x, d.y, time);
        fx *= 1 - pull * 0.7; fy *= 1 - pull * 0.7;
        fx += (d.hx - d.x) * 0.35 * (1 - pull); fy += (d.hy - d.y) * 0.35 * (1 - pull);   // stays a cloud
        if (pull > 0) {                                                                     // collapse: a tightening inward spiral
          const dx = CX - d.x, dy = CY - d.y, r = Math.hypot(dx, dy) + 8;
          fx += (dx / r) * 260 * pull * pull + (-dy / r) * 190 * pull; fy += (dy / r) * 260 * pull * pull + (dx / r) * 190 * pull;
        }
        if (pointer && !holding) {                                                          // the cursor as a small gravity well
          const dx = pointer.x - d.x, dy = pointer.y - d.y, r2 = dx * dx + dy * dy, r = Math.sqrt(r2) + 14;
          if (r < 150) { const g = 5200 / (r2 + 900); fx += (dx / r) * g * 60 - (dy / r) * g * 45; fy += (dy / r) * g * 60 + (dx / r) * g * 45; }
        }
        d.vx += (fx - d.vx) * (1 - Math.exp(-dt * 3)); d.vy += (fy - d.vy) * (1 - Math.exp(-dt * 3));
        d.x += d.vx * dt; d.y += d.vy * dt;
      } else if (phase === 'forming' || phase === 'system') {
        // Most dust falls into the new star; a thin disk of it stays behind, orbiting in the plane.
        if (d.keep) {
          d.phase += dt * TAU / (26 * (d.orbit / ORBIT[0]) ** 1.5);
          const tx0 = d.orbit * Math.cos(d.phase), ty0 = d.orbit * ratio * Math.sin(d.phase);
          const c = Math.cos(roll), s = Math.sin(roll);
          const tx = CX + tx0 * c - ty0 * s, ty = CY + tx0 * s + ty0 * c;
          const k = phase === 'forming' ? smooth(phaseT / FORM) : 1;
          d.x += (tx - d.x) * Math.min(1, dt * (1 + k * 6)); d.y += (ty - d.y) * Math.min(1, dt * (1 + k * 6));
          d.life = Math.max(0.3, d.life - dt * 0.4);
        } else {
          const dx = CX - d.x, dy = CY - d.y, r = Math.hypot(dx, dy) + 1;
          const s = 240 + (1 - Math.min(1, r / 200)) * 260;
          d.x += (dx / r) * s * dt - (dy / r) * 60 * dt; d.y += (dy / r) * s * dt + (dx / r) * 60 * dt;
          if (r < 10) d.life = 0;
        }
      } else if (phase === 'dispersing') {
        const k = smooth(phaseT / SCATTER);
        d.vx *= 1 - dt * 1.6; d.vy *= 1 - dt * 1.6;
        d.x += d.vx * dt + (d.hx - d.x) * k * dt * 2.5; d.y += d.vy * dt + (d.hy - d.y) * k * dt * 2.5;
        d.life = Math.min(1, d.life + dt);
      }
    }

    for (const b of bodies) {
      b.spin += b.spinRate * dt * (1 - b.round);
      if (phase === 'nebula') {
        const [a, c, p, q] = b.drift;
        let tx = b.hx + Math.sin(time * a + p) * 16 + Math.sin(time * c * 1.7 + q) * 6;
        let ty = b.hy + Math.cos(time * c + q) * 12 + Math.sin(time * a * 1.3 + p) * 5;
        if (charge > 0) { tx += (CX - tx) * charge * 0.28; ty += (CY - ty) * charge * 0.28; b.spin += dt * charge * 3; }
        if (pointer && !holding) { const dx = pointer.x - b.x, dy = pointer.y - b.y, r = Math.hypot(dx, dy); if (r < 110) { tx += dx * 0.12; ty += dy * 0.12; } }
        b.x += (tx - b.x) * (1 - Math.exp(-dt * 2.2)); b.y += (ty - b.y) * (1 - Math.exp(-dt * 2.2));
        b.z = Math.sin(time * 0.4 + b.i) * 0.5;
      } else if (phase === 'forming' || phase === 'system') {
        b.speed += ((b.hot ? 0 : 1) - b.speed) * (1 - Math.exp(-dt * 5));
        b.phi += SPEED[b.i] * dt * b.speed;
        const target = orbitPoint(b.i, b.phi);
        const t = phase === 'forming' ? (phaseT - b.delay) / (FORM - 0.9) : 1;
        if (t < 1 && b.from) {
          // Spiral out: swing around the star while the radius eases from the swarm's spot to the orbit.
          const e = easeOut(Math.max(0, t));
          const r0 = Math.hypot(b.from.x - CX, b.from.y - CY), a0 = Math.atan2(b.from.y - CY, b.from.x - CX);
          const r1 = Math.hypot(target.x - CX, target.y - CY), a1 = Math.atan2(target.y - CY, target.x - CX);
          let da = a1 - a0; da = ((da % TAU) + TAU) % TAU;
          const ang = a0 + da * e, rad = mix(r0 * (1 - 0.55 * Math.sin(Math.PI * Math.min(1, e * 1.4))), r1, e);
          b.x = CX + Math.cos(ang) * rad; b.y = CY + Math.sin(ang) * rad;
          b.round = smooth(Math.max(0, t) * 1.2); b.size = mix(b.from.size, PLANET[b.i], smooth(t));
        } else { b.x = target.x; b.y = target.y; b.round = 1; b.size = PLANET[b.i]; }
        b.z = target.z;
      } else if (phase === 'dispersing') {
        const t = smooth((phaseT - b.delay) / (SCATTER - 0.3));
        b.x = mix(b.from.x, b.hx, t); b.y = mix(b.from.y, b.hy, t);
        b.round = 1 - t; b.size = mix(b.from.size, SWARM, t);
      }
    }
    if (phase === 'forming' && phaseT >= FORM) phase = 'system';
    if (phase === 'dispersing' && phaseT >= SCATTER) finishScatter();
  }

  // ---- Labels: each weighs a few spots around its body and takes the least crowded one, with hysteresis ----
  // Label height is measured, because phones use larger type in the same viewBox.
  const EDGE = 6;
  let LINE = 30;
  const DIRS = Array.from({ length: 8 }, (_, k) => [Math.cos(k * Math.PI / 4), Math.sin(k * Math.PI / 4)]);
  const overlap = (x1, y1, w1, h1, x2, y2, w2, h2) => { const ox = (w1 + w2) / 2 - Math.abs(x1 - x2), oy = (h1 + h2) / 2 - Math.abs(y1 - y2); return ox > 0 && oy > 0 ? ox * oy : 0; };
  function measure() {
    bodies.forEach(b => {
      const width = k => { try { return b.texts[k].getComputedTextLength(); } catch { return 90; } };
      b.wMessy = Math.max(width(0), width(1)); b.wClear = Math.max(width(2), width(3));
    });
    try { LINE = Math.max(30, ...bodies.map(b => b.label.getBBox().height)); } catch { /* keep the default */ }
  }
  function layout(dt, snap) {
    const formed = phase === 'forming' || phase === 'system';
    for (const b of bodies) {
      b.w = (formed && b.round > 0.7) ? b.wClear : b.wMessy;
      const ox = b.x - CX, oy = b.y - CY, n = Math.hypot(ox, oy) || 1;
      const pref = [ox / n, oy / n];
      const gap = b.size + 10;
      b.cands = [pref, ...DIRS].map(([dx, dy], k) => {
        const x = b.x + dx * (gap + b.w / 2 * Math.abs(dx)), y = b.y + dy * (gap + LINE / 2 * Math.abs(dy));
        const out = Math.max(0, EDGE + b.w / 2 - x) + Math.max(0, x + b.w / 2 - (W - EDGE)) + Math.max(0, EDGE + LINE / 2 - y) + Math.max(0, y + LINE / 2 - FLOOR);
        return { k, x, y, base: (1 - (dx * pref[0] + dy * pref[1])) * 120 + out * 90 };
      });
    }
    for (let pass = 0; pass < (snap ? 3 : 1); pass++) {
      for (const b of bodies) {
        let best = b.cands[0], bestCost = Infinity;
        for (const c of b.cands) {
          let cost = c.base + (snap || c.k === b.cand ? 0 : 320);
          for (const o of bodies) {
            if (o !== b && o.tx !== undefined) cost += 3 * overlap(c.x, c.y, b.w + 12, LINE + 8, o.tx, o.ty, o.w + 12, LINE + 8);
            cost += 2 * overlap(c.x, c.y, b.w, LINE, o.x, o.y, o.size * 2 + 10, o.size * 2 + 10);
          }
          if (formed) cost += 3 * overlap(c.x, c.y, b.w, LINE, CX, CY, 56, 44);   // keep labels off the star
          if (cost < bestCost) { bestCost = cost; best = c; }
        }
        b.cand = best.k;
        b.tx = clamp(best.x, EDGE + b.w / 2, W - EDGE - b.w / 2);
        b.ty = clamp(best.y, EDGE + LINE / 2, FLOOR - LINE / 2);
      }
    }
    const follow = snap ? 1 : 1 - Math.exp(-dt * 9);
    for (const b of bodies) {
      if (b.lx === null || snap) { b.lx = b.tx; b.ly = b.ty; continue; }
      b.lx += (b.tx - b.lx) * follow; b.ly += (b.ty - b.ly) * follow;
    }
  }

  // ---- Drawing ----
  function aimGradient(i, b) {
    const node = defs.querySelector(`#o-planet-${i}`);
    const dx = CX - b.x, dy = CY - b.y, n = Math.hypot(dx, dy) || 1;
    node.setAttribute('fx', (0.5 + 0.3 * dx / n).toFixed(3)); node.setAttribute('fy', (0.5 + 0.3 * dy / n).toFixed(3));
    node.setAttribute('cx', (0.5 + 0.1 * dx / n).toFixed(3)); node.setAttribute('cy', (0.5 + 0.1 * dy / n).toFixed(3));
  }
  // Light on a body in view space (x right, y up, z toward the viewer): from the ember or star at the centre, arriving
  // from behind when the body is on the near half of its orbit, which gives real crescent phases.
  function bodyLight(b, formed) {
    const dx = CX - b.x, dy = -(CY - b.y), dz = -b.z * (formed ? 90 : 40), n = Math.hypot(dx, dy, dz) || 1;
    return [dx / n, dy / n, dz / n];
  }
  function drawBodies(formed, coreR, heat) {
    if (!renderer) return;
    const ember = [1, 0.5, 0.3].map(c => c * (0.42 + charge * 0.9));
    const sun = [1, 0.96, 0.9];
    const k = formed ? smooth(phaseT / 0.6) : phase === 'dispersing' ? 1 - smooth(phaseT / 0.5) : 0;
    const color = ember.map((c, i) => mix(c, sun[i], k));
    const items = bodies.map(b => ({
      x: b.x, y: b.y, z: b.z, r: PLANET[b.i] * b.round, morph: b.round, planet: b.i, spin: b.spin + time * 0.12 * b.round,
      light: bodyLight(b, formed), lightColor: color, alpha: formed ? 0.82 + 0.18 * (b.z + 1) / 2 : 1,
    }));
    const star = { star: true, x: CX, y: CY, r: coreR * 1.25, heat, alpha: 1, z: 0 };
    const behind = items.filter(item => item.z < 0).sort((a, b) => a.z - b.z), ahead = items.filter(item => item.z >= 0).sort((a, b) => a.z - b.z);
    renderer.draw({ items: [...behind, star, ...ahead], scale: bodyCanvas.width / W, plateHeight: H, time, plane: { ratio, roll } });
  }
  function render() {
    const formed = phase === 'forming' || phase === 'system';
    // Canvas: haze, dust, the swarms, the ember or the star's corona, the charge ring, the ignition flash and shockwave.
    const s = canvas.width / W;
    ctx.setTransform(s, 0, 0, s, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const hazeAlpha = phase === 'nebula' ? 1 - charge * 0.7 : phase === 'dispersing' ? smooth(phaseT / SCATTER) : Math.max(0, 1 - phaseT * 1.5);
    if (hazeAlpha > 0.01) {
      [[CX - 70, CY - 18, 150, '174,188,255', 0.11], [CX + 78, CY + 26, 140, '203,189,242', 0.1], [CX + 4, CY - 58, 110, '255,201,163', 0.08], [CX - 12, CY + 52, 120, '142,166,255', 0.07], [CX, CY, 70, '255,160,120', 0.06]].forEach(([x, y, r, rgb, a]) => {
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, `rgba(${rgb},${a * hazeAlpha})`); g.addColorStop(1, `rgba(${rgb},0)`);
        ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
      });
    }
    ctx.globalCompositeOperation = 'lighter';
    for (const d of dust) {
      if (d.life <= 0.01) continue;
      const a = d.alpha * d.life * (formed && d.keep ? 0.55 : 1);
      ctx.fillStyle = `rgba(${d.rgb[0]},${d.rgb[1]},${d.rgb[2]},${a.toFixed(3)})`;
      ctx.fillRect(d.x - d.size / 2, d.y - d.size / 2, d.size, d.size);
    }
    const [tr, tg, tb] = SWARM_DUST;
    for (const b of bodies) {
      const fade = 1 - b.round;
      if (fade <= 0.01) continue;
      const spread = b.size * (1 - b.round * 0.92), c = Math.cos(b.tilt), sn = Math.sin(b.tilt);
      const glow = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, spread * 0.9);
      glow.addColorStop(0, `rgba(${tr},${tg},${tb},${0.4 * fade})`); glow.addColorStop(1, `rgba(${tr},${tg},${tb},0)`);
      ctx.fillStyle = glow; ctx.fillRect(b.x - spread, b.y - spread, spread * 2, spread * 2);
      for (const d of b.swarm) {
        const a = d.a + d.w * time * (1 + charge * 1.5), lx = Math.cos(a) * d.r * spread, ly = Math.sin(a) * d.r * spread * 0.5;
        ctx.fillStyle = `rgba(${tr},${tg},${tb},${(d.o * fade).toFixed(3)})`;
        ctx.fillRect(b.x + lx * c - ly * sn - d.s / 2, b.y + lx * sn + ly * c - d.s / 2, d.s, d.s);
      }
    }
    ctx.globalCompositeOperation = 'source-over';
    // Ember to star: red and dull, heating through orange to amber-white as it charges.
    const heat = formed ? 1 : phase === 'dispersing' ? Math.max(0, 1 - phaseT * 2) : charge;
    const emberR = mix(5, 13, heat) * (1 + (phase === 'nebula' ? Math.sin(time * 2.4) * 0.06 : 0));
    const hue = [255, mix(110, 214, heat), mix(80, 150, heat)].map(Math.round).join(',');
    const corona = ctx.createRadialGradient(CX, CY, 0, CX, CY, emberR * (formed ? 5.5 : 3.6));
    corona.addColorStop(0, `rgba(${hue},${0.55 + heat * 0.35})`);
    corona.addColorStop(0.25, `rgba(${hue},${0.18 + heat * 0.2})`);
    corona.addColorStop(1, `rgba(${hue},0)`);
    ctx.fillStyle = corona; ctx.fillRect(CX - 90, CY - 90, 180, 180);
    if (phase === 'nebula' && charge > 0.001) {
      ctx.strokeStyle = 'rgba(38,54,111,0.9)'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(CX, CY, 30, 0, TAU); ctx.stroke();
      ctx.strokeStyle = `rgba(255,184,107,${0.5 + charge * 0.5})`; ctx.lineWidth = 1.8; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.arc(CX, CY, 30, -Math.PI / 2, -Math.PI / 2 + charge * TAU); ctx.stroke();
    }
    if (flash > 0) {
      const r = 30 + (1 - flash) * 120, g = ctx.createRadialGradient(CX, CY, 0, CX, CY, r);
      g.addColorStop(0, `rgba(255,244,226,${0.85 * flash})`); g.addColorStop(1, 'rgba(255,214,150,0)');
      ctx.fillStyle = g; ctx.fillRect(CX - r, CY - r, r * 2, r * 2);
    }
    if (wave >= 0) {
      const t = easeOut(wave / 1.6), r = 20 + t * 250;
      ctx.strokeStyle = `rgba(255,184,107,${(1 - t) * 0.6})`; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.ellipse(CX, CY, r, r * mix(1, ratio, t), roll, 0, TAU); ctx.stroke();
    }

    // SVG: orbits fade in as the shockwave passes them; the star core occludes planets on the far half.
    system.setAttribute('transform', `rotate(${(roll * 180 / Math.PI).toFixed(2)} ${CX} ${CY})`);
    const waveR = wave >= 0 ? 20 + easeOut(wave / 1.6) * 250 : formed ? 999 : 0;
    rings.forEach((ring, i) => {
      ring.setAttribute('ry', (ORBIT[i] * ratio).toFixed(1));
      const shown = formed ? (waveR >= ORBIT[i] || phase === 'system' ? 1 : 0) : phase === 'dispersing' ? Math.max(0, 1 - phaseT * 2.5) : 0;
      ring.style.opacity = shown;
      ring.classList.toggle('is-hot', bodies[i].hot);
    });
    const coreR = formed ? 7.5 : phase === 'dispersing' ? Math.max(0, 7.5 * (1 - phaseT * 2)) : 2 + charge * 4;
    core.setAttribute('r', coreR.toFixed(2));
    drawBodies(formed, coreR, heat);
    for (const b of bodies) {
      const behind = (formed || phase === 'dispersing') ? b.z < 0 : b.z < -0.2;
      const layer = behind ? backLayer : frontLayer;
      if (b.g.parentNode !== layer) layer.appendChild(b.g);
      if (!renderer) aimGradient(b.i, b);
      b.planet.setAttribute('cx', b.x.toFixed(1)); b.planet.setAttribute('cy', b.y.toFixed(1));
      b.planet.setAttribute('r', Math.max(0, PLANET[b.i] * b.round).toFixed(2));
      b.hit.setAttribute('cx', b.x.toFixed(1)); b.hit.setAttribute('cy', b.y.toFixed(1));
      b.g.style.opacity = (formed ? 0.72 + 0.28 * (b.z + 1) / 2 : 1).toFixed(3);
      b.g.classList.toggle('is-hot', b.hot);
      // Labels
      const showClear = formed && b.round > 0.7;
      b.label.classList.toggle('is-clear', showClear);
      b.label.classList.toggle('is-hot', b.hot);
      b.label.setAttribute('transform', `translate(${(b.lx - b.w / 2).toFixed(1)} ${(b.ly - LINE / 2 + 12).toFixed(1)})`);
      b.label.style.opacity = (formed ? (b.round > 0.7 ? 0.7 + 0.3 * (b.z + 1) / 2 : Math.max(0, 1 - b.round * 1.6)) : 1).toFixed(3);
      const x0 = b.lx - b.w / 2, x1 = b.lx + b.w / 2, y0 = b.ly - LINE / 2, y1 = b.ly + LINE / 2;
      const nx = clamp(b.x, x0, x1), ny = clamp(b.y, y0, y1), dx = nx - b.x, dy = ny - b.y, dist = Math.hypot(dx, dy);
      const r = b.size + 3, show = dist > r + 14 ? 0.4 : 0;
      b.leader.style.opacity = show;
      if (show) { b.leader.setAttribute('x1', (b.x + dx / dist * r).toFixed(1)); b.leader.setAttribute('y1', (b.y + dy / dist * r).toFixed(1)); b.leader.setAttribute('x2', (nx - dx / dist * 3).toFixed(1)); b.leader.setAttribute('y2', (ny - dy / dist * 3).toFixed(1)); }
    }
  }

  // ---- Loop: runs only while motion plays, the tab is visible, and the hero is on screen ----
  const canRun = () => inView && !document.hidden && html.dataset.motion !== 'paused' && !reducedQuery.matches;
  function frame(now) {
    const dt = last ? Math.min((now - last) / 1000, 1 / 30) : 1 / 60;
    last = now;
    // The one self-collapse: only while motion plays and the hero is on screen, and never once the visitor has acted.
    if (!selfFormed && !touched && phase === 'nebula' && mostlyInView) {
      onScreen += dt;
      if (onScreen >= SELF_FORM_AFTER) { selfFormed = true; auto = true; }
    }
    step(dt); layout(dt, false); render();
    raf = canRun() ? requestAnimationFrame(frame) : 0;
  }
  function kick() {
    if (canRun()) { if (!raf) { last = 0; raf = requestAnimationFrame(frame); } return; }
    // Still mode (paused, reduced motion, hidden, or off screen): settle to the current end state and draw once.
    if (phase === 'forming') { phase = 'system'; bodies.forEach(b => { b.round = 1; b.size = PLANET[b.i]; b.phi = SLOT[b.i]; }); flash = 0; wave = -1; }
    if (phase === 'dispersing') finishScatter();
    if (phase === 'nebula' && auto) ignite(true);
    step(0); layout(0, true); render();
  }

  // ---- Input ----
  function toLocal(event) {
    const rect = plate.getBoundingClientRect();
    return { x: (event.clientX - rect.left) / rect.width * W, y: (event.clientY - rect.top) / rect.height * H };
  }
  plate.addEventListener('pointermove', event => {
    pointer = toLocal(event);
    if (tilting) {
      const dy = pointer.y - tilting.y, dx = pointer.x - tilting.x;
      ratioGoal = clamp(tilting.ratio + dy / 260, 0.14, 0.86);
      rollGoal = clamp(tilting.roll + dx / 520, -0.45, 0.45);
      if (!canRun()) { ratio = ratioGoal; roll = rollGoal; step(0); layout(0, true); render(); }
    }
  });
  plate.addEventListener('pointerleave', () => { pointer = null; });
  plate.addEventListener('pointerdown', event => {
    const p = toLocal(event);
    touched = true;
    if (phase === 'nebula') {
      if (!canRun()) { setClear(true); return; }
      holding = true; plate.setPointerCapture(event.pointerId); plate.classList.add('is-holding'); kick();
    } else if (phase === 'system' || phase === 'forming') {
      tilting = { x: p.x, y: p.y, ratio: ratioGoal, roll: rollGoal }; plate.setPointerCapture(event.pointerId); plate.classList.add('is-tilting');
    }
    event.preventDefault();
  });
  function release() { holding = false; tilting = null; plate.classList.remove('is-holding', 'is-tilting'); }
  ['pointerup', 'pointercancel'].forEach(type => plate.addEventListener(type, release));
  bodies.forEach(b => {
    const on = () => { b.hot = true; }, off = () => { b.hot = false; };
    b.g.addEventListener('pointerenter', on); b.g.addEventListener('pointerleave', off);
  });

  // ---- Size, visibility, and start ----
  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.round(art.clientWidth * dpr)); canvas.height = Math.max(1, Math.round(art.clientWidth * H / W * dpr));
    bodyCanvas.width = canvas.width; bodyCanvas.height = canvas.height;
    measure(); layout(0, true);
    if (!canRun()) render();
  }
  new ResizeObserver(resize).observe(art);
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(([entry]) => {
      inView = entry.isIntersecting; mostlyInView = entry.intersectionRatio >= 0.75; kick();
    }, { threshold: [0, 0.75] }).observe(art);
  } else mostlyInView = true;
  document.addEventListener('visibilitychange', kick);
  new MutationObserver(kick).observe(html, { attributes: true, attributeFilter: ['data-motion'] });
  reducedQuery.addEventListener('change', kick);

  art.classList.add('is-live');
  measure();
  describe();
  for (let k = 0; k < 90; k++) step(1 / 60);   // open mid-swirl rather than on a frozen first frame
  layout(0, true);
  resize();
  kick();
  document.fonts?.ready.then(() => { measure(); layout(0, true); render(); });
}
