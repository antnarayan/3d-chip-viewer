import { test } from "node:test";
import assert from "node:assert/strict";
import { minorDivisions, niceFloor, niceStep, settle } from "../src/motion.js";

test("settle reaches the target without overshooting", () => {
  const s = { x: 1, v: 0 };
  let peak = 1;
  let moving = true;
  for (let i = 0; i < 300 && moving; i++) {
    moving = settle(s, 10, 1 / 60, 0.3);
    peak = Math.max(peak, s.x);
  }
  assert.equal(moving, false);
  assert.equal(s.x, 10);
  assert.ok(peak <= 10, `no overshoot, peaked at ${peak}`);
});

test("settle is most of the way there after a few time constants", () => {
  const s = { x: 0, v: 0 };
  for (let t = 0; t < 0.9; t += 1 / 60) settle(s, 1, 1 / 60, 0.3);
  assert.ok(s.x > 0.75 && s.x < 1, `got ${s.x}`);
});

test("settle jumps under reduced motion", () => {
  const s = { x: 0, v: 3 };
  assert.equal(settle(s, 5, 1 / 60, 0.3, true), false);
  assert.deepEqual(s, { x: 5, v: 0 });
});

test("nice steps for ruler ticks", () => {
  assert.equal(niceStep(19.3), 20); // spm: 96.6 µm / 5
  assert.equal(niceStep(3.4), 5);
  assert.equal(niceStep(1.3), 1);
  assert.equal(niceStep(0.07), 0.05);
  assert.equal(niceStep(600), 500);
  assert.equal(niceStep(740), 1000); // nearest by ratio: ×1.35 up beats ×1.48 down
});

test("nice floor never exceeds the space", () => {
  assert.equal(niceFloor(19.3), 10);
  assert.equal(niceFloor(20), 20);
  assert.equal(niceFloor(4.99), 2);
  assert.equal(niceFloor(0.3), 0.2);
});

test("minor ticks divide major ticks evenly", () => {
  assert.equal(minorDivisions(20), 4); // every 5 µm
  assert.equal(minorDivisions(10), 5); // every 2 µm
  assert.equal(minorDivisions(50), 5); // every 10 µm
  assert.equal(minorDivisions(0.2), 4);
});
