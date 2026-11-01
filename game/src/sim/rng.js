// Seeded randomness: the same numbers on every page and in tests.

/** A 32-bit hash of a string (FNV-1a). */
export function hash(text) {
  let h = 2166136261 >>> 0;
  const s = String(text);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

/** mulberry32: a small, fast generator. `seed` is a number or a string. */
export function createRng(seed = 1) {
  let a = (typeof seed === 'number' ? seed : hash(seed)) >>> 0 || 1;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    range: (lo, hi) => lo + (hi - lo) * next(),
    int: (n) => Math.floor(next() * n),
    pick: (list) => list[Math.floor(next() * list.length)],
    chance: (p) => next() < p,
    /** Roughly normal, mean 0, deviation 1. */
    gauss: () => (next() + next() + next() + next() - 2) * 1.732,
  };
}
