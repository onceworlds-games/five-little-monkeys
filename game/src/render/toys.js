// The toys that drop onto the bed (the golden banana, the pillow, the spring) and the pillows of a Pillow Rain. A shadow
// grows first, then the toy falls in, lands with a squash and bobs on the quilt, glowing, until it's grabbed or it blinks
// away. Pooled meshes; the view hands over the toys of the moment and where the quilt's surface is.
import * as THREE from 'three';
import { bananaGeometry, bananaMat, pillowGeometry } from './monkey.js';
import { blobTexture } from './textures.js';
import { TOYS, RAIN } from '../sim/config.js';

const GLOW = { mega: '#FFB21A', shield: '#FFF1D6', spring: '#8CFF6A' };

function springGeometry() {
  const turns = 4.5;
  const pts = [];
  for (let i = 0; i <= 90; i++) {
    const k = i / 90;
    const a = k * turns * Math.PI * 2;
    pts.push(new THREE.Vector3(Math.cos(a) * 0.17, k * 0.42, Math.sin(a) * 0.17));
  }
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 180, 0.035, 8, false);
}

export function createToys(scene) {
  const group = new THREE.Group();
  scene.add(group);
  const glowTex = blobTexture(0.0);
  const banana = bananaGeometry(4.2);
  const pillow = pillowGeometry(0.64, 0.24, 0.46);
  const coil = springGeometry();
  const capGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.08, 20);
  const baseGeo = new THREE.CylinderGeometry(0.21, 0.23, 0.06, 20);
  const steel = new THREE.MeshStandardMaterial({ color: '#D8DEE6', metalness: 0.85, roughness: 0.28, envMapIntensity: 1.2 });
  const red = new THREE.MeshPhysicalMaterial({ color: '#E5483C', roughness: 0.35, clearcoat: 0.8 });
  const pillowToy = new THREE.MeshPhysicalMaterial({ color: '#FFF4E2', roughness: 0.85, sheen: 1, sheenColor: new THREE.Color('#ffffff'), sheenRoughness: 0.4, emissive: '#FFE7B8', emissiveIntensity: 0.12 });
  const ribbon = new THREE.MeshStandardMaterial({ color: '#E5483C', roughness: 0.5 });
  const ribbonGeo = new THREE.TorusGeometry(0.235, 0.025, 6, 24);

  function make(kind) {
    const g = new THREE.Group();
    const body = new THREE.Group();
    g.add(body);
    if (kind === 'mega') {
      const m = new THREE.Mesh(banana, bananaMat);
      m.rotation.set(0.25, 0, -0.35);
      m.position.y = 0.32;
      m.castShadow = true;
      body.add(m);
    } else if (kind === 'shield') {
      const m = new THREE.Mesh(pillow, pillowToy);
      m.position.y = 0.2;
      m.castShadow = true;
      const r = new THREE.Mesh(ribbonGeo, ribbon);
      r.rotation.x = Math.PI / 2;
      r.scale.set(1.25, 0.95, 1);
      r.position.y = 0.2;
      body.add(m, r);
    } else {
      const base = new THREE.Mesh(baseGeo, red);
      base.position.y = 0.03;
      const c = new THREE.Mesh(coil, steel);
      c.position.y = 0.05;
      const cap = new THREE.Mesh(capGeo, red);
      cap.position.y = 0.5;
      for (const m of [base, c, cap]) m.castShadow = true;
      body.add(base, c, cap);
    }
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: GLOW[kind], transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }));
    glow.scale.setScalar(1.5);
    glow.position.y = 0.32;
    glow.renderOrder = 6;
    g.add(glow);
    g.visible = false;
    group.add(g);
    return { g, body, glow, kind, k: -1 };
  }
  const pools = { mega: [], shield: [], spring: [] };
  for (const kind of Object.keys(pools)) for (let i = 0; i < 4; i++) pools[kind].push(make(kind));

  const rainMat = new THREE.MeshPhysicalMaterial({ color: '#F4EEE2', roughness: 0.9, sheen: 1, sheenColor: new THREE.Color('#ffffff') });
  const rainGeo = pillowGeometry(0.9, 0.3, 0.62);
  const rain = [];
  for (let i = 0; i < 6; i++) {
    const m = new THREE.Mesh(rainGeo, rainMat);
    m.castShadow = true;
    m.visible = false;
    group.add(m);
    rain.push(m);
  }

  /**
   * Show `toys` ([{ k, kind, x, z, si, at, until, taken }]) and `drops` (rain [{ k, x, z, si, at }]) at world time `t`;
   * `topAt(si, x, z)` is the quilt's height there. Pushes drop shadows onto `blobs`.
   */
  function update(toys, drops, t, anim, topAt, blobs) {
    for (const list of Object.values(pools)) for (const p of list) p.used = false;
    for (const toy of toys) {
      const list = pools[toy.kind];
      if (!list) continue;
      let p = list.find((x) => x.k === toy.k && !x.used) ?? list.find((x) => !x.used && x.k === -1) ?? list.find((x) => !x.used);
      if (!p) continue;
      p.used = true;
      p.k = toy.k;
      const top = topAt(toy.si, toy.x, toy.z);
      const since = t - toy.at;
      const left = toy.until - t;
      if (toy.taken) {
        p.g.visible = false;
        continue;
      }
      p.g.visible = true;
      let y = top;
      let sq = 1;
      if (since < 0) {
        // Falling in: ease-in from high above.
        const k = 1 + since / TOYS.drop;
        y = top + (1 - k * k) * 7;
        blobs.push({ x: toy.x, z: toy.z, y: top, h: (1 - k) * 3.5, size: 0.9 });
      } else {
        const land = Math.min(1, since / 0.35);
        sq = 1 - Math.sin(land * Math.PI) * 0.3 * (1 - land);
        y = top + 0.12 + Math.sin(anim * 3 + toy.k) * 0.06;
        blobs.push({ x: toy.x, z: toy.z, y: top, h: 0.3, size: 0.8 });
      }
      p.g.position.set(toy.x, y, toy.z);
      p.body.rotation.y = anim * 1.6 + toy.k;
      p.body.scale.set(1 / Math.sqrt(sq), sq, 1 / Math.sqrt(sq));
      p.glow.material.opacity = (since < 0 ? 0.25 : 0.5 + Math.sin(anim * 5) * 0.12) * (toy.kind === 'shield' ? 0.6 : 1);
      // Blinks out over its last two seconds.
      p.g.visible = !(left < 2 && Math.floor(anim * (left < 1 ? 14 : 8)) % 2 === 0);
    }
    for (const list of Object.values(pools)) for (const p of list) if (!p.used) {
      p.g.visible = false;
      p.k = -1;
    }
    let n = 0;
    for (const d of drops) {
      if (n >= rain.length) break;
      const m = rain[n++];
      const top = topAt(d.si, d.x, d.z);
      const k = Math.max(0, Math.min(1, 1 + (t - d.at) / RAIN.drop));
      m.visible = true;
      m.position.set(d.x, top + 0.15 + (1 - k * k) * 9, d.z);
      m.rotation.set((1 - k) * 4 + d.k, d.k * 1.3, (1 - k) * 2.5);
      blobs.push({ x: d.x, z: d.z, y: top, h: (1 - k) * 4, size: 1.3 });
    }
    for (; n < rain.length; n++) rain[n].visible = false;
  }

  function clear() {
    for (const list of Object.values(pools)) for (const p of list) {
      p.g.visible = false;
      p.k = -1;
    }
    for (const m of rain) m.visible = false;
  }

  return { group, update, clear };
}
