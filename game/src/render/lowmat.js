// The low look's materials: a lit standard or physical material becomes a Lambert one with the same colour, picture,
// glow and blending. A handful of small shaders instead of a dozen big ones, for computers that draw in software and
// phones that are struggling. Materials with shaders of their own (the quilt, the plush) are left alone.
import * as THREE from 'three';

const cache = new WeakMap();

/** The Lambert stand-in for `m` (the same one each time), or `m` itself when it isn't a plain lit material. */
export function lowMaterial(m) {
  if (!m || !m.isMeshStandardMaterial || Object.hasOwn(m, 'onBeforeCompile')) return m;
  let l = cache.get(m);
  if (!l) {
    l = new THREE.MeshLambertMaterial({
      name: m.name,
      color: m.color.clone(),
      map: m.map,
      emissive: m.emissive.clone(),
      emissiveIntensity: m.emissiveIntensity,
      emissiveMap: m.emissiveMap,
      alphaMap: m.alphaMap,
      alphaTest: m.alphaTest,
      transparent: m.transparent,
      opacity: m.opacity,
      side: m.side,
      depthWrite: m.depthWrite,
      blending: m.blending,
      vertexColors: m.vertexColors,
      fog: m.fog,
    });
    // Metal reads as dark in diffuse light: lift it towards its colour.
    if (m.metalness > 0.5) l.color.multiplyScalar(1.15);
    cache.set(m, l);
  }
  return l;
}

/** Swaps every plain lit material under `root` for its Lambert stand-in (`low` false puts the originals back). */
export function lowify(root, low = true) {
  root.traverse((o) => {
    if (!o.isMesh || !o.material) return;
    if (!low) {
      if (o.userData.fullMaterial) o.material = o.userData.fullMaterial;
      return;
    }
    o.userData.fullMaterial ??= o.material;
    const m = o.userData.fullMaterial;
    o.material = Array.isArray(m) ? m.map(lowMaterial) : lowMaterial(m);
  });
}
