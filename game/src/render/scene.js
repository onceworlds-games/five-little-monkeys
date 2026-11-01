// The renderer, the moonlight and fill, the camera that fits the bed to any screen, and screen shake.
import * as THREE from 'three';
import { PAL } from '../look.js';

const SHADOW = { low: 0, medium: 1024, high: 2048 };

export function createStage(canvasEl, { quality = 'high', poster = false, pixelRatio = 1 } = {}) {
  const renderer = new THREE.WebGLRenderer({
    canvas: canvasEl,
    antialias: quality !== 'low',
    preserveDrawingBuffer: poster,
    powerPreference: 'high-performance',
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.setPixelRatio(pixelRatio);
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(PAL.midnight);
  scene.fog = new THREE.Fog('#141B33', 26, 60);

  const camera = new THREE.PerspectiveCamera(40, 1, 0.3, 120);

  // Moonlight from the window side, cool; fill from a navy sky and plum floor.
  const moon = new THREE.DirectionalLight('#B9D0FF', 2.1);
  moon.position.set(-7, 14, 5);
  moon.target.position.set(0, 0, 0);
  scene.add(moon, moon.target);
  const hemi = new THREE.HemisphereLight('#7E95D6', '#4A2A44', 1.25);
  scene.add(hemi);
  const fill = new THREE.DirectionalLight('#FFC88A', 0.55);
  fill.position.set(6, 6, 10);
  scene.add(fill);

  function setQuality(q, bedBox) {
    const size = SHADOW[q] ?? 1024;
    renderer.shadowMap.enabled = size > 0;
    moon.castShadow = size > 0;
    if (size > 0) {
      moon.shadow.mapSize.set(size, size);
      const b = bedBox ?? { x0: -5, x1: 5, z0: -5, z1: 5 };
      const r = Math.max(b.x1 - b.x0, b.z1 - b.z0) / 2 + 2.5;
      const cam = moon.shadow.camera;
      cam.left = -r;
      cam.right = r;
      cam.top = r;
      cam.bottom = -r;
      cam.near = 2;
      cam.far = 40;
      cam.updateProjectionMatrix();
      moon.shadow.bias = -0.0006;
      moon.shadow.normalBias = 0.02;
      moon.shadow.radius = 4;
      moon.shadow.map?.dispose();
      moon.shadow.map = null;
    }
    scene.traverse((o) => {
      if (o.material) o.material.needsUpdate = true;
    });
  }

  // Camera framing: from the foot of the bed, looking down; the distance fits the bed's box into the screen minus margins.
  const view = { pitch: 0.66, yaw: 0, target: new THREE.Vector3(), dist: 14, fov: 40 };
  const corners = [];
  for (let i = 0; i < 8; i++) corners.push(new THREE.Vector3());
  const tmp = new THREE.Vector3();
  const cam2 = new THREE.PerspectiveCamera();

  /**
   * Fit `box` ({ x0, x1, y0, y1, z0, z1 }) with `margins` ({ top, bottom, left, right } in pixels) into a w×h screen.
   * Returns { pos, target } for the camera.
   */
  function fit(box, w, h, margins, opts = {}) {
    const portrait = h > w * 1.05;
    const pitch = opts.pitch ?? (portrait ? 0.92 : 0.7);
    const yaw = opts.yaw ?? 0;
    const fov = portrait ? 46 : 38;
    cam2.fov = fov;
    cam2.aspect = w / h;
    cam2.near = 0.3;
    cam2.far = 120;
    cam2.updateProjectionMatrix();
    const target = new THREE.Vector3((box.x0 + box.x1) / 2, (box.y0 + box.y1) / 2, (box.z0 + box.z1) / 2 + (opts.dz ?? 0));
    let k = 0;
    for (const x of [box.x0, box.x1]) for (const y of [box.y0, box.y1]) for (const z of [box.z0, box.z1]) corners[k++].set(x, y, z);
    // The usable part of the screen in NDC.
    const nx0 = -1 + (2 * (margins.left ?? 0)) / w;
    const nx1 = 1 - (2 * (margins.right ?? 0)) / w;
    const ny0 = -1 + (2 * (margins.bottom ?? 0)) / h;
    const ny1 = 1 - (2 * (margins.top ?? 0)) / h;
    const dir = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
    let lo = 3;
    let hi = 80;
    let shiftX = 0;
    let shiftY = 0;
    for (let iter = 0; iter < 26; iter++) {
      const d = (lo + hi) / 2;
      cam2.position.copy(target).addScaledVector(dir, d);
      cam2.lookAt(target);
      cam2.updateMatrixWorld();
      let ax0 = Infinity;
      let ax1 = -Infinity;
      let ay0 = Infinity;
      let ay1 = -Infinity;
      for (const c of corners) {
        tmp.copy(c).project(cam2);
        ax0 = Math.min(ax0, tmp.x);
        ax1 = Math.max(ax1, tmp.x);
        ay0 = Math.min(ay0, tmp.y);
        ay1 = Math.max(ay1, tmp.y);
      }
      const fits = ax1 - ax0 <= nx1 - nx0 && ay1 - ay0 <= ny1 - ny0;
      if (fits) hi = d;
      else lo = d;
      shiftX = (nx0 + nx1) / 2 - (ax0 + ax1) / 2;
      shiftY = (ny0 + ny1) / 2 - (ay0 + ay1) / 2;
    }
    const d = hi;
    // Shift the target so the box sits in the middle of the usable area (move along the camera's right and up).
    cam2.position.copy(target).addScaledVector(dir, d);
    cam2.lookAt(target);
    cam2.updateMatrixWorld();
    const right = new THREE.Vector3().setFromMatrixColumn(cam2.matrixWorld, 0);
    const up = new THREE.Vector3().setFromMatrixColumn(cam2.matrixWorld, 1);
    const halfH = Math.tan(THREE.MathUtils.degToRad(fov / 2)) * d;
    const halfW = halfH * (w / h);
    target.addScaledVector(right, -shiftX * halfW).addScaledVector(up, -shiftY * halfH);
    const pos = target.clone().addScaledVector(dir, d);
    return { pos, target, fov };
  }

  // Shake: trauma squared.
  let trauma = 0;
  const shake = new THREE.Vector3();
  function addTrauma(k) {
    trauma = Math.min(1, trauma + k);
  }
  function shakeOffset(dt, t, reduced) {
    trauma = Math.max(0, trauma - dt * 1.6);
    if (reduced || trauma <= 0) return shake.set(0, 0, 0);
    const s = trauma * trauma * 0.35;
    return shake.set(Math.sin(t * 61.3) * s, Math.sin(t * 47.1 + 1) * s * 0.7, Math.sin(t * 53.7 + 2) * s * 0.5);
  }

  function resize(w, h, pr) {
    renderer.setPixelRatio(pr);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  return { renderer, scene, camera, moon, hemi, fill, setQuality, fit, view, addTrauma, shakeOffset, resize };
}
