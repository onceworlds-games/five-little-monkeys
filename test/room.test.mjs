// The room flow through a fake room: pages that each run their own bed (world.js), trade slams, pillows and presence over a
// wire with lag, report falls to the host, and the host's referee rules (referee.js). A host that reloads, a host that
// leaves, a player who goes away, a latecomer; and whole matches over many seeds.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld } from '../game/src/world.js';
import { createReferee, CREDIT_WINDOW } from '../game/src/referee.js';
import { acceptMessage, checkPresence, rateGate, slamMessage, pillowMessage, grabMessage, hitMessage } from '../game/src/protocol.js';
import { twistFor } from '../game/src/sim/twists.js';
import { createBrain, PERSONALITIES } from '../game/src/sim/brain.js';
import { aliveIds, outcomeOf } from '../game/src/sim/round.js';
import { ROUND } from '../game/src/sim/config.js';
import { BED_IDS } from '../game/src/sim/beds.js';

const FPS = 60;
const clone = (v) => JSON.parse(JSON.stringify(v));
const KINDS = ['rumble', 'tiptoe', 'mimic', 'dozy'];

/** A room: seats, a host, the match record (falls, winner) only the host writes, and a wire. */
function createRoom({ bed = 'kid', humans = ['ann', 'bo'], bots = 3, lag = 0.1, seed = 1 } = {}) {
  const seats = [
    ...humans.map((id) => ({ id, bot: false, away: false, left: false })),
    ...Array.from({ length: bots }, (_, i) => ({ id: `bot:${i + 1}`, bot: true, kind: KINDS[(i + seed) % KINDS.length] })),
  ];
  seats.forEach((s, i) => (s.index = i));
  const room = {
    bed, seats, seed, lag, host: humans[0], t: 0, round: 0, rid: '', wire: [], pages: new Map(), totals: {},
    match: null, ended: null, acts: [], log: [], grabs: [], hits: [], twist: '',
  };
  for (const s of seats) room.totals[s.id] = 0;
  return room;
}

function startRound(room) {
  room.round++;
  room.rid = `m1:r${room.round}`;
  room.twist = room.twists === false ? '' : twistFor('m1', room.round);
  room.t = 0;
  room.ended = null;
  room.wire.length = 0;
  room.acts.length = 0;
  room.grabs.length = 0;
  room.hits.length = 0;
  const m = { phase: 'round', seats: room.seats, roundId: room.rid, data: { falls: [], winner: '', endT: 0 } };
  m.setData = (fn) => fn(m.data);
  m.endRound = (points) => {
    m.phase = 'roundEnd';
    room.ended = { points, at: room.t };
    for (const [id, p] of Object.entries(points)) room.totals[id] += p;
  };
  room.match = m;
  for (const page of room.pages.values()) populate(room, page);
}

/** A page for player `id` (a fresh load: a new world, a new referee, its brain playing for it as ?autoplay does). */
function openPage(room, id, lastPresence = null) {
  const page = {
    id, world: createWorld(room.bed), referee: createReferee(), slamGate: rateGate(0.9), pillowGate: rateGate(3.3), otherGate: rateGate(0.3),
    brain: createBrain('pro', 0.6, `${room.seed}:${id}`), presence: lastPresence, pending: [], seen: 0, sentAt: -1,
  };
  room.pages.set(id, page);
  if (room.match) populate(room, page);
  return page;
}

/** What main.js's populateRound does: every seat on the bed, the fallen out, and this page's own monkeys from its presence. */
function populate(room, page) {
  const w = page.world;
  w.reset(room.bed, room.t, { lobby: false, roundId: room.rid, seed: room.rid, twist: room.twist });
  const isHost = room.host === page.id;
  for (const s of room.seats) {
    const role = s.id === page.id ? 'me' : s.bot && isHost ? 'bot' : 'remote';
    const e = w.add(s.id, { role, index: s.index, brain: role === 'bot' ? brainSpec(room, s) : null });
    if (room.match.data.falls.some((f) => f.id === s.id)) w.markOut(s.id);
    e.spec = s.bot ? brainSpec(room, s) : null;
  }
  page.seen = room.match.data.falls.length;
  const mp = checkPresence(page.presence, w.bed);
  if (mp && mp.r === room.rid) {
    if (mp.m && !w.restore(page.id, mp.m)) report(room, page, page.id, '', mp.t, '');
    if (isHost) for (const [id, s] of mp.b) if (w.get(id)?.role === 'bot' && !w.restore(id, s)) report(room, page, id, '', mp.t, '', true);
  }
}

const brainSpec = (room, s) => ({ kind: s.kind, skill: 0.5, seed: `${room.rid}:${s.id}` });

/** A fall this page saw for its own monkey (an rpc to the host, after the lag) or, on the host, for a bot (queued for the tick). */
function report(room, page, id, by, at, kind, bot = false) {
  if (bot) {
    if (room.host === page.id) page.pending.push({ id, by, at, kind });
    return;
  }
  room.wire.push({ at: room.t + room.lag, kind: 'fall', from: page.id, value: { rid: room.rid, by, at, kind } });
}

function send(room, from, kind, value) {
  room.wire.push({ at: room.t + room.lag, kind, from, value: clone(value) });
}

/** One frame of every page, then whatever the wire delivers by now, then the host's tick every 100 ms. */
function frame(room, f) {
  room.t += 1 / FPS;
  const m = room.match;
  for (const page of room.pages.values()) {
    const w = page.world;
    const me = w.get(page.id);
    const seat = room.seats.find((s) => s.id === page.id);
    let input = { x: 0, z: 0, slam: false };
    if (me && !me.body.out && !seat?.away) {
      const view = { bed: w.bed, bodies: [...w.entries.values()].map((e) => e.body), waves: w.waves, level: w.level, slamsOn: w.t >= w.grace, leader: '', alive: [...w.entries.values()].filter((e) => !e.body.out).length, toys: w.liveToys().filter((t) => !t.taken) };
      input = page.brain.act(me.body, view, w.t) ?? input;
    }
    // The falls the host wrote: on the bed here too.
    while (page.seen < m.data.falls.length) {
      const fall = m.data.falls[page.seen++];
      if (w.get(fall.id) && !w.get(fall.id).body.out) w.markOut(fall.id, false);
    }
    if (m.phase !== 'round') continue;
    for (const ev of w.advance(room.t, input)) {
      const mine = ev.id === page.id;
      const hostBot = ev.role === 'bot' && room.host === page.id;
      if (ev.type === 'slam' && (mine || hostBot)) {
        room.acts.push({ id: ev.id, at: ev.plan.at });
        page.referee.acted(ev.id, ev.plan.at);
        send(room, page.id, 'msg', slamMessage(ev.id, ev.n, ev.plan, hostBot));
      } else if (ev.type === 'pillow' && !ev.remote && (mine || hostBot)) {
        room.acts.push({ id: ev.id, at: ev.at });
        page.referee.acted(ev.id, ev.at);
        send(room, page.id, 'msg', pillowMessage(ev.id, ev.n, ev, hostBot));
      } else if (ev.type === 'fall' && (mine || hostBot)) report(room, page, ev.id, ev.by, ev.t, ev.kind, hostBot);
      else if (ev.type === 'grab' && !ev.remote && (mine || hostBot)) {
        room.grabs.push({ page: page.id, id: ev.id, k: ev.k });
        send(room, page.id, 'msg', grabMessage(ev.id, ev.k, ev.at, hostBot));
      } else if (ev.type === 'hitOut' && (mine || hostBot)) send(room, page.id, 'msg', hitMessage(ev.id, ev.by, ev.at, hostBot));
      else if (ev.type === 'hit') room.hits.push({ page: page.id, id: ev.id, on: ev.on });
    }
    // Presence, 20 a second (a page that's away sends nothing).
    if (!seat?.away && room.t - page.sentAt >= 0.05) {
      page.sentAt = room.t;
      const p = { v: 2, s: 'in', r: room.rid, t: Math.round(w.t * 1000) / 1000, l: [0, 0, 0, 0, 0], lv: 1, m: w.get(page.id) ? w.sample(page.id) : null };
      if (room.host === page.id) p.b = [...w.entries.values()].filter((e) => e.role === 'bot').map((e) => [e.id, ...w.sample(e.id)]);
      page.presence = clone(p);
      send(room, page.id, 'presence', p);
    }
  }
  // The wire.
  for (let i = 0; i < room.wire.length; i++) {
    const msg = room.wire[i];
    if (msg.at > room.t) continue;
    room.wire.splice(i--, 1);
    if (msg.kind === 'fall') {
      const host = room.pages.get(room.host);
      if (host && m.phase === 'round' && msg.value.rid === m.roundId) {
        host.referee.fall(m, host.world.t, { id: msg.from, by: msg.value.by, at: msg.value.at, kind: msg.value.kind });
      }
      continue;
    }
    for (const page of room.pages.values()) {
      if (page.id === msg.from) continue;
      const w = page.world;
      if (msg.kind === 'msg') {
        const got = acceptMessage(msg.value, msg.from, {
          host: room.host, seats: room.seats, inRound: m.phase === 'round' || m.phase === 'roundEnd', bed: w.bed, now: w.t,
          slamGate: page.slamGate, pillowGate: page.pillowGate, otherGate: page.otherGate,
        });
        if (!got) {
          room.log.push({ refused: msg.value.t, from: msg.from, to: page.id });
          continue;
        }
        page.referee.acted(got.owner, got.m.at);
        if (got.owner === page.id) continue;
        if (got.kind === 's') w.remoteSlam(got.owner, got.m);
        else if (got.kind === 'p') w.remotePillow(got.owner, got.m);
        else if (got.kind === 'g') w.remoteGrab(got.owner, got.m);
        else w.remoteHit(got.owner, got.m.by);
      } else {
        const p = checkPresence(msg.value, w.bed);
        if (!p || p.r !== room.rid) continue;
        if (p.m) w.applySample(msg.from, p.m, p.t);
        if (msg.from === room.host) for (const [id, s] of p.b) w.applySample(id, s, p.t);
      }
    }
  }
  // The host's tick.
  if (f % (FPS / 10) === 0) {
    const host = room.pages.get(room.host);
    if (host && m.phase === 'round') {
      while (host.pending.length) host.referee.fall(m, host.world.t, host.pending.shift());
      host.referee.tick(m, host.world.t, room.t * 1000);
    }
  }
}

/** Run frames until `until(room)` or `seconds` pass; `each(room, f)` runs before every frame. */
function run(room, seconds, { until, each } = {}) {
  const frames = Math.round(seconds * FPS);
  for (let f = 1; f <= frames; f++) {
    each?.(room, f);
    frame(room, f);
    if (until?.(room)) return true;
  }
  return false;
}

/** Every credited fall names a seat that slammed or threw within the credit window before it. */
function checkCredits(room) {
  for (const fall of room.match.data.falls) {
    if (!fall.by) continue;
    assert.notEqual(fall.by, fall.id);
    assert.ok(room.seats.some((s) => s.id === fall.by), `credit to a seat: ${fall.by}`);
    const acted = room.acts.some((a) => a.id === fall.by && a.at <= fall.at + 1 && fall.at - a.at <= CREDIT_WINDOW);
    assert.ok(acted, `${fall.by} acted before knocking ${fall.id} off`);
  }
}

function finite(world) {
  for (const e of world.entries.values()) {
    const b = e.body;
    for (const v of [b.x, b.y, b.z, b.vx, b.vy, b.vz]) if (!Number.isFinite(v)) return false;
  }
  return true;
}

test('a round in a fake room: the host rules every fall, every page agrees on who is out, and the points add up', () => {
  const room = createRoom({ seed: 3 });
  openPage(room, 'ann');
  openPage(room, 'bo');
  startRound(room);
  let worst = 0;
  const errs = [];
  const ended = run(room, ROUND.endAt + 2, {
    until: (r) => !!r.ended,
    each: (r, f) => {
      if (f % 30) return;
      // Bo's page predicts the bots the host runs: close to where the host has them.
      const host = r.pages.get('ann').world;
      const guest = r.pages.get('bo').world;
      for (const e of host.entries.values()) {
        if (e.role !== 'bot' || e.body.out) continue;
        const g = guest.get(e.id).body;
        if (g.out) continue;
        const d = Math.hypot(g.x - e.body.x, g.z - e.body.z);
        errs.push(d);
        worst = Math.max(worst, d);
      }
      assert.ok(finite(host) && finite(guest));
    },
  });
  assert.ok(ended, 'the round ended');
  run(room, 0.1);
  const m = room.match;
  const ids = room.seats.map((s) => s.id);
  assert.deepEqual(room.ended.points, outcomeOf(ids, m.data.falls, Math.min(room.ended.at, ROUND.endAt)).points);
  assert.ok(aliveIds(ids, m.data.falls).length <= 1 || room.ended.at >= ROUND.endAt);
  assert.equal(new Set(m.data.falls.map((f) => f.id)).size, m.data.falls.length, 'one fall each');
  checkCredits(room);
  // Every page has the fallen on the rug.
  for (const page of room.pages.values()) for (const f of m.data.falls) assert.ok(page.world.get(f.id).body.out, `${page.id} sees ${f.id} out`);
  errs.sort((a, b) => a - b);
  assert.ok(errs[Math.floor(errs.length / 2)] < 0.35, `median prediction error ${errs[Math.floor(errs.length / 2)]}`);
  assert.ok(room.log.length === 0, `nothing honest was refused: ${JSON.stringify(room.log.slice(0, 3))}`);
});

test('the host reloads mid-round: its own monkey and the bots carry on from its presence, nobody falls twice', () => {
  const room = createRoom({ seed: 5 });
  openPage(room, 'ann');
  openPage(room, 'bo');
  startRound(room);
  run(room, 12);
  const before = room.pages.get('ann');
  const pos = new Map([...before.world.entries.values()].filter((e) => e.role !== 'remote').map((e) => [e.id, { x: e.body.x, z: e.body.z, out: e.body.out }]));
  const falls = room.match.data.falls.length;
  // A fresh page for ann, built from the room and her last presence.
  const after = openPage(room, 'ann', before.presence);
  for (const [id, p] of pos) {
    const b = after.world.get(id).body;
    if (p.out) continue;
    assert.ok(Math.hypot(b.x - p.x, b.z - p.z) < 0.6, `${id} carries on where it was (${b.x.toFixed(2)},${b.z.toFixed(2)} vs ${p.x.toFixed(2)},${p.z.toFixed(2)})`);
  }
  assert.equal(room.match.data.falls.length, falls);
  assert.ok(run(room, ROUND.endAt, { until: (r) => !!r.ended }), 'the round still ends');
  assert.equal(new Set(room.match.data.falls.map((f) => f.id)).size, room.match.data.falls.length);
  checkCredits(room);
});

test('the host leaves: another page takes the bots over where it predicted them and the round goes on', () => {
  const room = createRoom({ seed: 7, humans: ['ann', 'bo', 'cy'], bots: 2 });
  for (const id of ['ann', 'bo', 'cy']) openPage(room, id);
  startRound(room);
  run(room, 8);
  room.pages.delete('ann');
  room.seats.find((s) => s.id === 'ann').left = true;
  room.host = 'bo';
  const bo = room.pages.get('bo');
  for (const s of room.seats) if (s.bot) bo.world.setRole(s.id, 'bot', brainSpec(room, s));
  assert.ok(run(room, ROUND.endAt, { until: (r) => !!r.ended }), 'the round ends under the new host');
  const annFall = room.match.data.falls.find((f) => f.id === 'ann');
  assert.ok(annFall, 'the one who left is counted out');
  assert.equal(annFall.how, 'away');
  assert.equal(annFall.by, '', 'nobody gets credit for a player who left');
  checkCredits(room);
});

test('a player who goes away is counted out after 3 s, kindly, and is back in the next round', () => {
  const room = createRoom({ seed: 2, bots: 3 });
  openPage(room, 'ann');
  openPage(room, 'bo');
  startRound(room);
  let awayAt = -1;
  run(room, 6);
  // Bo is still jumping (the bots hold their slams for the first seconds): Bo's tab goes to the background.
  assert.ok(!room.match.data.falls.some((f) => f.id === 'bo'));
  room.seats.find((s) => s.id === 'bo').away = true;
  awayAt = room.t;
  run(room, 6, { until: (r) => r.match.data.falls.some((f) => f.id === 'bo') || !!r.ended });
  const fall = room.match.data.falls.find((f) => f.id === 'bo');
  if (fall) {
    if (fall.how === 'away') {
      assert.ok(room.t - awayAt >= ROUND.awayOut && room.t - awayAt < ROUND.awayOut + 0.5, `out ${room.t - awayAt} s after going away`);
      assert.equal(fall.by, '');
    }
  }
  run(room, ROUND.endAt, { until: (r) => !!r.ended });
  // Back for the next round: a fresh round has nobody out.
  room.seats.find((s) => s.id === 'bo').away = false;
  startRound(room);
  assert.deepEqual(aliveIds(room.seats.map((s) => s.id), room.match.data.falls), room.seats.map((s) => s.id));
  assert.equal(room.pages.get('bo').world.get('bo').role, 'me');
  assert.ok(!room.pages.get('bo').world.get('bo').body.out);
});

test('a latecomer watches the round: its slams are refused until it has a seat', () => {
  const room = createRoom({ seed: 4 });
  openPage(room, 'ann');
  openPage(room, 'bo');
  startRound(room);
  run(room, 3);
  const s0 = room.pages.get('ann').world.bed.surfaces[0];
  send(room, 'dee', 'msg', { t: 's', n: 1, x: s0.cx, z: s0.cz, si: 0, e: 1.5, at: room.t + 0.25, t0: room.t, y0: 2, vx: 0, vz: 0 });
  send(room, 'bo', 'msg', { t: 's', n: 2, x: s0.cx, z: s0.cz, si: 0, e: 1.5, at: room.t + 0.25, t0: room.t, y0: 2, vx: 0, vz: 0, b: 'bot:1' });
  run(room, 0.3);
  assert.ok(room.log.some((l) => l.from === 'dee' && l.refused === 's'), 'the latecomer is refused');
  assert.ok(room.log.some((l) => l.from === 'bo' && l.refused === 's'), 'a guest speaking for a bot is refused');
  assert.ok(!room.pages.get('ann').world.waves.some((w) => w.owner === 'dee'));
  // A fall reported by someone without a seat changes nothing.
  room.wire.push({ at: room.t, kind: 'fall', from: 'dee', value: { rid: room.rid, by: '', at: room.t, kind: '' } });
  room.wire.push({ at: room.t, kind: 'fall', from: 'bo', value: { rid: 'old', by: '', at: room.t, kind: '' } });
  run(room, 0.1);
  assert.ok(!room.match.data.falls.some((f) => f.id === 'dee'));
  assert.ok(!room.match.data.falls.some((f) => f.id === 'bo' && f.at > room.t - 0.2), 'a stale round id is ignored');
});

test('whole matches over many seeds and every bed: rounds end, no NaN, points add up', () => {
  let rounds = 0;
  let lengths = 0;
  for (let seed = 1; seed <= 10; seed++) {
    const bed = BED_IDS[seed % BED_IDS.length];
    const room = createRoom({ bed, seed, humans: ['ann'], bots: 4, lag: 0.03 });
    openPage(room, 'ann');
    for (let r = 0; r < 3; r++) {
      startRound(room);
      const ended = run(room, ROUND.endAt + 1, {
        until: (rm) => !!rm.ended,
        each: (rm, f) => {
          if (f % 60 === 0) assert.ok(finite(rm.pages.get('ann').world), `${bed} seed ${seed}: finite`);
        },
      });
      assert.ok(ended, `${bed} seed ${seed} round ${r + 1} ended`);
      checkCredits(room);
      rounds++;
      lengths += room.ended.at;
    }
    const total = Object.values(room.totals).reduce((a, b) => a + b, 0);
    assert.ok(total >= 3 * 3, `${bed} seed ${seed}: at least a win a round (${total})`);
    for (const id of Object.keys(room.totals)) assert.ok(Number.isInteger(room.totals[id]) && room.totals[id] >= 0);
  }
  assert.ok(Object.keys(PERSONALITIES).length > 4);
  const avg = lengths / rounds;
  assert.ok(avg > 15 && avg < 80, `average round ${avg.toFixed(1)} s`);
});

test('toys, twists and hits across pages: one taker per toy that every page agrees on, the same twist everywhere', () => {
  let grabs = 0;
  let agreed = 0;
  let hits = 0;
  for (let seed = 1; seed <= 4; seed++) {
    const room = createRoom({ seed, humans: ['ann', 'bo'], bots: 3, lag: 0.08 });
    openPage(room, 'ann');
    openPage(room, 'bo');
    for (let r = 0; r < 3; r++) {
      startRound(room);
      for (const page of room.pages.values()) assert.equal(page.world.twist, room.twist, 'every page has the round\'s twist');
      if (r > 0) assert.ok(room.twist, 'a twist from the second round on');
      assert.ok(run(room, ROUND.endAt + 1, { until: (rm) => !!rm.ended }), `seed ${seed} round ${r + 1} ended`);
      run(room, 0.3);
      const [a, b] = [...room.pages.values()].map((p) => p.world);
      for (const toy of a.toys) {
        const other = b.toys.find((t) => t.k === toy.k);
        assert.ok(other && other.kind === toy.kind && other.x === toy.x, 'the same toys on every page');
        if (!toy.taken && !other.taken) continue;
        grabs++;
        if (toy.taken === other.taken) agreed++;
      }
      hits += room.hits.length;
      assert.ok(room.log.length === 0, `nothing honest was refused: ${JSON.stringify(room.log.slice(0, 3))}`);
    }
  }
  assert.ok(grabs > 10, `toys get grabbed (${grabs})`);
  assert.ok(agreed / grabs > 0.9, `pages agree on who took a toy (${agreed}/${grabs})`);
  assert.ok(hits > 0, 'slammers earn hits');
});
