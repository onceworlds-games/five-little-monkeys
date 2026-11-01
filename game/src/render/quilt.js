// The quilt: a fine grid over each mattress, lifted in the vertex shader by the same ring formula the physics uses
// (waves.js), dented where monkeys land, and lit along each ring's crest in its slammer's colour.
import * as THREE from 'three';
import { WAVE } from '../sim/config.js';

export const MAX_WAVES = 12;
export const MAX_DENTS = 6;

const HEADER = /* glsl */ `
uniform float uTime;
uniform int uCount;
uniform vec4 uW0[${MAX_WAVES}];
uniform vec4 uW1[${MAX_WAVES}];
uniform vec3 uWC[${MAX_WAVES}];
uniform vec4 uRect;
uniform vec4 uDents[${MAX_DENTS}];
uniform float uSwell;
uniform float uSi;
attribute float aIn;
varying vec3 vRing;
varying float vCore;

float qAmp(float d, float R, float A) {
  if (d >= R) return 0.0;
  float f = pow(1.0 - d / R, 0.8);
  float r = clamp(d / ${WAVE.rise.toFixed(2)}, 0.0, 1.0);
  return A * f * r * r * (3.0 - 2.0 * r);
}
float qBand(float x) {
  float ax = abs(x);
  if (ax >= ${WAVE.half.toFixed(2)}) return 0.0;
  return 0.5 * (1.0 + cos(3.14159265 * ax / ${WAVE.half.toFixed(2)}));
}
vec2 qSrc(int k, vec2 c) {
  if (k == 1) return vec2(2.0 * uRect.x - c.x, c.y);
  if (k == 2) return vec2(2.0 * uRect.y - c.x, c.y);
  if (k == 3) return vec2(c.x, 2.0 * uRect.z - c.y);
  if (k == 4) return vec2(c.x, 2.0 * uRect.w - c.y);
  return c;
}
float qField(vec2 p, bool colour) {
  float h = 0.0;
  for (int i = 0; i < ${MAX_WAVES}; i++) {
    if (i >= uCount) break;
    vec4 a = uW0[i];
    vec4 b = uW1[i];
    float tau = uTime - a.z;
    if (tau < 0.0 || abs(b.z - uSi) > 0.5) continue;
    if (tau > (b.x + ${WAVE.half.toFixed(2)}) / a.w + 0.3) continue;
    float r = a.w * tau;
    int srcs = b.w > 0.0 ? 5 : 1;
    for (int k = 0; k < 5; k++) {
      if (k >= srcs) break;
      vec2 c = qSrc(k, a.xy);
      float f = k == 0 ? 1.0 : b.w;
      float d = distance(p, c);
      float bd = qBand(d - r);
      if (bd <= 0.0) continue;
      float amp = qAmp(d, b.x, b.y) * f;
      h += amp * bd;
      if (colour) {
        float strength = clamp(amp / 0.22, 0.0, 1.0);
        vRing += uWC[i] * pow(bd, 0.6) * strength;
        float core = qBand((d - r) * 6.5);
        vCore += core * strength;
      }
    }
    // The crater where the slam lands.
    if (k_dummy_never(tau)) h += 0.0;
    if (tau < 0.22) {
      float d0 = distance(p, a.xy);
      float fall = clamp(1.0 - d0 / 0.9, 0.0, 1.0);
      h -= 0.28 * (1.0 - tau / 0.22) * fall * fall * min(1.0, b.y);
    }
  }
  for (int j = 0; j < ${MAX_DENTS}; j++) {
    vec4 dn = uDents[j];
    if (dn.z <= 0.0) continue;
    float d = distance(p, dn.xy) / dn.w;
    if (d < 1.0) { float k2 = 1.0 - d * d; h -= dn.z * k2 * k2; }
  }
  if (uSwell > 0.0) h += uSwell * sin(0.8 * uTime + 0.55 * p.x) * cos(0.6 * uTime + 0.45 * p.y);
  return h;
}
`.replace('    if (k_dummy_never(tau)) h += 0.0;\n', '');

/**
 * A quilt material sharing one set of ring uniforms. Cotton with a sheen; each patch puffs up between its seams (in the
 * vertex shader, so the light rakes across real bumps); a ring's crest is tinted and threaded in its slammer's colour.
 * opts: { weave (normal map), patch: [x0, z0, w, h] (the patch grid), puff (height), quality }.
 */
export function quiltMaterial(map, bump, rect, si, uniforms, swell = 0, opts = {}) {
  const hi = opts.quality !== 'low';
  const mat = new THREE.MeshPhysicalMaterial({
    map, bumpMap: bump, bumpScale: 0.9, roughness: 0.9, metalness: 0,
    sheen: 0.55, sheenRoughness: 0.55, sheenColor: new THREE.Color('#FFF2E0'),
    normalMap: hi ? opts.weave ?? null : null, normalScale: new THREE.Vector2(0.55, 0.55),
  });
  const pt = opts.patch ?? [rect.x0, rect.z0, 1, 1];
  const own = {
    uRect: { value: new THREE.Vector4(rect.x0, rect.x1, rect.z0, rect.z1) },
    uSwell: { value: swell },
    uSi: { value: si },
    uPatch: { value: new THREE.Vector4(pt[0], pt[1], pt[2], pt[3]) },
    uPuff: { value: opts.puff ?? 0.075 },
  };
  mat.userData.uniforms = own;
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms, own);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${HEADER}
uniform vec4 uPatch;
uniform float uPuff;
float qPuff(vec2 p) {
  vec2 f = (p - uPatch.xy) / uPatch.zw;
  vec2 g = fract(f);
  // Inside the patch grid only; a soft pillow between the seams, flat along them.
  if (f.x < 0.0 || f.y < 0.0 || p.x > uRect.y || p.y > uRect.w) return 0.0;
  float s = sin(3.14159265 * g.x) * sin(3.14159265 * g.y);
  return uPuff * pow(max(s, 0.0), 0.55);
}`)
      .replace(
        '#include <beginnormal_vertex>',
        `#include <beginnormal_vertex>
        vRing = vec3(0.0);
        vCore = 0.0;
        float qh = 0.0;
        if (aIn > 0.0) {
          vec2 qp = position.xz;
          qh = (qField(qp, true) + qPuff(qp)) * aIn;
          float e = 0.05;
          float hx = (qField(qp + vec2(e, 0.0), false) + qPuff(qp + vec2(e, 0.0))) * aIn;
          float hz = (qField(qp + vec2(0.0, e), false) + qPuff(qp + vec2(0.0, e))) * aIn;
          objectNormal = normalize(vec3(-(hx - qh) / e, 1.0, -(hz - qh) / e));
        }`,
      )
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n        transformed.y += qh;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vRing;\nvarying float vCore;')
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        vec3 ring = min(vRing, vec3(1.0));
        float ringAmt = max(max(ring.r, ring.g), ring.b);
        vec3 hue = ring / max(ringAmt, 0.001);
        diffuseColor.rgb = mix(diffuseColor.rgb, hue, ringAmt * 0.2);
        float core = clamp(vCore, 0.0, 1.0);
        totalEmissiveRadiance += hue * (ringAmt * 0.08 + core * 0.95) + vec3(1.0, 0.97, 0.9) * core * 0.18;`,
      );
  };
  mat.customProgramCacheKey = () => `quilt2${hi ? 'h' : 'l'}`;
  return mat;
}

/**
 * The quilt's grid for a mattress rect at height `top`: `over` of overhang on the open sides hangs down like a draped
 * edge. aIn is 1 on the mattress (the shader lifts it), fading to 0 at the edge and on the drape.
 */
export function quiltGeometry(rect, top, over, open, step = 0.07) {
  const ox0 = rect.x0 - (open.x0 ? over : 0.02);
  const ox1 = rect.x1 + (open.x1 ? over : 0.02);
  const oz0 = rect.z0 - (open.z0 ? over : 0.02);
  const oz1 = rect.z1 + (open.z1 ? over : 0.02);
  const nx = Math.max(8, Math.round((ox1 - ox0) / step));
  const nz = Math.max(8, Math.round((oz1 - oz0) / step));
  const verts = (nx + 1) * (nz + 1);
  const pos = new Float32Array(verts * 3);
  const uv = new Float32Array(verts * 2);
  const inn = new Float32Array(verts);
  // The texture covers [x0 - over, x1 + over] whatever the sides.
  const tx0 = rect.x0 - over;
  const tz0 = rect.z0 - over;
  const tw = rect.x1 - rect.x0 + over * 2;
  const th = rect.z1 - rect.z0 + over * 2;
  let v = 0;
  for (let j = 0; j <= nz; j++) {
    for (let i = 0; i <= nx; i++) {
      const x = ox0 + ((ox1 - ox0) * i) / nx;
      const z = oz0 + ((oz1 - oz0) * j) / nz;
      const outX = Math.max(rect.x0 - x, x - rect.x1, 0);
      const outZ = Math.max(rect.z0 - z, z - rect.z1, 0);
      const out = Math.max(outX, outZ);
      const drop = out > 0 ? Math.min(0.5, out * 1.9) + out * out * 2 : 0;
      pos[v * 3] = x;
      pos[v * 3 + 1] = top + 0.06 - drop;
      pos[v * 3 + 2] = z;
      uv[v * 2] = (x - tx0) / tw;
      uv[v * 2 + 1] = 1 - (z - tz0) / th;
      const edge = Math.min(x - rect.x0, rect.x1 - x, z - rect.z0, rect.z1 - z);
      inn[v] = edge <= 0 ? 0 : Math.min(1, edge / 0.18);
      v++;
    }
  }
  const idx = [];
  for (let j = 0; j < nz; j++)
    for (let i = 0; i < nx; i++) {
      const a = j * (nx + 1) + i;
      const b = a + 1;
      const c = a + nx + 1;
      const d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setAttribute('aIn', new THREE.BufferAttribute(inn, 1));
  g.setIndex(verts > 65535 ? new THREE.Uint32BufferAttribute(idx, 1) : new THREE.Uint16BufferAttribute(idx, 1));
  g.computeVertexNormals();
  g.computeBoundingSphere();
  g.boundingSphere.radius += 2;
  return g;
}

/** Shared ring uniforms; `update` writes the live rings (time on the quilt's clock). */
export function ringUniforms() {
  const u = {
    uTime: { value: 0 },
    uCount: { value: 0 },
    uW0: { value: Array.from({ length: MAX_WAVES }, () => new THREE.Vector4()) },
    uW1: { value: Array.from({ length: MAX_WAVES }, () => new THREE.Vector4()) },
    uWC: { value: Array.from({ length: MAX_WAVES }, () => new THREE.Color()) },
    uDents: { value: Array.from({ length: MAX_DENTS }, () => new THREE.Vector4()) },
  };
  return u;
}

const tmpColor = new THREE.Color();

/**
 * Write the live rings and dents. `t` and every ring's t0 are on the sim clock; `base` keeps the shader's floats small.
 * `colorOf(owner)` gives a ring's colour (hex). `dents`: [{ x, z, depth, r }].
 */
export function writeRings(u, waves, t, base, colorOf, dents) {
  u.uTime.value = t - base;
  let n = 0;
  for (let i = waves.length - 1; i >= 0 && n < MAX_WAVES; i--) {
    const w = waves[i];
    if (t - w.t0 > w.life + 0.3) continue;
    u.uW0.value[n].set(w.x, w.z, w.t0 - base, w.c);
    u.uW1.value[n].set(w.R, w.A, w.si, w.src.length > 1 ? w.src[1][2] : 0);
    tmpColor.set(colorOf(w.owner));
    u.uWC.value[n].copy(tmpColor);
    n++;
  }
  u.uCount.value = n;
  for (let j = 0; j < MAX_DENTS; j++) {
    const d = dents[j];
    if (d) u.uDents.value[j].set(d.x, d.z, d.depth, d.r);
    else u.uDents.value[j].set(0, 0, 0, 1);
  }
}
