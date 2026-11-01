// Bake the plush bodies into game/src/assets/plush.bin (run after changing render/plush.js): `npm run bake`.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { BODIES, meshBody, anchorsFor } from '../game/src/render/plush.js';
import { writePack, packKey, PACK_CELL } from '../game/src/render/plushpack.js';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const source = readFileSync(here('../game/src/render/plush.js'), 'utf8');
const key = packKey(source, BODIES);
const bodies = {};
for (const [name, body] of Object.entries(BODIES)) {
  const t = performance.now();
  bodies[name] = { mesh: meshBody(body, PACK_CELL), anchors: anchorsFor(body) };
  console.log(`${name}: ${bodies[name].mesh.count} vertices, ${bodies[name].mesh.indices.length / 3} triangles, ${(performance.now() - t).toFixed(0)} ms`);
}
const buf = writePack(bodies, key);
writeFileSync(here('../game/src/assets/plush.bin'), new Uint8Array(buf));
console.log(`plush.bin: ${(buf.byteLength / 1024).toFixed(0)} KB, key ${key}`);
