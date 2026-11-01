// A plush monkey on the bed: one skinned body (plush.js), felt eyes with bead pupils that look around and blink, felt
// brows, a stitched mouth with moods, buttons and a pocket with the seat's symbol, a hat, toys it holds, and its acting:
// clips blended by the animator (rig.js) from its physics, with squash and stretch, flips and spins on the root, and
// springs on the tail and ears.
import * as THREE from 'three';
import { BONES, BODIES } from './plush.js';
export { BODIES, FURS } from './plush.js';
import { createSkeleton, createAnimator, Spring } from './rig.js';
import { plushMaterial, setPlushLook } from './fabric.js';
import { buildHat } from './hats.js';

const tmpV = new THREE.Vector3();
const tmpQ = new THREE.Quaternion();
const tmpE = new THREE.Euler();
const UP = new THREE.Vector3(0, 1, 0);

/** BufferGeometry from mesh data ({ positions, normals, indices, skinIndex, skinWeight, fabric }). */
export function plushGeometry(data) {
  const g = new THREE.BufferGeometry();
  // Baked bodies keep normals, weights and fabric as bytes (normalized); freshly meshed ones are floats.
  const bytes = (a) => a instanceof Int8Array || a instanceof Uint8Array;
  g.setAttribute('position', new THREE.BufferAttribute(data.positions, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(data.normals, 3, bytes(data.normals)));
  g.setAttribute('skinIndex', new THREE.BufferAttribute(data.skinIndex, 4));
  g.setAttribute('skinWeight', new THREE.BufferAttribute(data.skinWeight, 4, bytes(data.skinWeight)));
  g.setAttribute('fabric', new THREE.BufferAttribute(data.fabric, 4, bytes(data.fabric)));
  g.setIndex(new THREE.BufferAttribute(data.indices, 1));
  g.computeBoundingSphere();
  g.boundingSphere.radius *= 1.6;
  return g;
}

const feltMats = new Map();
function felt(hex, rough = 0.95, extra = {}) {
  const key = `${hex}|${rough}|${JSON.stringify(extra)}`;
  if (!feltMats.has(key)) feltMats.set(key, new THREE.MeshPhysicalMaterial({ color: hex, roughness: rough, sheen: 0.6, sheenRoughness: 0.6, sheenColor: new THREE.Color(hex).lerp(new THREE.Color('#ffffff'), 0.4), ...extra }));
  return feltMats.get(key);
}
const beadMat = new THREE.MeshPhysicalMaterial({ color: '#0E0A0C', roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.05, metalness: 0 });
const mouthMat = new THREE.MeshStandardMaterial({ color: '#4A1418', roughness: 0.7 });
const lipMat = new THREE.MeshStandardMaterial({ color: '#3A1A14', roughness: 0.8 });
const toothMat = new THREE.MeshStandardMaterial({ color: '#FFF8EC', roughness: 0.5 });
const tongueMat = new THREE.MeshStandardMaterial({ color: '#E2767A', roughness: 0.6 });

/** Orient `obj` so its local +z points along normal `n` (and its +y stays near world up). */
function faceAlong(obj, n) {
  const z = new THREE.Vector3(n[0], n[1], n[2]).normalize();
  const x = new THREE.Vector3().crossVectors(UP, z);
  if (x.lengthSq() < 1e-6) x.set(1, 0, 0);
  x.normalize();
  const y = new THREE.Vector3().crossVectors(z, x);
  obj.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
}

/** A tube along points (for stitched mouths). */
function tube(points, r) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
  return new THREE.TubeGeometry(curve, 20, r, 6, false);
}

/** The symbol patch for the pocket. */
function symbolTexture(symbol, hex, dark) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#FFF1D6';
  g.beginPath();
  g.roundRect(6, 6, 116, 116, 22);
  g.fill();
  g.strokeStyle = dark;
  g.setLineDash([9, 7]);
  g.lineWidth = 5;
  g.beginPath();
  g.roundRect(16, 16, 96, 96, 16);
  g.stroke();
  g.setLineDash([]);
  g.fillStyle = hex;
  g.strokeStyle = dark;
  g.lineWidth = 4;
  g.beginPath();
  if (symbol === 'square') g.rect(38, 38, 52, 52);
  else if (symbol === 'circle') g.arc(64, 64, 28, 0, Math.PI * 2);
  else if (symbol === 'triangle') {
    g.moveTo(64, 32);
    g.lineTo(96, 90);
    g.lineTo(32, 90);
  } else if (symbol === 'star') {
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
      const r = i % 2 ? 14 : 34;
      g.lineTo(64 + Math.cos(a) * r, 67 + Math.sin(a) * r);
    }
  } else if (symbol === 'diamond') {
    g.moveTo(64, 30);
    g.lineTo(98, 64);
    g.lineTo(64, 98);
    g.lineTo(30, 64);
  } else {
    g.arc(64, 64, 18, 0, Math.PI * 2);
  }
  g.closePath();
  g.fill();
  g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** A golden banana (the Mega Slam toy). */
export function bananaGeometry(s = 1) {
  const pts = [];
  for (let i = 0; i <= 10; i++) {
    const a = -0.9 + (i / 10) * 1.8;
    pts.push(new THREE.Vector3(Math.sin(a) * 0.09 * s, -Math.cos(a) * 0.05 * s, 0));
  }
  const curve = new THREE.CatmullRomCurve3(pts);
  const seg = 24;
  const radial = 8;
  const g = new THREE.TubeGeometry(curve, seg, 0.024 * s, radial, false);
  // Taper the ends.
  const p = g.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    const u = Math.floor(i / (radial + 1)) / seg;
    const k = 0.3 + 0.7 * Math.sin(Math.PI * Math.min(1, Math.max(0, u)));
    const c = curve.getPoint(Math.min(1, u));
    v.fromBufferAttribute(p, i).sub(c).multiplyScalar(k).add(c);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}
export const bananaMat = new THREE.MeshPhysicalMaterial({ color: '#FFC23A', emissive: '#FF9A1A', emissiveIntensity: 0.55, roughness: 0.35, clearcoat: 0.6 });

/** A puffy pillow (worn as a helmet when it shields, thrown from the rug). */
export function pillowGeometry(w = 0.3, h = 0.09, d = 0.22) {
  const g = new THREE.BoxGeometry(w, h, d, 10, 4, 8);
  const p = g.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const ex = Math.abs(v.x) / (w / 2);
    const ez = Math.abs(v.z) / (d / 2);
    const puff = (1 - ex * ex) * (1 - ez * ez);
    v.y *= 0.35 + 0.95 * puff;
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}
export const pillowMat = new THREE.MeshPhysicalMaterial({ color: '#F4EEE2', roughness: 0.9, sheen: 1, sheenColor: new THREE.Color('#ffffff'), sheenRoughness: 0.5 });

/**
 * A monkey. opts: { data (mesh with joints), anchors, body, look, quality, shadows }. look: { cloth, clothDark, trim,
 * fur, skin, pattern, symbol, extra ('brows' | 'bigeyes' | 'glasses' | 'mask' | ''), hat }.
 */
export function createMonkey(opts) {
  const { data, anchors } = opts;
  const joints = data.joints;
  const bodyKind = opts.body ?? 'player';
  const bear = !!BODIES[bodyKind]?.bear;
  const group = new THREE.Group(); // placed in the world, faces +z
  const pivot = new THREE.Group(); // spins, flips and squashes around the belly
  const pivotY = 0.4;
  pivot.position.y = pivotY;
  group.add(pivot);
  const holder = new THREE.Group();
  holder.position.y = -pivotY;
  pivot.add(holder);

  const skel = createSkeleton(joints);
  const geo = plushGeometry(data);
  let look = { ...opts.look };
  const mat = plushMaterial(look, { quality: opts.quality });
  const mesh = new THREE.SkinnedMesh(geo, mat);
  mesh.add(skel.root);
  mesh.bind(skel.skeleton);
  mesh.castShadow = !!opts.shadows;
  mesh.frustumCulled = false;
  holder.add(mesh);
  const B = skel.byName;
  void BONES;
  const restHipsY = B.hips.position.y;
  const anim = createAnimator(skel.root, skel, restHipsY);

  // Things fixed to bones: placed at an anchor (model space), parented to the bone.
  function attach(obj, anchorName, out = 0) {
    const a = anchors[anchorName];
    if (!a) return obj;
    const bw = joints[a.bone];
    obj.position.set(a.p[0] - bw[0] + a.n[0] * out, a.p[1] - bw[1] + a.n[1] * out, a.p[2] - bw[2] + a.n[2] * out);
    faceAlong(obj, a.n);
    B[a.bone].add(obj);
    return obj;
  }
  const parts = [];
  const keep = (m) => {
    parts.push(m);
    return m;
  };

  // --- the face ---
  const H = BODIES[bodyKind]?.head ?? 1;
  const big = look.extra === 'bigeyes';
  const eyeR = (big ? 0.05 : 0.043) * H;
  const eyes = [];
  for (const s of ['L', 'R']) {
    const e = new THREE.Group();
    attach(e, `eye${s}`, 0.001);
    const white = keep(new THREE.Mesh(new THREE.CylinderGeometry(eyeR, eyeR, 0.008, 28).rotateX(Math.PI / 2), felt('#FFF9F0', 0.9)));
    white.scale.set(1, 1.12, 1);
    e.add(white);
    const pupilG = new THREE.Group();
    pupilG.position.z = 0.006;
    e.add(pupilG);
    const pupil = keep(new THREE.Mesh(new THREE.SphereGeometry(eyeR * 0.6, 20, 14), beadMat));
    pupil.scale.set(1, 1.1, 0.55);
    pupilG.add(pupil);
    const glint = keep(new THREE.Mesh(new THREE.SphereGeometry(eyeR * 0.17, 10, 8), new THREE.MeshBasicMaterial({ color: '#ffffff' })));
    glint.position.set(eyeR * 0.22, eyeR * 0.28, eyeR * 0.3);
    pupilG.add(glint);
    // The lid: felt that drops from the top.
    const lidG = new THREE.Group();
    lidG.position.set(0, eyeR * 1.12, 0.014);
    e.add(lidG);
    const lidGeo = new THREE.CylinderGeometry(eyeR * 1.08, eyeR * 1.08, 0.006, 28).rotateX(Math.PI / 2).translate(0, -eyeR * 1.1, 0);
    const lid = keep(new THREE.Mesh(lidGeo, felt(bear ? (look.fur ?? '#A8743F') : look.skin ?? '#EDC9A1', 0.95)));
    lid.scale.y = 0.01;
    lidG.add(lid);
    eyes.push({ e, pupilG, lid, side: s });
  }
  const brows = [];
  const browGeo = new THREE.CapsuleGeometry(look.extra === 'brows' ? 0.013 : 0.0085, 0.05 * H, 4, 10).rotateZ(Math.PI / 2);
  for (const s of ['L', 'R']) {
    const g = new THREE.Group();
    attach(g, `brow${s}`, 0.004);
    const m = keep(new THREE.Mesh(browGeo, felt(look.extra === 'brows' ? '#2A1810' : '#3A2418', 0.95)));
    g.add(m);
    brows.push({ g, m, side: s === 'L' ? -1 : 1, base: g.position.clone() });
  }
  // Nose and mouth on the muzzle.
  const nose = new THREE.Group();
  attach(nose, 'nose', 0);
  if (bear) {
    const n = keep(new THREE.Mesh(new THREE.SphereGeometry(0.03, 16, 12), beadMat));
    n.scale.set(1.3, 0.85, 0.7);
    nose.add(n);
  } else {
    for (const s of [-1, 1]) {
      const n = keep(new THREE.Mesh(new THREE.SphereGeometry(0.011, 10, 8), lipMat));
      n.position.set(s * 0.022, 0, 0);
      n.scale.set(1.2, 0.8, 0.6);
      nose.add(n);
    }
  }
  const mouth = new THREE.Group();
  attach(mouth, 'mouth', 0);
  const mw = 0.062 * H * (bear ? 0.7 : 1);
  const smileArc = (w, dip) => {
    const pts = [];
    for (let i = 0; i <= 8; i++) {
      const u = i / 8 - 0.5;
      const x = u * 2 * w;
      pts.push([x, -dip * (1 - 4 * u * u), 0.004 - (0.6 * x * x) / (w * 2)]);
    }
    return pts;
  };
  const shapes = {
    smile: keep(new THREE.Mesh(tube(smileArc(mw * 0.8, 0.018), 0.0055), lipMat)),
    grin: new THREE.Group(),
    o: new THREE.Group(),
    gritted: new THREE.Group(),
    worried: keep(new THREE.Mesh(tube(smileArc(mw * 0.62, -0.012), 0.005), lipMat)),
    guilty: new THREE.Group(),
    sleepy: keep(new THREE.Mesh(new THREE.SphereGeometry(0.012, 12, 8), mouthMat)),
  };
  {
    const half = (r) => new THREE.SphereGeometry(r, 20, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
    const grinIn = keep(new THREE.Mesh(half(mw * 0.85), mouthMat));
    grinIn.scale.set(1, 0.55, 0.35);
    shapes.grin.add(grinIn);
    const tongue = keep(new THREE.Mesh(new THREE.SphereGeometry(mw * 0.42, 14, 10), tongueMat));
    tongue.position.set(0, -0.018, 0);
    tongue.scale.set(1, 0.5, 0.4);
    shapes.grin.add(tongue);
    shapes.grin.add(keep(new THREE.Mesh(tube(smileArc(mw * 0.86, 0), 0.004), lipMat)));
    const oIn = keep(new THREE.Mesh(new THREE.SphereGeometry(0.026, 18, 14), mouthMat));
    oIn.scale.set(0.9, 1.15, 0.4);
    shapes.o.add(oIn);
    const oT = keep(new THREE.Mesh(new THREE.SphereGeometry(0.013, 12, 8), tongueMat));
    oT.position.set(0, -0.015, 0.004);
    oT.scale.set(1.2, 0.6, 0.5);
    shapes.o.add(oT);
    const gBack = keep(new THREE.Mesh(new THREE.CapsuleGeometry(0.014, mw * 1.2, 4, 12).rotateZ(Math.PI / 2), lipMat));
    gBack.scale.set(1, 1, 0.4);
    shapes.gritted.add(gBack);
    const gTeeth = keep(new THREE.Mesh(new THREE.CapsuleGeometry(0.0105, mw * 1.12, 4, 12).rotateZ(Math.PI / 2), toothMat));
    gTeeth.position.z = 0.003;
    gTeeth.scale.set(1, 1, 0.4);
    shapes.gritted.add(gTeeth);
    const gyIn = keep(new THREE.Mesh(half(mw * 1.05), mouthMat));
    gyIn.scale.set(1, 0.6, 0.35);
    shapes.guilty.add(gyIn);
    const gyT = keep(new THREE.Mesh(new THREE.CapsuleGeometry(0.008, mw * 1.5, 4, 12).rotateZ(Math.PI / 2), toothMat));
    gyT.position.set(0, -0.006, 0.006);
    gyT.scale.set(1, 1, 0.5);
    shapes.guilty.add(gyT);
    shapes.guilty.add(keep(new THREE.Mesh(tube(smileArc(mw * 1.08, 0), 0.004), lipMat)));
  }
  for (const [k, m] of Object.entries(shapes)) {
    m.visible = k === 'smile';
    mouth.add(m);
  }
  let mouthNow = 'smile';
  const mouthPop = new Spring(260, 18);

  // Cheeks (a little blush).
  for (const s of ['L', 'R']) {
    const c = new THREE.Group();
    attach(c, `cheek${s}`, 0.002);
    c.add(keep(new THREE.Mesh(new THREE.CircleGeometry(0.026 * H, 20), new THREE.MeshBasicMaterial({ color: '#FF8A7A', transparent: true, opacity: 0.3, depthWrite: false }))));
  }

  // Pyjama buttons and the pocket.
  const buttonMat = felt(look.trim ?? '#FFF1D6', 0.6, { clearcoat: 0.5 });
  if (!bear) {
    for (const k of ['button1', 'button2', 'button3']) {
      const g = new THREE.Group();
      attach(g, k, 0.002);
      g.add(keep(new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.013, 0.006, 14).rotateX(Math.PI / 2), buttonMat)));
    }
  }
  if (!bear && look.symbol) {
    const pocket = new THREE.Group();
    attach(pocket, 'pocket', 0.003);
    pocket.add(keep(new THREE.Mesh(new THREE.PlaneGeometry(0.075, 0.075), new THREE.MeshStandardMaterial({ map: symbolTexture(look.symbol, look.cloth, look.clothDark), roughness: 0.9, transparent: true }))));
  }

  // Glasses (Mimic) and the sleep mask (Dozy).
  if (look.extra === 'glasses') {
    const glasses = new THREE.Group();
    const frameMat = new THREE.MeshStandardMaterial({ color: '#2A2420', roughness: 0.4, metalness: 0.3 });
    for (const s of ['L', 'R']) {
      const a = anchors[`eye${s}`];
      const ring = keep(new THREE.Mesh(new THREE.TorusGeometry(eyeR * 1.3, 0.005, 8, 28), frameMat));
      ring.position.set(a.p[0] - joints.head[0] + a.n[0] * 0.018, a.p[1] - joints.head[1] + a.n[1] * 0.018, a.p[2] - joints.head[2] + a.n[2] * 0.018);
      faceAlong(ring, a.n);
      glasses.add(ring);
    }
    const bridge = keep(new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.04, 6).rotateZ(Math.PI / 2), frameMat));
    const al = anchors.eyeL.p;
    bridge.position.set(0, al[1] - joints.head[1] + 0.008, al[2] - joints.head[2] + 0.03);
    glasses.add(bridge);
    B.head.add(glasses);
  }
  if (look.extra === 'mask') {
    const mask = new THREE.Group();
    const a = anchors.browL;
    const m = keep(new THREE.Mesh(new THREE.CapsuleGeometry(0.035, 0.12, 6, 14).rotateZ(Math.PI / 2), felt('#5B5BAA', 0.9)));
    m.scale.set(1, 0.8, 0.45);
    mask.add(m);
    for (const s of [-1, 1]) {
      const z = keep(new THREE.Mesh(new THREE.TorusGeometry(0.014, 0.003, 6, 14, Math.PI), felt('#FFE08A', 0.8)));
      z.position.set(s * 0.04, 0, 0.016);
      z.rotation.z = Math.PI;
      mask.add(z);
    }
    mask.position.set(0, a.p[1] - joints.head[1] + 0.03, a.p[2] - joints.head[2] - 0.01);
    mask.rotation.x = -0.35;
    B.head.add(mask);
  }

  // The bump on the head (a bandage) after falling off.
  const bandage = new THREE.Group();
  attach(bandage, 'bump', 0.002);
  const bandMat = felt('#F4E2C8', 0.9);
  for (const r of [0.6, -0.6]) {
    const s = keep(new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.028, 0.008), bandMat));
    s.rotation.z = r;
    bandage.add(s);
  }
  bandage.visible = false;

  // The hat (from the wardrobe), the pillow helmet and the banana.
  let hat = null;
  const crown = anchors.crown;
  function setHat(id) {
    if (hat) {
      hat.removeFromParent();
      hat.traverse((o) => o.geometry?.dispose());
      hat = null;
    }
    if (!id || id === 'none') return;
    hat = buildHat(id, { color: look.cloth, dark: look.clothDark, head: H, bear });
    if (!hat) return;
    hat.position.set(crown.p[0] - joints.head[0], crown.p[1] - joints.head[1], crown.p[2] - joints.head[2]);
    B.head.add(hat);
  }
  setHat(look.hat);
  const helmet = new THREE.Group();
  {
    const p = keep(new THREE.Mesh(pillowGeometry(0.34 * H, 0.1, 0.27 * H), pillowMat));
    p.position.y = 0.035;
    helmet.add(p);
    const tie = keep(new THREE.Mesh(new THREE.TorusGeometry(0.2 * H, 0.008, 6, 30), felt('#E5483C', 0.8)));
    tie.rotation.y = Math.PI / 2;
    tie.position.y = -0.1;
    tie.scale.set(1, 1.15, 0.92);
    helmet.add(tie);
    helmet.position.set(crown.p[0] - joints.head[0], crown.p[1] - joints.head[1], crown.p[2] - joints.head[2]);
    helmet.visible = false;
    B.head.add(helmet);
  }
  const banana = keep(new THREE.Mesh(bananaGeometry(1.2), bananaMat));
  {
    const a = anchors.handR;
    const bw = joints.handR;
    banana.position.set(a.p[0] - bw[0] + 0.02, a.p[1] - bw[1] + 0.02, a.p[2] - bw[2] + 0.01);
    banana.rotation.set(0.3, 0.2, 1.2);
    banana.visible = false;
    B.handR.add(banana);
  }
  const heldPillow = keep(new THREE.Mesh(pillowGeometry(0.2, 0.07, 0.15), pillowMat));
  heldPillow.position.set(0.03, -0.03, 0.04);
  heldPillow.visible = false;
  B.handR.add(heldPillow);

  // --- motion state ---
  const st = {
    t: Math.random() * 10, blinkAt: 1 + Math.random() * 3, blink: 0, spin: 0, spinAxis: 'x', spinDir: 1, launchedAt: -1,
    prevVy: 0, perfectAt: -9, squash: new Spring(240, 15), lean: [new Spring(90, 14), new Spring(90, 14)],
    tail: Array.from({ length: 6 }, () => [new Spring(60, 6), new Spring(60, 6)]), ears: [new Spring(150, 8), new Spring(150, 8)],
    look: new THREE.Vector2(), lookT: new THREE.Vector2(), pupil: new THREE.Vector2(), brow: 0, lid: 0, cheerHop: 0,
  };
  const headQ = new THREE.Quaternion();
  const inv = new THREE.Quaternion();
  // The mixer only writes a bone when its blended value changes, so a held pose would let the layers below (lean, look,
  // springs) pile up frame after frame. Keep the mixer's own result and put it back before every frame.
  const layered = ['spine', 'head', 'earL', 'earR', 'tail1', 'tail2', 'tail3', 'tail4', 'tail5', 'tail6'].map((n) => B[n]);
  const baseQ = layered.map((b) => b.quaternion.clone());
  const dv = new THREE.Vector3();

  function setMouth(name) {
    if (!shapes[name]) name = 'smile';
    if (name === mouthNow) return;
    shapes[mouthNow].visible = false;
    shapes[name].visible = true;
    mouthNow = name;
    mouthPop.x = 0.6;
  }

  /**
   * Pose from the world each frame. s: {
   *   x, y, z, yaw, scale, mode ('contact' | 'air' | 'launched' | 'dive' | 'falling' | 'sit' | 'hop' | 'stand' | 'cheer'
   *   | 'dance' | 'guilty' | 'wave' | 'throw' | 'splat'), prog (contact 0-1), low, vy, v0, tier, pump (bool), perfect
   *   (bool, this frame), flipT (0-1 through a top-tier flip, or null), vx, vz, teeter (0-1), mega, shield, ghost, mouth,
   *   brow, lids, lookAt (Vector3|null), dance, tumble, launchId, dizzy (0-1), bandage, holding ('pillow' | ''), hopPhase
   * }
   */
  function update(s, dt) {
    st.t += dt;
    const t = st.t;
    group.position.set(s.x, s.y, s.z);
    group.rotation.y = s.yaw ?? 0;
    group.scale.setScalar(s.scale ?? 1);
    const mode = s.mode ?? 'stand';
    anim.clear();
    let squashT = 0;
    let face = 'smile';
    let browT = 0;
    let lidsT = 0;
    let rootPitch = 0;
    let rootRoll = 0;
    let rootYaw = 0;
    let lift = 0;
    const v0 = s.v0 ?? 7;
    const vy = s.vy ?? 0;
    if (s.perfect) st.perfectAt = t;
    switch (mode) {
      case 'contact': {
        const k = Math.sin(Math.min(1, s.prog ?? 0) * Math.PI);
        const deep = s.low ? 1.15 : s.pump ? 1.2 : 0.9;
        squashT = k * deep;
        anim.want(s.pump ? 'pump' : 'crouch', 0.15 + k, 40);
        anim.want('stand', 1 - k, 40);
        face = s.low ? 'gritted' : s.pump ? 'grin' : 'smile';
        break;
      }
      case 'air': {
        const r = Math.max(0, Math.min(1, vy / (0.55 * v0)));
        const f = Math.max(0, Math.min(1, -vy / (0.55 * v0)));
        const ap = Math.max(0, 1 - r - f);
        const top = (s.tier ?? 0) >= 2 && !s.low;
        const star = t - st.perfectAt < 0.9 && top;
        anim.want('rise', r, 18);
        anim.want(star ? 'star' : 'apex', ap, 12);
        anim.want('fall', f, 14);
        if (s.low) {
          anim.want('crouch', 0.4, 12);
          face = 'gritted';
        } else face = vy > 1 ? 'grin' : 'smile';
        squashT = -Math.min(0.2, (Math.abs(vy) / v0) * 0.2);
        if (s.flipT != null) rootPitch = s.flipT * Math.PI * 2;
        break;
      }
      case 'dive':
        anim.want('tuck', 1, 30);
        face = 'gritted';
        browT = -1;
        squashT = -0.12;
        rootPitch = 0.4;
        break;
      case 'launched': {
        anim.want('flail', 1, 16);
        face = 'o';
        browT = 1;
        if (st.launchedAt !== s.launchId) {
          st.launchedAt = s.launchId;
          st.spin = 0;
          st.spinAxis = Math.abs(s.vx ?? 0) > Math.abs(s.vz ?? 0) ? 'z' : 'x';
          st.spinDir = (st.spinAxis === 'z' ? -Math.sign(s.vx ?? 1) : Math.sign(s.vz ?? 1)) || 1;
        }
        const rate = (s.tumble ?? 0) > 0 ? 11 : 6;
        st.spin += dt * rate * st.spinDir;
        if (st.spinAxis === 'z') rootRoll = st.spin;
        else rootPitch = st.spin;
        break;
      }
      case 'falling':
        anim.want('scream', 1, 18);
        face = 'o';
        browT = 1.2;
        break;
      case 'splat':
        anim.want('sit', 0.6, 30);
        anim.want('crouch', 0.4, 30);
        squashT = 0.6;
        face = 'o';
        browT = 1;
        lidsT = 0.5;
        break;
      case 'sit':
        anim.want((s.dizzy ?? 0) > 0.2 ? 'dizzy' : 'sit', 1, 6);
        face = (s.dizzy ?? 0) > 0.2 ? 'worried' : 'smile';
        browT = (s.dizzy ?? 0) > 0.2 ? 0.8 : 0.2;
        lidsT = (s.dizzy ?? 0) > 0.2 ? 0.45 : 0;
        break;
      case 'throw':
        anim.want('throw', 1, 20);
        face = 'grin';
        browT = -0.6;
        break;
      case 'hop': {
        const ph = s.hopPhase ?? 0;
        const near = (c, w) => Math.max(0, 1 - Math.abs(ph - c) / w);
        anim.want('crouch', near(0, 0.2) + near(1, 0.2), 30);
        anim.want('rise', near(0.25, 0.25), 30);
        anim.want('apex', near(0.5, 0.25), 30);
        anim.want('fall', near(0.75, 0.25), 30);
        break;
      }
      case 'cheer':
        anim.want('cheer', 1, 10);
        face = 'grin';
        browT = 0.5;
        st.cheerHop += dt;
        lift = Math.abs(Math.sin(st.cheerHop * Math.PI * 1.9)) * 0.08;
        break;
      case 'wave':
        anim.want('wave', 1, 8);
        face = 'grin';
        browT = 0.4;
        break;
      case 'guilty':
        anim.want('guilty', 1, 10);
        face = 'guilty';
        browT = 0.9;
        lidsT = 0.1;
        break;
      case 'dance': {
        const d = s.dance ?? 'cheer';
        st.cheerHop += dt;
        const ph = st.cheerHop;
        face = 'grin';
        browT = 0.5;
        if (d === 'cartwheel') {
          anim.want('star', 1, 10);
          rootRoll = ph * 5.2;
          lift = 0.25 + Math.abs(Math.sin(ph * 2.6)) * 0.1;
        } else if (d === 'thump') {
          anim.want('thump', 1, 10);
          face = 'gritted';
          lift = Math.abs(Math.sin(ph * Math.PI * 2)) * 0.03;
        } else if (d === 'flop') {
          anim.want('swim', 1, 10);
          rootPitch = 1.45;
          lift = 0.18 + Math.abs(Math.sin(ph * 3)) * 0.12;
        } else if (d === 'worm') {
          anim.want('worm', 1, 10);
          rootPitch = 1.5;
          lift = 0.1;
        } else if (d === 'hug') {
          anim.want('sway', 1, 6);
          face = 'smile';
          lidsT = 0.7;
        } else if (d === 'spin') {
          anim.want('star', 1, 10);
          rootYaw = ph * 9;
          lift = 0.04;
        } else if (d === 'float') {
          anim.want('float', 1, 6);
          lift = 0.25 + Math.sin(ph * 1.6) * 0.08;
          lidsT = 0.8;
        } else if (d === 'lullaby') {
          anim.want('rock', 1, 6);
          face = 'sleepy';
          lidsT = 1;
        } else {
          anim.want('cheer', 1, 10);
          lift = Math.abs(Math.sin(ph * Math.PI * 1.9)) * 0.08;
        }
        break;
      }
      case 'clip':
        anim.want(s.clip, 1, 30);
        break;
      default:
        anim.want('breathe', 1, 6);
    }
    if ((s.teeter ?? 0) > 0 && (mode === 'contact' || mode === 'air')) {
      anim.want('teeter', s.teeter * 2.5, 12);
      face = 'worried';
      browT = 0.9;
    }
    if (s.mouth) face = s.mouth;
    if (s.brow != null) browT = s.brow;
    if (s.lids != null) lidsT = s.lids;
    layered.forEach((b, i) => b.quaternion.copy(baseQ[i]));
    anim.update(dt);
    layered.forEach((b, i) => baseQ[i].copy(b.quaternion));

    // Root: squash and stretch around the belly, flips and spins.
    const sq = st.squash.step(squashT, dt);
    const sy = Math.max(0.55, 1 - sq * 0.32);
    const sxz = 1 / Math.sqrt(sy);
    pivot.scale.set(sxz, sy, sxz);
    pivot.rotation.set(rootPitch, rootYaw, rootRoll);
    pivot.position.y = pivotY + lift;

    // Lean into the steer (in the monkey's own frame).
    const yaw = s.yaw ?? 0;
    const lx = (s.vx ?? 0) * Math.cos(yaw) - (s.vz ?? 0) * Math.sin(yaw);
    const lz = (s.vx ?? 0) * Math.sin(yaw) + (s.vz ?? 0) * Math.cos(yaw);
    const moving = mode === 'air' || mode === 'contact';
    const leanR = st.lean[0].step(moving ? -lx * 0.07 : 0, dt);
    const leanF = st.lean[1].step(moving ? lz * 0.06 : 0, dt);
    B.spine.quaternion.multiply(tmpQ.setFromEuler(tmpE.set(leanF, 0, leanR)));

    // Vertical acceleration drives the tail and ears.
    const acc = (vy - st.prevVy) / Math.max(dt, 1 / 240);
    st.prevVy = vy;
    const kick = Math.max(-60, Math.min(60, acc)) * 0.004;
    for (let i = 0; i < 6; i++) {
      const [sx, sz] = st.tail[i];
      const sway = Math.sin(t * 2.1 - i * 0.7) * 0.07 * (1 + i * 0.2);
      const ax = sx.step(kick * (1 + i * 0.25) + (mode === 'launched' ? 0.3 : 0), dt);
      const az = sz.step(sway - leanR * 0.6, dt);
      B[`tail${i + 1}`].quaternion.multiply(tmpQ.setFromEuler(tmpE.set(ax, 0, az)));
    }
    const e1 = st.ears[0].step(kick * 2.2, dt);
    const e2 = st.ears[1].step(kick * 2.2, dt);
    B.earL.quaternion.multiply(tmpQ.setFromEuler(tmpE.set(e1 * 0.6, 0, -e1)));
    B.earR.quaternion.multiply(tmpQ.setFromEuler(tmpE.set(e2 * 0.6, 0, e2)));

    // The head looks at things (a little), the pupils look more.
    if (s.lookAt) {
      group.updateMatrixWorld(true);
      B.head.getWorldPosition(tmpV);
      dv.copy(s.lookAt).sub(tmpV);
      inv.copy(group.quaternion).invert();
      dv.applyQuaternion(inv);
      const ly = Math.atan2(dv.x, Math.max(0.1, dv.z));
      const lp = Math.atan2(-dv.y, Math.hypot(dv.x, dv.z));
      st.lookT.set(Math.max(-0.9, Math.min(0.9, ly)), Math.max(-0.5, Math.min(0.6, lp)));
    } else st.lookT.set(Math.sin(t * 0.37) * 0.25, Math.sin(t * 0.23) * 0.1);
    st.look.lerp(st.lookT, 1 - Math.exp(-dt * 5));
    headQ.setFromEuler(tmpE.set(st.look.y * 0.45, st.look.x * 0.5, 0));
    B.head.quaternion.multiply(headQ);
    st.pupil.lerp(st.lookT, 1 - Math.exp(-dt * 14));
    for (const e of eyes) {
      e.pupilG.position.x = Math.max(-1, Math.min(1, st.pupil.x * 1.6)) * eyeR * 0.32;
      e.pupilG.position.y = Math.max(-1, Math.min(1, -st.pupil.y * 1.8)) * eyeR * 0.3;
    }

    // Blinks and lids.
    if (t > st.blinkAt) {
      st.blink = 1;
      st.blinkAt = t + 2 + Math.random() * 3.5;
    }
    st.blink = Math.max(0, st.blink - dt * 9);
    const blinkK = st.blink > 0 ? Math.sin(st.blink * Math.PI) : 0;
    const restLid = look.extra === 'mask' && mode !== 'launched' && mode !== 'falling' ? 0.35 : 0;
    st.lid += (Math.max(lidsT, restLid) - st.lid) * (1 - Math.exp(-dt * 10));
    const lidK = Math.min(1, st.lid + blinkK);
    for (const e of eyes) {
      e.lid.scale.y = Math.max(0.01, lidK * 1.02);
      e.lid.visible = lidK > 0.02;
    }

    // Brows.
    st.brow += (browT - st.brow) * (1 - Math.exp(-dt * 12));
    for (const b of brows) {
      b.g.position.copy(b.base);
      b.g.position.y += st.brow * 0.012;
      b.m.rotation.z = b.side * (st.brow < 0 ? -st.brow * 0.45 : -st.brow * 0.3);
    }

    // The mouth.
    setMouth(face);
    const pop = mouthPop.step(0, dt);
    const open = face === 'o' ? 1 + Math.sin(t * 18) * 0.12 + Math.min(0.4, Math.max(0, -vy) * 0.03) : 1;
    shapes[mouthNow].scale.setScalar((1 + pop * 0.5) * open);

    // Toys and marks.
    banana.visible = !!s.mega;
    if (s.mega) banana.rotation.z = 1.2 + Math.sin(t * 6) * 0.15;
    helmet.visible = !!s.shield;
    bandage.visible = !!s.bandage;
    heldPillow.visible = s.holding === 'pillow';
    mesh.visible = !s.ghost || Math.floor(t * 12) % 2 === 0;
    if (hat?.userData.spin) hat.userData.spin(t);
  }

  function setLook(next) {
    look = { ...look, ...next };
    setPlushLook(mat, look);
    if (next.hat !== undefined) setHat(next.hat);
  }

  function dispose() {
    group.removeFromParent();
    geo.dispose();
    mat.dispose();
    for (const p of parts) p.geometry?.dispose();
    if (hat) hat.traverse((o) => o.geometry?.dispose());
  }

  return {
    group, mesh, bones: B, update, setLook, dispose, anim, pivot,
    get look() {
      return look;
    },
    head: B.head,
    headWorld(out = new THREE.Vector3()) {
      group.updateMatrixWorld(true);
      return B.head.getWorldPosition(out);
    },
    handWorld(out = new THREE.Vector3()) {
      group.updateMatrixWorld(true);
      return B.handR.getWorldPosition(out);
    },
  };
}
