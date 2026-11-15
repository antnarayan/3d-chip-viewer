// Small numeric helpers for calm motion and readable scales.
// Pure functions (no Three.js) so they can be unit-tested with `node --test`.

// Critically damped spring on state = { x, v }: arrives at the target as fast
// as possible without overshooting, and its speed changes smoothly too, so a
// slider drag never makes the model jump. `seconds` is the time constant.
// Returns true while still moving. (Anatomy's `settle`, MIT.)
export function settle(state, target, dt, seconds, calm = false) {
  if (calm) {
    state.x = target;
    state.v = 0;
    return false;
  }
  const w = 1 / seconds;
  const h = dt / 4;
  for (let i = 0; i < 4; i++) {
    state.v += (w * w * (target - state.x) - 2 * w * state.v) * h;
    state.x += state.v * h;
  }
  const scale = Math.max(1, Math.abs(target));
  if (Math.abs(target - state.x) < 1e-4 * scale && Math.abs(state.v) < 1e-4 * scale) {
    state.x = target;
    state.v = 0;
    return false;
  }
  return true;
}

const MANTISSAS = [1, 2, 5];

function candidates(x) {
  const k = Math.floor(Math.log10(x));
  return [k - 1, k, k + 1].flatMap((e) => MANTISSAS.map((m) => m * 10 ** e));
}

// Round to the nearest "nice" step (1, 2 or 5 times a power of ten), as ruler ticks use.
export function niceStep(x) {
  return candidates(x).reduce((best, c) => (Math.abs(Math.log(c / x)) < Math.abs(Math.log(best / x)) ? c : best));
}

// The largest nice step that is not more than x, for a scale bar that must fit a space.
export function niceFloor(x) {
  return Math.max(...candidates(x).filter((c) => c <= x * (1 + 1e-9)));
}

// Minor ticks per major tick: a 2-step splits into quarters (0.5s), others into fifths.
export function minorDivisions(step) {
  return Math.round(step / 10 ** Math.floor(Math.log10(step))) === 2 ? 4 : 5;
}
