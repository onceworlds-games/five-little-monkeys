// Toys that drop onto the bed, and the pillow rain: when and where, from a seed, so every page drops the same toy on the
// same patch at the same moment. Who grabs a toy is decided by its page (the host for bots, the room's host rules ties).
import { TOYS, RAIN } from './config.js';
import { createRng } from './rng.js';
import { edgeDistance, inside } from './beds.js';

const KINDS = ['mega', 'shield', 'spring'];

function pickKind(rng) {
  const r = rng.next();
  let acc = 0;
  for (const k of KINDS) {
    acc += TOYS.weights[k];
    if (r < acc) return k;
  }
  return 'mega';
}

/** A spot on a mattress at least `edge` from its open edges and `apart` from the spots in `taken`. */
function spotOn(bed, rng, edge, apart, taken) {
  for (let tries = 0; tries < 30; tries++) {
    const s = bed.surfaces[bed.surfaces.length > 1 ? (rng.next() < 0.7 ? bed.surfaces.length - 1 : 0) : 0];
    const x = rng.range(s.x0 + 0.4, s.x1 - 0.4);
    const z = rng.range(s.z0 + 0.4, s.z1 - 0.4);
    if (edgeDistance(bed, s.i, x, z) < edge) continue;
    if (taken.some((p) => Math.hypot(p.x - x, p.z - z) < apart)) continue;
    return { x, z, si: s.i };
  }
  const s = bed.surfaces[0];
  return { x: s.cx, z: s.cz, si: s.i };
}

/**
 * The toys of a round, in order: [{ k, kind, x, z, si, at (lands), until }]. `seed` is the round's id, `bonanza` the
 * twist, `from`/`to` the window of round time to fill (the Rush keeps asking for more).
 */
export function toySchedule(bed, seed, { bonanza = false, from = 0, to = 95, first = TOYS.first } = {}) {
  const rng = createRng(`${seed}:toys`);
  const out = [];
  const gap = bonanza ? TOYS.bonanza : TOYS.every;
  const max = bonanza ? TOYS.maxBonanza : TOYS.max;
  let at = bonanza ? Math.min(first, 4) : first;
  let k = 0;
  while (at < to) {
    const live = out.filter((o) => o.at <= at && o.until > at);
    if (live.length < max) {
      const spot = spotOn(bed, rng, TOYS.edge, TOYS.apart, live);
      if (at >= from) out.push({ k, kind: pickKind(rng), ...spot, at, until: at + TOYS.life });
      else pickKind(rng);
    }
    k++;
    at += rng.range(gap[0], gap[1]);
  }
  return out;
}

/** The pillows that fall in a Pillow Rain round: [{ k, x, z, si, at }]. */
export function rainSchedule(bed, seed, to = 95) {
  const rng = createRng(`${seed}:rain`);
  const out = [];
  let at = RAIN.first;
  let k = 0;
  while (at < to) {
    const spot = spotOn(bed, rng, 0.3, 0, []);
    out.push({ k: k++, ...spot, at });
    at += rng.range(RAIN.every[0], RAIN.every[1]);
  }
  return out;
}

/** Can body `b` grab toy `toy` now? (On its mattress, close, low enough, not out.) */
export function canGrab(b, toy, t) {
  if (b.out || b.si !== toy.si || t < toy.at || t >= toy.until) return false;
  if (b.mode === 'dive' || b.mode === 'falling' || b.mode === 'out') return false;
  return Math.hypot(b.x - toy.x, b.z - toy.z) <= TOYS.grab && b.y - b.lastTop <= TOYS.grabH;
}

/** Is a toy's spot still on the bed (a sanity check for pages that read a schedule). */
export const toyOnBed = (bed, toy) => !!bed.surfaces[toy.si] && inside(bed.surfaces[toy.si], toy.x, toy.z, 0);
