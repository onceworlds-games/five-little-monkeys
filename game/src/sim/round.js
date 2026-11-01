// A round's rules: who is still jumping, who scored, how it ends, and the verse each fall plays.
import { POINTS, ROUND } from './config.js';

const WORDS = ['NO MORE', 'ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX'];

/** The banner for `n` monkeys still jumping. */
export function verseFor(n) {
  if (n <= 1) return 'NO MORE MONKEYS JUMPING ON THE BED!';
  return `${WORDS[Math.min(n, 6)]} LITTLE MONKEYS`;
}

/** Seats not yet fallen. */
export function aliveIds(seatIds, falls) {
  const gone = new Set(falls.map((f) => f.id));
  return seatIds.filter((id) => !gone.has(id));
}

/** Add a fall if it's new and valid: `by` only counts for another seat of this round. Returns the fall or null. */
export function addFall(falls, seatIds, { id, by = '', at = 0, how = 'fell', kind = '' }) {
  if (!seatIds.includes(id) || falls.some((f) => f.id === id)) return null;
  const credit = by && by !== id && seatIds.includes(by) ? by : '';
  const fall = { id, by: credit, at: Math.round(Number(at) * 1000) / 1000 || 0, how, kind: kind === 'pillow' ? 'pillow' : kind ? 'slam' : '' };
  falls.push(fall);
  return fall;
}

/** Is the round over: one monkey (or none) left, or the time is up? */
export function roundOver(seatIds, falls, t) {
  return aliveIds(seatIds, falls).length <= 1 || t >= ROUND.endAt;
}

/** The round's points: +3 for the last monkey jumping, +1 per knock-off, +1 each for survivors when the time ran out. */
export function outcomeOf(seatIds, falls, t) {
  const points = Object.fromEntries(seatIds.map((id) => [id, 0]));
  for (const f of falls) if (f.by && f.by in points) points[f.by] += POINTS.knock;
  const alive = aliveIds(seatIds, falls);
  let winner = null;
  if (alive.length === 1) {
    winner = alive[0];
    points[winner] += POINTS.win;
  } else if (alive.length > 1 && t >= ROUND.endAt) {
    for (const id of alive) points[id] += POINTS.survive;
  } else if (alive.length === 0 && falls.length) {
    // Everyone fell at once: the last to fall wins it.
    const last = falls[falls.length - 1];
    winner = last.id;
    points[winner] += POINTS.win;
  }
  return { points, winner };
}
