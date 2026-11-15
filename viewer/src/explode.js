// Exploded view: one spring per layer, released one after another.
// Pure logic (no Three.js) so it can be unit-tested with `node --test`.
// The spring constants and the stagger order follow Anatomy's Raptor engine
// explode (github.com/wheresryan22/anatomy, MIT).

export const SPRING = {
  stiffness: 64, // pull toward the target (1/s²)
  damping: 14.2, // just under critical (2·√64 = 16): settles with a hint of overshoot
  substeps: 4, // smaller integration steps per frame keep the spring stable
  stagger: 0.035, // seconds between one layer starting and the next
};

const SETTLE = 5e-4; // snap to the target once position error and speed are both this small

// Each layer has a spring value x: 0 = in place, 1 = fully apart.
// A pending target waits until its start time, which is how the stagger works.
export function createExplode(count, spring = SPRING) {
  const layers = Array.from({ length: count }, () => ({ x: 0, v: 0, target: 0, pending: null }));

  // Where a layer is headed once any pending change kicks in.
  const headingTo = (layer) => (layer.pending ? layer.pending.value : layer.target);

  // Direction of the latest change, recorded when it's made. Reading it from
  // positions instead would flip during the spring's small overshoot past 1.
  let opening = false;

  function set(target, now, { stagger = true } = {}) {
    const top = headingTo(layers[count - 1]);
    if (target !== top) opening = target > top;
    if (!stagger) {
      for (const layer of layers) {
        layer.target = target;
        layer.pending = null;
      }
      return;
    }
    // Opening: the top layer leaves first, since everything else sits under it.
    // Closing: the bottom layer returns first, so the stack folds back from below.
    const order = opening ? [...layers].reverse() : layers;

    // A layer that hasn't started yet just forgets its pending change. Only
    // layers whose destination actually changes get a slot in the stagger, so
    // on a reversal the last one out is the first one back, with no delay.
    for (const layer of layers) layer.pending = null;
    let rank = 0;
    for (const layer of order) {
      if (layer.target === target) continue;
      layer.pending = { value: target, at: now + rank * spring.stagger };
      rank += 1;
    }
  }

  // Advance by dt seconds at clock time now. Returns true while anything is still moving.
  // calm = prefers-reduced-motion: jump straight to the targets.
  function step(dt, now, calm = false) {
    let moving = false;
    const h = dt / spring.substeps;
    for (const layer of layers) {
      if (layer.pending && (calm || now >= layer.pending.at)) {
        layer.target = layer.pending.value;
        layer.pending = null;
      }
      if (calm) {
        layer.x = layer.target;
        layer.v = 0;
      } else {
        for (let i = 0; i < spring.substeps; i++) {
          const accel = spring.stiffness * (layer.target - layer.x) - spring.damping * layer.v;
          layer.v += accel * h;
          layer.x += layer.v * h;
        }
        if (Math.abs(layer.target - layer.x) < SETTLE && Math.abs(layer.v) < SETTLE) {
          layer.x = layer.target;
          layer.v = 0;
        }
      }
      if (layer.pending || layer.x !== layer.target || layer.v !== 0) moving = true;
    }
    return moving;
  }

  // A word for the readout, taken from where the layers are, not where they're going.
  function phase() {
    const moving = layers.some((l) => l.pending || l.x !== l.target || l.v !== 0);
    if (moving) return opening ? "taking apart" : "closing up";
    if (layers.every((l) => l.x === 0)) return "assembled";
    if (layers.every((l) => l.x === 1)) return "apart";
    return "partly apart";
  }

  return { layers, set, step, phase };
}
