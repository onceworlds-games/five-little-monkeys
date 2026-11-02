// Bedtime twists: one per round from the second round of a match on, picked from the match and the round so every page
// agrees without a message, and never the same twist twice in a row.
import { TWISTS } from './config.js';
import { createRng } from './rng.js';

/** The twist for round `round` (1-based) of match `matchId`: '' for the first round. */
export function twistFor(matchId, round) {
  if (!(round > 1)) return '';
  let prev = '';
  let pick = '';
  for (let r = 2; r <= round; r++) {
    const rng = createRng(`${matchId}:twist:${r}`);
    const options = TWISTS.filter((t) => t !== prev);
    pick = options[rng.int(options.length)];
    prev = pick;
  }
  return pick;
}

/** The twist's effect on the physics: { reflect (rings bounce back), bonanza (more toys), rain, bouncy, dark }. */
export function twistRules(twist) {
  return {
    reflect: twist === 'echo' ? 0.45 : null,
    bonanza: twist === 'bonanza',
    rain: twist === 'rain',
    bouncy: twist === 'bouncy',
    dark: twist === 'dark',
  };
}

