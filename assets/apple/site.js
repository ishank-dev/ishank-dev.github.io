// Ishank Sharma — portfolio interactions.
// Principles (Apple, "Designing Fluid Interfaces"): respond on pointer-down,
// track 1:1 from the grab offset, animate with interruptible springs from the
// live on-screen value, hand off release velocity, project momentum, and
// rubber-band at the edges.

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');

/* ------------------------------------------------------------------ */
/* Spring: Apple's designer-facing parameters (damping ratio, response) */
/* ------------------------------------------------------------------ */

class Spring {
  constructor(value, onUpdate) {
    this.value = value;
    this.velocity = 0;
    this.target = value;
    this.onUpdate = onUpdate;
    this.raf = 0;
    this.last = 0;
  }
  // Re-targeting keeps the current value AND velocity, so reversals never hit a "brick wall".
  to(target, { velocity, damping = 1, response = 0.4, onRest } = {}) {
    this.target = target;
    if (velocity !== undefined) this.velocity = velocity;
    this.stiffness = (2 * Math.PI / response) ** 2;
    this.damping = (4 * Math.PI * damping) / response;
    this.onRest = onRest;
    if (reduceMotion.matches) { this.set(target); onRest?.(); return; }
    if (!this.raf) { this.last = performance.now(); this.raf = requestAnimationFrame(this.tick); }
  }
  set(value) {
    this.stop();
    this.value = this.target = value;
    this.velocity = 0;
    this.onUpdate(value);
  }
  stop() { cancelAnimationFrame(this.raf); this.raf = 0; }
  get moving() { return !!this.raf; }
  tick = (now) => {
    let dt = Math.min((now - this.last) / 1000, 1 / 30);
    this.last = now;
    const step = 1 / 240;
    while (dt > 0) {
      const h = Math.min(step, dt);
      const a = -this.stiffness * (this.value - this.target) - this.damping * this.velocity;
      this.velocity += a * h;
      this.value += this.velocity * h;
      dt -= h;
    }
    if (Math.abs(this.value - this.target) < 0.05 && Math.abs(this.velocity) < 2) {
      this.value = this.target; this.velocity = 0; this.raf = 0;
      this.onUpdate(this.value);
      const done = this.onRest; this.onRest = undefined; done?.();
      return;
    }
    this.onUpdate(this.value);
    this.raf = requestAnimationFrame(this.tick);
  };
}

// Apple's momentum projection (exponential decay, as in UIScrollView).
const project = (v, rate = 0.998) => (v / 1000) * rate / (1 - rate);

// Progressive resistance past a boundary.
const rubberband = (overshoot, dimension, c = 0.55) =>
  (overshoot * dimension * c) / (dimension + c * Math.abs(overshoot));

// Velocity from the last ~80ms of samples, in px/s.
function velocityOf(samples) {
  const now = samples.at(-1);
  if (!now) return 0;
  let first = now;
  for (let i = samples.length - 1; i >= 0; i--) {
    if (now.t - samples[i].t > 80) break;
    first = samples[i];
  }
  const dt = (now.t - first.t) / 1000;
  return dt > 0 ? (now.p - first.p) / dt : 0;
}

const SLOP = 8; // hysteresis before committing to a gesture direction

/* ------------------------------------------------------------------ */
/* Navigation: scroll edge + current section + menu                    */
/* ------------------------------------------------------------------ */

function initNav() {
  const nav = document.querySelector('[data-nav]');
  const onScroll = () => nav.toggleAttribute('data-scrolled', scrollY > 4);
  addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  const links = [...document.querySelectorAll('.nav-links a')];
  const byId = new Map(links.map((a) => [a.hash.slice(1), a]));
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      links.forEach((a) => a.removeAttribute('aria-current'));
      byId.get(e.target.id)?.setAttribute('aria-current', 'true');
    }
  }, { rootMargin: '-45% 0px -50% 0px' });
  byId.forEach((_, id) => { const s = document.getElementById(id); if (s) io.observe(s); });

  // Menu: originates from its trigger and leaves the same way.
  const btn = document.querySelector('[data-menu-btn]');
  const menu = document.querySelector('[data-menu]');
  menu.setAttribute('data-closed', '');
  const setOpen = (open) => {
    btn.setAttribute('aria-expanded', String(open));
    if (open) {
      menu.hidden = false;
      menu.offsetWidth; // commit the closed state before animating
      menu.removeAttribute('data-closed');
      menu.querySelector('a')?.focus({ preventScroll: true });
    } else {
      menu.setAttribute('data-closed', '');
      const hide = () => { if (menu.hasAttribute('data-closed')) menu.hidden = true; };
      reduceMotion.matches ? setTimeout(hide, 200) : menu.addEventListener('transitionend', hide, { once: true });
    }
  };
  btn.addEventListener('click', () => setOpen(btn.getAttribute('aria-expanded') !== 'true'));
  menu.addEventListener('click', (e) => { if (e.target.closest('a')) setOpen(false); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && btn.getAttribute('aria-expanded') === 'true') { setOpen(false); btn.focus(); }
  });
  document.addEventListener('pointerdown', (e) => {
    if (btn.getAttribute('aria-expanded') === 'true' && !menu.contains(e.target) && !btn.contains(e.target)) setOpen(false);
  });
}

/* ------------------------------------------------------------------ */
/* Scroll reveal                                                       */
/* ------------------------------------------------------------------ */

function initReveal() {
  window.__revealed = true;
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (e.isIntersecting) { e.target.setAttribute('data-in', ''); io.unobserve(e.target); }
    }
  }, { rootMargin: '0px 0px -8% 0px' });
  document.querySelectorAll('.reveal').forEach((el) => io.observe(el));
}

/* ------------------------------------------------------------------ */
/* Project rail: 1:1 drag, velocity handoff, projection, rubber band   */
/* ------------------------------------------------------------------ */

function initRail() {
  const rail = document.querySelector('[data-rail]');
  const track = document.querySelector('[data-rail-track]');
  const prev = document.querySelector('[data-rail-prev]');
  const next = document.querySelector('[data-rail-next]');
  if (!rail || !track || !prev || !next) return; // the workbench is a static grid now
  const items = [...track.children];
  let minX = 0, snaps = [0], width = 0;

  const render = (x) => {
    track.style.transform = `translate3d(${x}px,0,0)`;
    prev.disabled = x > -2;
    next.disabled = x < minX + 2;
  };
  const spring = new Spring(0, render);

  const measure = () => {
    const pad = parseFloat(getComputedStyle(rail).paddingLeft);
    track.style.paddingRight = `${pad}px`;
    width = rail.clientWidth - pad;
    minX = Math.min(0, width - track.scrollWidth);
    snaps = [...new Set(items.map((li) => Math.max(minX, -li.offsetLeft)).concat(minX))].sort((a, b) => b - a);
  };
  const nearest = (x) => snaps.reduce((best, s) => (Math.abs(s - x) < Math.abs(best - x) ? s : best), snaps[0]);
  const clamp = (x) => Math.min(0, Math.max(minX, x));
  const bounded = (raw) => raw > 0 ? rubberband(raw, width) : raw < minX ? minX - rubberband(minX - raw, width) : raw;

  measure();
  addEventListener('resize', () => { measure(); spring.set(clamp(nearest(spring.value))); });

  // Gesture
  let g = null;
  let suppressClick = false;

  rail.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    const wasMoving = spring.moving && Math.abs(spring.velocity) > 40;
    spring.stop(); // interrupt: we continue from the live on-screen value
    g = { id: e.pointerId, x0: e.clientX, y0: e.clientY, base: spring.value, phase: 'pending', samples: [], wasMoving };
    suppressClick = wasMoving; // a tap that catches a moving rail stops it; it doesn't open a card
  });

  rail.addEventListener('pointermove', (e) => {
    if (!g || e.pointerId !== g.id) return;
    const dx = e.clientX - g.x0, dy = e.clientY - g.y0;
    if (g.phase === 'pending') {
      if (Math.abs(dx) > SLOP && Math.abs(dx) > Math.abs(dy)) {
        g.phase = 'drag';
        g.x0 = e.clientX - (spring.value - g.base); // keep the grab offset; no jump after the slop
        rail.setPointerCapture(e.pointerId);
        rail.setAttribute('data-dragging', '');
        suppressClick = true;
      } else if (Math.abs(dy) > SLOP) {
        g.phase = 'ignore';
      }
      return;
    }
    if (g.phase !== 'drag') return;
    const raw = g.base + (e.clientX - g.x0);
    g.raw = raw;
    spring.set(bounded(raw));
    g.samples.push({ p: e.clientX, t: e.timeStamp });
    if (g.samples.length > 20) g.samples.shift();
  });

  const end = (e) => {
    if (!g || e.pointerId !== g.id) return;
    const gesture = g; g = null;
    rail.removeAttribute('data-dragging');
    if (gesture.phase === 'drag') {
      const v = e.type === 'pointercancel' ? 0 : velocityOf(gesture.samples);
      const target = clamp(nearest(spring.value + project(v)));
      // Bounce only when the gesture carried momentum.
      spring.to(target, { velocity: v, damping: Math.abs(v) > 300 ? 0.82 : 1, response: 0.4 });
    } else if (gesture.wasMoving) {
      spring.to(clamp(nearest(spring.value)), { damping: 1, response: 0.35 });
    }
  };
  rail.addEventListener('pointerup', end);
  rail.addEventListener('pointercancel', end);
  rail.addEventListener('click', (e) => {
    if (suppressClick) { e.preventDefault(); e.stopPropagation(); suppressClick = false; }
  }, true);

  // Trackpad horizontal scroll
  let wheelIdle = 0;
  rail.addEventListener('wheel', (e) => {
    if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
    e.preventDefault();
    spring.stop();
    spring.set(clamp(spring.value - e.deltaX));
    clearTimeout(wheelIdle);
    wheelIdle = setTimeout(() => spring.to(nearest(spring.value), { damping: 1, response: 0.4 }), 140);
  }, { passive: false });

  // Buttons
  const stepTo = (dir) => {
    const i = snaps.indexOf(nearest(spring.target));
    const j = Math.max(0, Math.min(snaps.length - 1, i + dir));
    spring.to(snaps[j], { damping: 1, response: 0.45 });
  };
  prev.addEventListener('click', () => stepTo(-1));
  next.addEventListener('click', () => stepTo(1));

  // Keyboard focus keeps the focused card in view.
  track.addEventListener('focusin', (e) => {
    const li = e.target.closest('li');
    if (!li || g) return;
    const left = li.offsetLeft + spring.value, right = left + li.offsetWidth;
    if (left < 0 || right > width) spring.to(clamp(-li.offsetLeft), { damping: 1, response: 0.4 });
    rail.scrollLeft = 0;
  });

  render(0);
}

/* ------------------------------------------------------------------ */
/* Segmented control: thumb springs from wherever it currently is      */
/* ------------------------------------------------------------------ */

const STAGES = [
  ['A vague ask', 'Sit with the people doing the work. Trace the workarounds until the real problem shows up beneath the feature request.'],
  ['Too many opinions', 'Turn competing asks into one clear problem, a measure of success, and an honest list of what is out of scope.'],
  ['Legacy tools', 'Work with the systems already in place. Models for ambiguity, deterministic code for rules, clear boundaries between them.'],
  ['Messy data', 'Evaluate on real data, not demo data. Measure quality, latency and cost, and keep a regression suite so it stays good.'],
  ['Unknowns', 'Ship with observability, fallbacks and recovery paths, so the unexpected becomes a handled case instead of an outage.'],
  ['Who owns it?', 'Hand off to a named owner with docs, runbooks and feedback loops. Done means the team can run it without me.'],
];

function initSegmented() {
  const seg = document.querySelector('[data-seg]');
  const thumb = document.querySelector('[data-seg-thumb]');
  const tabs = [...seg.querySelectorAll('[role="tab"]')];
  const panel = document.querySelector('[data-stage-panel]');
  const from = document.querySelector('[data-stage-from]');
  const text = document.querySelector('[data-stage-text]');
  let w = 0, x = 0;
  const draw = () => { thumb.style.width = `${w}px`; thumb.style.transform = `translateX(${x}px)`; };
  // Two independent springs: position and width (decomposed, never one 2D spring).
  const sx = new Spring(0, (v) => { x = v; draw(); });
  const sw = new Spring(0, (v) => { w = v; draw(); });
  let current = 0, swapTimer = 0;

  const place = (i, animate) => {
    const b = tabs[i];
    if (animate) {
      sx.to(b.offsetLeft, { damping: 1, response: 0.35 });
      sw.to(b.offsetWidth, { damping: 1, response: 0.35 });
    } else { sx.set(b.offsetLeft); sw.set(b.offsetWidth); }
  };

  const select = (i, focus) => {
    if (i === current) return;
    current = i;
    tabs.forEach((t, k) => { t.setAttribute('aria-selected', String(k === i)); t.tabIndex = k === i ? 0 : -1; });
    if (focus) tabs[i].focus();
    tabs[i].scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: reduceMotion.matches ? 'auto' : 'smooth' });
    place(i, true);
    panel.setAttribute('data-swapping', '');
    clearTimeout(swapTimer);
    swapTimer = setTimeout(() => {
      from.textContent = STAGES[i][0];
      text.textContent = STAGES[i][1];
      panel.removeAttribute('data-swapping');
    }, 160);
  };

  tabs.forEach((t, i) => {
    t.tabIndex = i === 0 ? 0 : -1;
    // Respond on press, not release.
    t.addEventListener('pointerdown', (e) => { if (e.button === 0) select(i); });
    t.addEventListener('click', () => select(i));
  });
  seg.addEventListener('keydown', (e) => {
    const d = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
    if (e.key === 'Home') { e.preventDefault(); select(0, true); }
    else if (e.key === 'End') { e.preventDefault(); select(tabs.length - 1, true); }
    else if (d) { e.preventDefault(); select((current + d + tabs.length) % tabs.length, true); }
  });

  from.textContent = STAGES[0][0];
  text.textContent = STAGES[0][1];
  const init = () => place(current, false);
  document.fonts?.ready.then(init);
  init();
  addEventListener('resize', init);
}

/* ------------------------------------------------------------------ */
/* Project sheet: modal, drag-to-dismiss with projection               */
/* ------------------------------------------------------------------ */

const PROJECTS = {
  semantic: {
    meta: 'AI / ML · Documents → meaning',
    title: 'Semantic Data Navigator',
    img: './assets/apple/semantic.webp',
    text: 'Semantic document search that answers questions from your files and shows a t-SNE view of the embeddings behind each answer, so you can see why a result was chosen.',
    stack: ['LangChain', 'ChromaDB', 'Gradio', 't-SNE'],
    url: 'https://github.com/ishank-dev/semantic-data-navigator/tree/main',
  },
  ai: {
    meta: 'AI / ML · Input → layers → output',
    title: 'AI experiments, from the ground up',
    img: './assets/apple/ai-experiments.webp',
    text: 'Custom neural networks, optimizer and hyperparameter experiments, and image classification on CIFAR-100. Built while studying the fundamentals rather than reaching for a framework default.',
    stack: ['PyTorch', 'NumPy', 'CNNs', 'MLPs'],
    url: 'https://github.com/ishank-dev/AI-Agents',
  },
  firebolt: {
    meta: 'Data engineering · Millions of points, one map',
    title: 'Firebolt Geospatial Analytics',
    img: './assets/apple/firebolt.webp',
    text: 'Exploring millions of accident records through maps, clusters, heatmaps and interactive filters, with queries fast enough to keep exploration conversational.',
    stack: ['Firebolt', 'Flask', 'Mapbox', 'Python'],
    url: 'https://github.com/ishank-dev/firebolt-demo/tree/main/geospatial-application-demo',
  },
  mock: {
    meta: 'Backend systems · Request → mock → response',
    title: 'Mock Server Framework',
    img: './assets/apple/mock-server.webp',
    text: 'A lightweight API prototyping server with CRUD operations, filtering, search and JSON persistence, so front-end work never waits on a backend.',
    stack: ['Node.js', 'Express', 'REST'],
    url: 'https://github.com/ishank-dev/NodeJS-MockServer',
  },
  beats: {
    meta: 'Backend systems · Smart India Hackathon winner',
    title: 'Police Beats Allocation',
    img: './assets/apple/beats.webp',
    text: 'Tools for digitizing police operations, built for the National Crime Records Bureau: officer tracking, beat zones, routes and alerts. Winner of the Smart India Hackathon with Team Avocado.',
    stack: ['Django REST', 'Mapbox', 'Firebase'],
    url: 'https://github.com/On-Duty-Org/Beats-Allocation-SIH',
  },
};

function initSheet() {
  const sheet = document.querySelector('[data-sheet]');
  const scrim = document.querySelector('[data-scrim]');
  const body = document.querySelector('[data-sheet-body]');
  const closeBtn = document.querySelector('[data-sheet-close]');
  const background = [document.querySelector('main'), document.querySelector('[data-nav]'), document.querySelector('footer')];
  const $ = (s) => sheet.querySelector(s);
  let H = 1, isOpen = false, opener = null;

  const render = (y) => {
    sheet.style.transform = `translate3d(0,${y}px,0)`;
    scrim.style.opacity = String(Math.max(0, Math.min(1, 1 - y / H)));
  };
  const spring = new Spring(0, render);

  const fill = (p) => {
    $('[data-sheet-img]').src = p.img;
    $('[data-sheet-meta]').textContent = p.meta;
    $('[data-sheet-title]').textContent = p.title;
    $('[data-sheet-text]').textContent = p.text;
    $('[data-sheet-stack]').replaceChildren(...p.stack.map((s) => Object.assign(document.createElement('li'), { textContent: s })));
    $('[data-sheet-link]').href = p.url;
  };

  const open = (key, from) => {
    fill(PROJECTS[key]);
    opener = from;
    const wasHidden = sheet.hidden;
    sheet.hidden = scrim.hidden = false;
    H = sheet.offsetHeight + 24;
    if (wasHidden) spring.set(H); // start below the fold; otherwise continue from wherever it is
    isOpen = true;
    body.scrollTop = 0;
    document.documentElement.style.overflow = 'hidden';
    background.forEach((el) => (el.inert = true));
    spring.to(0, { damping: 1, response: 0.4 });
    closeBtn.focus({ preventScroll: true });
  };

  const close = (velocity = 0) => {
    if (!isOpen) return;
    isOpen = false;
    background.forEach((el) => (el.inert = false));
    document.documentElement.style.overflow = '';
    spring.to(H, {
      velocity, damping: 1, response: 0.35,
      onRest: () => { if (!isOpen) { sheet.hidden = scrim.hidden = true; } },
    });
    opener?.focus({ preventScroll: true });
  };

  document.querySelectorAll('[data-project]').forEach((card) =>
    card.addEventListener('click', () => open(card.dataset.project, card)));
  closeBtn.addEventListener('click', () => close());
  scrim.addEventListener('click', () => close());
  document.addEventListener('keydown', (e) => {
    if (!isOpen) return;
    if (e.key === 'Escape') close();
    if (e.key === 'Tab') { // keep focus inside the dialog
      const f = [...sheet.querySelectorAll('a[href], button')];
      const first = f[0], last = f.at(-1);
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });

  // Content can scroll natively once it's off the top; at the top, a downward drag moves the sheet.
  const syncTouch = () => (body.style.touchAction = body.scrollTop > 0 ? 'pan-y' : 'none');
  body.addEventListener('scroll', syncTouch, { passive: true });
  syncTouch();

  let g = null;
  sheet.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || !isOpen || e.target.closest('[data-sheet-close]')) return;
    spring.stop(); // grab it mid-flight
    g = { id: e.pointerId, y0: e.clientY, x0: e.clientX, base: spring.value, phase: 'pending', samples: [], scroll0: body.scrollTop, touch: e.pointerType !== 'mouse' };
  });
  sheet.addEventListener('pointermove', (e) => {
    if (!g || e.pointerId !== g.id) return;
    const dy = e.clientY - g.y0, dx = e.clientX - g.x0;
    if (g.phase === 'pending') {
      if (Math.abs(dy) > SLOP && Math.abs(dy) > Math.abs(dx)) {
        const atTop = body.scrollTop <= 0;
        if (dy > 0 && atTop) g.phase = 'drag';
        else if (dy < 0 && atTop && g.touch) g.phase = 'scroll';
        else g.phase = 'ignore';
        if (g.phase !== 'ignore') {
          sheet.setPointerCapture(e.pointerId);
          g.y0 = e.clientY;            // track from here, keeping the grab offset (no jump after the slop)
          g.base = spring.value;
          g.scroll0 = body.scrollTop;
        }
      } else if (Math.abs(dx) > SLOP) g.phase = 'ignore';
      return;
    }
    if (g.phase === 'scroll') { body.scrollTop = g.scroll0 - dy; return; }
    if (g.phase !== 'drag') return;
    const raw = g.base + (e.clientY - g.y0);
    spring.set(raw < 0 ? -rubberband(-raw, H) : raw);
    g.samples.push({ p: e.clientY, t: e.timeStamp });
    if (g.samples.length > 20) g.samples.shift();
  });
  const end = (e) => {
    if (!g || e.pointerId !== g.id) return;
    const gesture = g; g = null;
    if (gesture.phase !== 'drag') { if (spring.value !== 0 && isOpen) spring.to(0); return; }
    const v = e.type === 'pointercancel' ? 0 : velocityOf(gesture.samples);
    const projected = spring.value + project(v, 0.99);
    // Decide with the projection (where the flick is going), not the release point.
    if (projected > H * 0.5 && v > -50) close(v);
    else spring.to(0, { velocity: v, damping: Math.abs(v) > 300 ? 0.8 : 1, response: 0.3 });
  };
  sheet.addEventListener('pointerup', end);
  sheet.addEventListener('pointercancel', end);
}

/* ------------------------------------------------------------------ */

initReveal();
initNav();
initRail();
initSegmented();
initSheet();
