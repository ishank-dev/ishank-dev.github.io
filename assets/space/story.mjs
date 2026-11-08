// The hero's story, as data: six messy starting points become the six phases of forward deployed work.
// Each phase is one planet, innermost first: Mercury, Venus, Earth, Mars, Jupiter, Saturn.

export const PHASES = [
  { id: 'discover', messy: 'A vague ask', messyDetail: '“Can we add AI?”', clear: 'Discover', clearDetail: 'Find the real need', tone: '#e6ebff' },
  { id: 'frame', messy: 'People', messyDetail: 'Different priorities', clear: 'Frame', clearDetail: 'Agree what matters', tone: '#cbbdf2' },
  { id: 'build', messy: 'Legacy tools', messyDetail: 'Hidden dependencies', clear: 'Build', clearDetail: 'Fit the environment', tone: '#9fb3ff' },
  { id: 'validate', messy: 'Messy data', messyDetail: 'What can we trust?', clear: 'Validate', clearDetail: 'Prove it in real use', tone: '#e6ebff' },
  { id: 'operate', messy: 'Unknowns', messyDetail: 'What if it breaks?', clear: 'Operate', clearDetail: 'Recover. Improve.', tone: '#ffc9a3' },
  { id: 'transfer', messy: 'Who owns it?', messyDetail: 'Beyond the demo', clear: 'Transfer', clearDetail: 'A team can own it', tone: '#bfe0a6' },
];

export const COPY = {
  button: ['Make it make sense', 'Back to the messy part'],
  caption: ['A little like my day job. Give it a click.', 'Discover → Frame → Build → Validate → Operate → Transfer.'],
  footnote: ['The real brief is rarely a neat brief.', 'Learn in the field. Feed it back.'],
  hint: ['Press and hold the cloud to pull it together, or', 'Drag to tilt the system, or'],
  title: 'From a dust cloud to a working system',
  description: [
    'A dust cloud with six swarms drifting through it, each a messy starting point: a vague ask, people with different priorities, legacy tools, messy data, unknowns, and who owns it. A dull ember glows at the centre. Press and hold to pull it together.',
    'A star has ignited at the centre and six planets orbit it, from the innermost out: Discover, Frame, Build, Validate, Operate, Transfer. Drag to tilt the system.',
  ],
};

// Button, caption and footnote copy for either state, so the page and the tests agree on the words.
export function stateCopy(clear) {
  const i = clear ? 1 : 0;
  return { button: COPY.button[i], caption: COPY.caption[i], footnote: COPY.footnote[i], hint: COPY.hint[i], description: COPY.description[i] };
}
