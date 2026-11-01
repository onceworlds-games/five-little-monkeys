// Effects: puffs of quilt fluff, lint off the ring crests, feathers, stars, sparkles on a perfect pump, impact dust,
// confetti, shock rings where a slam lands, launch trails (puffs, feathers, stars, bubbles, confetti, Zs, hearts, bolts,
// fireflies), blob shadows that show each monkey's height, the player's rings and flying pillows. Pooled; nothing
// allocates per frame.
import * as THREE from 'three';
import { blobTexture, featherTexture, starTexture } from './textures.js';
import { glintTexture, heartTexture, boltTexture, zTexture, bubbleTexture, chipTexture, lintTexture } from './sprites.js';

const PARTICLE_VS = /* glsl */ `
attribute float aSize;
attribute float aAlpha;
attribute float aRot;
attribute vec3 aColor;
varying float vAlpha;
varying float vRot;
varying vec3 vColor;
uniform float uScale;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = aSize * uScale / max(0.1, -mv.z);
  vAlpha = aAlpha;
  vRot = aRot;
  vColor = aColor;
}`;
const PARTICLE_FS = /* glsl */ `
uniform sampler2D uMap;
varying float vAlpha;
varying float vRot;
varying vec3 vColor;
void main() {
  vec2 p = gl_PointCoord - 0.5;
  float c = cos(vRot), s = sin(vRot);
  p = vec2(c * p.x - s * p.y, s * p.x + c * p.y) + 0.5;
  vec4 t = texture2D(uMap, p);
  if (t.a * vAlpha < 0.02) discard;
  gl_FragColor = vec4(t.rgb * vColor, t.a * vAlpha);
  #include <colorspace_fragment>
}`;

class Particles {
  constructor(map, max, { additive = false, gravity = -6, drag = 1.5 } = {}) {
    this.max = max;
    this.gravity = gravity;
    this.drag = drag;
    this.pos = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.size = new Float32Array(max);
    this.alpha = new Float32Array(max);
    this.rot = new Float32Array(max);
    this.spin = new Float32Array(max);
    this.color = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.age = new Float32Array(max);
    this.size0 = new Float32Array(max);
    this.float = new Float32Array(max);
    this.grav = new Float32Array(max);
    this.grow = new Float32Array(max);
    this.next = 0;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aRot', new THREE.BufferAttribute(this.rot, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aColor', new THREE.BufferAttribute(this.color, 3).setUsage(THREE.DynamicDrawUsage));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 100);
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uMap: { value: map }, uScale: { value: 400 } },
      vertexShader: PARTICLE_VS,
      fragmentShader: PARTICLE_FS,
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
  }
  emit(x, y, z, o = {}) {
    const i = this.next;
    this.next = (this.next + 1) % this.max;
    const sp = o.speed ?? 2;
    const a = Math.random() * Math.PI * 2;
    const up = o.up ?? 1;
    this.pos[i * 3] = x + (Math.random() - 0.5) * (o.jitter ?? 0.2);
    this.pos[i * 3 + 1] = y;
    this.pos[i * 3 + 2] = z + (Math.random() - 0.5) * (o.jitter ?? 0.2);
    this.vel[i * 3] = (o.vx ?? 0) + Math.cos(a) * sp * Math.random();
    this.vel[i * 3 + 1] = (o.vy ?? 0) + up * (0.5 + Math.random()) * sp * 0.8;
    this.vel[i * 3 + 2] = (o.vz ?? 0) + Math.sin(a) * sp * Math.random();
    this.size0[i] = (o.size ?? 0.4) * (0.7 + Math.random() * 0.6);
    this.life[i] = (o.life ?? 0.8) * (0.7 + Math.random() * 0.6);
    this.age[i] = 0;
    this.rot[i] = Math.random() * 6.28;
    this.spin[i] = (Math.random() - 0.5) * (o.spin ?? 4);
    this.float[i] = o.float ?? 0;
    this.grav[i] = o.g ?? 1;
    this.grow[i] = o.grow ?? 0.3;
    const c = o.color ?? [1, 1, 1];
    this.color[i * 3] = c[0];
    this.color[i * 3 + 1] = c[1];
    this.color[i * 3 + 2] = c[2];
  }
  update(dt, scale) {
    this.mat.uniforms.uScale.value = scale;
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) {
        this.alpha[i] = 0;
        continue;
      }
      this.age[i] += dt;
      const k = this.age[i] / this.life[i];
      if (k >= 1) {
        this.life[i] = 0;
        this.alpha[i] = 0;
        continue;
      }
      const drag = Math.max(0, 1 - this.drag * dt);
      this.vel[i * 3] *= drag;
      this.vel[i * 3 + 2] *= drag;
      this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * (this.float[i] ? Math.max(0, 1 - 3 * dt) : 1) + (this.float[i] ? -0.6 : this.gravity) * this.grav[i] * dt;
      this.pos[i * 3] += this.vel[i * 3] * dt + (this.float[i] ? Math.sin(this.age[i] * 5 + i) * 0.6 * dt : 0);
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.rot[i] += this.spin[i] * dt;
      this.alpha[i] = k < 0.15 ? k / 0.15 : 1 - (k - 0.15) / 0.85;
      this.size[i] = this.size0[i] * (1 + this.grow[i] * k);
    }
    const g = this.points.geometry;
    g.attributes.position.needsUpdate = true;
    g.attributes.aSize.needsUpdate = true;
    g.attributes.aAlpha.needsUpdate = true;
    g.attributes.aRot.needsUpdate = true;
    g.attributes.aColor.needsUpdate = true;
  }
  clear() {
    this.life.fill(0);
    this.alpha.fill(0);
  }
}

const RING_VS = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const RING_FS = /* glsl */ `
uniform vec3 uColor;
uniform float uFill;
uniform float uAlpha;
uniform float uPie;
varying vec2 vUv;
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p);
  float a = atan(p.x, -p.y) / 6.2831853 + 0.5;
  float ring = smoothstep(0.62, 0.7, r) * (1.0 - smoothstep(0.86, 0.94, r));
  float arc = step(a, uFill) * smoothstep(0.72, 0.76, r) * (1.0 - smoothstep(0.82, 0.86, r));
  float pie = uPie * step(a, uFill) * (1.0 - smoothstep(0.58, 0.62, r)) * 0.35;
  float dash = uPie > 0.0 ? step(0.5, fract(a * 16.0)) * ring : ring * 0.55;
  vec3 col = mix(uColor, vec3(1.0, 0.97, 0.88), arc);
  float alpha = max(max(dash, arc), pie) * uAlpha;
  if (alpha < 0.01) discard;
  gl_FragColor = vec4(col, alpha);
  #include <colorspace_fragment>
}`;

function ringMesh() {
  const mat = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color() }, uFill: { value: 1 }, uAlpha: { value: 1 }, uPie: { value: 0 } },
    vertexShader: RING_VS,
    fragmentShader: RING_FS,
    transparent: true,
    depthWrite: false,
    depthTest: false,
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
  m.rotation.x = -Math.PI / 2;
  m.renderOrder = 4;
  return m;
}

const APPROACH_FS = /* glsl */ `
uniform vec3 uColor;
uniform float uR;
uniform float uR0;
uniform float uHit;
uniform float uAlpha;
varying vec2 vUv;
void main() {
  float r = length(vUv * 2.0 - 1.0);
  float w = 0.035;
  float moving = smoothstep(uR - w * 1.6, uR - w * 0.4, r) * (1.0 - smoothstep(uR + w * 0.4, uR + w * 1.6, r));
  float target = smoothstep(uR0 - w, uR0 - w * 0.3, r) * (1.0 - smoothstep(uR0 + w * 0.3, uR0 + w, r));
  vec3 hit = mix(vec3(1.0, 0.97, 0.88), vec3(1.0, 0.82, 0.25), step(1.5, uHit));
  vec3 col = mix(uColor, hit, step(0.5, uHit));
  float a = max(moving, target * (0.35 + 0.65 * step(0.5, uHit))) * uAlpha;
  if (a < 0.01) discard;
  gl_FragColor = vec4(col * (1.0 + uHit * 0.4), a);
  #include <colorspace_fragment>
}`;

function approachMesh() {
  const mat = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color() }, uR: { value: 1 }, uR0: { value: 0.25 }, uHit: { value: 0 }, uAlpha: { value: 1 } },
    vertexShader: RING_VS,
    fragmentShader: APPROACH_FS,
    transparent: true,
    depthWrite: false,
    depthTest: false,
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
  m.rotation.x = -Math.PI / 2;
  m.renderOrder = 4;
  m.scale.setScalar(3.6);
  return m;
}

function starGeometry(r = 0.1, depth = 0.04) {
  const sh = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + Math.PI / 2;
    const rr = i % 2 ? r * 0.45 : r;
    if (i === 0) sh.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
    else sh.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  const g = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: true, bevelThickness: 0.015, bevelSize: 0.015, bevelSegments: 2 });
  g.center();
  return g;
}

function pillowGeometry() {
  const g = new THREE.BoxGeometry(0.7, 0.22, 0.45, 6, 2, 4);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) / 0.35;
    const z = p.getZ(i) / 0.225;
    const puff = (1 - x * x * 0.6) * (1 - z * z * 0.6);
    p.setY(i, p.getY(i) * Math.max(0.3, puff));
  }
  g.computeVertexNormals();
  return g;
}

const SHOCK_FS = /* glsl */ `
uniform vec3 uColor;
uniform float uK;
uniform float uAlpha;
varying vec2 vUv;
void main() {
  float r = length(vUv * 2.0 - 1.0);
  float w = mix(0.3, 0.05, uK);
  float ring = smoothstep(1.0 - w, 1.0 - w * 0.45, r) * (1.0 - smoothstep(0.97, 1.0, r));
  float a = ring * uAlpha * (1.0 - uK) * (1.0 - uK);
  if (a < 0.01) discard;
  gl_FragColor = vec4(uColor * 1.6, a);
  #include <colorspace_fragment>
}`;

function shockMesh() {
  const mat = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color() }, uK: { value: 1 }, uAlpha: { value: 1 } },
    vertexShader: RING_VS,
    fragmentShader: SHOCK_FS,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
  m.rotation.x = -Math.PI / 2;
  m.renderOrder = 4;
  m.visible = false;
  return m;
}

const TRAIL_HEX = { bubbles: '#BFE8FF', hearts: '#FF6F91', bolts: '#FFE14A', zzz: '#CFE0FF', fireflies: '#E9FF8A' };
const CONFETTI = ['#FF5A5A', '#FFC23A', '#5FE3B0', '#3C86F0', '#C77DFF', '#FFF1D6'];

export function createFx(scene) {
  const puffs = new Particles(blobTexture(0.2), 320, { gravity: -3, drag: 2.5 });
  const feathers = new Particles(featherTexture(), 140, { gravity: -1, drag: 2 });
  const stars = new Particles(starTexture(), 110, { gravity: -5, drag: 1 });
  const glints = new Particles(glintTexture(), 160, { additive: true, gravity: 1.2, drag: 2.6 });
  const lint = new Particles(lintTexture(), 160, { gravity: -0.8, drag: 2.2 });
  const chips = new Particles(chipTexture(), 220, { gravity: -3.2, drag: 2.2 });
  const shapes = {
    hearts: new Particles(heartTexture(), 60, { gravity: 0.6, drag: 2 }),
    bolts: new Particles(boltTexture(), 60, { additive: true, gravity: 0, drag: 3 }),
    zzz: new Particles(zTexture(), 60, { gravity: 0.9, drag: 2 }),
    bubbles: new Particles(bubbleTexture(), 80, { gravity: 0.7, drag: 1.6 }),
  };
  const systems = [puffs, feathers, stars, glints, lint, chips, ...Object.values(shapes)];
  for (const p of systems) scene.add(p.points);

  // Blob shadows: one instanced mesh.
  const MAXB = 14;
  const blobs = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ map: blobTexture(0.35), color: '#1A0E22', transparent: true, depthWrite: false, opacity: 0.62, polygonOffset: true, polygonOffsetFactor: -4 }),
    MAXB,
  );
  blobs.renderOrder = 3;
  blobs.frustumCulled = false;
  scene.add(blobs);
  const mtx = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const sv = new THREE.Vector3();
  const pv = new THREE.Vector3();

  const you = ringMesh();
  you.scale.setScalar(1.15);
  const aim = ringMesh();
  aim.scale.setScalar(1.3);
  aim.material.uniforms.uPie.value = 1;
  scene.add(you, aim);

  const approach = approachMesh();
  scene.add(approach);

  // Shock rings where a slam lands.
  const shocks = [];
  for (let i = 0; i < 6; i++) {
    const m = shockMesh();
    scene.add(m);
    shocks.push({ mesh: m, age: 0, life: 0, r0: 0, r1: 0 });
  }
  let shockNext = 0;

  // Dizzy stars circling heads.
  const MAXS = 18;
  const dizzyStars = new THREE.InstancedMesh(starGeometry(0.09, 0.03), new THREE.MeshStandardMaterial({ color: '#FFD54A', emissive: '#FFB020', emissiveIntensity: 0.9, roughness: 0.4, metalness: 0.1 }), MAXS);
  dizzyStars.frustumCulled = false;
  dizzyStars.count = 0;
  scene.add(dizzyStars);
  let dizzyN = 0;
  const dq = new THREE.Quaternion();
  const de = new THREE.Euler();
  const one = new THREE.Vector3(1, 1, 1);

  // Pillows in flight.
  const pillowGeo = pillowGeometry();
  const pillows = [];
  for (let i = 0; i < 6; i++) {
    const m = new THREE.Mesh(pillowGeo, new THREE.MeshStandardMaterial({ color: '#F4ECDD', roughness: 0.9 }));
    m.visible = false;
    m.castShadow = true;
    scene.add(m);
    pillows.push({ mesh: m, from: new THREE.Vector3(), to: new THREE.Vector3(), t0: 0, at: 0, live: false, spin: 0 });
  }

  const col = new THREE.Color();
  const rgb = (hex) => {
    col.set(hex);
    return [col.r, col.g, col.b];
  };
  const CREAM = [1, 0.96, 0.88];

  const fx = {
    puff(x, y, z, n, o = {}) {
      for (let i = 0; i < n; i++) puffs.emit(x, y, z, o);
    },
    feathers(x, y, z, n, o = {}) {
      const burst = o.burst ? { speed: 5, up: 1.4 } : {};
      for (let i = 0; i < n; i++) feathers.emit(x, y, z, { size: 0.35, life: 2.2, speed: 3, float: 1, spin: 3, ...burst, ...o });
    },
    stars(x, y, z, n, o = {}) {
      for (let i = 0; i < n; i++) stars.emit(x, y, z, { size: 0.45, life: 0.9, speed: 3.5, ...o });
    },
    /** Glints that rise and wink out (a perfect pump, a grab), tinted `hex`. */
    sparkle(x, y, z, n, hex = '#FFE27A', o = {}) {
      const c = rgb(hex);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + Math.random();
        glints.emit(x + Math.cos(a) * 0.35, y, z + Math.sin(a) * 0.35, { vx: Math.cos(a) * 1.4, vz: Math.sin(a) * 1.4, speed: 0.6, up: 1.3, size: 0.42, life: 0.55, spin: 2, color: c, grow: -0.6, ...o });
      }
    },
    /** Soft floor dust where a monkey hits the boards. */
    dust(x, y, z, n) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        puffs.emit(x, y, z, { vx: Math.cos(a) * 2.6, vz: Math.sin(a) * 2.6, speed: 0.5, up: 0.4, size: 0.75, life: 1.1, g: -0.15, color: [0.78, 0.7, 0.6], grow: 1.2 });
      }
    },
    /** Paper confetti, falling and fluttering. */
    confetti(x, y, z, n, o = {}) {
      for (let i = 0; i < n; i++) chips.emit(x, y, z, { speed: o.speed ?? 4, up: o.up ?? 1.4, size: 0.24, life: 2.6, spin: 14, color: rgb(CONFETTI[i % CONFETTI.length]), float: o.float ?? 0, jitter: o.jitter ?? 0.4 });
    },
    /** A wisp of lint kicked off a ring's crest. */
    lint(x, y, z, hex) {
      lint.emit(x, y, z, { speed: 0.6, up: 1.6, size: 0.2, life: 0.9, spin: 2, color: hex ? rgb(hex) : CREAM, grow: 0.5 });
    },
    /** Where a slam lands: a shock ring, a ring of fluff in the slammer's colour, lint; gold and bigger for a Mega Slam. */
    slamBurst(x, y, z, e, hex, mega = false) {
      const c = rgb(mega ? '#FFC23A' : hex);
      const n = Math.round((10 + e * 10) * (mega ? 1.6 : 1));
      const sp = (2 + 2 * e) * (mega ? 1.4 : 1);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        puffs.emit(x + Math.cos(a) * 0.3, y + 0.05, z + Math.sin(a) * 0.3, { vx: Math.cos(a) * sp, vz: Math.sin(a) * sp, speed: 0.4, up: 0.8, size: 0.55, life: 0.55, color: c });
      }
      for (let i = 0; i < 6; i++) puffs.emit(x, y + 0.1, z, { speed: 1.2, up: 1.6, size: 0.5, life: 0.5, color: CREAM });
      for (let i = 0; i < 6 + e * 6; i++) lint.emit(x, y + 0.1, z, { speed: 2.4, up: 1.8, size: 0.22, life: 1.1, spin: 3, color: CREAM, grow: 0.4 });
      const s = shocks[shockNext];
      shockNext = (shockNext + 1) % shocks.length;
      s.mesh.position.set(x, y + 0.06, z);
      s.mesh.material.uniforms.uColor.value.set(mega ? '#FFC23A' : hex);
      s.mesh.material.uniforms.uAlpha.value = mega ? 1 : 0.75;
      s.age = 0;
      s.life = mega ? 0.5 : 0.32;
      s.r0 = 0.6;
      s.r1 = (2.2 + e * 1.4) * (mega ? 1.6 : 1);
      s.mesh.visible = true;
      if (mega) {
        fx.sparkle(x, y + 0.3, z, 14, '#FFD36A', { speed: 2.4, up: 2 });
        fx.confetti(x, y + 0.4, z, 10, { speed: 3 });
      }
    },
    /** A toy grabbed: a burst in its colours. */
    grab(x, y, z, kind) {
      const hex = kind === 'mega' ? '#FFC23A' : kind === 'shield' ? '#FFF1D6' : '#7FE08A';
      fx.sparkle(x, y, z, 16, hex, { speed: 2.2, up: 2.2, life: 0.7 });
      for (let i = 0; i < 10; i++) puffs.emit(x, y, z, { speed: 2.6, up: 1, size: 0.4, life: 0.45, color: rgb(hex) });
      if (kind === 'shield') fx.feathers(x, y, z, 8, { burst: true });
      if (kind === 'spring') for (let i = 0; i < 8; i++) shapes.bolts.emit(x, y, z, { speed: 3, up: 1.6, size: 0.36, life: 0.5, color: rgb('#B6FF7A'), spin: 6 });
      if (kind === 'mega') fx.confetti(x, y + 0.2, z, 12, { speed: 3 });
    },
    /** A launch trail behind a flying monkey, of kind `kind` (its wardrobe trail), tinted by `hex` where it's plain. */
    trail(x, y, z, hex, kind = 'none') {
      switch (kind) {
        case 'feathers':
          feathers.emit(x, y, z, { size: 0.3, life: 1.2, speed: 0.4, float: 1, spin: 3, color: [1, 1, 1] });
          break;
        case 'stars':
          stars.emit(x, y, z, { size: 0.32, life: 0.6, speed: 0.3, up: 0, color: rgb('#FFE27A') });
          break;
        case 'confetti':
          chips.emit(x, y, z, { size: 0.2, life: 1.2, speed: 0.6, up: 0.2, spin: 12, color: rgb(CONFETTI[Math.floor(Math.random() * CONFETTI.length)]) });
          break;
        case 'fireflies':
          glints.emit(x, y, z, { size: 0.3, life: 1.4, speed: 0.6, up: 0.4, g: 0.2, color: rgb(TRAIL_HEX.fireflies), grow: -0.5, spin: 0 });
          break;
        case 'bubbles':
        case 'hearts':
        case 'bolts':
        case 'zzz':
          shapes[kind].emit(x, y, z, { size: kind === 'bubbles' ? 0.34 : 0.3, life: 0.9, speed: 0.4, up: 0.3, spin: kind === 'zzz' ? 0.6 : 2, color: rgb(TRAIL_HEX[kind]), grow: 0.2 });
          break;
        default:
          puffs.emit(x, y, z, { speed: 0.1, up: 0, size: 0.42, life: 0.5, jitter: 0.05, color: rgb(hex) });
      }
    },
    /** The pump's approach ring: `ttl` seconds until the feet land (negative: in the quilt), `grade` 1 good, 2 perfect. */
    approach(x, y, z, hex, ttl, grade, visible) {
      approach.visible = visible;
      if (!visible) return;
      approach.position.set(x, y + 0.04, z);
      const u = approach.material.uniforms;
      u.uColor.value.set(hex);
      u.uR0.value = 0.16;
      u.uR.value = 0.16 + Math.max(0, ttl) * 1.9;
      u.uHit.value = grade;
      u.uAlpha.value = Math.min(1, (0.42 - Math.max(0, ttl)) / 0.12);
    },
    dizzyStart() {
      dizzyN = 0;
    },
    /** Stars circling a head (n of them). */
    dizzy(head, n, t) {
      for (let i = 0; i < n && dizzyN < MAXS; i++) {
        const a = t * 4.2 + (i / n) * Math.PI * 2;
        pv.set(head.x + Math.cos(a) * 0.42, head.y + 0.42 + Math.sin(a * 2) * 0.04, head.z + Math.sin(a) * 0.42);
        dq.setFromEuler(de.set(0, -a + t * 3, 0.3));
        mtx.compose(pv, dq, one);
        dizzyStars.setMatrixAt(dizzyN++, mtx);
      }
    },
    dizzyEnd() {
      dizzyStars.count = dizzyN;
      dizzyStars.instanceMatrix.needsUpdate = true;
    },
    /** shadows: [{ x, y (surface), z, h (height above it), size }] */
    blobs(list) {
      let n = 0;
      for (const b of list) {
        if (n >= MAXB) break;
        const k = Math.max(0.25, 1 - b.h * 0.22);
        const size = (b.size ?? 1.15) * k;
        sv.set(size, 1, size);
        pv.set(b.x, b.y + 0.02, b.z);
        mtx.compose(pv, q, sv);
        blobs.setMatrixAt(n, mtx);
        n++;
      }
      blobs.count = n;
      blobs.instanceMatrix.needsUpdate = true;
    },
    you(x, y, z, hex, fill, visible) {
      you.visible = visible;
      if (!visible) return;
      you.position.set(x, y + 0.03, z);
      you.material.uniforms.uColor.value.set(hex);
      you.material.uniforms.uFill.value = fill;
    },
    aim(x, y, z, hex, fill, visible) {
      aim.visible = visible;
      if (!visible) return;
      aim.position.set(x, y + 0.04, z);
      aim.material.uniforms.uColor.value.set(hex);
      aim.material.uniforms.uFill.value = fill;
    },
    throwPillow(fx0, fy, fz, x, y, z, t0, at, hex) {
      const p = pillows.find((pp) => !pp.live) ?? pillows[0];
      p.from.set(fx0, fy, fz);
      p.to.set(x, y, z);
      p.t0 = t0;
      p.at = at;
      p.live = true;
      p.spin = (Math.random() - 0.5) * 12;
      p.mesh.material.color.set(hex).lerp(new THREE.Color('#F4ECDD'), 0.55);
      p.mesh.visible = true;
    },
    update(dt, t, scale) {
      for (const p of systems) p.update(dt, scale);
      for (const s of shocks) {
        if (!s.mesh.visible) continue;
        s.age += dt;
        const k = s.age / s.life;
        if (k >= 1) {
          s.mesh.visible = false;
          continue;
        }
        const e = 1 - (1 - k) * (1 - k) * (1 - k);
        s.mesh.scale.setScalar((s.r0 + (s.r1 - s.r0) * e) * 2);
        s.mesh.material.uniforms.uK.value = k;
      }
      for (const p of pillows) {
        if (!p.live) continue;
        const k = (t - p.t0) / Math.max(0.05, p.at - p.t0);
        if (k >= 1 || k < -0.5) {
          p.live = false;
          p.mesh.visible = false;
          continue;
        }
        const kk = Math.max(0, k);
        p.mesh.position.lerpVectors(p.from, p.to, kk);
        p.mesh.position.y += Math.sin(kk * Math.PI) * 2.4;
        p.mesh.rotation.set(kk * p.spin, kk * p.spin * 0.5, 0);
      }
    },
    clear() {
      for (const p of systems) p.clear();
      for (const s of shocks) s.mesh.visible = false;
      for (const p of pillows) {
        p.live = false;
        p.mesh.visible = false;
      }
    },
  };
  return fx;
}
