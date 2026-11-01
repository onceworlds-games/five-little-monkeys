// Rings in the quilt. A ring is a pure function of where and when it started and how much energy it has, so every page
// draws and judges the same ring from one small message. The quilt shader uses the same formulas.
import { WAVE, clamp } from './config.js';

const TAU_PI = Math.PI;

/**
 * A ring from a slam or a pillow. `amp` is the round's ring multiplier (wild springs), `t0` when it starts, `si` the
 * mattress it rolls on. Water beds add reflections: mirror images of the centre across each side of the mattress.
 */
export function makeWave({ id, owner = '', kind = 'slam', x, z, e, t0, si = 0, amp = 1 }, bed) {
  const p = bed.phys;
  const E = clamp(Number(e) || WAVE.minE, WAVE.minE, WAVE.maxE);
  const m = clamp(Number(amp) || 1, 1, 1.4);
  const w = {
    id: String(id), owner: String(owner), kind, x, z, e: E, t0, si, m,
    c: WAVE.speed(E) * p.waveSpeed,
    R: WAVE.reach(E) * p.waveReach,
    A: WAVE.amp(E) * p.waveAmp * m,
    push: (1 + 0.75 * (m - 1)) * p.push,
    src: [[x, z, 1]],
  };
  const s = bed.surfaces[si];
  if (p.reflect > 0 && s) {
    const f = p.reflect;
    w.src.push([2 * s.x0 - x, z, f], [2 * s.x1 - x, z, f], [x, 2 * s.z0 - z, f], [x, 2 * s.z1 - z, f]);
  }
  w.life = (w.R + WAVE.half) / w.c + 0.05;
  return w;
}

/** A ring's crest height at distance `d` from its centre (0 past its reach). */
export function ampAt(w, d) {
  if (d >= w.R) return 0;
  const fade = Math.pow(1 - d / w.R, 0.8);
  const rise = d >= WAVE.rise ? 1 : (d / WAVE.rise) * (d / WAVE.rise) * (3 - 2 * (d / WAVE.rise));
  return w.A * fade * rise;
}

/** The raised-cosine band of the crest: 1 at the crest's line, 0 at `half` from it. */
export function band(x) {
  const ax = Math.abs(x);
  if (ax >= WAVE.half) return 0;
  return 0.5 * (1 + Math.cos((TAU_PI * ax) / WAVE.half));
}

export const alive = (w, t) => t - w.t0 <= w.life;

/** The quilt's height from rings at (x, z) on surface `si`, time `t`. */
export function fieldAt(waves, si, x, z, t) {
  let h = 0;
  for (const w of waves) {
    if (w.si !== si) continue;
    const tau = t - w.t0;
    if (tau < 0 || tau > w.life) continue;
    const r = w.c * tau;
    for (const [sx, sz, f] of w.src) {
      const d = Math.hypot(x - sx, z - sz);
      const b = band(d - r);
      if (b > 0) h += ampAt(w, d) * f * b;
    }
  }
  return h;
}

/**
 * The crests passing under a point now that haven't hit `hits` yet: `k` their peak heights summed (crossing rings add),
 * `field` the quilt's height they make here now, the push direction (away from the centres, by weight), the keys to mark
 * as hit, and the owner of the biggest one.
 */
export function crestsAt(waves, si, x, z, t, hits, seedDir = 0, self = '') {
  let k = 0, field = 0, dx = 0, dz = 0, top = 0, owner = '', wave = null, kind = '';
  let keys = null;
  for (const w of waves) {
    if (w.si !== si || (self && w.owner === self)) continue;
    const tau = t - w.t0;
    if (tau < 0 || tau > w.life) continue;
    const r = w.c * tau;
    for (let j = 0; j < w.src.length; j++) {
      const [sx, sz, f] = w.src[j];
      const d = Math.hypot(x - sx, z - sz);
      const off = d - r;
      if (off <= -WAVE.half || off >= WAVE.half) continue;
      const key = j === 0 ? w.id : `${w.id}/${j}`;
      if (hits && hits.has(key)) continue;
      const a = ampAt(w, d) * f;
      if (a <= 0) continue;
      k += a;
      field += a * band(off);
      let ux, uz;
      if (d > 0.05) {
        ux = (x - sx) / d;
        uz = (z - sz) / d;
      } else {
        const ang = ((seedDir + j * 97) % 360) * (Math.PI / 180);
        ux = Math.cos(ang);
        uz = Math.sin(ang);
      }
      dx += ux * a * w.push;
      dz += uz * a * w.push;
      if (a > top) {
        top = a;
        owner = w.owner;
        wave = w;
        kind = w.kind;
      }
      (keys ??= []).push(key);
    }
  }
  if (k <= 0) return null;
  const len = Math.hypot(dx, dz) || 1;
  const push = Math.hypot(dx, dz) / k;
  return { k, field, dx: dx / len, dz: dz / len, push, keys, owner, wave, kind };
}

/** Drop rings that have finished. */
export function prune(waves, t) {
  for (let i = waves.length - 1; i >= 0; i--) if (!alive(waves[i], t)) waves.splice(i, 1);
}
