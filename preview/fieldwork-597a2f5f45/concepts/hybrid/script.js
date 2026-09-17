import { motionControl } from '../fieldwork/motion.mjs?v=field-notes-1';
import { filterProjects, contactDraft } from './interactions.mjs?v=1';

const root = document.documentElement;
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const motionButton = document.getElementById('motion-toggle');
let playing = !reduced.matches;
function updateMotion() {
  const state = motionControl(playing, false, reduced.matches);
  root.dataset.motion = playing ? 'playing' : 'paused';
  motionButton.textContent = state.label;
  motionButton.disabled = state.disabled;
}
motionButton.hidden = false;
motionButton.addEventListener('click', () => { playing = !playing; updateMotion(); });
reduced.addEventListener('change', () => { playing = !reduced.matches; updateMotion(); });
document.addEventListener('visibilitychange', () => { root.dataset.tabHidden = String(document.hidden); });
root.dataset.tabHidden = String(document.hidden);
updateMotion();
const observer = new IntersectionObserver(entries => entries.forEach(entry => {
  entry.target.dataset.inView = String(entry.isIntersecting);
}));
document.querySelectorAll('.problem-playground,.work-visual').forEach(element => observer.observe(element));

const items = [...document.querySelectorAll('[data-project]')].map(element => ({ id: element.id, category: element.dataset.category, element }));
const filters = [...document.querySelectorAll('[data-project-filter]')];
const filterStatus = document.getElementById('project-filter-status');
document.querySelector('.project-filters').hidden = false;
filters.forEach(button => button.addEventListener('click', () => {
  const selected = filterProjects(items, button.dataset.projectFilter);
  const visible = new Set(selected.map(item => item.id));
  items.forEach(item => { item.element.hidden = !visible.has(item.id); });
  filters.forEach(filter => filter.setAttribute('aria-pressed', String(filter === button)));
  filterStatus.textContent = `${selected.length} ${selected.length === 1 ? 'project' : 'projects'}${button.dataset.projectFilter === 'all' ? ' in the collection' : ' in ' + button.textContent.trim()}`;
}));

const form = document.getElementById('contact-form');
form.addEventListener('submit', event => {
  event.preventDefault();
  if (!form.reportValidity()) return;
  const data = Object.fromEntries(new FormData(form));
  document.getElementById('draft-status').textContent = 'Opening your email app. Your draft stays here if it doesn’t open; you can also email ishankdev@gmail.com directly.';
  window.location.href = contactDraft(data);
});
document.getElementById('draft-button').disabled = false;
