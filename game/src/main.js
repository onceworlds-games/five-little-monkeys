// Five Little Monkeys: the page. Joins the room first, then builds the bedroom, and every frame runs the bed (world.js),
// draws it (view.js) and keeps the screens (ui.js) in step with the match.
import '@fontsource/alfa-slab-one/latin-400.css';
import '@fontsource/barlow-condensed/latin-700.css';
import './style.css';
import { createView } from './view.js';
import { createWorld } from './world.js';
import { createInput } from './input.js';
import { createUI } from './ui.js';
import { createNet, JOIN } from './net.js';
import { startAudio, sfx, setMusic, setTempo, suspendAudio } from './audio.js';
import { loadSave, writeSave, starCount, bedOpen, patternOpen, bankMatch, defaultSave } from './save.js';
import { BEDS, BED_IDS, bedById, edgeAlong } from './sim/beds.js';
import { ROUND, levelAt } from './sim/config.js';
import { verseFor } from './sim/round.js';
import { createBrain } from './sim/brain.js';
import { COLORS, CAST, PATTERNS, castByName } from './look.js';
import { checkPresence } from './protocol.js';

const params = new URLSearchParams(location.search);
const LOCAL = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname) || location.hostname.endsWith('.localhost');
const POSTER = params.get('poster');
const AUTO = LOCAL && params.get('autoplay') === '1';
// ?debug (local only): the frame's draw calls on <body data-calls>, for measuring.
const DEBUG = LOCAL && params.has('debug');
const ow = window.onceworlds ?? null;

const BADGES = ['first-slam', 'bumped-head', 'double-bounce', 'no-more-monkeys', 'untouchable', 'pillow-fight', 'saved-it', 'bunk-boss', 'making-waves', 'five-beds'];
const SHORT = { kid: 'KID', bunk: 'BUNK', water: 'WATER', king: 'KING', poster: 'POSTER' };
const BISCUIT = { hex: '#9A6A3E', dark: '#5A3A1E', symbol: '', pattern: 'plain', extra: 'bear' };
const PATTERN_CSS = {
  plain: '#9C6CF0',
  stripes: 'repeating-linear-gradient(90deg,#9C6CF0 0 5px,#FFF1D6 5px 9px)',
  dots: 'radial-gradient(circle,#FFF1D6 2px,transparent 2.5px) 0 0/8px 8px,#9C6CF0',
  checks: 'repeating-conic-gradient(#9C6CF0 0 25%,#C6A8F7 0 50%) 0 0/10px 10px',
  moons: 'radial-gradient(circle at 40% 40%,#FFF1D6 3px,transparent 3.5px) 0 0/11px 11px,#9C6CF0',
  bolts: 'linear-gradient(135deg,#9C6CF0 40%,#FFF1D6 40% 55%,#9C6CF0 55%)',
  gold: 'radial-gradient(circle,#F6D36B 2.5px,transparent 3px) 0 0/9px 9px,#9C6CF0',
};

const settings = {
  get quality() {
    try {
      return ow?.settings?.quality ?? 'high';
    } catch {
      return 'high';
    }
  },
  get reduced() {
    try {
      return !!(ow?.settings?.reducedMotion ?? matchMedia('(prefers-reduced-motion: reduce)').matches);
    } catch {
      return false;
    }
  },
  pr() {
    try {
      return ow?.settings?.pixelRatio ? ow.settings.pixelRatio(2) : Math.min(devicePixelRatio || 1, 2);
    } catch {
      return 1;
    }
  },
};

const safe = (fn) => {
  try {
    return fn();
  } catch (err) {
    console.warn(err);
    return undefined;
  }
};

if (POSTER) {
  import('./poster.js').then((m) => m.runPoster(POSTER)).catch((err) => console.error(err));
} else {
  boot().catch((err) => console.error(err));
}

async function boot() {
  // Join first, so a reload never misses its seat; build the scene after.
  let room = null;
  try {
    room = ow?.rooms ? await ow.rooms.join(JOIN) : null;
  } catch (err) {
    console.warn('rooms.join failed', err);
  }
  let save;
  try {
    save = await loadSave(ow);
  } catch {
    save = defaultSave();
  }
  safe(() => ow?.ui?.setLook({ accent: '#FFB24A', panel: '#172036', text: '#FFF1D6' }));

  const canvasEl = document.getElementById('c');
  const view = createView(canvasEl, { quality: settings.quality, pixelRatio: settings.pr() });
  const input = createInput(ow);
  const uiRoot = document.getElementById('ui');

  const G = {
    room: null,
    net: null,
    match: null,
    myId: 'me',
    screen: AUTO ? 'game' : 'title',
    mode: '',
    rid: '',
    world: createWorld(save.bed),
    localT: 0,
    attractEnd: 0,
    bases: new Map(),
    off: 0,
    offRid: '',
    lastMn: 0,
    slowUntil: 0,
    paused: false,
    seenFalls: 0,
    phaseKey: '',
    lastLaunch: new Map(),
    pillowsDue: [],
    presenceAt: 0,
    patterns: new Map(),
    controlsKey: '',
    stats: newStats(),
    myLaunchesRound: 0,
    roundsWon: [],
    myKnocks: [],
    hintsShown: new Set(),
    hint: null,
    wildSeen: 0,
    countN: null,
    jumpUntil: 0,
    lastResultsId: '',
    resultsNews: [],
    resultsKey: '',
    wantReady: false,
    door: 0,
    roundEndAt: 0,
    closed: null,
    autoBrain: AUTO ? createBrain('pro', 0.85, 'auto') : null,
    autoReadyAt: 0,
    steerTime: 0,
    lastAway: 0,
  };

  function newStats() {
    return { slams: 0, knocks: 0 };
  }

  const ui = createUI(uiRoot, {
    onPlay: () => play(),
    onBed: (id) => pickBed(id),
    onRounds: () => pickRounds(),
    onPattern: () => cyclePattern(),
    onInvite: () => safe(() => ow?.ui?.showInvite()),
    onAgain: () => playAgain(),
    onResume: () => resume(),
    onRejoin: () => rejoin(),
  });

  // ---- Room wiring ----

  function connect(room) {
    G.room = room;
    G.myId = room?.me?.id ?? 'me';
    if (!room) return;
    G.net = createNet(ow, room, {
      simT: () => (G.mode === 'round' && G.world.roundId === G.match?.roundId ? G.world.t : null),
      lobbyT: () => (G.mode === 'lobby' ? G.world.t : null),
      bed: () => G.world.bed,
      patterns: PATTERNS.length,
      onSlam: (owner, m) => {
        if (G.mode !== 'lobby' && G.mode !== 'round') return;
        if (owner === G.myId) return;
        G.world.remoteSlam(owner, m);
      },
      onPillow: (owner, m) => {
        if (G.mode !== 'round' || owner === G.myId) return;
        G.world.remotePillow(owner, m);
      },
      onPresence: (player, p) => onPresence(player, p),
    });
    G.match = G.net.match;
    room.on('close', (reason) => onClose(reason));
    room.on('leave', (player) => {
      if (G.mode === 'lobby') G.world.remove(player.id);
    });
    G.match.on('results', (standings, mine) => onResults(standings, mine));
  }
  connect(room);
  safe(() => ow?.rooms?.on?.('moved', (r) => {
    disposeNet();
    connect(r);
  }));

  function disposeNet() {
    safe(() => G.net?.bots?.dispose());
    safe(() => G.net?.match?.dispose());
    safe(() => G.net?.host?.dispose());
    G.net = null;
    G.match = null;
  }

  function onClose(reason) {
    if (reason === 'moved' || reason === 'left') return;
    const text = { kicked: ['You were removed', 'Play'], replaced: ['Playing in another tab', 'Play here'] }[reason] ?? ['Disconnected', 'Rejoin'];
    G.closed = text;
    disposeNet();
    G.room = null;
    ui.closed(text[0], text[1]);
  }

  async function rejoin() {
    ui.closed(null);
    G.closed = null;
    try {
      const r = await ow.rooms.join(JOIN);
      connect(r);
      G.mode = '';
    } catch (err) {
      console.warn(err);
      G.closed = ['Disconnected', 'Rejoin'];
      ui.closed('Disconnected', 'Rejoin');
    }
  }

  // ---- Looks ----

  function lookOf(colorIndex, pattern, extra) {
    const c = COLORS[colorIndex] ?? COLORS[4];
    return { hex: c.hex, dark: c.dark, symbol: c.symbol, pattern, extra };
  }
  function patternOf(id) {
    if (id === G.myId) return save.pattern;
    return PATTERNS[G.patterns.get(id) ?? 0]?.id ?? 'plain';
  }
  /** Seat colours: bots keep theirs, players take violet first, then the colours left over. */
  function seatLooks() {
    const looks = new Map();
    const names = new Map();
    const seats = G.match?.seats ?? [];
    const used = new Set();
    for (const s of seats) if (s.bot) used.add((castByName(s.name) ?? CAST[s.index % 4]).color);
    const free = [4, 0, 1, 2, 3].filter((c) => !used.has(c));
    let k = 0;
    for (const s of seats) {
      if (s.bot) {
        const c = castByName(s.name) ?? CAST[s.index % 4];
        looks.set(s.id, lookOf(c.color, c.pattern, c.extra));
      } else looks.set(s.id, lookOf(free[k++ % free.length] ?? 4, patternOf(s.id), ''));
      names.set(s.id, s.name);
    }
    return { looks, names };
  }
  function lobbyLooks() {
    const looks = new Map();
    const names = new Map();
    const order = [4, 0, 1, 2, 3];
    let i = 0;
    for (const p of G.room?.players?.values?.() ?? []) {
      looks.set(p.id, lookOf(order[i++ % 5], patternOf(p.id), ''));
      names.set(p.id, p.name);
    }
    if (!G.room) {
      looks.set(G.myId, lookOf(4, save.pattern, ''));
      names.set(G.myId, 'You');
    }
    looks.set('biscuit', BISCUIT);
    names.set('biscuit', 'Biscuit');
    return { looks, names };
  }
  const ATTRACT = [...CAST.map((c) => ({ ...c })), { name: 'Pip', kind: 'pro', color: 4, pattern: 'checks', extra: '' }];
  function attractLooks() {
    const looks = new Map();
    const names = new Map();
    ATTRACT.forEach((c, i) => {
      looks.set(`a${i}`, lookOf(c.color, c.pattern, c.extra));
      names.set(`a${i}`, c.name);
    });
    return { looks, names };
  }
  let lookCache = { looks: new Map(), names: new Map() };
  function refreshLooks() {
    if (G.mode === 'attract') lookCache = attractLooks();
    else if (G.mode === 'lobby' || G.mode === 'offline') lookCache = lobbyLooks();
    else lookCache = seatLooks();
  }
  const hexOf = (id) => lookCache.looks.get(id)?.hex ?? '#FFF1D6';
  const nameOf = (id) => lookCache.names.get(id) ?? 'Someone';

  // ---- Modes ----

  const validBed = (id) => (BED_IDS.includes(id) ? id : 'kid');
  function wanted() {
    // A player in a running match (a reload, or readied from the platform's strip) goes straight back to the bed.
    if (G.screen === 'title' && G.match && G.match.phase !== 'lobby' && G.match.me && !G.match.spectating) {
      G.screen = 'game';
      safe(() => G.room?.hideLobby?.(false));
    }
    if (G.screen === 'title') return { mode: 'attract', bed: validBed(save.bed) };
    if (!G.room || !G.match) return { mode: 'offline', bed: validBed(save.bed) };
    const ph = G.match.phase;
    if (ph === 'lobby' || ph === 'countdown') return { mode: 'lobby', bed: validBed(G.room.settings?.bed) };
    const bed = validBed(G.match.settings?.bed);
    if (ph === 'results') return { mode: 'results', bed, rid: `R${G.room.match?.id ?? ''}` };
    return { mode: 'round', bed, rid: G.match.roundId };
  }

  function solo() {
    if (!G.room || !G.match) return true;
    const online = G.room.online?.length ?? 1;
    return online <= 1 && G.match.seats.filter((s) => !s.bot).length <= 1;
  }

  function syncMode() {
    const w = wanted();
    const changed = w.mode !== G.mode || (w.rid ?? '') !== G.rid || (w.mode === 'lobby' && w.bed !== G.world.bed.id) || ((w.mode === 'attract' || w.mode === 'offline') && w.bed !== G.world.bed.id);
    if (!changed) return;
    const prev = G.mode;
    G.mode = w.mode;
    G.rid = w.rid ?? '';
    view.fx.clear();
    G.lastLaunch.clear();
    G.pillowsDue.length = 0;
    G.door = 0;
    G.jumpUntil = 0;
    if (w.mode === 'attract') {
      G.localT = 0;
      G.attractEnd = 0;
      G.world.reset(w.bed, 0, { lobby: false });
      G.world.grace = 1.5;
      G.world.botGrace = 1.5;
      ATTRACT.forEach((c, i) => G.world.add(`a${i}`, { role: 'bot', index: i, brain: { kind: c.kind, skill: 0.55 + (i % 3) * 0.12, seed: `attract${Math.random()}` } }));
    } else if (w.mode === 'lobby' || w.mode === 'offline') {
      const t0 = w.mode === 'lobby' ? lobbyNow() : G.localT;
      G.world.reset(w.bed, t0, { lobby: true });
      const order = [...(G.room?.players?.keys?.() ?? [])];
      G.world.add(G.myId, { role: 'me', index: Math.max(0, order.indexOf(G.myId)) % 5 });
      const s = G.world.bed.surfaces[G.world.bed.surfaces.length - 1];
      G.world.add('biscuit', { role: 'dummy', spawn: { x: s.cx + 0.8, z: s.cz - 0.6, si: s.i }, index: 7, phase: 0.5 });
      G.hintsShown.delete('knock');
      if (prev === 'results' || prev === 'round') setMusic('box');
    } else if (w.mode === 'round') {
      G.world.reset(w.bed, 0, { lobby: false, roundId: G.rid });
      G.seenFalls = 0;
      G.myLaunchesRound = 0;
      G.wildSeen = 0;
      G.roundEndAt = 0;
      if (G.offRid !== G.rid) {
        G.off = 0;
        G.offRid = G.rid;
      }
      populateRound();
      G.jumpUntil = performance.now() + 900;
      if (!G.world.get(G.myId)) G.hint = null;
      setMusic('play', 116);
      if (G.match.round === 1 && G.screen === 'game') {
        G.stats = newStats();
        G.roundsWon = [];
        G.myKnocks = [];
      }
    } else if (w.mode === 'results') {
      G.localT = 0;
      G.world.reset(w.bed, 0, { lobby: true });
      const res = G.match.results ?? G.match.standings ?? [];
      const top = res[0];
      if (top) {
        const s = G.world.bed.surfaces[G.world.bed.surfaces.length - 1];
        G.world.add(top.id, { role: 'dummy', spawn: { x: s.cx, z: s.cz + 0.5, si: s.i }, index: 0 });
      }
      setMusic('box');
    }
    refreshLooks();
    G.controlsKey = '';
  }

  function brainFor(seat) {
    const bed = G.world.bed;
    const c = castByName(seat.name);
    const [lo, hi] = bed.skill;
    return { kind: c?.kind ?? 'pro', skill: lo + (seat.skill ?? 0.5) * (hi - lo), seed: `${G.room?.match?.id ?? ''}:${seat.id}` };
  }

  const markOut = (e, longAgo = true) => G.world.markOut(e.id, longAgo);

  function populateRound() {
    const m = G.match;
    const falls = m.data?.falls ?? [];
    const fallen = new Set(falls.map((f) => f.id));
    G.world.grace = ROUND.grace;
    G.world.botGrace = !save.played && solo() ? ROUND.firstGraceBots : ROUND.grace;
    for (const s of m.seats) {
      let role = 'remote';
      if (s.me && !m.spectating) role = 'me';
      else if (s.bot && m.isHost) role = 'bot';
      const spec = s.bot ? brainFor(s) : null;
      const e = G.world.add(s.id, { role, index: s.index, brain: role === 'bot' ? spec : null });
      e.brainSpec = spec;
      if (fallen.has(s.id)) markOut(e);
    }
    G.seenFalls = falls.length;
    // A reload in the middle of a round: carry on from the last presence.
    // The presence is this page's own (checked like anyone else's), and the host's carries the bots.
    const mp = checkPresence(G.room.me?.presence, G.world.bed, PATTERNS.length);
    if (mp && mp.r === G.rid) {
      const mine = G.world.get(G.myId);
      if (mine && mine.role === 'me' && !mine.body.out && mp.m && !G.world.restore(G.myId, mp.m)) {
        markOut(mine);
        G.net.fell(G.myId, '', Math.max(0, mp.t), '');
      }
      for (const [id, sample] of mp.b) {
        const e = G.world.get(id);
        if (e && e.role === 'bot' && !e.body.out && !G.world.restore(id, sample)) {
          markOut(e);
          G.net.fell(id, '', Math.max(0, mp.t), '', true);
        }
      }
    }
    if (!save.played && G.match.seats.some((s) => s.me)) {
      save.played = true;
      writeSave(ow, save);
    }
  }

  // ---- Clocks ----

  const lobbyNow = () => {
    try {
      return ow?.now ? ow.now() / 1000 : performance.now() / 1000;
    } catch {
      return performance.now() / 1000;
    }
  };

  function roundClock(realDt) {
    const m = G.match;
    const room = G.room;
    const mn = room.matchNow();
    if (m.phase === 'round') G.bases.set(G.rid, mn - m.elapsed);
    const base = G.bases.get(G.rid) ?? mn;
    const dm = Math.max(0, (mn - (G.lastMn || mn)) / 1000);
    G.lastMn = mn;
    const iRun = solo() && m.isHost;
    if (iRun && m.phase === 'round') {
      if (G.paused) G.off += dm;
      else if (performance.now() < G.slowUntil) G.off += dm * 0.65;
    }
    const off = iRun ? G.off : m.data?.off ?? 0;
    let t = (mn - base) / 1000 - off;
    if (m.phase === 'roundEnd' && m.data?.endT) t = Math.min(t, m.data.endT + 0.7);
    if (G.mode === 'round' && t < G.world.t && t > G.world.t - 0.5) t = G.world.t;
    return Math.max(0, t);
  }

  function target(dt) {
    if (G.mode === 'round') return roundClock(dt);
    if (G.mode === 'lobby') return lobbyNow();
    G.localT += dt;
    return G.localT;
  }

  // ---- Input for this page's monkey ----

  function myInput(dt) {
    const e = G.world.get(G.myId);
    if (!e || G.paused || G.closed) {
      input.takeSlam();
      return { x: 0, z: 0, slam: false };
    }
    if (G.autoBrain && G.mode === 'round') {
      input.takeSlam();
      const view = { bed: G.world.bed, bodies: [...G.world.entries.values()].map((x) => x.body), waves: G.world.waves, level: G.world.level, slamsOn: G.world.t >= G.world.grace, leader: '', alive: [...G.world.entries.values()].filter((x) => !x.body.out).length };
      return G.autoBrain.act(e.body, view, G.world.t) ?? { x: 0, z: 0, slam: false };
    }
    const st = input.steer();
    const slam = input.takeSlam();
    if (Math.hypot(st.x, st.z) > 0.3) G.steerTime += dt;
    // Screen up is away from the camera: the stick's y and W/S already map to -z / +z.
    return { x: st.x, z: st.z, slam };
  }

  // ---- Presence ----

  function sendPresence(now) {
    if (!G.room || now - G.presenceAt < 50) return;
    G.presenceAt = now;
    const pIdx = Math.max(0, PATTERNS.findIndex((p) => p.id === save.pattern));
    const p = { v: 1, s: 'title', r: 'L', t: Math.round(G.world.t * 1000) / 1000, p: pIdx, m: null };
    if (G.screen === 'game' && (G.mode === 'lobby' || G.mode === 'round')) {
      p.s = G.mode === 'lobby' ? 'lobby' : G.world.get(G.myId) ? 'in' : 'watch';
      p.r = G.mode === 'lobby' ? 'L' : G.rid;
      p.m = G.world.get(G.myId) ? G.world.sample(G.myId) : null;
      if (G.mode === 'round' && G.match.isHost) {
        const b = [];
        for (const e of G.world.entries.values()) if (e.role === 'bot') b.push([e.id, ...G.world.sample(e.id)]);
        if (b.length) p.b = b;
      }
    } else if (G.screen === 'game' && G.mode === 'results') p.s = 'watch';
    safe(() => G.room.setPresence(p));
  }

  function onPresence(player, p) {
    G.patterns.set(player.id, p.p);
    const lk = lookCache.looks.get(player.id);
    if (lk && lk.pattern !== PATTERNS[p.p]?.id && player.id !== G.myId) refreshLooks();
    if (G.mode === 'lobby') {
      if (p.s === 'lobby' && p.r === 'L' && p.m) {
        let e = G.world.get(player.id);
        if (!e) {
          const order = [...G.room.players.keys()];
          e = G.world.add(player.id, { role: 'remote', index: Math.max(0, order.indexOf(player.id)) % 5 });
          refreshLooks();
        }
        G.world.applySample(player.id, p.m, p.t);
      } else if (G.world.get(player.id) && player.id !== 'biscuit') G.world.remove(player.id);
    } else if (G.mode === 'round' && p.r === G.rid) {
      if (p.m) G.world.applySample(player.id, p.m, p.t);
      if (player.id === G.room.host && !G.match.isHost) for (const [id, s] of p.b) G.world.applySample(id, s, p.t);
    }
  }

  // ---- Lobby choices ----

  function pickBed(id) {
    if (!G.room || !G.match || G.mode !== 'lobby' || !G.room.isHost) return;
    if (!bedOpen(save, id) && !AUTO) return;
    sfx.tap();
    safe(() => G.room.setSetting('bed', id));
    clearReadyAfterChange();
  }
  function pickRounds() {
    if (!G.room || !G.match || G.mode !== 'lobby' || !G.room.isHost) return;
    sfx.tap();
    const cur = Number(G.room.settings?.rounds) === 5 ? 5 : 3;
    safe(() => G.room.setSetting('rounds', cur === 5 ? 3 : 5));
    clearReadyAfterChange();
  }
  function clearReadyAfterChange() {
    const others = [...G.room.players.values()].some((p) => p.id !== G.myId && p.ready);
    if (others && G.room.kind !== 'public') safe(() => G.room.clearReady());
  }
  function cyclePattern() {
    sfx.tap();
    const open = PATTERNS.filter((p) => patternOpen(save, p.id));
    const i = open.findIndex((p) => p.id === save.pattern);
    save.pattern = open[(i + 1) % open.length]?.id ?? 'plain';
    writeSave(ow, save);
    refreshLooks();
  }

  // ---- Screens ----

  function play() {
    if (G.screen !== 'title') return;
    startAudio();
    sfx.tap();
    G.screen = 'game';
    safe(() => G.room?.hideLobby?.(false));
    setMusic('box');
  }
  function playAgain() {
    if (G.mode !== 'results') return;
    sfx.tap();
    G.wantReady = true;
    if (G.match?.isHost) safe(() => G.match.skip());
  }
  function pauseNow() {
    if (G.mode !== 'round' || !solo() || G.paused) return;
    G.paused = true;
    suspendAudio(true);
  }
  function resume() {
    if (!G.paused) return;
    G.paused = false;
    startAudio();
    suspendAudio(false);
    G.net?.setOffset(G.off);
  }
  safe(() => ow?.on?.('pause', () => pauseNow()));
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) pauseNow();
  });

  addEventListener('keydown', (e) => {
    if (!e.isTrusted || e.repeat) return;
    if (G.screen === 'game') startAudio();
    const go = e.code === 'Space' || e.code === 'Enter';
    if (!go) return;
    if (G.screen === 'title') {
      e.preventDefault();
      input.clear();
      play();
    } else if (G.mode === 'results' && e.code === 'Enter') playAgain();
    else if (G.paused) resume();
  });
  // Any tap in the game wakes the sound (iOS stays silent until a tap in the frame).
  addEventListener('pointerdown', () => {
    if (G.screen === 'game') startAudio();
  }, { passive: true });

  // ---- Badges, boards ----

  const awarded = new Set();
  function award(id) {
    if (!BADGES.includes(id) || awarded.has(id) || AUTO) return;
    awarded.add(id);
    safe(() => ow?.badges?.award(id)?.catch?.(() => {}));
  }

  function onResults(standings, mine) {
    if (!mine || AUTO) return;
    const bed = validBed(G.match.settings?.bed);
    const knocks = G.myKnocks.length;
    const news = bankMatch(save, { bed, place: mine.place, roundsWon: G.roundsWon, knockoffs: knocks });
    writeSave(ow, save);
    const lines = [];
    const starNames = ['Won on this bed', 'Untouchable', 'Quick win'];
    for (const s of news.stars) lines.push({ star: starNames[s] });
    if (news.unlocked) lines.push(`${bedById(news.unlocked).name} unlocked`);
    if (news.best) lines.push(`Fastest round win: ${news.best.toFixed(1)} s`);
    for (const p of news.patterns) lines.push(`New pyjamas: ${PATTERNS.find((x) => x.id === p)?.name ?? p}`);
    G.resultsNews = lines;
    if (news.stars.length) news.stars.forEach((_, i) => setTimeout(() => sfx.star(i), 600 + i * 260));
    if (mine.place === 1) {
      if (bed === 'bunk') award('bunk-boss');
      if (bed === 'water') award('making-waves');
      if (BED_IDS.every((id) => (save.won[id] ?? 0) > 0)) award('five-beds');
    }
    safe(() => ow?.leaderboards?.submit('knockoffs', save.knockoffs)?.catch?.(() => {}));
    safe(() => ow?.leaderboards?.submit('wins', save.wins)?.catch?.(() => {}));
    if (news.best) safe(() => ow?.leaderboards?.submit(`fastest-${bed}`, news.best, { lowerIsBetter: true })?.catch?.(() => {}));
  }

  // ---- Events from the bed ----

  function surfaceTop(si) {
    return G.world.bed.surfaces[si]?.top ?? G.world.bed.floor;
  }

  function handle(events) {
    const live = G.mode === 'round' || G.mode === 'lobby' || G.mode === 'offline';
    const audible = G.screen === 'game';
    for (const ev of events) {
      const mine = ev.id === G.myId && live;
      switch (ev.type) {
        case 'slam':
          if (mine) {
            G.stats.slams++;
            if (audible) sfx.tuck();
            G.hintsShown.add('slam');
            if (G.mode === 'lobby' || G.mode === 'round') G.net?.sendSlam(G.myId, ev.n, ev.plan, false);
          } else if (ev.role === 'bot' && G.mode === 'round' && G.match?.isHost) G.net.sendSlam(ev.id, ev.n, ev.plan, true);
          break;
        case 'impact': {
          const top = surfaceTop(ev.si);
          view.fx.slamBurst(ev.x, top, ev.z, ev.e, hexOf(ev.id));
          if (audible) sfx.whump(ev.e, mine ? 1 : 0.55);
          view.stage.addTrauma(mine ? 0.28 + ev.e * 0.12 : 0.1 + ev.e * 0.08);
          if (mine && (G.mode === 'round' || G.mode === 'lobby')) award('first-slam');
          break;
        }
        case 'saved':
          if (mine) {
            if (audible) sfx.phew();
            if (G.mode === 'round') award('saved-it');
          }
          break;
        case 'launch':
          G.lastLaunch.set(ev.id, hexOf(ev.by));
          if (audible) sfx.launch();
          if (mine) {
            G.myLaunchesRound++;
            launchHints(ev);
          }
          view.stage.addTrauma(mine ? 0.3 : 0.06);
          break;
        case 'overEdge':
          if (audible && (mine || G.mode !== 'attract')) sfx.fall();
          break;
        case 'fall':
          view.fx.stars(ev.x, G.world.bed.floor + 0.8, ev.z, 6);
          view.fx.puff(ev.x, G.world.bed.floor + 0.1, ev.z, 8, { size: 0.6, speed: 2 });
          if (audible) sfx.bonk(mine ? 1 : 0.6);
          view.stage.addTrauma(0.18);
          if (G.mode === 'round') {
            if (mine) G.net?.fell(G.myId, ev.by, ev.t, ev.kind, false);
            else if (ev.role === 'bot' && G.match?.isHost) G.net.fell(ev.id, ev.by, ev.t, ev.kind, true);
            if (solo() && G.match?.isHost && !G.paused && !settings.reduced) G.slowUntil = performance.now() + 450;
          }
          if (ev.id === 'biscuit' && G.mode !== 'attract') G.hintsShown.add('knock');
          break;
        case 'land':
          if (audible && G.mode !== 'attract') {
            if (mine) sfx.boing(1, 0.7);
            else if (Math.random() < 0.35) sfx.boing(0.6, 0.12);
          }
          if (ev.launched) view.fx.puff(ev.x, surfaceTop(ev.si), ev.z, 5, { size: 0.45, speed: 1.4 });
          if (mine && ev.rim && audible) sfx.teeter();
          break;
        case 'pillow': {
          const thrower = G.world.get(ev.id);
          const spot = view.rugSpot(G.world.bed, thrower?.index ?? 0);
          view.fx.throwPillow(spot.x, spot.y + 0.7, spot.z, ev.x, surfaceTop(ev.si) + 0.2, ev.z, G.world.t, ev.at, hexOf(ev.id));
          G.pillowsDue.push({ at: ev.at, x: ev.x, z: ev.z, si: ev.si });
          if (audible) sfx.pillowThrow();
          if (!ev.remote) {
            if (mine) {
              G.hintsShown.add('throw');
              G.net?.sendPillow(G.myId, ev.n, ev, false);
            } else if (ev.role === 'bot' && G.mode === 'round' && G.match?.isHost) G.net.sendPillow(ev.id, ev.n, ev, true);
          }
          break;
        }
        case 'wall':
        case 'side':
          if (mine && audible) sfx.wall();
          break;
        case 'post':
          if (audible) sfx.post();
          break;
        case 'bonk':
          if (audible && mine) sfx.bonk(0.4);
          break;
        case 'respawn': {
          const e = G.world.get(ev.id);
          if (e) view.fx.puff(e.body.x, surfaceTop(e.body.si), e.body.z, 8, { size: 0.5 });
          break;
        }
        default:
      }
    }
    // Pillows landing.
    for (let i = G.pillowsDue.length - 1; i >= 0; i--) {
      const p = G.pillowsDue[i];
      if (G.world.t >= p.at) {
        G.pillowsDue.splice(i, 1);
        view.fx.feathers(p.x, surfaceTop(p.si) + 0.3, p.z, 7);
        view.fx.puff(p.x, surfaceTop(p.si), p.z, 6, { size: 0.5 });
        if (audible) sfx.pillowLand();
      }
    }
  }

  // ---- Hints: 2-5 words, the control the player last used ----

  const H = (keys, touch) => (input.touch ? touch : keys);
  function launchHints(ev) {
    const n = save.hints.launch ?? 0;
    if (n < 2) {
      save.hints.launch = n + 1;
      showHint('Steer back!', 1.6);
    }
    const me = G.world.get(G.myId)?.body;
    if (!me) return;
    const len = Math.hypot(me.vx, me.vz) || 1;
    const edge = edgeAlong(G.world.bed, Math.max(0, me.si), me.x, me.z, me.vx / len, me.vz / len);
    const ns = save.hints.drop ?? 0;
    if (edge < 2.4 && ns < 2) {
      save.hints.drop = ns + 1;
      setTimeout(() => showHint(H('SPACE to drop!', 'Tap SLAM to drop!'), 1.4), 260);
    }
    writeSave(ow, save);
  }
  let hintUntil = 0;
  function showHint(text, secs) {
    G.hint = text;
    hintUntil = performance.now() + secs * 1000;
  }
  function currentHint() {
    if (G.hint && performance.now() < hintUntil) return G.hint;
    G.hint = null;
    const e = G.world.get(G.myId);
    if (!e || G.screen !== 'game') return null;
    if (G.mode === 'lobby' || G.mode === 'offline') {
      if (G.steerTime < 0.6 && !save.hints.steer) return H('WASD to steer', 'Stick to steer');
      if (!save.hints.steer) {
        save.hints.steer = 1;
        writeSave(ow, save);
      }
      if (G.stats.slams === 0 && !save.hints.slam) return H('SPACE to slam', 'Tap SLAM');
      if (!save.hints.slam && G.stats.slams > 0) {
        save.hints.slam = 1;
        writeSave(ow, save);
      }
      if (G.stats.slams > 0 && !G.hintsShown.has('knock') && !e.body.out) {
        const bis = G.world.get('biscuit');
        if (bis && !bis.body.out) return 'Knock it off!';
      }
      return null;
    }
    if (G.mode === 'round') {
      if (e.body.out && !G.hintsShown.has('throw') && G.world.t > e.body.outAt + 1.2) return H('SPACE to throw pillows', 'Throw pillows!');
    }
    return null;
  }

  // ---- Falls the host recorded: the verse, who did it ----

  function newFalls() {
    if (G.mode !== 'round') return;
    const falls = G.match.data?.falls ?? [];
    if (falls.length < G.seenFalls) G.seenFalls = 0;
    while (G.seenFalls < falls.length) {
      const f = falls[G.seenFalls++];
      const seats = G.match.seats.length;
      const left = seats - G.seenFalls;
      const e = G.world.get(f.id);
      if (e && !e.body.out) {
        markOut(e, false);
        if (e.role === 'remote') e.body.outAt = G.world.t;
      }
      const pieces = [];
      if (f.how === 'away') pieces.push({ text: `${nameOf(f.id).toUpperCase()} dozed off`, color: hexOf(f.id) });
      else if (f.by) {
        pieces.push({ text: nameOf(f.by).toUpperCase(), color: hexOf(f.by) }, { text: f.kind === 'pillow' ? ' pillowed ' : ' bonked ' }, { text: nameOf(f.id).toUpperCase(), color: hexOf(f.id) });
      } else pieces.push({ text: `${nameOf(f.id).toUpperCase()} fell off`, color: hexOf(f.id) });
      if (left >= 1) {
        ui.banner(verseFor(left), pieces, left <= 1 ? 4.5 : 2.8);
        if (G.screen === 'game') {
          sfx.verse(left);
          sfx.zip();
        }
      }
      // +1 flies to the knocker's plush.
      if (f.by) {
        const head = view.headOf(f.id);
        const to = ui.plushRect(f.by);
        if (head && to) {
          const from = view.toScreen(head.x, head.y, head.z, innerWidth, innerHeight);
          ui.floater('+1', from, to, hexOf(f.by));
        }
      }
      if (f.by === G.myId) {
        G.myKnocks.push(f);
        if (f.kind === 'pillow') award('pillow-fight');
        const pair = G.myKnocks.filter((k) => k.kind === 'slam' && Math.abs(k.at - f.at) < 1.6);
        if (f.kind === 'slam' && pair.length >= 2) award('double-bounce');
      }
      if (f.id === G.myId) award('bumped-head');
    }
  }

  function roundEnded() {
    const d = G.match.data ?? {};
    const winner = d.winner;
    if (G.screen === 'game') sfx.door();
    if (winner) ui.banner('NO MORE MONKEYS JUMPING ON THE BED!', [{ text: `${nameOf(winner).toUpperCase()} WINS THE ROUND`, color: hexOf(winner) }], 5);
    else ui.banner("MAMA'S HOME!", [{ text: 'Everyone still jumping +1' }], 5);
    setMusic('off');
    if (winner === G.myId) {
      G.roundsWon.push({ untouched: G.myLaunchesRound === 0, seconds: d.endT || 0 });
      award('no-more-monkeys');
      if (G.myLaunchesRound === 0) award('untouchable');
    }
    // Points fly to the plushes.
    setTimeout(() => {
      const pts = G.match?.last?.points ?? {};
      for (const [id, p] of Object.entries(pts)) {
        if (!p) continue;
        const head = view.headOf(id);
        const to = ui.plushRect(id);
        if (!head || !to) continue;
        const from = view.toScreen(head.x, head.y, head.z, innerWidth, innerHeight);
        ui.floater(`+${p}`, from, to, hexOf(id));
      }
    }, 1400);
  }

  // ---- The frame ----

  let lastNow = performance.now();
  let anim = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, Math.max(0, (now - lastNow) / 1000));
    lastNow = now;
    anim += dt;
    if (G.closed) {
      draw(dt, now);
      return;
    }
    syncMode();
    const phaseKey = `${G.mode}|${G.rid}|${G.match?.phase ?? ''}`;
    if (phaseKey !== G.phaseKey) {
      const was = G.phaseKey;
      G.phaseKey = phaseKey;
      if (G.mode === 'round' && G.match.phase === 'roundEnd' && !was.endsWith('roundEnd')) {
        G.roundEndAt = now;
        roundEnded();
      }
      if (G.mode === 'round' && G.match.phase === 'round') {
        ui.clearBanner();
        const seats = G.match.seats.length;
        const firstMatch = G.match.round === 1 && (save.matches ?? 0) === 0;
        if (G.match.round === 1) ui.banner(verseFor(seats), firstMatch ? [{ text: 'Stay on. Knock them off.' }] : null, 2.6);
        else ui.banner(`ROUND ${G.match.round}`, [{ text: verseFor(seats) }], 2.2);
        if (G.screen === 'game') sfx.count(0);
      }
      if (G.mode === 'results' && G.screen === 'game') sfx.fanfare();
      if (G.screen === 'title') safe(() => G.room?.hideLobby?.(true));
      if (G.mode === 'lobby' && G.wantReady) {
        G.wantReady = false;
        safe(() => G.match.ready(true));
      }
    }
    // Countdown (our own, timed to the room).
    if (G.mode === 'lobby' && G.match?.phase === 'countdown' && G.screen === 'game') {
      const c = G.match.countdown;
      const n = c === null ? null : Math.max(1, Math.ceil(c));
      if (n !== G.countN) {
        G.countN = n;
        if (n !== null) sfx.count(n);
      }
      ui.count(n);
    } else if (performance.now() < G.jumpUntil && G.screen === 'game') ui.count(0);
    else {
      G.countN = null;
      ui.count(null);
    }
    // Host change: bots move to (or from) this page.
    if (G.mode === 'round') {
      const host = !!G.match.isHost;
      for (const e of G.world.entries.values()) {
        if (!e.brainSpec) continue;
        if (host && e.role === 'remote') G.world.setRole(e.id, 'bot', e.brainSpec);
        else if (!host && e.role === 'bot') G.world.setRole(e.id, 'remote');
      }
      newFalls();
    }
    // Autoplay readies itself.
    if (AUTO && G.mode === 'lobby' && G.match && !G.room.players.get(G.myId)?.ready) {
      if (!G.autoReadyAt) G.autoReadyAt = now + 2500;
      if (now > G.autoReadyAt) {
        G.autoReadyAt = 0;
        const want = params.get('bed');
        if (want && BED_IDS.includes(want) && G.room.isHost && G.room.settings?.bed !== want) safe(() => G.room.setSetting('bed', want));
        else safe(() => G.match.ready(true));
      }
    }
    if (G.paused && !solo()) G.paused = false;
    // Run the bed.
    const tgt = G.paused ? G.world.t : target(dt);
    const inp = myInput(dt);
    const frozen = G.mode === 'round' && G.match.phase === 'roundEnd' && G.world.t >= (G.match.data?.endT ?? 0) + 0.65;
    if (!frozen) handle(G.world.advance(tgt, inp));
    else input.takeSlam();
    if (G.mode === 'attract' || G.mode === 'offline') attractTick();
    G.world.leader = leaderId() ?? '';
    // Wild springs.
    if (G.mode === 'round' && G.match.phase === 'round') {
      const lv = levelAt(G.world.t);
      const stage = G.world.t >= ROUND.overAt ? 2 : G.world.t >= ROUND.wildAt ? 1 : 0;
      if (stage > G.wildSeen) {
        G.wildSeen = stage;
        if (G.world.t - (stage === 2 ? ROUND.overAt : ROUND.wildAt) < 2) {
          ui.banner(stage === 2 ? 'WILDER STILL!' : 'WILD SPRINGS!', [{ text: 'Bigger bounces' }], 2.4);
          if (G.screen === 'game') sfx.alarm();
          view.stage.addTrauma(0.3);
        }
      }
      setTempo(lv.w > 0.5 ? 140 : 116);
    }
    sendPresence(now);
    setControls();
    draw(dt, now);
  }

  function attractTick() {
    if (G.mode !== 'attract') return;
    let alive = 0;
    for (const e of G.world.entries.values()) if (!e.body.out) alive++;
    if (alive <= 1 || G.world.t > 75) {
      if (!G.attractEnd) G.attractEnd = G.world.t + 3;
      else if (G.world.t > G.attractEnd) G.mode = '';
    }
  }

  function leaderId() {
    if (G.mode !== 'round' || !G.match) return null;
    let best = null;
    let bp = 0;
    let tie = false;
    for (const [id, p] of Object.entries(G.match.scores ?? {})) {
      if (p > bp) {
        bp = p;
        best = id;
        tie = false;
      } else if (p === bp && p > 0) tie = true;
    }
    return tie ? null : best;
  }

  function setControls() {
    const e = G.world.get(G.myId);
    let key = 'none';
    if (G.screen === 'game' && e && !G.paused && (G.mode === 'lobby' || G.mode === 'round' || G.mode === 'offline')) key = e.body.out ? 'throw' : 'slam';
    if (key === G.controlsKey) return;
    G.controlsKey = key;
    safe(() => {
      if (key === 'none') ow?.controls?.set(null);
      else ow?.controls?.set({ stick: 'analog', zone: 'wide', buttons: [{ id: 'slam', label: key === 'throw' ? 'Throw' : 'Slam', key: ' ' }] });
    });
  }

  // ---- Drawing and layout ----

  let quality = settings.quality;
  // The platform's UI moved (menu, lobby strip, touch controls): lay out again on the next frame.
  safe(() => ow?.on?.('reserved', () => {
    G.stripKey = null;
    G.bandDrawn = null;
  }));
  function reserved() {
    const r = safe(() => ow.ui.reserved) ?? null;
    let menuBottom = 70;
    let lobbyTop = innerHeight - 88;
    let menuRight = 150;
    if (Array.isArray(r)) {
      menuBottom = 0;
      menuRight = 0;
      for (const a of r) {
        if (a.kind === 'menu') {
          menuBottom = Math.max(menuBottom, a.y + a.h);
          if (a.x < innerWidth / 2) menuRight = Math.max(menuRight, a.x + a.w);
        }
        if (a.kind === 'lobby') lobbyTop = Math.min(lobbyTop, a.y);
      }
      if (!r.some((a) => a.kind === 'lobby')) lobbyTop = innerHeight;
    }
    return { menuBottom, lobbyTop, menuRight };
  }

  function draw(dt, now) {
    const w = innerWidth;
    const h = innerHeight;
    const q = settings.quality;
    if (q !== quality) {
      quality = q;
      view.setQuality(q, G.world.bed);
    }
    const bed = G.world.bed;
    const res = reserved();
    const narrow = w < 640;
    const stripTop = narrow ? res.menuBottom + 6 : 8;
    ui.layout(stripTop);
    // What's on screen.
    const inRound = G.mode === 'round';
    const showStrip = inRound && G.screen === 'game';
    const { looks } = lookCache;
    if (showStrip) {
      const falls = new Set((G.match.data?.falls ?? []).map((f) => f.id));
      const cap = leaderId();
      const seats = G.match.seats.map((s) => ({ id: s.id, name: nameOf(s.id), hex: hexOf(s.id), symbol: COLORS.find((c) => c.hex === hexOf(s.id))?.symbol ?? 'diamond', points: G.match.scores?.[s.id] ?? 0, out: falls.has(s.id), me: s.id === G.myId, cap: s.id === cap }));
      const key = JSON.stringify(seats);
      if (key !== G.stripKey) {
        G.stripKey = key;
        ui.strip(seats);
      }
    } else if (G.stripKey !== '') {
      G.stripKey = '';
      ui.strip(null);
    }
    const sr = ui.stripRect();
    if (showStrip) {
      const t = G.match.phase === 'round' ? G.world.t : Math.min(ROUND.endAt, G.match.data?.endT ?? G.world.t);
      const ringing = (t >= ROUND.wildAt && t < ROUND.wildAt + 2) || (t >= ROUND.overAt && t < ROUND.overAt + 2);
      ui.clock(t, G.match.round, G.match.rounds || 3, ringing);
      if (sr && (narrow || sr.right + 80 > w)) ui.placeClock(w - 76, sr.bottom + 8);
      else if (sr) ui.placeClock(sr.right + 12, stripTop + 2);
    } else ui.clock(null);
    ui.placeBanner(sr ? sr.bottom + (narrow && showStrip ? 92 : 12) : narrow ? res.menuBottom + 20 : 96);
    ui.tickBanner();
    // Lobby band.
    if (G.mode === 'lobby' && G.screen === 'game') {
      const hostPicks = !!G.room?.isHost;
      const cur = validBed(G.room.settings?.bed);
      const pat = PATTERNS.find((p) => p.id === save.pattern) ?? PATTERNS[0];
      const bandKey = `${hostPicks}|${cur}|${G.room.settings?.rounds}|${pat.id}|${JSON.stringify(save.stars)}`;
      if (G.bandDrawn !== bandKey) {
        G.bandDrawn = bandKey;
        ui.band({
          host: hostPicks,
          rounds: Number(G.room.settings?.rounds) === 5 ? 5 : 3,
          beds: BEDS.map((b) => ({ id: b.id, name: b.name, short: SHORT[b.id], stars: save.stars[b.id] ?? [0, 0, 0], locked: !bedOpen(save, b.id) && !AUTO, on: b.id === cur })),
          pattern: { name: pat.name, css: PATTERN_CSS[pat.id] ?? '#9C6CF0' },
        });
      }
    } else if (G.bandDrawn !== '') {
      G.bandDrawn = '';
      ui.band(null);
    }
    if (G.screen === 'title') ui.title(true, starCount(save), save.wins ? `${save.wins} ${save.wins === 1 ? 'win' : 'wins'}` : '', input.touch);
    else ui.title(false);
    // Camera.
    const box = bed.box;
    const margins = { top: 0, bottom: 0, left: 10, right: 10 };
    let fb = { x0: box.x0 - 0.4, x1: box.x1 + 0.4, y0: -0.5, y1: 2.2, z0: box.z0 - 0.4, z1: box.z1 + 0.6 };
    let opts = {};
    if (G.screen === 'title') {
      margins.top = Math.min(h * 0.42, 210);
      margins.bottom = h * 0.12;
      opts = { pitch: h > w ? 0.85 : 0.6 };
    } else if (G.mode === 'lobby' || G.mode === 'offline') {
      const br = ui.bandRect();
      margins.top = (br && br.height ? Math.max(br.bottom, res.menuBottom) : res.menuBottom + 80) + 30;
      margins.bottom = h - res.lobbyTop + 6;
      fb = { ...fb, z1: box.z1 + 2.4, y0: bed.floor };
    } else if (G.mode === 'results') {
      margins.top = h * 0.1;
      margins.bottom = h * 0.1;
      // A short landscape screen has the card on the right: the winner stays in view on the left.
      if (w > h && h <= 500) margins.right = Math.min(400, w * 0.5) + 24;
      opts = { pitch: 0.55 };
    } else {
      margins.top = (sr ? sr.bottom : 90) + 8;
      margins.bottom = h > w ? h * 0.2 : 16;
      if (G.match?.phase === 'roundEnd' && view.room) {
        const d = view.room.door;
        fb = { x0: Math.min(fb.x0, d.x - 2), x1: Math.max(fb.x1, d.x + 2), y0: bed.floor, y1: d.y + 3.5, z0: d.z, z1: box.z1 + 1 };
        margins.top = 30;
      }
    }
    if (bed.id === 'bunk') fb.y1 = Math.max(fb.y1, 3.2);
    margins.top = Math.min(margins.top, h * 0.45);
    margins.bottom = Math.min(margins.bottom, h * 0.35);
    view.frame(fb, w, h, margins, opts, dt);
    // Door at the round end.
    const doorWant = G.mode === 'round' && G.match?.phase === 'roundEnd' && now - G.roundEndAt > 500 ? 1 : 0;
    G.door += (doorWant - G.door) * Math.min(1, dt * (doorWant ? 5 : 3));
    const lv = G.mode === 'round' ? levelAt(G.world.t) : { w: 0 };
    view.room?.update(anim, { wild: G.mode === 'round' && G.match?.phase === 'round' ? lv.w : 0, door: G.door, spot: quality === 'high', ring: G.mode === 'round' && ((G.world.t >= ROUND.wildAt && G.world.t < ROUND.wildAt + 2) || (G.world.t >= ROUND.overAt && G.world.t < ROUND.overAt + 2)) ? 1 : 0 });
    // Extras: bots on the rug in the lobby, the losers on the rug in the results.
    const extras = [];
    if (G.mode === 'lobby' && G.match && G.screen === 'game') {
      const n = Math.min(4, G.match.lobby?.bots ?? 0);
      for (let i = 0; i < n; i++) {
        const c = CAST[i];
        extras.push({ id: `rug${i}`, look: lookOf(c.color, c.pattern, c.extra), spot: view.rugSpot(bed, i + 1, 5) });
      }
    }
    if (G.mode === 'results') {
      const res2 = G.match.results ?? [];
      res2.slice(1).forEach((s, i) => extras.push({ id: s.id, look: looks.get(s.id) ?? lookOf(4, 'plain', ''), spot: view.rugSpot(bed, i, Math.max(2, res2.length - 1)) }));
    }
    if (G.mode === 'round' && G.match?.spectating && G.screen === 'game') {
      extras.push({ id: 'watcher', look: lookOf(4, save.pattern, ''), spot: { ...view.rugSpot(bed, 2), z: bed.box.z1 + 2.8 } });
    }
    const frozen = G.mode === 'round' && G.match?.phase === 'roundEnd';
    view.draw(G.world, {
      looks, me: G.screen === 'game' ? G.myId : null, anim, dt, extras, colorOf: hexOf, lastLaunch: G.lastLaunch, trail: true,
      guilty: frozen && G.world.t >= (G.match.data?.endT ?? 0) + 0.6, winner: G.match?.data?.winner, cap: leaderId(),
      cheer: G.mode === 'results' ? (G.match.results?.[0]?.id ?? null) : G.mode === 'attract' && G.attractEnd ? [...G.world.entries.values()].find((e) => !e.body.out)?.id : null,
      hideRing: G.mode === 'attract' || G.paused,
      sleepy: (id) => G.world.level.w < 0.5 && G.mode === 'round',
    });
    if (G.mode === 'results' && Math.random() < dt * 6) view.fx.feathers((Math.random() - 0.5) * 6, 4, (Math.random() - 0.5) * 6, 1);
    const pr = settings.pr();
    const sizeKey = `${w}x${h}@${pr}`;
    if (sizeKey !== G.sizeKey) {
      G.sizeKey = sizeKey;
      view.stage.resize(w, h, pr);
    }
    view.render(dt, anim, settings.reduced);
    if (DEBUG) document.body.dataset.calls = String(view.stage.renderer.info.render.calls);
    // DOM over the world: name tags, the hint, the invite patch, results.
    const tags = [];
    if (G.mode === 'lobby' && G.screen === 'game') {
      for (const e of G.world.entries.values()) {
        if (e.id === 'biscuit') continue;
        const p = G.room?.players?.get(e.id);
        const head = view.headOf(e.id);
        if (!head || !p) continue;
        const s = view.toScreen(head.x, head.y + 0.45, head.z, w, h);
        const ready = G.match?.lobby?.players?.find((x) => x.id === e.id)?.ready ?? false;
        tags.push({ id: e.id, x: s.x, y: s.y, name: e.id === G.myId ? 'You' : p.name.slice(0, 16), ready, host: p.id === G.room.host && G.room.kind !== 'public' });
      }
    }
    if (G.mode === 'round' && G.match?.spectating && G.screen === 'game') {
      const head = view.headOf('watcher');
      if (head) {
        const s = view.toScreen(head.x, head.y + 0.5, head.z, w, h);
        tags.push({ id: 'watcher', x: s.x, y: s.y, name: 'Next round', ready: null, next: true });
      }
    }
    ui.tags(tags);
    if (G.mode === 'lobby' && G.screen === 'game' && (G.match?.lobby?.bots ?? 0) > 0) {
      // The empty end of the rug: a seat a friend could take.
      const spot = view.rugSpot(bed, 0, 5);
      const s = view.toScreen(spot.x, bed.floor + 0.9, spot.z, w, h);
      ui.invite({ x: Math.min(w - 70, Math.max(70, s.x)), y: Math.min(res.lobbyTop - 54, s.y) });
    } else ui.invite(null);
    // Hint over this page's monkey.
    const hint = currentHint();
    const myHead = view.headOf(G.myId);
    if (hint && myHead) {
      const me = G.world.get(G.myId)?.body;
      let p = view.toScreen(myHead.x, myHead.y + 0.6, myHead.z, w, h);
      // Above the name tag in the lobby.
      if (G.mode === 'lobby') p = { x: p.x, y: p.y - 30 };
      if (me?.out) {
        const aim = view.toScreen(me.aimX, bed.surfaces[0].top + 0.4, me.aimZ, w, h);
        p = aim;
      }
      ui.hint(hint, Math.min(w - 90, Math.max(90, p.x)), Math.max(sr ? sr.bottom + 40 : 80, p.y));
    } else ui.hint(null);
    // Results.
    if (G.mode === 'results' && G.screen === 'game') {
      const rs = G.match.results ?? [];
      const host = G.match.isHost;
      const secs = G.match.secondsLeft;
      const pub = G.room.kind === 'public';
      ui.results({
        key: `${G.rid}|${G.resultsNews.length}|${rs.length}|${G.wantReady}`,
        title: rs[0] ? `${nameOf(rs[0].id).toUpperCase()} WINS!` : 'RESULTS',
        rows: rs.map((s) => ({ place: s.place, name: s.id === G.myId ? `${nameOf(s.id)} (you)` : nameOf(s.id), hex: hexOf(s.id), points: s.points, me: s.id === G.myId })),
        news: G.resultsNews,
        again: host || pub || G.room.kind === 'solo' ? (G.wantReady ? null : 'Play again') : null,
        wait: G.wantReady ? 'Ready for the next one' : !host && !pub ? 'Waiting for the host' : secs !== null ? `Lobby in ${Math.ceil(secs)}` : '',
      });
    } else {
      ui.results(null);
      if (G.mode !== 'results') G.resultsNews = G.mode === 'round' ? G.resultsNews : [];
    }
    ui.pause(G.paused && G.mode === 'round');
  }

  if (AUTO) startAudio();
  else safe(() => G.room?.hideLobby?.(true));
  requestAnimationFrame(frame);
}
