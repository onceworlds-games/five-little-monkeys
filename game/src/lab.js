// The monkey lab (dev only, not built): every body, look, hat and move, lit like the bedroom. ?pose=<clip>&t=<s>&cam=<n>
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { meshBody, anchorsFor } from './render/plush.js';
import { loadBodies } from './render/bodies.js';
import { createMonkey, BODIES, FURS } from './render/monkey.js';
import { COLORS } from './look.js';

const q = new URLSearchParams(location.search);
const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(2, devicePixelRatio));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
scene.background = new THREE.Color('#1c2238');
const pm = new THREE.PMREMGenerator(renderer);
scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.35;
const cam = new THREE.PerspectiveCamera(30, 1, 0.05, 50);
const key = new THREE.DirectionalLight('#BFD4FF', 2.2);
key.position.set(-3, 5, 4);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.camera.left = -3; key.shadow.camera.right = 3; key.shadow.camera.top = 3; key.shadow.camera.bottom = -3;
key.shadow.bias = -0.0005;
scene.add(key);
const warm = new THREE.PointLight('#FFB25A', 6, 8, 1.6);
warm.position.set(2.5, 1.6, 2);
scene.add(warm);
scene.add(new THREE.HemisphereLight('#6F86C6', '#3A2436', 0.9));
const floor = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), new THREE.MeshStandardMaterial({ color: '#C9B48E', roughness: 0.9 }));
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

const kinds = (q.get('bodies') ?? 'player,rumble,tiptoe,mimic,dozy,bear').split(',');
const extras = { rumble: 'brows', tiptoe: 'bigeyes', mimic: 'glasses', dozy: 'mask' };
const pats = (q.get('pats') ?? 'stripes,dots,zigzag,stars,plain,plain').split(',');
const hats = (q.get('hats') ?? 'none,none,none,none,none,none').split(',');
const cell = q.has('cell') ? Number(q.get('cell')) : 0;
const baked = cell ? null : await loadBodies();
const monkeys = [];
const t0 = performance.now();
kinds.forEach((kind, i) => {
  const body = BODIES[kind];
  const data = baked ? baked[kind].mesh : meshBody(body, cell);
  const anchors = baked ? baked[kind].anchors : anchorsFor(body);
  const c = COLORS[i % COLORS.length];
  const [fur, skin] = FURS[kind];
  const look = { cloth: c.hex, clothDark: c.dark, trim: '#FFF1D6', fur, skin, pattern: pats[i] ?? 'plain', symbol: kind === 'bear' ? '' : c.symbol, extra: extras[kind] ?? '', hat: hats[i] ?? 'none' };
  const mk = createMonkey({ data, anchors, body: kind, look, quality: 'high', shadows: true });
  scene.add(mk.group);
  monkeys.push({ mk, kind, x: (i - (kinds.length - 1) / 2) * 0.75 });
});
const info = document.getElementById('info');
info.textContent = `${baked ? 'baked' : 'meshed'} in ${(performance.now() - t0).toFixed(0)} ms`;

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  cam.aspect = w / h;
  cam.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();
const camN = Number(q.get('cam') ?? 0);
const pose = q.get('pose') ?? 'bounce';
const fixedT = q.get('t');
const look = new THREE.Vector3(0, 0.9, 3);

// A fake bounce: contact 0.12 s, air at apex 1 u.
const G = 16;
function bounceState(t, i) {
  const apex = 1.0;
  const v0 = Math.sqrt(2 * G * apex);
  const air = (2 * v0) / G;
  const period = air + 0.12;
  const ph = ((t + i * 0.23) % period + period) % period;
  if (ph < 0.12) return { mode: 'contact', prog: ph / 0.12, y: 0, vy: 0, v0 };
  const ta = ph - 0.12;
  return { mode: 'air', y: v0 * ta - 0.5 * G * ta * ta, vy: v0 - G * ta, v0 };
}

let last = performance.now();
let simT = fixedT ? Number(fixedT) : 0;
function frame() {
  const now = performance.now();
  let dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (fixedT) dt = 1 / 60;
  simT += fixedT ? 0 : dt;
  monkeys.forEach((m, i) => {
    let s;
    if (pose === 'bounce') s = { ...bounceState(simT, i), x: m.x, z: 0, yaw: 0, tier: 0 };
    else if (['flail', 'launched'].includes(pose)) s = { mode: 'launched', x: m.x, y: 0.6, z: 0, vx: 1, vz: 0, vy: 2, tumble: 0, launchId: 1 };
    else if (pose.startsWith('dance:')) s = { mode: 'dance', dance: pose.slice(6), x: m.x, y: 0, z: 0 };
    else if (pose.startsWith('clip:')) s = { mode: 'clip', clip: pose.slice(5), x: m.x, y: 0, z: 0 };
    else s = { mode: pose, x: m.x, y: pose === 'dive' || pose === 'falling' ? 0.6 : 0, z: 0, prog: 0.5, dizzy: 1, teeter: pose === 'teeter' ? 1 : 0 };
    if (pose === 'teeter') s.mode = 'contact';
    s.lookAt = look;
    s.scale = 1;
    s.bandage = q.has('bandage');
    s.mega = q.has('mega') && i % 2 === 0;
    s.shield = q.has('shield') && i % 2 === 1;
    m.mk.update(s, dt);
  });
  const cams = [[0, 1.0, 4.6, 0, 0.55, 0], [0, 0.9, 1.6, 0, 0.75, 0], [2.5, 2.6, 3.2, 0, 0.5, 0], [0, 0.8, 1.2, -0.75 * 2, 0.75, 0]];
  const c = cams[camN] ?? cams[0];
  cam.position.set(c[0], c[1], c[2]);
  cam.lookAt(c[3], c[4], c[5]);
  renderer.render(scene, cam);
  window.__frames = (window.__frames ?? 0) + 1;
  requestAnimationFrame(frame);
}
frame();
window.__ready = true;
