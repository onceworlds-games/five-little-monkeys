// The bedroom around the bed: floor, rug, walls, the window with the moon, the lamp, the door Mama comes through, and the
// bed itself (frame, mattresses, quilts, headboard, posts). Static pieces are merged by material to keep draw calls low.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { ROOMS, PAL } from '../look.js';
import { floorTexture, rugTexture, wallTexture, quiltTextures, moonTexture, skyTexture, posterTexture, canvas, blobTexture } from './textures.js';
import { quiltGeometry, quiltMaterial } from './quilt.js';

const OVER = 0.7;

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
    const geo = g.index ? g.toNonIndexed() : g;
    if (!geo.attributes.uv) geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2));
    if (mat.userData.worldUV) {
      // Wallpaper: texture coordinates from world position, so every piece of wall lines up.
      const p = geo.attributes.position;
      const uv = geo.attributes.uv;
      const k = mat.userData.worldUV;
      for (let i = 0; i < p.count; i++) uv.setXY(i, (p.getX(i) + p.getZ(i)) * k, p.getY(i) * k);
    }
    if (!this.byMat.has(mat)) this.byMat.set(mat, []);
    this.byMat.get(mat).push(geo);
  }
  build(parent, { cast = false, receive = true } = {}) {
    for (const [mat, list] of this.byMat) {
      const m = new THREE.Mesh(mergeGeometries(list), mat);
      m.castShadow = cast;
      m.receiveShadow = receive;
      parent.add(m);
    }
  }
}

function roundedBox(w, h, d, r) {
  // A box with puffed edges: a box geometry with its vertices pulled toward a rounded shape.
  const g = new THREE.BoxGeometry(w, h, d, 6, 4, 6);
  const p = g.attributes.position;
  const v = new THREE.Vector3();
  const hw = w / 2 - r;
  const hh = h / 2 - r;
  const hd = d / 2 - r;
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const c = new THREE.Vector3(THREE.MathUtils.clamp(v.x, -hw, hw), THREE.MathUtils.clamp(v.y, -hh, hh), THREE.MathUtils.clamp(v.z, -hd, hd));
    const n = v.clone().sub(c);
    if (n.lengthSq() > 1e-8) v.copy(c.add(n.normalize().multiplyScalar(r)));
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

function mamaTexture() {
  const c = canvas(256, 512);
  const g = c.getContext('2d');
  g.fillStyle = '#120A16';
  // Robe.
  g.beginPath();
  g.moveTo(80, 190);
  g.quadraticCurveTo(60, 330, 52, 500);
  g.lineTo(204, 500);
  g.quadraticCurveTo(196, 330, 176, 190);
  g.closePath();
  g.fill();
  // Arms akimbo.
  g.lineWidth = 26;
  g.strokeStyle = '#120A16';
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(84, 200);
  g.lineTo(34, 270);
  g.lineTo(84, 310);
  g.moveTo(172, 200);
  g.lineTo(222, 270);
  g.lineTo(172, 310);
  g.stroke();
  // Head and curlers.
  g.beginPath();
  g.arc(128, 140, 46, 0, Math.PI * 2);
  g.fill();
  for (const [x, y] of [[92, 104], [116, 92], [140, 92], [164, 104], [176, 128], [80, 128]]) {
    g.beginPath();
    g.arc(x, y, 15, 0, Math.PI * 2);
    g.fill();
  }
  // Slippers.
  g.beginPath();
  g.ellipse(96, 502, 30, 10, 0, 0, Math.PI * 2);
  g.ellipse(160, 502, 30, 10, 0, 0, Math.PI * 2);
  g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function wedgeTexture(color, panes) {
  const c = canvas(256, 256);
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, color);
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 256);
  if (panes) {
    g.globalCompositeOperation = 'destination-out';
    g.fillStyle = '#000';
    g.fillRect(122, 0, 12, 256);
    g.fillRect(0, 118, 256, 12);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const std = (color, rough = 0.85, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: rough, ...extra });

/**
 * Build the room for `bed`. `u` the shared ring uniforms. quality: 'low' | 'medium' | 'high'.
 * Returns { group, quilts, lamp, update(t, info) } where info: { wild, door (0-1), flicker }.
 */
export function buildRoom(bed, u, quality) {
  const R = ROOMS[bed.id] ?? ROOMS.kid;
  const group = new THREE.Group();
  const M = new Merger();
  const fl = bed.floor;
  const box = bed.box;
  const back = box.z0 - 1.3;
  const W = Math.max(11, box.x1 + 7.5);

  // Floor.
  const floorMap = floorTexture(R.floor);
  floorMap.repeat.set(6, 6);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), std('#ffffff', 0.8, { map: floorMap }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, fl, 6);
  floor.receiveShadow = true;
  group.add(floor);

  // Rug at the foot of the bed (out monkeys sit on it).
  const rug = new THREE.Mesh(new THREE.CircleGeometry(1, 48), std('#ffffff', 1, { map: rugTexture(R.rug) }));
  rug.rotation.x = -Math.PI / 2;
  rug.scale.set(4.6, 2.0, 1);
  rug.position.set(0, fl + 0.01, box.z1 + 2.2);
  rug.receiveShadow = true;
  group.add(rug);

  // Walls.
  const wallMap = wallTexture(R.wall, R.wall2);
  const wallMat = std('#ffffff', 0.95, { map: wallMap });
  wallMat.userData.worldUV = 0.25;
  const skirting = std('#E8DCC4', 0.7);
  // The back wall, with the window cut out of it (left) and the door (right).
  const winX0 = -W + 2.2;
  const winX1 = winX0 + 3.4;
  const winY0 = fl + 3.2;
  const winY1 = fl + 7.2;
  const doorX0 = box.x1 + 2.6;
  const doorX1 = doorX0 + 2.8;
  const doorY1 = fl + 6.6;
  const top = fl + 12;
  M.box(wallMat, -W, winX0, fl, top, back - 0.3, back);
  M.box(wallMat, winX0, winX1, fl, winY0, back - 0.3, back);
  M.box(wallMat, winX0, winX1, winY1, top, back - 0.3, back);
  M.box(wallMat, winX1, doorX0, fl, top, back - 0.3, back);
  M.box(wallMat, doorX0, doorX1, doorY1, top, back - 0.3, back);
  M.box(wallMat, doorX1, W, fl, top, back - 0.3, back);
  // Side walls.
  M.box(wallMat, -W - 0.3, -W, fl, top, back - 0.3, 16);
  M.box(wallMat, W, W + 0.3, fl, top, back - 0.3, 16);
  // Skirting boards.
  M.box(skirting, -W, doorX0, fl, fl + 0.35, back, back + 0.08);
  M.box(skirting, doorX1, W, fl, fl + 0.35, back, back + 0.08);
  M.box(skirting, -W, -W + 0.08, fl, fl + 0.35, back, 16);
  M.box(skirting, W - 0.08, W, fl, fl + 0.35, back, 16);
  // Window frame and sill.
  const wood = std('#E9E1CF', 0.6);
  M.box(wood, winX0 - 0.15, winX1 + 0.15, winY0 - 0.2, winY0, back - 0.1, back + 0.35);
  M.box(wood, winX0 - 0.15, winX1 + 0.15, winY1, winY1 + 0.15, back - 0.1, back + 0.12);
  M.box(wood, winX0 - 0.15, winX0, winY0, winY1, back - 0.1, back + 0.12);
  M.box(wood, winX1, winX1 + 0.15, winY0, winY1, back - 0.1, back + 0.12);
  M.box(wood, (winX0 + winX1) / 2 - 0.06, (winX0 + winX1) / 2 + 0.06, winY0, winY1, back - 0.2, back - 0.1);
  M.box(wood, winX0, winX1, (winY0 + winY1) / 2 - 0.06, (winY0 + winY1) / 2 + 0.06, back - 0.2, back - 0.1);
  // Night sky and moon behind the window.
  const sky = new THREE.Mesh(new THREE.PlaneGeometry(9, 7), new THREE.MeshBasicMaterial({ map: skyTexture(), fog: false }));
  sky.position.set((winX0 + winX1) / 2, (winY0 + winY1) / 2, back - 2.5);
  group.add(sky);
  const moon = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 2.2), new THREE.MeshBasicMaterial({ map: moonTexture(), transparent: true, fog: false, depthWrite: false }));
  moon.position.set(winX0 + 1.0, winY1 - 1.0, back - 2.3);
  group.add(moon);
  // Curtains.
  const curtain = std(R.rug[0], 0.95);
  M.box(curtain, winX0 - 0.9, winX0 - 0.15, winY0 - 1.2, winY1 + 0.5, back + 0.05, back + 0.3, 0.1);
  M.box(curtain, winX1 + 0.15, winX1 + 0.9, winY0 - 1.2, winY1 + 0.5, back + 0.05, back + 0.3, 0.1);
  // Moonlight spilling through the window onto the floor.
  const pool = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 5.4), new THREE.MeshBasicMaterial({ map: wedgeTexture('rgba(143,184,255,0.32)', true), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  pool.rotation.x = -Math.PI / 2;
  pool.position.set((winX0 + winX1) / 2 + 0.6, fl + 0.02, back + 2.9);
  group.add(pool);

  // Posters on the back wall.
  const posterA = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 2.0), std('#ffffff', 0.8, { map: posterTexture('rocket') }));
  posterA.position.set(winX1 + 1.4, fl + 5.2, back + 0.02);
  posterA.rotation.z = 0.04;
  group.add(posterA);
  const posterB = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 1.7), std('#ffffff', 0.8, { map: posterTexture('planet') }));
  posterB.position.set(box.x1 + 1.0, fl + 7.4, back + 0.02);
  posterB.rotation.z = -0.05;
  group.add(posterB);

  // The door: a frame, a leaf that swings open, and the hall light behind it.
  M.box(wood, doorX0 - 0.2, doorX0, fl, doorY1 + 0.2, back - 0.1, back + 0.15);
  M.box(wood, doorX1, doorX1 + 0.2, fl, doorY1 + 0.2, back - 0.1, back + 0.15);
  M.box(wood, doorX0 - 0.2, doorX1 + 0.2, doorY1, doorY1 + 0.2, back - 0.1, back + 0.15);
  const hall = new THREE.Mesh(new THREE.PlaneGeometry(doorX1 - doorX0, doorY1 - fl), new THREE.MeshBasicMaterial({ color: '#FFD58A', fog: false }));
  hall.position.set((doorX0 + doorX1) / 2, (fl + doorY1) / 2, back - 0.6);
  group.add(hall);
  const mama = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 4.6), new THREE.MeshBasicMaterial({ map: mamaTexture(), transparent: true, fog: false }));
  mama.position.set((doorX0 + doorX1) / 2, fl + 2.3, back - 0.45);
  mama.visible = false;
  group.add(mama);
  const doorPivot = new THREE.Group();
  doorPivot.position.set(doorX0, fl, back - 0.05);
  group.add(doorPivot);
  const leafMat = std('#C9B79A', 0.7);
  const leaf = new THREE.Mesh(roundedBox(doorX1 - doorX0, doorY1 - fl, 0.12, 0.04), leafMat);
  leaf.position.set((doorX1 - doorX0) / 2, (doorY1 - fl) / 2, 0);
  doorPivot.add(leaf);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 10), std('#E8C35A', 0.3, { metalness: 0.6 }));
  knob.position.set(doorX1 - doorX0 - 0.35, 2.8, 0.12);
  doorPivot.add(knob);
  const wedge = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 12), new THREE.MeshBasicMaterial({ map: wedgeTexture('rgba(255,213,138,0.55)', false), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
  wedge.rotation.x = -Math.PI / 2;
  wedge.position.set((doorX0 + doorX1) / 2 - 1.6, fl + 0.03, back + 6);
  wedge.rotation.z = 0.32;
  group.add(wedge);

  // Bedside table and lamp (right of the headboard).
  const lampX = box.x1 + 1.3;
  const lampZ = box.z0 + 0.4;
  const tableTop = fl + 2.0;
  M.box(std('#7A4E32', 0.6), lampX - 0.9, lampX + 0.9, fl, tableTop, lampZ - 0.8, lampZ + 0.8, 0.06);
  M.box(std('#F1E4C8', 0.6), lampX - 0.75, lampX + 0.75, fl + 0.9, fl + 1.5, lampZ + 0.79, lampZ + 0.82);
  const base = new THREE.CylinderGeometry(0.22, 0.32, 0.9, 16);
  base.translate(lampX, tableTop + 0.45, lampZ);
  M.add(std(PAL.red, 0.5), base);
  const shadeMat = new THREE.MeshStandardMaterial({ color: '#FFE2A8', emissive: '#FFB24A', emissiveIntensity: 1.6, side: THREE.DoubleSide, roughness: 1 });
  const lampShade = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.7, 0.8, 20, 1, true), shadeMat);
  lampShade.position.set(lampX, tableTop + 1.25, lampZ);
  group.add(lampShade);
  const lamp = new THREE.PointLight('#FFB24A', 26, 22, 1.4);
  lamp.position.set(lampX, tableTop + 1.1, lampZ + 0.2);
  group.add(lamp);
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 3.4), new THREE.MeshBasicMaterial({ map: blobTexture(0.1), color: '#FFB24A', transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending }));
  glow.position.copy(lampShade.position);
  group.add(glow);
  // Alarm clock on the table.
  const clock = new THREE.Group();
  clock.position.set(lampX - 0.55, tableTop, lampZ + 0.45);
  const clockBody = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.18, 20), std(PAL.red, 0.4));
  clockBody.rotation.x = Math.PI / 2;
  clockBody.position.y = 0.36;
  clock.add(clockBody);
  const face = new THREE.Mesh(new THREE.CircleGeometry(0.23, 20), std(PAL.cream, 0.5));
  face.position.set(0, 0.36, 0.095);
  clock.add(face);
  for (const sx of [-1, 1]) {
    const bell = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), std('#E8C35A', 0.3, { metalness: 0.6 }));
    bell.position.set(sx * 0.18, 0.6, 0);
    bell.rotation.z = -sx * 0.5;
    clock.add(bell);
  }
  group.add(clock);

  // Props: guitar, skateboard, sneakers, books (merged).
  const gx = -box.x1 - 2.4;
  const gz = back + 0.6;
  const guitarMat = std('#C8752E', 0.5);
  const gb = new THREE.SphereGeometry(0.6, 16, 12);
  gb.scale(1, 1.15, 0.3);
  gb.translate(gx, fl + 0.9, gz);
  M.add(guitarMat, gb);
  const gb2 = new THREE.SphereGeometry(0.45, 16, 12);
  gb2.scale(1, 1, 0.3);
  gb2.translate(gx, fl + 1.8, gz - 0.05);
  M.add(guitarMat, gb2);
  const neck = new THREE.BoxGeometry(0.16, 2.2, 0.1);
  neck.translate(gx, fl + 3.1, gz - 0.12);
  M.add(std('#3A2418', 0.6), neck);
  const sk = roundedBox(2.0, 0.08, 0.55, 0.03);
  sk.rotateY(0.5);
  sk.translate(box.x1 + 2.6, fl + 0.18, box.z1 + 1.5);
  M.add(std('#2E4A7A', 0.6), sk);
  for (const [x, z] of [[1.9, 1.3], [3.3, 1.7], [1.9, 1.75], [3.3, 1.25]]) {
    const wh = new THREE.CylinderGeometry(0.1, 0.1, 0.08, 10);
    wh.rotateX(Math.PI / 2);
    wh.rotateY(0.5);
    wh.translate(box.x1 + x, fl + 0.1, box.z1 + z - 0.1);
    M.add(std(PAL.amber, 0.5), wh);
  }
  for (const [x, z, r] of [[-box.x1 - 1.9, box.z1 + 1.0, 0.3], [-box.x1 - 1.4, box.z1 + 1.3, -0.2]]) {
    const sn = roundedBox(0.45, 0.32, 0.95, 0.12);
    sn.rotateY(r);
    sn.translate(x, fl + 0.16, z);
    M.add(std('#F1EDE4', 0.7), sn);
  }
  for (let i = 0; i < 4; i++) {
    const bk = new THREE.BoxGeometry(1.0 - i * 0.08, 0.2, 0.7);
    bk.rotateY(i * 0.25);
    bk.translate(-box.x1 - 1.8, fl + 0.1 + i * 0.2, back + 2.6);
    M.add(std(R.quilt[i % R.quilt.length], 0.8), bk);
  }

  // The bed.
  const frame = std(R.frame, 0.55);
  const sheet = std(R.sheet, 0.9);
  const quilts = [];
  const bedFurniture = new Merger();
  for (const s of bed.surfaces) {
    const thick = bed.id === 'bunk' && s.top > 0 ? 0.35 : 0.5;
    bedFurniture.box(sheet, s.x0 + 0.02, s.x1 - 0.02, s.top - thick, s.top + 0.02, s.z0 + 0.02, s.z1 - 0.02, 0.12);
    if (s.top <= 0.01) {
      // Base under the mattress, legs.
      bedFurniture.box(frame, s.x0 - 0.12, s.x1 + 0.12, fl + 0.45, s.top - thick, s.z0 - 0.1, s.z1 + 0.1, 0.05);
      for (const [x, z] of [[s.x0, s.z0], [s.x1, s.z0], [s.x0, s.z1], [s.x1, s.z1]]) bedFurniture.box(frame, x - 0.18, x + 0.18, fl, fl + 0.5, z - 0.18, z + 0.18, 0.04);
    } else {
      // The top bunk: a solid front face down to the lower bunk, and a ladder painted on it.
      bedFurniture.box(frame, s.x0 - 0.12, s.x1 + 0.12, -0.5, s.top - thick, s.z0 - 0.1, s.z1 + 0.05, 0.05);
      bedFurniture.box(frame, s.x0 - 0.12, s.x0 + 0.12, fl, s.top + 0.9, s.z0 - 0.1, s.z0 + 0.15, 0.05);
      bedFurniture.box(frame, s.x1 - 0.12, s.x1 + 0.12, fl, s.top + 0.9, s.z0 - 0.1, s.z0 + 0.15, 0.05);
      const rail = std('#E8DCC4', 0.6);
      for (let k = 0; k < 3; k++) bedFurniture.box(rail, s.x1 - 1.2, s.x1 - 0.4, 0.15 + k * 0.28, 0.22 + k * 0.28, s.z1 + 0.05, s.z1 + 0.1);
      bedFurniture.box(rail, s.x1 - 1.25, s.x1 - 1.15, 0.0, s.top - 0.3, s.z1 + 0.05, s.z1 + 0.12);
      bedFurniture.box(rail, s.x1 - 0.45, s.x1 - 0.35, 0.0, s.top - 0.3, s.z1 + 0.05, s.z1 + 0.12);
    }
    // The quilt.
    const open = s.open;
    const tx = quiltTextures(s, OVER, R.quilt, `${bed.id}:${s.i}`, quality === 'low' ? 72 : 112);
    const geo = quiltGeometry(s, s.top, OVER, open, quality === 'low' ? 0.11 : quality === 'medium' ? 0.085 : 0.07);
    const mat = quiltMaterial(tx.map, tx.bump, s, s.i, u, 0);
    const q = new THREE.Mesh(geo, mat);
    q.receiveShadow = true;
    group.add(q);
    quilts.push({ mesh: q, si: s.i, mat });
  }
  // Headboards (the physics' walls).
  for (const w of bed.walls) {
    bedFurniture.box(frame, w.x0, w.x1, w.y0, w.y1, w.z0, w.z1, 0.08);
    // A padded cushion on its face.
    bedFurniture.box(std(R.quilt[1], 0.9), w.x0 + 0.3, w.x1 - 0.3, w.y1 - 0.75, w.y1 - 0.1, w.z1 - 0.02, w.z1 + 0.12, 0.08);
    // Finials.
    for (const x of [w.x0 + 0.15, w.x1 - 0.15]) {
      const fi = new THREE.SphereGeometry(0.2, 12, 10);
      fi.translate(x, w.y1 + 0.12, (w.z0 + w.z1) / 2);
      bedFurniture.add(frame, fi);
    }
  }
  // Posts and canopy (the four-poster).
  for (const p of bed.posts) {
    const pg = new THREE.CylinderGeometry(p.r * 0.8, p.r, p.top - fl, 14);
    pg.translate(p.x, (p.top + fl) / 2, p.z);
    bedFurniture.add(frame, pg);
    const knobG = new THREE.SphereGeometry(p.r * 1.2, 12, 10);
    knobG.translate(p.x, p.top + 0.1, p.z);
    bedFurniture.add(frame, knobG);
  }
  if (bed.ceiling !== null && bed.posts.length) {
    const y = bed.surfaces[0].top + bed.ceiling + 0.1;
    const [a, b2, c, d] = bed.posts;
    bedFurniture.box(frame, a.x, b2.x, y, y + 0.12, a.z - 0.06, a.z + 0.06);
    bedFurniture.box(frame, c.x, d.x, y, y + 0.12, c.z - 0.06, c.z + 0.06);
    bedFurniture.box(frame, a.x - 0.06, a.x + 0.06, y, y + 0.12, a.z, c.z);
    bedFurniture.box(frame, b2.x - 0.06, b2.x + 0.06, y, y + 0.12, b2.z, d.z);
    // Lace valance at the back and sides, slats across the top.
    const lace = new THREE.MeshStandardMaterial({ color: '#F6EEDC', roughness: 1, transparent: true, opacity: 0.82, side: THREE.DoubleSide });
    bedFurniture.box(lace, a.x, b2.x, y - 0.6, y, a.z - 0.02, a.z + 0.02);
    bedFurniture.box(lace, a.x - 0.02, a.x + 0.02, y - 0.6, y, a.z, c.z);
    bedFurniture.box(lace, b2.x - 0.02, b2.x + 0.02, y - 0.6, y, b2.z, d.z);
    for (let k = 1; k < 6; k++) {
      const z = a.z + ((c.z - a.z) * k) / 6;
      bedFurniture.box(frame, a.x, b2.x, y + 0.05, y + 0.1, z - 0.04, z + 0.04);
    }
  }
  // The king bed's pillows (the low zones).
  for (const z of bed.lowZones) {
    const pg = roundedBox(z.x1 - z.x0 - 0.1, 0.45, z.z1 - z.z0 - 0.1, 0.2);
    pg.translate((z.x0 + z.x1) / 2, 0.22, (z.z0 + z.z1) / 2);
    bedFurniture.add(std('#F4ECDD', 0.9), pg);
  }
  bedFurniture.build(group, { cast: true, receive: true });

  // Each bed re-dresses the room.
  if (bed.id === 'water') {
    const lava = new THREE.Mesh(new THREE.CapsuleGeometry(0.25, 0.9, 6, 14), new THREE.MeshStandardMaterial({ color: '#FF6A3A', emissive: '#FF4A1A', emissiveIntensity: 1.2 }));
    lava.position.set(-box.x1 - 1.4, fl + 0.7, back + 1.2);
    group.add(lava);
  }
  if (bed.id === 'bunk' || bed.id === 'poster') {
    const starsMat = new THREE.MeshBasicMaterial({ color: '#D8FF9A', fog: false });
    const sg = [];
    for (let i = 0; i < 22; i++) {
      const g = new THREE.CircleGeometry(0.06 + (i % 3) * 0.03, 5);
      g.translate(-W + 1 + ((i * 7.3) % (2 * W - 2)), fl + 8 + ((i * 3.7) % 3.5), back + 0.03);
      sg.push(g);
    }
    group.add(new THREE.Mesh(mergeGeometries(sg), starsMat));
  }
  if (bed.id === 'poster') {
    const gc = new THREE.Group();
    gc.position.set(-box.x1 - 2.2, fl, back + 0.8);
    const cabinet = new THREE.Mesh(roundedBox(1.2, 6.2, 0.8, 0.08), std('#4A2E22', 0.5));
    cabinet.position.y = 3.1;
    gc.add(cabinet);
    const dial = new THREE.Mesh(new THREE.CircleGeometry(0.42, 24), std(PAL.cream, 0.5));
    dial.position.set(0, 5.4, 0.41);
    gc.add(dial);
    group.add(gc);
  }

  // Fairy lights along the headboard.
  const fairyCount = 14;
  const hb = bed.walls[0];
  const fairy = new THREE.InstancedMesh(new THREE.SphereGeometry(0.075, 8, 6), new THREE.MeshBasicMaterial({ color: '#ffffff', fog: false }), fairyCount);
  const fairyCols = ['#FFB24A', '#FF6A6A', '#8FB8FF', '#A8F07A', '#FFE27A'];
  const mtx = new THREE.Matrix4();
  for (let i = 0; i < fairyCount; i++) {
    const f = i / (fairyCount - 1);
    const x = hb.x0 + 0.2 + (hb.x1 - hb.x0 - 0.4) * f;
    const y = hb.y1 + 0.25 - Math.sin(f * Math.PI * 3) ** 2 * 0.25;
    mtx.makeTranslation(x, y, hb.z0 - 0.05);
    fairy.setMatrixAt(i, mtx);
    fairy.setColorAt(i, new THREE.Color(fairyCols[i % fairyCols.length]));
  }
  group.add(fairy);

  M.build(group, { cast: false, receive: true });

  const doorLight = new THREE.SpotLight('#FFD58A', 0, 30, 0.5, 0.6, 1.2);
  doorLight.position.set((doorX0 + doorX1) / 2, fl + 5, back - 1);
  doorLight.target.position.set(0, 0, box.z1 * 0.3);
  group.add(doorLight, doorLight.target);

  let flick = 0;
  function update(t, info) {
    // Lamp flicker when the springs go wild.
    const wild = info.wild ?? 0;
    flick = wild > 0 ? (Math.sin(t * 37) * Math.sin(t * 13.7) > 0.55 ? 0.4 : 1) : 1;
    lamp.intensity = 26 * (0.75 + 0.25 * flick) * (info.lampScale ?? 1);
    shadeMat.emissiveIntensity = 1.6 * flick;
    glow.material.opacity = 0.35 * flick;
    // Alarm clock rattles while it rings.
    const ring = info.ring ?? 0;
    clock.rotation.z = ring > 0 ? Math.sin(t * 60) * 0.12 * ring : 0;
    clock.position.y = tableTop + (ring > 0 ? Math.abs(Math.sin(t * 30)) * 0.05 * ring : 0);
    // The door.
    const d = info.door ?? 0;
    doorPivot.rotation.y = d * 1.9;
    mama.visible = d > 0.25;
    wedge.material.opacity = Math.min(1, d * 1.4);
    doorLight.intensity = info.spot ? 80 * d : 0;
    for (const q of quilts) q.mat.userData.t = t;
  }
  update(0, {});

  return { group, quilts, lamp, update, door: { x: (doorX0 + doorX1) / 2, y: fl + 3, z: back }, back, W, lampPos: lampShade.position.clone() };
}
