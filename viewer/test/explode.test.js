import { test } from "node:test";
import assert from "node:assert/strict";
import { createExplode, SPRING } from "../src/explode.js";

const DT = 1 / 60;

// Run the simulation for `seconds`, recording each layer's x every frame.
function run(ex, seconds, start = 0) {
  const frames = [];
  let now = start;
  for (let t = 0; t < seconds; t += DT) {
    now += DT;
    ex.step(DT, now);
    frames.push(ex.layers.map((l) => l.x));
  }
  return { frames, now };
}

test("a layer settles exactly on its target", () => {
  const ex = createExplode(1);
  ex.set(1, 0, { stagger: false });
  const { frames } = run(ex, 2);
  assert.equal(ex.layers[0].x, 1);
  assert.equal(ex.step(DT, 3), false); // nothing moving any more
  const peak = Math.max(...frames.map((f) => f[0]));
  assert.ok(peak > 1 && peak < 1.05, `small overshoot, got ${peak}`);
});

test("opening releases the top layer first", () => {
  const ex = createExplode(4);
  ex.set(1, 0);
  const { frames } = run(ex, 0.1);
  const startFrame = (i) => frames.findIndex((f) => f[i] > 0);
  assert.ok(startFrame(3) < startFrame(2));
  assert.ok(startFrame(2) < startFrame(1));
  assert.ok(startFrame(1) < startFrame(0));
  // each start is one stagger later than the previous
  assert.equal(ex.layers[0].pending, null);
});

test("closing releases the bottom layer first", () => {
  const ex = createExplode(4);
  ex.set(1, 0, { stagger: false });
  let { now } = run(ex, 3);
  ex.set(0, now);
  const { frames } = run(ex, 0.1, now);
  const leaveFrame = (i) => frames.findIndex((f) => f[i] < 1);
  assert.ok(leaveFrame(0) < leaveFrame(1));
  assert.ok(leaveFrame(1) < leaveFrame(2));
  assert.ok(leaveFrame(2) < leaveFrame(3));
});

test("a quick reversal sends back only what left, at once", () => {
  const ex = createExplode(4);
  ex.set(1, 0);
  // Stop just after the second layer from the top has been released.
  let { now } = run(ex, SPRING.stagger * 1.5);
  assert.equal(ex.layers[3].target, 1);
  assert.equal(ex.layers[2].target, 1);
  assert.equal(ex.layers[1].target, 0); // still waiting to leave
  ex.set(0, now);
  assert.equal(ex.layers[1].pending, null); // forgot it was ever going
  assert.equal(ex.layers[0].pending, null);
  // The two that left come back; the higher one (out first) is scheduled second.
  assert.equal(ex.layers[2].pending.at, now);
  assert.equal(ex.layers[3].pending.at, now + SPRING.stagger);
  run(ex, 3, now);
  assert.deepEqual(ex.layers.map((l) => l.x), [0, 0, 0, 0]);
});

test("layers never pass through each other while opening", () => {
  // The viewer lifts layer i by i·gap·x. A higher layer must always be lifted
  // at least as far as the one below it, or it would sink into it.
  const ex = createExplode(16);
  ex.set(1, 0);
  const { frames } = run(ex, 3);
  for (const f of frames) {
    for (let i = 1; i < f.length; i++) assert.ok(i * f[i] >= (i - 1) * f[i - 1] - 1e-9);
  }
});

test("reduced motion jumps straight to the target", () => {
  const ex = createExplode(3);
  ex.set(1, 0);
  assert.equal(ex.step(DT, 0, true), false);
  assert.deepEqual(ex.layers.map((l) => l.x), [1, 1, 1]);
});

test("phase reads where the layers are", () => {
  const ex = createExplode(2);
  assert.equal(ex.phase(), "assembled");
  ex.set(1, 0);
  ex.step(DT, DT);
  assert.equal(ex.phase(), "taking apart");
  run(ex, 3, DT);
  assert.equal(ex.phase(), "apart");
  ex.set(0, 10);
  ex.step(DT, 10 + DT);
  assert.equal(ex.phase(), "closing up");
  ex.set(0.5, 20, { stagger: false });
  run(ex, 3, 20);
  assert.equal(ex.phase(), "partly apart");
});

test("phase keeps saying 'taking apart' through the overshoot", () => {
  const ex = createExplode(3);
  ex.set(1, 0);
  let now = 0;
  let sawOvershoot = false;
  while (ex.step(DT, (now += DT))) {
    if (ex.layers.some((l) => l.x > 1)) sawOvershoot = true;
    assert.equal(ex.phase(), "taking apart");
  }
  assert.ok(sawOvershoot);
  assert.equal(ex.phase(), "apart");
});
