// Draws a world: the room and quilt for its bed, a monkey for every body (posed from its physics), blob shadows, the
// player's ring, pillows and fluff, and a camera that keeps the bed framed. Shared by the game and the posters.
import * as THREE from 'three';
import { createStage } from './render/scene.js';
import { buildRoom } from './render/room.js';
import { ringUniforms, writeRings } from './render/quilt.js';
import { createMonkey } from './render/monkey.js';
import { createFx } from './render/fx.js';
import { fieldAt } from './sim/waves.js';
import { surfaceUnder } from './sim/beds.js';
import { CONTACT, SLAM, PILLOW } from './sim/config.js';

const tmpV = new THREE.Vector3();
// Monkeys are drawn bigger than their physics body, so they read on a phone (the physics is unchanged).
const SCALE = 1.4;

export function createView(canvasEl, { quality = 'high', poster = false, pixelRatio = 1 } = {}) {
  const stage = createStage(canvasEl, { quality, poster, pixelRatio });
  const { scene, camera } = stage;
  const u = ringUniforms();
  const fx = createFx(scene);
  let room = null;
  let bedId = '';
  let q = quality;
  const monkeys = new Map();
  let base = 0;
  const camPos = new THREE.Vector3(0, 10, 14);
  const camTarget = new THREE.Vector3();
  let camFov = 40;
  let camInit = false;

  function setBed(bed) {
    if (bed.id === bedId && room) return;
    bedId = bed.id;
    if (room) {
      scene.remove(room.group);
      room.group.traverse((o) => {
        o.geometry?.dispose();
        if (o.material) {
          o.material.map?.dispose();
          o.material.bumpMap?.dispose();
          o.material.dispose();
        }
      });
    }
    room = buildRoom(bed, u, q);
    scene.add(room.group);
    stage.setQuality(q, bed.box);
    stage.moon.target.position.set(0, 0, (bed.box.z0 + bed.box.z1) / 2);
    fx.clear();
  }

  function setQuality(next, bed) {
    if (next === q) return;
    q = next;
    stage.renderer.shadowMap.enabled = next !== 'low';
    if (bed) {
      bedId = '';
      setBed(bed);
    } else stage.setQuality(q);
  }

  /** look: { hex, dark, symbol, pattern, extra } */
  function monkeyFor(id, look) {
    const key = `${look.hex}|${look.extra}`;
    let m = monkeys.get(id);
    if (m && m.key !== key) {
      m.mk.dispose();
      monkeys.delete(id);
      m = null;
    }
    if (!m) {
      const mk = createMonkey({ ...look, shadows: q !== 'low' });
      scene.add(mk.group);
      m = { mk, key, yaw: 0, seen: 0, spinAxis: 'x', spin: 0, launchedAt: -1, rugK: 0, pattern: look.pattern };
      monkeys.set(id, m);
    }
    if (m.pattern !== look.pattern) {
      m.pattern = look.pattern;
      m.mk.setPattern(look.pattern);
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

  /**
   * Draw `world` at time `t` (seconds, for animation). opts: {
   *   looks: Map id → look, me: id | null, frozen: bool, guilty: bool, extras: [{ id, look, spot }], winner: id,
   *   lastLaunch: Map id → { by hex }, colorOf(id) → hex, dt
   * }
   */
  function draw(world, opts) {
    const bed = world.bed;
    setBed(bed);
    const keep = new Set();
    const blobs = [];
    const dents = [];
    const tw = world.t;
    for (const e of world.entries.values()) {
      const look = opts.looks.get(e.id);
      if (!look) continue;
      keep.add(e.id);
      const m = monkeyFor(e.id, look);
      const b = e.body;
      const p = { x: b.x + e.err.x, y: b.y + e.err.y, z: b.z + e.err.z, t: opts.anim + e.index * 1.7, vy: b.vy, squash: 0, tuck: 0, spin: 0, sit: 0, mouth: 'grin', brow: 0, arms: 'down', yaw: 0, scale: SCALE };
      e.drawn = true;
      // Facing: toward the camera, turning with the steer.
      const targetYaw = Math.atan2(b.vx, 3 + Math.max(-2.5, b.vz)) * 0.9;
      m.yaw += (targetYaw - m.yaw) * Math.min(1, opts.dt * 8);
      p.yaw = m.yaw;
      const out = b.out || b.mode === 'falling' && b.y <= bed.floor + 0.01;
      if (out) {
        const since = b.out ? tw - b.outAt : 0;
        const spot = rugSpot(bed, e.index);
        const k = b.out ? Math.min(1, Math.max(0, (since - 1.1) / 0.5)) : 0;
        const fxp = { x: b.out ? b.x : p.x, z: b.out ? b.z : p.z };
        p.x = fxp.x + (spot.x - fxp.x) * k;
        p.z = fxp.z + (spot.z - fxp.z) * k;
        p.y = bed.floor + Math.sin(k * Math.PI) * 1.2;
        p.sit = 1;
        p.yaw = k > 0.99 ? Math.atan2(-spot.x * 0.2, 1) : m.yaw;
        p.mouth = since < 2.5 ? 'worried' : look.extra === 'mask' ? 'sleepy' : 'grin';
        p.brow = 0.8;
        p.vy = 0;
        p.arms = since > 2.5 && b.nextPillow - tw < 0.6 && b.nextPillow > tw - 0.2 ? 'up' : 'down';
        m.mk.setBandage(true);
        if (since < 2.4 && Math.floor(opts.anim * 6) !== Math.floor((opts.anim - opts.dt) * 6)) fx.stars(p.x, p.y + 1.1, p.z, 1, { speed: 0.4, up: 0.6, size: 0.3, life: 0.6 });
      } else {
        m.mk.setBandage(false);
        const s = bed.surfaces[b.si];
        if (b.mode === 'contact' && s) {
          const prog = 1 - Math.max(0, b.tc) / CONTACT;
          p.squash = Math.sin(prog * Math.PI) * (b.low ? 1.1 : 0.85);
          const fld = fieldAt(world.waves, b.si, b.x, b.z, tw);
          p.y = Math.max(p.y, s.top + fld) - 0.12 * p.squash;
          dents.push({ x: b.x, z: b.z, depth: 0.16 * p.squash, r: 0.6 });
        }
        if (b.mode === 'dive') {
          p.tuck = 1;
          p.mouth = 'gritted';
          p.brow = -1;
        } else if (b.mode === 'launched') {
          if (m.launchedAt !== b.lastAt) {
            m.launchedAt = b.lastAt;
            m.spin = 0;
            m.spinAxis = Math.abs(b.vx) > Math.abs(b.vz) ? 'z' : 'x';
            m.spinDir = (m.spinAxis === 'z' ? -Math.sign(b.vx) : Math.sign(b.vz)) || 1;
          }
          m.spin += opts.dt * (b.tumble > 0 ? 13 : 7) * m.spinDir;
          p.spin = m.spin;
          p.spinAxis = m.spinAxis;
          p.mouth = 'o';
          p.brow = 1;
          if (opts.trail && opts.lastLaunch?.get(e.id)) fx.trail(p.x, p.y + 0.45, p.z, opts.lastLaunch.get(e.id));
        } else if (b.mode === 'falling') {
          p.mouth = 'o';
          p.brow = 1;
          p.arms = 'up';
        } else {
          m.spin = 0;
          if (b.teeter > 0) {
            p.windmill = 1;
            p.mouth = 'worried';
            p.brow = 0.7;
          } else if (b.mode === 'air') {
            p.arms = b.vy > 2 ? 'up' : 'down';
            p.mouth = look.extra === 'mask' && opts.sleepy?.(e.id) ? 'sleepy' : 'grin';
          }
        }
        if (opts.guilty) {
          p.mouth = 'guilty';
          p.brow = 0.6;
          p.spin = 0;
          p.windmill = 0;
          if (e.id === opts.winner) p.arms = 'up';
        }
        if (opts.cheer === e.id) {
          p.arms = 'cheer';
          p.mouth = 'grin';
        }
        // Shadow.
        const under = surfaceUnder(bed, b.x, b.z, b.y + 0.01);
        if (under >= 0) {
          const su = bed.surfaces[under];
          blobs.push({ x: p.x, z: p.z, y: su.top + fieldAt(world.waves, under, b.x, b.z, tw), h: Math.max(0, b.y - su.top) });
        } else blobs.push({ x: p.x, z: p.z, y: bed.floor, h: Math.max(0, b.y - bed.floor) * 0.6 + 1.5 });
      }
      m.mk.setCap(opts.cap === e.id);
      m.mk.pose(p);
    }
    for (const x of opts.extras ?? []) {
      keep.add(x.id);
      const m = monkeyFor(x.id, x.look);
      m.mk.setBandage(false);
      m.mk.setCap(false);
      m.mk.pose({ x: x.spot.x, y: x.spot.y, z: x.spot.z, yaw: x.spot.yaw ?? 0, sit: 1, scale: SCALE, t: opts.anim + x.spot.x, mouth: 'grin', arms: x.wave ? 'cheer' : 'down', brow: 0 });
    }
    dropMissing(keep);
    fx.blobs(blobs);
    // The player's ring and aim.
    const me = opts.me ? world.entries.get(opts.me) : null;
    if (me && opts.looks.get(opts.me)) {
      const b = me.body;
      const hex = opts.looks.get(opts.me).hex;
      if (!b.out) {
        const under = surfaceUnder(bed, b.x, b.z, b.y + 0.01);
        const su = bed.surfaces[under];
        const fill = tw >= b.cool ? 1 : 1 - (b.cool - tw) / SLAM.cooldown;
        fx.you(b.x, su ? su.top + fieldAt(world.waves, under, b.x, b.z, tw) : bed.floor, b.z, hex, fill, !!su && !opts.hideRing);
        fx.aim(0, 0, 0, hex, 0, false);
      } else {
        fx.you(0, 0, 0, hex, 0, false);
        const [si] = [surfaceUnder(bed, b.aimX, b.aimZ, 99)];
        const su = bed.surfaces[si] ?? bed.surfaces[0];
        const fill = tw >= b.nextPillow ? 1 : 1 - (b.nextPillow - tw) / PILLOW.every;
        fx.aim(b.aimX, su.top + fieldAt(world.waves, su.i, b.aimX, b.aimZ, tw), b.aimZ, hex, Math.max(0, fill), !opts.hideRing);
      }
    } else {
      fx.you(0, 0, 0, '#ffffff', 0, false);
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
    const key = `${box.x0},${box.x1},${box.y0},${box.y1},${box.z0},${box.z1},${w},${h},${margins.top},${margins.bottom},${margins.left},${margins.right},${opts.pitch ?? ''}`;
    if (key !== fitKey) {
      fitKey = key;
      fitCache = stage.fit(box, w, h, margins, opts);
    }
    const f = fitCache;
    const k = snap || !camInit ? 1 : 1 - Math.exp(-dt * 2.6);
    camInit = true;
    camPos.lerp(f.pos, k);
    camTarget.lerp(f.target, k);
    camFov += (f.fov - camFov) * k;
  }

  function render(dt, t, reduced) {
    const sh = stage.shakeOffset(dt, t, reduced);
    camera.position.copy(camPos).add(sh);
    camera.fov = camFov;
    camera.updateProjectionMatrix();
    camera.lookAt(tmpV.copy(camTarget).addScaledVector(sh, 0.5));
    const h = stage.renderer.domElement.height;
    fx.update(dt, t, (h / (2 * Math.tan(THREE.MathUtils.degToRad(camFov / 2)))));
    stage.renderer.render(scene, camera);
  }

  /** Screen position (CSS px) of a world point. */
  function toScreen(x, y, z, w, h) {
    tmpV.set(x, y, z).project(camera);
    return { x: (tmpV.x * 0.5 + 0.5) * w, y: (-tmpV.y * 0.5 + 0.5) * h, behind: tmpV.z > 1 };
  }

  return {
    stage, fx, u, setBed, setQuality, draw, frame, render, toScreen, rugSpot,
    get room() {
      return room;
    },
    headOf(id) {
      const m = monkeys.get(id);
      if (!m) return null;
      m.mk.head.getWorldPosition(tmpV);
      return { x: tmpV.x, y: tmpV.y, z: tmpV.z };
    },
  };
}
