// Monkey levels, the wardrobe, tonight's goals, the streak, the Bedtime Box and Tonight's Rush.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { levelOf, needFor, xpLines, goalsFor, bankProgress, defaultProgress, normalizeProgress, ownedKeys, dayOf, DAY_MS, MAX_LEVEL, XP } from '../game/src/progress.js';
import { WARDROBE, SLOTS, itemsIn, unlocksAtLevel, lookToIndexes, lookFromIndexes, DEFAULT_LOOK, BOX_ITEMS } from '../game/src/wardrobe.js';
import { createRush, rushFor, RUSH } from '../game/src/sim/rush.js';
import { createBrain } from '../game/src/sim/brain.js';
import { BED_IDS } from '../game/src/sim/beds.js';
import { levelAt } from '../game/src/sim/config.js';

test('levels: the curve climbs, and every level from 2 to 40 opens exactly one thing', () => {
  assert.equal(levelOf(0).level, 1);
  assert.equal(levelOf(needFor(1)).level, 2);
  assert.equal(levelOf(needFor(1) - 1).level, 1);
  let total = 0;
  for (let L = 1; L < MAX_LEVEL; L++) total += needFor(L);
  assert.equal(levelOf(total).level, MAX_LEVEL);
  assert.equal(levelOf(total * 3).level, MAX_LEVEL);
  for (let L = 2; L <= 40; L++) assert.equal(unlocksAtLevel(L).length, 1, `level ${L}`);
  const keys = new Set(WARDROBE.map((i) => i.key));
  assert.equal(keys.size, WARDROBE.length, 'unique items');
});

test('a typical match is worth a level early on, and level 20 takes weeks of evenings', () => {
  const match = { knocks: 3, roundWins: 1, matchWin: false, outlast: 6, perfects: 30, bestStreak: 6, toys: 3, saves: 1, closeCalls: 1 };
  const xp = xpLines(match).reduce((a, l) => a + l.xp, 0);
  assert.ok(xp >= needFor(1) && xp <= needFor(1) * 3, `a match ${xp} XP`);
  let need = 0;
  for (let L = 1; L < 20; L++) need += needFor(L);
  const matches = need / xp;
  assert.ok(matches > 30 && matches < 90, `${matches.toFixed(0)} matches to level 20`);
});

test('the look travels as indexes and comes back the same; anything odd falls back', () => {
  const look = { pj: 'clouds', hat: 'crown', thread: 'rainbow', trail: 'zzz', dance: 'worm' };
  assert.deepEqual(lookFromIndexes(lookToIndexes(look)), look);
  assert.deepEqual(lookFromIndexes([999, -1, 'x', null]), DEFAULT_LOOK);
  for (const s of SLOTS) assert.ok(itemsIn(s).length >= 7, s);
});

test('nightly goals: three, the same for everyone on a night, different from night to night, one easy', () => {
  const day = dayOf(Date.UTC(2026, 10, 1));
  const a = goalsFor(day);
  assert.equal(a.length, 3);
  assert.deepEqual(a, goalsFor(day));
  assert.equal(new Set(a.map((g) => g.id)).size, 3);
  let differ = 0;
  for (let d = day; d < day + 30; d++) if (JSON.stringify(goalsFor(d)) !== JSON.stringify(goalsFor(d + 1))) differ++;
  assert.equal(differ, 30);
  for (let d = day; d < day + 60; d++) assert.ok(['knock', 'perfect', 'toys', 'matches', 'win'].includes(goalsFor(d)[0].id));
});

test('banking: goals tick, XP and levels add up, all three goals open the Bedtime Box once a night, the streak counts nights', () => {
  const p = defaultProgress();
  const day = 20400;
  const goals = goalsFor(day);
  const huge = { knocks: 50, perfects: 200, bestStreak: 20, roundWins: 10, toys: 20, megaKnocks: 5, saves: 5, pillowKnocks: 2, dizzyKnocks: 3, topSlams: 10, rushScore: 5000, matches: 5 };
  const r = bankProgress(p, huge, day);
  assert.ok(r.goals.every((g) => g.done && g.just), JSON.stringify(r.goals));
  assert.ok(r.box && BOX_ITEMS.includes(r.box));
  assert.equal(r.streak.n, 1);
  assert.ok(r.after.level > r.before.level);
  assert.ok(r.unlocks.length >= r.after.level - r.before.level);
  assert.equal(p.xp, r.xp);
  assert.ok(r.lines.filter((l) => l.what.startsWith('Goal')).length === 3);
  // Same night again: no second box, no more goal XP, the streak holds.
  const r2 = bankProgress(p, huge, day);
  assert.equal(r2.box, null);
  assert.ok(r2.goals.every((g) => g.done && !g.just));
  assert.equal(r2.streak.n, 1);
  // Next night: the streak grows; a skipped night starts it over.
  const small = { knocks: 6, perfects: 50, toys: 6, matches: 3, roundWins: 3, bestStreak: 8 };
  bankProgress(p, small, day + 1);
  assert.equal(p.streak.n, 2);
  bankProgress(p, small, day + 3);
  assert.equal(p.streak.n, 1);
  assert.equal(p.streak.best, 2);
  assert.equal(goals.length, 3);
});

test('the box gives each exclusive once, then XP', () => {
  const p = defaultProgress();
  const huge = { knocks: 50, perfects: 200, bestStreak: 20, roundWins: 10, toys: 20, megaKnocks: 5, saves: 5, pillowKnocks: 2, dizzyKnocks: 3, topSlams: 10, rushScore: 5000, matches: 5 };
  const got = new Set();
  for (let d = 0; d < BOX_ITEMS.length + 3; d++) {
    const r = bankProgress(p, huge, 20400 + d);
    if (r.box) got.add(r.box.key);
    else assert.equal(r.boxXp, XP.boxRepeat);
  }
  assert.equal(got.size, BOX_ITEMS.length);
  p.xp = 1e8;
  assert.equal(ownedKeys(p, 15).length, WARDROBE.length, 'everything owned at the top with all stars');
});

test('progress from storage is checked field by field', () => {
  const p = normalizeProgress({ xp: -5, boxed: ['pj:glow', 'pj:plain', 'nope'], night: { d: 3, p: [1, 'x', -2], done: [true] }, streak: { n: 4, last: 9, best: 7 }, rushBest: 'lots' });
  assert.equal(p.xp, 0);
  assert.deepEqual(p.boxed, ['pj:glow']);
  assert.deepEqual(p.night.p, [1, 0, 0]);
  assert.deepEqual(p.night.done, [true, false, false]);
  assert.equal(p.streak.n, 4);
  assert.equal(p.rushBest, 0);
  assert.deepEqual(normalizeProgress(null), defaultProgress());
  assert.equal(dayOf(DAY_MS * 5 + 10), 5);
});

function playRush(day, skill) {
  const r = createRush({ day });
  const brain = createBrain('pro', skill, `p${day}`);
  const a = r.arena;
  const seen = new Set();
  while (!r.over) {
    const me = a.bodies.find((b) => b.id === 'me');
    const world = { bed: a.bed, bodies: a.bodies, waves: a.waves, level: levelAt(a.t, r.info.twist), slamsOn: true, leader: '', alive: a.bodies.length, toys: a.liveToys(a.t) };
    r.step(me && !me.out ? brain.act(me, world, a.t) : {});
    for (const e of r.events) seen.add(e.type);
    assert.ok(a.bodies.length <= RUSH.botsLate + 1);
  }
  return { r, seen };
}

test("Tonight's Rush: the same for everyone on a night, three bandages, monkeys keep climbing on, knock-offs score", () => {
  assert.deepEqual(rushFor(20400), rushFor(20400));
  const beds = new Set();
  for (let d = 20400; d < 20440; d++) beds.add(rushFor(d).bed);
  assert.equal(beds.size, BED_IDS.length);
  const { r, seen } = playRush(20402, 0.6);
  assert.equal(r.bandages, 0);
  assert.ok(seen.has('hurt') && seen.has('back') && seen.has('climb') && seen.has('over'));
  assert.ok(r.arena.t > 30 && r.arena.t < RUSH.maxT, `run ${r.arena.t.toFixed(0)} s`);
  assert.ok(r.seq > RUSH.bots, 'more monkeys climbed on');
  assert.equal(r.stats.rushScore, r.score);
  // The same inputs give the same run.
  const again = playRush(20402, 0.6).r;
  assert.equal(again.score, r.score);
  assert.equal(again.arena.t, r.arena.t);
});

test('the Rush rewards skill: a sharp player scores more than a clumsy one over many nights', () => {
  let sharp = 0;
  let clumsy = 0;
  for (let d = 20400; d < 20410; d++) {
    sharp += playRush(d, 0.9).r.score;
    clumsy += playRush(d, 0.15).r.score;
  }
  assert.ok(sharp > clumsy * 1.3, `sharp ${sharp} vs clumsy ${clumsy}`);
});
