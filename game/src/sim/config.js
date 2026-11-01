// Every tuning number of the game, in one place. Units: 1 u is about a monkey's height; seconds.

export const STEP = 1 / 120;

export const G = 16;
export const APEX = { base: 1.6, wild: 2.6, over: 3.0 };
export const CONTACT = 0.12;
export const MONKEY_H = 0.95;
export const BODY_R = 0.3;

export const STEER = { max: 3.4, accel: 14, decel: 8 };
export const TUMBLE = { accel: 2.5, drag: 0.3, noSlam: 0.25 };

export const RIM = { width: 0.35, apex: 0.8 };
export const FALL_MARGIN = 0.15;
export const WALL_REST = 0.5;

export const SLAM = { min: 0.35, windup: 0.07, dive: 14, diveG: 3, side: 0.2, cooldown: 1.2, rebound: 0.85 };

export const WAVE = {
  speed: (e) => 5.5 + 2.5 * e,
  reach: (e) => 2.6 + 2.4 * e,
  amp: (e) => 0.45 + 0.55 * e,
  half: 0.55,
  rise: 0.6,
  minE: 0.3,
  maxE: 1.8,
};

export const LAUNCH = { maxS: 1.8, apex0: 1.0, apexK: 1.6, apexMax: 3.6, push: 4.0, keep: 0.3 };

export const LEVELS = {
  calm: { amp: 1, push: 1 },
  wild: { amp: 1.2, push: 1.15 },
  over: { amp: 1.4, push: 1.3 },
};

export const PILLOW = { every: 4, first: 2, flight: 0.6, aim: 5, e: 0.5 };

export const ROUND = { grace: 2.5, firstGraceBots: 5, wildAt: 40, wildRamp: 3, overAt: 70, endAt: 90, credit: 3, awayOut: 3 };

export const POINTS = { win: 3, knock: 1, survive: 1 };

/** How wild the springs are at round time `t`: { w: 0..1 toward wild, o: 0..1 toward overtime }. */
export function wildness(t) {
  const w = Math.max(0, Math.min(1, (t - ROUND.wildAt) / ROUND.wildRamp));
  const o = Math.max(0, Math.min(1, (t - ROUND.overAt) / ROUND.wildRamp));
  return { w, o };
}

/** The bounce, ring and push multipliers at round time `t` (null: the lobby, always calm). */
export function levelAt(t) {
  if (t === null || t === undefined || !Number.isFinite(t)) return { apex: APEX.base, amp: 1, push: 1, w: 0, o: 0 };
  const { w, o } = wildness(t);
  const apex = APEX.base + (APEX.wild - APEX.base) * w + (APEX.over - APEX.wild) * o;
  const amp = 1 + (LEVELS.wild.amp - 1) * w + (LEVELS.over.amp - LEVELS.wild.amp) * o;
  const push = 1 + (LEVELS.wild.push - 1) * w + (LEVELS.over.push - LEVELS.wild.push) * o;
  return { apex, amp, push, w, o };
}

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
