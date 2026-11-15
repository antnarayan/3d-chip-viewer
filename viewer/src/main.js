import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { createExplode } from "./explode.js";

const MODEL_URL = "/models/spm.glb";
const EXPLODE_HEIGHT = 0.35; // fully apart, the top layer rises this fraction of the die width

const canvas = document.getElementById("stage");
const statusEl = document.getElementById("status");
const layersEl = document.getElementById("layers");
const zSlider = document.getElementById("zscale");
const zOut = document.getElementById("zout");
const xSlider = document.getElementById("explode");
const xOut = document.getElementById("xout");
const toggle = document.getElementById("toggle");
const readout = document.getElementById("readout");
const still = window.matchMedia("(prefers-reduced-motion: reduce)");

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x15161a);

// Soft light from all around plus one "sun" so each face direction gets its own shade.
scene.add(new THREE.HemisphereLight(0xffffff, 0x404048, 1.6));
const sun = new THREE.DirectionalLight(0xffffff, 2.2);
sun.position.set(-1, 2, 1.5);
scene.add(sun);

const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 5000);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;

const chip = new THREE.Group();
scene.add(chip);

let meshes = []; // bottom layer first, as in the file
let explode = null; // springs, one per layer
let gap = 0; // µm each layer step lifts when fully apart
let zScale = 1;

// Render on demand: draw only while the camera or the springs are moving.
let frame = 0;
let last = 0;
function requestRender() {
  if (!frame) frame = requestAnimationFrame(render);
}
function render(ms) {
  frame = 0;
  const now = ms / 1000;
  // Time-based motion: dt from real timestamps, capped so a background tab doesn't jump.
  const dt = last ? Math.min(now - last, 1 / 30) : 1 / 60;
  last = now;

  let moving = controls.update(); // true while damping is still settling
  if (explode) {
    moving = explode.step(dt, now, still.matches) || moving;
    placeLayers();
    showPhase();
  }
  renderer.render(scene, camera);
  if (moving) requestRender();
  else last = 0;
}
controls.addEventListener("change", requestRender);

// Each layer keeps its geometry at true height; z-exaggeration scales it about
// the substrate (y = 0) and the explode lifts it by whole steps of `gap`.
// Lifting is in true µm, so taking it apart looks the same at any z scale.
function placeLayers() {
  meshes.forEach((mesh, i) => {
    mesh.scale.y = zScale;
    mesh.position.y = i * gap * explode.layers[i].x;
  });
}

let lastPhase = "";
function showPhase() {
  const phase = explode.phase();
  if (phase === lastPhase) return; // write only on change, so screen readers aren't flooded
  lastPhase = phase;
  readout.textContent = phase === "apart" ? `apart · ${meshes.length} layers` : phase;
  const goingApart = phase === "apart" || phase === "taking apart";
  toggle.setAttribute("aria-pressed", String(goingApart));
  toggle.firstChild.textContent = goingApart ? "Put together " : "Take apart ";
}

function resize() {
  const { clientWidth: w, clientHeight: h } = canvas;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  requestRender();
}
window.addEventListener("resize", resize);
resize();

function frameModel(box) {
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3()).length();
  controls.target.copy(center);
  // Back off until the box's bounding sphere fits the narrower of the two
  // fields of view (horizontal is the narrow one on a tall, phone-shaped screen).
  const vfov = THREE.MathUtils.degToRad(camera.fov);
  const hfov = 2 * Math.atan(Math.tan(vfov / 2) * camera.aspect);
  const distance = (1.05 * size) / 2 / Math.sin(Math.min(vfov, hfov) / 2);
  // Look from the front-left, about 35° above the die.
  const direction = new THREE.Vector3(-0.55, 0.55, 0.75).normalize();
  camera.position.copy(center).addScaledVector(direction, distance);
  camera.near = size / 1000;
  camera.far = size * 20;
  camera.updateProjectionMatrix();
  controls.update();
}

function buildLayerPanel() {
  layersEl.replaceChildren();
  // The file lists layers bottom first; show the top of the stack at the top.
  for (const mesh of [...meshes].reverse()) {
    const info = mesh.userData;
    const li = document.createElement("li");
    li.innerHTML = `
      <label title="GDS ${info.gds?.join("/") ?? "?"} · ${info.polygons ?? "?"} polygons">
        <input type="checkbox" checked />
        <span class="swatch"></span>
        <span class="name"></span>
        <span class="z"></span>
      </label>`;
    li.querySelector(".swatch").style.background = `#${mesh.material.color.getHexString()}`;
    li.querySelector(".name").textContent = mesh.name;
    li.querySelector(".z").textContent = info.z_um != null ? `${info.z_um.toFixed(2)} µm` : "";
    li.querySelector("input").addEventListener("change", (e) => {
      mesh.visible = e.target.checked;
      requestRender();
    });
    layersEl.append(li);
  }
}

zSlider.addEventListener("input", () => {
  zScale = Number(zSlider.value);
  zOut.textContent = `${zScale}×`;
  if (explode) placeLayers();
  requestRender();
});

// The slider moves all layers together (each still on its spring);
// the button and Space take the stack apart one layer after another.
xSlider.addEventListener("input", () => {
  if (!explode) return;
  const value = Number(xSlider.value);
  explode.set(value, performance.now() / 1000, { stagger: false });
  xOut.textContent = `${Math.round(value * 100)}%`;
  requestRender();
});

function toggleApart() {
  if (!explode) return;
  const top = explode.layers[explode.layers.length - 1];
  const target = (top.pending ? top.pending.value : top.target) > 0.5 ? 0 : 1;
  explode.set(target, performance.now() / 1000);
  xSlider.value = String(target);
  xOut.textContent = `${target * 100}%`;
  requestRender();
}
toggle.addEventListener("click", toggleApart);

window.addEventListener("keydown", (e) => {
  // Space toggles unless a control has focus (a focused button or checkbox handles Space itself).
  if (e.code !== "Space" || e.target.closest("input, button, select, textarea")) return;
  e.preventDefault();
  toggleApart();
});

new GLTFLoader().load(
  MODEL_URL,
  (gltf) => {
    chip.add(gltf.scene);
    gltf.scene.traverse((o) => { if (o.isMesh) meshes.push(o); });
    buildLayerPanel();

    const box = new THREE.Box3().setFromObject(chip);
    const die = box.getSize(new THREE.Vector3()); // glTF z = chip y
    statusEl.textContent = `${meshes.length} layers · ${die.x.toFixed(1)} × ${die.z.toFixed(1)} µm`;
    gap = (EXPLODE_HEIGHT * die.x) / (meshes.length - 1);
    box.max.y += gap * (meshes.length - 1); // frame for the stack fully apart, so nothing leaves the view
    frameModel(box);
    explode = createExplode(meshes.length);
    showPhase();
    requestRender();
  },
  (progress) => {
    if (progress.total) statusEl.textContent = `Loading model… ${Math.round((100 * progress.loaded) / progress.total)}%`;
  },
  (error) => {
    statusEl.textContent = "Could not load the model. Run: npm run model";
    console.error(error);
  },
);
