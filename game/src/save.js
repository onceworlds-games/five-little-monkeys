// The player's progress in ow.save: stars per bed (the Bedtime Ladder), wins, knock-offs, bests, what the monkey wears,
// its level, tonight's goals and streak (progress.js), and the hints already shown.
import { BED_IDS, bedById } from './sim/beds.js';
import { WARDROBE, SLOTS, DEFAULT_LOOK, itemsIn, owns } from './wardrobe.js';
import { defaultProgress, normalizeProgress, levelOf } from './progress.js';

const KEY = 'fl1';

export function defaultSave() {
  return {
    v: 2,
    stars: Object.fromEntries(BED_IDS.map((id) => [id, [0, 0, 0]])),
    won: Object.fromEntries(BED_IDS.map((id) => [id, 0])),
    best: {},
    wins: 0,
    rounds: 0,
    knockoffs: 0,
    matches: 0,
    look: { ...DEFAULT_LOOK },
    progress: defaultProgress(),
    bed: 'kid',
    hints: {},
    played: false,
  };
}

/** A save read back from storage, checked field by field. */
export function normalizeSave(raw) {
  const s = defaultSave();
  if (!raw || typeof raw !== 'object') return s;
  for (const id of BED_IDS) {
    const st = raw.stars?.[id];
    if (Array.isArray(st)) s.stars[id] = [0, 1, 2].map((i) => (st[i] ? 1 : 0));
    const w = Number(raw.won?.[id]);
    if (Number.isFinite(w) && w >= 0) s.won[id] = Math.floor(w);
    const b = Number(raw.best?.[id]);
    if (Number.isFinite(b) && b > 0 && b < 1000) s.best[id] = b;
  }
  for (const k of ['wins', 'rounds', 'knockoffs', 'matches']) {
    const n = Number(raw[k]);
    if (Number.isFinite(n) && n >= 0) s[k] = Math.floor(n);
  }
  // The look: each slot a known item (a version 1 save had only its pyjama pattern).
  const look = raw.look && typeof raw.look === 'object' ? raw.look : { pj: raw.pattern };
  for (const slot of SLOTS) if (itemsIn(slot).some((i) => i.id === look[slot])) s.look[slot] = look[slot];
  s.progress = normalizeProgress(raw.progress);
  if (BED_IDS.includes(raw.bed)) s.bed = raw.bed;
  if (raw.hints && typeof raw.hints === 'object') for (const [k, v] of Object.entries(raw.hints)) if (typeof v === 'number' && k.length < 20) s.hints[k] = v;
  s.played = raw.played === true;
  return s;
}

export const starCount = (s) => Object.values(s.stars).reduce((n, st) => n + st.reduce((a, b) => a + b, 0), 0);

/** A bed is open when it's the first, or the one before it was won. */
export function bedOpen(s, id) {
  const i = BED_IDS.indexOf(id);
  if (i <= 0) return true;
  return s.stars[BED_IDS[i - 1]][0] === 1;
}

/** What the player has to unlock things with: { level, stars, boxed }. */
export const ownership = (s) => ({ level: levelOf(s.progress.xp).level, stars: starCount(s), boxed: s.progress.boxed });

/** The look to wear: the saved one, with anything no longer owned put back to the slot's first item. */
export function wornLook(s) {
  const own = ownership(s);
  const out = {};
  for (const slot of SLOTS) {
    const item = itemsIn(slot).find((i) => i.id === s.look[slot]);
    out[slot] = item && owns(item, own) ? item.id : itemsIn(slot)[0].id;
  }
  return out;
}

export async function loadSave(ow) {
  try {
    return normalizeSave(await ow?.save?.get(KEY));
  } catch {
    return defaultSave();
  }
}

export function writeSave(ow, s) {
  try {
    ow?.save?.set(KEY, s)?.catch?.(() => {});
  } catch {
    // Saving is best effort.
  }
}

/**
 * Bank a finished match. `match`: { bed, place (1 = won), roundsWon: [{ untouched, seconds }], knockoffs }.
 * Returns what's new: { stars: [index...], unlocked: bedId|null, best: seconds|null, patterns: [ids] }.
 */
export function bankMatch(s, match) {
  const news = { stars: [], unlocked: null, best: null, patterns: [] };
  const id = BED_IDS.includes(match.bed) ? match.bed : 'kid';
  const before = starCount(s);
  const st = s.stars[id];
  const nextBed = BED_IDS[BED_IDS.indexOf(id) + 1];
  const wasOpen = nextBed ? bedOpen(s, nextBed) : true;
  if (match.place === 1 && !st[0]) {
    st[0] = 1;
    news.stars.push(0);
  }
  for (const r of match.roundsWon ?? []) {
    if (r.untouched && !st[1]) {
      st[1] = 1;
      news.stars.push(1);
    }
    if (r.seconds > 0 && r.seconds < quickFor(id) && !st[2]) {
      st[2] = 1;
      news.stars.push(2);
    }
    if (r.seconds > 0 && (!s.best[id] || r.seconds < s.best[id])) {
      s.best[id] = Math.round(r.seconds * 10) / 10;
      news.best = s.best[id];
    }
  }
  if (match.place === 1) {
    s.wins++;
    s.won[id] = (s.won[id] ?? 0) + 1;
  }
  s.matches++;
  s.rounds += (match.roundsWon ?? []).length;
  s.knockoffs += Math.max(0, Math.floor(match.knockoffs ?? 0));
  if (nextBed && !wasOpen && bedOpen(s, nextBed)) news.unlocked = nextBed;
  const after = starCount(s);
  for (const i of WARDROBE) if (i.unlock.stars > before && i.unlock.stars <= after) news.patterns.push(i.key);
  return news;
}

export const quickFor = (id) => bedById(id).quick;
