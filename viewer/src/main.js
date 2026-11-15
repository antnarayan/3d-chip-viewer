import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { CSS2DRenderer } from "three/addons/renderers/CSS2DRenderer.js";
import { createExplode } from "./explode.js";
import { describeLayer, stepSelection } from "./identify.js";
import { niceFloor, settle } from "./motion.js";
import { createRuler } from "./ruler.js";
import { ISO_DIR, PERSPECTIVE_DIR, createView } from "./view.js";

const MODEL_URL = `${import.meta.env.BASE_URL}models/spm.glb`; // BASE_URL is "/" locally, "/<repo>/" on Pages
const EXPLODE_HEIGHT = 0.35; // fully apart, the top layer rises this fraction of the die width
const DIM = 0.75; // how far unselected layers fade toward the background
const CLICK_SLOP = 5; // px a press may move and still count as a click, not an orbit drag
const Z_SETTLE = 0.25; // seconds: time constant for the z-exaggeration to follow its slider
const EDGE_ANGLE = 25; // degrees: draw an outline where neighbouring faces bend more than this
const EDGE_OPACITY = 0.55;
const SCALEBAR_PX = 120; // longest the scale bar may be

// Scene colors per theme; the CSS tokens in style.css hold the rest.
const THEMES = {
  dark: { background: 0x15161a, ink: 0xd8d8d2 },
  light: { background: 0xf3f2ee, ink: 0x2a2a2e },
};

const $ = (id) => document.getElementById(id);
const canvas = $("stage");
const panel = $("panel");
const statusEl = $("status");
const layersEl = $("layers");
const zSlider = $("zscale");
const xSlider = $("explode");
const toggle = $("toggle");
const readout = $("readout");
const card = $("card");
const scalebar = $("scalebar");
const still = window.matchMedia("(prefers-reduced-motion: reduce)");

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
const labelRenderer = new CSS2DRenderer();
labelRenderer.domElement.className = "label-layer";
document.body.insertBefore(labelRenderer.domElement, panel);

const background = new THREE.Color();
const scene = new THREE.Scene();
scene.background = background;

// Soft light from all around plus one "sun" so each face direction gets its own shade.
scene.add(new THREE.HemisphereLight(0xffffff, 0x404048, 1.6));
const sun = new THREE.DirectionalLight(0xffffff, 2.2);
sun.position.set(-1, 2, 1.5);
scene.add(sun);

const view = createView(canvas);

const chip = new THREE.Group();
scene.add(chip);

let meshes = []; // bottom layer first, as in the file
let explode = null; // springs, one per layer
let gap = 0; // µm each layer step lifts when fully apart
let dieBox = null; // the model's bounds at 1× height, assembled
const z = { x: 1, v: 0 }; // z-exaggeration, settling toward zTarget
let zTarget = 1;
let selected = null; // index into meshes, or null
let ruler = null;
const edges = new Map(); // mesh -> its outline LineSegments, built on first use

// --- Render loop -----------------------------------------------------------

// Render on demand: draw only while the camera, springs or z scale are moving.
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

  let moving = view.update(dt, still.matches);
  if (explode) {
    moving = settle(z, zTarget, dt, Z_SETTLE, still.matches) || moving;
    moving = explode.step(dt, now, still.matches) || moving;
    placeLayers();
    showPhase();
  }
  renderer.render(scene, view.camera);
  labelRenderer.render(scene, view.camera);
  updateScalebar();
  if (moving) requestRender();
  else last = 0;
}
view.controls.addEventListener("change", requestRender);

// Each layer keeps its geometry at true height; z-exaggeration scales it about
// the substrate (y = 0) and the explode lifts it by whole steps of `gap`.
// Lifting is in true µm, so taking it apart looks the same at any z scale.
function placeLayers() {
  meshes.forEach((mesh, i) => {
    mesh.scale.y = z.x;
    mesh.position.y = i * gap * explode.layers[i].x;
  });
}

function resize() {
  const { clientWidth: w, clientHeight: h } = canvas;
  renderer.setSize(w, h, false);
  labelRenderer.setSize(w, h);
  view.resize(w, h);
  requestRender();
}
window.addEventListener("resize", resize);
resize();

// --- Framing ---------------------------------------------------------------

// The sphere to frame: the die at a given z scale with the stack fully apart,
// so nothing leaves the view while it explodes.
function fitSphere(zScale) {
  const box = dieBox.clone();
  box.max.y = dieBox.max.y * zScale + gap * (meshes.length - 1);
  return box.getBoundingSphere(new THREE.Sphere());
}

function fitView(direction = null) {
  if (!dieBox) return;
  view.fit(fitSphere(zTarget), { direction });
  requestRender();
}

function setMode(mode) {
  view.setMode(mode);
  $("persp").setAttribute("aria-pressed", String(mode === "perspective"));
  $("iso").setAttribute("aria-pressed", String(mode === "isometric"));
  requestRender();
}

// In the isometric view one pixel is the same number of microns everywhere, so
// a scale bar is honest there. In perspective it would only be true at one depth.
function updateScalebar() {
  const umPerPx = view.micronsPerPixel(canvas.clientWidth);
  scalebar.hidden = umPerPx == null || !dieBox;
  if (scalebar.hidden) return;
  const length = niceFloor(SCALEBAR_PX * umPerPx);
  scalebar.querySelector(".bar").style.width = `${length / umPerPx}px`;
  scalebar.querySelector(".text").textContent = `${+length.toPrecision(3)} µm`;
}

// --- Phase readout ---------------------------------------------------------

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

// --- Layers panel, selection and the info card -----------------------------

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
    li.querySelector(".swatch").style.background = `#${info.baseColor.getHexString()}`;
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
    mesh.material.color.copy(index == null || on ? base : base.clone().lerp(background, DIM));
    mesh.material.emissive.copy(on ? base : background).multiplyScalar(on ? 0.25 : 0);
    const outline = edges.get(mesh);
    if (outline) outline.material.opacity = index == null || on ? EDGE_OPACITY : EDGE_OPACITY * 0.2;
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
  card.querySelector("dl").replaceChildren(...rows.flatMap(([label, value]) => {
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
  raycaster.setFromCamera(pointer, view.camera);
  const [hit] = raycaster.intersectObjects(meshes.filter((m) => m.visible), false);
  select(hit ? meshes.indexOf(hit.object) : null, hit ? hit.point : null);
});

// --- Edges and theme -------------------------------------------------------

// Outlines along sharp edges, for the crisp "technical drawing" look. Each
// outline is a child of its layer, so it follows the z scale and the explode.
function setEdges(on) {
  for (const mesh of meshes) {
    if (on && !edges.has(mesh)) {
      const material = new THREE.LineBasicMaterial({ color: THEMES[currentTheme].ink, transparent: true, opacity: EDGE_OPACITY });
      const outline = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry, EDGE_ANGLE), material);
      mesh.add(outline);
      edges.set(mesh, outline);
    }
    if (edges.has(mesh)) edges.get(mesh).visible = on;
  }
  select(selected); // set outline opacity to match the selection
}

function loadTheme() {
  try {
    const saved = localStorage.getItem("theme");
    if (saved in THEMES) return saved;
  } catch { /* storage blocked: fall through to the system setting */ }
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

let currentTheme = loadTheme();
function applyTheme(name) {
  currentTheme = name;
  document.documentElement.dataset.theme = name;
  background.set(THEMES[name].background);
  for (const outline of edges.values()) outline.material.color.set(THEMES[name].ink);
  if (ruler) ruler.material.color.set(THEMES[name].ink);
  if (meshes.length) select(selected); // re-fade unselected layers toward the new background
  requestRender();
}
applyTheme(currentTheme);

// --- Controls --------------------------------------------------------------

zSlider.addEventListener("input", () => {
  zTarget = Number(zSlider.value);
  $("zout").textContent = `${zTarget}×`;
  fitView(); // re-frame for the taller stack, keeping the current viewing angle
});

// The slider moves all layers together (each still on its spring);
// the button and Space take the stack apart one layer after another.
xSlider.addEventListener("input", () => {
  if (!explode) return;
  const value = Number(xSlider.value);
  explode.set(value, performance.now() / 1000, { stagger: false });
  $("xout").textContent = `${Math.round(value * 100)}%`;
  requestRender();
});

function toggleApart() {
  if (!explode) return;
  const top = explode.layers[explode.layers.length - 1];
  const target = (top.pending ? top.pending.value : top.target) > 0.5 ? 0 : 1;
  explode.set(target, performance.now() / 1000);
  xSlider.value = String(target);
  $("xout").textContent = `${target * 100}%`;
  requestRender();
}
toggle.addEventListener("click", toggleApart);

$("persp").addEventListener("click", () => setMode("perspective"));
$("iso").addEventListener("click", () => setMode("isometric"));
$("fit").addEventListener("click", () => fitView(view.mode === "isometric" ? ISO_DIR : PERSPECTIVE_DIR));
$("edges").addEventListener("change", (e) => setEdges(e.target.checked));
$("ruler").addEventListener("change", (e) => {
  ruler?.setVisible(e.target.checked);
  requestRender();
});
$("theme").addEventListener("click", () => {
  const next = currentTheme === "dark" ? "light" : "dark";
  try { localStorage.setItem("theme", next); } catch { /* not saved; fine */ }
  applyTheme(next);
});

function setCollapsed(collapsed) {
  panel.classList.toggle("collapsed", collapsed);
  $("collapse").setAttribute("aria-expanded", String(!collapsed));
}
$("collapse").addEventListener("click", () => setCollapsed(!panel.classList.contains("collapsed")));
// Small screens start with the panel folded so the chip has room.
setCollapsed(window.matchMedia("(max-width: 600px)").matches);

window.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    select(null);
    return;
  }
  // The rest stay out of the way of focused controls (sliders use arrows, buttons use Space).
  if (e.target.closest("input, button, select, textarea") || !meshes.length || e.metaKey || e.ctrlKey) return;
  if (e.code === "Space") {
    e.preventDefault();
    toggleApart();
  } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
    e.preventDefault();
    select(stepSelection(selected, e.key === "ArrowUp" ? +1 : -1, meshes.length));
  } else if (e.key === "i" || e.key === "I") {
    setMode(view.mode === "isometric" ? "perspective" : "isometric");
  } else if (e.key === "f" || e.key === "F") {
    fitView(view.mode === "isometric" ? ISO_DIR : PERSPECTIVE_DIR);
  }
});

// --- Load ------------------------------------------------------------------

new GLTFLoader().load(
  MODEL_URL,
  (gltf) => {
    chip.add(gltf.scene);
    gltf.scene.traverse((o) => { if (o.isMesh) meshes.push(o); });
    for (const mesh of meshes) mesh.userData.baseColor = mesh.material.color.clone();
    buildLayerPanel();

    dieBox = new THREE.Box3().setFromObject(chip);
    const die = dieBox.getSize(new THREE.Vector3()); // glTF z = chip y
    statusEl.textContent = `${meshes.length} layers · ${die.x.toFixed(1)} × ${die.z.toFixed(1)} µm`;
    gap = (EXPLODE_HEIGHT * die.x) / (meshes.length - 1);
    explode = createExplode(meshes.length);

    ruler = createRuler(die.x, die.z);
    ruler.material.color.set(THEMES[currentTheme].ink);
    ruler.setVisible($("ruler").checked);
    chip.add(ruler.group);

    view.fit(fitSphere(zTarget), { direction: PERSPECTIVE_DIR, instant: true });
    showPhase();
    select(null);
  },
  (progress) => {
    if (progress.total) statusEl.textContent = `Loading model… ${Math.round((100 * progress.loaded) / progress.total)}%`;
  },
  (error) => {
    statusEl.textContent = "Could not load the model. Run: npm run model";
    console.error(error);
  },
);
