// Tonight's Rush on this page: the run (sim/rush.js) stepped in real time and shaped like world.js for the renderer.
// Monkeys knocked off the bed stay a moment (splat, dazed) before they leave, so the floor shows the damage.
import { createRush, rushFor, RUSH } from './sim/rush.js';
import { STEP, TOYS, RAIN, levelAt } from './sim/config.js';

const LINGER = 2.4;

/** A run of tonight's Rush (`day`: the UTC day) for the monkey `me`. */
export function createRushRun(day, me) {
  const info = rushFor(day);
  const run = createRush({ day, me, info });
  const a = run.arena;
  const kinds = new Map([[me, 'me']]);
  const entries = new Map();
  let index = 0;
  const pending = [];

  function sync() {
    const live = new Set();
    for (const b of a.bodies) {
      live.add(b.id);
      let e = entries.get(b.id);
      if (!e) {
        e = { id: b.id, body: b, role: b.id === me ? 'me' : 'bot', err: { x: 0, y: 0, z: 0 }, index: index++, kind: kinds.get(b.id) ?? 'pro', goneAt: 0 };
        entries.set(b.id, e);
      }
      e.body = b;
      e.goneAt = 0;
    }
    for (const [id, e] of entries) {
      if (live.has(id)) continue;
      if (!e.goneAt) e.goneAt = a.t + LINGER;
      else if (a.t >= e.goneAt) entries.delete(id);
    }
  }
  const take = (events) => {
    for (const ev of events) {
      if (ev.type === 'climb') kinds.set(ev.id, ev.kind);
      pending.push(ev.role ? ev : { ...ev, role: ev.id === me ? 'me' : 'bot' });
    }
  };
  take(run.events);
  sync();

  const world = {
    entries,
    leader: '',
    twist: info.twist,
    lobby: false,
    get bed() {
      return a.bed;
    },
    get t() {
      return a.t;
    },
    get waves() {
      return a.waves;
    },
    get level() {
      return levelAt(a.t, info.twist);
    },
    get: (id) => entries.get(id),
    liveToys: (t = a.t) => a.toys.filter((toy) => t >= toy.at - TOYS.drop && t < toy.until && (!toy.taken || a.t - (toy.takenAt ?? a.t) < 0.05)),
    fallingRain: (t = a.t) => a.rain.filter((p) => t >= p.at - RAIN.drop && t < p.at),
  };

  return {
    info,
    run,
    world,
    get over() {
      return run.over;
    },
    /** Step to time `target` with the player's input (`slam` used once). Returns the events since the last call. */
    advance(target, input) {
      let slam = !!input?.slam;
      let n = 0;
      while (a.t < target - 1e-9 && n < 240 && !run.over) {
        run.step(slam ? { ...input, slam: true } : { ...input, slam: false });
        slam = false;
        n++;
        // The arena marks toys taken; remember when, for the renderer's burst.
        for (const ev of run.events) {
          if (ev.type === 'grab') {
            const toy = a.toys.find((x) => x.k === ev.k);
            if (toy) toy.takenAt = a.t;
          }
        }
        take(run.events);
      }
      if (target - a.t > 1) a.t = Math.max(a.t, target - 1);
      sync();
      return pending.splice(0);
    },
    hud() {
      return { score: run.score, combo: run.combo, comboLeft: Math.max(0, RUSH.combo - (a.t - run.comboAt)), bandages: run.bandages, knocks: run.knocks, t: a.t };
    },
    step: STEP,
  };
}
