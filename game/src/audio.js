// Every sound is synthesized: springs, whumps, slide whistles, bonks, the toy-piano verse, and a small sequencer playing
// the game's bouncy tune (a music-box version on the title and in the lobby). Silent until the first tap.

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
  boing(height = 1, vol = 1) {
    if (!on()) return;
    const t = now();
    const f = 180 + height * 60;
    const o = osc('sine', f, t, 0.22, 0.12 * vol, sfxBus, { f1: f * 1.9 });
    const lfo = ctx.createOscillator();
    const lg = ctx.createGain();
    lfo.frequency.value = 22;
    lg.gain.value = 18;
    lfo.connect(lg).connect(o.frequency);
    lfo.start(t);
    lfo.stop(t + 0.3);
  },
  tuck() {
    if (!on()) return;
    const t = now();
    osc('square', 900, t, 0.03, 0.05, sfxBus, { f1: 500 });
  },
  whump(e = 1, vol = 1) {
    if (!on()) return;
    const t = now();
    const k = Math.min(1.8, e);
    osc('sine', 70 - k * 8, t, 0.35 + k * 0.15, 0.55 * vol, sfxBus, { f1: 32 });
    noise(t, 0.18, 0.35 * vol, { type: 'lowpass', f: 600, f1: 120, q: 0.7 });
    // Creak.
    osc('sawtooth', 140 + Math.random() * 40, t + 0.04, 0.16, 0.035 * vol, sfxBus, { f1: 95 });
    // Whoosh of the ring.
    noise(t + 0.02, 0.5 + 0.2 * k, 0.12 * vol, { type: 'bandpass', f: 300, f1: 2200, q: 2.2, a: 0.08 });
  },
  launch() {
    if (!on()) return;
    const t = now();
    noise(t, 0.08, 0.3, { type: 'highpass', f: 900, q: 0.8 });
    osc('sine', 420, t + 0.03, 0.45, 0.16, sfxBus, { f1: 1300, a: 0.02 });
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
    noise(now(), 0.35, 0.12, { type: 'bandpass', f: 500, f1: 1500, q: 1.5, a: 0.05 });
  },
  pillowLand() {
    if (!on()) return;
    const t = now();
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
    // Footsteps, then the bang.
    for (let i = 0; i < 3; i++) noise(t + i * 0.18, 0.08, 0.2, { type: 'lowpass', f: 260 });
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
    const t = now();
    noise(t, 0.05, 0.12, { type: 'bandpass', f: 1800, q: 1.2 });
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

let music = { mode: 'off', step: 0, next: 0, timer: 0, tempo: 116 };

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
      if (m !== null) {
        xylo(m + 12, t, 0.11, musicBus);
        if (inBar % 4 === 0) piano(m, t, 0.25, 0.05, musicBus);
      }
      if (inBar % 4 === 0) {
        const b = BASS[(bar * 2 + inBar / 4) % BASS.length];
        osc('triangle', midi(b - 12), t, 0.22, 0.2, musicBus, { a: 0.003 });
      }
      if (inBar === 2 || inBar === 6) noise(t, 0.12, 0.08, { type: 'highpass', f: 2500, bus: musicBus, a: 0.003 });
      if (inBar % 2 === 1) {
        const ch = CHORDS[bar % CHORDS.length];
        for (const c of ch) osc('sine', midi(c), t, 0.1, 0.018, musicBus, { a: 0.002 });
      }
      if (inBar % 2 === 0) noise(t, 0.03, 0.025, { type: 'highpass', f: 7000, bus: musicBus, a: 0.001 });
    }
    music.step++;
    music.next += eighth;
  }
}
