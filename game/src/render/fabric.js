// The plush's fabrics in one material: fur, face skin, pyjama cloth with its printed pattern, and trim. A mesh carries a
// weight for each fabric per vertex; the shader mixes their colours, roughness, sheen and a little bump (the pile of the
// fur, the weave of the cloth). Patterns are printed in the body's rest pose, so they move with the body.
import * as THREE from 'three';

function cnv(w, h) {
  if (typeof OffscreenCanvas !== 'undefined' && typeof document === 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function starPath(g, cx, cy, r, n = 5, inner = 0.45) {
  g.beginPath();
  for (let i = 0; i < n * 2; i++) {
    const a = (i / (n * 2)) * Math.PI * 2 - Math.PI / 2;
    const rr = i % 2 ? r * inner : r;
    g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
  }
  g.closePath();
}

function heartPath(g, x, y, s) {
  g.beginPath();
  g.moveTo(x, y + s * 0.35);
  g.bezierCurveTo(x - s * 1.1, y - s * 0.4, x - s * 0.45, y - s * 1.05, x, y - s * 0.45);
  g.bezierCurveTo(x + s * 0.45, y - s * 1.05, x + s * 1.1, y - s * 0.4, x, y + s * 0.35);
  g.closePath();
}

/** Draw `fn(g, ox, oy)` at the tile and its 8 wrapped neighbours, so shapes on the edge tile cleanly. */
function wrapDraw(g, S, fn) {
  for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) fn(g, ox, oy);
}

/**
 * The pattern masks (tileable, 256 px): red = the first ink, green = the second. Each pattern also says which inks it
 * uses: [ink1, ink2] as 'cream' | 'dark' | 'gold' | 'light'.
 */
export const PATTERN_INKS = {
  plain: ['cream', 'cream'], stripes: ['cream', 'dark'], dots: ['cream', 'cream'], checks: ['dark', 'cream'],
  moons: ['gold', 'cream'], bolts: ['gold', 'dark'], gold: ['gold', 'gold'], hearts: ['cream', 'dark'],
  clouds: ['cream', 'light'], zigzag: ['cream', 'dark'], stars: ['gold', 'cream'], spots: ['dark', 'gold'],
  tiger: ['dark', 'cream'], plaid: ['dark', 'cream'], glow: ['glow', 'glow'], galaxy: ['cream', 'gold'],
};

const maskCache = new Map();
export function patternMask(id) {
  if (maskCache.has(id)) return maskCache.get(id);
  const S = 256;
  const c = cnv(S, S);
  const g = c.getContext('2d');
  g.fillStyle = '#000';
  g.fillRect(0, 0, S, S);
  const R = '#ff0000';
  const Gc = '#00ff00';
  const both = '#ffff00';
  g.lineCap = 'round';
  g.lineJoin = 'round';
  switch (id) {
    case 'stripes':
      g.fillStyle = R;
      for (let i = 0; i < 4; i++) g.fillRect(0, i * 64 + 8, S, 26);
      g.fillStyle = Gc;
      for (let i = 0; i < 4; i++) g.fillRect(0, i * 64 + 44, S, 5);
      break;
    case 'dots':
      g.fillStyle = R;
      wrapDraw(g, S, (g2, ox, oy) => {
        for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) {
          g2.beginPath();
          g2.arc(ox + i * 64 + 32 + (j % 2) * 32, oy + j * 64 + 32, 13, 0, Math.PI * 2);
          g2.fill();
        }
      });
      break;
    case 'checks':
      g.fillStyle = R;
      for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) if ((i + j) % 2) g.fillRect(i * 64, j * 64, 64, 64);
      g.fillStyle = Gc;
      for (let i = 0; i < 4; i++) {
        g.fillRect(i * 64 + 30, 0, 4, S);
        g.fillRect(0, i * 64 + 30, S, 4);
      }
      break;
    case 'moons':
      wrapDraw(g, S, (g2, ox, oy) => {
        for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) {
          const x = ox + i * 85 + 42 + (j % 2) * 30;
          const y = oy + j * 85 + 42;
          g2.fillStyle = R;
          g2.beginPath();
          g2.arc(x, y, 20, 0, Math.PI * 2);
          g2.fill();
          g2.fillStyle = '#000';
          g2.beginPath();
          g2.arc(x + 10, y - 7, 18, 0, Math.PI * 2);
          g2.fill();
          g2.fillStyle = Gc;
          starPath(g2, x + 28, y + 22, 6, 4, 0.4);
          g2.fill();
        }
      });
      break;
    case 'bolts':
      wrapDraw(g, S, (g2, ox, oy) => {
        for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) {
          const x = ox + i * 85 + 26 + (j % 2) * 20;
          const y = oy + j * 85 + 14;
          g2.fillStyle = R;
          g2.beginPath();
          g2.moveTo(x + 22, y);
          g2.lineTo(x, y + 36);
          g2.lineTo(x + 18, y + 36);
          g2.lineTo(x + 6, y + 66);
          g2.lineTo(x + 38, y + 26);
          g2.lineTo(x + 20, y + 26);
          g2.closePath();
          g2.fill();
        }
      });
      break;
    case 'gold':
    case 'stars':
      wrapDraw(g, S, (g2, ox, oy) => {
        for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) {
          g2.fillStyle = R;
          starPath(g2, ox + i * 85 + 42 + (j % 2) * 26, oy + j * 85 + 42, 22);
          g2.fill();
          g2.fillStyle = Gc;
          g2.beginPath();
          g2.arc(ox + i * 85 + 80 + (j % 2) * 26, oy + j * 85 + 76, 4, 0, Math.PI * 2);
          g2.fill();
        }
      });
      break;
    case 'hearts':
      wrapDraw(g, S, (g2, ox, oy) => {
        for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) {
          g2.fillStyle = (i + j) % 2 ? R : Gc;
          heartPath(g2, ox + i * 64 + 32 + (j % 2) * 32, oy + j * 64 + 36, 16);
          g2.fill();
        }
      });
      break;
    case 'clouds':
      wrapDraw(g, S, (g2, ox, oy) => {
        for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) {
          const x = ox + i * 128 + 64 + (j % 2) * 64;
          const y = oy + j * 128 + 64;
          g2.fillStyle = R;
          for (const [dx, dy, r] of [[-26, 6, 18], [0, -6, 24], [26, 6, 18], [0, 12, 18]]) {
            g2.beginPath();
            g2.arc(x + dx, y + dy, r, 0, Math.PI * 2);
            g2.fill();
          }
          g2.fillStyle = Gc;
          g2.beginPath();
          g2.arc(x + 44, y + 44, 5, 0, Math.PI * 2);
          g2.fill();
        }
      });
      break;
    case 'zigzag':
      g.strokeStyle = R;
      g.lineWidth = 14;
      for (let j = -1; j < 5; j++) {
        g.beginPath();
        for (let i = -1; i <= 9; i++) g.lineTo(i * 32, j * 64 + 18 + (i % 2 ? 22 : 0));
        g.stroke();
      }
      g.strokeStyle = Gc;
      g.lineWidth = 4;
      for (let j = -1; j < 5; j++) {
        g.beginPath();
        for (let i = -1; i <= 9; i++) g.lineTo(i * 32, j * 64 + 48 + (i % 2 ? 22 : 0));
        g.stroke();
      }
      break;
    case 'spots':
      wrapDraw(g, S, (g2, ox, oy) => {
        let s = 7;
        const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
        for (let k = 0; k < 18; k++) {
          const x = ox + rnd() * S;
          const y = oy + rnd() * S;
          const r = 10 + rnd() * 8;
          g2.fillStyle = Gc;
          g2.beginPath();
          g2.ellipse(x, y, r, r * 0.8, rnd() * 3, 0, Math.PI * 2);
          g2.fill();
          g2.strokeStyle = R;
          g2.lineWidth = 6;
          g2.beginPath();
          g2.ellipse(x, y, r, r * 0.8, rnd() * 3, 0.3, Math.PI * 1.6);
          g2.stroke();
        }
      });
      break;
    case 'tiger':
      g.fillStyle = R;
      for (let i = 0; i < 6; i++) {
        const y = i * 42 + 10;
        g.beginPath();
        g.moveTo(0, y);
        g.quadraticCurveTo(S * 0.3, y + 18, S * 0.55, y + 4);
        g.quadraticCurveTo(S * 0.8, y - 8, S, y);
        g.lineTo(S, y + 12);
        g.quadraticCurveTo(S * 0.75, y + 6, S * 0.5, y + 16);
        g.quadraticCurveTo(S * 0.25, y + 26, 0, y + 12);
        g.closePath();
        g.fill();
      }
      break;
    case 'plaid':
      g.globalCompositeOperation = 'lighter';
      g.fillStyle = '#990000';
      for (let i = 0; i < 4; i++) {
        g.fillRect(i * 64 + 6, 0, 22, S);
        g.fillRect(0, i * 64 + 6, S, 22);
      }
      g.fillStyle = Gc;
      for (let i = 0; i < 4; i++) {
        g.fillRect(i * 64 + 44, 0, 4, S);
        g.fillRect(0, i * 64 + 44, S, 4);
      }
      g.globalCompositeOperation = 'source-over';
      break;
    case 'galaxy':
      wrapDraw(g, S, (g2, ox, oy) => {
        let s = 3;
        const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
        for (let k = 0; k < 40; k++) {
          g2.fillStyle = k % 5 ? R : Gc;
          g2.beginPath();
          g2.arc(ox + rnd() * S, oy + rnd() * S, 1.5 + rnd() * 3, 0, Math.PI * 2);
          g2.fill();
        }
        g2.fillStyle = Gc;
        starPath(g2, ox + 70, oy + 80, 12, 4, 0.3);
        g2.fill();
        starPath(g2, ox + 190, oy + 180, 9, 4, 0.3);
        g2.fill();
      });
      break;
    case 'glow':
      wrapDraw(g, S, (g2, ox, oy) => {
        for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) {
          g2.fillStyle = both;
          starPath(g2, ox + i * 85 + 42 + (j % 2) * 26, oy + j * 85 + 42, 16);
          g2.fill();
        }
      });
      break;
    default: // plain: a fine pinstripe
      g.fillStyle = 'rgba(255,0,0,0.0)';
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.NoColorSpace;
  t.anisotropy = 4;
  t.generateMipmaps = true;
  t.needsUpdate = true;
  maskCache.set(id, t);
  return t;
}

const INK = { cream: '#FFF3DC', light: '#D8E8FF', gold: '#FFC94A', glow: '#C8FF7A' };

/**
 * The plush material for one look: { fur, skin, cloth, clothDark, trim, pattern, glow }.
 * Returns a MeshPhysicalMaterial with skinning; `setLook(look)` re-colours it.
 */
export function plushMaterial(look, { quality = 'high' } = {}) {
  const u = {
    uFur: { value: new THREE.Color(look.fur ?? '#6A4530') },
    uSkin: { value: new THREE.Color(look.skin ?? '#E9C29A') },
    uCloth: { value: new THREE.Color(look.cloth ?? '#E5483C') },
    uInk1: { value: new THREE.Color('#FFF3DC') },
    uInk2: { value: new THREE.Color('#FFF3DC') },
    uTrim: { value: new THREE.Color(look.trim ?? '#FFF3DC') },
    uPattern: { value: patternMask(look.pattern ?? 'plain') },
    uScale: { value: 7.5 },
    uGlow: { value: 0 },
    uDark: { value: 0 },
    uDetail: { value: quality === 'low' ? 0 : 1 },
  };
  const mat = new THREE.MeshPhysicalMaterial({
    color: '#ffffff', roughness: 0.9, metalness: 0, sheen: 1, sheenRoughness: 0.55, sheenColor: new THREE.Color('#ffffff'),
  });
  mat.userData.u = u;
  mat.customProgramCacheKey = () => `plush-${quality}`;
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
attribute vec4 fabric;
varying vec4 vFabric;
varying vec3 vBind;
varying vec3 vBindN;`)
      .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
vBindN = objectNormal;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
vBind = position;
vFabric = fabric;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec4 vFabric;
varying vec3 vBind;
varying vec3 vBindN;
uniform vec3 uFur, uSkin, uCloth, uInk1, uInk2, uTrim;
uniform sampler2D uPattern;
uniform float uScale, uGlow, uDark, uDetail;
float h31(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float vnoise(vec3 x) {
  vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(h31(i), h31(i + vec3(1,0,0)), f.x), mix(h31(i + vec3(0,1,0)), h31(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(h31(i + vec3(0,0,1)), h31(i + vec3(1,0,1)), f.x), mix(h31(i + vec3(0,1,1)), h31(i + vec3(1,1,1)), f.x), f.y), f.z);
}
vec4 tri(sampler2D t, vec3 p, vec3 n) {
  vec3 w = pow(abs(n), vec3(4.0)); w /= (w.x + w.y + w.z);
  return texture2D(t, p.zy) * w.x + texture2D(t, p.xz) * w.y + texture2D(t, p.xy) * w.z;
}
float plushH() {
  vec4 f = vFabric;
  float fur = vnoise(vBind * 260.0) * 0.6 + vnoise(vBind * 90.0) * 0.4;
  vec3 b = vBind * 300.0;
  float weave = (sin(b.x + b.z) * sin(b.y * 1.0) * 0.5 + 0.5);
  return (fur * f.x * 1.0 + weave * (f.z + f.w) * 0.35 + vnoise(vBind * 150.0) * f.y * 0.15) * uDetail;
}
vec3 plushBump(vec3 surf_pos, vec3 surf_norm, float faceDirection) {
  float h = plushH();
  vec2 dHdxy = vec2(dFdx(h), dFdy(h)) * 0.0022;
  vec3 vSigmaX = normalize(dFdx(surf_pos.xyz));
  vec3 vSigmaY = normalize(dFdy(surf_pos.xyz));
  vec3 vN = surf_norm;
  vec3 R1 = cross(vSigmaY, vN);
  vec3 R2 = cross(vN, vSigmaX);
  float fDet = dot(vSigmaX, R1) * faceDirection;
  vec3 vGrad = sign(fDet) * (dHdxy.x * R1 + dHdxy.y * R2);
  return normalize(abs(fDet) * surf_norm - vGrad);
}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
// Sharpen where fabrics meet so seams read as sewn edges, not a haze.
vec4 fs = vFabric * vFabric * vFabric;
vec4 fw = fs / max(1e-5, fs.x + fs.y + fs.z + fs.w);
vec4 pm = tri(uPattern, vBind * uScale, normalize(vBindN));
vec3 cloth = mix(mix(uCloth, uInk1, pm.r), uInk2, pm.g * (1.0 - pm.r * 0.5));
float pile = vnoise(vBind * 120.0);
vec3 furC = uFur * (0.86 + 0.28 * pile);
vec3 skinC = uSkin * (0.95 + 0.1 * vnoise(vBind * 60.0));
vec3 trimC = uTrim * (0.94 + 0.12 * pile);
diffuseColor.rgb = furC * fw.x + skinC * fw.y + cloth * fw.z + trimC * fw.w;
diffuseColor.rgb *= mix(1.0, 0.18, uDark);`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
roughnessFactor = fw.x * 0.97 + fw.y * 0.72 + fw.z * 0.86 + fw.w * 0.8;`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
normal = plushBump(-vViewPosition, normal, faceDirection);`)
      .replace('#include <lights_physical_fragment>', `#include <lights_physical_fragment>
#ifdef USE_SHEEN
material.sheenColor = (uFur * 0.9 + 0.05) * fw.x + uSkin * 0.12 * fw.y + (cloth * 0.45 + 0.03) * fw.z + (uTrim * 0.25) * fw.w;
material.sheenRoughness = clamp(0.35 * fw.x + 0.6 * fw.z + 0.6 * fw.w + 0.8 * fw.y, 0.07, 1.0);
#endif`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
totalEmissiveRadiance += uInk1 * pm.r * fw.z * uGlow * 1.6;`);
  };
  setPlushLook(mat, look);
  return mat;
}

/** Re-colour a plush material. */
export function setPlushLook(mat, look) {
  const u = mat.userData.u;
  u.uFur.value.set(look.fur ?? '#6A4530');
  u.uSkin.value.set(look.skin ?? '#E9C29A');
  u.uCloth.value.set(look.cloth ?? '#E5483C');
  u.uTrim.value.set(look.trim ?? '#FFF3DC');
  const pattern = look.pattern ?? 'plain';
  u.uPattern.value = patternMask(pattern);
  const [i1, i2] = PATTERN_INKS[pattern] ?? PATTERN_INKS.plain;
  const ink = (k) => (k === 'dark' ? new THREE.Color(look.clothDark ?? '#7A2020') : new THREE.Color(INK[k] ?? INK.cream));
  u.uInk1.value.copy(ink(i1));
  u.uInk2.value.copy(ink(i2));
  u.uGlow.value = pattern === 'glow' ? 1 : 0;
  if (pattern === 'galaxy') u.uCloth.value.set('#1B1740');
  u.uScale.value = pattern === 'stripes' || pattern === 'tiger' ? 5 : pattern === 'plaid' ? 4.5 : 7;
}

/** A flat swatch of pyjama `pattern` printed on `cloth` (a data URL, `size` px), for the wardrobe. */
const swatchCache = new Map();
export function patternSwatch(pattern, cloth, clothDark, size = 96) {
  const key = `${pattern}|${cloth}|${clothDark}|${size}`;
  if (swatchCache.has(key)) return swatchCache.get(key);
  const mask = patternMask(pattern);
  const c = cnv(size, size);
  const g = c.getContext('2d');
  // The print at the scale it has on a monkey's belly (about half a tile).
  g.drawImage(mask, 0, 0, 128, 128, 0, 0, size, size);
  const img = g.getImageData(0, 0, size, size);
  const [i1, i2] = PATTERN_INKS[pattern] ?? PATTERN_INKS.plain;
  const srgb = (hex) => {
    const o = { r: 0, g: 0, b: 0 };
    new THREE.Color(hex).getRGB(o, THREE.SRGBColorSpace);
    return [o.r, o.g, o.b];
  };
  const col = (k) => srgb(k === 'dark' ? clothDark : k === 'glow' ? '#B6FF8A' : INK[k] ?? INK.cream);
  const base = srgb(pattern === 'galaxy' ? '#1B1740' : cloth);
  const a = col(i1);
  const b = col(i2);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i] / 255;
    const gg = d[i + 1] / 255;
    const k0 = Math.max(0, 1 - r - gg);
    for (let ch = 0; ch < 3; ch++) d[i + ch] = Math.round(Math.min(1, base[ch] * k0 + a[ch] * r + b[ch] * gg) * 255);
    d[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const url = c.toDataURL ? c.toDataURL('image/png') : '';
  swatchCache.set(key, url);
  return url;
}
