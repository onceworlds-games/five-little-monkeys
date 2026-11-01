// Everything another page sends is checked before it touches the bed; saves are read defensively.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkSlam, checkPillow, checkSample, checkPresence, rateGate, acceptMessage, slamMessage, pillowMessage } from '../game/src/protocol.js';
import { bedById } from '../game/src/sim/beds.js';
import { normalizeSave, defaultSave, bankMatch, bedOpen, starCount } from '../game/src/save.js';
import { createReferee } from '../game/src/referee.js';

const bed = bedById('kid');
const s0 = bed.surfaces[0];
const slam = (o = {}) => ({ t: 's', n: 7, x: s0.cx, z: s0.cz, si: 0, e: 1, at: 10.2, t0: 10, y0: 1.8, vx: 0.5, vz: -0.5, ...o });
const pillow = (o = {}) => ({ t: 'p', n: 8, fx: s0.cx, fz: s0.z1 + 1.5, x: s0.cx, z: s0.cz, si: 0, at: 10.5, ...o });
const sample = () => ['a', s0.cx, s0.cz, 1.2, 0.1, -0.2, 3, 0, 0, 0.12, 0, 0, s0.cx, s0.cz, 0];

test('slam messages: good ones pass as clean copies, anything odd is dropped', () => {
  const ok = checkSlam(slam(), bed, 10);
  assert.ok(ok);
  assert.equal(ok.t, undefined, 'a clean copy');
  assert.equal(checkSlam(slam({ extra: 'x' }), bed, 10).extra, undefined);
  for (const bad of [
    null, 'slam', 42, [], { t: 'p' },
    slam({ n: -1 }), slam({ n: 1.5 }), slam({ x: NaN }), slam({ x: Infinity }), slam({ z: '1' }),
    slam({ x: 999 }), slam({ si: 9 }), slam({ si: -2 }), slam({ e: 5 }), slam({ e: -1 }),
    slam({ at: 50 }), slam({ at: 2 }), slam({ t0: 11 }), slam({ t0: 8 }), slam({ y0: 99 }),
    slam({ vx: 40 }), slam({ x: s0.x1 + 2 }), slam({ e: 0.1 }), slam({ b: 'no spaces allowed' }), slam({ b: 3 }),
  ]) assert.equal(checkSlam(bad, bed, 10), null, JSON.stringify(bad));
  // A slam from the floor side (si -1) may land beside the bed.
  assert.ok(checkSlam(slam({ si: -1, x: s0.x1 + 1, e: 0.2, y0: bed.floor + 1 }), bed, 10));
});

test('pillow messages and presence samples are checked field by field', () => {
  assert.ok(checkPillow(pillow(), bed, 10));
  for (const bad of [pillow({ si: -1 }), pillow({ x: s0.x1 + 1 }), pillow({ at: 30 }), pillow({ fx: NaN }), pillow({ n: 'a' }), { t: 's' }]) {
    assert.equal(checkPillow(bad, bed, 10), null, JSON.stringify(bad));
  }
  assert.ok(checkSample(sample(), bed));
  const broken = [
    sample().slice(1), [...sample(), 1], ['z', ...sample().slice(1)],
    Object.assign(sample(), { 1: NaN }), Object.assign(sample(), { 3: 99 }), Object.assign(sample(), { 7: 3 }),
    Object.assign(sample(), { 10: 2 }), Object.assign(sample(), { 11: -1 }), Object.assign(sample(), { 14: 7 }),
  ];
  for (const bad of broken) assert.equal(checkSample(bad, bed), null, JSON.stringify(bad));
});

test('presence: a clean copy, bad samples dropped, at most five bots', () => {
  const p = { v: 1, s: 'in', r: 'r1', t: 12.5, p: 2, m: sample(), b: [['bot:1', ...sample()], ['bad id!', ...sample()], ['bot:2', 'junk']] };
  const c = checkPresence(p, bed, 6);
  assert.equal(c.s, 'in');
  assert.equal(c.b.length, 1);
  assert.equal(c.b[0][0], 'bot:1');
  assert.equal(checkPresence({ ...p, p: 99 }, bed, 6).p, 0, 'unknown pattern: plain');
  assert.equal(checkPresence({ ...p, m: ['x'] }, bed, 6).m, null);
  for (const bad of [null, {}, { ...p, v: 2 }, { ...p, s: 'dancing' }, { ...p, r: 5 }, { ...p, t: NaN }, { ...p, r: 'x'.repeat(200) }]) {
    assert.equal(checkPresence(bad, bed, 6), null);
  }
  const many = { ...p, b: Array.from({ length: 9 }, (_, i) => [`bot:${i}`, ...sample()]) };
  assert.equal(checkPresence(many, bed, 6).b.length, 5);
});

test('rate gates: one per gap per sender, and a new round (time going back) resets', () => {
  const gate = rateGate(0.9);
  assert.equal(gate('a', 10), true);
  assert.equal(gate('a', 10.5), false);
  assert.equal(gate('b', 10.5), true, 'per sender');
  assert.equal(gate('a', 10.95), true);
  assert.equal(gate('a', 1), true, 'a new round starts its clock at 0');
});

test('the messages this page sends pass the checks another page makes', () => {
  const plan = { x: s0.cx + 0.12345, z: s0.cz, si: 0, e: 1.234567, at: 10.2, t0: 10, y0: 1.8, vx: 0.3, vz: 0 };
  const m = slamMessage('bot:1', 5, plan, true);
  assert.equal(m.b, 'bot:1');
  assert.equal(m.x, Math.round((s0.cx + 0.12345) * 1000) / 1000);
  assert.ok(checkSlam(JSON.parse(JSON.stringify(m)), bed, 10));
  const pm = pillowMessage('ann', 6, { fx: s0.cx, fz: s0.z1 + 1, x: s0.cx, z: s0.cz, si: 0, at: 10.6 }, false);
  assert.equal(pm.b, undefined);
  assert.ok(checkPillow(JSON.parse(JSON.stringify(pm)), bed, 10));
});

test('who may say what: bots speak only through the host, latecomers only in the lobby, pillows only in a round', () => {
  const seats = [{ id: 'ann', bot: false }, { id: 'bo', bot: false }, { id: 'bot:1', bot: true }];
  const room = (o = {}) => ({ host: 'ann', seats, inRound: true, bed, now: 10, slamGate: rateGate(0.9), pillowGate: rateGate(3.3), ...o });
  assert.deepEqual(acceptMessage(slam(), 'bo', room()).owner, 'bo');
  assert.equal(acceptMessage(slam({ b: 'bot:1' }), 'ann', room()).owner, 'bot:1', 'the host speaks for its bot');
  assert.equal(acceptMessage(slam({ b: 'bot:1' }), 'bo', room()), null, 'a guest cannot speak for a bot');
  assert.equal(acceptMessage(slam({ b: 'bo' }), 'ann', room()), null, 'the host cannot speak for a player');
  assert.equal(acceptMessage(slam(), 'cy', room()), null, 'a latecomer watches the round');
  assert.ok(acceptMessage(slam(), 'cy', room({ inRound: false })), 'and bounces with everyone in the lobby');
  assert.ok(acceptMessage(pillow(), 'bo', room()));
  assert.equal(acceptMessage(pillow(), 'bo', room({ inRound: false })), null);
  assert.equal(acceptMessage({ $ow: 1, t: 's' }, 'bo', room()), null, 'platform messages are not ours');
  assert.equal(acceptMessage(slam(), '', room()), null);
  assert.equal(acceptMessage(slam(), 'bo', room({ now: null })), null, 'no bed running here');
  const r = room();
  assert.ok(acceptMessage(slam(), 'bo', r));
  assert.equal(acceptMessage(slam({ n: 9, at: 10.4, t0: 10.2 }), 'bo', r), null, 'one slam per 0.9 s');
});

test('the referee: credit only for a seat that acted in the last 4 s, one fall each, only in a round', () => {
  const seats = ['ann', 'bo', 'bot:1'].map((id) => ({ id, bot: id.startsWith('bot:') }));
  const fakeMatch = (phase = 'round') => {
    const m = { phase, seats, data: { falls: [] }, setData: (fn) => fn(m.data), endRound: (p) => (m.ended = p) };
    return m;
  };
  const m = fakeMatch();
  const ref = createReferee();
  ref.acted('bo', 9);
  assert.equal(ref.fall(m, 10, { id: 'ann', by: 'bo', at: 10, kind: 'slam' }), true);
  assert.deepEqual(m.data.falls[0], { id: 'ann', by: 'bo', at: 10, how: 'fell', kind: 'slam' });
  assert.equal(ref.fall(m, 11, { id: 'ann', by: 'bo', at: 11 }), false, 'once');
  assert.equal(ref.fall(m, 11, { id: 'nobody', at: 11 }), false, 'not a seat');
  ref.acted('ann', 2);
  assert.equal(ref.fall(m, 12, { id: 'bot:1', by: 'ann', at: 12, kind: 'slam' }), true);
  assert.equal(m.data.falls[1].by, '', 'ann last slammed 10 s before: no credit');
  assert.equal(m.data.falls[1].kind, '');
  assert.equal(m.ended, undefined, 'falls are recorded; the tick ends the round');
  const out = ref.tick(m, 12.1, 12100);
  assert.equal(out.winner, 'bo');
  assert.ok(m.ended, 'one left: the round ends');
  assert.equal(m.data.winner, 'bo');
  assert.equal(m.ended.bo, 3 + 1, 'last one jumping +3, a knock-off +1');
  assert.equal(ref.fall(fakeMatch('lobby'), 1, { id: 'bo' }), false);
  const m2 = fakeMatch();
  ref.acted('bo', 20);
  ref.fall(m2, 20, { id: 'bo', by: 'bo', at: 20, kind: 'slam' });
  assert.equal(m2.data.falls[0].by, '', 'knocking yourself off is no credit');
  ref.acted('bot:1', 30);
  ref.fall(m2, 25, { id: 'ann', by: 'bot:1', at: 25, kind: 'slam' });
  assert.equal(m2.data.falls[1].by, '', 'a slam after the fall is no credit');
});

test('saves: anything odd in a stored save falls back to the default, and a match banks once into it', () => {
  for (const raw of [null, 'x', 5, [], { stars: 'no' }, { wins: -5, knockoffs: NaN, pattern: '<b>', stars: { kid: [1, 1, 1, 1, 1] } }]) {
    const s = normalizeSave(raw);
    assert.equal(typeof s.wins, 'number');
    assert.ok(s.wins >= 0 && Number.isFinite(s.knockoffs));
    assert.ok(bedOpen(s, 'kid'));
    assert.ok(starCount(s) <= 15);
  }
  const s = defaultSave();
  const news = bankMatch(s, { bed: 'kid', place: 1, roundsWon: [{ untouched: true, seconds: 31 }, { untouched: false, seconds: 12 }], knockoffs: 4 });
  assert.deepEqual(news.stars, [0, 1, 2]);
  assert.equal(news.unlocked, 'bunk');
  assert.equal(news.best, 12);
  assert.ok(bedOpen(s, 'bunk'));
  assert.deepEqual(bankMatch(s, { bed: 'kid', place: 1, roundsWon: [{ untouched: true, seconds: 5 }], knockoffs: 0 }).stars, [], 'stars come once');
  assert.equal(s.wins, 2);
  assert.equal(s.knockoffs, 4);
  assert.deepEqual(normalizeSave(JSON.parse(JSON.stringify(s))), s, 'round trip');
});
