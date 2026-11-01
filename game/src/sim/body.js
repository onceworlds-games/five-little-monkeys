// One monkey: its bounce (and the pump that lifts it), steering, slam, launches, dizzy stars, toys and falls. The same code
// runs the player's own monkey, the bots, the predicted copies of other players' monkeys (authority off: they bounce and
// steer but only their own page launches them), and the simulations in the tests.
import { G, APEX, CONTACT, MONKEY_H, BODY_R, STEER, TUMBLE, RIM, WALL_REST, SLAM, LAUNCH, PILLOW, PUMP, DIZZY, MEGA, FALL_MARGIN, clamp } from './config.js';
import { surfaceUnder, edgeDistance, lowZoneAt, clampToBed, inside } from './beds.js';
import { crestsAt } from './waves.js';

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

/** The apex of a bounce at pump `tier` for the round's base apex (capped). */
export const tierApex = (base, tier) => Math.min(APEX.cap, base * PUMP.tiers[clamp(tier | 0, 0, PUMP.max)]);

/** A monkey on surface `si` at (x, z), `phase` (0-1) of the way through its first bounce. */
export function createBody(id, bed, x, z, si = 0, phase = 0, t = 0) {
  const s = bed.surfaces[si] ?? bed.surfaces[0];
  const b = {
    id, x, z, y: s.top, vx: 0, vz: 0, vy: 0, mode: 'contact', si: s.i, lastTop: s.top, tc: CONTACT,
    apexNext: APEX.base, cool: 0, tumble: 0, dive: null, low: false, hits: new Map(),
    lastBy: '', lastAt: -99, lastWave: '', lastKind: '', lastMega: false, launches: 0, rim: false, out: false, outAt: 0,
    aimX: s.cx, aimZ: s.cz, nextPillow: 0, slams: 0, saving: false, teeter: 0, landedAt: t, ix: 0, iz: 0,
    // The pump: tier 0-3, the touchdown time, a buffered press, this contact's grade (0 none, 1 good, 2 perfect), an
    // early press this fall, the perfect streak.
    tier: 0, touchAt: t, pressAt: -99, grade: 0, miss: '', streak: 0, superNext: false, springNext: false,
    // Dizzy stars, toys held (until a time; 0: none), invulnerable until (the Rush's respawn).
    dizzy: 0, dizzyAt: -99, shield: 0, mega: 0, ghost: 0,
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

/** Seconds until a monkey in the air lands on the surface under it (Infinity over nothing or not in the air). */
export function timeToLand(bed, b) {
  if (b.mode !== 'air' && b.mode !== 'launched') return Infinity;
  const s = bed.surfaces[b.si];
  if (!s) return Infinity;
  const h = b.y - s.top;
  if (h < 0) return 0;
  return (b.vy + Math.sqrt(b.vy * b.vy + 2 * G * h)) / G;
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

/**
 * What a press of the one button does now: 'pump' (near touchdown), 'early' (a pump pressed too soon), 'slam', or ''
 * (nothing: a cooldown, too low on the way up, out).
 */
export function pressMeaning(bed, b, t) {
  if (b.out || b.mode === 'dive' || b.mode === 'falling' || b.mode === 'out') return '';
  if (b.mode === 'contact') return b.low ? '' : 'pump';
  const ttl = b.vy <= 0 ? timeToLand(bed, b) : Infinity;
  if (ttl <= PUMP.good) return b.low ? '' : 'pump';
  if (ttl <= PUMP.dead) return b.low ? '' : 'early';
  return canSlam(bed, b, t) ? 'slam' : '';
}

/** A slam's energy from the height it drops: 1 from a plain bounce's top, rising more slowly above it. */
export function slamEnergy(drop, mega = false) {
  const r = Math.max(0, drop) / APEX.base;
  const e = r <= 1 ? r : 1 + SLAM.above * (r - 1);
  return mega ? Math.min(MEGA.maxE, e + MEGA.addE) : e;
}

/** Where and when a slam pressed now lands, and its energy (si -1: the floor, no ring). */
export function planSlam(bed, b, t) {
  const vx = b.vx * SLAM.side;
  const vz = b.vz * SLAM.side;
  const mega = b.mega > t;
  const tops = bed.surfaces.filter((s) => s.top < b.y - 0.01).sort((a, c) => c.top - a.top);
  for (const s of tops) {
    const drop = b.y - s.top;
    const T = SLAM.windup + diveTime(drop);
    const ix = b.x + vx * T;
    const iz = b.z + vz * T;
    if (inside(s, ix, iz, FALL_MARGIN)) {
      const e = slamEnergy(drop, mega);
      return { si: s.i, x: ix, z: iz, vx, vz, at: t + T, e, drop, y0: b.y, t0: t, top: s.top, mega };
    }
  }
  const drop = b.y - bed.floor;
  const T = SLAM.windup + diveTime(drop);
  return { si: -1, x: b.x + vx * T, z: b.z + vz * T, vx, vz, at: t + T, e: 0, drop, y0: b.y, t0: t, top: bed.floor, mega: false };
}

/** Start a dive from a plan (the page's own slam, or a remote one from its message). */
export function startDive(b, plan) {
  b.saving = b.mode === 'launched';
  b.mode = 'dive';
  b.dive = { ...plan, x0: b.x, z0: b.z };
  b.vx = plan.vx;
  b.vz = plan.vz;
  b.vy = 0;
  b.tier = 0;
  b.superNext = false;
  b.springNext = false;
  b.miss = '';
  b.pressAt = -99;
  if (plan.mega) b.mega = 0;
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

/** Grade a press `d` seconds from touchdown: 2 perfect, 1 good, 0 a miss. */
export const gradeOf = (d) => (Math.abs(d) <= PUMP.perfect ? 2 : Math.abs(d) <= PUMP.good ? 1 : 0);

function rebound(bed, b, level, t, events) {
  let apex;
  if (b.low) {
    apex = SLAM.rebound;
    b.low = false;
    b.tier = 0;
    b.streak = 0;
  } else {
    // The pump: a perfect press climbs a tier, a good one holds it, none (or an early one) drops one.
    const g = b.grade;
    if (g === 2) {
      b.tier = Math.min(PUMP.max, b.tier + 1);
      b.streak++;
    } else if (g === 1 || b.springNext) {
      if (g === 1) b.streak = 0;
    } else {
      b.tier = Math.max(0, b.tier - 1);
      b.streak = 0;
      if (b.miss) events?.push({ type: 'pump', id: b.id, grade: b.miss === 'late' ? -2 : -1, tier: b.tier, streak: 0, x: b.x, z: b.z });
    }
    const sup = b.superNext ? PUMP.super : 1;
    b.superNext = false;
    b.springNext = false;
    apex = Math.min(APEX.cap, tierApex(level.apex, b.tier) * sup * (b.rim ? RIM.apex : 1) * swellAt(bed, b.x, b.z, t) * lowZoneAt(bed, b.x, b.z));
  }
  b.grade = 0;
  b.miss = '';
  b.pressAt = -99;
  b.apexNext = apex;
  b.mode = 'air';
  b.vy = v0For(apex);
}

/** A press graded at touchdown or in the mattress: tell the page (sound, sparkle) at once. A perfect one shakes off a star. */
function grade(b, g, t, events) {
  if (g <= b.grade) return;
  b.grade = g;
  const tierNext = g === 2 ? Math.min(PUMP.max, b.tier + 1) : b.tier;
  events?.push({ type: 'pump', id: b.id, grade: g, tier: tierNext, streak: g === 2 ? b.streak + 1 : 0, x: b.x, z: b.z });
  if (g === 2 && b.dizzy > 0) {
    b.dizzy--;
    b.dizzyAt = t;
    events?.push({ type: 'dizzy', id: b.id, dizzy: b.dizzy, shaken: true });
  }
}

function land(bed, b, si, t, events) {
  const s = bed.surfaces[si];
  const wasLaunched = b.mode === 'launched';
  const fromFall = b.mode === 'falling';
  // The exact moment the feet met the quilt this step (the step overshoots it a little).
  const over = b.vy < 0 ? Math.max(0, (s.top - b.y) / -b.vy) : 0;
  const touch = t - Math.min(over, 1 / 60);
  const speed = -b.vy;
  b.y = s.top;
  b.vy = 0;
  b.si = si;
  b.lastTop = s.top;
  b.mode = 'contact';
  b.tc = CONTACT;
  b.tumble = 0;
  b.rim = edgeDistance(bed, si, b.x, b.z) < RIM.width;
  b.landedAt = t;
  b.touchAt = touch;
  b.grade = 0;
  if (b.rim) b.teeter = 0.6;
  if (!b.low && b.pressAt > -90) grade(b, gradeOf(b.pressAt - touch), t, events);
  b.pressAt = -99;
  events?.push({ type: 'land', id: b.id, x: b.x, z: b.z, si, rim: b.rim, launched: wasLaunched, fell: fromFall, speed, tier: b.tier });
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
  const stars = b.dizzy;
  b.tier = 0;
  b.shield = 0;
  b.mega = 0;
  b.dizzy = 0;
  b.nextPillow = t + PILLOW.first;
  const [ax, az] = clampToBed(bed, (bed.box.x0 + bed.box.x1) / 2, (bed.box.z0 + bed.box.z1) / 2);
  b.aimX = ax;
  b.aimZ = az;
  events?.push({ type: 'fall', id: b.id, x: b.x, z: b.z, t, by: t - b.lastAt <= 3 ? b.lastBy : '', kind: b.lastKind, wave: b.lastWave, mega: b.lastMega, stars });
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
  if (b.ghost > t) return;
  // The pillow takes it: a burst of feathers and a small hop.
  if (b.shield > t) {
    b.shield = 0;
    events?.push({ type: 'shield', id: b.id, by: cr.owner, x: b.x, z: b.z });
    if (b.mode === 'contact') {
      b.mode = 'air';
      b.y = s.top + 0.001;
      b.vy = v0For(Math.max(1.0, b.apexNext * 0.6));
      b.grade = 0;
      b.pressAt = -99;
    }
    return;
  }
  const q = 1 - clamp(feet / cr.k, 0, 1);
  const st = Math.min(LAUNCH.maxS, cr.k * (0.55 + 0.45 * q));
  const apex = Math.min(LAUNCH.apexMax, LAUNCH.apex0 + LAUNCH.apexK * st);
  const dizzy = 1 + DIZZY.push * b.dizzy;
  const push = LAUNCH.push * st * cr.push * dizzy;
  b.vx = cr.dx * push + b.vx * LAUNCH.keep;
  b.vz = cr.dz * push + b.vz * LAUNCH.keep;
  b.vy = v0For(apex);
  if (b.mode === 'contact') b.y = s.top + 0.001;
  b.mode = 'launched';
  b.tumble = TUMBLE.noSlam;
  b.low = false;
  b.tier = 0;
  b.streak = 0;
  b.superNext = false;
  b.springNext = false;
  b.grade = 0;
  b.pressAt = -99;
  b.miss = '';
  b.lastBy = cr.owner;
  b.lastAt = t;
  b.lastWave = cr.wave?.id ?? '';
  b.lastKind = cr.kind;
  b.lastMega = !!cr.wave?.mega;
  b.launches++;
  const stars = b.dizzy;
  b.dizzy = Math.min(DIZZY.max, b.dizzy + 1);
  b.dizzyAt = t;
  events?.push({ type: 'launch', id: b.id, by: cr.owner, s: st, x: b.x, z: b.z, kind: cr.kind, wave: b.lastWave, mega: !!cr.wave?.mega, stars, dx: cr.dx, dz: cr.dz });
}

/**
 * Advance one monkey by `dt` from time `t`. `input`: { x, z } steering (-1..1) and `slam` (the button, pressed this
 * step). ctx: { bed, waves, level, slamsOn, authority, events }. Events: slam, impact, saved, land, launch, fall, wall,
 * side, post, bonk, overEdge, pillow, pump, shield, dizzy.
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
  if (b.dizzy > 0 && t - b.dizzyAt > DIZZY.decay) {
    b.dizzy--;
    b.dizzyAt = t;
    events?.push({ type: 'dizzy', id: b.id, dizzy: b.dizzy });
  }
  if (b.shield && b.shield <= t) b.shield = 0;
  if (b.mega && b.mega <= t) b.mega = 0;

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

  // The one button (the page's own monkey and bots): pump near touchdown, slam when high.
  if (authority && input?.slam) {
    const meaning = pressMeaning(bed, b, t);
    if (meaning === 'pump') {
      if (b.mode === 'contact') {
        const g = gradeOf(t - b.touchAt);
        if (g) grade(b, g, t, events);
        else if (!b.grade) b.miss = 'late';
      } else b.pressAt = t;
    } else if (meaning === 'early') {
      if (!b.grade) b.miss = 'early';
    } else if (meaning === 'slam' && ctx.slamsOn) {
      const plan = planSlam(bed, b, t);
      const tier = b.tier;
      startDive(b, plan);
      b.slams++;
      events?.push({ type: 'slam', id: b.id, plan, saving: b.saving, tier });
    }
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
        events?.push({ type: 'impact', id: b.id, x: d.x, z: d.z, si: d.si, e: d.e, at: d.at, mega: !!d.mega });
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
      rebound(bed, b, ctx.level, t1, events);
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

/** Give a monkey a toy it grabbed: the banana's Mega Slam, the pillow, or the spring (straight to the top tier). */
export function giveToy(b, kind, t, toys) {
  if (kind === 'mega') b.mega = t + toys.megaFor;
  else if (kind === 'shield') b.shield = t + toys.shieldFor;
  else if (kind === 'spring') {
    b.tier = PUMP.max;
    b.superNext = true;
    b.springNext = true;
  }
}

/** A slammer whose ring launched someone: its next bounce climbs a tier with a spring in it (a reward for landing hits). */
export function rewardHit(b) {
  if (b.out) return;
  b.tier = Math.min(PUMP.max, b.tier + 1);
  b.superNext = true;
}

/** Put a monkey back on the bed (the lobby's practice, Biscuit, the Rush). */
export function respawn(bed, b, x, z, si, t) {
  const fresh = createBody(b.id, bed, x, z, si, 0.6, t);
  Object.assign(b, fresh, { slams: b.slams });
}
