// Cameras: a perspective camera for exploring and an orthographic one for the
// isometric "technical drawing" view, sharing one set of orbit controls.
// Every camera move the app makes (fit, preset) glides there; the user's own
// drags take over at once.

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const GLIDE = 0.22; // seconds: time constant of camera glides
const deg = THREE.MathUtils.degToRad;

// From the front-left, looking down about 35°.
export const PERSPECTIVE_DIR = new THREE.Vector3(-0.55, 0.55, 0.75).normalize();
// Isometric preset: 45° around and 30° up, Anatomy's default camera.
export const ISO_DIR = new THREE.Vector3(
  -Math.cos(deg(30)) * Math.sin(deg(45)),
  Math.sin(deg(30)),
  Math.cos(deg(30)) * Math.cos(deg(45)),
);

export function createView(canvas) {
  const perspective = new THREE.PerspectiveCamera(35, 1, 0.1, 5000);
  const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 5000);
  const controls = new OrbitControls(perspective, canvas);
  controls.enableDamping = true;

  let camera = perspective;
  let aspect = 1;
  let sphere = new THREE.Sphere(new THREE.Vector3(), 1);
  let goal = null; // { target, position, zoom } the camera is gliding toward

  controls.addEventListener("start", () => { goal = null; }); // the user takes over

  // Distance at which the sphere fits the narrower of the two fields of view.
  function fitDistance(radius) {
    const vfov = deg(perspective.fov);
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * aspect);
    return (1.05 * radius) / Math.sin(Math.min(vfov, hfov) / 2);
  }

  // An orthographic camera has no distance: its frustum size decides the zoom.
  function sizeOrtho() {
    const half = 1.05 * sphere.radius;
    const h = aspect >= 1 ? half : half / aspect;
    ortho.top = h;
    ortho.bottom = -h;
    ortho.left = -h * aspect;
    ortho.right = h * aspect;
    ortho.updateProjectionMatrix();
  }

  // Frame a bounding sphere. Keeps the current viewing direction unless one is given.
  function fit(newSphere, { direction = null, instant = false } = {}) {
    sphere = newSphere.clone();
    const { center, radius } = sphere;
    const dir = (direction ?? camera.position.clone().sub(controls.target)).clone().normalize();
    const distance = camera.isOrthographicCamera ? 4 * radius : fitDistance(radius);

    perspective.near = radius / 500;
    perspective.far = radius * 50;
    perspective.updateProjectionMatrix();
    ortho.near = radius / 100;
    ortho.far = radius * 20;
    sizeOrtho();

    goal = { target: center.clone(), position: center.clone().addScaledVector(dir, distance), zoom: 1 };
    if (instant) arrive();
  }

  function arrive() {
    controls.target.copy(goal.target);
    camera.position.copy(goal.position);
    if (camera.isOrthographicCamera) {
      camera.zoom = goal.zoom;
      camera.updateProjectionMatrix();
    }
    goal = null;
  }

  function setMode(mode) {
    const next = mode === "isometric" ? ortho : perspective;
    if (next === camera) return;
    next.position.copy(camera.position);
    next.zoom = 1;
    next.updateProjectionMatrix();
    camera = next;
    controls.object = camera;
    fit(sphere, { direction: mode === "isometric" ? ISO_DIR : PERSPECTIVE_DIR });
  }

  function resize(width, height) {
    aspect = width / height;
    perspective.aspect = aspect;
    perspective.updateProjectionMatrix();
    sizeOrtho();
  }

  // Advance glides and damping. Returns true while the camera is still moving.
  function update(dt, calm = false) {
    let moving = false;
    if (goal) {
      const k = calm ? 1 : 1 - Math.exp(-dt / GLIDE); // exponential follow
      controls.target.lerp(goal.target, k);
      camera.position.lerp(goal.position, k);
      if (camera.isOrthographicCamera) {
        camera.zoom += (goal.zoom - camera.zoom) * k;
        camera.updateProjectionMatrix();
      }
      const close = sphere.radius * 1e-4;
      if (camera.position.distanceTo(goal.position) < close && controls.target.distanceTo(goal.target) < close) arrive();
      else moving = true;
    }
    return controls.update() || moving;
  }

  // Microns per screen pixel. Only an orthographic view has one scale everywhere.
  function micronsPerPixel(widthPx) {
    return camera.isOrthographicCamera ? (ortho.right - ortho.left) / ortho.zoom / widthPx : null;
  }

  return {
    get camera() { return camera; },
    get mode() { return camera.isOrthographicCamera ? "isometric" : "perspective"; },
    controls,
    fit,
    setMode,
    resize,
    update,
    micronsPerPixel,
  };
}
