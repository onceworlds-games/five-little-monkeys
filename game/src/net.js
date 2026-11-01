// The room: the match (rounds, points, results), what only the host decides (falls, the end of a round), the bots in empty
// seats, and the slam and pillow messages and presence every page trades. Every input is checked (protocol.js).
import { createMatch, createHost, t } from '@onceworlds/sdk/match';
import { createBots } from '@onceworlds/sdk/bots';
import { BED_IDS } from './sim/beds.js';
import { BOT_NAMES } from './look.js';
import { acceptMessage, checkPresence, rateGate, slamMessage, pillowMessage, grabMessage, hitMessage, ID_RE } from './protocol.js';
import { createReferee } from './referee.js';

export const SETTINGS = [
  {
    id: 'bed', label: 'Bed', default: 'kid',
    options: BED_IDS.map((id) => ({ value: id, label: { kid: "Kid's Bed", bunk: 'Bunk Bed', water: 'Water Bed', king: 'King Bed', poster: 'Four-Poster' }[id] })),
  },
  { id: 'rounds', label: 'Rounds', options: [3, 5], default: 3 },
];

export const JOIN = { maxPlayers: 5, minPlayers: 1, lobby: 'bar', ownCountdown: true, settings: SETTINGS };

const FALL_SCHEMA = t.object({
  id: t.string(40, ID_RE),
  by: t.string(40),
  at: t.number(0, 10000),
  how: t.oneOf('fell', 'away'),
  kind: t.oneOf('', 'slam', 'pillow'),
});
const DATA = t.object({
  falls: t.array(FALL_SCHEMA, 8),
  off: t.number(0, 1e6),
  winner: t.string(40),
  endT: t.number(0, 10000),
});

/**
 * hooks: {
 *   simT(): the round's sim time on this page (null when its bed isn't running this round),
 *   lobbyT(): the lobby bed's time (null outside the lobby), bed(): the bed in play,
 *   onSlam(owner, m), onPillow(owner, m), onGrab(owner, m), onHit(owner, m), onPresence(player, p),
 * }
 */
export function createNet(ow, room, hooks) {
  const host = createHost(room);
  const referee = createReferee();
  const slamGate = rateGate(0.9);
  const pillowGate = rateGate(3.3);
  const otherGate = rateGate(0.3);
  const pendingFalls = [];
  const simNow = (m) => hooks.simT() ?? m.elapsed / 1000;

  const match = createMatch(room, {
    rounds: 'rounds',
    introSeconds: 0,
    roundEndSeconds: 5.5,
    resultsSeconds: room.kind === 'public' ? 20 : room.kind === 'solo' ? 25 : 0,
    admit: 'round',
    data: DATA,
    tick: 100,
    startRound: () => ({ falls: [], off: 0, winner: '', endT: 0 }),
    onTick: (m) => {
      // Falls the host's own bed decided for bots (queued, so the data is written from the tick).
      while (pendingFalls.length) {
        const f = pendingFalls.shift();
        if (f.rid === m.roundId) referee.fall(m, simNow(m), f);
      }
      referee.tick(m, simNow(m), room.matchNow());
    },
    resume: () => referee.resume(),
  });

  const bots = createBots(match, { host, fill: 5, names: BOT_NAMES, skill: [0, 1], every: 60000, think: () => null });

  const fallRpc = host.rpc('fall', {
    args: { rid: t.string(120), by: t.string(40), at: t.number(0, 10000), kind: t.oneOf('', 'slam', 'pillow') },
    rate: 3,
    validate: (from, a) => (match.phase === 'round' && a.rid === match.roundId) || 'stale',
    run: (from, a) => referee.fall(match, simNow(match), { id: from.id, by: a.by, at: a.at, kind: a.kind }),
  });

  // Messages: slams and pillows.
  room.on('message', (data, from) => {
    const got = acceptMessage(data, from?.id, {
      host: room.host,
      seats: match.seats,
      inRound: match.phase === 'round' || match.phase === 'roundEnd',
      bed: hooks.bed(),
      now: hooks.simT() ?? hooks.lobbyT(),
      slamGate,
      pillowGate,
      otherGate,
    });
    if (!got) return;
    if (got.kind === 's' || got.kind === 'p') referee.acted(got.owner, got.m.at);
    if (got.kind === 's') hooks.onSlam(got.owner, got.m);
    else if (got.kind === 'p') hooks.onPillow(got.owner, got.m);
    else if (got.kind === 'g') hooks.onGrab?.(got.owner, got.m);
    else hooks.onHit?.(got.owner, got.m);
  });

  room.on('presence', (player) => {
    if (!player || player.id === room.me?.id) return;
    const p = checkPresence(player.presence, hooks.bed());
    if (!p) return;
    if (p.b.length && player.id !== room.host) p.b = [];
    hooks.onPresence(player, p);
  });

  return {
    room,
    match,
    host,
    bots,
    get isHost() {
      return match.isHost;
    },
    /** This page's (or, on the host, a bot's) slam. */
    sendSlam(owner, n, plan, bot) {
      referee.acted(owner, plan.at);
      room.send(slamMessage(owner, n, plan, bot));
    },
    sendPillow(owner, n, ev, bot) {
      referee.acted(owner, ev.at);
      room.send(pillowMessage(owner, n, ev, bot));
    },
    /** This page's monkey (or the host's bot) took toy `k`. */
    sendGrab(owner, k, at, bot) {
      room.send(grabMessage(owner, k, at, bot));
    },
    /** This page's monkey (or the host's bot) was launched by `by`'s ring, and `by` runs on another page. */
    sendHit(owner, by, at, bot) {
      room.send(hitMessage(owner, by, at, bot));
    },
    /** This page's monkey (or a bot, on the host) fell off. */
    fell(id, by, at, kind, bot) {
      const args = { rid: match.roundId, by: by || '', at: Math.max(0, Math.min(10000, at)), kind: kind || '' };
      if (bot) {
        if (match.isHost) pendingFalls.push({ id, rid: match.roundId, by: args.by, at: args.at, kind: args.kind });
        return;
      }
      fallRpc(args);
    },
    /** Host, solo: keep the round's clock offset where watchers can read it. */
    setOffset(off) {
      if (match.isHost && match.phase === 'round') match.setData((d) => {
        d.off = Math.max(0, Math.round(off * 1000) / 1000);
      });
    },
  };
}

