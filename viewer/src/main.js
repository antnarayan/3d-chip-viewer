import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const MODEL_URL = "/models/spm.glb";

const canvas = document.getElementById("stage");
const statusEl = document.getElementById("status");
const layersEl = document.getElementById("layers");
const zSlider = document.getElementById("zscale");
const zOut = document.getElementById("zout");

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

// Everything from the file goes in here, so z-exaggeration is one scale on one group.
const chip = new THREE.Group();
scene.add(chip);

// Render on demand: only draw while something is changing, not 60 times a second forever.
let frame = 0;
function requestRender() {
  if (!frame) frame = requestAnimationFrame(render);
}
function render() {
  frame = 0;
  if (controls.update()) requestRender(); // damping still settling: keep going
  renderer.render(scene, camera);
}
controls.addEventListener("change", requestRender);

function resize() {
  const { clientWidth: w, clientHeight: h } = canvas;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  requestRender();
}
window.addEventListener("resize", resize);
resize();

function frameModel(object) {
  const box = new THREE.Box3().setFromObject(object);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3()).length();
  controls.target.copy(center);
  // Look from the front-left, about 35° above the die.
  camera.position.copy(center).add(new THREE.Vector3(-0.55, 0.55, 0.75).multiplyScalar(size));
  camera.near = size / 1000;
  camera.far = size * 20;
  camera.updateProjectionMatrix();
  controls.update();
}

function buildLayerPanel(meshes) {
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
  const k = Number(zSlider.value);
  chip.scale.y = k; // y is "up" in glTF; the substrate sits at y = 0, so layers stretch upward
  zOut.textContent = `${k}×`;
  requestRender();
});

new GLTFLoader().load(
  MODEL_URL,
  (gltf) => {
    chip.add(gltf.scene);
    const meshes = [];
    gltf.scene.traverse((o) => { if (o.isMesh) meshes.push(o); });
    buildLayerPanel(meshes);
    frameModel(chip);
    const die = new THREE.Box3().setFromObject(chip).getSize(new THREE.Vector3()); // glTF z = chip y
    statusEl.textContent = `${meshes.length} layers · ${die.x.toFixed(1)} × ${die.z.toFixed(1)} µm`;
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
