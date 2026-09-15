export function presentation(search, reducedMotion) {
  const dimensional = new URLSearchParams(search).get('view') !== '2d';
  return { dimensional, playing: dimensional && !reducedMotion };
}
export function advanceMorph(current, target, delta, instant) {
  if (instant) return target;
  const step = Math.max(0, delta) / 1.2;
  return current < target ? Math.min(target, current + step) : Math.max(target, current - step);
}
