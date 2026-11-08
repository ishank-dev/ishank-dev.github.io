// Links between the page and the sky behind it. universe.js does the drawing; this file only notices what the visitor
// does and tells it, through window events:
//   sky:jump           a nav link became a hyperspace jump      { phase: 'start' | 'end' }
//   sky:flare          a career or award beacon just ignited    { element, place(rect) -> [x, y], tone, size }
//   sky:constellation  a project card was hovered or focused    { element, index, on }
// Everything here steps aside for reduced motion; the jump also steps aside while motion is paused.

const root = document.documentElement;
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const emit = (name, detail) => window.dispatchEvent(new CustomEvent(name, { detail }));
const skyOn = () => root.dataset.universe === 'on';

/* ---- Hyperspace jumps: long in-page link hops become one deliberate warp ---- */
const ease = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
let jump = null;

function endJump(target, id) {
  if (!jump) return;
  cancelAnimationFrame(jump.raf); clearTimeout(jump.timer);
  removeEventListener('wheel', jump.cancel); removeEventListener('touchstart', jump.cancel); removeEventListener('keydown', jump.cancel);
  jump = null;
  emit('sky:jump', { phase: 'end' });
  if (target) {
    history.pushState(null, '', `#${id}`);
    // Move focus as a native anchor jump would, without scrolling again.
    if (!target.matches('a, button, input, select, textarea, [tabindex]')) target.setAttribute('tabindex', '-1');
    target.focus({ preventScroll: true });
  }
}

document.addEventListener('click', event => {
  const link = event.target.closest('a[href^="#"]');
  if (!link || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const id = decodeURIComponent(link.getAttribute('href').slice(1));
  const target = id && id !== 'main' ? document.getElementById(id) : null;   // the skip link keeps its native jump
  if (!target || !skyOn() || reduced.matches || root.dataset.motion === 'paused') return;
  const pad = parseFloat(getComputedStyle(root).scrollPaddingTop) || 0;
  const max = root.scrollHeight - innerHeight;
  const from = scrollY, to = Math.max(0, Math.min(max, target.getBoundingClientRect().top + scrollY - pad));
  const distance = to - from;
  if (Math.abs(distance) < innerHeight * 1.1) return;   // short hops stay a plain smooth scroll
  event.preventDefault();
  if (jump) endJump();
  const duration = Math.min(1700, Math.max(950, 700 + Math.abs(distance) / innerHeight * 95));
  const start = performance.now();
  jump = { raf: 0, cancel: () => endJump() };   // the visitor taking over the scroll ends the jump where it is
  addEventListener('wheel', jump.cancel, { passive: true, once: true });
  addEventListener('touchstart', jump.cancel, { passive: true, once: true });
  addEventListener('keydown', jump.cancel, { once: true });
  emit('sky:jump', { phase: 'start' });
  const step = now => {
    const t = Math.min(1, (now - start) / duration);
    scrollTo({ top: from + distance * ease(t), behavior: 'instant' });
    if (t < 1) jump.raf = requestAnimationFrame(step);
    else endJump(target, id);
  };
  jump.raf = requestAnimationFrame(step);
  // If frames stall (a throttled or backgrounded tab), still arrive: the click must never be swallowed.
  jump.timer = setTimeout(() => { scrollTo({ top: to, behavior: 'instant' }); endJump(target, id); }, duration + 400);
});

/* ---- Beacons: as each career star or award star ignites on scroll, its light glints in the sky ---- */
const AMBER = [1, 0.74, 0.42], WHITE = [0.86, 0.9, 1];
const beacons = [
  ...[...document.querySelectorAll('.timeline li')].map((element, i) => ({
    element, tone: i === 0 ? AMBER : WHITE, size: i === 0 ? 46 : 34,
    place: r => [r.left + 4, r.top],                                   // the dot sits on the line's left end
  })),
  ...[...document.querySelectorAll('.awards li')].map((element, i) => {
    const mag = i === 0 ? 13 : i === 2 || i === 3 ? 6 : 9;            // matches the award star sizes in space.css
    return { element, tone: i === 0 ? AMBER : WHITE, size: 18 + mag * 3, place: r => [r.right - 32, r.top + 33.6] };
  }),
];
const fired = new WeakSet();
if (beacons.length) {
  const watch = new IntersectionObserver(entries => entries.forEach(entry => {
    const beacon = beacons.find(b => b.element === entry.target);
    if (entry.isIntersecting) {
      if (fired.has(entry.target) || reduced.matches || !skyOn()) return;
      fired.add(entry.target);
      emit('sky:flare', beacon);
    } else if (entry.boundingClientRect.top > innerHeight * 0.6) fired.delete(entry.target);   // re-arm once it is below again
  }), { rootMargin: '0px 0px -42% 0px', threshold: 0 });
  beacons.forEach(b => watch.observe(b.element));
}

/* ---- Constellations: hovering or focusing a project card draws an asterism around it ---- */
document.querySelectorAll('.work-grid-list .card').forEach((card, index) => {
  const set = on => () => emit('sky:constellation', { element: card, index, on });
  card.addEventListener('pointerenter', event => { if (event.pointerType !== 'touch') set(true)(); });
  card.addEventListener('pointerleave', set(false));
  card.addEventListener('focus', set(true));
  card.addEventListener('blur', set(false));
});
