// The room's bought-in pieces: CC0 models (Poly Haven, packed small by tools/pack-props.mjs) and CC0 texture maps, each
// fetched once and shared. See CREDITS.md.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const MODEL_URLS = import.meta.glob('../assets/props/*.glb', { eager: true, query: '?url', import: 'default' });
const TEX_URLS = import.meta.glob('../assets/tex/*.jpg', { eager: true, query: '?url', import: 'default' });
const base = (p) => p.split('/').pop().replace(/\.[^.]+$/, '');
const modelUrl = Object.fromEntries(Object.entries(MODEL_URLS).map(([k, v]) => [base(k), v]));
const texUrl = Object.fromEntries(Object.entries(TEX_URLS).map(([k, v]) => [base(k), v]));

let modelsP = null;
/** Every prop model: Map id → its scene (a template: clone it). */
export function loadProps() {
  if (modelsP) return modelsP;
  const loader = new GLTFLoader();
  modelsP = Promise.all(
    Object.entries(modelUrl).map(([id, url]) =>
      loader.loadAsync(url).then(
        (g) => {
          g.scene.traverse((o) => {
            if (o.isMesh) {
              o.castShadow = true;
              o.receiveShadow = true;
              const m = o.material;
              if (m) {
                m.envMapIntensity = 0.6;
                for (const k of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap']) if (m[k]) m[k].anisotropy = 4;
              }
            }
          });
          return [id, g.scene];
        },
        (err) => {
          console.warn('prop', id, err);
          return [id, null];
        },
      ),
    ),
  ).then((list) => new Map(list.filter(([, s]) => s)));
  return modelsP;
}

const texCache = new Map();
const loader = new THREE.TextureLoader();
/** A texture map by name (game/src/assets/tex/<name>.jpg), shared; `srgb` for colour maps. */
export function texture(name, { srgb = false, repeat = 1 } = {}) {
  const key = `${name}|${srgb}|${repeat}`;
  if (texCache.has(key)) return texCache.get(key);
  const url = texUrl[name];
  const t = url ? loader.load(url, undefined, undefined, (err) => {
    console.warn('texture', name, err);
    t.userData.failed = true;
  }) : new THREE.Texture();
  if (!url) t.userData.failed = true;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (typeof repeat === 'number') t.repeat.set(repeat, repeat);
  else t.repeat.set(repeat[0], repeat[1]);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  texCache.set(key, t);
  return t;
}

/** Resolves when every texture asked for so far has loaded (or failed to). */
export function texturesReady() {
  return Promise.all(
    [...texCache.values()].map((t) => new Promise((r) => {
      const check = () => (t.image || t.userData.failed ? r() : setTimeout(check, 30));
      check();
    })),
  );
}

/**
 * A copy of prop `id` scaled from metres to the room's units (1 u = 25 cm), standing on y = 0 and centred on x/z, then
 * placed at (x, y, z) turned `yaw`. Returns the group (or null if the prop is missing).
 */
export function placeProp(models, id, { x = 0, y = 0, z = 0, yaw = 0, scale = 4, tilt = 0, roll = 0 } = {}) {
  const src = models.get(id);
  if (!src) return null;
  const inner = src.clone(true);
  const box = new THREE.Box3().setFromObject(inner);
  const c = box.getCenter(new THREE.Vector3());
  inner.position.set(-c.x, -box.min.y, -c.z);
  const g = new THREE.Group();
  g.add(inner);
  g.scale.setScalar(scale);
  g.position.set(x, y, z);
  g.rotation.set(tilt, yaw, roll, 'YXZ');
  g.userData.size = box.getSize(new THREE.Vector3()).multiplyScalar(scale);
  return g;
}
