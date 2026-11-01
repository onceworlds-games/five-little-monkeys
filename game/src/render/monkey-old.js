// A monkey in pyjamas, built from smooth shapes, and the poses that do its acting: squash and stretch on the bounce, the
// tuck of a slam, the spin of a launch, windmilling arms on the rim, sitting dizzy on the rug, the frozen guilty grin.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PAL } from '../look.js';
import { pyjamaTexture, mouthAtlas, MOUTHS, canvas } from './textures.js';

const fabricCache = new Map();
let mouthTex = null;

function fabric(pattern, hex, dark) {
  const key = `${pattern}|${hex}`;
  if (!fabricCache.has(key)) {
    const map = pyjamaTexture(pattern, hex, dark);
    map.repeat.set(2, 2);
    fabricCache.set(key, new THREE.MeshStandardMaterial({ map, roughness: 0.92 }));
  }
  return fabricCache.get(key);
}

function tinted(geo, hex) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const c = new THREE.Color(hex);
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    col[i * 3] = c.r;
    col[i * 3 + 1] = c.g;
    col[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.deleteAttribute('uv');
  return g;
}

function at(geo, x, y, z, sx = 1, sy = 1, sz = 1, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)),
    new THREE.Vector3(sx, sy, sz),
  );
  geo.applyMatrix4(m);
  return geo;
}

const sphere = (r, w = 20, h = 14) => new THREE.SphereGeometry(r, w, h);

function pocketTexture(symbol, hex, dark) {
  const c = canvas(64, 64);
  const g = c.getContext('2d');
  g.fillStyle = PAL.cream;
  g.fillRect(4, 4, 56, 56);
  g.strokeStyle = dark;
  g.setLineDash([5, 4]);
  g.lineWidth = 3;
  g.strokeRect(9, 9, 46, 46);
  g.fillStyle = hex;
  g.beginPath();
  if (symbol === 'square') g.rect(20, 20, 24, 24);
  else if (symbol === 'circle') g.arc(32, 32, 13, 0, Math.PI * 2);
  else if (symbol === 'triangle') {
    g.moveTo(32, 17);
    g.lineTo(47, 45);
    g.lineTo(17, 45);
  } else if (symbol === 'star') {
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
      const r = i % 2 ? 7 : 16;
      g.lineTo(32 + Math.cos(a) * r, 33 + Math.sin(a) * r);
    }
  } else {
    g.moveTo(32, 16);
    g.lineTo(48, 32);
    g.lineTo(32, 48);
    g.lineTo(16, 32);
  }
  g.closePath();
  g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/**
 * opts: { hex, dark, symbol, pattern, extra ('brows' | 'bigeyes' | 'glasses' | 'mask' | 'bear' | ''), shadows }.
 * Returns { group, pose(p), setPattern(pattern), setCap(on), setBandage(on), dispose() }.
 */
export function createMonkey(opts) {
  const bear = opts.extra === 'bear';
  const fur = bear ? '#9A6A3E' : PAL.fur;
  const face = bear ? '#D8B07A' : PAL.face;
  const group = new THREE.Group();
  const body = new THREE.Group(); // spins and squashes
  group.add(body);
  let cloth = bear ? new THREE.MeshStandardMaterial({ color: fur, roughness: 1 }) : fabric(opts.pattern, opts.hex, opts.dark);
  const vc = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 });
  const shiny = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.25 });
  const meshes = [];
  const add = (parent, geo, mat, cast = false) => {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = cast && !!opts.shadows;
    parent.add(m);
    meshes.push(m);
    return m;
  };

  // Torso: a soft barrel of pyjama top.
  const torsoGeo = new THREE.CapsuleGeometry(0.16, 0.12, 6, 16);
  at(torsoGeo, 0, 0.45, 0, 1, 1, 0.85);
  const torso = add(body, torsoGeo, cloth, true);
  if (!bear) {
    const pocket = add(body, new THREE.PlaneGeometry(0.1, 0.1), new THREE.MeshStandardMaterial({ map: pocketTexture(opts.symbol, opts.hex, opts.dark), roughness: 0.9 }));
    pocket.position.set(0.065, 0.5, 0.137);
  } else {
    const bow = tinted(at(new THREE.ConeGeometry(0.05, 0.08, 10), -0.04, 0.58, 0.13, 1, 1, 1, 0, 0, Math.PI / 2), '#D9473B');
    const bow2 = tinted(at(new THREE.ConeGeometry(0.05, 0.08, 10), 0.04, 0.58, 0.13, 1, 1, 1, 0, 0, -Math.PI / 2), '#D9473B');
    add(body, mergeGeometries([bow, bow2]), vc);
  }

  // Head: fur ball, face patch, muzzle, ears and lids in one mesh.
  const head = new THREE.Group();
  head.position.set(0, 0.74, 0);
  body.add(head);
  const parts = [
    tinted(at(sphere(0.2, 24, 18), 0, 0, 0, 1.02, 0.96, 0.95), fur),
    tinted(at(sphere(0.115), -0.068, 0.04, 0.1, 1, 1.05, 0.8), face),
    tinted(at(sphere(0.115), 0.068, 0.04, 0.1, 1, 1.05, 0.8), face),
    tinted(at(sphere(0.135), 0, -0.065, 0.12, 1.12, 0.78, 0.85), face),
  ];
  if (bear) {
    parts.push(tinted(at(sphere(0.075), -0.15, 0.15, -0.01, 1, 1, 0.6), fur), tinted(at(sphere(0.075), 0.15, 0.15, -0.01, 1, 1, 0.6), fur));
    parts.push(tinted(at(sphere(0.04), 0, -0.04, 0.23, 1.2, 0.8, 0.8), '#2A1A14'));
  } else {
    parts.push(
      tinted(at(sphere(0.085), -0.215, 0.01, -0.01, 0.55, 1, 1), fur),
      tinted(at(sphere(0.085), 0.215, 0.01, -0.01, 0.55, 1, 1), fur),
      tinted(at(sphere(0.055), -0.24, 0.01, 0.01, 0.4, 0.8, 0.8), face),
      tinted(at(sphere(0.055), 0.24, 0.01, 0.01, 0.4, 0.8, 0.8), face),
      // a tuft
      tinted(at(new THREE.ConeGeometry(0.05, 0.12, 8), 0.02, 0.21, 0.02, 1, 1, 1, 0.2, 0, -0.35), fur),
    );
    // Half lids: mischief.
    const lid = opts.extra === 'bigeyes' ? 0.25 : 0.55;
    for (const sx of [-1, 1]) {
      const g = new THREE.SphereGeometry(0.058, 16, 8, 0, Math.PI * 2, 0, Math.PI * lid);
      parts.push(tinted(at(g, sx * 0.068, 0.045, 0.165, 1, 1, 1, 0.5, 0, 0), face));
    }
  }
  add(head, mergeGeometries(parts), vc, true);

  // Eyes.
  const eyeR = opts.extra === 'bigeyes' ? 0.062 : 0.052;
  const eyeParts = [];
  for (const sx of [-1, 1]) {
    if (!bear) eyeParts.push(tinted(at(sphere(eyeR, 16, 12), sx * 0.068, 0.035, 0.165), '#FFFDF6'));
    eyeParts.push(tinted(at(sphere(bear ? 0.03 : 0.027, 12, 10), sx * 0.066, 0.03, bear ? 0.2 : 0.165 + eyeR - 0.012), '#1A1014'));
  }
  add(head, mergeGeometries(eyeParts), shiny);

  // Brows: they tilt with the mood.
  const brows = [];
  if (!bear) {
    for (const sx of [-1, 1]) {
      const bw = opts.extra === 'brows' ? 0.026 : 0.017;
      const g = tinted(new THREE.BoxGeometry(0.075, bw, 0.02), '#3A2418');
      const m = add(head, g, vc);
      m.position.set(sx * 0.07, 0.112, 0.19);
      m.userData.sx = sx;
      brows.push(m);
    }
  }

  // Mouth: a decal on the muzzle, one shape of the atlas at a time.
  mouthTex ??= mouthAtlas();
  const mt = mouthTex.clone();
  mt.repeat.set(1 / MOUTHS.length, 1);
  const mouthMat = new THREE.MeshBasicMaterial({ map: mt, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  const mouth = add(head, new THREE.PlaneGeometry(0.15, 0.15), mouthMat);
  mouth.position.set(0, -0.09, 0.232);
  mouth.rotation.x = -0.25;
  let mouthNow = -1;

  // Extras.
  if (opts.extra === 'glasses') {
    const gp = [];
    for (const sx of [-1, 1]) gp.push(tinted(at(new THREE.TorusGeometry(0.058, 0.011, 6, 20), sx * 0.068, 0.035, 0.2), '#1A1A22'));
    gp.push(tinted(at(new THREE.BoxGeometry(0.04, 0.012, 0.012), 0, 0.045, 0.21), '#1A1A22'));
    add(head, mergeGeometries(gp), vc);
  } else if (opts.extra === 'mask') {
    const g = tinted(at(new THREE.CapsuleGeometry(0.05, 0.14, 4, 10), 0, 0.15, 0.15, 1, 1, 0.5, 0, 0, Math.PI / 2), '#2B6CB0');
    add(head, g, vc);
  }

  // Nightcap (the leader).
  const capParts = [
    tinted(at(new THREE.ConeGeometry(0.17, 0.36, 16, 1, true), 0.05, 0.3, -0.02, 1, 1, 1, -0.2, 0, -0.45), PAL.red),
    tinted(at(new THREE.TorusGeometry(0.17, 0.035, 8, 20), 0, 0.15, 0, 1, 1, 1, Math.PI / 2 + 0.1, 0, 0.12), PAL.cream),
    tinted(at(sphere(0.055), 0.22, 0.42, -0.07), PAL.cream),
  ];
  const cap = add(head, mergeGeometries(capParts), vc);
  cap.visible = false;

  // Bandage (fell off).
  const band = add(head, tinted(at(new THREE.BoxGeometry(0.16, 0.05, 0.03), 0.08, 0.16, 0.13, 1, 1, 1, 0.3, 0.4, 0.5), '#F3E9D8'), vc);
  band.visible = false;

  // Arms and legs: pivot groups.
  const limb = (x, y, len, r) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, y, 0);
    body.add(pivot);
    const sleeve = new THREE.CapsuleGeometry(r, len, 4, 10);
    at(sleeve, 0, -len / 2 - r * 0.6, 0);
    add(pivot, sleeve, cloth);
    return pivot;
  };
  const armL = limb(-0.175, 0.55, 0.14, 0.05);
  const armR = limb(0.175, 0.55, 0.14, 0.05);
  const hand = () => tinted(at(sphere(0.058, 12, 10), 0, -0.27, 0.01), face);
  add(armL, hand(), vc);
  add(armR, hand(), vc);
  const legL = limb(-0.075, 0.31, 0.14, 0.062);
  const legR = limb(0.075, 0.31, 0.14, 0.062);
  const footGeo = () => tinted(at(sphere(0.07, 12, 10), 0, -0.285, 0.04, 0.9, 0.55, 1.35), face);
  add(legL, footGeo(), vc);
  add(legR, footGeo(), vc);

  // Tail: a curl behind.
  let tail = null;
  if (!bear) {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, -0.06, -0.18), new THREE.Vector3(0, 0.08, -0.36),
      new THREE.Vector3(0, 0.32, -0.38), new THREE.Vector3(0, 0.42, -0.22), new THREE.Vector3(0, 0.33, -0.14),
    ]);
    tail = new THREE.Group();
    tail.position.set(0, 0.36, -0.12);
    body.add(tail);
    add(tail, tinted(new THREE.TubeGeometry(curve, 24, 0.024, 6), fur), vc);
  }

  let wobble = Math.random() * 10;

  /**
   * p: { x, y, z, yaw, squash (0-1), vy, tuck (0-1), spin (radians), spinAxis ('x'|'z'), windmill (0-1), sit (0-1),
   *      arms ('up'|'down'|'cheer'), mouth (index or name), brow (-1 angry .. 1 worried), t (seconds), scale }
   */
  function pose(p) {
    group.position.set(p.x, p.y, p.z);
    group.rotation.y = p.yaw ?? 0;
    const s = p.scale ?? 1;
    const sq = p.squash ?? 0;
    const stretch = Math.min(0.14, Math.abs(p.vy ?? 0) * 0.012) * (1 - (p.tuck ?? 0));
    body.scale.set(s * (1 + 0.22 * sq - stretch * 0.5), s * (1 - 0.32 * sq + stretch), s * (1 + 0.22 * sq - stretch * 0.5));
    // Spin around the waist.
    body.position.set(0, 0, 0);
    body.rotation.set(0, 0, 0);
    if (p.spin) {
      const k = 0.45 * s;
      if (p.spinAxis === 'z') body.rotation.z = p.spin;
      else body.rotation.x = p.spin;
      // Keep the waist where it was while spinning.
      body.position.y = k - k * Math.cos(p.spin);
      if (p.spinAxis === 'z') body.position.x = k * Math.sin(p.spin);
      else body.position.z = -k * Math.sin(p.spin);
    }
    const t = p.t ?? 0;
    wobble = t;
    const tuck = p.tuck ?? 0;
    const sit = p.sit ?? 0;
    // Legs: tuck up for a slam, out in front when sitting, a little run in the air.
    const kick = p.vy !== undefined && !sit && !tuck ? Math.sin(t * 9) * 0.25 * Math.min(1, Math.abs(p.vy) / 4) : 0;
    legL.rotation.set(-1.5 * tuck - 1.45 * sit + kick, 0, -0.1 - 0.35 * sit);
    legR.rotation.set(-1.5 * tuck - 1.45 * sit - kick, 0, 0.1 + 0.35 * sit);
    body.position.y += (-0.12 * tuck - 0.24 * sit) * s;
    head.rotation.set(0.15 * tuck - 0.1 * sit, 0, 0);
    // Arms.
    let al = 0.25;
    let ar = 0.25;
    let ax = 0;
    if (p.windmill) {
      al = (t * 14) % (Math.PI * 2);
      ar = al + Math.PI;
      ax = 0;
      armL.rotation.set(al, 0, -0.5);
      armR.rotation.set(ar, 0, 0.5);
    } else {
      if (p.arms === 'up') {
        al = 2.6;
        ar = 2.6;
      } else if (p.arms === 'cheer') {
        al = 2.7 + Math.sin(t * 12) * 0.3;
        ar = 2.7 - Math.sin(t * 12) * 0.3;
      } else if (tuck > 0) {
        al = 0.6 * tuck;
        ar = 0.6 * tuck;
        ax = -1.2 * tuck;
      } else if (sit) {
        ax = -0.8 * sit;
      } else {
        al = 0.3 + Math.max(0, (p.vy ?? 0) * 0.12);
        ar = al;
      }
      armL.rotation.set(ax, 0, -al);
      armR.rotation.set(ax, 0, ar);
    }
    if (tail) tail.rotation.set(Math.sin(t * 3 + 1) * 0.2 - (p.vy ?? 0) * 0.03, Math.sin(t * 2) * 0.3, 0);
    // Face.
    let mi = typeof p.mouth === 'string' ? MOUTHS.indexOf(p.mouth) : p.mouth ?? 0;
    if (mi < 0) mi = 0;
    if (mi !== mouthNow) {
      mouthNow = mi;
      mt.offset.set(mi / MOUTHS.length, 0);
    }
    const bt = p.brow ?? 0;
    for (const b of brows) b.rotation.z = b.userData.sx * bt * 0.45;
  }

  function setPattern(pattern) {
    if (bear) return;
    const next = fabric(pattern, opts.hex, opts.dark);
    if (next === cloth) return;
    for (const m of meshes) if (m.material === cloth) m.material = next;
    cloth = next;
  }

  return {
    group,
    head,
    pose,
    setPattern,
    setCap(on) {
      cap.visible = !!on;
    },
    setBandage(on) {
      band.visible = !!on;
    },
    dispose() {
      group.removeFromParent();
      const shared = new Set(fabricCache.values());
      const done = new Set();
      for (const m of meshes) {
        m.geometry?.dispose();
        if (!shared.has(m.material) && !done.has(m.material)) {
          done.add(m.material);
          m.material.dispose?.();
        }
      }
      mt.dispose();
    },
  };
}
