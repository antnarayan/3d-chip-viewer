import { test } from "node:test";
import assert from "node:assert/strict";
import { chipXY, describeLayer, stepSelection } from "../src/identify.js";

const MET1 = { layer: "met1", gds: [68, 20], kind: "metal", z_um: 1.3761, thickness_um: 0.36, polygons: 4112 };

test("glTF point maps back to chip coordinates", () => {
  // chip (12.4, 30.15) at height 1.5 was written to glTF as (12.4, 1.5, -30.15)
  assert.deepEqual(chipXY({ x: 12.4, y: 1.5, z: -30.15 }), { x: 12.4, y: 30.15 });
});

test("card shows the layer's true dimensions", () => {
  const { title, rows } = describeLayer(MET1);
  assert.equal(title, "met1");
  assert.deepEqual(rows, [
    ["GDS", "68/20"],
    ["kind", "metal"],
    ["bottom", "1.376 µm"],
    ["thickness", "0.360 µm"],
    ["top", "1.736 µm"],
    ["polygons", "4,112"],
  ]);
});

test("card adds where you clicked", () => {
  const { rows } = describeLayer(MET1, { x: 12.4, y: 9.9, z: -30.15 });
  assert.deepEqual(rows.at(-1), ["clicked at", "12.40, 30.15 µm"]);
});

test("missing metadata shows '?' instead of breaking", () => {
  const { title, rows } = describeLayer({});
  assert.equal(title, "?");
  assert.ok(rows.every(([, value]) => value === "?"));
});

test("arrow keys walk the stack and stop at the ends", () => {
  assert.equal(stepSelection(null, +1, 16), 0); // Up from nothing: bottom layer
  assert.equal(stepSelection(null, -1, 16), 15); // Down from nothing: top layer
  assert.equal(stepSelection(7, +1, 16), 8);
  assert.equal(stepSelection(15, +1, 16), 15);
  assert.equal(stepSelection(0, -1, 16), 0);
});
