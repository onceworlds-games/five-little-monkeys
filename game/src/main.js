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
import { startAudio, sfx, setMusic, setTempo, setLayers, suspendAudio } from './audio.js';
import { loadSave, writeSave, starCount, bedOpen, bankMatch, defaultSave, wornLook, ownership } from './save.js';
import { BEDS, BED_IDS, bedById, edgeAlong } from './sim/beds.js';
import { ROUND, PUMP, TWIST_NAMES, levelAt } from './sim/config.js';
import { verseFor } from './sim/round.js';
import { createBrain } from './sim/brain.js';
import { twistFor } from './sim/twists.js';
import { COLORS, CAST, castByName, threadHex } from './look.js';
import { checkPresence } from './protocol.js';
import { SLOTS, SLOT_NAMES, DEFAULT_LOOK, itemsIn, itemByKey, owns, lookToIndexes, lookFromIndexes } from './wardrobe.js';
import { bankProgress, levelOf, goalsFor, dayOf, streakAlive } from './progress.js';
import { createRushRun } from './rushmode.js';
import { rushFor, RUSH } from './sim/rush.js';
import { itemSwatch } from './swatches.js';

const params = new URLSearchParams(location.search);
const LOCAL = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname) || location.hostname.endsWith('.localhost');
const POSTER = params.get('poster');
const AUTO = LOCAL && params.get('autoplay') === '1';
// ?debug (local only): the frame's draw calls on <body data-calls>, for measuring.
const DEBUG = LOCAL && params.has('debug');
const ow = window.onceworlds ?? null;

const BADGES = ['first-slam', 'bumped-head', 'double-bounce', 'no-more-monkeys', 'untouchable', 'pillow-fight', 'saved-it', 'bunk-boss', 'making-waves', 'five-beds', 'bedtime-box', 'rush-hour'];
const SHORT = { kid: 'KID', bunk: 'BUNK', water: 'WATER', king: 'KING', poster: 'POSTER' };
const BISCUIT = { hex: '#9A6A3E', dark: '#5A3A1E', symbol: '', pattern: 'plain', extra: 'bear', hat: 'none' };
const TOY_NAMES = { mega: 'GOLDEN BANANA', shield: 'PILLOW', spring: 'SPRING' };

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
    lookIdx: new Map(),
    levels: new Map(),
    rush: null,
    rushOver: null,
    resultsData: null,
    lastMegaAt: -99,
    twistShown: '',
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
    wantReady: false,
    door: 0,
    roundEndAt: 0,
    closed: null,
    autoBrain: AUTO ? createBrain('pro', 0.85, 'auto') : null,
    autoReadyAt: 0,
    steerTime: 0,
    lastAway: 0,
  };

  /** What a match (or a Rush run) counts for progress.js. */
  function newStats() {
    return {
      slams: 0, knocks: 0, megaKnocks: 0, pillowKnocks: 0, dizzyKnocks: 0, roundWins: 0, matchWin: false, outlast: 0,
      perfects: 0, streak: 0, bestStreak: 0, saves: 0, toys: 0, closeCalls: 0, topSlams: 0, matches: 0, rushScore: 0,
    };
  }
  const today = () => dayOf(lobbyNow() * 1000);
  let myLook = wornLook(save);

  const ui = createUI(uiRoot, {
    onPlay: () => play(),
    onBed: (id) => pickBed(id),
    onRounds: () => pickRounds(),
    onWardrobe: () => openWardrobe(),
    onWear: (slot, id) => wear(slot, id),
    onWardrobeClose: () => closeWardrobe(),
    onRush: () => startRush(),
    onRushAgain: () => startRush(),
    onRushQuit: () => quitRush(),
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
      onSlam: (owner, m) => {
        if (G.mode !== 'lobby' && G.mode !== 'round') return;
        if (owner === G.myId) return;
        G.world.remoteSlam(owner, m);
      },
      onPillow: (owner, m) => {
        if (G.mode !== 'round' || owner === G.myId) return;
        G.world.remotePillow(owner, m);
      },
      onGrab: (owner, m) => {
        if (G.mode !== 'round' || owner === G.myId) return;
        G.world.remoteGrab(owner, m);
      },
      onHit: (owner, m) => {
        if (G.mode !== 'round' || owner === G.myId) return;
        G.world.remoteHit(owner, m.by);
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

  /** A seat colour and a wardrobe look ({ pj, hat, thread, trail, dance }) as what the renderer draws. */
  function lookOf(colorIndex, wl = DEFAULT_LOOK, extra = '') {
    const c = COLORS[colorIndex] ?? COLORS[4];
    return { hex: c.hex, dark: c.dark, symbol: c.symbol, pattern: wl.pj, hat: wl.hat, thread: wl.thread, trail: wl.trail, dance: wl.dance, extra };
  }
  /** What a player wears: this page's from the save, anyone else's from their presence. */
  function wardrobeOf(id) {
    if (id === G.myId) return myLook;
    const idx = G.lookIdx.get(id);
    return idx ? lookFromIndexes(idx) : DEFAULT_LOOK;
  }
  const castLook = (c) => lookOf(c.color, c.look, c.extra);
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
      if (s.bot) looks.set(s.id, castLook(castByName(s.name) ?? CAST[s.index % 4]));
      else looks.set(s.id, lookOf(free[k++ % free.length] ?? 4, wardrobeOf(s.id), ''));
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
      looks.set(p.id, lookOf(order[i++ % 5], wardrobeOf(p.id), ''));
      names.set(p.id, p.name);
    }
    if (!G.room) {
      looks.set(G.myId, lookOf(4, myLook, ''));
      names.set(G.myId, 'You');
    }
    looks.set('biscuit', BISCUIT);
    names.set('biscuit', 'Biscuit');
    return { looks, names };
  }
  const ATTRACT = [...CAST.map((c) => ({ ...c })), { name: 'Pip', kind: 'pro', color: 4, extra: '', look: { pj: 'checks', hat: 'crown', thread: 'gold', trail: 'stars', dance: 'spin' } }];
  function attractLooks() {
    const looks = new Map();
    const names = new Map();
    ATTRACT.forEach((c, i) => {
      looks.set(`a${i}`, castLook(c));
      names.set(`a${i}`, c.name);
    });
    return { looks, names };
  }
  function rushLooks() {
    const looks = new Map();
    const names = new Map();
    looks.set(G.myId, lookOf(4, myLook, ''));
    names.set(G.myId, 'You');
    for (const e of G.rush?.world.entries.values() ?? []) {
      if (e.id === G.myId) continue;
      const c = CAST[e.index % CAST.length];
      looks.set(e.id, castLook(e.kind === 'pro' || e.kind === 'novice' ? { ...c, extra: '', look: { ...c.look, hat: 'none' } } : CAST.find((x) => x.kind === e.kind) ?? c));
      names.set(e.id, c.name);
    }
    return { looks, names };
  }
  let lookCache = { looks: new Map(), names: new Map() };
  function refreshLooks() {
    if (G.mode === 'attract' || G.mode === 'dress') lookCache = attractLooks();
    else if (G.mode === 'rush') lookCache = rushLooks();
    else if (G.mode === 'lobby' || G.mode === 'offline') lookCache = lobbyLooks();
    else lookCache = seatLooks();
  }
  const hexOf = (id) => lookCache.looks.get(id)?.hex ?? '#FFF1D6';
  const nameOf = (id) => lookCache.names.get(id) ?? 'Someone';
  /** A ring's crest colour: its slammer's thread, or seat colour. */
  const ringOf = (id) => threadHex(lookCache.looks.get(id)?.thread, anim) ?? (id ? hexOf(id) : '#FFF1D6');

  // ---- Modes ----

  const validBed = (id) => (BED_IDS.includes(id) ? id : 'kid');
  function wanted() {
    // A player in a running match (a reload, or readied from the platform's strip) goes straight back to the bed.
    if (G.screen === 'title' && G.match && G.match.phase !== 'lobby' && G.match.me && !G.match.spectating) {
      G.screen = 'game';
      safe(() => G.room?.hideLobby?.(false));
    }
    if (G.screen === 'title') return { mode: 'attract', bed: validBed(save.bed) };
    if (G.screen === 'wardrobe') return { mode: 'dress', bed: validBed(save.bed) };
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
      G.world.reset(w.bed, 0, { lobby: false, seed: `attract${Math.random()}` });
      G.world.grace = 1.5;
      G.world.botGrace = 1.5;
      ATTRACT.forEach((c, i) => G.world.add(`a${i}`, { role: 'bot', index: i, brain: { kind: c.kind, skill: 0.55 + (i % 3) * 0.12, seed: `attract${Math.random()}` } }));
    } else if (w.mode === 'dress') {
      G.localT = 0;
      G.world.reset(w.bed, 0, { lobby: true });
      G.dressRing = 0;
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
      // The round's twist and toys come from the match and the round: the same on every page.
      const twist = twistFor(G.room?.match?.id ?? G.rid, G.match.round);
      G.world.reset(w.bed, 0, { lobby: false, roundId: G.rid, seed: G.rid, twist });
      G.twistShown = '';
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
        G.resultsData = null;
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
    const mp = checkPresence(G.room.me?.presence, G.world.bed);
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
      if (G.paused || performance.now() < (G.stopUntil ?? 0)) G.off += dm;
      else if (performance.now() < G.slowUntil) G.off += dm * 0.7;
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

  function myInput(dt, W = G.world) {
    const e = W.get(G.myId);
    if (!e || G.paused || G.closed) {
      input.takeSlam();
      return { x: 0, z: 0, slam: false };
    }
    if (G.autoBrain && (G.mode === 'round' || G.mode === 'rush')) {
      input.takeSlam();
      const toys = W.liveToys().filter((t) => !t.taken);
      const view = { bed: W.bed, bodies: [...W.entries.values()].map((x) => x.body), waves: W.waves, level: W.level, slamsOn: W.t >= (W.grace ?? 0), leader: '', alive: [...W.entries.values()].filter((x) => !x.body.out).length, toys };
      return G.autoBrain.act(e.body, view, W.t) ?? { x: 0, z: 0, slam: false };
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
    const p = { v: 2, s: 'title', r: 'L', t: Math.round(G.world.t * 1000) / 1000, l: lookToIndexes(myLook), lv: levelOf(save.progress.xp).level, m: null };
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
    if (player.id !== G.myId && p.l) {
      const was = G.lookIdx.get(player.id);
      if (!was || was.join() !== p.l.join()) {
        G.lookIdx.set(player.id, p.l);
        refreshLooks();
      }
    }
    G.levels.set(player.id, p.lv);
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
  // ---- The wardrobe ----

  function openWardrobe() {
    if (G.screen !== 'title') return;
    startAudio();
    sfx.tap();
    G.screen = 'wardrobe';
    G.wardrobeSlot = G.wardrobeSlot ?? 'pj';
  }
  function closeWardrobe() {
    if (G.screen !== 'wardrobe') return;
    sfx.tap();
    G.screen = 'title';
  }
  function wear(slot, id) {
    if (id === null) {
      if (SLOTS.includes(slot) && slot !== G.wardrobeSlot) {
        sfx.tap();
        G.wardrobeSlot = slot;
        G.wardrobeAct = 0;
      }
      return;
    }
    const item = itemsIn(slot).find((i) => i.id === id);
    if (!item) return;
    G.wardrobeSlot = slot;
    if (!owns(item, ownership(save))) {
      sfx.bonk(0.3);
      return;
    }
    sfx.tap();
    save.look[slot] = id;
    myLook = wornLook(save);
    writeSave(ow, save);
    refreshLooks();
    G.wardrobeAct = performance.now();
    G.dressRingAt = 0;
    const s = G.world.bed.surfaces[G.world.bed.surfaces.length - 1];
    view.fx.puff(s.cx, s.top + 0.6, s.cz, 10, { size: 0.5, speed: 2 });
    if (slot === 'pj' || slot === 'hat') view.fx.sparkle(s.cx, s.top + 1.2, s.cz, 10, '#FFE27A');
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
    if (G.paused || !(G.mode === 'rush' || (G.mode === 'round' && solo()))) return;
    if (G.mode === 'rush' && G.rush?.over) return;
    G.paused = true;
    suspendAudio(true);
  }

  // ---- Tonight's Rush ----

  function startRush() {
    if (G.screen !== 'title' && !(G.mode === 'rush' && G.rush?.over)) return;
    startAudio();
    sfx.tap();
    G.rush = createRushRun(today(), G.myId);
    G.rushT = 0;
    G.rushOver = null;
    G.stats = newStats();
    G.screen = 'game';
    G.mode = 'rush';
    G.rid = 'rush';
    G.paused = false;
    G.phaseKey = '';
    ui.rushOver(null);
    ui.clearTimers();
    view.fx.clear();
    G.lastLaunch.clear();
    G.pillowsDue.length = 0;
    view.setBed(G.rush.world.bed);
    refreshLooks();
    safe(() => G.room?.hideLobby?.(true));
    setMusic('play', 120);
    const info = G.rush.info;
    ui.banner("TONIGHT'S RUSH", [{ text: info.twist ? `${bedById(info.bed).name} · ${TWIST_NAMES[info.twist]}` : bedById(info.bed).name }], 2.8, info.twist ? 'twist' : '');
    if (info.twist) sfx.twist(info.twist);
  }
  function quitRush() {
    if (!G.rush) return;
    sfx.tap();
    G.rush = null;
    G.rushOver = null;
    G.paused = false;
    G.mode = '';
    G.screen = 'title';
    ui.rushOver(null);
    ui.rushHud(null);
    ui.clearTimers();
    view.setDark(0);
    G.dark = 0;
    setMusic('box');
  }
  function rushFrame(dt, now) {
    const R = G.rush;
    let rdt = dt;
    if (G.paused || now < (G.stopUntil ?? 0)) rdt = 0;
    else if (now < G.slowUntil) rdt *= 0.6;
    if (!R.over) G.rushT += rdt;
    const n0 = R.world.entries.size;
    const evs = R.advance(G.rushT, myInput(dt, R.world));
    handle(evs, R.world);
    for (const ev of evs) {
      if (ev.type === 'score') {
        const at = view.toScreen(ev.x, R.world.bed.floor + 2.4, ev.z, innerWidth, innerHeight);
        ui.pop(`+${ev.pts}`, at.x, at.y, ev.combo > 1 ? '#FFC23A' : '#FFF1D6', ev.combo > 1 ? `×${ev.combo}` : '');
        sfx.score(ev.combo);
        if (ev.double) ui.banner('DOUBLE!', null, 1.4, 'gold');
      } else if (ev.type === 'hurt') {
        if (ev.left > 0) ui.banner(ev.left === 1 ? 'LAST BANDAGE!' : `${ev.left} BANDAGES LEFT`, null, 1.6);
        view.stage.flash(0.25, '#FF6A5A');
      } else if (ev.type === 'over') finishRush();
    }
    if (R.world.entries.size !== n0) refreshLooks();
    const hd = R.hud();
    setLayers(R.over ? 0 : Math.min(3, Math.floor(R.world.t / 40) + (hd.combo >= 3 ? 1 : 0)));
    draw(dt, now);
  }
  function finishRush() {
    const R = G.rush;
    const st = { ...R.run.stats, matches: 0 };
    const store = AUTO ? JSON.parse(JSON.stringify(save)) : save;
    const prevBest = store.progress.rushBest;
    const prog = bankProgress(store.progress, st, today());
    if (!AUTO) writeSave(ow, save);
    afterBank(prog);
    const score = R.run.score;
    G.rushOver = { score, tonight: store.progress.rush?.best ?? score, best: store.progress.rushBest, newBest: score > prevBest && score > 0, prog, board: AUTO ? [] : null, at: performance.now(), day: today() };
    if (score >= 1000) award('rush-hour');
    sfx.fanfare();
    setMusic('box');
    if (AUTO) return;
    const day = G.rushOver.day;
    submit('rush', score);
    Promise.resolve(safe(() => ow?.leaderboards?.submit('tonight', day * 1e6 + score)))
      .catch(() => null)
      .then(() => safe(() => ow?.leaderboards?.top('tonight', { limit: 100 })))
      .then((r) => {
        if (!r || !G.rushOver || G.rushOver.day !== day) return;
        G.rushOver.board = (r.entries ?? [])
          .filter((e) => Math.floor(e.score / 1e6) === day)
          .slice(0, 8)
          .map((e, i) => ({ rank: i + 1, name: e.player?.name ?? 'Someone', score: Math.round(e.score - day * 1e6), me: e.player?.id === r.me?.player?.id }));
        G.rushKey = '';
      })
      .catch(() => {});
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
    if (e.code === 'Escape' && G.screen === 'wardrobe') {
      closeWardrobe();
      return;
    }
    const go = e.code === 'Space' || e.code === 'Enter';
    if (!go) return;
    if (G.screen === 'title') {
      e.preventDefault();
      input.clear();
      play();
    } else if (G.screen === 'wardrobe' && e.code === 'Enter') closeWardrobe();
    else if (G.mode === 'results' && e.code === 'Enter') playAgain();
    else if (G.mode === 'rush' && G.rush?.over && e.code === 'Enter' && performance.now() - (G.rushOver?.at ?? 0) > 1200) startRush();
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
    if (!mine) return;
    const bed = validBed(G.match.settings?.bed);
    const knocks = G.myKnocks.length;
    G.stats.matchWin = mine.place === 1;
    G.stats.matches = 1;
    // Autoplay (local testing) shows the screens but banks nothing.
    const store = AUTO ? JSON.parse(JSON.stringify(save)) : save;
    const ladder = bankMatch(store, { bed, place: mine.place, roundsWon: G.roundsWon, knockoffs: knocks });
    const prog = bankProgress(store.progress, G.stats, today());
    if (!AUTO) writeSave(ow, save);
    // Stars on the ladder open pyjamas too, and a won bed can open the next.
    for (const k of ladder.patterns) {
      const it = itemByKey(k);
      if (it) prog.unlocks.push(it);
    }
    if (ladder.unlocked) prog.unlocks.push({ slot: 'bed', id: ladder.unlocked, name: bedById(ladder.unlocked).name, what: 'NEW BED' });
    G.resultsData = { rid: `R${G.room?.match?.id ?? ''}`, place: mine.place, bed, prog, stars: store.stars[bed] ?? [0, 0, 0], fresh: ladder.stars, at: performance.now() };
    if (mine.place === 1) sfx.win();
    afterBank(prog);
    if (mine.place === 1) {
      if (bed === 'bunk') award('bunk-boss');
      if (bed === 'water') award('making-waves');
      if (BED_IDS.every((id) => (store.won[id] ?? 0) > 0)) award('five-beds');
    }
    if (AUTO) return;
    submit('knockoffs', save.knockoffs);
    submit('wins', save.wins);
    submit('level', levelOf(save.progress.xp).level);
    if (ladder.best) submit(`fastest-${bed}`, ladder.best, { lowerIsBetter: true });
  }
  const submit = (board, score, o) => safe(() => ow?.leaderboards?.submit(board, score, o)?.catch?.(() => {}));
  /** After a match or a run is banked: badges for the box, the new look if something new is worn. */
  function afterBank(prog) {
    if (prog.box) award('bedtime-box');
    myLook = wornLook(save);
    refreshLooks();
  }

  // ---- Events from the bed ----

  function handle(events, W = G.world) {
    const live = G.mode === 'round' || G.mode === 'lobby' || G.mode === 'offline' || G.mode === 'rush';
    const audible = G.screen === 'game';
    const top = (si) => W.bed.surfaces[si]?.top ?? W.bed.floor;
    const round = G.mode === 'round';
    for (const ev of events) {
      const mine = ev.id === G.myId && live;
      const hostBot = ev.role === 'bot' && round && G.match?.isHost;
      switch (ev.type) {
        case 'slam':
          if (mine) {
            G.stats.slams++;
            if (ev.tier >= PUMP.max) G.stats.topSlams++;
            if (audible) sfx.tuck(ev.tier ?? 0);
            G.hintsShown.add('slam');
            if (G.mode === 'lobby' || round) G.net?.sendSlam(G.myId, ev.n, ev.plan, false);
          } else if (hostBot) G.net.sendSlam(ev.id, ev.n, ev.plan, true);
          break;
        case 'impact': {
          const y = top(ev.si);
          view.fx.slamBurst(ev.x, y, ev.z, ev.e, ringOf(ev.id), ev.mega);
          if (audible) sfx.whump(ev.e, mine ? 1 : 0.55, ev.mega);
          view.stage.addTrauma((mine ? 0.28 + ev.e * 0.12 : 0.1 + ev.e * 0.08) * (ev.mega ? 1.6 : 1));
          if (ev.mega) {
            view.stage.flash(0.35, '#FFD36A');
            if (mine) G.lastMegaAt = W.t;
          }
          if (mine && (G.mode === 'round' || G.mode === 'lobby')) award('first-slam');
          break;
        }
        case 'pump':
          if (mine) {
            if (ev.grade === 2) {
              G.stats.perfects++;
              G.stats.streak = ev.streak;
              G.stats.bestStreak = Math.max(G.stats.bestStreak, ev.streak);
              view.fx.sparkle(ev.x, top(W.get(ev.id)?.body.si ?? 0) + 0.05, ev.z, 6 + ev.tier * 3, ringOf(ev.id));
              if (audible) sfx.pump(ev.streak, ev.tier);
              if (ev.tier >= PUMP.max && ev.streak >= 3) view.stage.punch(0.015);
            } else if (ev.grade === 1) {
              G.stats.streak = 0;
              if (audible) sfx.pump(0, ev.tier, true);
            } else G.stats.streak = 0;
          }
          break;
        case 'saved':
          if (mine) {
            G.stats.saves++;
            if (audible) sfx.phew();
            if (round) award('saved-it');
          }
          break;
        case 'launch':
          G.lastLaunch.set(ev.id, ringOf(ev.by));
          if (audible) sfx.launch(mine ? 1 : 0.5);
          if (mine) {
            G.myLaunchesRound++;
            launchHints(ev);
          }
          view.stage.addTrauma(mine ? 0.34 : 0.08, ev.dx ?? 0, ev.dz ?? 0);
          if (mine || ev.by === G.myId) hitStop(mine ? 90 : 70, ev.mega ? 1 : 0.6);
          break;
        case 'hit':
          if (mine) {
            const v = W.get(ev.on)?.body;
            if (v) view.fx.sparkle(v.x, v.y + 1.1, v.z, 12, '#FFE27A');
            if (audible) sfx.hit();
          }
          break;
        case 'hitOut':
          if (round && (mine || hostBot)) G.net?.sendHit(ev.id, ev.by, ev.at, hostBot);
          break;
        case 'grab': {
          const y = top(W.get(ev.id)?.body.si ?? 0);
          view.fx.grab(ev.x, y + 0.4, ev.z, ev.kind);
          if (audible) sfx.grab(ev.kind, mine ? 1 : 0.5);
          if (mine) {
            G.stats.toys++;
            toast(TOY_NAMES[ev.kind] ?? 'TOY', ev.id, ev.kind === 'mega' ? '#FFC23A' : ev.kind === 'shield' ? '#FFF1D6' : '#7FE08A');
          }
          if (round && !ev.remote && (mine || hostBot)) G.net?.sendGrab(ev.id, ev.k, ev.at, hostBot);
          break;
        }
        case 'shield': {
          const b = W.get(ev.id)?.body;
          if (b) view.fx.feathers(b.x, b.y + 1.0, b.z, 14, { burst: true });
          if (audible) sfx.pillowLand();
          break;
        }
        case 'dizzy':
          if (ev.shaken && mine && audible) sfx.shake();
          break;
        case 'overEdge':
          if (audible && (mine || G.mode !== 'attract')) sfx.fall();
          break;
        case 'fall': {
          view.fx.stars(ev.x, W.bed.floor + 0.8, ev.z, 6);
          view.fx.dust(ev.x, W.bed.floor + 0.05, ev.z, 12);
          if (audible) sfx.bonk(mine ? 1 : 0.6);
          view.stage.addTrauma(0.2);
          if (round) {
            if (mine) G.net?.fell(G.myId, ev.by, ev.t, ev.kind, false);
            else if (hostBot) G.net.fell(ev.id, ev.by, ev.t, ev.kind, true);
          }
          if (mine || ev.by === G.myId) hitStop(mine ? 140 : 120, 1);
          // The last fall of a round: slow motion, the camera on the faller.
          if (round || G.mode === 'attract') {
            let alive = 0;
            for (const e of W.entries.values()) if (!e.body.out) alive++;
            if (alive <= 1) {
              G.focus = { id: ev.id, until: performance.now() + 1500 };
              if (round && solo() && G.match?.isHost && !settings.reduced) G.slowUntil = performance.now() + 1300;
            }
          }
          if (ev.id === 'biscuit' && G.mode !== 'attract') G.hintsShown.add('knock');
          break;
        }
        case 'land':
          if (audible && G.mode !== 'attract') {
            if (mine) sfx.boing(1, 0.7, W.get(ev.id)?.body.tier ?? 0);
            else if (Math.random() < 0.35) sfx.boing(0.6, 0.12, 0);
          }
          if (ev.launched) view.fx.puff(ev.x, top(ev.si), ev.z, 5, { size: 0.45, speed: 1.4 });
          if (mine && ev.launched && ev.rim) G.stats.closeCalls++;
          if (mine && ev.rim && audible) sfx.teeter();
          break;
        case 'pillow': {
          const thrower = W.get(ev.id);
          const spot = view.rugSpot(W.bed, thrower?.index ?? 0);
          view.fx.throwPillow(spot.x, spot.y + 0.7, spot.z, ev.x, top(ev.si) + 0.2, ev.z, W.t, ev.at, hexOf(ev.id));
          G.pillowsDue.push({ at: ev.at, x: ev.x, z: ev.z, si: ev.si });
          if (audible) sfx.pillowThrow();
          if (!ev.remote) {
            if (mine) {
              G.hintsShown.add('throw');
              G.net?.sendPillow(G.myId, ev.n, ev, false);
            } else if (hostBot) G.net.sendPillow(ev.id, ev.n, ev, true);
          }
          break;
        }
        case 'rain':
          G.pillowsDue.push({ at: W.t, x: ev.x, z: ev.z, si: ev.si, rain: true });
          break;
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
        case 'respawn':
        case 'back': {
          const e = W.get(ev.type === 'back' ? G.myId : ev.id);
          if (e) view.fx.puff(e.body.x, top(e.body.si), e.body.z, 8, { size: 0.5 });
          break;
        }
        case 'climb':
          view.fx.puff(ev.x, top(0), ev.z, 10, { size: 0.55 });
          if (audible) sfx.climb();
          break;
        default:
      }
    }
    // Pillows landing.
    for (let i = G.pillowsDue.length - 1; i >= 0; i--) {
      const p = G.pillowsDue[i];
      if (W.t >= p.at) {
        G.pillowsDue.splice(i, 1);
        view.fx.feathers(p.x, top(p.si) + 0.3, p.z, p.rain ? 10 : 7);
        view.fx.puff(p.x, top(p.si), p.z, 6, { size: 0.5 });
        if (audible) sfx.pillowLand();
        if (p.rain) view.stage.addTrauma(0.06);
      }
    }
  }

  /** A short freeze on a big hit (only where this page runs the clock: solo, or the Rush), and a camera punch everywhere. */
  function hitStop(ms, punch) {
    if (settings.reduced) return;
    view.stage.punch(0.04 * punch);
    if (G.mode === 'rush' || (G.mode === 'round' && solo() && G.match?.isHost)) G.stopUntil = Math.max(G.stopUntil ?? 0, performance.now() + ms);
  }
  /** A word over a monkey's head (TOY names, combos), drawn by the UI. */
  function toast(text, id, color) {
    const head = view.headOf(id);
    if (!head) return;
    const p = view.toScreen(head.x, head.y + 0.7, head.z, innerWidth, innerHeight);
    ui.pop(text, p.x, p.y, color);
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
      // How many stars the monkey had when it went (before the rug clears them).
      const stars = e?.body.dizzy ?? 0;
      if (e && !e.body.out) {
        markOut(e, false);
        if (e.role === 'remote') e.body.outAt = G.world.t;
      }
      // Outlasting: every monkey that falls while this page's is still on the bed.
      const me = G.world.get(G.myId);
      if (me && f.id !== G.myId && !(me.body.out && me.body.outAt < G.world.t - 0.05)) G.stats.outlast++;
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
        G.stats.knocks++;
        if (f.kind === 'pillow') G.stats.pillowKnocks++;
        if (f.kind === 'slam' && f.at - G.lastMegaAt < 3) G.stats.megaKnocks++;
        if (stars >= 3) G.stats.dizzyKnocks++;
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
      G.stats.roundWins++;
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
    if (G.rush) {
      rushFrame(dt, now);
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
        const tw = G.world.twist;
        if (G.match.round === 1) ui.banner(verseFor(seats), firstMatch ? [{ text: 'Stay on. Knock them off.' }] : null, 2.6);
        else if (tw) ui.banner(TWIST_NAMES[tw], [{ text: `ROUND ${G.match.round}` }], 3, 'twist');
        else ui.banner(`ROUND ${G.match.round}`, [{ text: verseFor(seats) }], 2.2);
        if (G.screen === 'game') sfx.count(0);
        if (tw && G.screen === 'game') sfx.twist(tw);
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
      const lv = levelAt(G.world.t, G.world.twist);
      const stage = G.world.t >= ROUND.overAt ? 2 : G.world.t >= ROUND.wildAt ? 1 : 0;
      if (stage > G.wildSeen) {
        G.wildSeen = stage;
        if (G.world.t - (stage === 2 ? ROUND.overAt : ROUND.wildAt) < 2) {
          ui.banner(stage === 2 ? 'WILDER STILL!' : 'WILD SPRINGS!', [{ text: 'Bigger bounces' }], 2.4, 'wild');
          if (G.screen === 'game') sfx.alarm();
          view.stage.addTrauma(0.3);
        }
      }
      setTempo(lv.w > 0.5 ? 140 : 116);
      let alive = 0;
      for (const e of G.world.entries.values()) if (!e.body.out) alive++;
      setLayers(5 - alive + (lv.w > 0.5 ? 1 : 0));
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
    const e = (G.rush ? G.rush.world : G.world).get(G.myId);
    let key = 'none';
    if (G.screen === 'game' && e && !G.paused && (G.mode === 'lobby' || G.mode === 'round' || G.mode === 'offline')) key = e.body.out ? 'throw' : 'slam';
    if (G.mode === 'rush' && G.rush && !G.rush.over && !G.paused) key = 'slam';
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
    const r = safe(() => ow?.ui?.reserved) ?? null;
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

  // ---- Screen data ----

  const myHex = () => COLORS[4].hex;
  const myFull = () => lookOf(4, myLook, '');
  /** A wardrobe item's picture on this page's monkey. */
  const swatchOf = (item) => itemSwatch(item, { hex: COLORS[4].hex, dark: COLORS[4].dark, portraitOf: (hat) => view.portrait({ ...myFull(), hat }) });

  function titleData() {
    const p = save.progress;
    const lv = levelOf(p.xp);
    const day = today();
    const night = p.night && p.night.d === day ? p.night : null;
    const goals = goalsFor(day).map((g, i) => ({ text: g.text, n: g.n, now: night ? night.p[i] : 0, done: night ? night.done[i] : false }));
    const info = rushFor(day);
    const tonight = p.rush && p.rush.d === day ? p.rush.best : 0;
    return {
      level: lv.level, into: lv.into, need: lv.need, streak: streakAlive(p, day) ? p.streak.n : 0, stars: starCount(save),
      portrait: view.portrait(myFull()), goals,
      boxState: night?.box ? 'opened' : goals.every((g) => g.done) ? 'ready' : 'locked',
      rushSub: `${SHORT[info.bed]} BED${info.twist ? ` · ${TWIST_NAMES[info.twist]}` : ''}${tonight ? ` · ${tonight}` : ''}`,
      rushNew: !tonight, touch: input.touch,
    };
  }

  function wardrobeData(res) {
    const slot = G.wardrobeSlot ?? 'pj';
    const own = ownership(save);
    const items = itemsIn(slot).map((it) => {
      const u = it.unlock;
      return {
        id: it.id, name: it.name, owned: owns(it, own), worn: myLook[slot] === it.id,
        lock: u.level ? `LV ${u.level}` : u.stars ? String(u.stars) : u.box ? 'BOX' : '', lockIcon: u.stars ? 'star' : u.box ? 'gift' : 'lock',
        swatch: swatchOf({ ...it, slot }),
      };
    });
    const ownedN = items.filter((i) => i.owned).length;
    return {
      key: `${slot}|${items.map((i) => `${i.owned ? 1 : 0}${i.worn ? 1 : 0}`).join('')}`, slot, menuBottom: res.menuBottom,
      slots: SLOTS.map((s) => ({ id: s, name: SLOT_NAMES[s].toUpperCase() })), items,
      note: `${ownedN} / ${items.length}`, swatches: items.map((i) => i.swatch),
    };
  }

  // ---- The camera ----

  const lerpBox = (a, b, k) => ({ x0: a.x0 + (b.x0 - a.x0) * k, x1: a.x1 + (b.x1 - a.x1) * k, y0: a.y0 + (b.y0 - a.y0) * k, y1: a.y1 + (b.y1 - a.y1) * k, z0: a.z0 + (b.z0 - a.z0) * k, z1: a.z1 + (b.z1 - a.z1) * k });
  /** The box worth framing in play: the bed, drawn in toward the monkeys still on it as the bed empties. */
  function playBox(W, bedBox) {
    const live = [];
    for (const e of W.entries.values()) if (!e.body.out && e.body.mode !== 'falling') live.push(e.body);
    if (!live.length) return bedBox;
    let x0 = Infinity;
    let x1 = -Infinity;
    let z0 = Infinity;
    let z1 = -Infinity;
    for (const b of live) {
      x0 = Math.min(x0, b.x);
      x1 = Math.max(x1, b.x);
      z0 = Math.min(z0, b.z);
      z1 = Math.max(z1, b.z);
    }
    const cx = (x0 + x1) / 2;
    const cz = (z0 + z1) / 2;
    const hw = Math.max((x1 - x0) / 2 + 2.2, 4.2);
    const hd = Math.max((z1 - z0) / 2 + 1.6, 2.8);
    const near = {
      x0: Math.max(bedBox.x0, cx - hw), x1: Math.min(bedBox.x1, cx + hw), y0: bedBox.y0, y1: bedBox.y1,
      z0: Math.max(bedBox.z0, cz - hd), z1: Math.min(bedBox.z1, cz + hd),
    };
    const k = live.length >= 5 ? 0.3 : live.length === 4 ? 0.45 : live.length === 3 ? 0.65 : 0.85;
    return lerpBox(bedBox, near, k);
  }

  // ---- Drawing ----

  function draw(dt, now) {
    const w = innerWidth;
    const h = innerHeight;
    const W = G.rush ? G.rush.world : G.world;
    const bed = W.bed;
    const q = settings.quality;
    if (q !== quality) {
      quality = q;
      view.setQuality(q, bed);
    }
    const res = reserved();
    const narrow = w < 640;
    const stripTop = narrow ? res.menuBottom + 6 : 8;
    ui.layout(stripTop);
    view.shootPortraits();
    const { looks } = lookCache;
    const inRound = G.mode === 'round';
    const showStrip = inRound && G.screen === 'game';
    if (showStrip) {
      const falls = new Set((G.match.data?.falls ?? []).map((f) => f.id));
      const cap = leaderId();
      const t = G.world.t;
      const seats = G.match.seats.map((s) => {
        const b = G.world.get(s.id)?.body;
        const out = falls.has(s.id) || !!b?.out;
        return {
          id: s.id, name: nameOf(s.id), hex: hexOf(s.id), points: G.match.scores?.[s.id] ?? 0, out, me: s.id === G.myId, cap: s.id === cap,
          portrait: view.portrait(looks.get(s.id)), stars: b && !out ? b.dizzy : 0, toy: b && !out ? (b.mega > t ? 'mega' : b.shield > t ? 'shield' : '') : '', tier: b?.tier ?? 0,
        };
      });
      const key = JSON.stringify(seats.map((s) => ({ ...s, portrait: !!s.portrait })));
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
      if (sr && (narrow || sr.right + 84 > w)) ui.placeClock(w - 78, sr.bottom + 14);
      else if (sr) ui.placeClock(sr.right + 18, stripTop + 6);
    } else ui.clock(null);
    // Tonight's Rush: the HUD, and the card when the run ends.
    const rushLive = G.mode === 'rush' && G.rush && G.screen === 'game';
    if (rushLive && !G.rush.over) {
      const hd = G.rush.hud();
      ui.rushHud({ score: hd.score, combo: hd.combo, comboLeft: hd.comboLeft / RUSH.combo, bandages: hd.bandages, max: RUSH.bandages });
      ui.placeRush(stripTop);
    } else ui.rushHud(null);
    const rr = ui.rushRect();
    if (rushLive && G.rushOver && performance.now() - G.rushOver.at > 1400) {
      const o = G.rushOver;
      const info = G.rush.info;
      ui.rushOver({ key: `rush${o.at}`, score: o.score, best: o.best, tonight: o.tonight, newBest: o.newBest, board: o.board, prog: o.prog, swatch: swatchOf, info: `${bedById(info.bed).name.toUpperCase()}${info.twist ? ` · ${TWIST_NAMES[info.twist]}` : ''}` });
    } else ui.rushOver(null);
    const bannerTop = sr ? sr.bottom + (narrow && showStrip ? 94 : 14) : rr ? rr.bottom + 12 : narrow ? res.menuBottom + 20 : 96;
    ui.placeBanner(bannerTop);
    ui.tickBanner();
    // Lobby band.
    if (G.mode === 'lobby' && G.screen === 'game') {
      const hostPicks = !!G.room?.isHost;
      const cur = validBed(G.room.settings?.bed);
      const bandKey = `${hostPicks}|${cur}|${G.room.settings?.rounds}|${JSON.stringify(save.stars)}`;
      if (G.bandDrawn !== bandKey) {
        G.bandDrawn = bandKey;
        ui.band({
          host: hostPicks,
          rounds: Number(G.room.settings?.rounds) === 5 ? 5 : 3,
          beds: BEDS.map((b) => ({ id: b.id, name: b.name, short: SHORT[b.id], stars: save.stars[b.id] ?? [0, 0, 0], locked: !bedOpen(save, b.id) && !AUTO, on: b.id === cur })),
        });
      }
    } else if (G.bandDrawn !== '') {
      G.bandDrawn = '';
      ui.band(null);
    }
    // Title and wardrobe.
    if (G.screen === 'title') {
      ui.placeTitle(res.menuBottom);
      ui.title(titleData());
    } else ui.title(null);
    if (G.screen === 'wardrobe') {
      const wd = wardrobeData(res);
      ui.wardrobe(wd);
      const ready = wd.swatches.filter(Boolean).length;
      if (ready !== G.swatchesReady || wd.key !== G.swatchKey) {
        G.swatchesReady = ready;
        G.swatchKey = wd.key;
        ui.wardrobeSwatches(wd.swatches);
      }
    } else ui.wardrobe(null);
    // Camera.
    const box = bed.box;
    const margins = { top: 0, bottom: 0, left: 10, right: 10 };
    const bedBox = { x0: box.x0 - 0.4, x1: box.x1 + 0.4, y0: -0.5, y1: 2.2, z0: box.z0 - 0.4, z1: box.z1 + 0.6 };
    let fb = bedBox;
    let opts = {};
    let rate = 2.6;
    const portraitScreen = h > w * 1.05;
    if (G.screen === 'title') {
      const tr = ui.titleRects();
      margins.top = tr ? tr.logo.top + tr.logo.height * 0.62 : h * 0.3;
      margins.bottom = tr ? h - (portraitScreen ? tr.me.top : tr.btns.top) + 4 : h * 0.15;
      fb = { ...bedBox, y1: 1.6, z1: box.z1 + 0.2 };
      opts = { pitch: portraitScreen ? 0.72 : 0.44 };
    } else if (G.screen === 'wardrobe') {
      const s = bed.surfaces[bed.surfaces.length - 1];
      fb = { x0: s.cx - 1.35, x1: s.cx + 1.35, y0: s.top - 0.1, y1: s.top + 2.4, z0: s.cz - 0.6, z1: s.cz + 0.6 };
      const pr = ui.wardrobeRect();
      margins.top = res.menuBottom + 16;
      if (pr && portraitScreen) margins.bottom = h - pr.top + 16;
      else if (pr) {
        margins.right = w - pr.left + 24;
        margins.bottom = 30;
      }
      opts = { pitch: 0.32 };
      rate = 4;
    } else if (G.mode === 'lobby' || G.mode === 'offline') {
      const br = ui.bandRect();
      margins.top = (br && br.height ? Math.max(br.bottom, res.menuBottom) : res.menuBottom + 80) + 30;
      margins.bottom = h - res.lobbyTop + 6;
      fb = { ...fb, z1: box.z1 + 2.4, y0: bed.floor };
    } else if (G.mode === 'results') {
      const rect = document.querySelector('#results .card')?.getBoundingClientRect();
      margins.top = h * 0.08;
      margins.bottom = h * 0.08;
      if (rect && portraitScreen) margins.bottom = h - rect.top + 10;
      else if (rect) margins.right = w - rect.left + 20;
      opts = { pitch: 0.5 };
    } else {
      const top = sr ? sr.bottom : rr ? rr.bottom : 90;
      margins.top = top + 10;
      margins.bottom = portraitScreen ? h * 0.2 : 16;
      fb = playBox(W, bedBox);
      const me = W.get(G.myId)?.body;
      if (me?.out && G.mode === 'round') fb = { ...fb, z1: Math.max(fb.z1, box.z1 + 2.4), y0: bed.floor };
      if (G.rushOver) {
        const rect = document.querySelector('#rushover .card')?.getBoundingClientRect();
        if (rect && portraitScreen) margins.bottom = h - rect.top + 10;
        else if (rect) margins.right = w - rect.left + 20;
      }
      if (inRound && G.match?.phase === 'roundEnd' && view.room) {
        const d = view.room.door;
        fb = { x0: Math.min(bedBox.x0, d.x - 2), x1: Math.max(bedBox.x1, d.x + 2), y0: bed.floor, y1: d.y + 3.5, z0: d.z, z1: box.z1 + 1 };
        margins.top = 30;
      } else if (G.focus && now < G.focus.until) {
        // The last fall: in close on the faller.
        const head = view.headOf(G.focus.id);
        if (head) {
          fb = { x0: head.x - 2.2, x1: head.x + 2.2, y0: Math.max(bed.floor, head.y - 2), y1: head.y + 1.2, z0: head.z - 1.4, z1: head.z + 1.4 };
          rate = 5;
        }
      }
    }
    if (bed.id === 'bunk' && G.screen !== 'wardrobe') fb.y1 = Math.max(fb.y1, 3.2);
    // Ease the framed box itself, so the camera glides as monkeys bounce and fall.
    const ek = G.camBox && G.camMode === `${G.screen}|${G.mode}` ? 1 - Math.exp(-dt * 3) : 1;
    G.camBox = G.camBox && ek < 1 ? lerpBox(G.camBox, fb, ek) : fb;
    G.camMode = `${G.screen}|${G.mode}`;
    margins.top = Math.min(margins.top, h * 0.45);
    margins.bottom = Math.min(margins.bottom, h * 0.6);
    view.frame(G.camBox, w, h, margins, { ...opts, rate }, dt);
    // The room: the door at a round's end, wild springs rattling the clock, Lights Out.
    const doorWant = inRound && G.match?.phase === 'roundEnd' && now - G.roundEndAt > 500 ? 1 : 0;
    G.door += (doorWant - G.door) * Math.min(1, dt * (doorWant ? 5 : 3));
    const lv = inRound || G.mode === 'rush' ? levelAt(W.t, W.twist) : { w: 0 };
    const darkWant = (inRound && G.match?.phase === 'round') || (G.mode === 'rush' && !G.rush?.over) ? (W.twist === 'dark' ? 1 : 0) : 0;
    G.dark = (G.dark ?? 0) + (darkWant - (G.dark ?? 0)) * Math.min(1, dt * 1.2);
    view.setDark(G.dark);
    const ring = inRound && ((W.t >= ROUND.wildAt && W.t < ROUND.wildAt + 2) || (W.t >= ROUND.overAt && W.t < ROUND.overAt + 2)) ? 1 : 0;
    view.room?.update(anim, { wild: (inRound && G.match?.phase === 'round') || G.mode === 'rush' ? lv.w : 0, door: G.door, spot: quality === 'high', ring, dark: G.dark });
    // Extras: bots on the rug in the lobby, the losers on the rug in the results, this page's monkey in the wardrobe.
    const extras = [];
    if (G.mode === 'lobby' && G.match && G.screen === 'game') {
      const n = Math.min(4, G.match.lobby?.bots ?? 0);
      for (let i = 0; i < n; i++) extras.push({ id: `rug${i}`, look: castLook(CAST[i]), spot: view.rugSpot(bed, i + 1, 5) });
    }
    if (G.mode === 'results') {
      const res2 = G.match.results ?? [];
      res2.slice(1).forEach((s, i) => extras.push({ id: s.id, look: looks.get(s.id) ?? lookOf(4, DEFAULT_LOOK, ''), spot: view.rugSpot(bed, i, Math.max(2, res2.length - 1)), mode: 'sit' }));
    }
    if (inRound && G.match?.spectating && G.screen === 'game') {
      extras.push({ id: 'watcher', look: myFull(), spot: { ...view.rugSpot(bed, 2), z: bed.box.z1 + 2.8 } });
    }
    if (G.screen === 'wardrobe') {
      const s = bed.surfaces[bed.surfaces.length - 1];
      const slot = G.wardrobeSlot ?? 'pj';
      const fresh = now - (G.wardrobeAct ?? 0) < 1100;
      extras.push({ id: G.myId, look: myFull(), spot: { x: s.cx, y: s.top, z: s.cz, yaw: Math.sin(anim * 0.6) * 0.25 }, mode: slot === 'dance' ? 'dance' : fresh ? 'wave' : 'stand', dance: myLook.dance });
      // Show the thread and the trail where they'd show in play.
      if (slot === 'thread' || fresh) {
        if (!G.dressRingAt || anim > G.dressRingAt) {
          G.dressRingAt = anim + (slot === 'thread' ? 1.5 : 99);
          G.dressN = (G.dressN ?? 0) + 1;
          G.world.addWave({ id: `dress#${G.dressN}`, owner: G.myId, kind: 'slam', x: s.cx, z: s.cz, e: 1.1, t0: G.world.t, si: s.i });
        }
      } else G.dressRingAt = 0;
      if (slot === 'trail' && Math.random() < dt * 40) {
        const a = anim * 2.4;
        view.fx.trail(s.cx + Math.cos(a) * 1.1, s.top + 1.1 + Math.sin(a * 2) * 0.2, s.cz + Math.sin(a) * 0.5, ringOf(G.myId), myLook.trail);
      }
    }
    const frozen = inRound && G.match?.phase === 'roundEnd';
    view.draw(W, {
      looks, me: G.screen === 'game' ? G.myId : null, anim, dt, extras, colorOf: ringOf, lastLaunch: G.lastLaunch, trail: true,
      guilty: frozen && W.t >= (G.match.data?.endT ?? 0) + 0.6, winner: G.match?.data?.winner, cap: leaderId(),
      cheer: G.mode === 'results' ? (G.match.results?.[0]?.id ?? null) : G.mode === 'attract' && G.attractEnd ? [...W.entries.values()].find((e) => !e.body.out)?.id : null,
      hideRing: G.mode === 'attract' || G.paused || (G.mode === 'rush' && G.rush?.over),
    });
    if ((G.mode === 'results' || G.rushOver) && Math.random() < dt * 5) view.fx.confetti((Math.random() - 0.5) * 8, 7, (Math.random() - 0.5) * 5, 2, { speed: 1, up: 0.2, float: 0 });
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
    if (inRound && G.match?.spectating && G.screen === 'game') {
      const head = view.headOf('watcher');
      if (head) {
        const s = view.toScreen(head.x, head.y + 0.5, head.z, w, h);
        tags.push({ id: 'watcher', x: s.x, y: s.y, name: 'Next round', ready: null, next: true });
      }
    }
    ui.tags(tags);
    if (G.mode === 'lobby' && G.screen === 'game' && (G.match?.lobby?.bots ?? 0) > 0) {
      const spot = view.rugSpot(bed, 0, 5);
      const s = view.toScreen(spot.x, bed.floor + 0.9, spot.z, w, h);
      ui.invite({ x: Math.min(w - 70, Math.max(70, s.x)), y: Math.min(res.lobbyTop - 54, s.y) });
    } else ui.invite(null);
    // Hint over this page's monkey.
    const hint = currentHint();
    const myHead = view.headOf(G.myId);
    if (hint && myHead) {
      const me = W.get(G.myId)?.body;
      let p = view.toScreen(myHead.x, myHead.y + 0.6, myHead.z, w, h);
      if (G.mode === 'lobby') p = { x: p.x, y: p.y - 30 };
      if (me?.out) p = view.toScreen(me.aimX, bed.surfaces[0].top + 0.4, me.aimZ, w, h);
      ui.hint(hint, Math.min(w - 90, Math.max(90, p.x)), Math.max(sr ? sr.bottom + 40 : 80, p.y));
    } else ui.hint(null);
    // Results.
    if (G.mode === 'results' && G.screen === 'game') {
      const rs = G.match.results ?? [];
      const host = G.match.isHost;
      const secs = G.match.secondsLeft;
      const pub = G.room.kind === 'public';
      const rd = G.resultsData && G.resultsData.rid === G.rid ? G.resultsData : null;
      ui.results({
        key: `${G.rid}|${rs.length}|${!!rd}`,
        title: rs[0] ? `${nameOf(rs[0].id).toUpperCase()} WINS!` : 'RESULTS',
        rows: rs.map((s) => ({ place: s.place, name: s.id === G.myId ? `${nameOf(s.id)} (you)` : nameOf(s.id), hex: hexOf(s.id), points: s.points, me: s.id === G.myId, portrait: view.portrait(looks.get(s.id)) })),
        prog: rd?.prog ?? null,
        ladder: rd ? { bed: bedById(rd.bed).name.toUpperCase(), stars: rd.stars, fresh: rd.fresh } : null,
        swatch: swatchOf,
        again: host || pub || G.room.kind === 'solo' ? (G.wantReady ? null : 'PLAY AGAIN') : null,
        wait: G.wantReady ? 'Ready for the next one' : !host && !pub ? 'Waiting for the host' : secs !== null ? `Lobby in ${Math.ceil(secs)}` : '',
      });
    } else ui.results(null);
    ui.pause(G.paused && (inRound || (G.mode === 'rush' && !G.rush?.over)));
  }

  if (AUTO) startAudio();
  else safe(() => G.room?.hideLobby?.(true));
  requestAnimationFrame(frame);
}
