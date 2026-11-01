// Every tuning number of the game, in one place. Units: 1 u is about a monkey's height (25 cm at toy scale); seconds.

export const STEP = 1 / 120;

export const G = 16;
export const APEX = { base: 1.6, wild: 2.4, over: 2.8, cap: 4.4 };
export const CONTACT = 0.12;
export const MONKEY_H = 0.95;
export const BODY_R = 0.3;

export const STEER = { max: 3.4, accel: 14, decel: 8 };
export const TUMBLE = { accel: 2.5, drag: 0.3, noSlam: 0.25 };

export const RIM = { width: 0.35, apex: 0.8 };
export const FALL_MARGIN = 0.15;
export const WALL_REST = 0.5;

/** above: how fast a slam's energy grows with height above a plain bounce's top (pumped bounces, wild springs). */
export const SLAM = { min: 0.35, windup: 0.07, dive: 14, diveG: 3, side: 0.2, cooldown: 1.2, rebound: 0.85, above: 0.6 };

/**
 * Pumping the bounce: a press near touchdown (time to land at most `good`, or in the mattress up to `good` after
 * touchdown) is graded by how close it came. A press less than `dead` seconds before touchdown that is too early counts
 * as an early pump (a miss), never as a slam. Each tier multiplies the round's apex.
 */
export const PUMP = { perfect: 0.05, good: 0.11, dead: 0.2, tiers: [1, 1.3, 1.6, 1.9], max: 3, super: 1.25 };

/** Dizzy stars: each launch adds one (up to `max`), each star pushes the next launch `push` further; one wears off per `decay` s, and a perfect pump shakes one off. */
export const DIZZY = { max: 3, push: 0.18, decay: 6 };

export const WAVE = {
  speed: (e) => 5.5 + 2.5 * e,
  reach: (e) => 2.6 + 2.4 * e,
  amp: (e) => 0.45 + 0.55 * e,
  half: 0.55,
  rise: 0.6,
  minE: 0.3,
  maxE: 1.8,
};

/** A Mega Slam (the golden banana): more energy, and a ring that reaches and pushes further. */
export const MEGA = { addE: 0.4, maxE: 2.1, amp: 1.12, reach: 1.18, push: 1.1 };

export const LAUNCH = { maxS: 1.8, apex0: 1.0, apexK: 1.6, apexMax: 3.6, push: 2.8, keep: 0.3 };

export const LEVELS = {
  calm: { amp: 1, push: 1 },
  wild: { amp: 1.2, push: 1.15 },
  over: { amp: 1.4, push: 1.3 },
};

export const PILLOW = { every: 4, first: 2, flight: 0.6, aim: 5, e: 0.5 };

/**
 * Toys that drop onto the bed: the golden banana (`mega`), the pillow (`shield`), the spring (`spring`). Each lands `drop`
 * seconds after its shadow appears, stays `life` seconds, and is grabbed by a monkey within `grab` whose feet are under
 * `grabH`. A banana's Mega Slam waits `megaFor` seconds, a pillow `shieldFor`.
 */
export const TOYS = {
  first: 7, every: [9, 13], bonanza: [3, 5], drop: 1.0, life: 11, grab: 0.62, grabH: 0.85, max: 2, maxBonanza: 3,
  edge: 0.75, apart: 1.4, weights: { mega: 0.42, shield: 0.33, spring: 0.25 }, megaFor: 14, shieldFor: 16,
};

/** Bedtime twists, from the second round of a match on. */
export const TWISTS = ['rain', 'dark', 'bonanza', 'bouncy', 'echo'];
export const TWIST_NAMES = { rain: 'PILLOW RAIN', dark: 'LIGHTS OUT', bonanza: 'BANANA BONANZA', bouncy: 'BOUNCY SPRINGS', echo: 'ECHO RINGS' };
export const RAIN = { first: 3, every: [2.4, 3.8], e: 0.6, drop: 1.1 };

export const ROUND = { grace: 2.5, firstGraceBots: 5, wildAt: 40, wildRamp: 3, overAt: 70, endAt: 90, credit: 3, awayOut: 3 };

export const POINTS = { win: 3, knock: 1, survive: 1 };

/** How wild the springs are at round time `t`: { w: 0..1 toward wild, o: 0..1 toward overtime }. */
export function wildness(t) {
  const w = Math.max(0, Math.min(1, (t - ROUND.wildAt) / ROUND.wildRamp));
  const o = Math.max(0, Math.min(1, (t - ROUND.overAt) / ROUND.wildRamp));
  return { w, o };
}

/**
 * The bounce, ring and push multipliers at round time `t` (null: the lobby, always calm). Twist 'bouncy' starts the round
 * with the bounce of wild springs (but calm rings).
 */
export function levelAt(t, twist = '') {
  if (t === null || t === undefined || !Number.isFinite(t)) return { apex: APEX.base, amp: 1, push: 1, w: 0, o: 0 };
  const { w, o } = wildness(t);
  const wa = twist === 'bouncy' ? Math.max(w, 0.6) : w;
  const apex = APEX.base + (APEX.wild - APEX.base) * wa + (APEX.over - APEX.wild) * o;
  const amp = 1 + (LEVELS.wild.amp - 1) * w + (LEVELS.over.amp - LEVELS.wild.amp) * o;
  const push = 1 + (LEVELS.wild.push - 1) * w + (LEVELS.over.push - LEVELS.wild.push) * o;
  return { apex, amp, push, w, o };
}

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
