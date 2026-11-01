// The bots' brains. Each bot sees the bed like a player does (positions, heights, rings), with a reaction time and errors
// in how well it reads heights, and drives its monkey through the same steering and slam as a player.
import { G, APEX, CONTACT, SLAM, WAVE, LAUNCH, PILLOW, STEER, clamp } from './config.js';
import { edgeDistance, edgeAlong, inside, clampToBed } from './beds.js';
import { canSlam, diveTime, v0For } from './body.js';
import { ampAt } from './waves.js';
import { createRng } from './rng.js';

/**
 * Personalities. threshold: how sure a slam must look; margin: distance kept from open edges; chase: how much it hunts;
 * defend: how well it jumps rings and fights launches.
 */
export const PERSONALITIES = {
  rumble: { threshold: 0.15, margin: 0.9, chase: 0.9, defend: 0.45, save: 0.6 },
  tiptoe: { threshold: 0.55, margin: 1.7, chase: 0.25, defend: 1.0, save: 1.0 },
  mimic: { threshold: 0.28, margin: 1.2, chase: 0.55, defend: 0.7, save: 0.8, mimic: true },
  dozy: { threshold: 0.55, margin: 1.2, chase: 0.5, defend: 0.75, save: 0.9, sleepy: true },
  pro: { threshold: 0.3, margin: 1.3, chase: 0.6, defend: 0.9, save: 1.0 },
  novice: { threshold: 0.0, margin: 0.5, chase: 0.5, defend: 0, save: 0, novice: true },
  camper: { threshold: 99, margin: 2.2, chase: 0, defend: 0.9, save: 1.0, camper: true },
  dummy: { threshold: 99, margin: 0, chase: 0, defend: 0, save: 0, dummy: true },
};

/** A body's feet height above its surface `dt` seconds ahead, if nothing hits it (its bounce, at the round's apex). */
export function predictFeet(bed, o, dt, apex) {
  const s = bed.surfaces[o.si];
  if (!s || o.out) return 9;
  if (o.mode === 'dive' || o.mode === 'falling') return 9;
  let y = o.mode === 'contact' ? 0 : o.y - s.top;
  let vy = o.vy;
  let t = dt;
  let contact = o.mode === 'contact' ? o.tc : 0;
  let nextApex = o.mode === 'contact' ? o.apexNext : o.low ? SLAM.rebound : apex;
  if (o.mode === 'contact') {
    if (t <= contact) return 0;
    t -= contact;
    vy = v0For(o.low ? SLAM.rebound : apex);
    y = 0;
    nextApex = apex;
  }
  for (let i = 0; i < 6; i++) {
    const land = (vy + Math.sqrt(vy * vy + 2 * G * Math.max(0, y))) / G;
    if (t <= land) return Math.max(0, y + vy * t - 0.5 * G * t * t);
    t -= land;
    if (t <= CONTACT) return 0;
    t -= CONTACT;
    y = 0;
    vy = v0For(nextApex);
    nextApex = apex;
  }
  return 0;
}

const ringSpeed = (bed, e) => WAVE.speed(e) * bed.phys.waveSpeed;

/** A ring's crest height at distance d for a slam of energy e (the same formula the ring uses). */
function crestFor(bed, e, d, amp) {
  const E = clamp(e, WAVE.minE, WAVE.maxE);
  const w = { R: WAVE.reach(E) * bed.phys.waveReach, A: WAVE.amp(E) * bed.phys.waveAmp * amp };
  return ampAt(w, d);
}

/**
 * A brain for one bot. `act(self, world, t)` returns { x, z, slam } for this step.
 * world: { bed, bodies, waves, level, slamsOn, leader }.
 */
export function createBrain(kind = 'pro', baseSkill = 0.5, seed = 1) {
  const p = PERSONALITIES[kind] ?? PERSONALITIES.pro;
  const rng = createRng(seed);
  const st = {
    nextPlan: 0, tx: 0, tz: 0, slamAt: -1, nextEval: 0, defendUntil: 0, dx: 0, dz: 0,
    launchSeen: -1, counterAt: 0, saveDecided: -1, jx: 0, jz: 0, nextJitter: 0, lastSeenSlam: '',
  };

  // Dozy wakes up when the springs go wild, or when the bed gets quiet (three monkeys left).
  const awake = (world) => !p.sleepy || world.level.w >= 0.5 || (world.alive ?? 5) <= 3;
  function skillNow(world) {
    if (!p.sleepy) return baseSkill;
    return awake(world) ? Math.min(0.95, baseSkill + 0.3) : baseSkill;
  }
  function reactNow(world) {
    const s = skillNow(world);
    let r = 0.42 - 0.27 * s;
    if (!awake(world)) r += 0.2;
    return r;
  }

  function plan(self, world, t, skill) {
    const { bed } = world;
    const here = bed.surfaces[self.si] ?? bed.surfaces[0];
    let best = null;
    // Spots on this mattress, and on any other one this monkey can reach (climbing onto the top bunk, dropping off it).
    const reach = (s) => s === here || s.top <= here.top + world.level.apex - 0.35;
    const candidates = [];
    for (const s of bed.surfaces) {
      if (!reach(s)) continue;
      candidates.push([s.cx, s.cz, s]);
      const n = s === here ? 9 : 4;
      for (let i = 0; i < n; i++) candidates.push([rng.range(s.x0 + 0.4, s.x1 - 0.4), rng.range(s.z0 + 0.4, s.z1 - 0.4), s]);
    }
    for (const o of world.bodies) {
      if (o === self || o.out || o.si < 0) continue;
      const ang = rng.range(0, Math.PI * 2);
      candidates.push([o.x + Math.cos(ang) * 1.7, o.z + Math.sin(ang) * 1.7, bed.surfaces[o.si]]);
    }
    const margin = p.sleepy && !awake(world) ? 1.9 : p.margin;
    const chase = p.sleepy && !awake(world) ? 0.1 : p.chase;
    for (const [cx, cz, s] of candidates) {
      if (!s || !reach(s) || !inside(s, cx, cz, -0.2)) continue;
      const others = world.bodies.filter((o) => o !== self && !o.out && o.si === s.i);
      const edge = edgeDistance(bed, s.i, cx, cz);
      let score = Math.min(edge, 3) * 0.6 - Math.max(0, margin - edge) * 4;
      if (s !== here) score -= 0.4;
      for (const o of others) {
        const d = Math.hypot(o.x - cx, o.z - cz);
        if (d < 1.0) score -= (1.0 - d) * 2;
        if (chase > 0) {
          const oe = edgeDistance(bed, s.i, o.x, o.z);
          const near = Math.max(0, 1 - Math.abs(d - 2.0) / 2.0);
          score += chase * near * (oe < edge ? 1.2 : 0.4) * (o.id === world.leader ? 1.3 : 1);
        }
      }
      if (p.novice) score = -Math.hypot(cx - here.cx, cz - here.cz) + rng.range(0, 1.5) - (s !== here ? 9 : 0);
      const travel = Math.hypot(cx - self.x, cz - self.z);
      score -= travel * 0.12;
      score += rng.gauss() * (1 - skill) * 0.6;
      if (!best || score > best[2]) best = [cx, cz, score];
    }
    if (best) {
      st.tx = best[0];
      st.tz = best[1];
    }
  }

  function slamValue(self, world, t, skill, delay) {
    const { bed, level } = world;
    const s = bed.surfaces[self.si];
    if (!s) return -1;
    const te = t + delay;
    const feetNow = self.y - s.top;
    const yAt = feetNow + self.vy * delay - 0.5 * G * delay * delay;
    if (yAt < SLAM.min + 0.05) return -1;
    const e = yAt / APEX.base;
    const ti = te + SLAM.windup + diveTime(yAt);
    const c = ringSpeed(bed, clamp(e, WAVE.minE, WAVE.maxE));
    const sigma = 0.65 * (1 - skill) + 0.04;
    let value = 0;
    let risk = 0;
    for (const o of world.bodies) {
      if (o === self || o.out || o.si !== self.si || o.mode === 'dive') continue;
      const d = Math.hypot(o.x - self.x, o.z - self.z);
      // A skilled bot predicts the target at the moment of its action; a clumsy one reads it as it is now.
      const lookAhead = skill > 0.5 ? ti - t + d / c : ti - te + d / c;
      const ox = o.x + o.vx * lookAhead * 0.6;
      const oz = o.z + o.vz * lookAhead * 0.6;
      const dd = Math.hypot(ox - self.x, oz - self.z);
      const a = crestFor(bed, e, dd, level.amp);
      if (a <= 0.05) continue;
      const feet = predictFeet(bed, o, ti - t + dd / c, level.apex) + rng.gauss() * sigma;
      if (feet > a * 0.9) continue;
      const q = 1 - clamp(feet / a, 0, 1);
      const strength = Math.min(LAUNCH.maxS, a * (0.55 + 0.45 * q));
      const flight = 2 * v0For(Math.min(LAUNCH.apexMax, LAUNCH.apex0 + LAUNCH.apexK * strength)) / G;
      const travel = LAUNCH.push * strength * bed.phys.push * flight * 0.75;
      const ux = dd > 0.05 ? (ox - self.x) / dd : 1;
      const uz = dd > 0.05 ? (oz - self.z) / dd : 0;
      const edge = edgeAlong(bed, o.si, ox, oz, ux, uz);
      let v = 0.15 + clamp((travel * 0.7) / Math.max(0.3, edge), 0, 1.1);
      if (o.id === world.leader) v *= 1.25;
      value += v;
    }
    // The price: after a slam this monkey bounces low with no save for a moment.
    for (const o of world.bodies) {
      if (o === self || o.out || o.si !== self.si) continue;
      const d = Math.hypot(o.x - self.x, o.z - self.z);
      if (d < 3.2 && canSlam(bed, o, t) && o.y - s.top > 0.9) risk += 0.12;
    }
    return value - risk * skill * (p.threshold > 0.6 ? 1.6 : 1);
  }

  function act(self, world, t) {
    const out = { x: 0, z: 0, slam: false };
    if (p.dummy) return out;
    const { bed } = world;
    const skill = skillNow(world);
    const react = reactNow(world);

    if (self.out) return pillow(self, world, t, skill, react);

    if (t >= st.nextPlan) {
      plan(self, world, t, skill);
      st.nextPlan = t + rng.range(0.5, 1.0) + (1 - skill) * 0.4;
    }
    // Steering toward the plan, with a wobble that shrinks with skill.
    if (t >= st.nextJitter) {
      st.jx = rng.gauss() * (1 - skill) * 0.35;
      st.jz = rng.gauss() * (1 - skill) * 0.35;
      st.nextJitter = t + rng.range(0.2, 0.5);
    }
    let dx = st.tx - self.x;
    let dz = st.tz - self.z;
    const dist = Math.hypot(dx, dz);
    const speedWanted = clamp(dist / 0.8, 0, 1);
    if (dist > 0.01) {
      dx = (dx / dist) * speedWanted;
      dz = (dz / dist) * speedWanted;
    }
    out.x = dx + st.jx;
    out.z = dz + st.jz;

    // Launched: counter-steer after reacting, and slam out of it if the flight ends off the bed.
    if (self.mode === 'launched') {
      if (st.launchSeen !== self.launches) {
        st.launchSeen = self.launches;
        st.counterAt = t + react * (p.novice ? 1.6 : 1);
        st.saveDecided = -1;
      }
      const s = bed.surfaces[self.si];
      if (t >= st.counterAt && s && rng.next() < 0.98) {
        if (!p.novice || rng.next() < 0.5) {
          const cx = s.cx - self.x;
          const cz = s.cz - self.z;
          const l = Math.hypot(cx, cz) || 1;
          out.x = cx / l;
          out.z = cz / l;
        }
        if (st.saveDecided !== self.launches && canSlam(bed, self, t)) {
          const feet = self.y - s.top;
          const tf = (self.vy + Math.sqrt(self.vy * self.vy + 2 * G * Math.max(0, feet))) / G;
          const lx = self.x + self.vx * tf;
          const lz = self.z + self.vz * tf;
          if (!inside(s, lx, lz, 0)) {
            st.saveDecided = self.launches;
            if (rng.next() < Math.min(1, 1.2 * skill * skill) * p.save && edgeDistance(bed, s.i, self.x, self.z) > 0.1) out.slam = true;
          }
        }
      }
      return out;
    }

    // Jump incoming rings: shift when the crest reaches you by stepping toward or away from its centre.
    if (t < st.defendUntil) {
      out.x = st.dx;
      out.z = st.dz;
    } else if (p.defend > 0 && self.mode !== 'dive') {
      const s = bed.surfaces[self.si];
      for (const w of world.waves) {
        if (!s || w.si !== self.si || w.owner === self.id) continue;
        const tau = t + react * 0.5 - w.t0;
        const d = Math.hypot(self.x - w.x, self.z - w.z);
        const r = w.c * Math.max(0, tau);
        if (d < r || d - r > w.c * 0.6) continue;
        const arrive = (d - r) / w.c;
        const a = ampAt(w, d);
        const feet = predictFeet(bed, self, arrive + react * 0.5, world.level.apex);
        if (feet > a * 1.1) continue;
        if (rng.next() > p.defend * Math.min(1, 1.15 * skill * skill + 0.1)) {
          st.defendUntil = t + 0.25;
          st.dx = out.x;
          st.dz = out.z;
          break;
        }
        const ux = (self.x - w.x) / (d || 1);
        const uz = (self.z - w.z) / (d || 1);
        const early = predictFeet(bed, self, Math.max(0, (d - r - 0.6) / (w.c + STEER.max)), world.level.apex);
        const late = predictFeet(bed, self, (d - r + 0.6) / Math.max(1, w.c - STEER.max), world.level.apex);
        const awayEdge = edgeAlong(bed, self.si, self.x, self.z, ux, uz);
        let sign = late > early ? 1 : -1;
        if (sign > 0 && awayEdge < 1.0) sign = -1;
        st.dx = ux * sign;
        st.dz = uz * sign;
        st.defendUntil = t + Math.min(0.5, arrive + 0.1);
        out.x = st.dx;
        out.z = st.dz;
        break;
      }
    }

    // Slams: evaluated a few times a second, acted on after a moment.
    if (world.slamsOn && st.slamAt < 0 && t >= st.nextEval) {
      st.nextEval = t + rng.range(0.05, 0.12);
      const delay = react * 0.45;
      if (p.novice) {
        const near = world.bodies.some((o) => o !== self && !o.out && o.si === self.si && Math.hypot(o.x - self.x, o.z - self.z) < 2.6);
        const s = bed.surfaces[self.si];
        if (near && s && self.y - s.top > 0.8 && rng.next() < 0.18) st.slamAt = t + delay;
      } else {
        let v = slamValue(self, world, t, skill, delay);
        if (p.mimic) {
          for (const w of world.waves) {
            if (w.owner === self.id || w.kind !== 'slam' || w.si !== self.si) continue;
            const age = t - w.t0;
            if (age > 0.05 && age < 0.4 && Math.hypot(w.x - self.x, w.z - self.z) < 3.2) v += 0.35;
          }
        }
        if (rng.next() < 0.015 * (1 - skill)) v += 1;
        let thr = p.threshold;
        if (p.sleepy) thr = awake(world) ? 0.2 : 1.4;
        if (v >= thr) st.slamAt = t + delay;
      }
    }
    if (st.slamAt >= 0 && t >= st.slamAt) {
      st.slamAt = -1;
      if (canSlam(bed, self, t)) out.slam = true;
    }
    return out;
  }

  function pillow(self, world, t, skill, react) {
    const out = { x: 0, z: 0, slam: false };
    const { bed } = world;
    let target = null;
    let bestScore = -Infinity;
    for (const o of world.bodies) {
      if (o === self || o.out || o.si < 0) continue;
      const edge = edgeDistance(bed, o.si, o.x, o.z);
      const score = -edge + (o.id === world.leader ? 0.6 : 0);
      if (score > bestScore) {
        bestScore = score;
        target = o;
      }
    }
    if (!target) return out;
    const lead = PILLOW.flight + react * 0.3;
    const [px, pz] = clampToBed(bed, target.x + target.vx * lead * 0.5 - (target.x - (bed.surfaces[target.si]?.cx ?? 0)) * 0.15, target.z + target.vz * lead * 0.5 - (target.z - (bed.surfaces[target.si]?.cz ?? 0)) * 0.15);
    const dx = px - self.aimX;
    const dz = pz - self.aimZ;
    const d = Math.hypot(dx, dz);
    if (d > 0.05) {
      out.x = dx / d * clamp(d / 0.4, 0, 1);
      out.z = dz / d * clamp(d / 0.4, 0, 1);
    }
    if (t >= self.nextPillow && d < 0.6 && world.slamsOn) {
      const feet = predictFeet(bed, target, PILLOW.flight + 0.1, world.level.apex) + rng.gauss() * 0.4 * (1 - skill);
      if (feet < 0.35 || rng.next() < 0.01) out.slam = true;
    }
    return out;
  }

  return { act, kind, skill: baseSkill, personality: p };
}
