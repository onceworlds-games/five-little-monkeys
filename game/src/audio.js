// Layered sound: sampled soft impacts, bed creaks, cloth whooshes, footsteps and the door (Kenney, CC0; see CREDITS.md)
// under synthesized springs that climb the scale with a perfect streak, slide whistles, bonks, the toy-piano verse, and
// a small sequencer playing the game's bouncy tune, which adds layers as monkeys fall (a music-box version on the title
// and in the lobby). Silent until the first tap.

const SAMPLE_URLS = import.meta.glob('./assets/sfx/*.mp3', { eager: true, query: '?url', import: 'default' });
const samples = new Map();
/** Decode every sample once (after the first tap), and skip each file's lead-in silence. */
function loadSamples() {
  for (const [path, url] of Object.entries(SAMPLE_URLS)) {
    const name = path.split('/').pop().replace(/\.mp3$/, '');
    fetch(url)
      .then((r) => r.arrayBuffer())
      .then((b) => new Promise((res, rej) => ctx.decodeAudioData(b, res, rej)))
      .then((buf) => {
        const d = buf.getChannelData(0);
        let i = 0;
        while (i < d.length && Math.abs(d[i]) < 0.01) i++;
        samples.set(name, { buf, start: Math.max(0, i - 32) / buf.sampleRate });
      })
      .catch(() => {});
  }
}
/** Play sample `name` (or one of a list) at volume `vol`, playback rate `rate`, `delay` seconds from now. */
function play(name, vol = 1, rate = 1, delay = 0) {
  if (!on()) return;
  const n = Array.isArray(name) ? name[Math.floor(Math.random() * name.length)] : name;
  const sm = samples.get(n);
  if (!sm) return;
  const src = ctx.createBufferSource();
  src.buffer = sm.buf;
  src.playbackRate.value = rate;
  const g = ctx.createGain();
  g.gain.value = vol;
  src.connect(g).connect(sfxBus);
  src.start(now() + delay, sm.start);
}
const HEAVY = ['impactSoft_heavy_000', 'impactSoft_heavy_001', 'impactSoft_heavy_002', 'impactSoft_heavy_003', 'impactSoft_heavy_004'];
const MEDIUM = ['impactSoft_medium_000', 'impactSoft_medium_001', 'impactSoft_medium_002'];
const CLOTH = ['cloth1', 'cloth2', 'cloth3', 'cloth4'];
const CREAK = ['creak1', 'creak2', 'creak3'];
const STEPS = ['footstep00', 'footstep01', 'footstep02', 'footstep03'];
// The pentatonic ladder a perfect streak climbs.
const LADDER = [60, 62, 64, 67, 69, 72, 74, 76, 79, 81, 84, 86, 88];

let ctx = null;
let master = null;
let sfxBus = null;
let musicBus = null;
let noiseBuf = null;
let comp = null;

const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

export function startAudio() {
  if (ctx) {
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return;
  }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  try {
    ctx = new AC();
  } catch {
    ctx = null;
    return;
  }
  comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.ratio.value = 4;
  master = ctx.createGain();
  master.gain.value = 0.8;
  master.connect(comp).connect(ctx.destination);
  sfxBus = ctx.createGain();
  sfxBus.connect(master);
  musicBus = ctx.createGain();
  musicBus.gain.value = 0.42;
  musicBus.connect(master);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  ctx.resume().catch(() => {});
  loadSamples();
}

export const audioReady = () => !!ctx && ctx.state === 'running';

export function suspendAudio(on) {
  if (!ctx) return;
  if (on) ctx.suspend().catch(() => {});
  else ctx.resume().catch(() => {});
}

function env(g, t, a, peak, d, end = 0.0001) {
  g.gain.cancelScheduledValues(t);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a);
  g.gain.exponentialRampToValueAtTime(end, t + a + d);
}

function osc(type, f, t, dur, peak, bus = sfxBus, { a = 0.005, f1 = null, detune = 0 } = {}) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f, t);
  if (f1 !== null) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  o.detune.value = detune;
  env(g, t, a, peak, dur);
  o.connect(g).connect(bus);
  o.start(t);
  o.stop(t + a + dur + 0.05);
  return o;
}

function noise(t, dur, peak, { type = 'bandpass', f = 1200, f1 = null, q = 1, bus = sfxBus, a = 0.005 } = {}) {
  const s = ctx.createBufferSource();
  s.buffer = noiseBuf;
  const fl = ctx.createBiquadFilter();
  fl.type = type;
  fl.frequency.setValueAtTime(f, t);
  if (f1 !== null) fl.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
  fl.Q.value = q;
  const g = ctx.createGain();
  env(g, t, a, peak, dur);
  s.connect(fl).connect(g).connect(bus);
  s.start(t, Math.random() * 0.5);
  s.stop(t + a + dur + 0.05);
}

const on = () => !!ctx && ctx.state === 'running';
const now = () => ctx.currentTime + 0.005;

export const sfx = {
  /** The springy boing of a bounce: pitch by height. */
  boing(height = 1, vol = 1, tier = 0) {
    if (!on()) return;
    const t = now();
    const f = (180 + height * 60) * (1 + tier * 0.12);
    if (vol > 0.5) play(MEDIUM, 0.18 * vol, 0.9 + Math.random() * 0.2);
    const o = osc('sine', f, t, 0.22, 0.12 * vol, sfxBus, { f1: f * 1.9 });
    const lfo = ctx.createOscillator();
    const lg = ctx.createGain();
    lfo.frequency.value = 22;
    lg.gain.value = 18;
    lfo.connect(lg).connect(o.frequency);
    lfo.start(t);
    lfo.stop(t + 0.3);
  },
  /** The slam's tuck: a cloth whoosh, higher from a higher bounce. */
  tuck(tier = 0) {
    if (!on()) return;
    const t = now();
    play(CLOTH, 0.5, 1.15 + tier * 0.08);
    osc('square', 900 + tier * 120, t, 0.03, 0.05, sfxBus, { f1: 500 });
  },
  /** A slam lands: a soft heavy impact and a sub thump, a creak on the big ones, a shimmer on a Mega Slam. */
  whump(e = 1, vol = 1, mega = false) {
    if (!on()) return;
    const t = now();
    const k = Math.min(2.1, e);
    play(HEAVY, (0.55 + k * 0.25) * vol, 0.8 + Math.random() * 0.12 - k * 0.05);
    if (k > 0.9 || mega) play(CREAK, 0.35 * vol, 0.85 + Math.random() * 0.3, 0.05);
    if (mega) {
      [72, 79, 84, 88, 91].forEach((m, i) => xylo(m, t + 0.02 + i * 0.045, 0.07 * vol));
      noise(t, 0.9, 0.08 * vol, { type: 'highpass', f: 5000, a: 0.01 });
      osc('sine', 46, t, 0.9, 0.5 * vol, sfxBus, { f1: 28 });
    }
    osc('sine', 70 - k * 8, t, 0.35 + k * 0.15, 0.55 * vol, sfxBus, { f1: 32 });
    noise(t, 0.18, 0.35 * vol, { type: 'lowpass', f: 600, f1: 120, q: 0.7 });
    // Creak.
    osc('sawtooth', 140 + Math.random() * 40, t + 0.04, 0.16, 0.035 * vol, sfxBus, { f1: 95 });
    // Whoosh of the ring.
    noise(t + 0.02, 0.5 + 0.2 * k, 0.12 * vol, { type: 'bandpass', f: 300, f1: 2200, q: 2.2, a: 0.08 });
  },
  launch(vol = 1) {
    if (!on()) return;
    const t = now();
    play(CLOTH, 0.7 * vol, 0.8);
    noise(t, 0.08, 0.3 * vol, { type: 'highpass', f: 900, q: 0.8 });
    osc('sine', 420, t + 0.03, 0.45, 0.16 * vol, sfxBus, { f1: 1300, a: 0.02 });
  },
  /** A pump: a perfect one rings a note up the ladder with the streak; a good one a soft tick. */
  pump(streak = 0, tier = 0, good = false) {
    if (!on()) return;
    const t = now();
    if (good) {
      osc('triangle', 520, t, 0.05, 0.05, sfxBus, { f1: 640 });
      return;
    }
    const m = LADDER[Math.min(LADDER.length - 1, Math.max(0, streak - 1))];
    xylo(m + 12, t, 0.09);
    osc('sine', midi(m + 24), t + 0.01, 0.25, 0.025);
    if (tier >= 3) play('glass_001', 0.25, 1 + Math.min(0.5, streak * 0.04));
    if (streak > 0 && streak % 5 === 0) [0, 4, 7, 12].forEach((d, i) => xylo(m + 12 + d, t + 0.06 + i * 0.05, 0.06));
  },
  /** This page's monkey launched someone. */
  hit() {
    if (!on()) return;
    const t = now();
    play(MEDIUM, 0.6, 0.7);
    xylo(84, t + 0.02, 0.07);
    xylo(91, t + 0.07, 0.05);
  },
  /** A toy grabbed. */
  grab(kind = 'mega', vol = 1) {
    if (!on()) return;
    const t = now();
    play('drop_002', 0.5 * vol, kind === 'spring' ? 1.3 : 1);
    if (kind === 'mega') [76, 79, 83, 88].forEach((m, i) => xylo(m, t + i * 0.06, 0.08 * vol));
    else if (kind === 'shield') {
      noise(t, 0.3, 0.2 * vol, { type: 'lowpass', f: 900, f1: 300 });
      [67, 72].forEach((m, i) => piano(m + 12, t + i * 0.08, 0.3, 0.06 * vol, sfxBus));
    } else {
      const o = osc('sine', 220, t, 0.45, 0.14 * vol, sfxBus, { f1: 880 });
      const lfo = ctx.createOscillator();
      const lg = ctx.createGain();
      lfo.frequency.value = 26;
      lg.gain.value = 40;
      lfo.connect(lg).connect(o.frequency);
      lfo.start(t);
      lfo.stop(t + 0.5);
    }
  },
  /** A perfect pump shook a dizzy star off. */
  shake() {
    if (!on()) return;
    const t = now();
    [88, 84, 79].forEach((m, i) => xylo(m, t + i * 0.05, 0.05));
  },
  /** A monkey climbs onto the bed (the Rush). */
  climb() {
    if (!on()) return;
    play(CLOTH, 0.35, 1.2);
    play(MEDIUM, 0.25, 1.3, 0.12);
  },
  /** Points in the Rush: a ding, higher with the combo. */
  score(combo = 1) {
    if (!on()) return;
    const t = now();
    const m = 72 + Math.min(12, (combo - 1) * 3);
    xylo(m, t, 0.1);
    xylo(m + 7, t + 0.06, 0.08);
    if (combo >= 3) xylo(m + 12, t + 0.12, 0.07);
  },
  /** The sting for a bedtime twist. */
  twist(tw) {
    if (!on()) return;
    const t = now() + 0.05;
    if (tw === 'rain') {
      noise(t, 0.6, 0.15, { type: 'bandpass', f: 2000, f1: 400, q: 2, a: 0.05 });
      [79, 76, 72, 67].forEach((m, i) => piano(m, t + i * 0.09, 0.3, 0.08, sfxBus));
    } else if (tw === 'dark') {
      play('metalClick', 0.5);
      [55, 51, 48].forEach((m, i) => piano(m, t + 0.1 + i * 0.16, 0.8, 0.09, sfxBus));
    } else if (tw === 'bonanza') {
      [72, 76, 79, 84, 79, 84, 88].forEach((m, i) => xylo(m, t + i * 0.07, 0.08));
    } else if (tw === 'bouncy') {
      for (let i = 0; i < 4; i++) osc('sine', 200 + i * 90, t + i * 0.1, 0.18, 0.1, sfxBus, { f1: 420 + i * 160 });
    } else if (tw === 'echo') {
      [0, 0.18, 0.36, 0.54].forEach((d, i) => xylo(84, t + d, 0.09 * Math.pow(0.6, i)));
    }
  },
  levelUp() {
    if (!on()) return;
    play('jingles_PIZZI03', 0.7);
    play('maximize_006', 0.35);
  },
  goal() {
    if (!on()) return;
    play('confirmation_002', 0.5);
  },
  box() {
    if (!on()) return;
    play('jingles_PIZZI07', 0.7);
    play('glass_004', 0.3, 1, 0.2);
  },
  win() {
    if (!on()) return;
    play('jingles_PIZZI01', 0.6);
  },
  /** One tick of an XP line counting up. */
  tick(i = 0) {
    if (!on()) return;
    xylo(79 + (i % 5) * 2, now(), 0.035);
  },
  teeter() {
    if (!on()) return;
    const t = now();
    const o = osc('triangle', 330, t, 0.5, 0.08, sfxBus, { f1: 220 });
    const lfo = ctx.createOscillator();
    const lg = ctx.createGain();
    lfo.frequency.value = 7;
    lg.gain.value = 40;
    lfo.connect(lg).connect(o.frequency);
    lfo.start(t);
    lfo.stop(t + 0.6);
  },
  fall() {
    if (!on()) return;
    const t = now();
    osc('sine', 1400, t, 0.55, 0.14, sfxBus, { f1: 300, a: 0.02 });
  },
  bonk(vol = 1) {
    if (!on()) return;
    const t = now();
    osc('square', 520, t, 0.08, 0.12 * vol, sfxBus, { f1: 300 });
    noise(t, 0.06, 0.25 * vol, { type: 'bandpass', f: 900, q: 3 });
    // Bonng and star chimes.
    osc('sine', 660, t + 0.06, 1.1, 0.12 * vol, sfxBus, { a: 0.003 });
    osc('sine', 990, t + 0.06, 0.8, 0.05 * vol, sfxBus, { a: 0.003 });
    [1568, 1976, 2349].forEach((f, i) => osc('sine', f, t + 0.25 + i * 0.09, 0.3, 0.05 * vol));
  },
  pillowThrow() {
    if (!on()) return;
    play(CLOTH, 0.45, 1.1);
    noise(now(), 0.35, 0.12, { type: 'bandpass', f: 500, f1: 1500, q: 1.5, a: 0.05 });
  },
  pillowLand() {
    if (!on()) return;
    const t = now();
    play(MEDIUM, 0.4, 0.75);
    noise(t, 0.2, 0.3, { type: 'lowpass', f: 700, f1: 200 });
    osc('sine', 110, t, 0.2, 0.25, sfxBus, { f1: 60 });
  },
  phew() {
    if (!on()) return;
    const t = now();
    osc('triangle', midi(79), t + 0.05, 0.25, 0.12);
    osc('triangle', midi(84), t + 0.17, 0.4, 0.12);
  },
  wall() {
    if (!on()) return;
    const t = now();
    noise(t, 0.1, 0.18, { type: 'lowpass', f: 400 });
  },
  post() {
    if (!on()) return;
    const t = now();
    osc('sine', 250, t, 0.4, 0.2, sfxBus, { f1: 500 });
    osc('sine', 260, t, 0.4, 0.1, sfxBus, { f1: 520, detune: 30 });
  },
  /** A line of the verse on toy piano (n monkeys left). */
  verse(n) {
    if (!on()) return;
    const t = now() + 0.1;
    const lines = {
      4: [67, 67, 64, 67, 69, 67, 64],
      3: [65, 65, 62, 65, 67, 65, 62],
      2: [64, 64, 60, 64, 65, 64, 60],
      1: [72, 71, 69, 67, 65, 64, 62, 60],
    };
    const line = lines[Math.max(1, Math.min(4, n))];
    line.forEach((m, i) => piano(m, t + i * 0.13, 0.3, 0.11, sfxBus));
  },
  alarm() {
    if (!on()) return;
    const t = now();
    for (let i = 0; i < 16; i++) {
      osc('square', 1800, t + i * 0.06, 0.04, 0.035);
      osc('square', 2400, t + i * 0.06 + 0.03, 0.03, 0.025);
    }
    [196, 247, 294, 392].forEach((f, i) => osc('sawtooth', f, t + 0.1 + i * 0.05, 0.6, 0.04, sfxBus, { f1: f * 1.5 }));
  },
  door() {
    if (!on()) return;
    const t = now();
    // Footsteps, then the door.
    for (let i = 0; i < 3; i++) play(STEPS, 0.6, 0.8, i * 0.18);
    play('doorOpen_1', 0.7, 1, 0.5);
    osc('sine', 80, t + 0.6, 0.45, 0.6, sfxBus, { f1: 40 });
    noise(t + 0.6, 0.3, 0.45, { type: 'lowpass', f: 900, f1: 200 });
    [48, 55, 60, 64].forEach((m) => piano(m + 12, t + 0.75, 1.6, 0.06, sfxBus));
  },
  fanfare() {
    if (!on()) return;
    const t = now() + 0.05;
    [60, 64, 67, 72, 67, 72, 76].forEach((m, i) => {
      piano(m + 12, t + i * 0.12, 0.4, 0.1, sfxBus);
      xylo(m + 24, t + i * 0.12, 0.05);
    });
  },
  tap() {
    if (!on()) return;
    play(['pluck_001', 'pluck_002'], 0.5);
  },
  zip() {
    if (!on()) return;
    noise(now(), 0.25, 0.08, { type: 'bandpass', f: 1500, f1: 4000, q: 4 });
  },
  count(n) {
    if (!on()) return;
    const t = now();
    if (n > 0) piano(n === 3 ? 67 : n === 2 ? 69 : 71, t, 0.4, 0.14, sfxBus);
    else [72, 76, 79].forEach((m) => piano(m, t, 0.7, 0.1, sfxBus));
  },
  star(i = 0) {
    if (!on()) return;
    const t = now() + i * 0.12;
    xylo(84 + i * 4, t, 0.12);
    osc('sine', midi(96 + i * 4), t, 0.5, 0.04);
  },
};

function piano(m, t, dur, vol, bus) {
  const f = midi(m);
  osc('triangle', f, t, dur, vol, bus, { a: 0.004 });
  osc('sine', f * 2, t, dur * 0.5, vol * 0.4, bus, { a: 0.004 });
  osc('sine', f * 4.02, t, 0.08, vol * 0.25, bus, { a: 0.002 });
}

function xylo(m, t, vol, bus = sfxBus) {
  const f = midi(m);
  osc('sine', f, t, 0.25, vol, bus, { a: 0.002 });
  osc('sine', f * 3.9, t, 0.06, vol * 0.4, bus, { a: 0.001 });
}

// ---- Music ----

// The tune, in eighth notes, four bars (null: rest). Original melody in a skipping chant rhythm.
const MEL = [
  67, null, 67, 64, 67, null, 64, null,
  69, null, 67, null, 64, null, 60, null,
  67, null, 67, 64, 67, null, 64, 65,
  62, null, 64, null, 60, null, null, null,
  72, null, 72, 69, 72, null, 69, null,
  74, null, 72, null, 69, null, 67, null,
  65, null, 65, 64, 65, 67, 69, null,
  67, null, 62, null, 60, null, null, null,
];
const BASS = [48, 55, 53, 48, 48, 55, 43, 48, 53, 60, 50, 55, 53, 48, 43, 48];
const CHORDS = [[60, 64, 67], [60, 65, 69], [60, 64, 67], [59, 62, 67], [60, 65, 69], [62, 65, 69], [60, 65, 69], [59, 62, 67]];

let music = { mode: 'off', step: 0, next: 0, timer: 0, tempo: 116, layers: 0 };

/** How full the tune plays (0-3): more layers as monkeys fall. */
export function setLayers(n) {
  music.layers = Math.max(0, Math.min(3, n | 0));
}

export function setMusic(mode, tempo) {
  if (!ctx) {
    music.mode = mode;
    if (tempo) music.tempo = tempo;
    return;
  }
  if (tempo) music.tempo = tempo;
  if (mode === music.mode && music.timer) return;
  music.mode = mode;
  if (mode === 'off') {
    clearInterval(music.timer);
    music.timer = 0;
    musicBus.gain.setTargetAtTime(0, ctx.currentTime, 0.2);
    return;
  }
  musicBus.gain.setTargetAtTime(mode === 'box' ? 0.32 : 0.4, ctx.currentTime, 0.3);
  if (!music.timer) {
    music.next = ctx.currentTime + 0.1;
    music.step = 0;
    music.timer = setInterval(schedule, 25);
  }
}

export function setTempo(bpm) {
  music.tempo = bpm;
}

function schedule() {
  if (!ctx || ctx.state !== 'running') return;
  const box = music.mode === 'box';
  const bpm = box ? 84 : music.tempo;
  const eighth = 60 / bpm / 2;
  while (music.next < ctx.currentTime + 0.12) {
    const i = music.step % MEL.length;
    const t = music.next;
    const bar = Math.floor(i / 8);
    const inBar = i % 8;
    const m = MEL[i];
    if (box) {
      if (m !== null) {
        osc('sine', midi(m + 12), t, 0.9, 0.07, musicBus, { a: 0.003 });
        osc('sine', midi(m + 24) * 1.003, t, 0.4, 0.02, musicBus, { a: 0.002 });
      }
      if (inBar === 0) osc('sine', midi(BASS[(bar * 2) % BASS.length] + 12), t, 1.2, 0.05, musicBus);
    } else {
      const L = music.layers;
      if (m !== null) {
        xylo(m + 12, t, L >= 1 ? 0.11 : 0.06, musicBus);
        if (inBar % 4 === 0 && L >= 2) piano(m, t, 0.25, 0.05, musicBus);
        // The top layer: an answer an octave up, off the beat.
        if (L >= 3 && inBar % 2 === 1) xylo(m + 24, t, 0.04, musicBus);
      }
      if (inBar % 4 === 0) {
        const b = BASS[(bar * 2 + inBar / 4) % BASS.length];
        osc('triangle', midi(b - 12), t, 0.22, 0.2, musicBus, { a: 0.003 });
        // A soft kick under the bass.
        osc('sine', 110, t, 0.12, 0.16, musicBus, { f1: 45 });
      }
      if (inBar === 2 || inBar === 6) noise(t, 0.12, L >= 2 ? 0.12 : 0.08, { type: L >= 2 ? 'bandpass' : 'highpass', f: L >= 2 ? 1800 : 2500, bus: musicBus, a: 0.003 });
      if (inBar % 2 === 1) {
        const ch = CHORDS[bar % CHORDS.length];
        for (const c of ch) osc('sine', midi(c), t, 0.1, 0.018, musicBus, { a: 0.002 });
      }
      noise(t, 0.03, inBar % 2 === 0 ? 0.025 : L >= 2 ? 0.014 : 0, { type: 'highpass', f: 7000, bus: musicBus, a: 0.001 });
    }
    music.step++;
    music.next += eighth;
  }
}
