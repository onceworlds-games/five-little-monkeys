// Everything another page sends, checked before it touches the bed: slam, pillow, grab and hit messages, and presence
// samples. Pure: node-tested.
import { SLOTS, itemsIn } from './wardrobe.js';

const num = (v, lo, hi) => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;
const int = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
const MODES = new Set(['c', 'a', 'l', 'f', 'o']);
export const ID_RE = /^[\w:.-]{1,40}$/;

/** The room around a bed: anything outside it is nonsense. */
function bounds(bed) {
  const b = bed.box;
  return { x0: b.x0 - 3.5, x1: b.x1 + 3.5, z0: b.z0 - 3.5, z1: b.z1 + 3.5 };
}

/**
 * A slam message `{ t: 's', n, x, z, si, e, at, t0, y0, vx, vz, g?, b? }` at sim time `now` (g: 1 for a golden banana's
 * Mega Slam). Returns a clean copy or null.
 */
export function checkSlam(m, bed, now) {
  if (!m || typeof m !== 'object' || m.t !== 's') return null;
  const B = bounds(bed);
  if (!int(m.n, 0, 2e9) || !num(m.x, B.x0, B.x1) || !num(m.z, B.z0, B.z1)) return null;
  if (!int(m.si, -1, bed.surfaces.length - 1)) return null;
  if (m.g !== undefined && m.g !== 1) return null;
  if (!num(m.e, 0, m.g ? 2.1 : 1.8) || !num(m.at, now - 0.8, now + 0.9) || !num(m.t0, m.at - 0.9, m.at)) return null;
  if (!num(m.y0, bed.floor - 0.1, 8) || !num(m.vx, -4, 4) || !num(m.vz, -4, 4)) return null;
  if (m.si >= 0) {
    const s = bed.surfaces[m.si];
    if (m.x < s.x0 - 0.5 || m.x > s.x1 + 0.5 || m.z < s.z0 - 0.5 || m.z > s.z1 + 0.5) return null;
    if (m.e < 0.3) return null;
  }
  if (m.b !== undefined && (typeof m.b !== 'string' || !ID_RE.test(m.b))) return null;
  return { n: m.n, x: m.x, z: m.z, si: m.si, e: m.e, at: m.at, t0: m.t0, y0: m.y0, vx: m.vx, vz: m.vz, g: m.g === 1 ? 1 : 0, b: m.b };
}

/** A grab message `{ t: 'g', k, at, b? }`: the sender's monkey took toy `k`. */
export function checkGrab(m, now) {
  if (!m || typeof m !== 'object' || m.t !== 'g') return null;
  if (!int(m.k, 0, 999) || !num(m.at, now - 1.5, now + 1.0)) return null;
  if (m.b !== undefined && (typeof m.b !== 'string' || !ID_RE.test(m.b))) return null;
  return { k: m.k, at: m.at, b: m.b };
}

/** A hit message `{ t: 'h', by, at, b? }`: monkey `by`'s ring launched the sender's monkey. */
export function checkHit(m, now) {
  if (!m || typeof m !== 'object' || m.t !== 'h') return null;
  if (typeof m.by !== 'string' || !ID_RE.test(m.by) || !num(m.at, now - 1.5, now + 1.0)) return null;
  if (m.b !== undefined && (typeof m.b !== 'string' || !ID_RE.test(m.b))) return null;
  return { by: m.by, at: m.at, b: m.b };
}

/** A pillow message `{ t: 'p', n, fx, fz, x, z, si, at, b? }`. */
export function checkPillow(m, bed, now) {
  if (!m || typeof m !== 'object' || m.t !== 'p') return null;
  const B = bounds(bed);
  if (!int(m.n, 0, 2e9) || !num(m.fx, B.x0, B.x1) || !num(m.fz, B.z0, B.z1)) return null;
  if (!int(m.si, 0, bed.surfaces.length - 1)) return null;
  const s = bed.surfaces[m.si];
  if (!num(m.x, s.x0 - 0.1, s.x1 + 0.1) || !num(m.z, s.z0 - 0.1, s.z1 + 0.1)) return null;
  if (!num(m.at, now - 0.4, now + 1.0)) return null;
  if (m.b !== undefined && (typeof m.b !== 'string' || !ID_RE.test(m.b))) return null;
  return { n: m.n, fx: m.fx, fz: m.fz, x: m.x, z: m.z, si: m.si, at: m.at, b: m.b };
}

/** One monkey's sample: [mode, x, z, y, vx, vz, vy, ix, iz, tc, low, launches, aimX, aimZ, si, tier, dizzy, shield, banana]. */
export function checkSample(s, bed) {
  if (!Array.isArray(s) || s.length !== 19 || !MODES.has(s[0])) return null;
  const B = bounds(bed);
  if (!num(s[1], B.x0, B.x1) || !num(s[2], B.z0, B.z1) || !num(s[3], bed.floor - 0.5, 10)) return null;
  if (!num(s[4], -12, 12) || !num(s[5], -12, 12) || !num(s[6], -30, 30)) return null;
  if (!num(s[7], -1.01, 1.01) || !num(s[8], -1.01, 1.01) || !num(s[9], -1, 1)) return null;
  if (!(s[10] === 0 || s[10] === 1) || !int(s[11], 0, 9999)) return null;
  if (!num(s[12], B.x0, B.x1) || !num(s[13], B.z0, B.z1) || !int(s[14], -1, bed.surfaces.length - 1)) return null;
  if (!int(s[15], 0, 3) || !int(s[16], 0, 3) || !(s[17] === 0 || s[17] === 1) || !(s[18] === 0 || s[18] === 1)) return null;
  return s;
}

/** A wardrobe look as indexes, one per slot (anything unknown: the slot's first item). */
export function checkLook(l) {
  if (!Array.isArray(l) || l.length !== SLOTS.length) return null;
  return SLOTS.map((slot, k) => (int(l[k], 0, itemsIn(slot).length - 1) ? l[k] : 0));
}

const STATES = new Set(['title', 'lobby', 'in', 'watch']);

/**
 * A presence: { v: 2, s: state, r: round id ('L' in the lobby), t: sim time, l: look (wardrobe indexes), lv: level,
 * m: sample|null, b: [[botId, ...sample], ...] (the host only) }. Returns a clean copy (bad samples dropped) or null.
 */
export function checkPresence(p, bed) {
  if (!p || typeof p !== 'object' || p.v !== 2 || !STATES.has(p.s)) return null;
  if (typeof p.r !== 'string' || p.r.length > 80 || !num(p.t, -1, 1e10)) return null;
  const out = { s: p.s, r: p.r, t: p.t, l: checkLook(p.l), lv: int(p.lv, 1, 50) ? p.lv : 1, m: null, b: [] };
  if (p.m) out.m = checkSample(p.m, bed);
  if (Array.isArray(p.b)) {
    for (const row of p.b.slice(0, 5)) {
      if (!Array.isArray(row) || typeof row[0] !== 'string' || !ID_RE.test(row[0])) continue;
      const s = checkSample(row.slice(1), bed);
      if (s) out.b.push([row[0], s]);
    }
  }
  return out;
}

/** Rate limit per sender: at most one every `gap` seconds of sim time. Returns a check function. */
export function rateGate(gap) {
  const last = new Map();
  return (key, t) => {
    const prev = last.get(key);
    if (prev !== undefined && t - prev < gap && t >= prev) return false;
    last.set(key, t);
    return true;
  };
}

/**
 * A slam or pillow message from player `fromId`, as the room around it stands: { host, seats: [{ id, bot }], inRound, bed, now,
 * slamGate, pillowGate }. Bots' messages come only from the host, for bot seats; during a round only seats may act, and pillows
 * fly only in a round. Returns { kind: 's' | 'p', owner, m } or null.
 */
export function acceptMessage(data, fromId, room) {
  if (!data || typeof data !== 'object' || data.$ow || typeof fromId !== 'string' || !fromId) return null;
  if (room.now === null || room.now === undefined || !Number.isFinite(room.now)) return null;
  let owner = fromId;
  if (data.b !== undefined) {
    if (fromId !== room.host || !room.seats.some((s) => s.bot && s.id === data.b)) return null;
    owner = data.b;
  }
  if (room.inRound && !room.seats.some((s) => s.id === owner)) return null;
  if (data.t === 's') {
    const m = checkSlam(data, room.bed, room.now);
    if (!m || !room.slamGate(owner, m.at)) return null;
    return { kind: 's', owner, m };
  }
  if (data.t === 'p') {
    if (!room.inRound) return null;
    const m = checkPillow(data, room.bed, room.now);
    if (!m || !room.pillowGate(owner, m.at)) return null;
    return { kind: 'p', owner, m };
  }
  if (data.t === 'g' || data.t === 'h') {
    if (!room.inRound) return null;
    const m = data.t === 'g' ? checkGrab(data, room.now) : checkHit(data, room.now);
    // One grab per sender at a time; one hit per sender and slammer (two rings can launch a monkey in quick turns).
    if (!m || !room.otherGate(data.t === 'g' ? `g:${owner}` : `h:${owner}:${m.by}`, m.at)) return null;
    if (data.t === 'h' && (m.by === owner || !room.seats.some((s) => s.id === m.by))) return null;
    return { kind: data.t, owner, m };
  }
  return null;
}

const r3 = (v) => Math.round(v * 1000) / 1000;

/** The message for a slam planned on this page (`bot`: the host speaking for a bot seat). */
export function slamMessage(owner, n, plan, bot) {
  const msg = { t: 's', n, x: r3(plan.x), z: r3(plan.z), si: plan.si, e: r3(Math.max(0, Math.min(plan.mega ? 2.1 : 1.8, plan.e))), at: r3(plan.at), t0: r3(plan.t0), y0: r3(plan.y0), vx: r3(plan.vx), vz: r3(plan.vz) };
  if (plan.mega) msg.g = 1;
  if (bot) msg.b = owner;
  return msg;
}

/** The message for a toy taken on this page. */
export function grabMessage(owner, k, at, bot) {
  const msg = { t: 'g', k, at: r3(at) };
  if (bot) msg.b = owner;
  return msg;
}

/** The message for a launch on this page that another page's monkey caused. */
export function hitMessage(owner, by, at, bot) {
  const msg = { t: 'h', by, at: r3(at) };
  if (bot) msg.b = owner;
  return msg;
}

/** The message for a pillow thrown on this page. */
export function pillowMessage(owner, n, ev, bot) {
  const msg = { t: 'p', n, fx: r3(ev.fx), fz: r3(ev.fz), x: r3(ev.x), z: r3(ev.z), si: ev.si, at: r3(ev.at) };
  if (bot) msg.b = owner;
  return msg;
}
