// Store art from the game itself: ?poster=cover|action|win|multi|icon|badge-<id>. Real rounds played by the bots are
// searched for the moment each picture needs, then drawn once at a fixed size with the game's own renderer.
import { createView } from './view.js';
import { createWorld } from './world.js';
import { COLORS, CAST } from './look.js';
import { PILLOW } from './sim/config.js';
import { logo } from './ui.js';

const SIZES = { icon: [512, 512] };

function looksFor(ids) {
  const looks = new Map();
  const cast = [...CAST, { color: 4, extra: '', kind: 'pro', look: { pj: 'checks', hat: 'crown', thread: 'gold', trail: 'stars', dance: 'spin' } }];
  ids.forEach((id, i) => {
    const c = cast[i % cast.length];
    const col = COLORS[c.color];
    const l = c.look;
    looks.set(id, { hex: col.hex, dark: col.dark, symbol: col.symbol, pattern: l.pj, hat: l.hat, thread: l.thread, trail: l.trail, dance: l.dance, extra: c.extra });
  });
  return looks;
}

/** Play rounds from `seed` and keep the moment `score(world)` likes best; returns a world stopped there. */
function search(bed, seed, score, maxT = 60, twist = '') {
  const ids = ['p0', 'p1', 'p2', 'p3', 'p4'];
  const kinds = ['rumble', 'tiptoe', 'mimic', 'dozy', 'pro'];
  const build = () => {
    const w = createWorld(bed);
    w.reset(bed, 0, { lobby: false, seed: `poster:${seed}`, twist });
    w.grace = 1.5;
    w.botGrace = 1.5;
    ids.forEach((id, i) => w.add(id, { role: 'bot', index: i, brain: { kind: kinds[i], skill: 0.75, seed: `${seed}:${id}` } }));
    return w;
  };
  let w = build();
  let best = -Infinity;
  let bestT = 0;
  const STEP_T = 1 / 60;
  while (w.t < maxT) {
    w.advance(w.t + STEP_T, null);
    const s = score(w);
    if (s > best) {
      best = s;
      bestT = w.t;
    }
    const alive = [...w.entries.values()].filter((e) => !e.body.out).length;
    if (alive <= 1) break;
  }
  w = build();
  while (w.t < bestT - 1e-6) w.advance(Math.min(bestT, w.t + STEP_T), null);
  return w;
}

const bodies = (w) => [...w.entries.values()].map((e) => e.body);

function scoreCover(w) {
  const bs = bodies(w);
  const alive = bs.filter((b) => !b.out);
  if (alive.length < 5) return -1e9;
  const launched = alive.filter((b) => b.mode === 'launched' && b.vz > 1.2 && b.y > 0.9);
  const ring = w.waves.filter((wv) => w.t - wv.t0 > 0.12 && w.t - wv.t0 < 0.4).length;
  const air = alive.filter((b) => b.y > 0.7).length;
  const toys = (w.liveToys?.(w.t) ?? []).filter((toy) => !toy.taken && w.t >= toy.at).length;
  const dizzy = alive.filter((b) => b.dizzy > 0).length;
  return launched.length * 6 + Math.min(ring, 2) * 4 + air + Math.min(toys, 2) * 3 + Math.min(dizzy, 2);
}
function scoreAction(w) {
  const bs = bodies(w);
  const l = bs.filter((b) => b.mode === 'launched' && w.t - b.lastAt < 0.18 && b.vz > 1.5);
  const ring = w.waves.filter((wv) => w.t - wv.t0 > 0.05 && w.t - wv.t0 < 0.3).length;
  return l.length * 8 + ring * 3 + (l.length ? 4 - Math.abs(l[0].z - 1.8) : 0);
}
function scoreMulti(w) {
  const bs = bodies(w);
  const alive = bs.filter((b) => !b.out);
  if (alive.length !== 2) return -1e9;
  const pillow = w.waves.filter((wv) => wv.kind === 'pillow' && wv.t0 - w.t > 0.15 && wv.t0 - w.t < 0.45).length;
  const ring = w.waves.filter((wv) => wv.kind === 'slam' && w.t - wv.t0 > 0.05 && w.t - wv.t0 < 0.35).length;
  return pillow * 6 + ring * 3 + alive.filter((b) => b.y > 0.8).length;
}

export async function runPoster(name) {
  document.body.style.background = '#172036';
  const [W, H] = name.startsWith('badge-') ? [256, 256] : SIZES[name] ?? [1280, 720];
  const canvasEl = document.getElementById('c');
  canvasEl.style.width = `${W}px`;
  canvasEl.style.height = `${H}px`;
  document.getElementById('ui').replaceChildren();
  try {
    await Promise.race([document.fonts.load('64px "Alfa Slab One"'), new Promise((r) => setTimeout(r, 2500))]);
  } catch {
    /* fonts are a nicety */
  }
  if (name.startsWith('badge-')) {
    drawBadge(canvasEl, name.slice(6), W);
    document.body.dataset.ready = '1';
    return;
  }
  const view = createView(canvasEl, { quality: 'high', poster: true, pixelRatio: 1 });
  view.stage.resize(W, H, 1);
  await view.ready;
  let world;
  const opts = { anim: 1.3, dt: 1 / 60, colorOf: () => '#fff', lastLaunch: new Map(), extras: [] };
  let box;
  let margins = { top: 40, bottom: 30, left: 30, right: 30 };
  let fopts = {};
  let door = 0;
  if (name === 'cover' || name === 'action') {
    world = name === 'cover' ? search('kid', 'cover7', scoreCover, 45, 'bonanza') : search('kid', 'act3', scoreAction, 45);
    const b = world.bed.box;
    box = { x0: b.x0 - 0.3, x1: b.x1 + 0.3, y0: -0.6, y1: 2.6, z0: b.z0, z1: b.z1 + 0.8 };
    if (name === 'cover') {
      margins = { top: 250, bottom: 10, left: 80, right: 80 };
      fopts = { pitch: 0.5 };
    } else {
      margins = { top: 10, bottom: -120, left: -60, right: -60 };
      fopts = { pitch: 0.28 };
    }
  } else if (name === 'multi') {
    world = search('kid', 'duel2', scoreMulti, 80);
    const b = world.bed.box;
    box = { x0: b.x0 - 0.3, x1: b.x1 + 0.3, y0: world.bed.floor, y1: 2.4, z0: b.z0, z1: b.z1 + 2.4 };
    margins = { top: 30, bottom: 20, left: 60, right: 60 };
    fopts = { pitch: 0.62 };
  } else if (name === 'win') {
    world = createWorld('kid');
    world.reset('kid', 30, { lobby: false });
    ['p0', 'p1', 'p2', 'p3', 'p4'].forEach((id, i) => world.add(id, { role: 'dummy', index: i }));
    const es = [...world.entries.values()];
    es.forEach((e, i) => {
      if (i === 4) {
        e.body.mode = 'air';
        e.body.x = 0.4;
        e.body.z = 0.5;
        e.body.y = 1.25;
        e.body.vy = 0.5;
      } else {
        e.body.out = true;
        e.body.mode = 'out';
        e.body.outAt = 1;
        e.body.y = world.bed.floor;
        e.body.nextPillow = 99;
      }
    });
    opts.guilty = true;
    opts.winner = 'p4';
    opts.cap = 'p4';
    door = 1;
    const d = { x: 6.5 };
    box = { x0: world.bed.box.x0 - 0.5, x1: d.x + 1.6, y0: world.bed.floor, y1: 5.2, z0: world.bed.box.z0 - 1.3, z1: world.bed.box.z1 + 2.6 };
    margins = { top: 20, bottom: 10, left: 20, right: 20 };
    fopts = { pitch: 0.42, yaw: 0.12 };
  } else {
    // icon: one monkey at the top of a bounce over a ring of quilt.
    world = createWorld('kid');
    world.reset('kid', 10, { lobby: false });
    world.add('p0', { role: 'dummy', index: 0 });
    const e = world.get('p0');
    e.body.mode = 'air';
    e.body.x = 0;
    e.body.z = 1;
    e.body.y = 1.0;
    e.body.vy = 0;
    world.addWave({ id: 'icon#1', owner: 'p0', x: 0, z: 1, e: 1.4, t0: 9.78, si: 0 });
    box = { x0: -1.6, x1: 1.6, y0: -0.2, y1: 2.2, z0: -0.6, z1: 2.6 };
    margins = { top: 10, bottom: 10, left: 10, right: 10 };
    fopts = { pitch: 0.42 };
  }
  const ids = [...world.entries.keys()];
  opts.looks = looksFor(ids);
  if (name === 'icon') opts.looks.set('p0', { ...opts.looks.get('p0'), pattern: 'stripes', hat: 'nightcap' });
  opts.colorOf = (id) => opts.looks.get(id)?.hex ?? '#FFF1D6';
  // Who launched whom: trails in the launcher's colour.
  for (const e of world.entries.values()) if (e.body.lastBy) opts.lastLaunch.set(e.id, opts.colorOf(e.body.lastBy));
  view.draw(world, { ...opts, me: null, hideRing: true });
  if (name === 'icon') {
    view.room.group.children.forEach((c) => {
      if (!view.room.quilts.some((q) => q.mesh === c)) c.visible = false;
    });
  }
  // Pillows in flight for the duel.
  if (name === 'multi') {
    for (const wv of world.waves) if (wv.kind === 'pillow' && wv.t0 > world.t) {
      const thrower = world.get(wv.owner);
      const spot = view.rugSpot(world.bed, thrower?.index ?? 0);
      view.fx.throwPillow(spot.x, spot.y + 0.7, spot.z, wv.x, 0.2, wv.z, wv.t0 - PILLOW.flight, wv.t0, opts.colorOf(wv.owner));
    }
  }
  // Fluff where rings start, a trail behind the launched.
  for (const wv of world.waves) if (world.t - wv.t0 > 0 && world.t - wv.t0 < 0.4) view.fx.slamBurst(wv.x, 0, wv.z, wv.e, opts.colorOf(wv.owner));
  view.room.update(1.3, { wild: 0, door, spot: door > 0 });
  view.frame(box, W, H, margins, fopts, 1, true);
  // Let the effects settle into a frame.
  for (let i = 0; i < 8; i++) {
    view.fx.update(1 / 60, world.t, 600);
    for (const e of world.entries.values()) if (e.body.mode === 'launched') view.fx.trail(e.body.x, e.body.y + 0.45 - i * 0.05, e.body.z - i * 0.12, opts.lastLaunch.get(e.id) ?? '#fff');
  }
  // Let the poses settle (the animator eases between them).
  for (let i = 0; i < 40; i++) view.draw(world, { ...opts, me: null, hideRing: true });
  view.render(0, 1.3, true);
  if (name === 'cover') titleOverlay(W);
  if (name === 'win') verseOverlay('NO MORE MONKEYS JUMPING ON THE BED!');
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  view.render(0, 1.3, true);
  document.body.dataset.ready = '1';
}

function titleOverlay(W) {
  const d = document.createElement('div');
  d.style.cssText = `position:fixed;left:50%;top:14px;transform:translateX(-50%) rotate(-1.5deg);width:${Math.min(600, W - 120)}px;filter:drop-shadow(0 10px 18px rgba(8,4,16,0.55))`;
  d.appendChild(logo());
  document.getElementById('ui').appendChild(d);
}

function verseOverlay(text) {
  const d = document.createElement('div');
  d.id = 'banner';
  d.style.top = '26px';
  const r = document.createElement('div');
  r.className = 'ribbon slab';
  r.style.fontSize = '40px';
  r.textContent = text;
  d.appendChild(r);
  document.getElementById('ui').appendChild(d);
}

// ---- Badges: a bold symbol on a felt disc ----

const BADGE = {
  'first-slam': ['#D9473B', 'fist'],
  'bumped-head': ['#3C86F0', 'bandage'],
  'double-bounce': ['#39B86E', 'two'],
  'no-more-monkeys': ['#FFB24A', 'door'],
  untouchable: ['#9C6CF0', 'shield'],
  'pillow-fight': ['#E46A9A', 'pillow'],
  'saved-it': ['#2FA7A0', 'arrow'],
  'bunk-boss': ['#C8752E', 'bunk'],
  'making-waves': ['#2E6E8E', 'wave'],
  'five-beds': ['#B5861A', 'bed5'],
  'bedtime-box': ['#6C4FB8', 'box'],
  'rush-hour': ['#E0662E', 'clock'],
};

function drawBadge(canvasEl, id, S) {
  canvasEl.width = S;
  canvasEl.height = S;
  const g = canvasEl.getContext('2d');
  const [col, sym] = BADGE[id] ?? ['#D9473B', 'fist'];
  const c = S / 2;
  g.clearRect(0, 0, S, S);
  g.fillStyle = '#172036';
  g.fillRect(0, 0, S, S);
  // Felt disc with a puffy shade and a stitched ring.
  const grad = g.createRadialGradient(c - 30, c - 40, 20, c, c, 118);
  grad.addColorStop(0, shade(col, 0.25));
  grad.addColorStop(1, shade(col, -0.2));
  g.fillStyle = 'rgba(0,0,0,0.35)';
  g.beginPath();
  g.arc(c, c + 6, 114, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = grad;
  g.beginPath();
  g.arc(c, c, 114, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = '#FFF1D6';
  g.lineWidth = 4;
  g.setLineDash([12, 9]);
  g.beginPath();
  g.arc(c, c, 100, 0, Math.PI * 2);
  g.stroke();
  g.setLineDash([]);
  g.save();
  g.translate(c, c);
  g.fillStyle = '#FFF1D6';
  g.strokeStyle = '#2B1B33';
  g.lineWidth = 7;
  g.lineJoin = 'round';
  g.lineCap = 'round';
  const both = () => {
    g.stroke();
    g.fill();
  };
  switch (sym) {
    case 'fist':
      g.lineWidth = 6;
      g.beginPath();
      g.ellipse(0, 52, 70, 16, 0, 0, Math.PI * 2);
      g.stroke();
      g.lineWidth = 7;
      g.beginPath();
      g.roundRect(-34, -40, 68, 62, 16);
      both();
      for (let i = 0; i < 3; i++) {
        g.beginPath();
        g.moveTo(-34 + 17 * (i + 1), -40);
        g.lineTo(-34 + 17 * (i + 1), -16);
        g.stroke();
      }
      g.beginPath();
      g.roundRect(-20, 22, 40, 24, 6);
      both();
      break;
    case 'bandage':
      g.rotate(-0.6);
      g.beginPath();
      g.roundRect(-78, -24, 156, 48, 24);
      both();
      g.fillStyle = '#E8C39E';
      g.beginPath();
      g.roundRect(-26, -24, 52, 48, 6);
      both();
      g.fillStyle = '#2B1B33';
      for (const [x, y] of [[-10, -8], [10, -8], [-10, 8], [10, 8]]) {
        g.beginPath();
        g.arc(x, y, 3.5, 0, Math.PI * 2);
        g.fill();
      }
      break;
    case 'two':
      for (const [x, y, s] of [[-30, 10, 1], [34, -14, 0.85]]) {
        g.fillStyle = '#6A4530';
        g.beginPath();
        g.arc(x, y, 38 * s, 0, Math.PI * 2);
        both();
        g.fillStyle = '#E8C39E';
        g.beginPath();
        g.ellipse(x, y + 8 * s, 24 * s, 18 * s, 0, 0, Math.PI * 2);
        g.fill();
      }
      break;
    case 'door':
      g.fillStyle = '#FFE2A0';
      g.beginPath();
      g.rect(-44, -70, 88, 140);
      both();
      g.fillStyle = '#2B1B33';
      g.beginPath();
      g.arc(0, -26, 16, 0, Math.PI * 2);
      g.fill();
      g.beginPath();
      g.moveTo(-22, 66);
      g.lineTo(-16, -6);
      g.lineTo(16, -6);
      g.lineTo(22, 66);
      g.fill();
      break;
    case 'shield':
      g.beginPath();
      g.moveTo(0, -72);
      g.lineTo(60, -50);
      g.quadraticCurveTo(58, 30, 0, 72);
      g.quadraticCurveTo(-58, 30, -60, -50);
      g.closePath();
      both();
      g.fillStyle = '#FFB24A';
      starPath(g, 0, -4, 30);
      g.fill();
      break;
    case 'pillow':
      g.beginPath();
      g.moveTo(-70, -40);
      g.quadraticCurveTo(0, -60, 70, -40);
      g.quadraticCurveTo(84, 0, 70, 40);
      g.quadraticCurveTo(0, 60, -70, 40);
      g.quadraticCurveTo(-84, 0, -70, -40);
      both();
      g.fillStyle = '#FFF1D6';
      for (const [x, y, r] of [[60, -64, 0.5], [-66, 66, -0.4], [80, 50, 1]]) {
        g.save();
        g.translate(x, y);
        g.rotate(r);
        g.beginPath();
        g.ellipse(0, 0, 8, 18, 0, 0, Math.PI * 2);
        both();
        g.restore();
      }
      break;
    case 'arrow':
      g.beginPath();
      g.moveTo(-22, -70);
      g.lineTo(22, -70);
      g.lineTo(22, 4);
      g.lineTo(52, 4);
      g.lineTo(0, 66);
      g.lineTo(-52, 4);
      g.lineTo(-22, 4);
      g.closePath();
      both();
      break;
    case 'bunk':
      g.beginPath();
      g.rect(-70, -64, 12, 128);
      both();
      g.beginPath();
      g.rect(58, -64, 12, 128);
      both();
      g.beginPath();
      g.roundRect(-62, -28, 124, 22, 8);
      both();
      g.beginPath();
      g.roundRect(-62, 34, 124, 22, 8);
      both();
      break;
    case 'wave':
      g.lineWidth = 16;
      g.strokeStyle = '#FFF1D6';
      for (const y of [-26, 22]) {
        g.beginPath();
        for (let x = -78; x <= 78; x += 4) g.lineTo(x, y + Math.sin(x / 16) * 14);
        g.stroke();
      }
      break;
    case 'bed5':
      g.beginPath();
      g.roundRect(-74, 4, 148, 34, 10);
      both();
      g.beginPath();
      g.roundRect(-78, -30, 22, 84, 8);
      both();
      g.fillStyle = '#FFE27A';
      for (let i = 0; i < 5; i++) {
        starPath(g, -48 + i * 26, -36 - (i % 2) * 10, 13);
        g.fill();
        g.stroke();
      }
      break;
    case 'box': {
      // A gift box tied with a ribbon, a crescent moon on the lid.
      g.beginPath();
      g.roundRect(-58, -12, 116, 78, 8);
      both();
      g.beginPath();
      g.roundRect(-66, -38, 132, 30, 8);
      both();
      g.fillStyle = '#FFB24A';
      g.beginPath();
      g.rect(-12, -38, 24, 104);
      both();
      for (const sx of [-1, 1]) {
        g.beginPath();
        g.ellipse(sx * 26, -56, 26, 15, sx * -0.5, 0, Math.PI * 2);
        both();
      }
      g.beginPath();
      g.arc(0, -50, 10, 0, Math.PI * 2);
      both();
      g.fillStyle = '#2B1B33';
      g.beginPath();
      g.arc(-34, 26, 16, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = shade(col, -0.05);
      g.beginPath();
      g.arc(-27, 20, 14, 0, Math.PI * 2);
      g.fill();
      break;
    }
    case 'clock': {
      // The alarm clock, ringing, a bolt across its face.
      g.beginPath();
      g.moveTo(-40, 56);
      g.lineTo(-54, 76);
      g.moveTo(40, 56);
      g.lineTo(54, 76);
      g.stroke();
      for (const sx of [-1, 1]) {
        g.beginPath();
        g.arc(sx * 40, -54, 20, Math.PI, 0);
        g.closePath();
        both();
      }
      g.beginPath();
      g.arc(0, 4, 62, 0, Math.PI * 2);
      both();
      g.fillStyle = '#FFE27A';
      g.beginPath();
      g.moveTo(10, -40);
      g.lineTo(-22, 10);
      g.lineTo(-2, 10);
      g.lineTo(-12, 48);
      g.lineTo(24, -6);
      g.lineTo(4, -6);
      g.closePath();
      both();
      g.lineWidth = 6;
      for (const [x0, y0, x1, y1] of [[-76, -70, -92, -86], [76, -70, 92, -86], [-86, -40, -104, -44], [86, -40, 104, -44]]) {
        g.beginPath();
        g.moveTo(x0, y0);
        g.lineTo(x1, y1);
        g.stroke();
      }
      break;
    }
    default:
  }
  g.restore();
}

function starPath(g, x, y, r) {
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
    const rr = i % 2 ? r * 0.45 : r;
    g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  g.closePath();
}

function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255;
  let gg = (n >> 8) & 255;
  let b = n & 255;
  const t = k > 0 ? 255 : 0;
  const f = Math.abs(k);
  r = Math.round(r + (t - r) * f);
  gg = Math.round(gg + (t - gg) * f);
  b = Math.round(b + (t - b) * f);
  return `rgb(${r},${gg},${b})`;
}
