// The pump, dizzy stars, toys and bedtime twists.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BEDS, bedById } from '../game/src/sim/beds.js';
import { createBody, stepBody, planSlam, pressMeaning, timeToLand, giveToy, tierApex, rewardHit } from '../game/src/sim/body.js';
import { makeWave } from '../game/src/sim/waves.js';
import { createArena } from '../game/src/sim/arena.js';
import { toySchedule, rainSchedule, canGrab } from '../game/src/sim/toys.js';
import { twistFor, twistRules } from '../game/src/sim/twists.js';
import { STEP, APEX, PUMP, DIZZY, TOYS, MEGA, TWISTS, levelAt } from '../game/src/sim/config.js';

const kid = bedById('kid');
const calm = levelAt(0);

function run(b, seconds, press = () => false, { waves = [], level = calm, t0 = 0, bed = kid } = {}) {
  const events = [];
  const ctx = { bed, waves, level, slamsOn: true, authority: true, events };
  let t = t0;
  let maxY = -9;
  const n = Math.round(seconds / STEP);
  for (let i = 0; i < n; i++) {
    stepBody(b, { x: 0, z: 0, slam: press(t, b) }, ctx, t, STEP);
    t += STEP;
    maxY = Math.max(maxY, b.y);
  }
  return { events, t, maxY };
}

/** Press as the feet touch the quilt (a perfect pump), offset by `off` seconds (negative: early). */
function pumper(off = 0) {
  let pressedFor = -1;
  return (t, b) => {
    if (b.mode === 'air' && b.vy < 0 && pressedFor !== b.landedAt && timeToLand(kid, b) <= Math.max(0, -off) + STEP) {
      if (off > 0) return false;
      pressedFor = b.landedAt;
      return true;
    }
    if (off > 0 && b.mode === 'contact' && pressedFor !== b.landedAt && t - b.touchAt >= off) {
      pressedFor = b.landedAt;
      return true;
    }
    return false;
  };
}

test('the pump: perfect presses climb tier by tier to the top; no press settles back to the plain bounce', () => {
  const b = createBody('a', kid, 0, 0, 0, 0, 0);
  const { events, maxY } = run(b, 8, pumper(0));
  const pumps = events.filter((e) => e.type === 'pump');
  assert.ok(pumps.length >= 5, `${pumps.length} pumps`);
  assert.ok(pumps.every((e) => e.grade === 2), 'all perfect');
  assert.equal(b.tier, PUMP.max);
  assert.ok(Math.abs(maxY - tierApex(APEX.base, PUMP.max)) < 0.08, `top apex ${maxY}`);
  // Stop pressing: one tier lost per bounce.
  const r = run(b, 6, () => false, { t0: 8 });
  assert.equal(b.tier, 0);
  assert.ok(r.events.filter((e) => e.type === 'land').length >= 4);
});

test('the pump: a good press holds the tier, an early or late one is a miss, and a press in the dead zone never slams', () => {
  const b = createBody('a', kid, 0, 0, 0, 0, 0);
  run(b, 3, pumper(0));
  const tier = b.tier;
  assert.ok(tier >= 2);
  const good = run(b, 1.2, pumper(-0.08), { t0: 3 });
  assert.ok(good.events.some((e) => e.type === 'pump' && e.grade === 1), 'a good press');
  assert.equal(b.tier, tier, 'held');
  const early = run(b, 1.4, pumper(-0.16), { t0: 4.2 });
  assert.ok(early.events.some((e) => e.type === 'pump' && e.grade === -1), 'an early miss');
  assert.equal(early.events.some((e) => e.type === 'slam'), false, 'no slam');
  assert.ok(b.tier < tier);
  const c = createBody('c', kid, 0, 0, 0, 0, 0);
  const late = run(c, 1.2, pumper(0.115));
  assert.ok(late.events.some((e) => e.type === 'pump' && e.grade === -2), 'a late miss');
});

test('one button: low and falling it pumps, high it slams, and a pumped bounce makes a bigger slam', () => {
  const b = createBody('a', kid, 0, 0, 0, 0, 0);
  run(b, 0.45);
  assert.equal(b.mode, 'air');
  assert.equal(pressMeaning(kid, b, 0.45), 'slam');
  const low = createBody('l', kid, 0, 0, 0, 0, 0);
  run(low, 0.92);
  assert.ok(low.vy < 0 && timeToLand(kid, low) < PUMP.good, `ttl ${timeToLand(kid, low)}`);
  assert.equal(pressMeaning(kid, low, 0.92), 'pump');
  const plain = createBody('p', kid, 0, 0, 0, 0, 0);
  const pumped = createBody('q', kid, 0, 0, 0, 0, 0);
  run(plain, 4);
  run(pumped, 4, pumper(0));
  // Slam each from the top of its next bounce.
  const top = (b, t0) => {
    let t = t0;
    while (!(b.mode === 'air' && b.vy <= 0 && b.vy > -0.2)) {
      stepBody(b, {}, { bed: kid, waves: [], level: calm, slamsOn: true, authority: true, events: [] }, t, STEP);
      t += STEP;
    }
    return planSlam(kid, b, t);
  };
  assert.ok(top(pumped, 4).e > top(plain, 4).e + 0.3, 'a pumped slam carries more energy');
});

test('dizzy stars: each launch adds one, each makes the next launch fly further, and they wear off or get shaken off', () => {
  const fly = (stars) => {
    const b = createBody('a', kid, 0, 0, 0, 0, 0);
    b.dizzy = stars;
    b.dizzyAt = 0;
    const w = makeWave({ id: 'w', owner: 'x', x: -1.5, z: 0, e: 1, t0: 0, si: 0 }, kid);
    const r = run(b, 0.4, () => false, { waves: [w] });
    const launch = r.events.find((e) => e.type === 'launch');
    assert.ok(launch, 'launched');
    assert.equal(launch.stars, stars);
    assert.equal(b.dizzy, Math.min(DIZZY.max, stars + 1));
    return Math.hypot(b.vx, b.vz);
  };
  const v0 = fly(0);
  const v3 = fly(3);
  assert.ok(Math.abs(v3 / v0 - (1 + 3 * DIZZY.push)) < 0.05, `${v3 / v0}`);
  const b = createBody('a', kid, 0, 0, 0, 0, 0);
  b.dizzy = 2;
  b.dizzyAt = 0;
  const worn = run(b, DIZZY.decay + 0.5);
  assert.equal(b.dizzy, 1);
  assert.ok(worn.events.some((e) => e.type === 'dizzy'));
  const c = createBody('c', kid, 0, 0, 0, 0, 0);
  c.dizzy = 2;
  c.dizzyAt = 0;
  const shaken = run(c, 1.2, pumper(0));
  assert.ok(shaken.events.some((e) => e.type === 'dizzy' && e.shaken), 'a perfect pump shakes off a star');
  assert.ok(c.dizzy < 2);
});

test('toys: the pillow soaks up one launch, the banana makes a Mega Slam, the spring jumps to the top tier', () => {
  const b = createBody('a', kid, 0, 0, 0, 0, 0);
  giveToy(b, 'shield', 0, TOYS);
  const w = makeWave({ id: 'w', owner: 'x', x: -1.5, z: 0, e: 1, t0: 0, si: 0 }, kid);
  const r = run(b, 0.4, () => false, { waves: [w] });
  assert.ok(r.events.some((e) => e.type === 'shield' && e.by === 'x'));
  assert.equal(r.events.some((e) => e.type === 'launch'), false);
  assert.equal(b.shield, 0);
  // The next ring, timed to meet the monkey in the quilt.
  let t = r.t;
  while (b.mode !== 'contact') t = run(b, STEP, () => false, { t0: t }).t;
  const c = makeWave({ id: 'c', x: 0, z: 0, e: 1, t0: 0, si: 0 }, kid).c;
  const w2 = makeWave({ id: 'w2', owner: 'x', x: b.x - c * 0.1, z: b.z, e: 1, t0: t - 0.1, si: 0 }, kid);
  const r2 = run(b, 0.1, () => false, { waves: [w2], t0: t });
  assert.ok(r2.events.some((e) => e.type === 'launch'), 'the second ring launches');

  const m = createBody('m', kid, 0, 0, 0, 0, 0);
  run(m, 0.45);
  giveToy(m, 'mega', 0.45, TOYS);
  const plan = planSlam(kid, m, 0.45);
  assert.equal(plan.mega, true);
  const n = createBody('n', kid, 0, 0, 0, 0, 0);
  run(n, 0.45);
  const plain = planSlam(kid, n, 0.45);
  assert.ok(plan.e > plain.e && plan.e <= MEGA.maxE);
  const mw = makeWave({ id: 'm', x: 0, z: 0, e: plan.e, t0: 0, si: 0, mega: true }, kid);
  const pw = makeWave({ id: 'p', x: 0, z: 0, e: plain.e, t0: 0, si: 0 }, kid);
  assert.ok(mw.R > pw.R && mw.A > pw.A && mw.push > pw.push);

  const s = createBody('s', kid, 0, 0, 0, 0, 0);
  giveToy(s, 'spring', 0, TOYS);
  const sr = run(s, 1.6);
  assert.ok(sr.maxY > tierApex(APEX.base, PUMP.max) * PUMP.super - 0.1, `spring apex ${sr.maxY}`);
});

test('a ring that launches someone springs its slammer up a tier', () => {
  const b = createBody('a', kid, 0, 0, 0, 0, 0);
  rewardHit(b);
  assert.equal(b.tier, 1);
  assert.equal(b.superNext, true);
});

test('toy and rain schedules: the same from the same seed, on the bed, away from edges, never too many at once', () => {
  for (const bed of BEDS) {
    const a = toySchedule(bed, 'r1');
    const b = toySchedule(bed, 'r1');
    assert.deepEqual(a, b);
    assert.ok(a.length >= 5, `${bed.id}: ${a.length} toys`);
    assert.notDeepEqual(a, toySchedule(bed, 'r2'));
    for (const toy of a) {
      const s = bed.surfaces[toy.si];
      assert.ok(toy.x > s.x0 && toy.x < s.x1 && toy.z > s.z0 && toy.z < s.z1);
      assert.ok(['mega', 'shield', 'spring'].includes(toy.kind));
      const live = a.filter((o) => o.at <= toy.at && o.until > toy.at);
      assert.ok(live.length <= TOYS.max);
    }
    const bonanza = toySchedule(bed, 'r1', { bonanza: true });
    assert.ok(bonanza.length > a.length * 1.8);
    const rain = rainSchedule(bed, 'r1');
    assert.deepEqual(rain, rainSchedule(bed, 'r1'));
    assert.ok(rain.length >= 15);
  }
});

test('a toy goes to the first monkey to land on it, and only one', () => {
  const toy = { k: 0, kind: 'mega', x: 0, z: 0, si: 0, at: 1, until: 5 };
  const b = createBody('a', kid, 0, 0, 0, 0, 0);
  assert.equal(canGrab(b, toy, 0.5), false, 'not before it lands');
  assert.equal(canGrab(b, toy, 1.1), true);
  b.y = 2;
  assert.equal(canGrab(b, toy, 1.1), false, 'too high');
  let grabs = 0;
  for (let s = 0; s < 30; s++) {
    const a = createArena({ bed: kid, seats: ['rumble', 'tiptoe', 'mimic', 'dozy', 'pro'].map((k) => ({ id: k, kind: k, skill: 0.5 })), seed: `g${s}` });
    while (!a.done) {
      a.step();
      for (const e of a.events) {
        if (e.type !== 'grab') continue;
        grabs++;
        const t = a.toys.find((o) => o.k === e.k);
        assert.equal(t.taken, e.id);
      }
    }
  }
  assert.ok(grabs >= 30, `${grabs} grabs in 30 rounds`);
});

test('bedtime twists: none in round one, the same on every page, never twice in a row, each with its effect', () => {
  assert.equal(twistFor('m1', 1), '');
  const seen = new Set();
  for (let m = 0; m < 40; m++) {
    let prev = '';
    for (let r = 2; r <= 6; r++) {
      const t = twistFor(`m${m}`, r);
      assert.equal(t, twistFor(`m${m}`, r));
      assert.ok(TWISTS.includes(t));
      assert.notEqual(t, prev);
      prev = t;
      seen.add(t);
    }
  }
  assert.equal(seen.size, TWISTS.length);
  assert.ok(twistRules('echo').reflect > 0);
  assert.ok(levelAt(0, 'bouncy').apex > levelAt(0).apex + 0.4);
  assert.equal(levelAt(0, 'bouncy').amp, 1, 'bouncy springs keep calm rings');
  const rain = createArena({ bed: kid, seats: [{ id: 'a', kind: 'dummy' }], seed: 'r', twist: 'rain', noEnd: true });
  while (rain.t < 12) rain.step();
  assert.ok(rain.rainNext >= 3, 'pillows rain down');
  const echo = createArena({ bed: kid, seats: [{ id: 'a', kind: 'pro', skill: 0.9 }, { id: 'b', kind: 'dummy' }], seed: 'e', twist: 'echo', noEnd: true });
  let reflected = false;
  while (echo.t < 30 && !reflected) {
    echo.step();
    reflected = echo.waves.some((w) => w.src.length > 1);
  }
  assert.ok(reflected, 'echo rings reflect');
});

test('bots pump: a sharp bot alone keeps high, a clumsy one rarely does', () => {
  const tierShare = (skill) => {
    const a = createArena({ bed: bedById('king'), seats: [{ id: 'me', kind: 'camper', skill }, { id: 'd', kind: 'dummy' }], seed: 4, noEnd: true, toys: false });
    let high = 0;
    let n = 0;
    while (a.t < 30) {
      a.step();
      n++;
      if (a.bodies[0].tier >= 2) high++;
    }
    return high / n;
  };
  const sharp = tierShare(0.95);
  const clumsy = tierShare(0.1);
  assert.ok(sharp > 0.6, `sharp ${sharp.toFixed(2)}`);
  assert.ok(clumsy < sharp / 2, `clumsy ${clumsy.toFixed(2)}`);
});

test('every twist: rounds end, no NaN, and twists keep rounds in a sane range', () => {
  for (const twist of TWISTS) {
    const times = [];
    for (const bed of BEDS) {
      for (let s = 0; s < 12; s++) {
        const a = createArena({ bed, seats: ['rumble', 'tiptoe', 'mimic', 'dozy', 'pro'].map((k) => ({ id: k, kind: k, skill: (bed.skill[0] + bed.skill[1]) / 2 })), seed: `${twist}:${s}`, twist }).run();
        assert.ok(a.done);
        for (const b of a.bodies) for (const v of [b.x, b.y, b.z]) assert.ok(Number.isFinite(v));
        times.push(a.t);
      }
    }
    times.sort((x, y) => x - y);
    const med = times[times.length >> 1];
    assert.ok(med >= 24 && med <= 60, `${twist}: median ${med.toFixed(1)}`);
  }
});
