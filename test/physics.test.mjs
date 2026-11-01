// The bounce, the slam, rings, launches and falls.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BEDS, bedById, surfaceUnder, edgeDistance, clampToBed } from '../game/src/sim/beds.js';
import { createBody, stepBody, planSlam, canSlam, periodFor, diveTime } from '../game/src/sim/body.js';
import { makeWave, fieldAt, crestsAt, ampAt } from '../game/src/sim/waves.js';
import { STEP, APEX, SLAM, levelAt } from '../game/src/sim/config.js';

const kid = bedById('kid');
const calm = levelAt(0);

function run(b, bed, seconds, input = {}, waves = [], level = calm, t0 = 0) {
  const events = [];
  const ctx = { bed, waves, level, slamsOn: true, authority: true, events };
  let t = t0;
  let maxY = -9;
  const n = Math.round(seconds / STEP);
  for (let i = 0; i < n; i++) {
    stepBody(b, typeof input === 'function' ? input(t, b) : input, ctx, t, STEP);
    t += STEP;
    maxY = Math.max(maxY, b.y);
    for (const v of [b.x, b.y, b.z, b.vx, b.vy, b.vz]) assert.ok(Number.isFinite(v), 'finite');
  }
  return { events, t, maxY };
}

test('a monkey bounces by itself to the base apex, about once a second', () => {
  const b = createBody('a', kid, 0, 0, 0, 0, 0);
  const { events, maxY } = run(b, kid, 10);
  const lands = events.filter((e) => e.type === 'land');
  assert.ok(Math.abs(maxY - APEX.base) < 0.05, `apex ${maxY}`);
  assert.ok(lands.length >= 9 && lands.length <= 11, `${lands.length} landings in 10 s`);
  assert.ok(Math.abs(periodFor(APEX.base) - 1.0) < 0.05);
  assert.equal(b.out, false);
});

test('wild springs bounce higher', () => {
  const b = createBody('a', kid, 0, 0, 0, 0, 0);
  const { maxY } = run(b, kid, 4, {}, [], levelAt(60), 50);
  assert.ok(maxY > APEX.wild - 0.1 && maxY < APEX.wild + 0.1, `wild apex ${maxY}`);
});

test('steering moves the monkey; off the edge it falls to the floor and is out', () => {
  const b = createBody('a', kid, 0, 0, 0, 0, 0);
  const { events } = run(b, kid, 4, { x: 1, z: 0 });
  assert.equal(b.out, true);
  assert.ok(events.some((e) => e.type === 'overEdge'));
  const fall = events.find((e) => e.type === 'fall');
  assert.ok(fall);
  assert.equal(fall.by, '', 'walking off scores nobody');
  assert.equal(b.y, kid.floor);
});

test('a monkey over the floor can steer back while its feet are above the quilt', () => {
  const b = createBody('a', kid, 2.9, 0, 0, 0.3, 0);
  b.vx = 3;
  const { events } = run(b, kid, 2.5, (t) => ({ x: -1, z: 0 }));
  assert.equal(b.out, false);
  assert.equal(events.some((e) => e.type === 'fall'), false);
});

test('the headboard is a low lip: low monkeys bounce off it, launched ones fly over', () => {
  const b = createBody('a', kid, 0, -3.5, 0, 0, 0);
  b.mode = 'air'; b.y = 0.3; b.vy = 0.5; b.vz = -3;
  run(b, kid, 0.3, {});
  assert.ok(b.z > -4.0, 'stopped by the headboard');
  const c = createBody('c', kid, 0, -3.5, 0, 0, 0);
  c.mode = 'launched'; c.y = 1.5; c.vy = 4; c.vz = -3;
  run(c, kid, 3, {});
  assert.equal(c.out, true, 'over the headboard and out');
});

test('a slam lands where it was planned, and its plan is known at the press', () => {
  const b = createBody('a', kid, 0, 0, 0, 0.45, 0);
  const plan = planSlam(kid, b, 0);
  assert.ok(plan.si === 0 && plan.e > 0.5);
  assert.ok(plan.at - 0 > SLAM.windup && plan.at - 0 < 0.3, 'wind-up and dive cover the network');
  const { events } = run(b, kid, 0.5, (t) => ({ slam: t === 0 }));
  const impact = events.find((e) => e.type === 'impact');
  assert.ok(impact);
  assert.ok(Math.abs(impact.x - plan.x) < 1e-9 && Math.abs(impact.z - plan.z) < 1e-9);
  assert.ok(Math.abs(impact.at - plan.at) < 1e-9);
  assert.ok(!canSlam(kid, b, 0.6), 'cooldown');
});

test('slam energy grows with height, and a slam from the floor side lands on the floor', () => {
  const low = createBody('a', kid, 0, 0, 0, 0, 0);
  low.mode = 'air'; low.y = 0.5;
  const high = createBody('b', kid, 0, 0, 0, 0, 0);
  high.mode = 'air'; high.y = 1.6;
  assert.ok(planSlam(kid, high, 0).e > planSlam(kid, low, 0).e * 2);
  const out = createBody('c', kid, 3.6, 0, 0, 0, 0);
  out.mode = 'air'; out.y = 1.0; out.si = -1;
  assert.equal(planSlam(kid, out, 0).si, -1);
  assert.ok(diveTime(1.6) < 0.15);
});

test('rings: taller near the slam, gone past their reach, and crossing rings add up', () => {
  const w = makeWave({ id: 'w', owner: 'x', x: 0, z: 0, e: 1, t0: 0 }, kid);
  assert.ok(ampAt(w, 1) > ampAt(w, 2) && ampAt(w, 2) > ampAt(w, 3) && ampAt(w, 3) > ampAt(w, 4));
  assert.ok(Math.abs(ampAt(w, 1) - 0.84) < 0.05, `crest at 1 u ${ampAt(w, 1)}`);
  assert.equal(ampAt(w, 5.1), 0);
  const tAt2 = 2 / w.c;
  assert.ok(fieldAt([w], 0, 2, 0, tAt2) > 0.6);
  assert.equal(fieldAt([w], 0, 2, 0, tAt2 + 0.5), 0);
  const w2 = makeWave({ id: 'v', owner: 'y', x: 4, z: 0, e: 1, t0: 0 }, kid);
  const one = crestsAt([w], 0, 2, 0, tAt2, new Map());
  const two = crestsAt([w, w2], 0, 2, 0, tAt2, new Map());
  assert.ok(two.k > one.k * 1.9, 'interference');
});

test('a ring launches a monkey on the mattress, and rolls under one high in the air', () => {
  const waves = [makeWave({ id: 'w', owner: 'x', x: 0, z: 0, e: 1, t0: 0 }, kid)];
  const low = createBody('low', kid, 1.2, 0, 0, 0, 0);
  const { events } = run(low, kid, 0.4, {}, waves);
  const launch = events.find((e) => e.type === 'launch');
  assert.ok(launch, 'launched');
  assert.equal(launch.by, 'x');
  assert.ok(low.vx > 2, 'pushed away from the slam');
  const high = createBody('high', kid, 1.2, 0, 0, 0.45, 0);
  const r = run(high, kid, 0.4, {}, [makeWave({ id: 'w2', owner: 'x', x: 0, z: 0, e: 1, t0: 0 }, kid)]);
  assert.equal(r.events.some((e) => e.type === 'launch'), false, 'safe above the crest');
});

test('a launched monkey knocked off the bed credits the slammer; a save slam can keep it on', () => {
  const waves = [makeWave({ id: 'w', owner: 'x', x: 1.2, z: 0, e: 1.4, t0: 0 }, kid)];
  const b = createBody('v', kid, 2.1, 0, 0, 0, 0);
  const { events } = run(b, kid, 3, {}, waves);
  const fall = events.find((e) => e.type === 'fall');
  assert.ok(fall, 'knocked off');
  assert.equal(fall.by, 'x');
  const waves2 = [makeWave({ id: 'w', owner: 'x', x: -0.5, z: 0, e: 1, t0: 0 }, kid)];
  const c = createBody('s', kid, 0.5, 0, 0, 0, 0);
  let slammed = false;
  const r = run(c, kid, 3, (t, body) => {
    if (!slammed && body.mode === 'launched' && body.tumble <= 0) {
      slammed = true;
      return { x: -1, slam: true };
    }
    return { x: slammed ? 0 : -1 };
  }, waves2);
  assert.ok(r.events.some((e) => e.type === 'saved'), 'saved it');
  assert.equal(c.out, false);
});

test('every bed: spawns are on a mattress, and the lookups agree', () => {
  for (const bed of BEDS) {
    assert.equal(bed.spawns.length, 5);
    for (const [x, z] of bed.spawns) {
      const si = surfaceUnder(bed, x, z, 5);
      assert.ok(si >= 0, `${bed.id} spawn on a mattress`);
      assert.ok(edgeDistance(bed, si, x, z) > 0.8, `${bed.id} spawn away from the edge`);
    }
    const [cx, cz, si] = clampToBed(bed, 50, 50);
    assert.ok(si >= 0 && Math.abs(cx) < 6 && Math.abs(cz) < 6);
  }
});

test('the bunk bed: falling off the top bunk front lands on the lower bunk', () => {
  const bunk = bedById('bunk');
  const b = createBody('a', bunk, 0, -1.8, 0, 0.2, 0);
  const { events } = run(b, bunk, 1.5, { z: 1 });
  assert.equal(b.out, false);
  assert.ok(events.some((e) => e.type === 'land' && e.si === 1));
});

test('the four-poster canopy caps the bounce', () => {
  const poster = bedById('poster');
  const b = createBody('a', poster, 0, 0, 0, 0, 0);
  const { maxY, events } = run(b, poster, 4, {}, [], levelAt(80), 75);
  assert.ok(maxY <= 1.86, `capped ${maxY}`);
  assert.ok(events.some((e) => e.type === 'bonk'));
});

test('predicted bodies (authority off) bounce but are never launched or put out', () => {
  const waves = [makeWave({ id: 'w', owner: 'x', x: 0, z: 0, e: 1.5, t0: 0 }, kid)];
  const b = createBody('r', kid, 2.9, 0, 0, 0, 0);
  const events = [];
  const ctx = { bed: kid, waves, level: calm, slamsOn: true, authority: false, events };
  let t = 0;
  for (let i = 0; i < 400; i++) { stepBody(b, { x: 1 }, ctx, t, STEP); t += STEP; }
  assert.equal(events.some((e) => e.type === 'launch' || e.type === 'fall'), false);
  assert.equal(b.out, false);
});
