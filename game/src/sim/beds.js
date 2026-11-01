// The five beds: their mattresses, walls, posts and canopy, and how each changes the physics. Pure data plus lookups.
import { FALL_MARGIN } from './config.js';

// Every side is an edge. The headboard is a low lip: it stops a monkey whose feet are under it, and a launched monkey flies
// over it and falls behind the bed.
const OPEN = { x0: true, x1: true, z0: true, z1: true };

function bed(def) {
  const surfaces = def.surfaces.map((s, i) => ({ ...s, i, cx: (s.x0 + s.x1) / 2, cz: (s.z0 + s.z1) / 2 }));
  const b = { floor: -1.4, walls: [], posts: [], ceiling: null, lowZones: [], ...def, surfaces };
  b.phys = { steerAccel: 14, decel: 8, push: 1, waveSpeed: 1, waveAmp: 1, waveReach: 1, reflect: 0, swell: 0, ...(def.phys ?? {}) };
  const xs = surfaces.flatMap((s) => [s.x0, s.x1]);
  const zs = surfaces.flatMap((s) => [s.z0, s.z1]);
  b.box = { x0: Math.min(...xs), x1: Math.max(...xs), z0: Math.min(...zs), z1: Math.max(...zs) };
  return Object.freeze(b);
}

export const BEDS = [
  bed({
    id: 'kid', name: "Kid's Bed", index: 0, quick: 30, skill: [0.3, 0.5],
    surfaces: [{ x0: -3, x1: 3, z0: -4, z1: 4, top: 0, open: OPEN }],
    walls: [{ x0: -3.3, x1: 3.3, z0: -4.4, z1: -4.0, y0: -1.4, y1: 0.9 }],
    spawns: [[0, 2.0], [1.8, 0.6], [1.1, -1.6], [-1.1, -1.6], [-1.8, 0.6]],
  }),
  bed({
    id: 'bunk', name: 'Bunk Bed', index: 1, quick: 35, skill: [0.4, 0.6],
    surfaces: [
      { x0: -2.6, x1: 2.6, z0: -4.0, z1: -1.4, top: 1.25, open: { x0: true, x1: true, z0: true, z1: false } },
      { x0: -3.6, x1: 3.6, z0: -1.4, z1: 4.2, top: 0, open: { x0: true, x1: true, z0: false, z1: true } },
    ],
    walls: [{ x0: -2.9, x1: 2.9, z0: -4.4, z1: -4.0, y0: -1.4, y1: 2.15 }],
    spawns: [[0, 2.6], [-2.2, 0.9], [2.2, 0.9], [-1.3, -2.7], [1.3, -2.7]],
  }),
  bed({
    id: 'water', name: 'Water Bed', index: 2, quick: 40, skill: [0.5, 0.7],
    surfaces: [{ x0: -3.5, x1: 3.5, z0: -4, z1: 4, top: 0, open: OPEN }],
    walls: [{ x0: -3.8, x1: 3.8, z0: -4.4, z1: -4.0, y0: -1.4, y1: 0.9 }],
    phys: { waveSpeed: 0.65, waveAmp: 1.05, waveReach: 1.2, reflect: 0.4, swell: 0.19 },
    spawns: [[0, 2.1], [2.0, 0.6], [1.2, -1.7], [-1.2, -1.7], [-2.0, 0.6]],
  }),
  bed({
    id: 'king', name: 'King Bed', index: 3, quick: 35, skill: [0.6, 0.8],
    surfaces: [{ x0: -4.5, x1: 4.5, z0: -4, z1: 4, top: 0, open: OPEN }],
    walls: [{ x0: -4.8, x1: 4.8, z0: -4.4, z1: -4.0, y0: -1.4, y1: 0.9 }],
    phys: { steerAccel: 8, decel: 2, push: 1.2 },
    lowZones: [
      { x0: -4.3, x1: -2.4, z0: -4.0, z1: -2.9, apex: 0.6 },
      { x0: -2.2, x1: -0.3, z0: -4.0, z1: -2.9, apex: 0.6 },
      { x0: 0.3, x1: 2.2, z0: -4.0, z1: -2.9, apex: 0.6 },
      { x0: 2.4, x1: 4.3, z0: -4.0, z1: -2.9, apex: 0.6 },
    ],
    spawns: [[0, 2.0], [2.6, 0.5], [1.5, -1.5], [-1.5, -1.5], [-2.6, 0.5]],
  }),
  bed({
    id: 'poster', name: 'Four-Poster', index: 4, quick: 35, skill: [0.7, 0.9],
    surfaces: [{ x0: -3.5, x1: 3.5, z0: -3.5, z1: 3.5, top: 0, open: OPEN }],
    walls: [{ x0: -3.8, x1: 3.8, z0: -3.9, z1: -3.5, y0: -1.4, y1: 0.9 }],
    posts: [
      { x: -3.55, z: -3.55, r: 0.22, top: 3.2 }, { x: 3.55, z: -3.55, r: 0.22, top: 3.2 },
      { x: -3.55, z: 3.55, r: 0.22, top: 3.2 }, { x: 3.55, z: 3.55, r: 0.22, top: 3.2 },
    ],
    // The canopy: a monkey's head stops here (its feet at 1.85 above the quilt).
    ceiling: 2.8,
    phys: { push: 1.3 },
    spawns: [[0, 1.9], [1.8, 0.6], [1.1, -1.5], [-1.1, -1.5], [-1.8, 0.6]],
  }),
];

export const BED_IDS = BEDS.map((b) => b.id);

export function bedById(id) {
  return BEDS.find((b) => b.id === id) ?? BEDS[0];
}

/** Is (x, z) over surface `s`, with `margin` of overhang allowed? */
export function inside(s, x, z, margin = 0) {
  return x >= s.x0 - margin && x <= s.x1 + margin && z >= s.z0 - margin && z <= s.z1 + margin;
}

/** The highest surface under (x, z) whose top is at or below `y` (landing footprint: FALL_MARGIN of overhang), or -1. */
export function surfaceUnder(bed, x, z, y, margin = FALL_MARGIN) {
  let best = -1;
  let top = -Infinity;
  for (const s of bed.surfaces) {
    if (s.top <= y + 1e-6 && s.top > top && inside(s, x, z, margin)) {
      best = s.i;
      top = s.top;
    }
  }
  return best;
}

/** Distance from (x, z) to surface `si`'s nearest open edge (negative when past it). Walls don't count as edges. */
export function edgeDistance(bed, si, x, z) {
  const s = bed.surfaces[si];
  if (!s) return -1;
  let d = Infinity;
  if (s.open.x0) d = Math.min(d, x - s.x0);
  if (s.open.x1) d = Math.min(d, s.x1 - x);
  if (s.open.z0) d = Math.min(d, z - s.z0);
  if (s.open.z1) d = Math.min(d, s.z1 - z);
  return d;
}

/** Distance from (x, z) to surface `si`'s open edge along direction (dx, dz) (unit), Infinity if it hits only walls. */
export function edgeAlong(bed, si, x, z, dx, dz) {
  const s = bed.surfaces[si];
  if (!s) return 0;
  let best = Infinity;
  const tryEdge = (open, t) => {
    if (open && t > 0 && t < best) best = t;
  };
  if (dx < -1e-6) tryEdge(s.open.x0, (s.x0 - x) / dx);
  if (dx > 1e-6) tryEdge(s.open.x1, (s.x1 - x) / dx);
  if (dz < -1e-6) tryEdge(s.open.z0, (s.z0 - z) / dz);
  if (dz > 1e-6) tryEdge(s.open.z1, (s.z1 - z) / dz);
  // A wall or a closed edge is hit first: the push stops there.
  let wall = Infinity;
  if (dx < -1e-6 && !s.open.x0) wall = Math.min(wall, (s.x0 - x) / dx);
  if (dx > 1e-6 && !s.open.x1) wall = Math.min(wall, (s.x1 - x) / dx);
  if (dz < -1e-6 && !s.open.z0) wall = Math.min(wall, (s.z0 - z) / dz);
  if (dz > 1e-6 && !s.open.z1) wall = Math.min(wall, (s.z1 - z) / dz);
  return wall < best ? Infinity : best;
}

/** Is (x, z) on the soft rim of surface `si` (within `width` of an open edge, or past it)? */
export function onRim(bed, si, x, z, width) {
  return edgeDistance(bed, si, x, z) < width;
}

/** The apex factor of a low zone (the King Bed's pillows), 1 elsewhere. */
export function lowZoneAt(bed, x, z) {
  for (const zone of bed.lowZones) if (x >= zone.x0 && x <= zone.x1 && z >= zone.z0 && z <= zone.z1) return zone.apex;
  return 1;
}

/** Clamp a point onto the nearest surface (for aiming pillows). Returns [x, z, si]. */
export function clampToBed(bed, x, z) {
  let best = null;
  for (const s of bed.surfaces) {
    const cx = Math.min(s.x1 - 0.05, Math.max(s.x0 + 0.05, x));
    const cz = Math.min(s.z1 - 0.05, Math.max(s.z0 + 0.05, z));
    const d = (cx - x) ** 2 + (cz - z) ** 2;
    if (!best || d < best[3] - 1e-9) best = [cx, cz, s.i, d];
  }
  return [best[0], best[1], best[2]];
}
