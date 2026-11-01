// The renderer and its look: moonlight with soft shadows, the room's fill, a dim environment for glints, and the post
// chain by quality (high: bloom, a miniature's tilt-shift focus, grade and grain; medium: bloom and grade; low: none).
// Also the camera that fits the bed to any screen, trauma shake with a direction, and the punch-in.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const SHADOW = { low: 0, medium: 1024, high: 2048 };

// The grade: a miniature's focus (sharp in a band, soft above and below), a navy-and-amber split tone, a vignette and a
// little grain. Runs on linear colour before the output pass tone-maps it.
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uRes: { value: new THREE.Vector2(1, 1) },
    uFocus: { value: 0.5 },
    uBand: { value: 0.22 },
    uBlur: { value: 0 },
    uTime: { value: 0 },
    uVignette: { value: 0.32 },
    uGrain: { value: 0.025 },
    uShadow: { value: new THREE.Color('#2A3A6A') },
    uLight: { value: new THREE.Color('#FFC27A') },
    uSplit: { value: 0.12 },
    uFlash: { value: 0 },
    uFlashColor: { value: new THREE.Color('#FFFFFF') },
  },
  vertexShader: /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
uniform sampler2D tDiffuse;
uniform vec2 uRes;
uniform float uFocus, uBand, uBlur, uTime, uVignette, uGrain, uSplit, uFlash;
uniform vec3 uShadow, uLight, uFlashColor;
varying vec2 vUv;
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main() {
  vec3 c = texture2D(tDiffuse, vUv).rgb;
  if (uBlur > 0.0) {
    float d = max(0.0, abs(vUv.y - uFocus) - uBand) / max(0.001, 0.5 - uBand);
    float r = uBlur * d * d;
    if (r > 0.3) {
      vec3 acc = c;
      float n = 1.0;
      for (int i = 0; i < 12; i++) {
        float a = float(i) * 2.39996 + 0.5;
        float rr = r * sqrt((float(i) + 0.5) / 12.0);
        vec2 o = vec2(cos(a), sin(a)) * rr / uRes;
        acc += texture2D(tDiffuse, vUv + o).rgb;
        n += 1.0;
      }
      c = acc / n;
    }
  }
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  float tl = l / (1.0 + l);
  c *= mix(uShadow * 2.2, vec3(1.0), smoothstep(0.0, 0.35, tl)) * (1.0 - uSplit) + uSplit * mix(vec3(1.0), uLight * 1.25, smoothstep(0.35, 0.9, tl));
  vec2 v = vUv - 0.5;
  c *= 1.0 - uVignette * smoothstep(0.25, 0.85, dot(v, v) * 2.2);
  c += (hash(vUv * uRes + fract(uTime) * 37.0) - 0.5) * uGrain * (0.3 + tl);
  c = mix(c, uFlashColor * 2.0, uFlash);
  gl_FragColor = vec4(max(c, 0.0), 1.0);
}`,
};

export function createStage(canvasEl, { quality = 'high', poster = false, pixelRatio = 1 } = {}) {
  const renderer = new THREE.WebGLRenderer({
    canvas: canvasEl,
    antialias: quality === 'low',
    preserveDrawingBuffer: poster,
    powerPreference: 'high-performance',
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.setPixelRatio(pixelRatio);
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#0E1426');
  scene.fog = new THREE.Fog('#0E1426', 34, 70);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.22;
  pmrem.dispose();

  const camera = new THREE.PerspectiveCamera(32, 1, 0.3, 140);

  // Moonlight through the window (back left, high), cool; the room's fill from a navy ceiling and a plum floor.
  const moon = new THREE.DirectionalLight('#A9C2FF', 2.3);
  moon.position.set(-9, 16, -6);
  moon.target.position.set(0, 0, 0);
  scene.add(moon, moon.target);
  const hemi = new THREE.HemisphereLight('#5C70B0', '#3A2232', 0.85);
  scene.add(hemi);
  // A soft warm bounce from the front (the lamp light off the rug and walls), so faces never go black.
  const fill = new THREE.DirectionalLight('#FFC796', 0.55);
  fill.position.set(4, 7, 12);
  scene.add(fill);

  let q = quality;
  let composer = null;
  let bloom = null;
  let grade = null;
  let rt = null;
  const size = new THREE.Vector2(1, 1);

  function buildPost() {
    composer?.dispose?.();
    rt?.dispose();
    composer = null;
    bloom = null;
    grade = null;
    if (q === 'low') return;
    renderer.getDrawingBufferSize(size);
    rt = new THREE.WebGLRenderTarget(Math.max(1, size.x), Math.max(1, size.y), { type: THREE.HalfFloatType, samples: q === 'high' ? 4 : 2 });
    composer = new EffectComposer(renderer, rt);
    composer.addPass(new RenderPass(scene, camera));
    bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), q === 'high' ? 0.75 : 0.6, 0.55, 0.9);
    composer.addPass(bloom);
    grade = new ShaderPass(GradeShader);
    grade.uniforms.uBlur.value = q === 'high' ? 7 : 0;
    grade.uniforms.uGrain.value = q === 'high' ? 0.022 : 0;
    composer.addPass(grade);
    composer.addPass(new OutputPass());
    composer.setPixelRatio(1);
    composer.setSize(size.x, size.y);
    grade.uniforms.uRes.value.set(size.x, size.y);
  }

  function setQuality(next, bedBox) {
    const changed = next !== q;
    q = next;
    const sz = SHADOW[q] ?? 1024;
    renderer.shadowMap.enabled = sz > 0;
    moon.castShadow = sz > 0;
    if (sz > 0) {
      moon.shadow.mapSize.set(sz, sz);
      const b = bedBox ?? { x0: -5, x1: 5, z0: -5, z1: 5 };
      const r = Math.max(b.x1 - b.x0, b.z1 - b.z0) / 2 + 4;
      const cam = moon.shadow.camera;
      cam.left = -r;
      cam.right = r;
      cam.top = r;
      cam.bottom = -r;
      cam.near = 2;
      cam.far = 50;
      cam.updateProjectionMatrix();
      moon.shadow.bias = -0.0005;
      moon.shadow.normalBias = 0.03;
      moon.shadow.radius = q === 'high' ? 5 : 3;
      moon.shadow.map?.dispose();
      moon.shadow.map = null;
    }
    scene.traverse((o) => {
      if (o.material) o.material.needsUpdate = true;
    });
    if (changed || !composer) buildPost();
  }
  setQuality(q);

  // Camera framing: from the foot of the bed, looking down; the distance fits the bed's box into the screen minus margins.
  const view = { pitch: 0.66, yaw: 0, target: new THREE.Vector3(), dist: 14, fov: 32 };
  const corners = [];
  for (let i = 0; i < 8; i++) corners.push(new THREE.Vector3());
  const tmp = new THREE.Vector3();
  const cam2 = new THREE.PerspectiveCamera();

  /**
   * Fit `box` ({ x0, x1, y0, y1, z0, z1 }) with `margins` ({ top, bottom, left, right } in pixels) into a w×h screen.
   * Returns { pos, target, fov } for the camera. opts: { pitch, yaw, fov, dz }.
   */
  function fit(box, w, h, margins, opts = {}) {
    const portrait = h > w * 1.05;
    const pitch = opts.pitch ?? (portrait ? 0.86 : 0.62);
    const yaw = opts.yaw ?? 0;
    const fov = opts.fov ?? (portrait ? 40 : 30);
    cam2.fov = fov;
    cam2.aspect = w / h;
    cam2.near = 0.3;
    cam2.far = 140;
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
    let lo = 2;
    let hi = 120;
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
    return { pos, target, fov, dist: d };
  }

  // Shake: trauma squared, with an optional direction it leans toward (a launch shoves the frame the way it flies).
  let trauma = 0;
  const shake = new THREE.Vector3();
  const kickDir = new THREE.Vector3();
  function addTrauma(k, dx = 0, dz = 0) {
    trauma = Math.min(1, trauma + k);
    if (dx || dz) kickDir.set(dx, 0, dz).normalize().multiplyScalar(k * 0.5);
  }
  function shakeOffset(dt, t, reduced) {
    trauma = Math.max(0, trauma - dt * 1.7);
    kickDir.multiplyScalar(Math.exp(-dt * 9));
    if (reduced || trauma <= 0) return shake.set(0, 0, 0);
    const s = trauma * trauma * 0.32;
    return shake.set(Math.sin(t * 61.3) * s + kickDir.x, Math.sin(t * 47.1 + 1) * s * 0.7, Math.sin(t * 53.7 + 2) * s * 0.5 + kickDir.z);
  }
  // Punch-in: a quick narrowing of the field of view that springs back.
  let punchK = 0;
  let punchV = 0;
  function punch(k) {
    punchV -= k * 6;
  }
  function punchStep(dt) {
    const steps = Math.max(1, Math.ceil(dt * 240));
    const h = dt / steps;
    for (let i = 0; i < steps; i++) {
      punchV += (-180 * punchK - 16 * punchV) * h;
      punchK += punchV * h;
    }
    return 1 + Math.max(-0.25, Math.min(0.15, punchK));
  }
  // A full-screen flash (a Mega Slam, a knock-off).
  let flash = 0;
  const flashColor = new THREE.Color();
  function flashOn(k, hex = '#ffffff') {
    flash = Math.max(flash, k);
    flashColor.set(hex);
  }

  function resize(w, h, pr) {
    renderer.setPixelRatio(pr);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    if (composer) {
      renderer.getDrawingBufferSize(size);
      composer.setSize(size.x, size.y);
      grade.uniforms.uRes.value.set(size.x, size.y);
      bloom.resolution?.set(size.x / 2, size.y / 2);
    }
  }

  /** Where the miniature's focus band sits on screen (0 bottom - 1 top), and how wide. */
  function focus(y, band = 0.22) {
    if (!grade) return;
    grade.uniforms.uFocus.value = y;
    grade.uniforms.uBand.value = band;
  }

  let clock = 0;
  function draw(dt) {
    clock += dt;
    flash = Math.max(0, flash - dt * 5);
    if (!composer) {
      renderer.render(scene, camera);
      return;
    }
    grade.uniforms.uTime.value = clock;
    grade.uniforms.uFlash.value = flash * 0.5;
    grade.uniforms.uFlashColor.value.copy(flashColor);
    composer.render(dt);
  }

  return {
    renderer, scene, camera, moon, hemi, fill, setQuality, fit, view, addTrauma, shakeOffset, resize, draw, focus,
    punch, punchStep, flash: flashOn,
    /** Where the scene itself is drawn (the post chain's buffer, or null for the screen): shaders differ between them. */
    sceneTarget() {
      return composer ? composer.readBuffer : null;
    },
    get quality() {
      return q;
    },
  };
}
