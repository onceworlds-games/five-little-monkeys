// The bed as this page runs it: its own monkey (and the bots, on the host's page) with authority, everyone else's monkeys
// predicted forward from their last presence sample, and the rings from every slam and pillow, local or from a message.
// The round's twist, its toys and its pillow rain come from the round's id, so every page has the same ones; a grab is
// decided by the grabber's page and sent. No DOM and no three.js: the render reads it, the net feeds it.
import { STEP, ROUND, PILLOW, TOYS, RAIN, PUMP, DIZZY, levelAt, clamp } from './sim/config.js';
import { createBody, stepBody, startDive, respawn, giveToy, rewardHit } from './sim/body.js';
import { makeWave, prune } from './sim/waves.js';
import { createBrain } from './sim/brain.js';
import { spawnFor } from './sim/arena.js';
import { bedById } from './sim/beds.js';
import { toySchedule, rainSchedule, canGrab } from './sim/toys.js';
import { twistRules } from './sim/twists.js';

/** How long a remote monkey's shield or banana shows after the sample that said so. */
const HOLD = 0.6;

const MODE_CODE = { contact: 'c', air: 'a', dive: 'a', launched: 'l', falling: 'f', out: 'o' };
const CODE_MODE = { c: 'contact', a: 'air', l: 'launched', f: 'falling', o: 'out' };
const r2 = (v) => Math.round(v * 100) / 100;

/**
 * roles: 'me' (this page's player), 'bot' (a brain, on the host), 'remote' (predicted from samples), 'dummy' (Biscuit).
 */
export function createWorld(bedId, hooks = {}) {
  const w = {
    bed: bedById(bedId),
    t: 0,
    lobby: true,
    roundId: '',
    entries: new Map(),
    waves: [],
    events: [],
    level: levelAt(null),
    grace: ROUND.grace,
    botGrace: ROUND.grace,
    leader: '',
    // Ring ids are `${owner}#${n}`: start n somewhere new on every page load, so a reloaded page never reuses one.
    seq: Math.floor(Math.random() * 1e6) * 10,
    slowUntil: 0,
    twist: '',
    rules: twistRules(''),
    toys: [],
    rain: [],
    rainNext: 0,
  };
  const ctx = { bed: w.bed, waves: w.waves, level: w.level, slamsOn: true, authority: true, events: w.events };
  const waveIds = new Map();

  /** A fresh bed. seed: the round's id (its toys and rain); twist: the round's bedtime twist. */
  w.reset = (bedId2, t, { lobby, roundId = '', twist = '', seed = '' } = {}) => {
    w.bed = bedById(bedId2);
    ctx.bed = w.bed;
    w.t = t;
    w.lobby = !!lobby;
    w.roundId = roundId;
    w.entries.clear();
    w.waves.length = 0;
    waveIds.clear();
    w.events.length = 0;
    w.twist = lobby ? '' : twist;
    w.rules = twistRules(w.twist);
    w.toys = !lobby && seed ? toySchedule(w.bed, seed, { bonanza: w.rules.bonanza }) : [];
    w.rain = !lobby && seed && w.rules.rain ? rainSchedule(w.bed, seed) : [];
    w.rainNext = 0;
    while (w.rainNext < w.rain.length && w.rain[w.rainNext].at < t - 1) w.rainNext++;
    w.level = levelAt(lobby ? null : t, w.twist);
  };

  /** The toys to draw at time `t`: falling (before `at`), on the bed, or just taken. */
  w.liveToys = (t = w.t) => w.toys.filter((toy) => t >= toy.at - TOYS.drop && t < toy.until && (!toy.taken || t - toy.takenAt < 0.05));
  /** The rain pillows in the air at time `t`. */
  w.fallingRain = (t = w.t) => w.rain.filter((p) => t >= p.at - RAIN.drop && t < p.at);

  /** Add a monkey. opts: { role, index (spawn), brain: { kind, skill, seed }, phase }. */
  w.add = (id, opts) => {
    const sp = opts.spawn ?? spawnFor(w.bed, opts.index ?? 0);
    const body = createBody(id, w.bed, sp.x, sp.z, sp.si, opts.phase ?? ((opts.index ?? 0) * 0.2) % 1, w.t);
    const e = {
      id, body, role: opts.role, brain: null, input: { x: 0, z: 0, slam: false }, err: { x: 0, y: 0, z: 0 },
      sampleT: -1, outSince: -1, n: 0, look: opts.look ?? null, respawnAt: 0, index: opts.index ?? 0,
    };
    if (opts.brain) e.brain = createBrain(opts.brain.kind, opts.brain.skill, opts.brain.seed);
    w.entries.set(id, e);
    return e;
  };
  w.remove = (id) => w.entries.delete(id);
  w.get = (id) => w.entries.get(id);

  /** Hand a remote-predicted monkey to a brain (this page became the host), or back. */
  w.setRole = (id, role, brain) => {
    const e = w.entries.get(id);
    if (!e) return;
    e.role = role;
    e.brain = role === 'bot' && brain ? createBrain(brain.kind, brain.skill, brain.seed) : null;
    if (role === 'bot' && e.body.mode === 'falling' && !e.body.out) e.body.mode = 'air';
  };

  /** A ring (deduplicated by id). */
  w.addWave = (spec) => {
    if (waveIds.has(spec.id)) return null;
    waveIds.set(spec.id, spec.t0);
    const lvl = w.lobby ? levelAt(null) : levelAt(spec.t0, w.twist);
    const wave = makeWave({ ...spec, amp: lvl.amp, reflect: w.rules.reflect }, w.bed);
    w.waves.push(wave);
    hooks.onWave?.(wave);
    return wave;
  };

  /** A slam from another page (or the host's bot): the ring, and the dive on the predicted monkey. */
  w.remoteSlam = (id, m) => {
    const wid = `${id}#${m.n}`;
    if (m.si >= 0) w.addWave({ id: wid, owner: id, kind: 'slam', x: m.x, z: m.z, e: m.e, t0: m.at, si: m.si, mega: !!m.g });
    const e = w.entries.get(id);
    if (e && e.role === 'remote' && !e.body.out && w.t < m.at) {
      const top = m.si >= 0 ? w.bed.surfaces[m.si]?.top ?? 0 : w.bed.floor;
      const plan = { si: m.si, x: m.x, z: m.z, vx: m.vx, vz: m.vz, at: m.at, e: m.e, drop: m.y0 - top, y0: m.y0, t0: m.t0, top };
      // Start the dive from where the monkey is now, so it lands on the ring's centre at the ring's time.
      const b = e.body;
      b.y = Math.max(b.y, m.y0 - 0.3);
      startDive(b, plan);
      b.dive.t0 = Math.min(w.t, m.t0);
      b.dive.x0 = b.x;
      b.dive.z0 = b.z;
      const span = Math.max(0.03, m.at - b.dive.t0);
      b.dive.vx = (m.x - b.x) / span;
      b.dive.vz = (m.z - b.z) / span;
      e.diveUntil = m.at;
    }
    w.events.push({ type: 'remoteSlam', id, x: m.x, z: m.z, e: m.e, at: m.at, si: m.si });
  };

  w.remotePillow = (id, m) => {
    w.addWave({ id: `${id}#${m.n}`, owner: id, kind: 'pillow', x: m.x, z: m.z, e: 0.5, t0: m.at, si: m.si });
    w.events.push({ type: 'pillow', id, fx: m.fx, fz: m.fz, x: m.x, z: m.z, si: m.si, at: m.at, remote: true });
  };

  /** Another page's monkey grabbed toy `k` (a checked message): it's gone here too, and the monkey shows it. */
  w.remoteGrab = (id, m) => {
    const toy = w.toys.find((x) => x.k === m.k);
    const e = w.entries.get(id);
    if (!toy || !e || e.body.out || toy.taken === id) return false;
    if (m.at < toy.at - 0.3 || m.at > toy.until + 0.3) return false;
    // Near the toy (by the time the message is here the monkey may be flying off: be generous).
    if (Math.hypot(e.body.x - toy.x, e.body.z - toy.z) > TOYS.grab + 5) return false;
    // Two pages took it within the lag: the earlier grab wins everywhere (a tie goes to the lower id).
    if (toy.taken) {
      if (m.at > toy.takenT || (m.at === toy.takenT && id > toy.taken)) return false;
      const lost = w.entries.get(toy.taken);
      if (lost && lost.role !== 'remote') {
        if (toy.kind === 'mega') lost.body.mega = 0;
        else if (toy.kind === 'shield') lost.body.shield = 0;
      }
    }
    toy.taken = id;
    toy.takenT = m.at;
    toy.takenAt = w.t;
    if (e.role === 'remote') {
      if (toy.kind === 'mega') e.body.mega = w.t + HOLD;
      else if (toy.kind === 'shield') e.body.shield = w.t + HOLD;
      else e.body.tier = PUMP.max;
    }
    w.events.push({ type: 'grab', id, role: e.role, kind: toy.kind, k: toy.k, x: toy.x, z: toy.z, remote: true });
    return true;
  };

  /** Another page says monkey `by`'s ring launched its monkey: if `by` runs here, it earns the hit. */
  w.remoteHit = (on, by) => {
    const e = w.entries.get(by);
    if (!e || (e.role !== 'me' && e.role !== 'bot') || e.body.out) return false;
    rewardHit(e.body);
    w.events.push({ type: 'hit', id: by, on, role: e.role, x: e.body.x, z: e.body.z, tier: e.body.tier });
    return true;
  };

  /**
   * This monkey as a presence sample: [mode, x, z, y, vx, vz, vy, ix, iz, tc, low, launches, aimX, aimZ, si, tier, dizzy,
   * shield, banana].
   */
  w.sample = (id) => {
    const e = w.entries.get(id);
    if (!e) return null;
    const b = e.body;
    return [
      MODE_CODE[b.mode] ?? 'a', r2(b.x), r2(b.z), r2(b.y), r2(b.vx), r2(b.vz), r2(b.vy), r2(b.ix), r2(b.iz), r2(b.tc), b.low ? 1 : 0,
      b.launches, r2(b.aimX), r2(b.aimZ), b.si, clamp(b.tier | 0, 0, PUMP.max), clamp(b.dizzy | 0, 0, DIZZY.max), b.shield > w.t ? 1 : 0, b.mega > w.t ? 1 : 0,
    ];
  };

  /** The host said this monkey fell: it sits on the rug from now (or from long ago, for a page that just arrived). */
  w.markOut = (id, longAgo = true) => {
    const e = w.entries.get(id);
    if (!e || e.body.out) return;
    const b = e.body;
    b.out = true;
    b.mode = 'out';
    b.y = w.bed.floor;
    b.vx = b.vy = b.vz = 0;
    b.si = -1;
    b.dive = null;
    b.outAt = longAgo ? w.t - 5 : w.t;
    b.nextPillow = w.t + PILLOW.first;
    const s = w.bed.surfaces[0];
    b.aimX = s.cx;
    b.aimZ = s.cz;
  };

  /**
   * Put a monkey this page runs (its own, or a bot on the host) back where a checked sample says (a reload in the middle
   * of a round, from this player's last presence). Returns false when the sample says it was already out.
   */
  w.restore = (id, s) => {
    const e = w.entries.get(id);
    if (!e || !Array.isArray(s) || s.length < 15) return true;
    if (s[0] === 'o') return false;
    const b = e.body;
    [b.x, b.z, b.y, b.vx, b.vz, b.vy] = [s[1], s[2], s[3], s[4], s[5], s[6]];
    b.mode = s[0] === 'c' ? 'contact' : s[0] === 'l' ? 'launched' : 'air';
    b.si = Number.isInteger(s[14]) && s[14] >= -1 && s[14] < w.bed.surfaces.length ? s[14] : 0;
    if (b.si < 0) b.mode = 'air';
    b.lastTop = w.bed.surfaces[Math.max(0, b.si)].top;
    b.tc = s[9] > 0 ? s[9] : 0.12;
    b.launches = s[11] || 0;
    b.dive = null;
    return true;
  };

  /** Apply a sample taken at time `st` to a predicted monkey, then run it forward to now. */
  w.applySample = (id, s, st) => {
    const e = w.entries.get(id);
    if (!e || e.role !== 'remote' || !Array.isArray(s)) return;
    // Out is final in a round (only the lobby puts monkeys back): a late sample from before the fall can't revive one.
    if (e.body.out && !w.lobby) return;
    if (st <= e.sampleT) return;
    e.sampleT = st;
    const b = e.body;
    // A dive we started from its slam message plays out on its own.
    if (b.dive && w.t < (e.diveUntil ?? 0)) return;
    const mode = CODE_MODE[s[0]] ?? 'air';
    const ox = b.x;
    const oy = b.y;
    const oz = b.z;
    const wasOut = b.out;
    b.x = s[1];
    b.z = s[2];
    b.y = s[3];
    b.vx = s[4];
    b.vz = s[5];
    b.vy = s[6];
    b.ix = s[7];
    b.iz = s[8];
    b.tc = s[9];
    b.low = !!s[10];
    b.launches = s[11];
    b.aimX = s[12];
    b.aimZ = s[13];
    b.dive = null;
    if (s.length >= 19) {
      b.tier = s[15];
      b.dizzy = s[16];
      b.shield = s[17] ? w.t + HOLD : 0;
      b.mega = s[18] ? w.t + HOLD : 0;
    }
    if (mode === 'out') {
      b.mode = 'out';
      b.out = true;
      b.si = -1;
      if (!wasOut) b.outAt = w.t;
    } else {
      b.out = false;
      b.mode = mode;
      const si = s[14];
      b.si = Number.isInteger(si) && si >= -1 && si < w.bed.surfaces.length ? si : b.si;
      if (b.si >= 0) b.lastTop = w.bed.surfaces[b.si].top;
      if (mode === 'contact' && b.si < 0) b.mode = 'air';
      // Run forward to the present.
      const span = clamp(w.t - st, 0, 0.5);
      const input = { x: b.ix, z: b.iz, slam: false };
      const pctx = { ...ctx, authority: false, events: null, waves: null };
      let tt = w.t - span;
      while (tt < w.t - 1e-6) {
        const dt = Math.min(STEP, w.t - tt);
        stepBody(b, input, pctx, tt, dt);
        tt += dt;
      }
    }
    // Blend the correction out over ~120 ms instead of jumping.
    if (!wasOut && !b.out && e.drawn) {
      e.err.x += ox - b.x;
      e.err.y += oy - b.y;
      e.err.z += oz - b.z;
      const m = Math.hypot(e.err.x, e.err.y, e.err.z);
      if (m > 1.5) e.err.x = e.err.y = e.err.z = 0;
    }
  };

  /** Advance to time `target`, inputs for 'me' given. */
  w.advance = (target, meInput) => {
    let n = 0;
    const out = [];
    if (target - w.t > 2) w.t = target - 2;
    let slam = !!meInput?.slam;
    while (w.t < target - 1e-9 && n < 400) {
      const dt = Math.min(STEP, target - w.t);
      stepAll(dt, slam ? { ...meInput, slam: true } : meInput);
      slam = false;
      n++;
      out.push(...w.events);
      w.events.length = 0;
    }
    prune(w.waves, w.t);
    if (waveIds.size > 48) for (const [id, t0] of waveIds) if (w.t - t0 > 6) waveIds.delete(id);
    // Errors decay.
    const k = Math.exp(-(n * STEP) / 0.06);
    for (const e of w.entries.values()) {
      e.err.x *= k;
      e.err.y *= k;
      e.err.z *= k;
    }
    return out;
  };

  function stepAll(dt, meInput) {
    const t = w.t;
    w.level = w.lobby ? levelAt(null) : levelAt(t, w.twist);
    ctx.level = w.level;
    const bodies = [];
    let alive = 0;
    for (const e of w.entries.values()) {
      bodies.push(e.body);
      if (!e.body.out) alive++;
    }
    const view = { bed: w.bed, bodies, waves: w.waves, level: w.level, slamsOn: true, leader: w.leader, alive, toys: w.toys.filter((toy) => !toy.taken && t >= toy.at - TOYS.drop && t < toy.until) };
    for (const e of w.entries.values()) {
      const b = e.body;
      let input = null;
      ctx.authority = e.role !== 'remote';
      if (e.role === 'me') {
        input = meInput;
        ctx.slamsOn = w.lobby || t >= w.grace;
      } else if (e.role === 'bot') {
        ctx.slamsOn = w.lobby || t >= w.botGrace;
        view.slamsOn = ctx.slamsOn;
        input = e.brain ? e.brain.act(b, view, t) : null;
      } else if (e.role === 'dummy') {
        ctx.slamsOn = false;
        input = null;
      } else {
        ctx.slamsOn = false;
        input = { x: b.ix, z: b.iz, slam: false };
      }
      const before = w.events.length;
      stepBody(b, input, ctx, t, dt);
      for (let i = before; i < w.events.length; i++) w.events[i].role = e.role;
      if (e.role === 'remote' && b.dive && t + dt >= (e.diveUntil ?? 0)) e.diveUntil = 0;
      // Lobby: a fallen monkey pops back onto the quilt.
      if ((w.lobby || e.role === 'dummy') && b.out && e.role !== 'remote') {
        if (!e.respawnAt) e.respawnAt = t + (e.role === 'dummy' ? 1.6 : 1.3);
        else if (t >= e.respawnAt) {
          e.respawnAt = 0;
          const sp = e.role === 'dummy' ? { x: w.bed.surfaces[w.bed.surfaces.length - 1].cx, z: w.bed.surfaces[w.bed.surfaces.length - 1].cz, si: w.bed.surfaces.length - 1 } : spawnFor(w.bed, e.index);
          respawn(w.bed, b, sp.x, sp.z, sp.si, t);
          w.events.push({ type: 'respawn', id: e.id, role: e.role });
        }
      }
    }
    w.t = t + dt;
    // Toys: a monkey this page runs takes one it reaches first (the net tells the others).
    for (const toy of w.toys) {
      if (toy.taken || w.t < toy.at || w.t >= toy.until) continue;
      for (const e of w.entries.values()) {
        if (e.role === 'remote' || !canGrab(e.body, toy, w.t)) continue;
        toy.taken = e.id;
        toy.takenT = w.t;
        toy.takenAt = w.t;
        giveToy(e.body, toy.kind, w.t, TOYS);
        w.events.push({ type: 'grab', id: e.id, role: e.role, kind: toy.kind, k: toy.k, x: toy.x, z: toy.z, at: w.t });
        break;
      }
    }
    // The pillow rain (the same on every page).
    while (w.rainNext < w.rain.length && w.rain[w.rainNext].at <= w.t) {
      const p = w.rain[w.rainNext++];
      w.addWave({ id: `rain#${p.k}`, owner: '', kind: 'rain', x: p.x, z: p.z, e: RAIN.e, t0: p.at, si: p.si });
      w.events.push({ type: 'rain', x: p.x, z: p.z, si: p.si, k: p.k });
    }
    // Local slams and pillows make rings here; the net sends them. A slam ring that launched a monkey earns its slammer
    // a hit: here when the slammer runs here, else a message.
    const n0 = w.events.length;
    for (let i = 0; i < n0; i++) {
      const ev = w.events[i];
      if (ev.type === 'launch' && ev.kind === 'slam' && ev.by && ev.by !== ev.id && !w.lobby) {
        const by = w.entries.get(ev.by);
        if (by && (by.role === 'me' || by.role === 'bot')) {
          if (!by.body.out) {
            rewardHit(by.body);
            w.events.push({ type: 'hit', id: by.id, on: ev.id, role: by.role, x: by.body.x, z: by.body.z, tier: by.body.tier });
          }
        } else if (by && by.role === 'remote') w.events.push({ type: 'hitOut', id: ev.id, by: ev.by, role: ev.role, at: w.t });
      }
    }
    for (const ev of w.events) {
      if (ev.type === 'slam') {
        const n = ++w.seq;
        ev.n = n;
        if (ev.plan.si >= 0) w.addWave({ id: `${ev.id}#${n}`, owner: ev.id, kind: 'slam', x: ev.plan.x, z: ev.plan.z, e: ev.plan.e, t0: ev.plan.at, si: ev.plan.si, mega: !!ev.plan.mega });
      } else if (ev.type === 'pillow') {
        const n = ++w.seq;
        ev.n = n;
        w.addWave({ id: `${ev.id}#${n}`, owner: ev.id, kind: 'pillow', x: ev.x, z: ev.z, e: 0.5, t0: ev.at, si: ev.si });
      }
    }
  }

  return w;
}
