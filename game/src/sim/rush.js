// Tonight's Rush: you against an endless line of monkeys climbing onto tonight's bed. Three bandages; knock-offs score,
// quick ones in a row multiply. The bed, the twist and the line of monkeys come from the UTC day, the same for everyone.
import { createArena } from './arena.js';
import { BEDS, bedById } from './beds.js';
import { createRng } from './rng.js';
import { respawn } from './body.js';
import { TWISTS, STEP, clamp } from './config.js';

export const RUSH = {
  bandages: 3, bots: 3, botsLate: 4, lateAt: 75, back: 1.6, ghost: 2.2, climb: [1.0, 2.2],
  combo: 5, comboMax: 5, knock: 100, mega: 50, dizzy: 40, double: 150, tick: 5, tickPts: 10,
  skill0: 0.28, skillPerKnock: 0.035, skillPerSec: 0.0025, skillMax: 0.93, maxT: 900, apart: 2.2,
};

const LINE = ['rumble', 'tiptoe', 'mimic', 'dozy', 'pro'];

/** Tonight's Rush: { day, bed, twist, seed }. */
export function rushFor(day) {
  const rng = createRng(`rush:${day}`);
  const bed = BEDS[rng.int(BEDS.length)].id;
  const twist = rng.next() < 0.45 ? '' : TWISTS[rng.int(TWISTS.length)];
  return { day, bed, twist, seed: `rush:${day}` };
}

/**
 * A Rush run. `step(input)` advances one STEP with the player's { x, z, slam }. Events (this step): the arena's, plus
 * score { pts, combo, on, mega, dizzy, double }, hurt { left }, back, climb { id, kind }, over.
 */
export function createRush({ day, me = 'me', info = rushFor(day) } = {}) {
  const bed = bedById(info.bed);
  const a = createArena({ bed, seats: [{ id: me, kind: 'none' }], seed: info.seed, noEnd: true, twist: info.twist, toysTo: RUSH.maxT });
  const rng = createRng(`${info.seed}:line`);
  const r = {
    info, bed, arena: a, me, score: 0, bandages: RUSH.bandages, knocks: 0, combo: 0, comboAt: -99, bestCombo: 0, over: false,
    events: [], seq: 0, climbs: [], backAt: -1, aliveFor: 0,
    stats: { knocks: 0, megaKnocks: 0, dizzyKnocks: 0, perfects: 0, streak: 0, bestStreak: 0, toys: 0, saves: 0, topSlams: 0, closeCalls: 0, rushScore: 0 },
    lastKnockWave: '',
  };
  const mine = () => a.bodies.find((b) => b.id === me);
  const bots = () => a.bodies.filter((b) => b.id !== me);

  /** The spawn spot farthest from `from` (bodies), jittered. */
  function spot(from) {
    let best = null;
    for (const [x, z] of bed.spawns) {
      let si = 0;
      for (const s of bed.surfaces) if (x >= s.x0 && x <= s.x1 && z >= s.z0 && z <= s.z1) si = s.i;
      const d = Math.min(99, ...from.filter((b) => !b.out).map((b) => Math.hypot(b.x - x, b.z - z)));
      const score = d + rng.range(0, 0.8);
      if (!best || score > best.score) best = { x, z, si, score };
    }
    return best;
  }

  function climb() {
    const t = a.t;
    const skill = clamp(RUSH.skill0 + RUSH.skillPerKnock * r.knocks + RUSH.skillPerSec * t, 0, RUSH.skillMax);
    const kind = r.seq < 2 ? 'novice' : LINE[rng.int(LINE.length)];
    const id = `m${++r.seq}`;
    const s = spot(a.bodies);
    a.addSeat({ id, kind, skill }, s.x, s.z, s.si);
    r.events.push({ type: 'climb', id, kind, skill, x: s.x, z: s.z });
  }

  const wanted = () => (a.t >= RUSH.lateAt ? RUSH.botsLate : RUSH.bots);
  for (let i = 0; i < RUSH.bots; i++) climb();

  r.step = (input = {}) => {
    r.events.length = 0;
    if (r.over) return r;
    a.step({ [me]: input });
    const t = a.t;
    for (const ev of a.events) {
      r.events.push(ev);
      if (ev.id === me) {
        if (ev.type === 'pump' && ev.grade === 2) {
          r.stats.perfects++;
          r.stats.streak = ev.streak;
          r.stats.bestStreak = Math.max(r.stats.bestStreak, ev.streak);
        } else if (ev.type === 'pump') r.stats.streak = 0;
        else if (ev.type === 'grab') r.stats.toys++;
        else if (ev.type === 'saved') r.stats.saves++;
        else if (ev.type === 'slam' && ev.tier >= 3) r.stats.topSlams++;
        else if (ev.type === 'land' && ev.launched && ev.rim) r.stats.closeCalls++;
      }
      if (ev.type !== 'fall') continue;
      if (ev.id === me) {
        r.bandages--;
        r.combo = 0;
        r.events.push({ type: 'hurt', left: r.bandages });
        if (r.bandages <= 0) {
          r.over = true;
          r.stats.rushScore = r.score;
          r.events.push({ type: 'over', score: r.score });
        } else r.backAt = t + RUSH.back;
        continue;
      }
      // A monkey from the line fell: it leaves, and another climbs on.
      a.removeSeat(ev.id);
      r.climbs.push(t + rng.range(RUSH.climb[0], RUSH.climb[1]));
      if (ev.by !== me) continue;
      r.knocks++;
      r.stats.knocks++;
      r.combo = t - r.comboAt <= RUSH.combo ? Math.min(RUSH.comboMax, r.combo + 1) : 1;
      r.comboAt = t;
      r.bestCombo = Math.max(r.bestCombo, r.combo);
      let pts = RUSH.knock * r.combo;
      const double = ev.wave && ev.wave === r.lastKnockWave;
      if (ev.mega) {
        pts += RUSH.mega;
        r.stats.megaKnocks++;
      }
      if (ev.stars >= 3) {
        pts += RUSH.dizzy;
        r.stats.dizzyKnocks++;
      }
      if (double) pts += RUSH.double;
      r.lastKnockWave = ev.wave || '';
      r.score += pts;
      r.events.push({ type: 'score', pts, combo: r.combo, on: ev.id, mega: !!ev.mega, dizzy: ev.stars >= 3, double, x: ev.x, z: ev.z });
    }
    if (r.over) return r;
    // Back on the bed after a fall, safe for a moment.
    const b = mine();
    if (r.backAt >= 0 && t >= r.backAt && b) {
      r.backAt = -1;
      const s = spot(bots());
      respawn(bed, b, s.x, s.z, s.si, t);
      b.ghost = t + RUSH.ghost;
      r.events.push({ type: 'back', x: s.x, z: s.z });
    }
    // Staying on the bed scores a little.
    if (b && !b.out) {
      r.aliveFor += STEP;
      if (r.aliveFor >= RUSH.tick) {
        r.aliveFor -= RUSH.tick;
        r.score += RUSH.tickPts;
      }
    }
    // The line: keep the bed full.
    r.climbs.sort((x, y) => x - y);
    while (r.climbs.length && r.climbs[0] <= t) {
      r.climbs.shift();
      if (bots().length < wanted()) climb();
    }
    if (bots().length + r.climbs.length < wanted()) r.climbs.push(t + rng.range(RUSH.climb[0], RUSH.climb[1]));
    if (t >= RUSH.maxT) {
      r.over = true;
      r.stats.rushScore = r.score;
      r.events.push({ type: 'over', score: r.score });
    }
    r.stats.rushScore = r.score;
    return r;
  };
  return r;
}
