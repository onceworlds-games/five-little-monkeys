// Little pictures of wardrobe items for the wardrobe and the results: the real pyjama print, the hat on the plush (a
// portrait from the view), a fold of quilt with the ring thread, and the launch trail's own sprites.
import { patternSwatch } from './render/fabric.js';
import { featherTexture, starTexture, blobTexture } from './render/textures.js';
import { glintTexture, heartTexture, boltTexture, zTexture, bubbleTexture, chipTexture } from './render/sprites.js';
import { THREAD_HEX } from './look.js';

const cache = new Map();
const S = 96;

function canvas() {
  const c = document.createElement('canvas');
  c.width = c.height = S;
  return c;
}
function felt(g) {
  const bg = g.createRadialGradient(S / 2, S * 0.35, 4, S / 2, S / 2, S * 0.75);
  bg.addColorStop(0, '#3a4a7a');
  bg.addColorStop(1, '#1a2444');
  g.fillStyle = bg;
  g.fillRect(0, 0, S, S);
}

/** A ring of quilt in the thread's colour (the seat's own for 'seat', a rainbow for 'rainbow'). */
function threadSwatch(id, seatHex) {
  const c = canvas();
  const g = c.getContext('2d');
  felt(g);
  let stroke = THREAD_HEX[id] ?? seatHex;
  if (id === 'rainbow') {
    const lg = g.createLinearGradient(10, 10, S - 10, S - 10);
    ['#FF5A5A', '#FFC23A', '#5FE3B0', '#3C86F0', '#C77DFF'].forEach((h, i) => lg.addColorStop(i / 4, h));
    stroke = lg;
  }
  g.lineWidth = 16;
  g.strokeStyle = 'rgba(0,0,0,0.35)';
  g.beginPath();
  g.ellipse(S / 2, S / 2 + 5, 28, 22, 0, 0, Math.PI * 2);
  g.stroke();
  g.strokeStyle = stroke;
  g.beginPath();
  g.ellipse(S / 2, S / 2, 28, 22, 0, 0, Math.PI * 2);
  g.stroke();
  g.lineWidth = 3;
  g.strokeStyle = 'rgba(255,255,255,0.75)';
  g.beginPath();
  g.ellipse(S / 2, S / 2 - 3, 28, 22, 0, Math.PI * 1.1, Math.PI * 1.9);
  g.stroke();
  return c.toDataURL('image/png');
}

const TRAILS = {
  none: [blobTexture(0.2), ['#FFF1D6']],
  feathers: [featherTexture(), ['#FFFFFF']],
  stars: [starTexture(), null],
  bubbles: [bubbleTexture(), ['#BFE8FF']],
  confetti: [chipTexture(), ['#FF5A5A', '#FFC23A', '#5FE3B0', '#3C86F0', '#C77DFF']],
  zzz: [zTexture(), ['#CFE0FF']],
  hearts: [heartTexture(), ['#FF6F91']],
  bolts: [boltTexture(), ['#FFE14A']],
  fireflies: [glintTexture(), ['#E9FF8A']],
};
/** A few of the trail's sprites, scattered along an arc. */
function trailSwatch(id) {
  const [tex, cols] = TRAILS[id] ?? TRAILS.none;
  const img = tex.image;
  const c = canvas();
  const g = c.getContext('2d');
  felt(g);
  const spots = [[20, 72, 18, -0.4], [40, 52, 24, 0.3], [62, 36, 30, -0.2], [76, 66, 16, 0.6]];
  spots.forEach(([x, y, s, rot], i) => {
    const t = document.createElement('canvas');
    t.width = t.height = s * 2;
    const tg = t.getContext('2d');
    tg.drawImage(img, 0, 0, s * 2, s * 2);
    if (cols) {
      tg.globalCompositeOperation = 'source-atop';
      tg.fillStyle = cols[i % cols.length];
      tg.globalAlpha = 0.85;
      tg.fillRect(0, 0, s * 2, s * 2);
    }
    g.save();
    g.translate(x, y);
    g.rotate(rot);
    if (id === 'fireflies') g.globalCompositeOperation = 'lighter';
    g.drawImage(t, -s, -s, s * 2, s * 2);
    g.restore();
  });
  return c.toDataURL('image/png');
}

/**
 * A picture for wardrobe item `item` ({ slot, id }) on a monkey of colour `hex`/`dark`; `portraitOf(hat)` draws the
 * plush in a hat (null while it's being drawn). Null for items with no picture (dances).
 */
export function itemSwatch(item, { hex, dark, portraitOf }) {
  if (item.slot === 'hat') return portraitOf(item.id);
  if (item.slot === 'dance') return null;
  const key = `${item.slot}|${item.id}|${hex}`;
  if (cache.has(key)) return cache.get(key);
  let url = null;
  try {
    if (item.slot === 'pj') url = patternSwatch(item.id, hex, dark);
    else if (item.slot === 'thread') url = threadSwatch(item.id, hex);
    else if (item.slot === 'trail') url = trailSwatch(item.id);
  } catch (err) {
    console.warn('swatch', err);
  }
  cache.set(key, url);
  return url;
}
