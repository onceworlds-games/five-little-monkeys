// A whole round played by brains alone, with every monkey simulated here: the tests' simulations, the title's attract mode
// and the posters. The live game uses the same body, wave and brain code, split across pages.
import { STEP, ROUND, levelAt } from './config.js';
import { createBody, stepBody } from './body.js';
import { makeWave, prune } from './waves.js';
import { createBrain } from './brain.js';
import { addFall, roundOver, outcomeOf } from './round.js';
import { createRng } from './rng.js';

export function spawnFor(bed, index) {
  const [x, z] = bed.spawns[index % bed.spawns.length];
  let si = 0;
  for (const s of bed.surfaces) if (x >= s.x0 && x <= s.x1 && z >= s.z0 && z <= s.z1) si = s.i;
  return { x, z, si };
}

/**
 * seats: [{ id, kind, skill }] (kind: a personality; 'none' for a monkey driven from outside through `inputs`).
 */
export function createArena({ bed, seats, seed = 1, firstRound = false, lobby = false, noEnd = false }) {
  const rng = createRng(`${seed}:arena`);
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
    bed, bodies, brains, waves: [], falls: [], events: [], t: 0, done: false, winner: null, outcome: null, seq: 0,
    stats: { slams: 0, launches: 0, pillows: 0, saves: 0, knockByPillow: 0, wildFalls: Object.fromEntries(ids.map((id) => [id, 0])) },
    leader: '', rng,
  };
  const ctx = { bed, waves: a.waves, level: levelAt(0), slamsOn: false, authority: true, events: a.events };

  a.step = (inputs = {}) => {
    if (a.done) return;
    const t = a.t;
    ctx.level = lobby ? levelAt(null) : levelAt(t);
    let alive = 0;
    for (const b of bodies) if (!b.out) alive++;
    const world = { bed, bodies, waves: a.waves, level: ctx.level, slamsOn: false, leader: a.leader, alive };
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
    for (const ev of a.events) {
      if (ev.type === 'slam') {
        a.stats.slams++;
        if (ev.plan.si >= 0) {
          a.waves.push(makeWave({ id: `${ev.id}#${++a.seq}`, owner: ev.id, x: ev.plan.x, z: ev.plan.z, e: ev.plan.e, t0: ev.plan.at, si: ev.plan.si, amp: ctx.level.amp }, bed));
        }
      } else if (ev.type === 'pillow') {
        a.stats.pillows++;
        a.waves.push(makeWave({ id: `${ev.id}#${++a.seq}`, owner: ev.id, kind: 'pillow', x: ev.x, z: ev.z, e: 0.5, t0: ev.at, si: ev.si, amp: ctx.level.amp }, bed));
      } else if (ev.type === 'launch') {
        a.stats.launches++;
      } else if (ev.type === 'saved') {
        a.stats.saves++;
      } else if (ev.type === 'fall' && !lobby) {
        const f = addFall(a.falls, ids, { id: ev.id, by: ev.by, at: ev.t, kind: ev.kind });
        if (f && f.kind === 'pillow' && f.by) a.stats.knockByPillow++;
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
