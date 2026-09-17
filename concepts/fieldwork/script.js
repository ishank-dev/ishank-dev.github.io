'use strict';

const playground = document.querySelector('#playground');
const untangleButton = playground.querySelector('.untangle-button');
const caption = document.querySelector('#playground-caption');
const stageNote = playground.querySelector('.stage-note');
const signature = playground.querySelector('.diagram-signature');
const labels = playground.querySelectorAll('.floating-label');
const messyLabels = ['Real people', 'Legacy systems', 'A little AI', 'A lot of unknowns'];
const clearLabels = ['Customer context', 'Connected systems', 'Useful AI', 'A clear next step'];

untangleButton.addEventListener('click', () => {
  const clear = playground.classList.toggle('is-clear');
  untangleButton.setAttribute('aria-pressed', String(clear));
  untangleButton.firstChild.textContent = clear ? 'Back to the messy part ' : 'Make it make sense ';
  stageNote.textContent = clear ? 'A much better place to land' : 'A familiar starting point';
  signature.textContent = clear ? 'Context. Clear boundaries. A working system.' : 'There’s a system in here somewhere.';
  const dimensional = document.documentElement.dataset.view === '3d';
  caption.textContent = dimensional
    ? (clear ? 'Understand the pieces. Then connect them with intent.' : 'A little like my day job. Give it a click.')
    : (clear ? 'Discover → Frame → Build → Validate → Operate → Transfer.' : 'Real work starts with a few loose ends. Give it a click.');
  document.getElementById('art-desc').textContent = clear
    ? 'The scattered notes now form a connected FDE journey: Discover the need, Frame the outcome, Build in the real environment, Validate with users, Operate reliably, and Transfer ownership. Field feedback informs the next iteration.'
    : 'Scattered customer asks, people, data, legacy tools, risks, and ownership questions. Make it make sense arranges them into discovery, framing, building, validation, operations, and handoff.';
  labels.forEach((label, index) => { label.textContent = (clear ? clearLabels : messyLabels)[index]; });
});
