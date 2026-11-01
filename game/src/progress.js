// A monkey's level (XP from play), tonight's three goals (the same for everyone, from the UTC day), the nightly streak
// and the Bedtime Box. Pure functions over the save, so tests can play out weeks of nights.
import { createRng } from './sim/rng.js';
import { WARDROBE, BOX_ITEMS, unlocksAtLevel } from './wardrobe.js';

export const DAY_MS = 86400000;
/** The UTC day number of a platform time (ms). */
export const dayOf = (ms) => Math.floor(Number(ms) / DAY_MS);

/** XP for each thing a match or a Rush counts. */
export const XP = {
  knock: 30, megaKnock: 15, pillowKnock: 20, dizzyKnock: 10, roundWin: 60, matchWin: 100, outlast: 4, perfect: 1,
  perfectCap: 40, streak5: 10, save: 20, toy: 6, closeCall: 5, played: 20, rushPer: 0.12, goal: 150, boxRepeat: 300,
};
export const MAX_LEVEL = 50;

/** XP to go from `level` to the next. */
export const needFor = (level) => 100 + 50 * level;

/** Level, XP into it and XP it needs, from a total. */
export function levelOf(xp) {
  let level = 1;
  let left = Math.max(0, Math.floor(Number(xp) || 0));
  while (level < MAX_LEVEL && left >= needFor(level)) {
    left -= needFor(level);
    level++;
  }
  return { level, into: left, need: level >= MAX_LEVEL ? 0 : needFor(level) };
}

/** The XP lines for a finished match or run: [{ what, xp }], in the order the results screen counts them. */
export function xpLines(st) {
  const lines = [];
  const add = (what, xp) => {
    if (xp > 0) lines.push({ what, xp: Math.round(xp) });
  };
  add('Played', XP.played);
  add(`Knock-offs ×${st.knocks | 0}`, (st.knocks | 0) * XP.knock);
  add('Golden banana knock-offs', (st.megaKnocks | 0) * XP.megaKnock);
  add('Pillow knock-offs', (st.pillowKnocks | 0) * XP.pillowKnock);
  add('Dizzy knock-offs', (st.dizzyKnocks | 0) * XP.dizzyKnock);
  add(`Rounds won ×${st.roundWins | 0}`, (st.roundWins | 0) * XP.roundWin);
  if (st.matchWin) add('Match won', XP.matchWin);
  add('Monkeys outlasted', (st.outlast | 0) * XP.outlast);
  add('Perfect bounces', Math.min(XP.perfectCap, (st.perfects | 0) * XP.perfect));
  add('Perfect streaks', Math.floor((st.bestStreak | 0) / 5) * XP.streak5);
  add('Saves', (st.saves | 0) * XP.save);
  add('Toys', (st.toys | 0) * XP.toy);
  add('Close calls', (st.closeCalls | 0) * XP.closeCall);
  if (st.rushScore) add("Tonight's Rush", st.rushScore * XP.rushPer);
  return lines;
}

/**
 * Nightly goals: [id, text with {n}, [least, most], how the stat adds up ('sum' or 'max')]. Three a night, picked from the
 * day for everyone.
 */
export const GOALS = [
  ['knock', 'Knock off {n} monkeys', [3, 6], 'sum'],
  ['perfect', 'Land {n} perfect bounces', [25, 50], 'sum'],
  ['streak', 'Chain {n} perfect bounces', [5, 8], 'max'],
  ['win', 'Win {n} rounds', [1, 3], 'sum'],
  ['toys', 'Grab {n} toys', [3, 6], 'sum'],
  ['mega', 'Golden banana knock-offs: {n}', [1, 2], 'sum'],
  ['save', 'Save yourself with a slam {n} times', [1, 3], 'sum'],
  ['pillow', 'Pillow a monkey off the bed', [1, 1], 'sum'],
  ['dizzy', 'Knock off a three-star monkey', [1, 1], 'sum'],
  ['top', 'Slam from the top bounce {n} times', [3, 6], 'sum'],
  ['rush', "Score {n} in Tonight's Rush", [600, 1400], 'max'],
  ['matches', 'Finish {n} matches', [2, 3], 'sum'],
];
const STAT_FOR = { knock: 'knocks', perfect: 'perfects', streak: 'bestStreak', win: 'roundWins', toys: 'toys', mega: 'megaKnocks', save: 'saves', pillow: 'pillowKnocks', dizzy: 'dizzyKnocks', top: 'topSlams', rush: 'rushScore', matches: 'matches' };
// Goals anyone can make progress on in their first match.
const EASY = ['knock', 'perfect', 'toys', 'matches', 'win'];

/** Tonight's three goals: [{ id, text, n, mode }], the same for everyone on day `day`. */
export function goalsFor(day) {
  const rng = createRng(`night:${day}`);
  const pool = GOALS.slice();
  const out = [];
  // One easy goal first, then two from the rest.
  const easy = pool.filter((g) => EASY.includes(g[0]));
  const first = easy[rng.int(easy.length)];
  out.push(first);
  pool.splice(pool.indexOf(first), 1);
  while (out.length < 3) {
    const g = pool.splice(rng.int(pool.length), 1)[0];
    out.push(g);
  }
  return out.map(([id, text, [lo, hi], mode]) => {
    let n = lo + rng.int(hi - lo + 1);
    if (id === 'rush') n = Math.round(n / 100) * 100;
    return { id, text: text.replace('{n}', n), n, mode };
  });
}

/** A fresh progress block for the save. */
export function defaultProgress() {
  return { xp: 0, boxed: [], night: null, streak: { n: 0, last: -1, best: 0 }, rushBest: 0, rush: null, played: 0 };
}

/** Progress read back from storage, field by field. */
export function normalizeProgress(raw) {
  const p = defaultProgress();
  if (!raw || typeof raw !== 'object') return p;
  const xp = Number(raw.xp);
  if (Number.isFinite(xp) && xp >= 0 && xp < 1e9) p.xp = Math.floor(xp);
  if (Array.isArray(raw.boxed)) p.boxed = raw.boxed.filter((k) => BOX_ITEMS.some((i) => i.key === k)).slice(0, 50);
  const n = raw.night;
  if (n && Number.isInteger(n.d) && Array.isArray(n.p) && n.p.length === 3) {
    p.night = { d: n.d, p: n.p.map((v) => (Number.isFinite(v) && v >= 0 ? Math.min(1e6, Math.floor(v)) : 0)), done: [0, 1, 2].map((i) => n.done?.[i] === true), box: n.box === true };
  }
  const s = raw.streak;
  if (s && Number.isInteger(s.n) && Number.isInteger(s.last)) p.streak = { n: Math.max(0, Math.min(9999, s.n)), last: s.last, best: Math.max(0, Math.min(9999, s.best | 0)) };
  const rb = Number(raw.rushBest);
  if (Number.isFinite(rb) && rb >= 0 && rb < 1e7) p.rushBest = Math.floor(rb);
  if (raw.rush && Number.isInteger(raw.rush.d) && Number.isFinite(raw.rush.best)) p.rush = { d: raw.rush.d, best: Math.max(0, Math.floor(raw.rush.best)), runs: Math.max(0, raw.rush.runs | 0) };
  p.played = Math.max(0, Math.floor(Number(raw.played) || 0));
  return p;
}

/** Tonight's goal state for `day` (a new night starts empty). */
export function nightFor(p, day) {
  if (!p.night || p.night.d !== day) p.night = { d: day, p: [0, 0, 0], done: [false, false, false], box: false };
  return p.night;
}

/**
 * Bank a finished match or Rush run into progress. `st`: the counts (knocks, perfects, bestStreak, roundWins, toys,
 * megaKnocks, saves, pillowKnocks, dizzyKnocks, topSlams, rushScore, matches, matchWin, outlast, closeCalls).
 * `stars`: Bedtime Ladder stars (for what's owned). Returns what happened, for the results screen:
 * { lines, xp, before, after (levelOf), unlocks: [items], goals: [{ text, n, was, now, done, just }], box: item|null,
 *   boxXp, streak: { n, grew } }.
 */
export function bankProgress(p, st, day) {
  const lines = xpLines(st);
  const before = levelOf(p.xp);
  let xp = lines.reduce((a, l) => a + l.xp, 0);
  // Tonight's goals.
  const night = nightFor(p, day);
  const goals = goalsFor(day).map((g, i) => {
    const v = Math.max(0, Math.floor(Number(st[STAT_FOR[g.id]]) || 0));
    const was = night.p[i];
    night.p[i] = g.mode === 'max' ? Math.max(was, v) : Math.min(1e6, was + v);
    const now = night.p[i];
    const just = !night.done[i] && now >= g.n;
    if (just) {
      night.done[i] = true;
      xp += XP.goal;
      lines.push({ what: `Goal: ${g.text}`, xp: XP.goal });
    }
    return { text: g.text, n: g.n, was: Math.min(was, g.n), now: Math.min(now, g.n), done: night.done[i], just };
  });
  // The streak: nights in a row with a goal done.
  let grew = false;
  if (night.done.some(Boolean) && p.streak.last !== day) {
    p.streak.n = p.streak.last === day - 1 ? p.streak.n + 1 : 1;
    p.streak.last = day;
    p.streak.best = Math.max(p.streak.best, p.streak.n);
    grew = true;
  }
  // The Bedtime Box: all three goals, once a night.
  let box = null;
  let boxXp = 0;
  if (night.done.every(Boolean) && !night.box) {
    night.box = true;
    box = openBox(p, day);
    if (!box) {
      boxXp = XP.boxRepeat;
      xp += boxXp;
      lines.push({ what: 'Bedtime Box', xp: boxXp });
    }
  }
  p.xp += xp;
  p.played++;
  if (st.rushScore) {
    p.rushBest = Math.max(p.rushBest, st.rushScore | 0);
    if (!p.rush || p.rush.d !== day) p.rush = { d: day, best: 0, runs: 0 };
    p.rush.best = Math.max(p.rush.best, st.rushScore | 0);
    p.rush.runs++;
  }
  const after = levelOf(p.xp);
  // Levels 41 and up each give a Bedtime Box too.
  const unlocks = [];
  for (let L = before.level + 1; L <= after.level; L++) {
    unlocks.push(...unlocksAtLevel(L));
    if (L > 40) {
      const extra = openBox(p, day * 100 + L);
      if (extra) unlocks.push(extra);
    }
  }
  return { lines, xp, before, after, unlocks, goals, box, boxXp, streak: { n: p.streak.n, grew } };
}

/** A box item not owned yet, picked from the day (null when every one is owned). Adds it to `boxed`. */
export function openBox(p, seed) {
  const left = BOX_ITEMS.filter((i) => !p.boxed.includes(i.key));
  if (!left.length) return null;
  const item = left[createRng(`box:${seed}`).int(left.length)];
  p.boxed.push(item.key);
  return item;
}

/** Is the nightly streak still alive on `day` (played yesterday or today)? */
export const streakAlive = (p, day) => p.streak.last >= day - 1;

/** Owned wardrobe keys for a progress block and ladder stars. */
export function ownedKeys(p, stars) {
  const level = levelOf(p.xp).level;
  return WARDROBE.filter((i) => (i.unlock.level ? level >= i.unlock.level : i.unlock.stars ? stars >= i.unlock.stars : i.unlock.box ? p.boxed.includes(i.key) : true)).map((i) => i.key);
}
