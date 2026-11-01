// A plush monkey (or bear) as one smooth skinned mesh. The body is sculpted from soft shapes (a signed distance field),
// meshed with surface nets, and each vertex gets skin weights and fabric weights (fur, face skin, pyjama cloth, trim) from
// the shapes nearest to it. Pure geometry: no three.js here, so tests can mesh it in node.

// --- the skeleton -----------------------------------------------------------------------------------------------------

/** Bone names in order; each with its parent. */
export const BONES = [
  ['root', null], ['hips', 'root'], ['spine', 'hips'], ['chest', 'spine'], ['neck', 'chest'], ['head', 'neck'],
  ['earL', 'head'], ['earR', 'head'], ['jaw', 'head'],
  ['armL', 'chest'], ['foreL', 'armL'], ['handL', 'foreL'], ['armR', 'chest'], ['foreR', 'armR'], ['handR', 'foreR'],
  ['thighL', 'hips'], ['shinL', 'thighL'], ['footL', 'shinL'], ['thighR', 'hips'], ['shinR', 'thighR'], ['footR', 'shinR'],
  ['tail1', 'hips'], ['tail2', 'tail1'], ['tail3', 'tail2'], ['tail4', 'tail3'], ['tail5', 'tail4'], ['tail6', 'tail5'],
];
export const BONE_INDEX = Object.fromEntries(BONES.map(([n], i) => [n, i]));

/** Body proportions. A monkey is about 1.1 units tall in its model (the view scales it). */
export const BODY_DEFAULT = {
  head: 1, girth: 1, belly: 1, limb: 1, limbGirth: 1, ear: 1, earDroop: 0, muzzle: 1, tail: 1, bear: false, hands: 1,
};

/** Body shapes of the cast (baked into the game by `npm run bake`). */
export const BODIES = {
  player: { ...BODY_DEFAULT },
  rumble: { ...BODY_DEFAULT, girth: 1.16, belly: 1.15, limbGirth: 1.15, head: 0.97, ear: 0.82, muzzle: 1.1, hands: 1.18 },
  tiptoe: { ...BODY_DEFAULT, girth: 0.88, limb: 1.1, limbGirth: 0.88, head: 1.04, ear: 1.25, muzzle: 0.9 },
  mimic: { ...BODY_DEFAULT, head: 1.1, girth: 0.97, muzzle: 1.0 },
  dozy: { ...BODY_DEFAULT, girth: 1.06, belly: 1.32, earDroop: 0.7, ear: 1.1, muzzle: 1.06 },
  bear: { ...BODY_DEFAULT, bear: true, head: 1.06, girth: 1.1, belly: 1.15 },
};

/** Fur and face colours of each body. */
export const FURS = {
  player: ['#7A4B2E', '#EDC9A1'], rumble: ['#583624', '#E4BC93'], tiptoe: ['#B27B44', '#F2D3AE'], mimic: ['#7A6858', '#E8CDB0'],
  dozy: ['#8E4C30', '#EEC6A0'], bear: ['#A8743F', '#E9C99A'],
};

const v3 = (x, y, z) => [x, y, z];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const norm = (a) => mul(a, 1 / (len(a) || 1));
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/** The joints of a body: name → [x, y, z] in the model (bind pose: an A-pose facing +z). */
export function jointsFor(body = BODY_DEFAULT) {
  const P = { ...BODY_DEFAULT, ...body };
  const L = P.limb;
  const hipY = 0.3;
  const j = {};
  j.root = v3(0, 0, 0);
  j.hips = v3(0, hipY, 0);
  j.spine = v3(0, 0.4, 0);
  j.chest = v3(0, 0.5, 0);
  j.neck = v3(0, 0.58, 0);
  j.head = v3(0, 0.63, 0);
  const headC = v3(0, 0.63 + 0.19 * P.head, 0);
  j.headC = headC;
  const er = 0.235 * P.head;
  if (P.bear) {
    j.earL = add(headC, v3(-er * 0.68, er * 0.72, -0.01));
    j.earR = add(headC, v3(er * 0.68, er * 0.72, -0.01));
  } else {
    j.earL = add(headC, v3(-er * 0.97, 0.03 * P.head, -0.02));
    j.earR = add(headC, v3(er * 0.97, 0.03 * P.head, -0.02));
  }
  j.jaw = add(headC, v3(0, -0.075 * P.head, 0.12 * P.head));
  // Arms: an A-pose, 55 degrees out from hanging.
  const a = (55 * Math.PI) / 180;
  for (const [s, k] of [['L', -1], ['R', 1]]) {
    const dir = [k * Math.sin(a), -Math.cos(a), 0];
    const sh = v3(k * 0.115 * P.girth, 0.505, 0);
    j[`arm${s}`] = sh;
    j[`fore${s}`] = add(sh, mul(dir, 0.13 * L));
    j[`hand${s}`] = add(j[`fore${s}`], mul(dir, 0.115 * L));
    j[`tip${s}`] = add(j[`hand${s}`], mul(dir, 0.07 * P.hands));
    const hip = v3(k * 0.088 * P.girth, hipY - 0.01, 0);
    j[`thigh${s}`] = hip;
    j[`shin${s}`] = add(hip, v3(k * 0.012, -0.125 * L, 0.006));
    j[`foot${s}`] = add(j[`shin${s}`], v3(k * 0.004, -0.115 * L, -0.004));
    j[`toe${s}`] = add(j[`foot${s}`], v3(0, -0.03, 0.1));
  }
  // The tail: back from the seat, then up in a curl.
  const T = P.tail * (P.bear ? 0.25 : 1);
  const pts = [[0, 0.27, -0.13], [0, 0.27, -0.21], [0, 0.31, -0.29], [0, 0.39, -0.335], [0, 0.48, -0.34], [0, 0.56, -0.31], [0, 0.6, -0.26]];
  for (let i = 0; i < 7; i++) {
    const p = pts[i];
    const q = add(pts[0], mul(sub(p, pts[0]), T));
    j[i < 6 ? `tail${i + 1}` : 'tailTip'] = q;
  }
  return j;
}

// --- shapes -----------------------------------------------------------------------------------------------------------

function sdRoundCone(p, a, b, r1, r2) {
  // iq's round cone between a and b.
  const ba = sub(b, a);
  const l2 = dot(ba, ba);
  const rr = r1 - r2;
  const a2 = l2 - rr * rr;
  const il2 = 1 / l2;
  const pa = sub(p, a);
  const y = dot(pa, ba);
  const z = y - l2;
  const xv = sub(mul(pa, l2), mul(ba, y));
  const x2 = dot(xv, xv);
  const y2 = y * y * l2;
  const z2 = z * z * l2;
  const k = Math.sign(rr) * rr * rr * x2;
  if (Math.sign(z) * a2 * z2 > k) return Math.sqrt(x2 + z2) * il2 - r2;
  if (Math.sign(y) * a2 * y2 < k) return Math.sqrt(x2 + y2) * il2 - r1;
  return (Math.sqrt(x2 * a2 * il2) + y * rr) * il2 - r1;
}

function sdEllipsoid(q, r) {
  const k0 = Math.hypot(q[0] / r[0], q[1] / r[1], q[2] / r[2]);
  const k1 = Math.hypot(q[0] / (r[0] * r[0]), q[1] / (r[1] * r[1]), q[2] / (r[2] * r[2]));
  return k1 > 1e-9 ? (k0 * (k0 - 1)) / k1 : -Math.min(r[0], r[1], r[2]);
}

function sdTorus(q, R, r) {
  // Torus around the local y axis.
  const xz = Math.hypot(q[0], q[2]) - R;
  return Math.hypot(xz, q[1]) - r;
}

/** A rotation (3×3, rows) taking world directions into a shape's local frame: local y along `axis`, local z near `fwd`. */
function frame(axis, fwd = [0, 0, 1]) {
  const y = norm(axis);
  let z = sub(fwd, mul(y, dot(fwd, y)));
  if (len(z) < 1e-4) z = Math.abs(y[0]) < 0.9 ? [1, 0, 0] : [0, 0, 1];
  z = norm(z);
  const x = [y[1] * z[2] - y[2] * z[1], y[2] * z[0] - y[0] * z[2], y[0] * z[1] - y[1] * z[0]];
  return [x, y, z];
}
const toLocal = (R, d) => [dot(R[0], d), dot(R[1], d), dot(R[2], d)];

function smin(a, b, k) {
  if (k <= 0) return Math.min(a, b);
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}

// Fabric channels: fur, skin (face, hands, feet, inner ears), cloth (pyjamas), trim (cuffs, collar).
const FUR = [1, 0, 0, 0];
const SKIN = [0, 1, 0, 0];
const CLOTH = [0, 0, 1, 0];
const TRIM = [0, 0, 0, 1];

/**
 * The shapes of a body: [{ d(p) → distance, bone, mat(p) → fabric weights, group }]. Group 'core' shapes melt together;
 * every other group melts into the core but not into the other groups (the legs stay apart).
 */
export function shapesFor(body = BODY_DEFAULT) {
  const P = { ...BODY_DEFAULT, ...body };
  const j = jointsFor(P);
  const S = [];
  const g = P.girth;
  const shape = (group, bone, d, mat) => S.push({ group, bone: BONE_INDEX[bone], d, mat: typeof mat === 'function' ? mat : () => mat });

  // Torso: a soft pear of pyjama top, the belly a little forward.
  const belly = P.belly;
  shape('core', 'hips', (p) => sdEllipsoid(sub(p, [0, 0.31, 0.005]), [0.158 * g * belly, 0.115, 0.14 * g * belly]), CLOTH);
  shape('core', 'spine', (p) => sdEllipsoid(sub(p, [0, 0.4, 0.012]), [0.15 * g * (0.5 + 0.5 * belly), 0.12, 0.135 * g * (0.5 + 0.5 * belly)]), CLOTH);
  shape('core', 'chest', (p) => sdEllipsoid(sub(p, [0, 0.49, 0]), [0.13 * g, 0.085, 0.112 * g]), CLOTH);
  shape('core', 'neck', (p) => sdRoundCone(p, [0, 0.52, 0], [0, 0.62, 0.005], 0.085 * g, 0.075), CLOTH);
  // The collar: a soft roll of trim around the neck.
  const collarR = frame([0, 1, 0.22]);
  shape('core', 'chest', (p) => sdTorus(toLocal(collarR, sub(p, [0, 0.565, 0.01])), 0.088 * g, 0.019), TRIM);

  // Head: a big soft ball, the face mask, the muzzle.
  const hc = j.headC;
  const H = P.head;
  const hr = [0.238 * H, 0.215 * H, 0.21 * H];
  const faceMat = (p) => {
    if (P.bear) {
      const q = sub(p, add(hc, [0, -0.05 * H, 0.17 * H]));
      const t = clamp((0.1 * H - Math.hypot(q[0] * 1.1, q[1] * 1.3, q[2] * 0.6)) / 0.02, 0, 1);
      return [1 - t, t, 0, 0];
    }
    // The heart-shaped face of a sock monkey: two eye lobes and the lower face, on the front of the head.
    const q = sub(p, hc);
    const front = clamp((q[2] - 0.02 * H) / (0.06 * H), 0, 1);
    const lobe = (sx) => 0.086 * H - Math.hypot(q[0] - sx * 0.074 * H, (q[1] - 0.028 * H) * 1.05);
    const low = Math.min(0.145 * H - Math.abs(q[0]) * 1.0 - Math.max(0, q[1] + 0.02 * H) * 2.4, 0.06 * H - (q[1] + 0.035 * H) * 0.2);
    const inside = Math.max(lobe(-1), lobe(1), Math.min(low, 0.02 * H - q[1]));
    const t = clamp((inside + 0.006) / 0.014, 0, 1) * front;
    return [1 - t, t, 0, 0];
  };
  shape('core', 'head', (p) => sdEllipsoid(sub(p, hc), hr), faceMat);
  const mz = P.muzzle;
  if (P.bear) {
    shape('core', 'head', (p) => sdEllipsoid(sub(p, add(hc, [0, -0.06 * H, 0.15 * H])), [0.085 * mz * H, 0.07 * mz * H, 0.08 * mz * H]), SKIN);
  } else {
    shape('core', 'jaw', (p) => sdEllipsoid(sub(p, add(hc, [0, -0.07 * H, 0.15 * H])), [0.128 * mz * H, 0.083 * mz * H, 0.09 * mz * H]), SKIN);
    // Cheeks: a little puff each side of the muzzle.
    for (const s of [-1, 1]) shape('core', 'head', (p) => sdEllipsoid(sub(p, add(hc, [s * 0.1 * H, -0.045 * H, 0.1 * H])), [0.07 * H, 0.06 * H, 0.07 * H]), (p) => faceMat(p));
  }

  // Ears.
  for (const [s, k] of [['L', -1], ['R', 1]]) {
    const c = j[`ear${s}`];
    const E = P.ear * H;
    const bone = `ear${s}`;
    if (P.bear) {
      const R = frame([k * 0.4, 1, 0], [0, 0, 1]);
      shape(`ear${s}`, bone, (p) => sdEllipsoid(toLocal(R, sub(p, c)), [0.06 * E, 0.055 * E, 0.03 * E]), (p) => {
        const q = toLocal(R, sub(p, c));
        const t = clamp((0.035 * E - Math.hypot(q[0], q[1])) / 0.012, 0, 1) * clamp(q[2] / 0.01, 0, 1);
        return [1 - t, t, 0, 0];
      });
    } else {
      // A cupped disc facing forward and a little out; droop tips it down.
      const R = frame([k * 0.15, 1, -0.1 + P.earDroop * 0.6], [k * 0.45, -P.earDroop * 0.4, 1]);
      shape(`ear${s}`, bone, (p) => {
        const q = toLocal(R, sub(p, c));
        const outer = sdEllipsoid(q, [0.082 * E, 0.09 * E, 0.032 * E]);
        const cup = sdEllipsoid(sub(q, [0, 0, 0.03 * E]), [0.058 * E, 0.065 * E, 0.03 * E]);
        return Math.max(outer, -cup + 0.004);
      }, (p) => {
        const q = toLocal(R, sub(p, c));
        const t = clamp((0.066 * E - Math.hypot(q[0], q[1] * 0.9)) / 0.014, 0, 1) * clamp((q[2] + 0.004) / 0.012, 0, 1);
        return [1 - t, t, 0, 0];
      });
    }
  }

  // Arms: sleeves, a cuff at the wrist, a soft mitt of a hand with a thumb.
  const lg = P.limbGirth;
  for (const [s, k] of [['L', -1], ['R', 1]]) {
    const sh = j[`arm${s}`];
    const el = j[`fore${s}`];
    const wr = j[`hand${s}`];
    const tip = j[`tip${s}`];
    const grp = `arm${s}`;
    shape(grp, `arm${s}`, (p) => sdRoundCone(p, sh, el, 0.058 * lg, 0.05 * lg), CLOTH);
    shape(grp, `fore${s}`, (p) => sdRoundCone(p, el, wr, 0.05 * lg, 0.047 * lg), CLOTH);
    const dir = norm(sub(wr, el));
    const cuffR = frame(dir);
    shape(grp, `fore${s}`, (p) => sdTorus(toLocal(cuffR, sub(p, add(wr, mul(dir, -0.012)))), 0.043 * lg, 0.014 * lg), TRIM);
    const hcen = add(wr, mul(sub(tip, wr), 0.55));
    const handR = frame(dir, [0, 0, 1]);
    const hs = P.hands;
    shape(grp, `hand${s}`, (p) => sdEllipsoid(toLocal(handR, sub(p, hcen)), [0.048 * hs, 0.058 * hs, 0.036 * hs]), SKIN);
    const th = add(hcen, add(mul(dir, -0.012), [0, 0, 0.034 * hs]));
    shape(grp, `hand${s}`, (p) => sdRoundCone(p, add(th, mul(dir, -0.012)), add(th, add(mul(dir, 0.014), [-k * 0.006, 0, 0.008])), 0.017 * hs, 0.014 * hs), SKIN);
  }

  // Legs: pyjama trousers, a cuff at the ankle, a big soft foot.
  for (const [s] of [['L'], ['R']]) {
    const hp = j[`thigh${s}`];
    const kn = j[`shin${s}`];
    const an = j[`foot${s}`];
    const grp = `leg${s}`;
    shape(grp, `thigh${s}`, (p) => sdRoundCone(p, hp, kn, 0.07 * lg * g, 0.058 * lg), CLOTH);
    shape(grp, `shin${s}`, (p) => sdRoundCone(p, kn, an, 0.058 * lg, 0.052 * lg), CLOTH);
    shape(grp, `shin${s}`, (p) => sdTorus(sub(p, add(an, [0, 0.012, 0])), 0.05 * lg, 0.015 * lg), TRIM);
    const fc = add(an, [0, -0.032, 0.03]);
    shape(grp, `foot${s}`, (p) => sdEllipsoid(sub(p, fc), [0.058, 0.04, 0.09]), (p) => {
      // A sole of skin under the toes, fur on top (a monkey's foot, out of its trousers).
      const t = clamp((0.012 - (p[1] - fc[1])) / 0.02, 0, 1);
      return [1 - t * 0.2, t * 0.2 + 0, 0, 0].map((v, i) => (i === 0 ? 0.25 * (1 - t) : i === 1 ? 0.75 + 0.25 * t : 0));
    });
  }

  // The tail: a chain of fur, thinning to a fluffy tip.
  if (!P.bear) {
    const names = ['tail1', 'tail2', 'tail3', 'tail4', 'tail5', 'tail6', 'tailTip'];
    for (let i = 0; i < 6; i++) {
      const a = j[names[i]];
      const b = j[names[i + 1]];
      const r1 = 0.032 - i * 0.002;
      const r2 = 0.032 - (i + 1) * 0.002;
      shape('tail', names[i], (p) => sdRoundCone(p, a, b, r1, r2), FUR);
    }
    const tip = j.tailTip;
    shape('tail', 'tail6', (p) => sdEllipsoid(sub(p, add(tip, [0, 0.005, 0.006])), [0.036, 0.034, 0.036]), FUR);
  } else {
    shape('tail', 'tail1', (p) => sdEllipsoid(sub(p, j.tail2), [0.045, 0.045, 0.04]), FUR);
  }
  return { shapes: S, joints: j };
}

const K = { core: 0.05, join: 0.035, limb: 0.03 };

/** The body's distance at p, and (optionally) each shape's own distance. */
export function makeField(body) {
  const { shapes, joints } = shapesFor(body);
  const groups = new Map();
  for (const s of shapes) {
    if (!groups.has(s.group)) groups.set(s.group, []);
    groups.get(s.group).push(s);
  }
  const order = [...groups.keys()];
  const kOf = (g) => (g === 'core' ? K.core : g === 'tail' ? 0.02 : K.limb);
  const joinOf = (g) => (g.startsWith('ear') ? 0.03 : g === 'tail' ? 0.03 : K.join);
  function f(p) {
    let d = Infinity;
    for (const g of order) {
      let gd = Infinity;
      const k = kOf(g);
      for (const s of groups.get(g)) gd = smin(gd, s.d(p), k);
      d = g === 'core' ? gd : smin(d, gd, joinOf(g));
    }
    return d;
  }
  return { f, shapes, joints };
}

// --- meshing ----------------------------------------------------------------------------------------------------------

/**
 * Mesh a body: { positions, normals, indices, skinIndex (4 per vertex), skinWeight (4), fabric (4: fur, skin, cloth, trim),
 * joints }. `cell`: the grid spacing (smaller is finer).
 */
export function meshBody(body = BODY_DEFAULT, cell = 0.016) {
  const { f, shapes, joints } = makeField(body);
  // Bounds from the joints, padded.
  let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
  for (const p of Object.values(joints)) {
    x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); z0 = Math.min(z0, p[2]);
    x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); z1 = Math.max(z1, p[2]);
  }
  const pad = 0.3;
  x0 -= pad; y0 -= 0.12; z0 -= pad; x1 += pad; y1 += pad; z1 += pad;
  const nx = Math.ceil((x1 - x0) / cell) + 1;
  const ny = Math.ceil((y1 - y0) / cell) + 1;
  const nz = Math.ceil((z1 - z0) / cell) + 1;
  const field = new Float32Array(nx * ny * nz);
  const at = (i, j, k) => i + nx * (j + ny * k);
  // A coarse pass skips the empty space: only cells near the surface get the full field.
  const coarse = 4;
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    field[at(i, j, k)] = NaN;
  }
  for (let k = 0; k < nz; k += coarse) for (let j = 0; j < ny; j += coarse) for (let i = 0; i < nx; i += coarse) {
    const d = f([x0 + i * cell, y0 + j * cell, z0 + k * cell]);
    const near = Math.abs(d) < cell * coarse * 1.9;
    for (let kk = k; kk < Math.min(nz, k + coarse); kk++) for (let jj = j; jj < Math.min(ny, j + coarse); jj++) for (let ii = i; ii < Math.min(nx, i + coarse); ii++) {
      const idx = at(ii, jj, kk);
      if (!Number.isNaN(field[idx])) continue;
      field[idx] = near ? Infinity : d;
    }
  }
  // Fill in near-surface blocks (including the far side of each coarse block's neighbours).
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const idx = at(i, j, k);
    if (field[idx] === Infinity) field[idx] = f([x0 + i * cell, y0 + j * cell, z0 + k * cell]);
  }
  // Coarse values stand for whole blocks; a block next to a near one must be exact on its shared faces.
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const idx = at(i, j, k);
    const v = field[idx];
    let fix = false;
    for (const [di, dj, dk] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
      const a = i + di, b = j + dj, c = k + dk;
      if (a < 0 || b < 0 || c < 0 || a >= nx || b >= ny || c >= nz) continue;
      if (Math.sign(field[at(a, b, c)]) !== Math.sign(v)) {
        fix = true;
        break;
      }
    }
    if (fix) field[idx] = f([x0 + i * cell, y0 + j * cell, z0 + k * cell]);
  }

  // Surface nets: a vertex in every cell the surface passes through.
  const cellVert = new Int32Array((nx - 1) * (ny - 1) * (nz - 1)).fill(-1);
  const cat = (i, j, k) => i + (nx - 1) * (j + (ny - 1) * k);
  const pos = [];
  const corners = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
  const edges = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  const vals = new Float64Array(8);
  for (let k = 0; k < nz - 1; k++) for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    let mask = 0;
    for (let c = 0; c < 8; c++) {
      const [a, b, d] = corners[c];
      vals[c] = field[at(i + a, j + b, k + d)];
      if (vals[c] < 0) mask |= 1 << c;
    }
    if (mask === 0 || mask === 255) continue;
    let sx = 0, sy = 0, sz = 0, n = 0;
    for (const [e0, e1] of edges) {
      const va = vals[e0];
      const vb = vals[e1];
      if ((va < 0) === (vb < 0)) continue;
      const t = va / (va - vb);
      const A = corners[e0];
      const B = corners[e1];
      sx += A[0] + (B[0] - A[0]) * t;
      sy += A[1] + (B[1] - A[1]) * t;
      sz += A[2] + (B[2] - A[2]) * t;
      n++;
    }
    let p = [x0 + (i + sx / n) * cell, y0 + (j + sy / n) * cell, z0 + (k + sz / n) * cell];
    // Pull it onto the surface.
    for (let it = 0; it < 3; it++) {
      const d = f(p);
      const gr = grad(f, p, cell * 0.25);
      const g2 = dot(gr, gr);
      if (g2 < 1e-9) break;
      const step = mul(gr, d / g2);
      if (len(step) > cell) break;
      p = sub(p, step);
    }
    cellVert[cat(i, j, k)] = pos.length;
    pos.push(p);
  }
  // Quads across every grid edge the surface crosses.
  const idx = [];
  const quad = (a, b, c, d, flip) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    if (flip) idx.push(a, c, b, a, d, c);
    else idx.push(a, b, c, a, c, d);
  };
  for (let k = 1; k < nz - 1; k++) for (let j = 1; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const a = field[at(i, j, k)] < 0;
    const b = field[at(i + 1, j, k)] < 0;
    if (a === b) continue;
    quad(cellVert[cat(i, j - 1, k - 1)], cellVert[cat(i, j, k - 1)], cellVert[cat(i, j, k)], cellVert[cat(i, j - 1, k)], !a);
  }
  for (let k = 1; k < nz - 1; k++) for (let j = 0; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) {
    const a = field[at(i, j, k)] < 0;
    const b = field[at(i, j + 1, k)] < 0;
    if (a === b) continue;
    quad(cellVert[cat(i - 1, j, k - 1)], cellVert[cat(i - 1, j, k)], cellVert[cat(i, j, k)], cellVert[cat(i, j, k - 1)], !a);
  }
  for (let k = 0; k < nz - 1; k++) for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) {
    const a = field[at(i, j, k)] < 0;
    const b = field[at(i, j, k + 1)] < 0;
    if (a === b) continue;
    quad(cellVert[cat(i - 1, j - 1, k)], cellVert[cat(i, j - 1, k)], cellVert[cat(i, j, k)], cellVert[cat(i - 1, j, k)], !a);
  }

  // Normals, skin and fabric for every vertex.
  const n = pos.length;
  const positions = new Float32Array(n * 3);
  const normals = new Float32Array(n * 3);
  const skinIndex = new Uint16Array(n * 4);
  const skinWeight = new Float32Array(n * 4);
  const fabric = new Float32Array(n * 4);
  const tau = 0.014;
  const byBone = new Float64Array(BONES.length);
  for (let v = 0; v < n; v++) {
    const p = pos[v];
    positions.set(p, v * 3);
    const gr = norm(grad(f, p, cell * 0.3));
    normals.set(gr, v * 3);
    // Each shape's pull on this vertex: the nearest shapes own it, blended where they melt together.
    const ds = shapes.map((s) => s.d(p));
    const dmin = Math.min(...ds);
    byBone.fill(0);
    const fab = [0, 0, 0, 0];
    let wsum = 0;
    for (let s = 0; s < shapes.length; s++) {
      const w = Math.exp(-(ds[s] - dmin) / tau);
      if (w < 1e-4) continue;
      byBone[shapes[s].bone] += w;
      const m = shapes[s].mat(p);
      for (let c = 0; c < 4; c++) fab[c] += w * m[c];
      wsum += w;
    }
    for (let c = 0; c < 4; c++) fabric[v * 4 + c] = fab[c] / wsum;
    const top = [...byBone.keys()].sort((a, b) => byBone[b] - byBone[a]).slice(0, 4);
    let tw = 0;
    for (const b of top) tw += byBone[b];
    top.forEach((b, c) => {
      skinIndex[v * 4 + c] = b;
      skinWeight[v * 4 + c] = byBone[b] / tw;
    });
  }
  return { positions, normals, indices: n > 65535 ? new Uint32Array(idx) : new Uint16Array(idx), skinIndex, skinWeight, fabric, joints, count: n };
}

function grad(f, p, h) {
  return [
    f([p[0] + h, p[1], p[2]]) - f([p[0] - h, p[1], p[2]]),
    f([p[0], p[1] + h, p[2]]) - f([p[0], p[1] - h, p[2]]),
    f([p[0], p[1], p[2] + h]) - f([p[0], p[1], p[2] - h]),
  ].map((v) => v / (2 * h));
}

// --- anchors: where the face, buttons, pocket and hats sit ------------------------------------------------------------

/** March from `from` along `dir` until the surface: { p, n } (n the outward normal), or null. */
function hitSurface(f, from, dir, maxT = 1) {
  let t = 0;
  const d0 = norm(dir);
  for (let i = 0; i < 200 && t < maxT; i++) {
    const p = add(from, mul(d0, t));
    const d = f(p);
    if (d < 0.0005) {
      const n = norm(grad(f, p, 0.002));
      return { p, n };
    }
    t += Math.max(d * 0.9, 0.0005);
  }
  return null;
}

/**
 * Points on the body for things worn or drawn on it: { name: { p, n, bone } } in the model. Eyes and mouth sit on the
 * face, buttons and the pocket on the pyjama top, `crown` on top of the head, `back` behind the head.
 */
export function anchorsFor(body = BODY_DEFAULT) {
  const P = { ...BODY_DEFAULT, ...body };
  const { f, joints } = makeField(P);
  const H = P.head;
  const hc = joints.headC;
  const out = {};
  const put = (name, from, dir, bone) => {
    const h = hitSurface(f, from, dir);
    if (h) out[name] = { p: h.p, n: h.n, bone };
  };
  const front = (x, y) => [x, y, 0.6];
  const back = [0, 0, -1];
  if (P.bear) {
    put('eyeL', front(hc[0] - 0.068 * H, hc[1] + 0.035 * H), back, 'head');
    put('eyeR', front(hc[0] + 0.068 * H, hc[1] + 0.035 * H), back, 'head');
    put('mouth', front(0, hc[1] - 0.085 * H), back, 'head');
    put('nose', front(0, hc[1] - 0.03 * H), back, 'head');
  } else {
    put('eyeL', front(hc[0] - 0.074 * H, hc[1] + 0.03 * H), back, 'head');
    put('eyeR', front(hc[0] + 0.074 * H, hc[1] + 0.03 * H), back, 'head');
    put('mouth', front(0, hc[1] - 0.095 * H * P.muzzle), back, 'jaw');
    put('nose', front(0, hc[1] - 0.04 * H), back, 'jaw');
  }
  put('browL', front(hc[0] - 0.074 * H, hc[1] + 0.098 * H), back, 'head');
  put('browR', front(hc[0] + 0.074 * H, hc[1] + 0.098 * H), back, 'head');
  put('cheekL', front(hc[0] - 0.13 * H, hc[1] - 0.04 * H), back, 'head');
  put('cheekR', front(hc[0] + 0.13 * H, hc[1] - 0.04 * H), back, 'head');
  put('crown', [hc[0], hc[1] + 0.6, hc[2]], [0, -1, 0], 'head');
  put('bump', add(hc, mul(norm([-0.55, 0.75, 0.35]), 0.6)), mul(norm([-0.55, 0.75, 0.35]), -1), 'head');
  put('pocket', front(0.058 * P.girth, 0.452), back, 'spine');
  put('button1', front(0, 0.5), back, 'chest');
  put('button2', front(0, 0.43), back, 'spine');
  put('button3', front(0, 0.36), back, 'hips');
  put('handL', add(joints.handL, [0, 0, 0.3]), back, 'handL');
  put('handR', add(joints.handR, [0, 0, 0.3]), back, 'handR');
  return out;
}
