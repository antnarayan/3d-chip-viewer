// A true-scale micron ruler along two edges of the die, lying on the substrate
// plane. Chip x runs along glTF x and chip y along glTF -z, both from 0.

import * as THREE from "three";
import { CSS2DObject } from "three/addons/renderers/CSS2DRenderer.js";
import { minorDivisions, niceStep } from "./motion.js";

export function createRuler(width, height) {
  const major = niceStep(Math.max(width, height) / 5); // about five labels per edge
  const perMajor = minorDivisions(major);
  const minor = major / perMajor;
  const offset = major * 0.15; // just outside the die edge
  const longTick = major * 0.12;
  const shortTick = longTick * 0.5;

  const points = [];
  const labels = [];
  const label = (text, x, z) => {
    const el = document.createElement("div");
    el.className = "ruler-label";
    el.textContent = text;
    const obj = new CSS2DObject(el);
    obj.position.set(x, 0, z);
    labels.push(obj);
  };

  // Along chip x, just below the die (chip y = -offset, so glTF z = +offset).
  points.push(0, 0, offset, width, 0, offset);
  for (let i = 0; i * minor <= width + 1e-9; i++) {
    const x = i * minor;
    const isMajor = i % perMajor === 0;
    points.push(x, 0, offset, x, 0, offset + (isMajor ? longTick : shortTick));
    if (isMajor) label(String(+x.toPrecision(6)), x, offset + longTick * 2.6);
  }
  // Along chip y, just left of the die (chip x = -offset).
  points.push(-offset, 0, 0, -offset, 0, -height);
  for (let i = 0; i * minor <= height + 1e-9; i++) {
    const y = i * minor;
    const isMajor = i % perMajor === 0;
    points.push(-offset, 0, -y, -offset - (isMajor ? longTick : shortTick), 0, -y);
    if (isMajor && i > 0) label(String(+y.toPrecision(6)), -offset - longTick * 2.6, -y);
  }
  label("µm", -offset - longTick * 2.6, offset + longTick * 2.6);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
  const material = new THREE.LineBasicMaterial();
  const group = new THREE.Group();
  group.add(new THREE.LineSegments(geometry, material), ...labels);

  function setVisible(on) {
    group.visible = on;
    for (const obj of labels) obj.visible = on; // CSS labels are DOM elements; hide them explicitly
  }

  return { group, material, major, setVisible };
}
