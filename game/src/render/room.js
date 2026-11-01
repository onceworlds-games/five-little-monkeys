// The bedroom around the bed, at toy scale (1 u = 25 cm): a wood floor, painted plaster over wainscoting, a window with
// velvet curtains, the night outside and a beam of moonlight with dust in it, a nightstand with its lamp and alarm clock,
// toys, a wool rug, fairy lights, the door Mama opens, and the bed itself (frame, mattress, quilt, headboard, posts).
// Procedural pieces are merged by material; the CC0 models and texture maps (props.js) load once and are shared.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { quiltGeometry, quiltMaterial } from './quilt.js';
import { quiltTextures, canvas, blobTexture } from './textures.js';
import { loadProps, placeProp, texture, texturesReady } from './props.js';
import { lowMaterial, lowify } from './lowmat.js';
import { createRng } from '../sim/rng.js';

const OVER = 0.75;

/** Each bed's room: wall paint, wainscot, frame wood, sheet, curtains, rug tint, quilt fabrics. */
export const ROOM_LOOKS = {
  kid: { wall: '#7C97CC', wainscot: '#F1E6D0', wood: '#B98258', sheet: '#EDE6D6', curtain: '#C7413A', rug: '#F6DCC0', quilt: ['#D9473B', '#F2B544', '#3F6FB0', '#E9DFC8', '#4D8F6A', '#C46A3A'] },
  bunk: { wall: '#86AE94', wainscot: '#EFE8D6', wood: '#E0D5C2', sheet: '#DCE4EA', curtain: '#3D5C8A', rug: '#E4F0FF', quilt: ['#3F7FB0', '#F2B544', '#D9473B', '#E9DFC8', '#6A5AA8', '#4D8F6A'] },
  water: { wall: '#C98F64', wainscot: '#F3E2C6', wood: '#7A4E30', sheet: '#2E6E8E', curtain: '#2F6F6A', rug: '#FFE6C8', quilt: ['#C8752E', '#E3B04B', '#7A5A3A', '#EAD9B6', '#A64A2E', '#5E7A4A'] },
  king: { wall: '#9472A4', wainscot: '#F0E2D4', wood: '#5A3626', sheet: '#F1E6D2', curtain: '#8E1E2E', rug: '#FFD8D0', quilt: ['#9E1E30', '#D4A84A', '#7A1424', '#EDE0C0', '#B8323F', '#C9A24A'] },
  poster: { wall: '#A295C8', wainscot: '#F3ECDD', wood: '#6A4030', sheet: '#F3EBD8', curtain: '#B56A8A', rug: '#F4E0FF', quilt: ['#C77A9A', '#EAD9B0', '#6A8FB0', '#F3EBD8', '#9AB27A', '#D9A0A0'] },
};

class Merger {
  constructor() {
    this.byMat = new Map();
  }
  box(mat, x0, x1, y0, y1, z0, z1, round = 0) {
    const g = round > 0 ? roundedBox(x1 - x0, y1 - y0, z1 - z0, round) : new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0);
    g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    this.add(mat, g);
  }
  add(mat, g) {
    let geo = g.index ? g.toNonIndexed() : g;
    for (const k of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv'].includes(k)) geo.deleteAttribute(k);
    if (!geo.attributes.normal) geo.computeVertexNormals();
    if (!geo.attributes.uv) geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2));
    if (mat.userData.worldUV) geo = boxUV(geo, mat.userData.worldUV);
    if (!this.byMat.has(mat)) this.byMat.set(mat, []);
    this.byMat.get(mat).push(geo);
  }
  build(parent, { cast = false, receive = true } = {}) {
    const out = [];
    for (const [mat, list] of this.byMat) {
      const m = new THREE.Mesh(mergeGeometries(list), mat);
      m.castShadow = cast;
      m.receiveShadow = receive;
      parent.add(m);
      out.push(m);
    }
    return out;
  }
}

/** Texture coordinates from world position along each face's main axis (wood and plaster line up across pieces). */
function boxUV(geo, k) {
  const p = geo.attributes.position;
  const n = geo.attributes.normal;
  const uv = geo.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i));
    const ay = Math.abs(n.getY(i));
    const az = Math.abs(n.getZ(i));
    if (ay >= ax && ay >= az) uv.setXY(i, p.getX(i) * k, p.getZ(i) * k);
    else if (ax >= az) uv.setXY(i, p.getZ(i) * k, p.getY(i) * k);
    else uv.setXY(i, p.getX(i) * k, p.getY(i) * k);
  }
  return geo;
}

function roundedBox(w, h, d, r) {
  // A box with puffed edges: a box geometry with its vertices pulled toward a rounded shape.
  const g = new THREE.BoxGeometry(w, h, d, 8, 6, 8);
  const p = g.attributes.position;
  const v = new THREE.Vector3();
  const c = new THREE.Vector3();
  const hw = w / 2 - r;
  const hh = h / 2 - r;
  const hd = d / 2 - r;
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    c.set(THREE.MathUtils.clamp(v.x, -hw, hw), THREE.MathUtils.clamp(v.y, -hh, hh), THREE.MathUtils.clamp(v.z, -hd, hd));
    const nrm = v.clone().sub(c);
    if (nrm.lengthSq() > 1e-8) v.copy(c.add(nrm.normalize().multiplyScalar(r)));
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

/** A turned piece (lathe) from a profile of [radius, height] pairs. */
function turned(profile, seg = 18) {
  return new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), seg);
}

const tex = (c, srgb = true) => {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
};

/** The night outside: deep blue with stars, the moon with its halo, roofs, chimneys and a lit window or two. */
function nightTexture(seed) {
  const c = canvas(512, 512);
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0, '#070D24');
  grad.addColorStop(0.6, '#1B2A58');
  grad.addColorStop(1, '#3A4A80');
  g.fillStyle = grad;
  g.fillRect(0, 0, 512, 512);
  const rng = createRng(`sky:${seed}`);
  for (let i = 0; i < 160; i++) {
    g.globalAlpha = rng.range(0.25, 1);
    g.fillStyle = rng.next() < 0.15 ? '#FFE7B0' : '#FFFFFF';
    const s = rng.range(0.8, 2.6);
    g.fillRect(rng.range(0, 512), rng.range(0, 360), s, s);
  }
  g.globalAlpha = 1;
  const mx = 170;
  const my = 130;
  const halo = g.createRadialGradient(mx, my, 30, mx, my, 190);
  halo.addColorStop(0, 'rgba(190,210,255,0.55)');
  halo.addColorStop(1, 'rgba(190,210,255,0)');
  g.fillStyle = halo;
  g.fillRect(0, 0, 512, 512);
  g.fillStyle = '#FBF6E4';
  g.beginPath();
  g.arc(mx, my, 48, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = 'rgba(160,160,190,0.3)';
  for (const [x, y, r] of [[-14, -10, 11], [14, 12, 8], [-2, 22, 6], [18, -16, 7], [-22, 14, 4]]) {
    g.beginPath();
    g.arc(mx + x, my + y, r, 0, Math.PI * 2);
    g.fill();
  }
  // A tree and roofs.
  g.fillStyle = '#0A1022';
  for (let i = 0; i < 26; i++) {
    g.beginPath();
    g.arc(430 + rng.range(-50, 50), 300 + rng.range(-70, 60), rng.range(26, 46), 0, Math.PI * 2);
    g.fill();
  }
  g.fillRect(424, 330, 14, 182);
  g.fillStyle = '#080C1C';
  let x = -20;
  while (x < 530) {
    const w = rng.range(80, 140);
    const h = rng.range(70, 130);
    g.beginPath();
    g.moveTo(x, 512);
    g.lineTo(x, 512 - h);
    g.lineTo(x + w / 2, 512 - h - rng.range(30, 60));
    g.lineTo(x + w, 512 - h);
    g.lineTo(x + w, 512);
    g.fill();
    if (rng.next() < 0.6) g.fillRect(x + w * 0.7, 512 - h - 50, 12, 40);
    if (rng.next() < 0.7) {
      g.fillStyle = '#FFC86A';
      g.fillRect(x + w * rng.range(0.2, 0.6), 512 - h + rng.range(20, 50), 12, 14);
      g.fillStyle = '#080C1C';
    }
    x += w + rng.range(-10, 20);
  }
  return tex(c);
}

/** A child's crayon drawing taped to the wall. */
function drawingTexture(kind, seed) {
  const c = canvas(256, 192);
  const g = c.getContext('2d');
  g.fillStyle = '#FBF7EC';
  g.fillRect(0, 0, 256, 192);
  const rng = createRng(`draw:${seed}:${kind}`);
  g.lineCap = 'round';
  g.lineJoin = 'round';
  const crayon = (col, w, pts) => {
    g.strokeStyle = col;
    g.lineWidth = w;
    g.beginPath();
    pts.forEach(([x, y], i) => (i ? g.lineTo(x + rng.range(-2, 2), y + rng.range(-2, 2)) : g.moveTo(x, y)));
    g.stroke();
  };
  if (kind === 'monkeys') {
    crayon('#C0392B', 6, [[30, 150], [226, 150], [226, 120], [30, 120], [30, 150]]);
    crayon('#C0392B', 6, [[40, 150], [40, 176]]);
    crayon('#C0392B', 6, [[216, 150], [216, 176]]);
    for (let i = 0; i < 5; i++) {
      const cx = 52 + i * 38;
      const cy = 64 + Math.sin(i * 1.7) * 18;
      g.fillStyle = '#7A4B2E';
      g.beginPath();
      g.arc(cx, cy, 13, 0, Math.PI * 2);
      g.fill();
      g.beginPath();
      g.arc(cx - 12, cy - 4, 5, 0, Math.PI * 2);
      g.arc(cx + 12, cy - 4, 5, 0, Math.PI * 2);
      g.fill();
      crayon('#7A4B2E', 5, [[cx, cy + 12], [cx, cy + 32]]);
      crayon('#7A4B2E', 4, [[cx - 14, cy + 6], [cx, cy + 18], [cx + 14, cy + 6]]);
      crayon('#7A4B2E', 4, [[cx - 8, cy + 46], [cx, cy + 32], [cx + 8, cy + 46]]);
    }
    crayon('#F2B544', 4, [[200, 26], [214, 14], [228, 26]]);
  } else if (kind === 'rocket') {
    crayon('#3C86F0', 6, [[128, 20], [160, 70], [150, 150], [106, 150], [96, 70], [128, 20]]);
    crayon('#E5483C', 8, [[110, 160], [128, 186], [146, 160]]);
    g.fillStyle = '#F6C239';
    g.beginPath();
    g.arc(128, 80, 14, 0, Math.PI * 2);
    g.fill();
    for (let i = 0; i < 9; i++) {
      const sx = i % 2 ? rng.range(176, 246) : rng.range(10, 80);
      const sy = rng.range(10, 180);
      crayon('#F6C239', 3, [[sx - 5, sy], [sx + 5, sy]]);
      crayon('#F6C239', 3, [[sx, sy - 5], [sx, sy + 5]]);
    }
  } else {
    g.fillStyle = '#F6C239';
    g.beginPath();
    g.arc(204, 44, 24, 0, Math.PI * 2);
    g.fill();
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      crayon('#F6C239', 3, [[204 + Math.cos(a) * 30, 44 + Math.sin(a) * 30], [204 + Math.cos(a) * 42, 44 + Math.sin(a) * 42]]);
    }
    crayon('#E5483C', 6, [[50, 170], [50, 100], [100, 58], [150, 100], [150, 170], [50, 170]]);
    crayon('#3C86F0', 5, [[88, 170], [88, 132], [112, 132], [112, 170]]);
    crayon('#39B86E', 8, [[0, 180], [256, 176]]);
  }
  return tex(c);
}

/** Moonlight on the floor: the window's four panes, soft at the edges. */
function poolTexture() {
  const c = canvas(256, 256);
  const g = c.getContext('2d');
  g.filter = 'blur(10px)';
  g.fillStyle = 'rgba(160,190,255,1)';
  const m = 22;
  const gap = 12;
  const h = (256 - 2 * m - gap) / 2;
  for (const [x, y] of [[m, m], [m + h + gap, m], [m, m + h + gap], [m + h + gap, m + h + gap]]) g.fillRect(x, y, h, h);
  return tex(c);
}

/** A rug: a thick oval of wool with a rolled edge. */
function rugGeometry(rx, rz, seg = 64) {
  const shape = new THREE.Shape();
  shape.absellipse(0, 0, rx, rz, 0, Math.PI * 2, false, 0);
  const g = new THREE.ExtrudeGeometry(shape, { depth: 0.05, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.1, bevelSegments: 4, curveSegments: seg });
  g.rotateX(-Math.PI / 2);
  const p = g.attributes.position;
  const uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / 5, p.getZ(i) / 5);
  return g;
}

/** A pleated curtain `w` wide and `h` tall (centred), its folds `depth` deep; `tie` gathers the lower part. */
function curtainGeometry(w, h, folds = 7, depth = 0.18, tie = 0) {
  const g = new THREE.PlaneGeometry(w, h, folds * 8, 20);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const u = (x + w / 2) / w;
    const v = (y + h / 2) / h;
    const z = Math.sin(u * folds * Math.PI * 2) * depth * (0.7 + 0.3 * (1 - v));
    const pull = tie * Math.max(0, 0.45 - Math.abs(v - 0.35)) * 1.2;
    p.setXYZ(i, x - (x - tie * w * 0.5) * pull * 0.55, y, z);
  }
  g.computeVertexNormals();
  return g;
}

/**
 * Build the room for `bed`. `u` the shared ring uniforms. quality: 'low' | 'medium' | 'high'.
 * Returns { group, quilts, lamp, update(t, info), door, back, W, lampPos, window, ready, dispose } where info: { wild,
 * door (0-1), spot, ring (0-1), dark (0-1, lights out) }.
 */
export function buildRoom(bed, u, quality) {
  const R = ROOM_LOOKS[bed.id] ?? ROOM_LOOKS.kid;
  const group = new THREE.Group();
  const own = []; // geometries, materials and canvases this room made (props and texture maps are shared)
  const hi = quality === 'high';
  const low = quality === 'low';
  const mat = (m) => {
    const out = low ? lowMaterial(m) : m;
    if (out !== m) m.dispose();
    own.push(out);
    return out;
  };
  const M = new Merger();
  const fl = bed.floor;
  const box = bed.box;
  const back = box.z0 - 1.3;
  const W = box.x1 + 7.2;
  const top = fl + 15;
  const front = box.z1 + 14;

  // --- materials ---
  const floorMat = mat(new THREE.MeshStandardMaterial({
    map: texture('floor_diff', { srgb: true }), normalMap: texture('floor_nor'), roughnessMap: texture('floor_rough'),
    color: '#E6D2BE', roughness: 1, normalScale: new THREE.Vector2(0.8, 0.8),
  }));
  const plaster = mat(new THREE.MeshStandardMaterial({ color: R.wall, map: texture('plaster_diff', { srgb: true }), normalMap: texture('plaster_nor'), roughness: 0.95 }));
  plaster.userData.worldUV = 1 / 10;
  const wainscot = mat(new THREE.MeshStandardMaterial({ color: R.wainscot, map: texture('planks_diff', { srgb: true }), normalMap: texture('planks_nor'), roughness: 0.7 }));
  wainscot.userData.worldUV = 1 / 6;
  const trim = mat(new THREE.MeshStandardMaterial({ color: '#F6EFE2', roughness: 0.5 }));
  const wood = mat(new THREE.MeshStandardMaterial({
    color: R.wood, map: texture('floor_diff', { srgb: true }), normalMap: texture('floor_nor'), roughness: 0.5, normalScale: new THREE.Vector2(0.4, 0.4),
  }));
  wood.userData.worldUV = 1 / 7;
  const sheet = mat(new THREE.MeshPhysicalMaterial({ color: R.sheet, normalMap: texture('linen_nor'), roughness: 0.9, sheen: 0.6, sheenRoughness: 0.7, sheenColor: new THREE.Color('#ffffff') }));
  sheet.userData.worldUV = 1 / 2;
  const velvet = mat(new THREE.MeshPhysicalMaterial({
    color: R.curtain, normalMap: texture('velvet_nor', { repeat: 2 }), roughness: 0.85, sheen: 1, sheenRoughness: 0.35,
    sheenColor: new THREE.Color(R.curtain).lerp(new THREE.Color('#ffffff'), 0.5), side: THREE.DoubleSide,
  }));

  // --- floor and walls ---
  const floorGeo = new THREE.PlaneGeometry(2 * W + 2, front - back + 2).rotateX(-Math.PI / 2);
  floorGeo.translate(0, fl, (front + back) / 2);
  {
    const p = floorGeo.attributes.position;
    const uv = floorGeo.attributes.uv;
    for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / 9, p.getZ(i) / 9);
  }
  own.push(floorGeo);
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.receiveShadow = true;
  group.add(floor);

  const winX0 = box.x0 - 4.8;
  const winX1 = box.x0 - 1.2;
  const winY0 = fl + 3.2;
  const winY1 = fl + 7.8;
  const doorX0 = box.x1 + 3.6;
  const doorX1 = Math.min(W - 0.5, doorX0 + 3.2);
  const doorY1 = fl + 8.2;
  const wainY = fl + 3.0;
  const T = 0.3;
  // The back wall (with the window and the door cut out): plaster over wainscoting.
  const wallPiece = (x0, x1, y0, y1) => {
    if (x1 <= x0 || y1 <= y0) return;
    if (y0 < wainY) M.box(wainscot, x0, x1, y0, Math.min(y1, wainY), back - T, back);
    if (y1 > wainY) M.box(plaster, x0, x1, Math.max(y0, wainY), y1, back - T, back);
  };
  wallPiece(-W, winX0, fl, top);
  wallPiece(winX0, winX1, fl, winY0);
  wallPiece(winX0, winX1, winY1, top);
  wallPiece(winX1, doorX0, fl, top);
  wallPiece(doorX0, doorX1, doorY1, top);
  wallPiece(doorX1, W, fl, top);
  for (const [x0, x1] of [[-W - T, -W], [W, W + T]]) {
    M.box(wainscot, x0, x1, fl, wainY, back - T, front);
    M.box(plaster, x0, x1, wainY, top, back - T, front);
  }
  // Chair rail and skirting.
  const rail = (x0, x1) => M.box(trim, x0, x1, wainY - 0.06, wainY + 0.12, back, back + 0.12);
  rail(-W, winX0 - 0.25);
  rail(winX1 + 0.25, doorX0 - 0.25);
  rail(doorX1 + 0.25, W);
  M.box(trim, -W, doorX0 - 0.25, fl, fl + 0.45, back, back + 0.1);
  M.box(trim, doorX1 + 0.25, W, fl, fl + 0.45, back, back + 0.1);
  for (const x of [-W, W - 0.12]) {
    M.box(trim, x, x + 0.12, fl, fl + 0.45, back, front);
    M.box(trim, x, x + 0.12, wainY - 0.06, wainY + 0.12, back, front);
  }

  // --- the window ---
  const fw = 0.24;
  M.box(trim, winX0 - fw - 0.1, winX1 + fw + 0.1, winY0 - 0.22, winY0, back - T, back + 0.5); // sill
  M.box(trim, winX0 - fw, winX1 + fw, winY0 - 0.6, winY0 - 0.22, back, back + 0.08);
  M.box(trim, winX0 - fw, winX1 + fw, winY1, winY1 + fw, back - T, back + 0.1);
  M.box(trim, winX0 - fw, winX0, winY0, winY1, back - T, back + 0.1);
  M.box(trim, winX1, winX1 + fw, winY0, winY1, back - T, back + 0.1);
  const midX = (winX0 + winX1) / 2;
  const midY = winY0 + (winY1 - winY0) * 0.45;
  M.box(trim, midX - 0.07, midX + 0.07, winY0, winY1, back - 0.22, back - 0.1);
  M.box(trim, winX0, winX1, midY - 0.07, midY + 0.07, back - 0.22, back - 0.1);
  const night = new THREE.Mesh(new THREE.PlaneGeometry(10, 10), mat(new THREE.MeshBasicMaterial({ map: mat(nightTexture(bed.id)), fog: false })));
  own.push(night.geometry);
  night.position.set(midX + 1.2, (winY0 + winY1) / 2 + 0.8, back - 4);
  group.add(night);
  const glass = new THREE.Mesh(
    new THREE.PlaneGeometry(winX1 - winX0, winY1 - winY0),
    mat(new THREE.MeshStandardMaterial({ color: '#B8CCF0', roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.1, depthWrite: false, envMapIntensity: 2 })),
  );
  own.push(glass.geometry);
  glass.position.set(midX, (winY0 + winY1) / 2, back - 0.16);
  group.add(glass);
  // Curtains on a brass rod, tied back.
  const rodY = winY1 + 0.6;
  const brass = mat(new THREE.MeshStandardMaterial({ color: '#C9A15A', roughness: 0.3, metalness: 0.8 }));
  const rod = new THREE.CylinderGeometry(0.06, 0.06, winX1 - winX0 + 3.2, 10).rotateZ(Math.PI / 2);
  rod.translate(midX, rodY, back + 0.38);
  M.add(brass, rod);
  for (const s of [-1, 1]) {
    const fin = new THREE.SphereGeometry(0.13, 12, 10);
    fin.translate(midX + s * ((winX1 - winX0) / 2 + 1.6), rodY, back + 0.38);
    M.add(brass, fin);
  }
  const curtainH = rodY - (winY0 - 1.5);
  for (const side of [-1, 1]) {
    const cg = curtainGeometry(1.8, curtainH, 5, 0.17, side);
    own.push(cg);
    const cm = new THREE.Mesh(cg, velvet);
    cm.position.set(side < 0 ? winX0 - 0.5 : winX1 + 0.5, rodY - curtainH / 2, back + 0.3);
    cm.castShadow = true;
    cm.receiveShadow = true;
    group.add(cm);
  }

  // --- moonlight: a soft shaft from the window down across the floor, its pool, and dust drifting in it ---
  const beamDir = new THREE.Vector3(0.42, -0.66, 0.62).normalize();
  const toFloor = (x, y) => {
    const k = (y - fl - 0.02) / -beamDir.y;
    return [x + beamDir.x * k, fl + 0.02, back - 0.1 + beamDir.z * k];
  };
  const beamGeo = (() => {
    const corners = [[winX0, winY0], [winX1, winY0], [winX1, winY1], [winX0, winY1]];
    const pos = [];
    const al = [];
    for (const [x, y] of corners) {
      pos.push(x, y, back - 0.1);
      al.push(1);
    }
    for (const [x, y] of corners) {
      pos.push(...toFloor(x, y));
      al.push(0.25);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('aAlong', new THREE.Float32BufferAttribute(al, 1));
    g.setIndex([0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7]);
    return g;
  })();
  own.push(beamGeo);
  const beamMat = mat(new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color('#8FB0FF') }, uK: { value: 1 } },
    vertexShader: /* glsl */ `attribute float aAlong; varying float vA; varying vec3 vW;
      void main(){ vA = aAlong; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */ `uniform float uTime; uniform vec3 uColor; uniform float uK; varying float vA; varying vec3 vW;
      void main(){ float n = 0.8 + 0.2 * sin(vW.x * 1.7 + uTime * 0.3) * sin(vW.y * 1.3 - uTime * 0.2);
      float a = vA * vA * 0.07 * n * uK; gl_FragColor = vec4(uColor * a, a); }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  }));
  const beam = new THREE.Mesh(beamGeo, beamMat);
  beam.renderOrder = 6;
  group.add(beam);
  const poolGeo = (() => {
    const pts = [[winX0, winY0], [winX1, winY0], [winX1, winY1], [winX0, winY1]].map(([x, y]) => toFloor(x, y));
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts.flat(), 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
    g.setIndex([0, 2, 1, 0, 3, 2]);
    g.computeVertexNormals();
    return g;
  })();
  own.push(poolGeo);
  const poolMat = mat(new THREE.MeshBasicMaterial({ map: mat(poolTexture()), color: '#6F8CD0', transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
  const pool = new THREE.Mesh(poolGeo, poolMat);
  pool.renderOrder = 2;
  group.add(pool);
  const DUST = hi ? 160 : low ? 40 : 90;
  const dustPos = new Float32Array(DUST * 3);
  const dustSeed = new Float32Array(DUST * 3);
  const drng = createRng(`dust:${bed.id}`);
  for (let i = 0; i < DUST * 3; i++) dustSeed[i] = drng.next();
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
  dustGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 200);
  own.push(dustGeo);
  const dustMat = mat(new THREE.PointsMaterial({ color: '#D4E2FF', size: 0.07, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending, map: mat(blobTexture(0.3)) }));
  const dust = new THREE.Points(dustGeo, dustMat);
  dust.renderOrder = 7;
  group.add(dust);
  const beamLen = (winY0 - fl) / -beamDir.y;

  // --- the door, Mama behind it, and the hall light ---
  M.box(trim, doorX0 - 0.28, doorX0, fl, doorY1 + 0.28, back - T, back + 0.14);
  M.box(trim, doorX1, doorX1 + 0.28, fl, doorY1 + 0.28, back - T, back + 0.14);
  M.box(trim, doorX0 - 0.28, doorX1 + 0.28, doorY1, doorY1 + 0.28, back - T, back + 0.14);
  const hall = new THREE.Mesh(new THREE.PlaneGeometry(doorX1 - doorX0 + 2, doorY1 - fl + 2), mat(new THREE.MeshBasicMaterial({ color: '#FFD9A0', fog: false })));
  own.push(hall.geometry);
  hall.position.set((doorX0 + doorX1) / 2, (fl + doorY1) / 2, back - 1.4);
  group.add(hall);
  const mama = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 6.4), mat(new THREE.MeshBasicMaterial({ map: mat(mamaTexture()), transparent: true, fog: false })));
  own.push(mama.geometry);
  mama.position.set((doorX0 + doorX1) / 2 + 0.2, fl + 3.2, back - 0.9);
  mama.visible = false;
  group.add(mama);
  const doorPivot = new THREE.Group();
  doorPivot.position.set(doorX0, fl, back - 0.08);
  group.add(doorPivot);
  const leafMat = mat(new THREE.MeshStandardMaterial({ color: '#CDBBA0', roughness: 0.55 }));
  const leafG = roundedBox(doorX1 - doorX0, doorY1 - fl, 0.16, 0.04);
  own.push(leafG);
  const leaf = new THREE.Mesh(leafG, leafMat);
  leaf.position.set((doorX1 - doorX0) / 2, (doorY1 - fl) / 2, 0);
  leaf.castShadow = true;
  leaf.receiveShadow = true;
  doorPivot.add(leaf);
  for (const [y0, y1] of [[0.7, 3.8], [4.4, 7.6]]) {
    const pg = roundedBox(doorX1 - doorX0 - 0.9, y1 - y0, 0.06, 0.03);
    own.push(pg);
    const panel = new THREE.Mesh(pg, leafMat);
    panel.position.set((doorX1 - doorX0) / 2, y0 + (y1 - y0) / 2, 0.09);
    panel.receiveShadow = true;
    doorPivot.add(panel);
  }
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.15, 16, 12), brass);
  own.push(knob.geometry);
  knob.position.set(doorX1 - doorX0 - 0.42, 3.9, 0.17);
  doorPivot.add(knob);
  const wedge = new THREE.Mesh(new THREE.PlaneGeometry(3.8, 13), mat(new THREE.MeshBasicMaterial({ map: mat(wedgeTexture()), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 })));
  own.push(wedge.geometry);
  wedge.rotation.x = -Math.PI / 2;
  wedge.rotation.z = 0.3;
  wedge.position.set((doorX0 + doorX1) / 2 - 1.8, fl + 0.03, back + 6.3);
  group.add(wedge);
  const doorLight = new THREE.SpotLight('#FFD58A', 0, 36, 0.55, 0.6, 1.2);
  doorLight.position.set((doorX0 + doorX1) / 2, fl + 6.5, back - 1);
  doorLight.target.position.set(0, 0, box.z1 * 0.3);
  group.add(doorLight, doorLight.target);

  // --- the bed ---
  const bedParts = new Merger();
  const quilts = [];
  for (const s of bed.surfaces) {
    const thick = bed.id === 'bunk' && s.top > 0 ? 0.42 : 0.62;
    bedParts.box(sheet, s.x0 + 0.04, s.x1 - 0.04, s.top - thick, s.top - 0.02, s.z0 + 0.04, s.z1 - 0.04, 0.16);
    if (s.top <= 0.01) {
      const rail0 = s.top - thick - 0.5;
      bedParts.box(wood, s.x0 - 0.14, s.x1 + 0.14, rail0, s.top - thick + 0.06, s.z0 - 0.12, s.z1 + 0.14, 0.06);
      for (const [x, z] of [[s.x0 + 0.08, s.z1 - 0.05], [s.x1 - 0.08, s.z1 - 0.05]]) {
        const h = rail0 - fl + 0.02;
        const leg = turned([[0, 0], [0.15, 0], [0.19, 0.06], [0.14, h * 0.4], [0.2, h * 0.7], [0.2, h], [0, h]], 14);
        leg.translate(x, fl, z);
        bedParts.add(wood, leg);
      }
    } else {
      // The top bunk: its frame, a guard rail at the back, corner posts and a ladder at the foot.
      bedParts.box(wood, s.x0 - 0.14, s.x1 + 0.14, s.top - thick - 0.4, s.top - thick + 0.05, s.z0 - 0.12, s.z1 + 0.08, 0.05);
      for (const x of [s.x0 - 0.04, s.x1 + 0.04]) bedParts.box(wood, x - 0.16, x + 0.16, fl, s.top + 0.9, s.z1 - 0.18, s.z1 + 0.14, 0.05);
      const lx0 = s.x1 - 1.3;
      const lx1 = s.x1 - 0.35;
      for (const x of [lx0, lx1]) bedParts.box(wood, x - 0.07, x + 0.07, 0.0, s.top + 0.2, s.z1 + 0.12, s.z1 + 0.26, 0.03);
      for (let k = 0; k < 4; k++) {
        const rung = new THREE.CylinderGeometry(0.05, 0.05, lx1 - lx0, 10).rotateZ(Math.PI / 2);
        rung.translate((lx0 + lx1) / 2, 0.2 + k * 0.32, s.z1 + 0.19);
        bedParts.add(trim, rung);
      }
    }
    // The quilt.
    const tx = quiltTextures(s, OVER, R.quilt, `${bed.id}:${s.i}`, low ? 72 : 128);
    own.push(tx.map, tx.bump);
    const geo = quiltGeometry(s, s.top, OVER, s.open, low ? 0.11 : quality === 'medium' ? 0.08 : 0.06);
    own.push(geo);
    const cols = Math.ceil(s.x1 - s.x0);
    const rows = Math.ceil(s.z1 - s.z0);
    const tw = s.x1 - s.x0 + OVER * 2;
    const th = s.z1 - s.z0 + OVER * 2;
    const weave = texture('cotton_nor', { repeat: [Math.round(tw / 0.6), Math.round(th / 0.6)] });
    const qm = mat(quiltMaterial(tx.map, tx.bump, s, s.i, u, bed.phys.swell * 0.4, {
      weave, quality, patch: [s.x0, s.z0, (s.x1 - s.x0) / cols, (s.z1 - s.z0) / rows], puff: 0.08,
    }));
    const qmesh = new THREE.Mesh(geo, qm);
    qmesh.receiveShadow = true;
    qmesh.castShadow = hi;
    group.add(qmesh);
    quilts.push({ mesh: qmesh, si: s.i, mat: qm });
  }
  // Headboards (the physics' walls): an arched panel between turned posts, a padded cushion on its face.
  const cushion = mat(new THREE.MeshPhysicalMaterial({
    color: R.quilt[1], normalMap: texture('knit_nor'), roughness: 0.9, sheen: 0.8, sheenRoughness: 0.5,
    sheenColor: new THREE.Color(R.quilt[1]).lerp(new THREE.Color('#ffffff'), 0.5),
  }));
  cushion.userData.worldUV = 1 / 1.5;
  for (const w of bed.walls) {
    const zc = (w.z0 + w.z1) / 2;
    const span = w.x1 - w.x0;
    const ph = w.y1 - w.y0;
    const sh = new THREE.Shape();
    sh.moveTo(-span / 2 + 0.25, 0);
    sh.lineTo(span / 2 - 0.25, 0);
    sh.lineTo(span / 2 - 0.25, ph - 0.35);
    sh.quadraticCurveTo(0, ph + 0.7, -span / 2 + 0.25, ph - 0.35);
    sh.closePath();
    const pg = new THREE.ExtrudeGeometry(sh, { depth: w.z1 - w.z0 - 0.12, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.05, bevelSegments: 3, curveSegments: 28 });
    pg.translate((w.x0 + w.x1) / 2, w.y0, w.z0 + 0.06);
    bedParts.add(wood, pg);
    for (const x of [w.x0 + 0.18, w.x1 - 0.18]) {
      const post = turned([[0, 0], [0.25, 0], [0.25, 0.3], [0.19, 0.45], [0.2, ph - 0.25], [0.27, ph - 0.12], [0.2, ph], [0, ph]], 18);
      post.translate(x, w.y0, zc);
      bedParts.add(wood, post);
      const fin = new THREE.SphereGeometry(0.25, 18, 14);
      fin.translate(x, w.y1 + 0.2, zc);
      bedParts.add(wood, fin);
    }
    bedParts.box(cushion, w.x0 + 0.55, w.x1 - 0.55, w.y1 - 1.0, w.y1 - 0.1, w.z1 - 0.04, w.z1 + 0.18, 0.1);
  }
  for (const p of bed.posts) {
    const h = p.top - fl;
    const pg = turned([[0, 0], [p.r * 1.3, 0], [p.r * 1.3, 0.5], [p.r, 0.7], [p.r * 0.85, h * 0.5], [p.r * 1.15, h * 0.55], [p.r * 0.8, h * 0.6], [p.r * 0.75, h], [0, h]], 18);
    pg.translate(p.x, fl, p.z);
    bedParts.add(wood, pg);
    const knobG = new THREE.SphereGeometry(p.r * 1.3, 16, 12);
    knobG.translate(p.x, p.top + 0.14, p.z);
    bedParts.add(wood, knobG);
  }
  if (bed.ceiling !== null && bed.posts.length) {
    const y = bed.surfaces[0].top + bed.ceiling + 0.1;
    const [a, b2, c, d] = bed.posts;
    bedParts.box(wood, a.x, b2.x, y, y + 0.14, a.z - 0.07, a.z + 0.07);
    bedParts.box(wood, c.x, d.x, y, y + 0.14, c.z - 0.07, c.z + 0.07);
    bedParts.box(wood, a.x - 0.07, a.x + 0.07, y, y + 0.14, a.z, c.z);
    bedParts.box(wood, b2.x - 0.07, b2.x + 0.07, y, y + 0.14, b2.z, d.z);
    const lace = mat(new THREE.MeshPhysicalMaterial({ color: '#F6EEDC', roughness: 1, transparent: true, opacity: 0.85, side: THREE.DoubleSide, sheen: 1, sheenColor: new THREE.Color('#ffffff') }));
    for (const [x0, z0, x1, z1] of [[a.x, a.z, b2.x, b2.z], [a.x, a.z, c.x, c.z], [b2.x, b2.z, d.x, d.z]]) {
      const len = Math.hypot(x1 - x0, z1 - z0);
      const vg = curtainGeometry(len, 0.7, Math.round(len * 1.5), 0.06);
      vg.rotateY(-Math.atan2(z1 - z0, x1 - x0));
      vg.translate((x0 + x1) / 2, y - 0.3, (z0 + z1) / 2);
      bedParts.add(lace, vg);
    }
    for (let k = 1; k < 6; k++) {
      const z = a.z + ((c.z - a.z) * k) / 6;
      bedParts.box(wood, a.x, b2.x, y + 0.05, y + 0.1, z - 0.04, z + 0.04);
    }
  }
  const pillowMat = mat(new THREE.MeshPhysicalMaterial({ color: '#F6EEE0', normalMap: texture('linen_nor'), roughness: 0.9, sheen: 1, sheenRoughness: 0.5, sheenColor: new THREE.Color('#ffffff') }));
  pillowMat.userData.worldUV = 1 / 1.5;
  for (const z of bed.lowZones) {
    const pg = roundedBox(z.x1 - z.x0 - 0.1, 0.5, z.z1 - z.z0 - 0.1, 0.24);
    pg.translate((z.x0 + z.x1) / 2, 0.24, (z.z0 + z.z1) / 2);
    bedParts.add(pillowMat, pg);
  }
  bedParts.build(group, { cast: true, receive: true }).forEach((m) => own.push(m.geometry));

  // --- the nightstand (a model), its lamp and the alarm clock (right of the headboard) ---
  const hb = bed.walls[0] ?? { x0: box.x0, x1: box.x1, z0: box.z0 - 0.4, z1: box.z0, y1: 0.9 };
  const nsX = hb.x1 + 1.75;
  const nsZ = back + 0.9;
  const nsTop = fl + 2.8;
  const lampX = nsX + 0.45;
  const lampZ = nsZ - 0.2;
  const lampBase = turned([[0, 0], [0.34, 0], [0.36, 0.08], [0.44, 0.35], [0.42, 0.6], [0.27, 0.85], [0.1, 0.95], [0.07, 1.25], [0, 1.25]], 28);
  lampBase.translate(lampX, nsTop, lampZ);
  M.add(mat(new THREE.MeshPhysicalMaterial({ color: '#E2A94E', roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.1 })), lampBase);
  // The shade glows by itself (it does not take the bulb's light, which would blow it out).
  const shadeMat = mat(new THREE.MeshStandardMaterial({ color: '#2A2016', emissive: '#FFC27A', emissiveIntensity: 0.85, roughness: 1, side: THREE.DoubleSide, normalMap: texture('linen_nor') }));
  const shadeG = new THREE.CylinderGeometry(0.42, 0.74, 0.88, 32, 1, true);
  own.push(shadeG);
  const lampShade = new THREE.Mesh(shadeG, shadeMat);
  lampShade.position.set(lampX, nsTop + 1.6, lampZ);
  group.add(lampShade);
  const lamp = new THREE.PointLight('#FFB060', 12, 30, 1.15);
  lamp.position.set(lampX - 0.9, nsTop + 1.5, lampZ + 1.4);
  group.add(lamp);
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 3.6), mat(new THREE.MeshBasicMaterial({ map: mat(blobTexture(0.05)), color: '#FFB24A', transparent: true, opacity: 0.16, depthWrite: false, blending: THREE.AdditiveBlending, fog: false })));
  own.push(glow.geometry);
  glow.position.copy(lampShade.position);
  glow.position.z += 0.3;
  group.add(glow);
  const clock = new THREE.Group();
  clock.position.set(nsX - 0.5, nsTop, nsZ + 0.3);
  clock.rotation.y = -0.4;
  group.add(clock);

  // --- the rug at the foot of the bed (fallen monkeys sit on it) ---
  const rugG = rugGeometry(5.0, 2.6);
  own.push(rugG);
  const rugMat = mat(new THREE.MeshPhysicalMaterial({
    color: R.rug, map: texture('rug_diff', { srgb: true }), normalMap: texture('rug_nor'), roughness: 1,
    sheen: 0.8, sheenRoughness: 0.6, sheenColor: new THREE.Color('#ffffff'),
  }));
  const rug = new THREE.Mesh(rugG, rugMat);
  rug.position.set(0, fl + 0.005, box.z1 + 2.2);
  rug.receiveShadow = true;
  group.add(rug);

  // --- fairy lights: along the top of the headboard and in loops across the wall ---
  const bulbs = [];
  const wireMat = mat(new THREE.MeshStandardMaterial({ color: '#2A3A2A', roughness: 0.6 }));
  const addString = (pts, n) => {
    const curve = new THREE.CatmullRomCurve3(pts);
    M.add(wireMat, new THREE.TubeGeometry(curve, 96, 0.016, 5, false));
    for (let i = 0; i < n; i++) bulbs.push(curve.getPointAt((i + 0.5) / n).add(new THREE.Vector3(0, -0.07, 0.03)));
  };
  {
    const y = hb.y1 + 0.35;
    const z = hb.z0 - 0.02;
    const pts = [];
    for (let i = 0; i <= 12; i++) {
      const f = i / 12;
      pts.push(new THREE.Vector3(hb.x0 + 0.18 + (hb.x1 - hb.x0 - 0.36) * f, y - Math.sin(f * Math.PI * 3) ** 2 * 0.3, z));
    }
    addString(pts, 18);
    const wy = fl + 9.2;
    const wpts = [];
    const x0 = winX1 + 1.8;
    const x1 = doorX0 - 0.8;
    for (let i = 0; i <= 24; i++) {
      const f = i / 24;
      wpts.push(new THREE.Vector3(x0 + (x1 - x0) * f, wy - Math.sin(f * Math.PI * 4) ** 2 * 0.9, back + 0.1));
    }
    addString(wpts, 26);
  }
  const bulbG = new THREE.SphereGeometry(0.08, 12, 8);
  bulbG.scale(1, 1.3, 1);
  own.push(bulbG);
  const fairy = new THREE.InstancedMesh(bulbG, mat(new THREE.MeshBasicMaterial({ color: '#ffffff' })), bulbs.length);
  const fairyCols = ['#FFB24A', '#FF7A6A', '#9FC2FF', '#B8F07A', '#FFE27A'].map((h) => new THREE.Color(h).multiplyScalar(2.4));
  const mtx = new THREE.Matrix4();
  bulbs.forEach((p, i) => {
    mtx.makeTranslation(p.x, p.y, p.z);
    fairy.setMatrixAt(i, mtx);
    fairy.setColorAt(i, fairyCols[i % fairyCols.length]);
  });
  group.add(fairy);

  // --- crayon drawings taped above the bed ---
  const tapeMat = mat(new THREE.MeshStandardMaterial({ color: '#F2E8C0', roughness: 0.6, transparent: true, opacity: 0.85 }));
  const tapeG = new THREE.PlaneGeometry(0.42, 0.15);
  own.push(tapeG);
  const drawG = new THREE.PlaneGeometry(2.0, 1.5);
  own.push(drawG);
  const cx = (hb.x0 + hb.x1) / 2;
  for (const [kind, x, y, r] of [['monkeys', cx - 2.6, fl + 6.2, -0.06], ['rocket', cx + 0.1, fl + 6.9, 0.05], ['house', cx + 2.7, fl + 6.0, 0.08]]) {
    const pm = new THREE.Mesh(drawG, mat(new THREE.MeshStandardMaterial({ map: mat(drawingTexture(kind, bed.id)), roughness: 0.9 })));
    pm.position.set(x, y, back + 0.02);
    pm.rotation.z = r;
    pm.receiveShadow = true;
    group.add(pm);
    for (const dx of [-0.85, 0.85]) {
      const tape = new THREE.Mesh(tapeG, tapeMat);
      tape.position.set(x + dx * Math.cos(r) - 0.66 * Math.sin(r), y + dx * Math.sin(r) + 0.66 * Math.cos(r), back + 0.03);
      tape.rotation.z = r + (dx > 0 ? 0.5 : -0.5);
      group.add(tape);
    }
  }

  // --- each bed re-dresses the room ---
  let lava = null;
  if (bed.id === 'water') {
    lava = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 1.1, 8, 18), mat(new THREE.MeshStandardMaterial({ color: '#FF6A3A', emissive: '#FF4A1A', emissiveIntensity: 1.6, roughness: 0.3 })));
    own.push(lava.geometry);
    lava.position.set(winX1 - 0.9, winY0 + 0.85, back + 0.25);
    group.add(lava);
  }
  if (bed.id === 'bunk' || bed.id === 'poster') {
    const sg = [];
    const srng = createRng(`stars:${bed.id}`);
    for (let i = 0; i < 28; i++) {
      const shape = new THREE.Shape();
      const r = srng.range(0.1, 0.22);
      for (let k = 0; k < 10; k++) {
        const a = (k / 10) * Math.PI * 2 + Math.PI / 2;
        const rr = k % 2 ? r * 0.45 : r;
        if (k === 0) shape.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
        else shape.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      const g = new THREE.ShapeGeometry(shape);
      g.rotateZ(srng.range(0, 1));
      g.translate(srng.range(-W + 1, W - 1), srng.range(fl + 8.6, fl + 12), back + 0.03);
      sg.push(g);
    }
    const stars = new THREE.Mesh(mergeGeometries(sg), mat(new THREE.MeshBasicMaterial({ color: new THREE.Color('#D8FF9A').multiplyScalar(1.3) })));
    own.push(stars.geometry);
    group.add(stars);
  }

  M.build(group, { cast: false, receive: true }).forEach((m) => own.push(m.geometry));

  // --- the models (shared), placed when they arrive ---
  const props = new THREE.Group();
  group.add(props);
  let disposed = false;
  const ready = loadProps().then((models) => {
    if (disposed) return;
    const put = (id, o, parent = props) => {
      const g = placeProp(models, id, o);
      if (g && low) lowify(g);
      if (g) parent.add(g);
      return g;
    };
    put('ClassicNightstand_01', { x: nsX, y: fl, z: nsZ });
    put('alarm_clock_01', { scale: 4.4 }, clock);
    put('standing_picture_frame_01', { x: nsX - 0.25, y: nsTop, z: nsZ - 0.5, yaw: -0.25, scale: 4 });
    put('potted_plant_04', { x: winX0 + 0.6, y: winY0, z: back + 0.18, yaw: 0.4, scale: 5 });
    put('carved_wooden_elephant', { x: winX1 - 0.6, y: winY0, z: back + 0.2, yaw: -0.5, scale: 6 });
    put('Ukulele_01', { x: box.x0 - 0.9, y: fl, z: back + 0.4, yaw: 0.2, tilt: -0.2, scale: 4 });
    put('Rockingchair_01', { x: -W + 2.6, y: fl, z: box.z0 + 4.4, yaw: Math.PI / 2 + 0.5 });
    put('throw_pillows_01', { x: -W + 2.7, y: fl + 1.8, z: box.z0 + 4.3, yaw: Math.PI / 2 + 0.5, scale: 2.4 });
    put('wicker_basket_02', { x: box.x0 - 2.5, y: fl, z: box.z1 - 0.8, yaw: 0.3, scale: 5.5 });
    put('baseball_01', { x: box.x0 - 1.9, y: fl, z: box.z1 + 0.6, scale: 5 });
    put('boombox', { x: box.x1 + 2.6, y: fl, z: box.z1 + 2.8, yaw: -0.6, scale: 3.4 });
    put('rubber_duck_toy', { x: box.x0 - 3.4, y: fl, z: box.z1 + 2.6, yaw: 0.6, scale: 3.4 });
    put('wooden_display_shelves_01', { x: W - 0.7, y: fl, z: back + 5.5, yaw: -Math.PI / 2 });
    if (bed.id === 'king') put('painted_wooden_nightstand', { x: hb.x0 - 1.6, y: fl, z: nsZ });
    return texturesReady();
  });

  const tmpC = new THREE.Color();
  function update(t, inf = {}) {
    // The lamp flickers when the springs go wild; lights out leaves the room to the moon.
    const dark = inf.dark ?? 0;
    const flick = (inf.wild ?? 0) > 0 ? (Math.sin(t * 37) * Math.sin(t * 13.7) > 0.55 ? 0.4 : 1) : 1;
    const on = (1 - dark * 0.92) * flick;
    lamp.intensity = 12 * (0.75 + 0.25 * flick) * (1 - dark * 0.95);
    shadeMat.emissiveIntensity = 0.85 * on;
    glow.material.opacity = 0.16 * on;
    for (let i = 0; i < bulbs.length; i++) {
      const k = 0.7 + 0.3 * Math.sin(t * 2.1 + i * 1.7);
      fairy.setColorAt(i, tmpC.copy(fairyCols[i % fairyCols.length]).multiplyScalar(k * (1 - dark * 0.5)));
    }
    fairy.instanceColor.needsUpdate = true;
    // The alarm clock rattles while it rings.
    const ring = inf.ring ?? 0;
    clock.rotation.z = ring > 0 ? Math.sin(t * 60) * 0.12 * ring : 0;
    clock.position.y = nsTop + (ring > 0 ? Math.abs(Math.sin(t * 30)) * 0.06 * ring : 0);
    // The door.
    const d = inf.door ?? 0;
    doorPivot.rotation.y = d * 1.9;
    mama.visible = d > 0.25;
    wedge.material.opacity = Math.min(1, d * 1.4);
    doorLight.intensity = inf.spot ? 90 * d : 0;
    // Moonlight and its dust.
    beamMat.uniforms.uTime.value = t;
    beamMat.uniforms.uK.value = 1 + dark * 0.8;
    poolMat.opacity = 0.55 * (1 + dark * 0.5);
    for (let i = 0; i < DUST; i++) {
      const a = dustSeed[i * 3];
      const b = dustSeed[i * 3 + 1];
      const c = dustSeed[i * 3 + 2];
      const len = ((c + t * 0.01 * (0.5 + a)) % 1) * beamLen;
      dustPos[i * 3] = winX0 + (winX1 - winX0) * a + beamDir.x * len + Math.sin(t * 0.4 + i) * 0.15;
      dustPos[i * 3 + 1] = winY0 + (winY1 - winY0) * b + beamDir.y * len + Math.sin(t * 0.3 + i * 2.1) * 0.1;
      dustPos[i * 3 + 2] = back - 0.1 + beamDir.z * len;
    }
    dustGeo.attributes.position.needsUpdate = true;
    if (lava) lava.material.emissiveIntensity = 1.4 + Math.sin(t * 1.3) * 0.3;
    for (const qq of quilts) qq.mat.userData.t = t;
  }
  update(0, {});

  function dispose() {
    disposed = true;
    for (const o of own) o.dispose?.();
  }

  return {
    group, quilts, lamp, update, ready, dispose, back, W,
    door: { x: (doorX0 + doorX1) / 2, y: fl + 3, z: back },
    lampPos: lampShade.position.clone(),
    window: { x0: winX0, x1: winX1, y0: winY0, y1: winY1 },
    nightstand: { x: nsX, y: nsTop, z: nsZ },
  };
}

function wedgeTexture() {
  const c = canvas(128, 256);
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, 'rgba(255,213,138,0.6)');
  grad.addColorStop(1, 'rgba(255,213,138,0)');
  g.fillStyle = grad;
  g.beginPath();
  g.moveTo(40, 0);
  g.lineTo(88, 0);
  g.lineTo(128, 256);
  g.lineTo(0, 256);
  g.fill();
  return tex(c);
}

function mamaTexture() {
  const c = canvas(256, 512);
  const g = c.getContext('2d');
  g.fillStyle = '#1A1020';
  g.beginPath();
  g.moveTo(84, 200);
  g.quadraticCurveTo(58, 340, 50, 500);
  g.lineTo(206, 500);
  g.quadraticCurveTo(198, 340, 172, 200);
  g.closePath();
  g.fill();
  g.lineWidth = 28;
  g.strokeStyle = '#1A1020';
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(88, 210);
  g.lineTo(36, 280);
  g.lineTo(88, 320);
  g.moveTo(168, 210);
  g.lineTo(220, 280);
  g.lineTo(168, 320);
  g.stroke();
  g.beginPath();
  g.arc(128, 145, 48, 0, Math.PI * 2);
  g.fill();
  for (const [x, y] of [[90, 108], [114, 94], [142, 94], [166, 108], [178, 132], [78, 132]]) {
    g.beginPath();
    g.arc(x, y, 16, 0, Math.PI * 2);
    g.fill();
  }
  g.beginPath();
  g.ellipse(96, 502, 32, 10, 0, 0, Math.PI * 2);
  g.ellipse(160, 502, 32, 10, 0, 0, Math.PI * 2);
  g.fill();
  return tex(c);
}
