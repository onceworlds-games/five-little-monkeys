// The plush's skeleton and its acting: every pose and move as an AnimationClip on the bones, and an animator that blends
// them with AnimationMixer (weights eased toward targets, so poses crossfade instead of popping), plus the layers that
// ride on top: lean into the steer, a head that looks at things, a springy tail and floppy ears.
import * as THREE from 'three';
import { BONES } from './plush.js';

const D = Math.PI / 180;

/** Build the bones for a set of joints (rest pose: identity rotations). Returns { root, bones, byName, skeleton }. */
export function createSkeleton(joints) {
  const byName = {};
  const bones = BONES.map(([name, parent]) => {
    const b = new THREE.Bone();
    b.name = name;
    byName[name] = b;
    return b;
  });
  BONES.forEach(([name, parent]) => {
    const b = byName[name];
    const p = joints[name];
    if (parent) {
      const q = joints[parent];
      b.position.set(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
      byName[parent].add(b);
    } else b.position.set(p[0], p[1], p[2]);
  });
  const root = byName.root;
  root.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(bones);
  return { root, bones, byName, skeleton };
}

// --- poses ------------------------------------------------------------------------------------------------------------
// A pose is { bone: [x, y, z] degrees (Euler XYZ, in the parent's frame) } plus `hipsY` (an offset). Limb helpers mirror
// left and right: arm(raise, fwd, bend), leg(lift, spread, knee, foot). L is the monkey's -x side.

function arm(o, side, raise = 0, fwd = 0, bend = 0, twist = 0) {
  const k = side === 'L' ? -1 : 1;
  o[`arm${side}`] = [-fwd, twist * k, raise * k];
  o[`fore${side}`] = [-bend, 0, 0];
  return o;
}
function arms(o, raise, fwd, bend, twist) {
  arm(o, 'L', raise, fwd, bend, twist);
  arm(o, 'R', raise, fwd, bend, twist);
  return o;
}
function leg(o, side, lift = 0, spread = 0, knee = 0, foot = 0) {
  const k = side === 'L' ? -1 : 1;
  o[`thigh${side}`] = [-lift, 0, spread * k];
  o[`shin${side}`] = [knee, 0, 0];
  o[`foot${side}`] = [foot, 0, 0];
  return o;
}
function legs(o, lift, spread, knee, foot) {
  leg(o, 'L', lift, spread, knee, foot);
  leg(o, 'R', lift, spread, knee, foot);
  return o;
}
const P = (fn) => fn({});

export const POSES = {
  stand: P((o) => { arms(o, -32, 6, 18); legs(o, 0, 2, 4, 0); o.spine = [2, 0, 0]; return o; }),
  crouch: P((o) => { arms(o, -12, -28, 28); legs(o, 48, 8, 86, -36); o.spine = [16, 0, 0]; o.chest = [6, 0, 0]; o.head = [-18, 0, 0]; o.hipsY = -0.075; return o; }),
  pump: P((o) => { arms(o, -38, -55, 34); legs(o, 66, 10, 118, -48); o.spine = [24, 0, 0]; o.chest = [8, 0, 0]; o.head = [-24, 0, 0]; o.hipsY = -0.11; return o; }),
  rise: P((o) => { arms(o, 108, 14, 8); legs(o, -6, 3, 6, 38); o.spine = [-6, 0, 0]; o.head = [-14, 0, 0]; o.hipsY = 0.015; return o; }),
  apex: P((o) => { arms(o, 70, 12, 22); legs(o, 22, 20, 30, 12); o.head = [-6, 0, 0]; return o; }),
  star: P((o) => { arms(o, 96, 0, 2); legs(o, 6, 36, 4, 26); o.spine = [-8, 0, 0]; o.head = [-16, 0, 0]; return o; }),
  fall: P((o) => { arms(o, 92, 2, 32); legs(o, 26, 9, 34, -12); o.spine = [4, 0, 0]; o.head = [8, 0, 0]; return o; }),
  tuck: P((o) => { arms(o, -18, 72, 100); legs(o, 118, 12, 142, 22); o.spine = [30, 0, 0]; o.chest = [14, 0, 0]; o.head = [24, 0, 0]; o.hipsY = 0.06; return o; }),
  sit: P((o) => { arms(o, -24, 28, 24); legs(o, 84, 18, 12, -12); o.spine = [-8, 0, 0]; o.head = [-4, 0, 0]; o.hipsY = -0.19; return o; }),
  guilty: P((o) => {
    arms(o, -38, -42, 72); legs(o, 0, -3, 10, 0); o.footL = [0, 22, 0]; o.chest = [-5, 0, 0]; o.head = [6, 0, 9]; o.hipsY = -0.01; return o;
  }),
  hug: P((o) => { arms(o, -6, 76, 74); legs(o, 4, 4, 8, 0); o.spine = [6, 0, 0]; o.head = [8, 0, 12]; return o; }),
  pray: P((o) => { arms(o, -16, 62, 122); legs(o, 6, 2, 10, 0); o.head = [6, 0, 24]; return o; }),
  float: P((o) => { arms(o, 60, 8, 40); legs(o, 62, -16, 104, -10); o.spine = [-4, 0, 0]; o.head = [-8, 0, 0]; return o; }),
};

/** A pose blended toward another by `k` (for keyframes in between). */
function mixPose(a, b, k) {
  const out = {};
  for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (key === 'hipsY') out.hipsY = (a.hipsY ?? 0) * (1 - k) + (b.hipsY ?? 0) * k;
    else {
      const x = a[key] ?? [0, 0, 0];
      const y = b[key] ?? [0, 0, 0];
      out[key] = [0, 1, 2].map((i) => x[i] * (1 - k) + y[i] * k);
    }
  }
  return out;
}
const edit = (pose, fn) => {
  const o = JSON.parse(JSON.stringify(pose));
  fn(o);
  return o;
};

/** Looping moves: [seconds, [pose at each key, evenly spaced; the first repeats at the end]]. */
export const LOOPS = {
  flail: [0.46, [
    P((o) => { arm(o, 'L', 128, 40, 30); arm(o, 'R', 34, -40, 60); leg(o, 'L', 56, 14, 70, -10); leg(o, 'R', -12, 18, 20, 30); o.spine = [-8, 16, 0]; o.head = [-18, 0, 10]; return o; }),
    P((o) => { arm(o, 'L', 34, -40, 60); arm(o, 'R', 128, 40, 30); leg(o, 'L', -12, 18, 20, 30); leg(o, 'R', 56, 14, 70, -10); o.spine = [-8, -16, 0]; o.head = [-18, 0, -10]; return o; }),
  ]],
  teeter: [0.62, [
    P((o) => { arm(o, 'L', 110, 70, 10); arm(o, 'R', 110, -70, 10); leg(o, 'L', 0, 6, 6, 0); leg(o, 'R', 46, 20, 60, -10); o.spine = [-16, 0, 6]; o.head = [-12, 0, 0]; return o; }),
    P((o) => { arm(o, 'L', 150, 0, 10); arm(o, 'R', 150, 0, 10); leg(o, 'L', 0, 6, 6, 0); leg(o, 'R', 40, 22, 50, -10); o.spine = [-22, 0, -4]; o.head = [-16, 0, 0]; return o; }),
    P((o) => { arm(o, 'L', 110, -70, 10); arm(o, 'R', 110, 70, 10); leg(o, 'L', 0, 6, 6, 0); leg(o, 'R', 46, 20, 60, -10); o.spine = [-16, 0, 6]; o.head = [-12, 0, 0]; return o; }),
    P((o) => { arm(o, 'L', 60, 0, 30); arm(o, 'R', 60, 0, 30); leg(o, 'L', 0, 6, 6, 0); leg(o, 'R', 52, 18, 70, -10); o.spine = [-10, 0, 8]; o.head = [-8, 0, 0]; return o; }),
  ]],
  scream: [0.3, [
    P((o) => { arm(o, 'L', 150, 18, 10); arm(o, 'R', 150, -18, 10); leg(o, 'L', 62, 8, 96, -10); leg(o, 'R', -14, 8, 30, 20); o.head = [-26, 0, 0]; o.spine = [-6, 0, 0]; return o; }),
    P((o) => { arm(o, 'L', 150, -18, 10); arm(o, 'R', 150, 18, 10); leg(o, 'L', -14, 8, 30, 20); leg(o, 'R', 62, 8, 96, -10); o.head = [-26, 0, 0]; o.spine = [-6, 0, 0]; return o; }),
  ]],
  cheer: [0.52, [
    P((o) => { arm(o, 'L', 152, 6, 12); arm(o, 'R', 118, 10, 52); legs(o, 6, 8, 10, 10); o.head = [-16, 0, 6]; o.spine = [-5, 0, 0]; return o; }),
    P((o) => { arm(o, 'L', 118, 10, 52); arm(o, 'R', 152, 6, 12); legs(o, 10, 8, 18, 4); o.head = [-16, 0, -6]; o.spine = [-5, 0, 0]; return o; }),
  ]],
  wave: [0.56, [
    P((o) => { arm(o, 'L', -30, 6, 18); arm(o, 'R', 140, 10, 32); o.foreR = [-32, 0, -22]; legs(o, 0, 3, 4, 0); o.head = [-6, 0, -8]; return o; }),
    P((o) => { arm(o, 'L', -30, 6, 18); arm(o, 'R', 140, 10, 32); o.foreR = [-32, 0, 26]; legs(o, 0, 3, 4, 0); o.head = [-6, 0, -8]; return o; }),
  ]],
  thump: [0.5, [
    P((o) => { arm(o, 'L', -6, 62, 122); arm(o, 'R', 40, -10, 30); legs(o, 4, 12, 10, 0); o.chest = [-10, 0, 0]; o.head = [-22, 0, 6]; return o; }),
    P((o) => { arm(o, 'L', 40, -10, 30); arm(o, 'R', -6, 62, 122); legs(o, 4, 12, 10, 0); o.chest = [-10, 0, 0]; o.head = [-22, 0, -6]; return o; }),
  ]],
  swim: [0.5, [
    P((o) => { arm(o, 'L', 120, 40, 20); arm(o, 'R', 120, -30, 20); leg(o, 'L', -20, 10, 30, 30); leg(o, 'R', 14, 10, 50, 20); o.head = [-40, 0, 0]; return o; }),
    P((o) => { arm(o, 'L', 120, -30, 20); arm(o, 'R', 120, 40, 20); leg(o, 'L', 14, 10, 50, 20); leg(o, 'R', -20, 10, 30, 30); o.head = [-40, 0, 0]; return o; }),
  ]],
  worm: [0.7, [
    P((o) => { arms(o, -10, 40, 60); legs(o, -10, 4, 10, 30); o.spine = [-24, 0, 0]; o.chest = [22, 0, 0]; o.head = [-30, 0, 0]; o.hipsY = 0.03; return o; }),
    P((o) => { arms(o, -10, 30, 40); legs(o, 20, 4, 40, 10); o.spine = [20, 0, 0]; o.chest = [-24, 0, 0]; o.head = [-10, 0, 0]; o.hipsY = -0.03; return o; }),
  ]],
  sway: [1.4, [edit(POSES.hug, (o) => { o.spine = [6, 0, 10]; o.head = [8, 0, 20]; }), edit(POSES.hug, (o) => { o.spine = [6, 0, -10]; o.head = [8, 0, -4]; })]],
  rock: [1.8, [edit(POSES.pray, (o) => { o.spine = [0, 0, 8]; }), edit(POSES.pray, (o) => { o.spine = [0, 0, -8]; })]],
  dizzy: [1.6, [
    edit(POSES.sit, (o) => { o.spine = [-8, 0, 10]; o.head = [-4, 14, 12]; }),
    edit(POSES.sit, (o) => { o.spine = [-14, 0, 0]; o.head = [-12, 0, 0]; }),
    edit(POSES.sit, (o) => { o.spine = [-8, 0, -10]; o.head = [-4, -14, -12]; }),
    edit(POSES.sit, (o) => { o.spine = [0, 0, 0]; o.head = [6, 0, 0]; }),
  ]],
  throw: [0.55, [
    POSES.sit,
    edit(POSES.sit, (o) => { arm(o, 'R', 150, -60, 40); o.spine = [-16, -18, 0]; }),
    edit(POSES.sit, (o) => { arm(o, 'R', 110, 80, 10); o.spine = [10, 20, 0]; }),
  ]],
  hop: [0.42, [POSES.crouch, POSES.rise, POSES.apex, POSES.fall]],
  breathe: [2.2, [POSES.stand, edit(POSES.stand, (o) => { o.chest = [-3, 0, 0]; o.head = [-3, 0, 3]; arms(o, -28, 6, 20); })]],
};

const BONE_NAMES = BONES.map(([n]) => n);

/** A clip from keyed poses spread over `secs` (looping when `loop`). */
export function clipFrom(name, secs, keys, loop = true, restHipsY = 0.3) {
  const n = keys.length;
  const times = [];
  const seq = loop ? [...keys, keys[0]] : keys;
  for (let i = 0; i < seq.length; i++) times.push(seq.length === 1 ? 0 : (i / (seq.length - 1)) * secs);
  const tracks = [];
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  // Every bone gets a track (rest where a pose doesn't say), so the mixer sets every bone every frame and the layers on
  // top (lean, look, springs) never pile up.
  for (const bone of BONE_NAMES) {
    if (bone === 'root') continue;
    const values = [];
    for (const p of seq) {
      const r = p[bone] ?? [0, 0, 0];
      q.setFromEuler(e.set(r[0] * D, r[1] * D, r[2] * D, 'XYZ'));
      values.push(q.x, q.y, q.z, q.w);
    }
    tracks.push(new THREE.QuaternionKeyframeTrack(`${bone}.quaternion`, times, values));
  }
  tracks.push(new THREE.VectorKeyframeTrack('hips.position', times, seq.flatMap((p) => [0, restHipsY + (p.hipsY ?? 0), 0])));
  void n;
  return new THREE.AnimationClip(name, seq.length === 1 ? 1 : secs, tracks);
}

/** Every clip, by name: one-pose clips for the static poses, looping ones for the moves. */
export function buildClips(restHipsY) {
  const clips = {};
  for (const [name, pose] of Object.entries(POSES)) clips[name] = clipFrom(name, 1, [pose, pose], false, restHipsY);
  for (const [name, [secs, keys]] of Object.entries(LOOPS)) clips[name] = clipFrom(name, secs, keys, true, restHipsY);
  return clips;
}

/**
 * The animator: every clip plays all the time on a mixer and `set(name, weight)` says how much of each to show. Weights
 * ease toward their targets (fast for the bounce, slower for moods), and are normalized so the pose never sags to rest.
 */
export function createAnimator(rootObject, skel, restHipsY) {
  const mixer = new THREE.AnimationMixer(rootObject);
  const clips = buildClips(restHipsY);
  const actions = {};
  const w = {};
  const target = {};
  const speed = {};
  for (const [name, clip] of Object.entries(clips)) {
    const a = mixer.clipAction(clip);
    a.setEffectiveWeight(0);
    a.play();
    actions[name] = a;
    w[name] = 0;
    target[name] = 0;
    speed[name] = 14;
  }
  w.stand = target.stand = 1;
  return {
    mixer, actions, clips,
    /** Aim every weight at zero (call first each frame, then `want` the ones that matter). */
    clear() {
      for (const k in target) target[k] = 0;
    },
    want(name, weight = 1, rate = 14) {
      if (!(name in target)) return;
      target[name] += weight;
      speed[name] = rate;
    },
    /** Restart a move from its start (a throw, a hop). */
    restart(name) {
      actions[name]?.reset().play();
    },
    timeScale(name, k) {
      if (actions[name]) actions[name].timeScale = k;
    },
    update(dt) {
      let total = 0;
      for (const k in w) {
        const r = speed[k];
        w[k] += (target[k] - w[k]) * (1 - Math.exp(-dt * r));
        if (w[k] < 1e-3) w[k] = 0;
        total += w[k];
      }
      for (const k in w) actions[k].setEffectiveWeight(total > 0 ? w[k] / total : k === 'stand' ? 1 : 0);
      mixer.update(dt);
    },
    weight: (name) => w[name] ?? 0,
  };
}

/** A damped spring (one number). */
export class Spring {
  constructor(k = 120, damp = 12) {
    this.x = 0;
    this.v = 0;
    this.k = k;
    this.d = damp;
  }
  step(target, dt) {
    const steps = Math.max(1, Math.ceil(dt / (1 / 120)));
    const h = dt / steps;
    for (let i = 0; i < steps; i++) {
      const a = -this.k * (this.x - target) - this.d * this.v;
      this.v += a * h;
      this.x += this.v * h;
    }
    return this.x;
  }
  kick(v) {
    this.v += v;
  }
}
