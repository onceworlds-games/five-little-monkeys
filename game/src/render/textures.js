// Every texture is drawn in code on a canvas: the quilt and its fabrics, the floor, the rug, the wallpaper, pyjama
// patterns, the monkeys' mouths, sprites for feathers, stars and glows.
import * as THREE from 'three';
import { createRng } from '../sim/rng.js';
import { PAL } from '../look.js';

export function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function tex(c, { srgb = true, repeat = false } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  t.needsUpdate = true;
  return t;
}

const shade = (hex, k) => {
  const c = new THREE.Color(hex);
  if (k > 0) c.lerp(new THREE.Color('#ffffff'), k);
  else c.lerp(new THREE.Color('#000000'), -k);
  return `#${c.getHexString()}`;
};

/** One fabric on a patch rectangle. */
function fabric(g, kind, x, y, w, h, base, accent, rng) {
  g.fillStyle = base;
  g.fillRect(x, y, w, h);
  g.save();
  g.beginPath();
  g.rect(x, y, w, h);
  g.clip();
  const s = w / 8;
  switch (kind) {
    case 'gingham': {
      g.globalAlpha = 0.38;
      g.fillStyle = accent;
      for (let i = 0; i < 8; i += 2) g.fillRect(x + i * s, y, s, h);
      for (let j = 0; j < 8; j += 2) g.fillRect(x, y + j * s, w, s);
      break;
    }
    case 'stripes': {
      g.fillStyle = accent;
      g.globalAlpha = 0.75;
      for (let i = 0; i < 10; i += 2) g.fillRect(x, y + (i * h) / 10, w, h / 20);
      break;
    }
    case 'dots': {
      g.fillStyle = accent;
      g.globalAlpha = 0.85;
      for (let j = 0; j < 5; j++)
        for (let i = 0; i < 5; i++) {
          g.beginPath();
          g.arc(x + (i + 0.5 + (j % 2) * 0.5) * (w / 5), y + (j + 0.5) * (h / 5), w / 26, 0, Math.PI * 2);
          g.fill();
        }
      break;
    }
    case 'cord': {
      g.strokeStyle = shade(base, -0.25);
      g.lineWidth = Math.max(1, w / 60);
      for (let i = 0; i < 26; i++) {
        g.beginPath();
        g.moveTo(x + (i * w) / 26, y);
        g.lineTo(x + (i * w) / 26, y + h);
        g.stroke();
      }
      break;
    }
    case 'floral': {
      for (let k = 0; k < 7; k++) {
        const cx = x + rng.range(0.1, 0.9) * w;
        const cy = y + rng.range(0.1, 0.9) * h;
        const r = w * rng.range(0.05, 0.08);
        g.fillStyle = accent;
        for (let p = 0; p < 5; p++) {
          const a = (p / 5) * Math.PI * 2;
          g.beginPath();
          g.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r, r * 0.7, 0, Math.PI * 2);
          g.fill();
        }
        g.fillStyle = PAL.cream;
        g.beginPath();
        g.arc(cx, cy, r * 0.5, 0, Math.PI * 2);
        g.fill();
      }
      break;
    }
    case 'plaid': {
      g.globalAlpha = 0.3;
      g.fillStyle = accent;
      for (let i = 0; i < 4; i++) {
        g.fillRect(x + (i + 0.3) * (w / 4), y, w / 12, h);
        g.fillRect(x, y + (i + 0.3) * (h / 4), w, h / 12);
      }
      g.globalAlpha = 0.5;
      g.fillStyle = shade(base, -0.35);
      g.fillRect(x + w * 0.5, y, w / 40, h);
      g.fillRect(x, y + h * 0.5, w, h / 40);
      break;
    }
    case 'stars': {
      g.fillStyle = accent;
      for (let k = 0; k < 6; k++) star(g, x + rng.range(0.15, 0.85) * w, y + rng.range(0.15, 0.85) * h, w * 0.07, 5);
      break;
    }
    default:
      break;
  }
  g.restore();
  // A soft sheen across each patch: the puff of the batting under it.
  const grad = g.createRadialGradient(x + w * 0.45, y + h * 0.4, w * 0.05, x + w * 0.5, y + h * 0.5, w * 0.75);
  grad.addColorStop(0, 'rgba(255,255,255,0.10)');
  grad.addColorStop(1, 'rgba(0,0,0,0.16)');
  g.fillStyle = grad;
  g.fillRect(x, y, w, h);
}

export function star(g, cx, cy, r, n = 5) {
  g.beginPath();
  for (let i = 0; i < n * 2; i++) {
    const a = (i / (n * 2)) * Math.PI * 2 - Math.PI / 2;
    const rr = i % 2 ? r * 0.45 : r;
    g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
  }
  g.closePath();
  g.fill();
}

const KINDS = ['gingham', 'stripes', 'dots', 'cord', 'floral', 'plaid', 'stars'];

/**
 * The quilt for one mattress: 1 u patches across [x0 - over, x1 + over] x [z0 - over, z1 + over]. Returns { map, bump }.
 */
export function quiltTextures(rect, over, colors, seed, px = 112) {
  const W = rect.x1 - rect.x0 + over * 2;
  const H = rect.z1 - rect.z0 + over * 2;
  const cw = Math.round(W * px);
  const ch = Math.round(H * px);
  const c = canvas(cw, ch);
  const g = c.getContext('2d');
  const b = canvas(cw, ch);
  const gb = b.getContext('2d');
  gb.fillStyle = '#808080';
  gb.fillRect(0, 0, cw, ch);
  const rng = createRng(seed);
  g.fillStyle = colors[0];
  g.fillRect(0, 0, cw, ch);
  const cols = Math.ceil(rect.x1 - rect.x0);
  const rows = Math.ceil(rect.z1 - rect.z0);
  const pw = ((rect.x1 - rect.x0) / cols) * px;
  const ph = ((rect.z1 - rect.z0) / rows) * px;
  const ox = over * px;
  const oz = over * px;
  // A border band all round (it hangs over the sides).
  fabric(g, 'cord', 0, 0, cw, oz + 2, shade(colors[0], -0.2), colors[1], rng);
  fabric(g, 'cord', 0, ch - oz - 2, cw, oz + 2, shade(colors[0], -0.2), colors[1], rng);
  fabric(g, 'cord', 0, 0, ox + 2, ch, shade(colors[0], -0.2), colors[1], rng);
  fabric(g, 'cord', cw - ox - 2, 0, ox + 2, ch, shade(colors[0], -0.2), colors[1], rng);
  for (let j = 0; j < rows; j++)
    for (let i = 0; i < cols; i++) {
      const x = ox + i * pw;
      const y = oz + j * ph;
      const base = colors[(i * 3 + j * 5 + rng.int(2)) % colors.length];
      let accent = colors[(i + j * 2 + 2 + rng.int(colors.length - 1)) % colors.length];
      if (accent === base) accent = PAL.cream;
      fabric(g, KINDS[(i * 2 + j * 3 + rng.int(3)) % KINDS.length], x, y, pw, ph, base, accent, rng);
      // Puff in the bump map: lighter in the middle of each patch, sunk at the seams.
      const rg = gb.createRadialGradient(x + pw / 2, y + ph / 2, 2, x + pw / 2, y + ph / 2, pw * 0.7);
      rg.addColorStop(0, '#8e8e8e');
      rg.addColorStop(1, '#7c7c7c');
      gb.fillStyle = rg;
      gb.fillRect(x, y, pw, ph);
    }
  // Seams and running stitches.
  const seam = (x0, y0, x1, y1) => {
    g.strokeStyle = 'rgba(30,18,30,0.55)';
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(x0, y0);
    g.lineTo(x1, y1);
    g.stroke();
    gb.strokeStyle = '#303030';
    gb.lineWidth = 5;
    gb.beginPath();
    gb.moveTo(x0, y0);
    gb.lineTo(x1, y1);
    gb.stroke();
  };
  const stitches = (x0, y0, x1, y1) => {
    g.strokeStyle = 'rgba(255,241,214,0.9)';
    g.lineWidth = 2.2;
    g.setLineDash([7, 6]);
    g.beginPath();
    g.moveTo(x0, y0);
    g.lineTo(x1, y1);
    g.stroke();
    g.setLineDash([]);
  };
  for (let i = 0; i <= cols; i++) {
    const x = ox + i * pw;
    seam(x, oz, x, oz + rows * ph);
    if (i > 0) stitches(x - 7, oz + 4, x - 7, oz + rows * ph - 4);
    if (i < cols) stitches(x + 7, oz + 4, x + 7, oz + rows * ph - 4);
  }
  for (let j = 0; j <= rows; j++) {
    const y = oz + j * ph;
    seam(ox, y, ox + cols * pw, y);
    if (j > 0) stitches(ox + 4, y - 7, ox + cols * pw - 4, y - 7);
    if (j < rows) stitches(ox + 4, y + 7, ox + cols * pw - 4, y + 7);
  }
  return { map: tex(c), bump: tex(b, { srgb: false }) };
}

export function floorTexture(color) {
  const c = canvas(512, 512);
  const g = c.getContext('2d');
  const rng = createRng('floor');
  const rows = 8;
  for (let r = 0; r < rows; r++) {
    let x = -rng.range(0, 200);
    while (x < 512) {
      const len = rng.range(160, 320);
      g.fillStyle = shade(color, rng.range(-0.12, 0.1));
      g.fillRect(x, (r * 512) / rows, len, 512 / rows);
      g.strokeStyle = 'rgba(0,0,0,0.12)';
      g.lineWidth = 1;
      for (let k = 0; k < 4; k++) {
        const y = (r * 512) / rows + rng.range(4, 512 / rows - 4);
        g.beginPath();
        g.moveTo(x, y);
        g.bezierCurveTo(x + len * 0.3, y + rng.range(-3, 3), x + len * 0.6, y + rng.range(-3, 3), x + len, y);
        g.stroke();
      }
      g.fillStyle = 'rgba(20,10,5,0.55)';
      g.fillRect(x, (r * 512) / rows, 2, 512 / rows);
      x += len;
    }
    g.fillStyle = 'rgba(20,10,5,0.6)';
    g.fillRect(0, (r * 512) / rows, 512, 2);
  }
  return tex(c, { repeat: true });
}

export function rugTexture(colors) {
  const c = canvas(512, 512);
  const g = c.getContext('2d');
  for (let i = 0; i < 18; i++) {
    const r = 250 - i * 13;
    g.fillStyle = colors[i % colors.length];
    g.beginPath();
    g.arc(256, 256, r, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = 'rgba(0,0,0,0.25)';
    g.lineWidth = 2;
    g.setLineDash([6, 5]);
    g.stroke();
    g.setLineDash([]);
  }
  return tex(c);
}

export function wallTexture(a, b) {
  const c = canvas(256, 256);
  const g = c.getContext('2d');
  g.fillStyle = a;
  g.fillRect(0, 0, 256, 256);
  g.fillStyle = b;
  for (let i = 0; i < 8; i++) g.fillRect(i * 32, 0, 14, 256);
  g.fillStyle = 'rgba(255,241,214,0.06)';
  for (let i = 0; i < 8; i++) {
    g.beginPath();
    g.arc(i * 32 + 23, (i % 2) * 128 + 64, 3, 0, Math.PI * 2);
    g.fill();
  }
  return tex(c, { repeat: true });
}

/** A pyjama pattern on a colour: a texture for a monkey's clothes. */
export function pyjamaTexture(pattern, hex, dark) {
  const c = canvas(128, 128);
  const g = c.getContext('2d');
  g.fillStyle = hex;
  g.fillRect(0, 0, 128, 128);
  const ink = pattern === 'gold' ? '#F6D36B' : PAL.cream;
  g.fillStyle = ink;
  g.strokeStyle = ink;
  switch (pattern) {
    case 'stripes':
      for (let i = 0; i < 8; i += 2) g.fillRect(i * 16, 0, 12, 128);
      break;
    case 'dots':
      for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) {
        g.beginPath();
        g.arc(i * 32 + 16 + (j % 2) * 16, j * 32 + 16, 6, 0, Math.PI * 2);
        g.fill();
      }
      break;
    case 'zigzag':
      g.lineWidth = 7;
      for (let j = 0; j < 4; j++) {
        g.beginPath();
        for (let i = 0; i <= 8; i++) g.lineTo(i * 16, j * 32 + 10 + (i % 2) * 14);
        g.stroke();
      }
      break;
    case 'stars':
    case 'gold':
      for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) star(g, i * 43 + 21 + (j % 2) * 10, j * 43 + 21, 11);
      break;
    case 'checks':
      g.globalAlpha = 0.45;
      for (let j = 0; j < 8; j++) for (let i = 0; i < 8; i++) if ((i + j) % 2) g.fillRect(i * 16, j * 16, 16, 16);
      g.globalAlpha = 1;
      break;
    case 'moons':
      for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) {
        const x = i * 43 + 21 + (j % 2) * 10;
        const y = j * 43 + 21;
        g.beginPath();
        g.arc(x, y, 11, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = hex;
        g.beginPath();
        g.arc(x + 5, y - 4, 10, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = ink;
      }
      break;
    case 'bolts':
      for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) {
        const x = i * 43 + 14 + (j % 2) * 8;
        const y = j * 43 + 6;
        g.beginPath();
        g.moveTo(x + 10, y);
        g.lineTo(x, y + 18);
        g.lineTo(x + 9, y + 18);
        g.lineTo(x + 3, y + 34);
        g.lineTo(x + 18, y + 13);
        g.lineTo(x + 9, y + 13);
        g.closePath();
        g.fill();
      }
      break;
    default: {
      // Plain: piping at the hem.
      g.fillStyle = dark;
      g.fillRect(0, 118, 128, 10);
    }
  }
  return tex(c, { repeat: true });
}

/** Mouth shapes in one strip: grin, O, gritted, worried, guilty, sleepy. */
export const MOUTHS = ['grin', 'o', 'gritted', 'worried', 'guilty', 'sleepy'];
export function mouthAtlas() {
  const c = canvas(MOUTHS.length * 128, 128);
  const g = c.getContext('2d');
  g.lineCap = 'round';
  g.lineJoin = 'round';
  MOUTHS.forEach((m, i) => {
    const x = i * 128 + 64;
    const y = 64;
    g.fillStyle = '#2A1218';
    g.strokeStyle = '#2A1218';
    g.lineWidth = 9;
    if (m === 'grin') {
      g.beginPath();
      g.moveTo(x - 40, y - 12);
      g.quadraticCurveTo(x, y + 40, x + 40, y - 12);
      g.closePath();
      g.fill();
      g.fillStyle = '#FFF6E8';
      g.fillRect(x - 28, y - 10, 56, 10);
      g.fillStyle = '#E2626E';
      g.beginPath();
      g.ellipse(x, y + 14, 14, 7, 0, 0, Math.PI * 2);
      g.fill();
    } else if (m === 'o') {
      g.beginPath();
      g.ellipse(x, y + 4, 20, 26, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#E2626E';
      g.beginPath();
      g.ellipse(x, y + 18, 11, 7, 0, 0, Math.PI * 2);
      g.fill();
    } else if (m === 'gritted') {
      g.fillRect(x - 36, y - 14, 72, 30);
      g.fillStyle = '#FFF6E8';
      g.fillRect(x - 30, y - 9, 60, 20);
      g.strokeStyle = '#2A1218';
      g.lineWidth = 3;
      for (let k = -2; k <= 2; k++) {
        g.beginPath();
        g.moveTo(x + k * 12, y - 9);
        g.lineTo(x + k * 12, y + 11);
        g.stroke();
      }
      g.beginPath();
      g.moveTo(x - 30, y + 1);
      g.lineTo(x + 30, y + 1);
      g.stroke();
    } else if (m === 'worried') {
      g.beginPath();
      g.moveTo(x - 36, y + 8);
      for (let k = 0; k <= 6; k++) g.lineTo(x - 36 + k * 12, y + 8 + (k % 2 ? -8 : 4));
      g.stroke();
    } else if (m === 'guilty') {
      g.beginPath();
      g.moveTo(x - 34, y + 6);
      g.quadraticCurveTo(x + 4, y + 18, x + 36, y - 10);
      g.stroke();
    } else {
      g.beginPath();
      g.moveTo(x - 22, y + 6);
      g.lineTo(x + 22, y + 6);
      g.stroke();
    }
  });
  return tex(c);
}

/** A soft round blob (shadows, glows): white with alpha. */
export function blobTexture(hard = 0.0) {
  const c = canvas(128, 128);
  const g = c.getContext('2d');
  const rg = g.createRadialGradient(64, 64, 64 * hard, 64, 64, 62);
  rg.addColorStop(0, 'rgba(255,255,255,1)');
  rg.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = rg;
  g.fillRect(0, 0, 128, 128);
  return tex(c);
}

export function featherTexture() {
  const c = canvas(64, 128);
  const g = c.getContext('2d');
  g.fillStyle = '#FFFFFF';
  g.beginPath();
  g.moveTo(32, 4);
  g.bezierCurveTo(58, 34, 54, 96, 32, 124);
  g.bezierCurveTo(10, 96, 6, 34, 32, 4);
  g.fill();
  g.strokeStyle = 'rgba(160,150,140,0.9)';
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(32, 10);
  g.lineTo(32, 124);
  g.stroke();
  return tex(c);
}

export function starTexture() {
  const c = canvas(64, 64);
  const g = c.getContext('2d');
  g.fillStyle = '#FFE27A';
  g.strokeStyle = '#2B1B33';
  g.lineWidth = 4;
  star(g, 32, 33, 27);
  g.stroke();
  star(g, 32, 33, 27);
  return tex(c);
}

/** The moon in the window, with its halo. */
export function moonTexture() {
  const c = canvas(256, 256);
  const g = c.getContext('2d');
  const halo = g.createRadialGradient(128, 128, 40, 128, 128, 128);
  halo.addColorStop(0, 'rgba(200,220,255,0.55)');
  halo.addColorStop(1, 'rgba(200,220,255,0)');
  g.fillStyle = halo;
  g.fillRect(0, 0, 256, 256);
  g.fillStyle = '#F4F1E6';
  g.beginPath();
  g.arc(128, 128, 46, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = 'rgba(180,180,200,0.35)';
  for (const [x, y, r] of [[112, 116, 10], [140, 140, 7], [126, 150, 5], [146, 112, 6]]) {
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }
  return tex(c);
}

export function skyTexture() {
  const c = canvas(256, 256);
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#0B1430');
  grad.addColorStop(1, '#22325E');
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 256);
  const rng = createRng('sky');
  g.fillStyle = '#FFFFFF';
  for (let i = 0; i < 60; i++) {
    g.globalAlpha = rng.range(0.3, 1);
    g.fillRect(rng.range(0, 256), rng.range(0, 200), 1.5, 1.5);
  }
  g.globalAlpha = 1;
  // Rooftops.
  g.fillStyle = '#0A0F22';
  let x = 0;
  while (x < 256) {
    const w = rng.range(30, 60);
    const h = rng.range(30, 70);
    g.fillRect(x, 256 - h, w, h);
    g.beginPath();
    g.moveTo(x, 256 - h);
    g.lineTo(x + w / 2, 256 - h - rng.range(10, 24));
    g.lineTo(x + w, 256 - h);
    g.fill();
    x += w;
  }
  g.fillStyle = '#FFC86A';
  for (let i = 0; i < 6; i++) g.fillRect(rng.range(5, 250), rng.range(200, 240), 4, 5);
  return tex(c);
}

/** A rocket poster for the wall. */
export function posterTexture(kind) {
  const c = canvas(192, 256);
  const g = c.getContext('2d');
  if (kind === 'rocket') {
    g.fillStyle = '#E5483C';
    g.fillRect(0, 0, 192, 256);
    g.fillStyle = '#FFF1D6';
    g.beginPath();
    g.moveTo(96, 30);
    g.quadraticCurveTo(140, 90, 120, 170);
    g.lineTo(72, 170);
    g.quadraticCurveTo(52, 90, 96, 30);
    g.fill();
    g.fillStyle = '#172036';
    g.beginPath();
    g.arc(96, 105, 14, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#FFB24A';
    g.beginPath();
    g.moveTo(76, 170);
    g.lineTo(96, 225);
    g.lineTo(116, 170);
    g.fill();
  } else {
    g.fillStyle = '#3C86F0';
    g.fillRect(0, 0, 192, 256);
    g.fillStyle = '#F6C239';
    g.beginPath();
    g.arc(96, 110, 52, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#FFF1D6';
    g.lineWidth = 8;
    g.beginPath();
    g.ellipse(96, 110, 86, 22, -0.3, 0, Math.PI * 2);
    g.stroke();
  }
  return tex(c);
}
