// Whole rounds played by bots, many seeds per bed: the numbers DESIGN.md promises.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BEDS, bedById } from '../game/src/sim/beds.js';
import { createArena } from '../game/src/sim/arena.js';
import { ROUND } from '../game/src/sim/config.js';

const CAST = ['rumble', 'tiptoe', 'mimic', 'dozy'];

function rounds(bed, n, seatsFor) {
  const out = { times: [], first: [], wins: {}, points: {}, falls: 0, credited: 0, pillow: 0, wildWinsByDozy: 0 };
  for (let s = 0; s < n; s++) {
    const seats = seatsFor(s);
    const rot = s % seats.length;
    const a = createArena({ bed, seats: seats.slice(rot).concat(seats.slice(0, rot)), seed: `${bed.id}:${s}` }).run();
    assert.ok(a.done, 'the round ended');
    for (const b of a.bodies) for (const v of [b.x, b.y, b.z]) assert.ok(Number.isFinite(v), 'no NaN');
    out.times.push(a.t);
    if (a.falls.length) out.first.push(a.falls[0].at);
    if (a.winner) out.wins[a.winner] = (out.wins[a.winner] ?? 0) + 1;
    for (const [id, p] of Object.entries(a.outcome.points)) out.points[id] = (out.points[id] ?? 0) + p;
    for (const f of a.falls) {
      out.falls++;
      if (f.by) out.credited++;
      if (f.by && f.kind === 'pillow') out.pillow++;
    }
  }
  out.times.sort((x, y) => x - y);
  out.first.sort((x, y) => x - y);
  return out;
}
const median = (arr) => arr[Math.floor(arr.length / 2)];
const p90 = (arr) => arr[Math.floor(arr.length * 0.9)];
const share = (r, id, n) => (r.wins[id] ?? 0) / n;

for (const bed of BEDS) {
  test(`${bed.name}: rounds last 35-55 s (90% under 75 s, all by 90 s), first fall early, falls come from play`, () => {
    const mid = (bed.skill[0] + bed.skill[1]) / 2;
    const n = 150;
    const r = rounds(bed, n, () => [...CAST, 'pro'].map((k, i) => ({ id: `${k}`, kind: k, skill: mid })));
    assert.ok(median(r.times) >= 35 && median(r.times) <= 55, `median ${median(r.times).toFixed(1)}`);
    assert.ok(p90(r.times) <= 75, `p90 ${p90(r.times).toFixed(1)}`);
    assert.ok(r.times.at(-1) <= ROUND.endAt + 0.01);
    assert.ok(median(r.first) >= 4 && median(r.first) <= 20, `first fall ${median(r.first).toFixed(1)}`);
    assert.ok(r.credited / r.falls >= 0.75, 'credited falls');
    assert.ok(r.pillow / Math.max(1, r.credited) <= 0.3, `pillow share ${(r.pillow / r.credited).toFixed(2)}`);
    for (const k of [...CAST, 'pro']) {
      const s = share(r, k, n);
      assert.ok(s >= 0.08 && s <= 0.4, `${k} wins ${(s * 100).toFixed(0)}%`);
    }
  });
}

test('no seat or spawn advantage: equal bots win about equally', () => {
  const n = 300;
  const r = rounds(bedById('kid'), n, () => [0, 1, 2, 3, 4].map((i) => ({ id: `p${i}`, kind: 'pro', skill: 0.5 })));
  for (let i = 0; i < 5; i++) {
    const s = share(r, `p${i}`, n);
    assert.ok(s >= 0.13 && s <= 0.27, `p${i} wins ${(s * 100).toFixed(0)}%`);
  }
});

test('skill matters: one sharp bot wins far more rounds and points than four clumsy ones', () => {
  const n = 200;
  const r = rounds(bedById('kid'), n, () => [0.9, 0.4, 0.4, 0.4, 0.4].map((skill, i) => ({ id: `p${i}`, kind: 'pro', skill })));
  assert.ok(share(r, 'p0', n) >= 0.3, `sharp wins ${(share(r, 'p0', n) * 100).toFixed(0)}% of rounds`);
  const others = [1, 2, 3, 4].map((i) => r.points[`p${i}`]).reduce((a, b) => a + b) / 4;
  assert.ok(r.points.p0 >= others * 1.4, `sharp scores ${r.points.p0} vs ${others}`);
  for (let i = 1; i < 5; i++) assert.ok(share(r, `p${i}`, n) > 0.02, 'a clumsy bot still wins sometimes');
});

test("a beginner wins sometimes on the Kid's Bed", () => {
  const n = 200;
  const bed = bedById('kid');
  const r = rounds(bed, n, () => [{ id: 'me', kind: 'novice', skill: 0.1 }, ...CAST.map((k, i) => ({ id: k, kind: k, skill: bed.skill[0] + (i / 3) * (bed.skill[1] - bed.skill[0]) }))]);
  const s = share(r, 'me', n);
  assert.ok(s >= 0.1 && s <= 0.4, `beginner wins ${(s * 100).toFixed(0)}%`);
});

test('Dozy wakes up dangerous: most of his knock-offs come late', () => {
  const bed = bedById('kid');
  let early = 0, late = 0;
  for (let s = 0; s < 150; s++) {
    const a = createArena({ bed, seats: CAST.concat('pro').map((k) => ({ id: k, kind: k, skill: 0.4 })), seed: `dozy:${s}` }).run();
    const alive = (i) => 5 - i;
    a.falls.forEach((f, i) => {
      if (f.by !== 'dozy') return;
      if (f.at >= ROUND.wildAt || alive(i) <= 3) late++;
      else early++;
    });
  }
  assert.ok(late > early, `late ${late}, early ${early}`);
});

test('camping in the middle and never slamming loses on points', () => {
  const n = 200;
  const r = rounds(bedById('kid'), n, () => [{ id: 'camper', kind: 'camper', skill: 0.5 }, ...[1, 2, 3, 4].map((i) => ({ id: `p${i}`, kind: 'pro', skill: 0.5 }))]);
  assert.ok(share(r, 'camper', n) <= 0.32, `camper round wins ${(share(r, 'camper', n) * 100).toFixed(0)}%`);
  const active = [1, 2, 3, 4].map((i) => r.points[`p${i}`]).reduce((a, b) => a + b) / 4;
  assert.ok(r.points.camper < active, `camper ${r.points.camper} vs active ${active}`);
});

test('the first round is gentler: bots hold their slams for the first seconds', () => {
  const a = createArena({ bed: bedById('kid'), seats: CAST.map((k) => ({ id: k, kind: k, skill: 0.5 })).concat({ id: 'me', kind: 'none' }), seed: 3, firstRound: true });
  let slams = 0;
  while (a.t < ROUND.firstGraceBots - 0.05) {
    a.step({ me: { x: 0, z: 0 } });
    slams += a.events.filter((e) => e.type === 'slam').length;
  }
  assert.equal(slams, 0);
});
