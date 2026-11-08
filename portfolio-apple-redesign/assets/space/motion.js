// Play/pause state for the space backdrop. The flight readout's pause button proxies this hidden button,
// and every scene script watches html[data-motion]. Reduced motion starts paused and disables the control.
const root = document.documentElement;
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const button = document.getElementById('motion-toggle');
let playing = !reduced.matches;

function update() {
  root.dataset.motion = playing ? 'playing' : 'paused';
  if (!button) return;
  button.textContent = reduced.matches ? 'Motion reduced' : playing ? 'Pause motion' : 'Play motion';
  button.disabled = reduced.matches;
}

button?.addEventListener('click', () => { playing = !playing; update(); });
reduced.addEventListener('change', () => { playing = !reduced.matches; update(); });
update();

// Production also pauses on hidden tabs and runs the project illustrations only while they're on screen.
const syncTab = () => { root.dataset.tabHidden = String(document.hidden); };
document.addEventListener('visibilitychange', syncTab);
syncTab();
const seen = new IntersectionObserver(entries => entries.forEach(e => { e.target.dataset.inView = String(e.isIntersecting); }));
document.querySelectorAll('.project-motion').forEach(el => seen.observe(el));
