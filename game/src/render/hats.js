// Hats from the wardrobe, built from soft shapes. Each is a group whose origin is the top of the head (y up, facing +z);
// `userData.spin(t)` animates the ones that move (a propeller, a floating moon).
import * as THREE from 'three';

const mats = new Map();
function soft(hex, extra = {}) {
  const key = `${hex}|${JSON.stringify(extra)}`;
  if (!mats.has(key)) mats.set(key, new THREE.MeshPhysicalMaterial({ color: hex, roughness: 0.88, sheen: 0.8, sheenRoughness: 0.55, sheenColor: new THREE.Color(hex).lerp(new THREE.Color('#ffffff'), 0.35), ...extra }));
  return mats.get(key);
}

/** A tube swept along `curve` with radius `r(u)`, capped at the start. */
function sweep(curve, r, seg = 28, radial = 18) {
  const frames = curve.computeFrenetFrames(seg, false);
  const pos = [];
  const idx = [];
  for (let i = 0; i <= seg; i++) {
    const u = i / seg;
    const c = curve.getPointAt(u);
    const N = frames.normals[i];
    const Bn = frames.binormals[i];
    const rr = r(u);
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      pos.push(c.x + rr * (Math.cos(a) * N.x + Math.sin(a) * Bn.x), c.y + rr * (Math.cos(a) * N.y + Math.sin(a) * Bn.y), c.z + rr * (Math.cos(a) * N.z + Math.sin(a) * Bn.z));
    }
  }
  for (let i = 0; i < seg; i++) for (let j = 0; j < radial; j++) {
    const a = i * (radial + 1) + j;
    const b = a + radial + 1;
    idx.push(a, a + 1, b, b, a + 1, b + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// The head under a hat: an ellipsoid with these radii (times the body's head size), the hat's origin at its top.
const HEAD = [0.238, 0.215, 0.21];
/** Half-widths [x, z] of the head `depth` below its top. */
function headAt(H, depth) {
  const ry = HEAD[1] * H;
  const k = Math.sqrt(Math.max(0, 1 - ((ry - depth) / ry) ** 2));
  return [HEAD[0] * H * k, HEAD[2] * H * k];
}
/** A shell that hugs the head down to `depth` below its top, `puff` times the head's size. */
function shell(H, depth, puff = 1.06, segs = 36) {
  const [rx, ry, rz] = HEAD.map((v) => v * H);
  const theta = Math.acos(Math.max(-1, Math.min(1, (ry - depth) / (ry * puff))));
  const g = new THREE.SphereGeometry(1, segs, 16, 0, Math.PI * 2, 0, theta);
  g.scale(rx * puff, ry * puff, rz * puff);
  g.translate(0, -ry, 0);
  return g;
}
/** A soft roll around the head `depth` below its top. */
function roll(H, depth, tube, puff = 1.04) {
  const [x, z] = headAt(H, depth);
  const g = new THREE.TorusGeometry(1, tube / (x * puff), 10, 40).rotateX(Math.PI / 2);
  g.scale(x * puff, x * puff, z * puff);
  g.translate(0, -depth, 0);
  return g;
}

function stripes(a, b, n = 6) {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 256;
  const g = c.getContext('2d');
  for (let i = 0; i < n; i++) {
    g.fillStyle = i % 2 ? a : b;
    g.fillRect(0, (i * 256) / n, 64, 256 / n + 1);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function dotsTex(base, dot) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = base;
  g.fillRect(0, 0, 128, 128);
  g.fillStyle = dot;
  for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) {
    g.beginPath();
    g.arc(i * 32 + 16 + (j % 2) * 16, j * 32 + 16, 5, 0, Math.PI * 2);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(3, 2);
  return t;
}

/** Build hat `id` for a head of size `head`, in colour `color` (the seat's) with `dark`. */
export function buildHat(id, { color = '#3C86F0', dark = '#1F4E9A', head = 1 } = {}) {
  const H = head;
  const g = new THREE.Group();
  const cream = '#FFF1D6';
  const R = 0.238 * H;
  // Materials made for this hat alone (the soft ones are shared): `userData.dispose()` frees them and the shapes.
  const own = [];
  const mine = (m) => {
    own.push(m);
    return m;
  };
  g.userData.dispose = () => {
    g.traverse((o) => o.geometry?.dispose());
    for (const m of own) {
      m.map?.dispose();
      m.dispose();
    }
  };
  const add = (geo, mat, x = 0, y = 0, z = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    g.add(m);
    return m;
  };
  switch (id) {
    case 'nightcap':
    case 'goldcap': {
      const gold = id === 'goldcap';
      const body = gold ? '#FFC23A' : color;
      const d = 0.1 * H;
      const [x0, z0] = headAt(H, d);
      const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(0, -d, 0), new THREE.Vector3(0, 0.26 * H, -0.03 * H), new THREE.Vector3(0.22 * H, 0.15 * H, -0.1 * H));
      const sock = add(sweep(curve, (u) => x0 * 1.07 * Math.pow(1 - u, 1.1) + 0.012), soft(body, gold ? { emissive: '#7A4A00', emissiveIntensity: 0.25, metalness: 0.2, roughness: 0.5 } : {}));
      sock.scale.z = z0 / x0;
      add(roll(H, d, 0.03 * H, 1.1), soft(cream));
      const tip = curve.getPointAt(1);
      add(new THREE.SphereGeometry(0.045 * H, 14, 10), soft(cream), tip.x, tip.y - 0.01, tip.z * (z0 / x0));
      break;
    }
    case 'mask': {
      const m = add(new THREE.CapsuleGeometry(0.045 * H, 0.17 * H, 6, 16).rotateZ(Math.PI / 2), soft(color));
      m.scale.set(1, 0.85, 0.5);
      m.position.set(0, -0.05 * H, 0.15 * H);
      m.rotation.x = -0.5;
      for (const s of [-1, 1]) {
        const e = add(new THREE.TorusGeometry(0.02 * H, 0.005, 6, 16, Math.PI), soft(cream));
        e.position.set(s * 0.05 * H, -0.045 * H, 0.18 * H);
        e.rotation.set(-0.5, 0, Math.PI);
      }
      const strap = add(new THREE.TorusGeometry(R * 1.02, 0.008, 6, 40), soft(dark));
      strap.rotation.x = Math.PI / 2 - 0.5;
      strap.position.y = -0.12 * H;
      break;
    }
    case 'beanie': {
      add(shell(H, 0.11 * H, 1.07), mine(new THREE.MeshPhysicalMaterial({ map: stripes(color, dark, 10), roughness: 0.9, sheen: 0.7, sheenRoughness: 0.6, sheenColor: new THREE.Color(color).lerp(new THREE.Color('#ffffff'), 0.4) })));
      add(roll(H, 0.1 * H, 0.034 * H, 1.1), soft(cream));
      add(new THREE.SphereGeometry(0.06 * H, 14, 10), soft(cream), 0, 0.055 * H, -0.01 * H);
      break;
    }
    case 'crown': {
      const n = 14;
      const pos = [];
      const idx = [];
      const d = 0.06 * H;
      const [cx, cz] = headAt(H, d);
      for (let i = 0; i <= n * 2; i++) {
        const a = (i / (n * 2)) * Math.PI * 2;
        const x = Math.sin(a) * cx * 1.06;
        const z = Math.cos(a) * cz * 1.06;
        pos.push(x, -d, z, x * 1.12, -d + (i % 2 ? 0.07 : 0.13) * H, z * 1.12);
      }
      for (let i = 0; i < n * 2; i++) {
        const a = i * 2;
        idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setIndex(idx);
      geo.computeVertexNormals();
      add(geo, mine(new THREE.MeshPhysicalMaterial({ color: '#FFC94A', roughness: 0.4, metalness: 0.35, side: THREE.DoubleSide, sheen: 0.3, emissive: '#5A3A00', emissiveIntensity: 0.2 })));
      for (let i = 0; i < 3; i++) {
        const a = (i - 1) * 0.6;
        add(new THREE.SphereGeometry(0.02 * H, 10, 8), mine(new THREE.MeshPhysicalMaterial({ color: ['#E5483C', '#3C86F0', '#39B86E'][i], roughness: 0.2, clearcoat: 1 })), Math.sin(a) * cx * 1.12, -d + 0.035 * H, Math.cos(a) * cz * 1.12);
      }
      g.rotation.z = 0.14;
      break;
    }
    case 'propeller': {
      const tex = stripes(color, '#FFC94A', 8);
      const d = 0.1 * H;
      add(shell(H, d, 1.06), mine(new THREE.MeshPhysicalMaterial({ map: tex, roughness: 0.8, sheen: 0.5 })));
      const [, fz] = headAt(H, d);
      const brim = add(new THREE.CylinderGeometry(0.11 * H, 0.11 * H, 0.012, 20, 1, false, -0.9, 1.8), soft(dark));
      brim.position.set(0, -d, fz * 1.02);
      brim.scale.set(1.2, 1, 0.9);
      add(new THREE.CylinderGeometry(0.008, 0.008, 0.06 * H, 8), soft('#B8B8C0'), 0, 0.07 * H, 0);
      const prop = new THREE.Group();
      prop.position.y = 0.1 * H;
      g.add(prop);
      for (const s of [0, Math.PI]) {
        const blade = new THREE.Mesh(new THREE.CapsuleGeometry(0.018 * H, 0.12 * H, 4, 8).rotateZ(Math.PI / 2), soft(s ? '#E5483C' : '#3C86F0'));
        blade.scale.set(1, 0.3, 1);
        blade.position.x = Math.cos(s) * 0.075 * H;
        blade.rotation.x = 0.3;
        prop.add(blade);
      }
      g.userData.spin = (t) => {
        prop.rotation.y = t * 14;
      };
      break;
    }
    case 'bunny': {
      const band = add(new THREE.TorusGeometry(R * 1.03, 0.012, 8, 30, Math.PI), soft(color));
      band.position.y = -0.17 * H;
      band.scale.y = (0.18 * H) / (R * 1.03);
      for (const s of [-1, 1]) {
        const ear = add(new THREE.CapsuleGeometry(0.035 * H, 0.2 * H, 6, 14), soft('#FFF6EE'));
        ear.position.set(s * 0.07 * H, 0.13 * H, -0.01);
        ear.rotation.z = -s * 0.22;
        ear.scale.set(1, 1, 0.45);
        const inner = new THREE.Mesh(new THREE.CapsuleGeometry(0.02 * H, 0.15 * H, 6, 12), soft('#F7A9B8'));
        inner.position.z = 0.02 * H;
        inner.scale.set(1, 1, 0.4);
        ear.add(inner);
      }
      break;
    }
    case 'party': {
      const tex = stripes(color, '#FFC94A', 6);
      const cone = add(new THREE.ConeGeometry(0.105 * H, 0.3 * H, 24, 1, true), mine(new THREE.MeshPhysicalMaterial({ map: tex, roughness: 0.6, side: THREE.DoubleSide })));
      cone.position.set(0.02, 0.11 * H, 0);
      cone.rotation.z = -0.2;
      add(new THREE.SphereGeometry(0.035 * H, 12, 10), soft('#FFF1D6'), 0.02 + Math.sin(0.2) * 0.15 * H, 0.26 * H, 0);
      break;
    }
    case 'dino': {
      const n = 6;
      for (let i = 0; i < n; i++) {
        const a = -0.35 + (i / (n - 1)) * 1.85;
        const s = 1 - Math.abs(i - 1.5) * 0.12;
        const spike = add(new THREE.ConeGeometry(0.06 * H * s, 0.13 * H * s, 5), soft(i % 2 ? '#39B86E' : '#7BD46A'));
        spike.position.set(0, (Math.cos(a) - 1) * 0.215 * H + 0.025 * H, Math.sin(a) * 0.215 * H);
        spike.rotation.x = a;
        spike.scale.set(0.5, 1, 1.2);
      }
      break;
    }
    case 'headphones': {
      const band = add(new THREE.TorusGeometry(R * 1.06, 0.016, 8, 30, Math.PI), mine(new THREE.MeshPhysicalMaterial({ color: '#2B2B36', roughness: 0.4, clearcoat: 0.5 })));
      band.position.y = -0.2 * H;
      band.scale.y = (0.215 * H) / (R * 1.06);
      for (const s of [-1, 1]) {
        const cup = add(new THREE.CylinderGeometry(0.06 * H, 0.06 * H, 0.05 * H, 20).rotateZ(Math.PI / 2), soft(color));
        cup.position.set(s * R * 1.06, -0.2 * H, 0.02);
        const pad = add(new THREE.TorusGeometry(0.045 * H, 0.015 * H, 8, 18).rotateY(Math.PI / 2), soft('#2B2B36'));
        pad.position.set(s * R * 0.98, -0.2 * H, 0.02);
      }
      break;
    }
    case 'halo': {
      const moon = add(new THREE.TorusGeometry(0.07 * H, 0.022 * H, 10, 30, 4.4), mine(new THREE.MeshStandardMaterial({ color: '#FFF3B0', emissive: '#FFE27A', emissiveIntensity: 1.4, roughness: 0.4 })));
      moon.position.y = 0.12 * H;
      moon.rotation.z = 0.9;
      g.userData.spin = (t) => {
        moon.position.y = 0.12 * H + Math.sin(t * 2) * 0.012;
        moon.rotation.y = Math.sin(t * 0.8) * 0.4;
      };
      break;
    }
    case 'bandana': {
      add(shell(H, 0.09 * H, 1.05), mine(new THREE.MeshPhysicalMaterial({ map: dotsTex('#C8322A', '#FFF1D6'), roughness: 0.85, sheen: 0.5 })));
      const knot = add(new THREE.SphereGeometry(0.035 * H, 12, 10), soft('#C8322A'), 0, -0.1 * H, -R * 1.02);
      knot.scale.set(1.2, 1, 0.8);
      for (const s of [-1, 1]) {
        const tail = add(new THREE.CapsuleGeometry(0.02 * H, 0.08 * H, 4, 8), soft('#C8322A'), s * 0.03 * H, -0.16 * H, -R * 1.04);
        tail.rotation.z = s * 0.4;
        tail.scale.set(1, 1, 0.4);
      }
      break;
    }
    default:
      return null;
  }
  return g;
}
