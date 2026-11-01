// A whole round played by brains alone, with every monkey simulated here: the tests' simulations, the title's attract mode
// and the posters. The live game uses the same body, wave, toy and brain code, split across pages (world.js).
import { STEP, ROUND, TOYS, RAIN, levelAt } from './config.js';
import { createBody, stepBody, giveToy, rewardHit } from './body.js';
import { makeWave, prune } from './waves.js';
import { createBrain } from './brain.js';
import { addFall, roundOver, outcomeOf } from './round.js';
import { createRng } from './rng.js';
import { toySchedule, rainSchedule, canGrab } from './toys.js';
import { twistRules } from './twists.js';

export function spawnFor(bed, index) {
  const [x, z] = bed.spawns[index % bed.spawns.length];
  let si = 0;
  for (const s of bed.surfaces) if (x >= s.x0 && x <= s.x1 && z >= s.z0 && z <= s.z1) si = s.i;
  return { x, z, si };
}

/**
 * seats: [{ id, kind, skill }] (kind: a personality; 'none' for a monkey driven from outside through `inputs`).
 * twist: a bedtime twist ('' none); toys: drop toys (default on).
 */
export function createArena({ bed, seats, seed = 1, firstRound = false, lobby = false, noEnd = false, twist = '', toys = true }) {
  const rng = createRng(`${seed}:arena`);
  const rules = twistRules(twist);
  const bodies = [];
  const brains = new Map();
  seats.forEach((seat, i) => {
    const sp = spawnFor(bed, i);
    const b = createBody(seat.id, bed, sp.x, sp.z, sp.si, (i * 0.2) % 1, 0);
    bodies.push(b);
    if (seat.kind && seat.kind !== 'none') brains.set(seat.id, createBrain(seat.kind, seat.skill ?? 0.5, `${seed}:${seat.id}`));
  });
  const ids = seats.map((s) => s.id);
  const a = {
    bed, bodies, brains, waves: [], falls: [], events: [], t: 0, done: false, winner: null, outcome: null, seq: 0, twist,
    toys: toys ? toySchedule(bed, String(seed), { bonanza: rules.bonanza }) : [],
    rain: rules.rain ? rainSchedule(bed, String(seed)) : [],
    rainNext: 0,
    stats: { slams: 0, launches: 0, pillows: 0, saves: 0, knockByPillow: 0, grabs: 0, megaKnocks: 0, shields: 0, perfects: 0, wildFalls: Object.fromEntries(ids.map((id) => [id, 0])) },
    leader: '', rng,
  };
  const ctx = { bed, waves: a.waves, level: levelAt(0), slamsOn: false, authority: true, events: a.events };
  const megaWaves = new Set();

  a.liveToys = (t) => a.toys.filter((toy) => !toy.taken && t >= toy.at - TOYS.drop && t < toy.until);

  a.step = (inputs = {}) => {
    if (a.done) return;
    const t = a.t;
    ctx.level = lobby ? levelAt(null) : levelAt(t, twist);
    let alive = 0;
    for (const b of bodies) if (!b.out) alive++;
    const world = { bed, bodies, waves: a.waves, level: ctx.level, slamsOn: false, leader: a.leader, alive, toys: a.liveToys(t) };
    a.events.length = 0;
    for (const b of bodies) {
      const brain = brains.get(b.id);
      const graceFor = firstRound && brain ? ROUND.firstGraceBots : ROUND.grace;
      ctx.slamsOn = lobby || t >= graceFor;
      world.slamsOn = ctx.slamsOn;
      const input = brain ? brain.act(b, world, t) : inputs[b.id];
      stepBody(b, input, ctx, t, STEP);
    }
    a.t = t + STEP;
    // Toys: the first monkey to reach one takes it.
    for (const toy of a.toys) {
      if (toy.taken || a.t < toy.at || a.t >= toy.until) continue;
      for (const b of bodies) {
        if (!canGrab(b, toy, a.t)) continue;
        toy.taken = b.id;
        giveToy(b, toy.kind, a.t, TOYS);
        a.stats.grabs++;
        a.events.push({ type: 'grab', id: b.id, kind: toy.kind, k: toy.k, x: toy.x, z: toy.z });
        break;
      }
    }
    // The pillow rain.
    while (a.rainNext < a.rain.length && a.rain[a.rainNext].at <= a.t) {
      const p = a.rain[a.rainNext++];
      a.waves.push(makeWave({ id: `rain#${p.k}`, owner: '', kind: 'rain', x: p.x, z: p.z, e: RAIN.e, t0: p.at, si: p.si, amp: ctx.level.amp, reflect: rules.reflect }, bed));
    }
    for (const ev of a.events) {
      if (ev.type === 'slam') {
        a.stats.slams++;
        if (ev.plan.si >= 0) {
          const id = `${ev.id}#${++a.seq}`;
          if (ev.plan.mega) megaWaves.add(id);
          a.waves.push(makeWave({ id, owner: ev.id, x: ev.plan.x, z: ev.plan.z, e: ev.plan.e, t0: ev.plan.at, si: ev.plan.si, amp: ctx.level.amp, mega: ev.plan.mega, reflect: rules.reflect }, bed));
        }
      } else if (ev.type === 'pillow') {
        a.stats.pillows++;
        a.waves.push(makeWave({ id: `${ev.id}#${++a.seq}`, owner: ev.id, kind: 'pillow', x: ev.x, z: ev.z, e: 0.5, t0: ev.at, si: ev.si, amp: ctx.level.amp, reflect: rules.reflect }, bed));
      } else if (ev.type === 'launch') {
        a.stats.launches++;
        const by = ev.by && ev.kind === 'slam' ? bodies.find((o) => o.id === ev.by) : null;
        if (by) {
          rewardHit(by);
          a.events.push({ type: 'hit', id: by.id, on: ev.id, x: by.x, z: by.z });
        }
      } else if (ev.type === 'shield') {
        a.stats.shields++;
      } else if (ev.type === 'pump' && ev.grade === 2) {
        a.stats.perfects++;
      } else if (ev.type === 'saved') {
        a.stats.saves++;
      } else if (ev.type === 'fall' && !lobby) {
        const f = addFall(a.falls, ids, { id: ev.id, by: ev.by, at: ev.t, kind: ev.kind });
        if (f && f.kind === 'pillow' && f.by) a.stats.knockByPillow++;
        if (f && f.by && megaWaves.has(ev.wave)) a.stats.megaKnocks++;
      }
    }
    prune(a.waves, a.t);
    if (!lobby && !noEnd && roundOver(ids, a.falls, a.t)) {
      a.done = true;
      a.outcome = outcomeOf(ids, a.falls, a.t);
      a.winner = a.outcome.winner;
    }
  };

  /** Play until the round ends (or `maxT`). */
  a.run = (maxT = ROUND.endAt + 1) => {
    while (!a.done && a.t < maxT) a.step();
    return a;
  };
  return a;
}
