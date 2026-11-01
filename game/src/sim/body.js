// One monkey: its bounce, steering, slam, launches and falls. The same code runs the player's own monkey, the bots, the
// predicted copies of other players' monkeys (authority off: they bounce and steer but only their own page launches them),
// and the simulations in the tests.
import { G, APEX, CONTACT, MONKEY_H, BODY_R, STEER, TUMBLE, RIM, WALL_REST, SLAM, LAUNCH, PILLOW, clamp } from './config.js';
import { surfaceUnder, edgeDistance, lowZoneAt, clampToBed, inside } from './beds.js';
import { crestsAt } from './waves.js';
import { FALL_MARGIN } from './config.js';

export const v0For = (apex) => Math.sqrt(2 * G * Math.max(0.01, apex));
export const airTime = (apex) => (2 * v0For(apex)) / G;
export const periodFor = (apex) => airTime(apex) + CONTACT;

/** Seconds a dive takes to drop `h`. */
export function diveTime(h) {
  const a = G * SLAM.diveG;
  const v = SLAM.dive;
  return (-v + Math.sqrt(v * v + 2 * a * Math.max(0, h))) / a;
}

/** The water bed's slow swell: a factor on the bounce at (x, z), time t. */
export function swellAt(bed, x, z, t) {
  const s = bed.phys.swell;
  if (!s) return 1;
  return 1 + s * Math.sin(0.8 * t + 0.55 * x) * Math.cos(0.6 * t + 0.45 * z);
}

/** A monkey on surface `si` at (x, z), `phase` (0-1) of the way through its first bounce. */
export function createBody(id, bed, x, z, si = 0, phase = 0, t = 0) {
  const s = bed.surfaces[si] ?? bed.surfaces[0];
  const b = {
    id, x, z, y: s.top, vx: 0, vz: 0, vy: 0, mode: 'contact', si: s.i, lastTop: s.top, tc: CONTACT,
    apexNext: APEX.base, cool: 0, tumble: 0, dive: null, low: false, hits: new Map(),
    lastBy: '', lastAt: -99, lastWave: '', lastKind: '', launches: 0, rim: false, out: false, outAt: 0,
    aimX: s.cx, aimZ: s.cz, nextPillow: 0, slams: 0, saving: false, teeter: 0, landedAt: t, ix: 0, iz: 0,
  };
  const period = periodFor(APEX.base);
  let into = clamp(phase, 0, 0.999) * period;
  if (into < CONTACT) b.tc = CONTACT - into;
  else {
    into -= CONTACT;
    const v0 = v0For(APEX.base);
    b.mode = 'air';
    b.vy = v0 - G * into;
    b.y = s.top + v0 * into - 0.5 * G * into * into;
  }
  return b;
}

/** Copy a body (for predictions). */
export function cloneBody(b) {
  return { ...b, hits: new Map(b.hits), dive: b.dive ? { ...b.dive } : null };
}

/** The feet's height above the surface under the monkey (Infinity over nothing). */
export function feetAbove(bed, b) {
  const s = bed.surfaces[b.si];
  return s ? b.y - s.top : Infinity;
}

/** Can this monkey slam now? */
export function canSlam(bed, b, t) {
  if (b.out || b.dive) return false;
  if (b.mode !== 'air' && b.mode !== 'launched') return false;
  if (b.mode === 'launched' && b.tumble > 0) return false;
  if (t < b.cool) return false;
  const top = b.si >= 0 ? bed.surfaces[b.si].top : b.lastTop;
  return b.y - top >= SLAM.min;
}

/** Where and when a slam pressed now lands, and its energy (si -1: the floor, no ring). */
export function planSlam(bed, b, t) {
  const vx = b.vx * SLAM.side;
  const vz = b.vz * SLAM.side;
  const tops = bed.surfaces.filter((s) => s.top < b.y - 0.01).sort((a, c) => c.top - a.top);
  for (const s of tops) {
    const drop = b.y - s.top;
    const T = SLAM.windup + diveTime(drop);
    const ix = b.x + vx * T;
    const iz = b.z + vz * T;
    if (inside(s, ix, iz, FALL_MARGIN)) {
      return { si: s.i, x: ix, z: iz, vx, vz, at: t + T, e: drop / APEX.base, drop, y0: b.y, t0: t, top: s.top };
    }
  }
  const drop = b.y - bed.floor;
  const T = SLAM.windup + diveTime(drop);
  return { si: -1, x: b.x + vx * T, z: b.z + vz * T, vx, vz, at: t + T, e: 0, drop, y0: b.y, t0: t, top: bed.floor };
}

/** Start a dive from a plan (the page's own slam, or a remote one from its message). */
export function startDive(b, plan) {
  b.saving = b.mode === 'launched';
  b.mode = 'dive';
  b.dive = { ...plan, x0: b.x, z0: b.z };
  b.vx = plan.vx;
  b.vz = plan.vz;
  b.vy = 0;
}

function control(bed, b, ix, iz, dt) {
  const len = Math.hypot(ix, iz);
  if (len > 1) {
    ix /= len;
    iz /= len;
  }
  if (b.mode === 'launched') {
    b.vx += ix * TUMBLE.accel * dt;
    b.vz += iz * TUMBLE.accel * dt;
    const k = Math.max(0, 1 - TUMBLE.drag * dt);
    b.vx *= k;
    b.vz *= k;
    return;
  }
  const tx = ix * STEER.max;
  const tz = iz * STEER.max;
  let dx = tx - b.vx;
  let dz = tz - b.vz;
  const rate = (len > 0.05 ? bed.phys.steerAccel : bed.phys.decel) * dt;
  const dl = Math.hypot(dx, dz);
  if (dl > rate) {
    dx *= rate / dl;
    dz *= rate / dl;
  }
  b.vx += dx;
  b.vz += dz;
}

function collide(bed, b, events) {
  // Walls (headboards).
  for (const w of bed.walls) {
    if (b.y >= w.y1 || b.y + MONKEY_H <= w.y0) continue;
    if (b.x < w.x0 - BODY_R || b.x > w.x1 + BODY_R || b.z < w.z0 - BODY_R || b.z > w.z1 + BODY_R) continue;
    pushOutBox(b, w.x0, w.x1, w.z0, w.z1, WALL_REST, events, 'wall');
  }
  // The sides of mattresses higher than the feet (the top bunk, seen from the lower one; a mattress you fell past).
  for (const s of bed.surfaces) {
    if (s.top <= b.y + 0.02) continue;
    if (b.x < s.x0 - BODY_R || b.x > s.x1 + BODY_R || b.z < s.z0 - BODY_R || b.z > s.z1 + BODY_R) continue;
    pushOutBox(b, s.x0, s.x1, s.z0, s.z1, WALL_REST, events, 'side');
  }
  // Posts kick you back.
  for (const p of bed.posts) {
    if (b.y >= p.top) continue;
    const dx = b.x - p.x;
    const dz = b.z - p.z;
    const d = Math.hypot(dx, dz);
    const min = p.r + BODY_R;
    if (d >= min) continue;
    const ux = d > 1e-4 ? dx / d : 1;
    const uz = d > 1e-4 ? dz / d : 0;
    b.x = p.x + ux * min;
    b.z = p.z + uz * min;
    const vn = b.vx * ux + b.vz * uz;
    if (vn < 0) {
      const out = Math.max(2, -vn * 1.2);
      b.vx += ux * (out - vn);
      b.vz += uz * (out - vn);
      events?.push({ type: 'post', id: b.id, x: b.x, z: b.z });
    }
  }
  // The canopy.
  if (bed.ceiling !== null && b.vy > 0) {
    const ceil = bed.surfaces[0].top + bed.ceiling;
    if (b.y + MONKEY_H > ceil) {
      b.y = ceil - MONKEY_H;
      b.vy = -b.vy * 0.3;
      events?.push({ type: 'bonk', id: b.id, x: b.x, z: b.z });
    }
  }
  // The room.
  const bx = bed.box;
  b.x = clamp(b.x, bx.x0 - 3, bx.x1 + 3);
  b.z = clamp(b.z, bx.z0 - 3, bx.z1 + 3);
}

function pushOutBox(b, x0, x1, z0, z1, rest, events, type) {
  const pl = b.x - (x0 - BODY_R);
  const pr = x1 + BODY_R - b.x;
  const pb = b.z - (z0 - BODY_R);
  const pf = z1 + BODY_R - b.z;
  const m = Math.min(pl, pr, pb, pf);
  if (m === pl) {
    b.x = x0 - BODY_R;
    if (b.vx > 0) b.vx = -b.vx * rest;
  } else if (m === pr) {
    b.x = x1 + BODY_R;
    if (b.vx < 0) b.vx = -b.vx * rest;
  } else if (m === pb) {
    b.z = z0 - BODY_R;
    if (b.vz > 0) b.vz = -b.vz * rest;
  } else {
    b.z = z1 + BODY_R;
    if (b.vz < 0) b.vz = -b.vz * rest;
  }
  events?.push({ type, id: b.id, x: b.x, z: b.z });
}

function rebound(bed, b, level, t) {
  let apex;
  if (b.low) {
    apex = SLAM.rebound;
    b.low = false;
  } else {
    apex = level.apex * (b.rim ? RIM.apex : 1) * swellAt(bed, b.x, b.z, t) * lowZoneAt(bed, b.x, b.z);
  }
  b.apexNext = apex;
  b.mode = 'air';
  b.vy = v0For(apex);
}

function land(bed, b, si, t, events) {
  const s = bed.surfaces[si];
  const wasLaunched = b.mode === 'launched';
  const fromFall = b.mode === 'falling';
  b.y = s.top;
  b.vy = 0;
  b.si = si;
  b.lastTop = s.top;
  b.mode = 'contact';
  b.tc = CONTACT;
  b.tumble = 0;
  b.rim = edgeDistance(bed, si, b.x, b.z) < RIM.width;
  b.landedAt = t;
  if (b.rim) b.teeter = 0.6;
  events?.push({ type: 'land', id: b.id, x: b.x, z: b.z, si, rim: b.rim, launched: wasLaunched, fell: fromFall });
}

function goOut(bed, b, t, events, authority) {
  b.y = bed.floor;
  b.vy = 0;
  b.vx = 0;
  b.vz = 0;
  b.dive = null;
  if (!authority) {
    b.mode = 'falling';
    return;
  }
  b.mode = 'out';
  b.out = true;
  b.outAt = t;
  b.si = -1;
  b.nextPillow = t + PILLOW.first;
  const [ax, az] = clampToBed(bed, (bed.box.x0 + bed.box.x1) / 2, (bed.box.z0 + bed.box.z1) / 2);
  b.aimX = ax;
  b.aimZ = az;
  events?.push({ type: 'fall', id: b.id, x: b.x, z: b.z, t, by: t - b.lastAt <= 3 ? b.lastBy : '', kind: b.lastKind, wave: b.lastWave });
}

function tryLaunch(bed, b, waves, t, events) {
  if (b.si < 0) return;
  const s = bed.surfaces[b.si];
  const feet = b.mode === 'contact' ? 0 : b.y - s.top;
  if (feet < -0.01) return;
  const seed = (b.id.length * 53 + Math.floor(t * 10)) % 360;
  const cr = crestsAt(waves, b.si, b.x, b.z, t, b.hits, seed, b.id);
  if (!cr) return;
  if (feet > cr.field + 1e-4) return;
  for (const key of cr.keys) b.hits.set(key, t + 3);
  const q = 1 - clamp(feet / cr.k, 0, 1);
  const st = Math.min(LAUNCH.maxS, cr.k * (0.55 + 0.45 * q));
  const apex = Math.min(LAUNCH.apexMax, LAUNCH.apex0 + LAUNCH.apexK * st);
  const push = LAUNCH.push * st * cr.push;
  b.vx = cr.dx * push + b.vx * LAUNCH.keep;
  b.vz = cr.dz * push + b.vz * LAUNCH.keep;
  b.vy = v0For(apex);
  if (b.mode === 'contact') b.y = s.top + 0.001;
  b.mode = 'launched';
  b.tumble = TUMBLE.noSlam;
  b.low = false;
  b.lastBy = cr.owner;
  b.lastAt = t;
  b.lastWave = cr.wave?.id ?? '';
  b.lastKind = cr.kind;
  b.launches++;
  events?.push({ type: 'launch', id: b.id, by: cr.owner, s: st, x: b.x, z: b.z, kind: cr.kind, wave: b.lastWave });
}

/**
 * Advance one monkey by `dt` from time `t`. `input`: { x, z } steering (-1..1) and `slam` (pressed this step).
 * ctx: { bed, waves, level, slamsOn, authority, events }. Events: slam, impact, saved, land, launch, fall, wall, side,
 * post, bonk, overEdge, pillow.
 */
export function stepBody(b, input, ctx, t, dt) {
  const { bed, waves, level, events } = ctx;
  const authority = ctx.authority !== false;
  // Steering is a unit vector at most (a brain's or a page's), and never NaN.
  let ix = Number.isFinite(input?.x) ? input.x : 0;
  let iz = Number.isFinite(input?.z) ? input.z : 0;
  const il = Math.hypot(ix, iz);
  if (il > 1) {
    ix /= il;
    iz /= il;
  }
  b.ix = ix;
  b.iz = iz;
  for (const [key, until] of b.hits) if (until < t) b.hits.delete(key);
  if (b.teeter > 0) b.teeter = Math.max(0, b.teeter - dt);

  if (b.mode === 'out') {
    if (!authority) return;
    const len = Math.hypot(ix, iz);
    const k = len > 1 ? 1 / len : 1;
    const [ax, az] = clampToBed(bed, b.aimX + ix * k * PILLOW.aim * dt, b.aimZ + iz * k * PILLOW.aim * dt);
    b.aimX = ax;
    b.aimZ = az;
    if (input?.slam && ctx.slamsOn && t >= b.nextPillow) {
      const [, , si] = clampToBed(bed, ax, az);
      b.nextPillow = t + PILLOW.every;
      events?.push({ type: 'pillow', id: b.id, fx: b.x, fz: b.z, x: ax, z: az, si, at: t + PILLOW.flight });
    }
    return;
  }

  // Slam (the page's own monkey and bots).
  if (authority && input?.slam && ctx.slamsOn && canSlam(bed, b, t)) {
    const plan = planSlam(bed, b, t);
    startDive(b, plan);
    b.slams++;
    events?.push({ type: 'slam', id: b.id, plan, saving: b.saving });
  }

  const t1 = t + dt;
  if (b.mode === 'dive' && b.dive) {
    const d = b.dive;
    const since = t1 - d.t0;
    b.x = d.x0 + d.vx * since;
    b.z = d.z0 + d.vz * since;
    if (since <= SLAM.windup) {
      b.y = d.y0;
    } else {
      const td = since - SLAM.windup;
      b.y = d.y0 - SLAM.dive * td - 0.5 * G * SLAM.diveG * td * td;
      b.vy = -(SLAM.dive + G * SLAM.diveG * td);
    }
    if (t1 >= d.at) {
      b.x = d.x;
      b.z = d.z;
      b.dive = null;
      if (d.si >= 0) {
        land(bed, b, d.si, t1, null);
        b.low = true;
        b.cool = d.at + SLAM.cooldown;
        events?.push({ type: 'impact', id: b.id, x: d.x, z: d.z, si: d.si, e: d.e, at: d.at });
        if (b.saving) events?.push({ type: 'saved', id: b.id, x: d.x, z: d.z });
        b.saving = false;
      } else {
        b.mode = 'falling';
        goOut(bed, b, t1, events, authority);
      }
    }
    return;
  }

  if (b.mode === 'contact') {
    control(bed, b, ix, iz, dt);
    b.x += b.vx * dt;
    b.z += b.vz * dt;
    b.tc -= dt;
    const si = surfaceUnder(bed, b.x, b.z, b.y + 0.01);
    if (si !== b.si) {
      // Slid off the edge while in the mattress (the satin bed): fall.
      b.mode = 'air';
      b.vy = 0;
    } else if (b.tc <= 0) {
      rebound(bed, b, ctx.level, t1);
    }
    collide(bed, b, events);
    if (authority && b.mode === 'contact' && waves) tryLaunch(bed, b, waves, t1, events);
    return;
  }

  // In the air: bouncing, tumbling after a launch, or falling past an edge.
  if (b.mode !== 'falling') control(bed, b, ix, iz, dt);
  if (b.mode === 'launched' && b.tumble > 0) b.tumble = Math.max(0, b.tumble - dt);
  const yPrev = b.y;
  b.vy -= G * dt;
  b.y += b.vy * dt;
  b.x += b.vx * dt;
  b.z += b.vz * dt;

  if (b.vy <= 0) {
    const si = surfaceUnder(bed, b.x, b.z, yPrev);
    if (si >= 0 && b.y <= bed.surfaces[si].top) {
      land(bed, b, si, t1, events);
      collide(bed, b, events);
      return;
    }
  }
  const under = surfaceUnder(bed, b.x, b.z, b.y);
  b.si = under;
  if (under < 0 && b.y < b.lastTop && b.mode !== 'falling') {
    b.mode = 'falling';
    events?.push({ type: 'overEdge', id: b.id, x: b.x, z: b.z, by: t1 - b.lastAt <= 3 ? b.lastBy : '' });
  }
  collide(bed, b, events);
  if (b.y <= bed.floor) {
    goOut(bed, b, t1, events, authority);
    return;
  }
  if (authority && waves && (b.mode === 'air' || b.mode === 'launched')) tryLaunch(bed, b, waves, t1, events);
}

/** Put a monkey back on the bed (the lobby's practice, Biscuit). */
export function respawn(bed, b, x, z, si, t) {
  const fresh = createBody(b.id, bed, x, z, si, 0.6, t);
  Object.assign(b, fresh, { slams: b.slams });
}
