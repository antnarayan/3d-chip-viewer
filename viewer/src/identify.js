// Turning a click into words: which layer, where on the die, its real dimensions.
// Pure functions (no Three.js) so they can be unit-tested with `node --test`.

// glTF is y-up; the converter rotated chip (x, y, z) to (x, z, -y).
// A point on the die in glTF space maps back to chip microns as (x, -z).
export function chipXY(point) {
  return { x: point.x, y: -point.z };
}

const um = (value) => `${value.toFixed(3)} µm`;

// Rows for the info card, from the metadata the converter wrote into each mesh
// (layermap.json's true values, not the exaggerated or exploded view).
export function describeLayer(info, point = null) {
  const rows = [
    ["GDS", info.gds ? info.gds.join("/") : "?"],
    ["kind", info.kind ?? "?"],
    ["bottom", info.z_um != null ? um(info.z_um) : "?"],
    ["thickness", info.thickness_um != null ? um(info.thickness_um) : "?"],
    ["top", info.z_um != null && info.thickness_um != null ? um(info.z_um + info.thickness_um) : "?"],
    ["polygons", info.polygons != null ? info.polygons.toLocaleString("en-US") : "?"],
  ];
  if (point) {
    const { x, y } = chipXY(point);
    rows.push(["clicked at", `${x.toFixed(2)}, ${y.toFixed(2)} µm`]);
  }
  return { title: info.layer ?? "?", rows };
}

// Step the selection up or down the stack (index 0 = bottom), clamped at the ends.
// With nothing selected, Up starts at the bottom and Down at the top.
export function stepSelection(current, delta, count) {
  if (current == null) return delta > 0 ? 0 : count - 1;
  return Math.min(count - 1, Math.max(0, current + delta));
}
