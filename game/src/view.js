// Draws a world: the room and quilt for its bed, a plush monkey for every body (acting out its physics), shadows, the
// player's rings (the pump's approach ring, the slam's aim), toys, pillows and fluff, and a camera that frames the bed.
// Shared by the game and the posters.
import * as THREE from 'three';
import { createStage } from './render/scene.js';
import { buildRoom } from './render/room.js';
import { ringUniforms, writeRings } from './render/quilt.js';
import { createMonkey, FURS } from './render/monkey.js';
import { loadBodies } from './render/bodies.js';
import { createFx } from './render/fx.js';
import { createToys } from './render/toys.js';
import { fieldAt, ampAt } from './sim/waves.js';
import { surfaceUnder, inside } from './sim/beds.js';
import { CONTACT, SLAM, PILLOW, PUMP } from './sim/config.js';
import { v0For, timeToLand, pressMeaning } from './sim/body.js';

const tmpV = new THREE.Vector3();
const camV = new THREE.Vector3();
// Monkeys are drawn bigger than their physics body, so they read on a phone (the physics is unchanged).
export const SCALE = 1.25;
/** Which body a look wears: the cast have their own shapes; Biscuit is a bear. */
const BODY_OF_EXTRA = { brows: 'rumble', bigeyes: 'tiptoe', glasses: 'mimic', mask: 'dozy', bear: 'bear' };
export const bodyOf = (look) => look.body ?? BODY_OF_EXTRA[look.extra] ?? 'player';

/** A seat look ({ hex, dark, symbol, pattern, extra, hat, fur }) as the plush's look. */
function plushLook(look, kind) {
  const [fur, skin] = FURS[kind] ?? FURS.player;
  return {
    cloth: look.hex, clothDark: look.dark, trim: '#FFF1D6', fur: look.fur ?? fur, skin, pattern: look.pattern ?? 'plain',
    symbol: kind === 'bear' ? '' : look.symbol, extra: look.extra === 'bear' ? '' : look.extra ?? '', hat: look.hat ?? 'none',
  };
}

const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export function createView(canvasEl, { quality = 'high', poster = false, pixelRatio = 1 } = {}) {
  const stage = createStage(canvasEl, { quality, poster, pixelRatio });
  const { scene, camera } = stage;
  const u = ringUniforms();
  const fx = createFx(scene);
  const toys = createToys(scene);
  let room = null;
  let bedId = '';
  let q = quality;
  const monkeys = new Map();
  let base = 0;
  const camPos = new THREE.Vector3(0, 10, 14);
  const camTarget = new THREE.Vector3();
  let camFov = 40;
  let camInit = false;
  let bodies = null;
  const ready = loadBodies().then((b) => {
    bodies = b;
  });

  function setBed(bed) {
    if (bed.id === bedId && room) return;
    bedId = bed.id;
    if (room) {
      scene.remove(room.group);
      room.dispose?.();
    }
    room = buildRoom(bed, u, q);
    scene.add(room.group);
    stage.setQuality(q, bed.box);
    stage.moon.target.position.set(0, 0, (bed.box.z0 + bed.box.z1) / 2);
    fx.clear();
    toys.clear();
  }

  // Lights Out: the room's own lights dim in room.update; the moon, the fill and the sky dim here.
  const base0 = { moon: stage.moon.intensity, hemi: stage.hemi.intensity, fill: stage.fill.intensity, env: scene.environmentIntensity };
  let darkNow = 0;
  function setDark(k) {
    if (Math.abs(k - darkNow) < 0.002) return;
    darkNow = k;
    stage.moon.intensity = base0.moon * (1 - k * 0.55);
    stage.hemi.intensity = base0.hemi * (1 - k * 0.8);
    stage.fill.intensity = base0.fill * (1 - k * 0.9);
    scene.environmentIntensity = base0.env * (1 - k * 0.7);
  }

  function setQuality(next, bed) {
    if (next === q) return;
    q = next;
    stage.renderer.shadowMap.enabled = next !== 'low';
    for (const m of monkeys.values()) m.mk.mesh.castShadow = next !== 'low';
    if (bed) {
      bedId = '';
      setBed(bed);
    } else stage.setQuality(q);
  }

  /** look: { hex, dark, symbol, pattern, extra, hat } */
  function monkeyFor(id, look) {
    if (!bodies) return null;
    const kind = bodyOf(look);
    const key = `${kind}|${look.extra}|${look.hex}|${look.symbol}`;
    let m = monkeys.get(id);
    if (m && m.key !== key) {
      m.mk.dispose();
      monkeys.delete(id);
      m = null;
    }
    const pl = plushLook(look, kind);
    const lk = `${pl.pattern}|${pl.hat}|${pl.fur}`;
    if (!m) {
      const mk = createMonkey({ data: bodies[kind].mesh, anchors: bodies[kind].anchors, body: kind, look: pl, quality: q, shadows: q !== 'low' });
      scene.add(mk.group);
      m = { mk, key, yaw: 0, lookKey: lk, throwAt: -9, pillowAt: 0, outX: 0, outZ: 0, flip: false };
      monkeys.set(id, m);
    }
    if (lk !== m.lookKey) {
      m.lookKey = lk;
      m.mk.setLook({ pattern: pl.pattern, hat: pl.hat, fur: pl.fur });
    }
    return m;
  }

  function dropMissing(keep) {
    for (const [id, m] of monkeys) if (!keep.has(id)) {
      m.mk.dispose();
      monkeys.delete(id);
    }
  }

  /** The rug spot for an out monkey (index 0-4) or a sitting extra. */
  function rugSpot(bed, i, n = 5) {
    const span = Math.min(bed.box.x1 - bed.box.x0 - 1, 6.4);
    const x = n <= 1 ? 0 : -span / 2 + (span * i) / (n - 1);
    return { x, y: bed.floor, z: bed.box.z1 + 1.55 + (i % 2) * 0.55 };
  }

  const topAt = (world, si, x, z) => {
    const s = world.bed.surfaces[si];
    return s ? s.top + fieldAt(world.waves, si, x, z, world.t) : world.bed.floor;
  };

  /** What a monkey looks at: a ring about to reach it, else the camera. */
  function lookTarget(world, b, out) {
    let best = null;
    let bd = 3.2;
    for (const w of world.waves) {
      const age = world.t - w.t0;
      if (age < -0.3 || age > 0.5 || w.owner === b.id) continue;
      const d = Math.hypot(w.x - b.x, w.z - b.z);
      if (d < bd) {
        bd = d;
        best = out.set(w.x, topAt(world, w.si, w.x, w.z), w.z);
      }
    }
    return best ?? out.copy(camera.position);
  }

  /**
   * Draw `world`. opts: {
   *   looks: Map id → look, me: id | null, guilty: bool, extras: [{ id, look, spot, wave, mode, dance }], winner: id,
   *   cheer: id, dance(id) → dance id, lastLaunch: Map id → hex, colorOf(id) → hex, dt, anim, hideRing, trail
   * }
   */
  function draw(world, opts) {
    const bed = world.bed;
    setBed(bed);
    const keep = new Set();
    const blobs = [];
    const dents = [];
    const tw = world.t;
    const dt = opts.dt ?? 1 / 60;
    fx.dizzyStart();
    for (const e of world.entries.values()) {
      const look = opts.looks.get(e.id);
      if (!look) continue;
      keep.add(e.id);
      const m = monkeyFor(e.id, look);
      if (!m) continue;
      const b = e.body;
      const s = {
        x: b.x + e.err.x, y: b.y + e.err.y, z: b.z + e.err.z, scale: SCALE, vx: b.vx, vz: b.vz, vy: b.vy, tier: b.tier,
        mega: b.mega > tw, shield: b.shield > tw, ghost: b.ghost > tw, dizzy: 0, bandage: false, mode: 'air',
      };
      e.drawn = true;
      // Facing: toward the camera, turning with the steer.
      const targetYaw = Math.atan2(b.vx, 3 + Math.max(-2.5, b.vz)) * 0.9;
      m.yaw += (targetYaw - m.yaw) * Math.min(1, dt * 8);
      s.yaw = m.yaw;
      const out = b.out || (b.mode === 'falling' && b.y <= bed.floor + 0.01);
      if (out) {
        const since = b.out ? tw - b.outAt : 0;
        const spot = rugSpot(bed, e.index);
        s.bandage = true;
        if (since < 0.9) {
          // Flat on the floor where it landed, seeing stars.
          s.mode = 'splat';
          s.y = bed.floor;
          m.outX = b.x;
          m.outZ = b.z;
        } else if (since < 1.5) {
          // Hop over to the rug.
          const k = (since - 0.9) / 0.6;
          const kk = smooth(0, 1, k);
          s.x = m.outX + (spot.x - m.outX) * kk;
          s.z = m.outZ + (spot.z - m.outZ) * kk;
          s.y = bed.floor + Math.sin(k * Math.PI) * 1.1;
          s.mode = 'hop';
          s.hopPhase = k;
          s.yaw = Math.atan2(spot.x - m.outX, spot.z - m.outZ);
          m.yaw = 0;
        } else {
          s.x = spot.x;
          s.z = spot.z;
          s.y = bed.floor;
          s.yaw = Math.atan2(-spot.x * 0.15, 1);
          s.mode = 'sit';
          s.dizzy = since < 3.8 ? 1 : 0;
          if (b.nextPillow !== m.pillowAt) {
            if (m.pillowAt && b.nextPillow > m.pillowAt) m.throwAt = opts.anim;
            m.pillowAt = b.nextPillow;
          }
          if (opts.anim - m.throwAt < 0.55) s.mode = 'throw';
          else if (!s.dizzy && b.nextPillow - tw < 0.8) s.holding = 'pillow';
        }
        if (since < 2.4 && Math.floor(opts.anim * 6) !== Math.floor((opts.anim - dt) * 6)) fx.stars(s.x, s.y + 1.1, s.z, 1, { speed: 0.4, up: 0.6, size: 0.3, life: 0.6 });
      } else {
        const su = bed.surfaces[b.si];
        if (b.mode === 'contact' && su) {
          const prog = 1 - Math.max(0, b.tc) / CONTACT;
          const k = Math.sin(Math.min(1, prog) * Math.PI);
          const fld = fieldAt(world.waves, b.si, b.x, b.z, tw);
          s.mode = 'contact';
          s.prog = prog;
          s.low = b.low;
          s.pump = b.grade > 0;
          s.y = Math.max(s.y, su.top + fld) - 0.13 * k;
          dents.push({ x: b.x, z: b.z, depth: 0.15 * k * (b.low ? 1.3 : 1), r: 0.62 });
          m.flip = b.tier >= PUMP.max && b.grade === 2;
        } else if (b.mode === 'dive') {
          s.mode = 'dive';
        } else if (b.mode === 'launched') {
          s.mode = 'launched';
          s.launchId = b.lastAt;
          s.tumble = b.tumble;
          if (opts.trail && opts.lastLaunch?.get(e.id)) fx.trail(s.x, s.y + 0.55, s.z, opts.lastLaunch.get(e.id), look.trail);
        } else if (b.mode === 'falling') {
          s.mode = 'falling';
        } else {
          s.mode = 'air';
          const v0 = v0For(b.apexNext ?? 1.6);
          s.v0 = v0;
          s.low = b.low;
          if (m.flip && v0 > 0) {
            const ph = (v0 - b.vy) / (2 * v0);
            s.flipT = smooth(0.12, 0.8, ph);
            if (ph > 0.95) m.flip = false;
          }
        }
        s.teeter = b.teeter > 0 ? Math.min(1, b.teeter * 2) : 0;
        s.dizzy = b.dizzy / 3;
        if (opts.guilty) {
          s.mode = e.id === opts.winner ? 'cheer' : 'guilty';
          s.flipT = null;
          s.teeter = 0;
        }
        // Shadow.
        const under = surfaceUnder(bed, b.x, b.z, b.y + 0.01);
        if (under >= 0) {
          const ss = bed.surfaces[under];
          blobs.push({ x: s.x, z: s.z, y: ss.top + fieldAt(world.waves, under, b.x, b.z, tw), h: Math.max(0, b.y - ss.top) });
        } else blobs.push({ x: s.x, z: s.z, y: bed.floor, h: Math.max(0, b.y - bed.floor) * 0.6 + 1.5 });
      }
      if (opts.cheer === e.id) {
        s.mode = 'dance';
        s.dance = opts.dance?.(e.id) ?? look.dance ?? 'cheer';
      }
      s.lookAt = lookTarget(world, b, camV);
      m.mk.update(s, dt);
      if (b.dizzy > 0 && !b.out) fx.dizzy(m.mk.headWorld(tmpV), b.dizzy, opts.anim);
    }
    for (const x of opts.extras ?? []) {
      keep.add(x.id);
      const m = monkeyFor(x.id, x.look);
      if (!m) continue;
      const s = { x: x.spot.x, y: x.spot.y, z: x.spot.z, yaw: x.spot.yaw ?? 0, scale: SCALE, mode: x.wave ? 'wave' : x.mode ?? 'sit', dance: x.dance ?? x.look.dance, clip: x.clip, lookAt: camera.position };
      m.mk.update(s, dt);
    }
    dropMissing(keep);
    // Toys on the quilt, the pillow rain, and lint kicked off the crests.
    toys.update(world.liveToys?.(tw) ?? [], world.fallingRain?.(tw) ?? [], tw, opts.anim, (si, x, z) => topAt(world, si, x, z), blobs);
    if (!opts.noLint) {
      for (const w of world.waves) {
        const tau = tw - w.t0;
        if (tau < 0.05 || tau > w.life) continue;
        const r = w.c * tau;
        const a = ampAt(w, r);
        if (a < 0.12 || Math.random() > dt * 26 * Math.min(1.5, a)) continue;
        const ang = Math.random() * Math.PI * 2;
        const x = w.x + Math.cos(ang) * r;
        const z = w.z + Math.sin(ang) * r;
        const su = bed.surfaces[w.si];
        if (!su || !inside(su, x, z, 0)) continue;
        fx.lint(x, topAt(world, w.si, x, z) + 0.05, z, Math.random() < 0.35 ? opts.colorOf?.(w.owner) : null);
      }
    }
    fx.blobs(blobs);
    fx.dizzyEnd();
    // The player's rings: the pump's approach ring as the feet come down, the slam's aim when high, the pillow's aim.
    const me = opts.me ? world.entries.get(opts.me) : null;
    if (me && opts.looks.get(opts.me) && !opts.hideRing) {
      const b = me.body;
      const hex = opts.looks.get(opts.me).hex;
      if (!b.out) {
        const under = surfaceUnder(bed, b.x, b.z, b.y + 0.01);
        const su = bed.surfaces[under];
        const y = su ? su.top + fieldAt(world.waves, under, b.x, b.z, tw) : bed.floor;
        const meaning = pressMeaning(bed, b, tw);
        const fill = tw >= b.cool ? 1 : 1 - (b.cool - tw) / SLAM.cooldown;
        fx.you(b.x, y, b.z, hex, fill, !!su && meaning === 'slam');
        // Approach: from 0.42 s out, a ring closes onto the feet; it meets them at touchdown.
        let ttl = Infinity;
        if (b.mode === 'air' && b.vy < 0 && !b.low) ttl = timeToLand(bed, b);
        else if (b.mode === 'contact' && !b.low) ttl = -(CONTACT - Math.max(0, b.tc));
        fx.approach(b.x, y, b.z, hex, ttl, b.grade, !!su && ttl < 0.42 && ttl > -PUMP.good);
        fx.aim(0, 0, 0, hex, 0, false);
      } else {
        fx.you(0, 0, 0, hex, 0, false);
        fx.approach(0, 0, 0, hex, 1, 0, false);
        const si = surfaceUnder(bed, b.aimX, b.aimZ, 99);
        const su = bed.surfaces[si] ?? bed.surfaces[0];
        const fill = tw >= b.nextPillow ? 1 : 1 - (b.nextPillow - tw) / PILLOW.every;
        fx.aim(b.aimX, su.top + fieldAt(world.waves, su.i, b.aimX, b.aimZ, tw), b.aimZ, hex, Math.max(0, fill), true);
      }
    } else {
      fx.you(0, 0, 0, '#ffffff', 0, false);
      fx.approach(0, 0, 0, '#ffffff', 1, 0, false);
      fx.aim(0, 0, 0, '#ffffff', 0, false);
    }
    // Quilt.
    if (Math.abs(tw - base) > 500) base = Math.floor(tw);
    dents.sort((a, b2) => b2.depth - a.depth);
    writeRings(u, world.waves, tw, base, opts.colorOf, dents);
  }

  /** Aim the camera at a box with margins; `snap` jumps there. */
  let fitKey = '';
  let fitCache = null;
  function frame(box, w, h, margins, opts = {}, dt = 1, snap = false) {
    const key = `${box.x0},${box.x1},${box.y0},${box.y1},${box.z0},${box.z1},${w},${h},${margins.top},${margins.bottom},${margins.left},${margins.right},${opts.pitch ?? ''},${opts.yaw ?? ''}`;
    if (key !== fitKey) {
      fitKey = key;
      fitCache = stage.fit(box, w, h, margins, opts);
    }
    const f = fitCache;
    const k = snap || !camInit ? 1 : 1 - Math.exp(-dt * (opts.rate ?? 2.6));
    camInit = true;
    camPos.lerp(f.pos, k);
    camTarget.lerp(f.target, k);
    camFov += (f.fov - camFov) * k;
  }

  function render(dt, t, reduced) {
    const sh = stage.shakeOffset(dt, t, reduced);
    camera.position.copy(camPos).add(sh);
    camera.fov = camFov * stage.punchStep(dt);
    camera.updateProjectionMatrix();
    camera.lookAt(tmpV.copy(camTarget).addScaledVector(sh, 0.5));
    const h = stage.renderer.domElement.height;
    fx.update(dt, t, h / (2 * Math.tan(THREE.MathUtils.degToRad(camFov / 2))), camera);
    stage.draw(dt);
  }

  /** Screen position (CSS px) of a world point. */
  function toScreen(x, y, z, w, h) {
    tmpV.set(x, y, z).project(camera);
    return { x: (tmpV.x * 0.5 + 0.5) * w, y: (-tmpV.y * 0.5 + 0.5) * h, behind: tmpV.z > 1 };
  }

  // Portraits: a head-and-shoulders picture of a look, from the real plush, on a small renderer of its own (so it is
  // tone-mapped like the game), one per frame, cached by look.
  const shots = new Map();
  const queue = [];
  let pr = null;
  function portraitKey(look) {
    const kind = bodyOf(look);
    const pl = plushLook(look, kind);
    return `${kind}|${pl.extra}|${look.hex}|${pl.symbol}|${pl.pattern}|${pl.hat}|${pl.fur}`;
  }
  /** A data URL of `look`'s portrait, or null while it's being drawn. */
  function portrait(look) {
    if (!look) return null;
    const key = portraitKey(look);
    const got = shots.get(key);
    if (got) return got;
    if (!queue.some((x) => x.key === key)) queue.push({ key, look });
    return null;
  }
  function shootOne() {
    if (!bodies || !queue.length) return;
    const { key, look } = queue.shift();
    try {
      if (!pr) {
        const c = document.createElement('canvas');
        c.width = c.height = 160;
        const r = new THREE.WebGLRenderer({ canvas: c, alpha: true, antialias: true, preserveDrawingBuffer: true });
        r.outputColorSpace = THREE.SRGBColorSpace;
        r.toneMapping = THREE.ACESFilmicToneMapping;
        r.toneMappingExposure = 1.1;
        r.setPixelRatio(1);
        r.setSize(160, 160, false);
        r.setClearColor(0x000000, 0);
        const sc = new THREE.Scene();
        sc.environment = scene.environment;
        sc.environmentIntensity = 0.35;
        const key1 = new THREE.DirectionalLight('#FFE2C0', 2.6);
        key1.position.set(2, 3, 4);
        const rim = new THREE.DirectionalLight('#9DB8FF', 2.2);
        rim.position.set(-3, 2.5, -3);
        sc.add(key1, rim, new THREE.HemisphereLight('#8090C0', '#402838', 1.1));
        const cam = new THREE.PerspectiveCamera(26, 1, 0.05, 20);
        pr = { r, sc, cam, c };
      }
      const kind = bodyOf(look);
      const mk = createMonkey({ data: bodies[kind].mesh, anchors: bodies[kind].anchors, body: kind, look: plushLook(look, kind), quality: 'high', shadows: false });
      pr.sc.add(mk.group);
      const eye = new THREE.Vector3(0.6, 1.1, 3);
      for (let i = 0; i < 12; i++) mk.update({ x: 0, y: 0, z: 0, yaw: 0, scale: 1, mode: 'stand', mouth: 'grin', lookAt: eye }, 1 / 30);
      const head = mk.headWorld(new THREE.Vector3());
      pr.cam.position.set(head.x + 0.42, head.y + 0.28, head.z + 2.3);
      pr.cam.lookAt(head.x, head.y - 0.08, head.z);
      pr.r.render(pr.sc, pr.cam);
      shots.set(key, pr.c.toDataURL('image/png'));
      mk.dispose();
    } catch (err) {
      console.warn('portrait', err);
      shots.set(key, '');
    }
  }

  return {
    stage, fx, u, setBed, setQuality, draw, frame, render, toScreen, rugSpot, ready, setDark, portrait,
    shootPortraits: shootOne,
    get room() {
      return room;
    },
    headOf(id) {
      const m = monkeys.get(id);
      if (!m) return null;
      m.mk.headWorld(tmpV);
      return { x: tmpV.x, y: tmpV.y, z: tmpV.z };
    },
    monkey: (id) => monkeys.get(id)?.mk ?? null,
  };
}
