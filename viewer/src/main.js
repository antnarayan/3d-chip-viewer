import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { createExplode } from "./explode.js";
import { describeLayer, stepSelection } from "./identify.js";

const MODEL_URL = "/models/spm.glb";
const EXPLODE_HEIGHT = 0.35; // fully apart, the top layer rises this fraction of the die width
const BACKGROUND = new THREE.Color(0x15161a);
const DIM = 0.75; // how far unselected layers fade toward the background
const CLICK_SLOP = 5; // px a press may move and still count as a click, not an orbit drag

const canvas = document.getElementById("stage");
const statusEl = document.getElementById("status");
const layersEl = document.getElementById("layers");
const zSlider = document.getElementById("zscale");
const zOut = document.getElementById("zout");
const xSlider = document.getElementById("explode");
const xOut = document.getElementById("xout");
const toggle = document.getElementById("toggle");
const readout = document.getElementById("readout");
const card = document.getElementById("card");
const still = window.matchMedia("(prefers-reduced-motion: reduce)");

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

const scene = new THREE.Scene();
scene.background = BACKGROUND;

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
let selected = null; // index into meshes, or null

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
  for (let i = meshes.length - 1; i >= 0; i--) {
    const mesh = meshes[i];
    const info = mesh.userData;
    const li = document.createElement("li");
    li.dataset.index = String(i);
    li.innerHTML = `
      <label title="Show or hide">
        <input type="checkbox" checked />
        <span class="swatch"></span>
      </label>
      <button type="button" class="name"></button>
      <span class="z"></span>`;
    li.querySelector(".swatch").style.background = `#${mesh.userData.baseColor.getHexString()}`;
    li.querySelector(".name").textContent = mesh.name;
    li.querySelector(".z").textContent = info.z_um != null ? `${info.z_um.toFixed(2)} µm` : "";
    li.querySelector("input").addEventListener("change", (e) => {
      mesh.visible = e.target.checked;
      requestRender();
    });
    li.querySelector(".name").addEventListener("click", () => select(selected === i ? null : i));
    layersEl.append(li);
  }
}

// Selection: the chosen layer keeps its color and glows slightly; every other
// layer fades toward the background, so the eye goes to the one that matters.
function select(index, point = null) {
  selected = index;
  meshes.forEach((mesh, i) => {
    const base = mesh.userData.baseColor;
    const on = index === i;
    mesh.material.color.copy(index == null || on ? base : base.clone().lerp(BACKGROUND, DIM));
    mesh.material.emissive.copy(on ? base : BACKGROUND).multiplyScalar(on ? 0.25 : 0);
  });
  for (const li of layersEl.children) li.classList.toggle("on", Number(li.dataset.index) === index);
  showCard(index == null ? null : meshes[index], point);
  requestRender();
}

function showCard(mesh, point) {
  card.hidden = !mesh;
  if (!mesh) return;
  const { title, rows } = describeLayer(mesh.userData, point);
  card.querySelector(".title").textContent = title;
  card.querySelector(".swatch").style.background = `#${mesh.userData.baseColor.getHexString()}`;
  const dl = card.querySelector("dl");
  dl.replaceChildren(...rows.flatMap(([label, value]) => {
    const dt = document.createElement("dt");
    const dd = document.createElement("dd");
    dt.textContent = label;
    dd.textContent = value;
    return [dt, dd];
  }));
}

// Click to identify. A press that moves more than a few pixels is an orbit
// drag, not a click. Raycasting tests every triangle under the pointer ray, so
// it runs on click only, never on hover.
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let downAt = null;
canvas.addEventListener("pointerdown", (e) => { downAt = e.button === 0 ? [e.clientX, e.clientY] : null; });
canvas.addEventListener("pointerup", (e) => {
  if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > CLICK_SLOP) return;
  const rect = canvas.getBoundingClientRect();
  pointer.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
  const [hit] = raycaster.intersectObjects(meshes.filter((m) => m.visible), false);
  select(hit ? meshes.indexOf(hit.object) : null, hit ? hit.point : null);
});

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
  if (e.key === "Escape") {
    select(null);
    return;
  }
  // The rest stay out of the way of focused controls (sliders use arrows, buttons use Space).
  if (e.target.closest("input, button, select, textarea") || !meshes.length) return;
  if (e.code === "Space") {
    e.preventDefault();
    toggleApart();
  } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
    e.preventDefault();
    select(stepSelection(selected, e.key === "ArrowUp" ? +1 : -1, meshes.length));
  }
});

new GLTFLoader().load(
  MODEL_URL,
  (gltf) => {
    chip.add(gltf.scene);
    gltf.scene.traverse((o) => { if (o.isMesh) meshes.push(o); });
    for (const mesh of meshes) mesh.userData.baseColor = mesh.material.color.clone();
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
