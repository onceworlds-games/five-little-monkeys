// The bots' brains. Each bot sees the bed like a player does (positions, heights, rings, toys, dizzy stars), with a
// reaction time, a timing error on the pump that shrinks with skill and errors in how well it reads heights, and drives
// its monkey through the same steering and the same one button as a player.
import { G, APEX, CONTACT, SLAM, WAVE, LAUNCH, PILLOW, STEER, PUMP, DIZZY, MEGA, clamp } from './config.js';
import { edgeDistance, edgeAlong, inside, clampToBed } from './beds.js';
import { canSlam, diveTime, v0For, tierApex, timeToLand, pressMeaning, slamEnergy } from './body.js';
import { ampAt } from './waves.js';
import { createRng } from './rng.js';

/**
 * Personalities. threshold: how sure a slam must look; margin: distance kept from open edges; chase: how much it hunts;
 * defend: how well it jumps rings and fights launches; pump: how often it pumps a bounce; build: the pump tier it likes to
 * reach before it slams; greed: how much it wants each toy; bully: how much it picks on dizzy monkeys.
 */
export const PERSONALITIES = {
  rumble: { threshold: 0.15, margin: 1.0, chase: 0.9, defend: 0.6, save: 0.75, pump: 0.95, build: 1, greed: { mega: 1.5, shield: 0.4, spring: 0.7 }, bully: 1.2 },
  tiptoe: { threshold: 0.55, margin: 1.7, chase: 0.25, defend: 1.0, save: 1.0, pump: 0.95, build: 3, greed: { mega: 0.3, shield: 1.3, spring: 1.1 }, bully: 0.3 },
  mimic: { threshold: 0.26, margin: 1.25, chase: 0.6, defend: 0.8, save: 0.9, pump: 0.9, build: 1, greed: { mega: 1.0, shield: 0.9, spring: 1.0 }, bully: 0.8, mimic: true },
  dozy: { threshold: 0.55, margin: 1.2, chase: 0.5, defend: 0.75, save: 0.9, pump: 0.85, build: 1, greed: { mega: 1.0, shield: 0.9, spring: 0.9 }, bully: 0.8, sleepy: true },
  pro: { threshold: 0.3, margin: 1.3, chase: 0.6, defend: 0.9, save: 1.0, pump: 0.95, build: 2, greed: { mega: 1.1, shield: 0.9, spring: 0.8 }, bully: 1.0 },
  novice: { threshold: 0.0, margin: 0.5, chase: 0.5, defend: 0, save: 0, pump: 0.3, build: 0, greed: { mega: 0.5, shield: 0.5, spring: 0.5 }, bully: 0, novice: true },
  camper: { threshold: 99, margin: 2.2, chase: 0, defend: 0.9, save: 1.0, pump: 0.95, build: 3, greed: { mega: 0.1, shield: 0.8, spring: 0.7 }, bully: 0, camper: true },
  dummy: { threshold: 99, margin: 0, chase: 0, defend: 0, save: 0, pump: 0, build: 0, greed: { mega: 0, shield: 0, spring: 0 }, bully: 0, dummy: true },
};

/** The apex a monkey is bouncing toward on its next bounces (its pump tier at the round's apex). */
export const bounceApex = (o, level) => (o.low ? SLAM.rebound : tierApex(level.apex, o.tier ?? 0));

/** A body's feet height above its surface `dt` seconds ahead, if nothing hits it (its bounce, at apex `apex`). */
export function predictFeet(bed, o, dt, apex) {
  const s = bed.surfaces[o.si];
  if (!s || o.out) return 9;
  if (o.mode === 'dive' || o.mode === 'falling') return 9;
  let y = o.mode === 'contact' ? 0 : o.y - s.top;
  let vy = o.vy;
  let t = dt;
  const contact = o.mode === 'contact' ? o.tc : 0;
  if (o.mode === 'contact') {
    if (t <= contact) return 0;
    t -= contact;
    vy = v0For(o.low ? SLAM.rebound : apex);
    y = 0;
  }
  for (let i = 0; i < 6; i++) {
    const land = (vy + Math.sqrt(vy * vy + 2 * G * Math.max(0, y))) / G;
    if (t <= land) return Math.max(0, y + vy * t - 0.5 * G * t * t);
    t -= land;
    if (t <= CONTACT) return 0;
    t -= CONTACT;
    y = 0;
    vy = v0For(apex);
  }
  return 0;
}

const ringSpeed = (bed, e) => WAVE.speed(e) * bed.phys.waveSpeed;

/** A ring's crest height at distance d for a slam of energy e (the same formula the ring uses). */
function crestFor(bed, e, d, amp, mega = false) {
  const E = clamp(e, WAVE.minE, WAVE.maxE);
  const w = { R: WAVE.reach(E) * bed.phys.waveReach * (mega ? MEGA.reach : 1), A: WAVE.amp(E) * bed.phys.waveAmp * amp * (mega ? MEGA.amp : 1) };
  return ampAt(w, d);
}

/**
 * A brain for one bot. `act(self, world, t)` returns { x, z, slam } for this step (slam: the one button).
 * world: { bed, bodies, waves, level, slamsOn, leader, alive, toys }.
 */
export function createBrain(kind = 'pro', baseSkill = 0.5, seed = 1) {
  const p = PERSONALITIES[kind] ?? PERSONALITIES.pro;
  const rng = createRng(seed);
  const st = {
    nextPlan: 0, tx: 0, tz: 0, slamAt: -1, nextEval: 0, defendUntil: 0, dx: 0, dz: 0, toy: -1,
    launchSeen: -1, counterAt: 0, saveDecided: -1, jx: 0, jz: 0, nextJitter: 0, lastSeenSlam: '', pumpFor: -99, pumpAt: -1,
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
    const myApex = bounceApex(self, world.level);
    const reach = (s) => s === here || s.top <= here.top + Math.max(world.level.apex, myApex) - 0.35;
    const candidates = [];
    for (const s of bed.surfaces) {
      if (!reach(s)) continue;
      candidates.push([s.cx, s.cz, s, null]);
      const n = s === here ? 9 : 4;
      for (let i = 0; i < n; i++) candidates.push([rng.range(s.x0 + 0.4, s.x1 - 0.4), rng.range(s.z0 + 0.4, s.z1 - 0.4), s, null]);
    }
    for (const o of world.bodies) {
      if (o === self || o.out || o.si < 0) continue;
      const ang = rng.range(0, Math.PI * 2);
      candidates.push([o.x + Math.cos(ang) * 1.7, o.z + Math.sin(ang) * 1.7, bed.surfaces[o.si], null]);
    }
    // Toys on the bed (their shadows show where they'll land).
    const sleepy = p.sleepy && !awake(world);
    for (const toy of world.toys ?? []) {
      if (toy.taken) continue;
      candidates.push([toy.x, toy.z, bed.surfaces[toy.si], toy]);
    }
    const margin = sleepy ? 1.9 : p.margin;
    const chase = sleepy ? 0.1 : p.chase;
    // Monkeys holding a golden banana: keep out of their ring's reach.
    const megas = world.bodies.filter((o) => o !== self && !o.out && o.mega > t);
    let bestToy = -1;
    for (const [cx, cz, s, toy] of candidates) {
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
          const dizzy = 1 + 0.25 * (o.dizzy ?? 0) * p.bully;
          score += chase * near * (oe < edge ? 1.2 : 0.4) * (o.id === world.leader ? 1.3 : 1) * dizzy;
        }
      }
      for (const o of megas) {
        if (o.si !== s.i) continue;
        const d = Math.hypot(o.x - cx, o.z - cz);
        score -= Math.max(0, 1 - d / 4.2) * 2.2 * (0.4 + p.defend * 0.6);
      }
      if (toy) {
        // Worth it if this monkey gets there first.
        const mine = Math.hypot(cx - self.x, cz - self.z);
        const rival = Math.min(99, ...world.bodies.filter((o) => o !== self && !o.out && o.si === s.i).map((o) => Math.hypot(o.x - cx, o.z - cz)));
        const want = (p.greed[toy.kind] ?? 0.5) * (sleepy ? 0.25 : 1);
        const late = Math.max(0, mine / STEER.max - (toy.until - t));
        score += want * 2.4 * (mine < rival * 1.15 ? 1 : 0.35) - late * 3;
        // The banana is wasted on a monkey that already holds one; the pillow too.
        if ((toy.kind === 'mega' && self.mega > t) || (toy.kind === 'shield' && self.shield > t)) score -= 2;
      }
      if (p.novice) score = -Math.hypot(cx - here.cx, cz - here.cz) + rng.range(0, 1.5) - (s !== here ? 9 : 0) + (toy ? rng.range(0, 1.4) : 0);
      const travel = Math.hypot(cx - self.x, cz - self.z);
      score -= travel * 0.12;
      score += rng.gauss() * (1 - skill) * 0.6;
      if (!best || score > best[2]) {
        best = [cx, cz, score];
        bestToy = toy ? toy.k : -1;
      }
    }
    if (best) {
      st.tx = best[0];
      st.tz = best[1];
      st.toy = bestToy;
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
    const mega = self.mega > te;
    const e = slamEnergy(yAt, mega);
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
      const a = crestFor(bed, e, dd, level.amp, mega);
      if (a <= 0.05) continue;
      const feet = predictFeet(bed, o, ti - t + dd / c, bounceApex(o, level)) + rng.gauss() * sigma;
      if (feet > a * 0.9) continue;
      if (o.shield > ti) {
        value += 0.12;
        continue;
      }
      const q = 1 - clamp(feet / a, 0, 1);
      const strength = Math.min(LAUNCH.maxS, a * (0.55 + 0.45 * q));
      const flight = 2 * v0For(Math.min(LAUNCH.apexMax, LAUNCH.apex0 + LAUNCH.apexK * strength)) / G;
      const dizzy = 1 + DIZZY.push * (o.dizzy ?? 0);
      const travel = LAUNCH.push * strength * bed.phys.push * flight * 0.75 * dizzy * (mega ? MEGA.push : 1);
      const ux = dd > 0.05 ? (ox - self.x) / dd : 1;
      const uz = dd > 0.05 ? (oz - self.z) / dd : 0;
      const edge = edgeAlong(bed, o.si, ox, oz, ux, uz);
      let v = 0.15 + clamp((travel * 0.7) / Math.max(0.3, edge), 0, 1.1);
      if (o.id === world.leader) v *= 1.25;
      v *= 1 + 0.15 * (o.dizzy ?? 0) * p.bully;
      value += v;
    }
    // The price: after a slam this monkey bounces low with no save for a moment, and its pump tier is spent.
    for (const o of world.bodies) {
      if (o === self || o.out || o.si !== self.si) continue;
      const d = Math.hypot(o.x - self.x, o.z - self.z);
      if (d < 3.2 && canSlam(bed, o, t) && o.y - s.top > 0.9) risk += 0.12 + (o.mega > t ? 0.15 : 0);
    }
    risk += 0.05 * (self.tier ?? 0);
    // A banana about to spoil is worth using.
    const spoil = mega && self.mega - t < 4 ? 0.25 : 0;
    return value - risk * skill * (p.threshold > 0.6 ? 1.6 : 1) + spoil;
  }

  /** The pump: once per fall, decide whether to pump and when to press (a timing error that shrinks with skill). */
  function pump(self, world, t, skill, out) {
    if ((self.mode === 'air' || (self.mode === 'launched' && self.tumble <= 0)) && self.vy < 0 && !self.low && st.pumpFor !== self.landedAt) {
      st.pumpFor = self.landedAt;
      st.pumpAt = -1;
      const ttl = timeToLand(world.bed, self);
      const rate = p.pump * (p.sleepy && !awake(world) ? 0.35 : 1);
      if (ttl < 3 && rng.next() < rate) {
        const sigma = 0.09 * (1 - skill) + 0.015;
        // A bot never presses so early it slams, nor so late the bounce is gone.
        const err = clamp(rng.gauss() * sigma, -0.19, 0.11);
        st.pumpAt = t + ttl + err;
      }
    }
    if (st.pumpAt >= 0 && t >= st.pumpAt) {
      st.pumpAt = -1;
      const m = pressMeaning(world.bed, self, t);
      if (m === 'pump' || m === 'early') out.slam = true;
    }
  }

  function act(self, world, t) {
    const out = { x: 0, z: 0, slam: false };
    if (p.dummy) return out;
    const { bed } = world;
    const skill = skillNow(world);
    const react = reactNow(world);

    if (self.out) return pillow(self, world, t, skill, react);

    const toyGone = st.toy >= 0 && !(world.toys ?? []).some((o) => o.k === st.toy && !o.taken);
    if (t >= st.nextPlan || toyGone) {
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
    const speedWanted = clamp(dist / (st.toy >= 0 ? 0.4 : 0.8), 0, 1);
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
    const myApex = bounceApex(self, world.level);
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
        const feet = predictFeet(bed, self, arrive + react * 0.5, myApex);
        if (feet > a * 1.1) continue;
        if (rng.next() > p.defend * Math.min(1, 1.15 * skill * skill + 0.1)) {
          st.defendUntil = t + 0.25;
          st.dx = out.x;
          st.dz = out.z;
          break;
        }
        const ux = (self.x - w.x) / (d || 1);
        const uz = (self.z - w.z) / (d || 1);
        const early = predictFeet(bed, self, Math.max(0, (d - r - 0.6) / (w.c + STEER.max)), myApex);
        const late = predictFeet(bed, self, (d - r + 0.6) / Math.max(1, w.c - STEER.max), myApex);
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
        // Patience: a slam spends the pump, so a bot that likes to build waits for its tier (skilled ones more).
        thr += Math.max(0, p.build - (self.tier ?? 0)) * 0.14 * skill;
        if (self.mega > t) thr = Math.min(thr, 0.35);
        if (v >= thr) st.slamAt = t + delay;
      }
    }
    if (st.slamAt >= 0 && t >= st.slamAt) {
      st.slamAt = -1;
      if (canSlam(bed, self, t) && pressMeaning(bed, self, t) === 'slam') out.slam = true;
    }
    if (!out.slam) pump(self, world, t, skill, out);
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
      const score = -edge + (o.id === world.leader ? 0.6 : 0) + 0.3 * (o.dizzy ?? 0) * p.bully - (o.shield > t ? 1.5 : 0);
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
      const feet = predictFeet(bed, target, PILLOW.flight + 0.1, bounceApex(target, world.level)) + rng.gauss() * 0.4 * (1 - skill);
      if (feet < 0.35 || rng.next() < 0.01) out.slam = true;
    }
    return out;
  }

  return { act, kind, skill: baseSkill, personality: p };
}
