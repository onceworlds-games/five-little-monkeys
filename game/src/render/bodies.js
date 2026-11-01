// The baked plush bodies, fetched once (game/src/assets/plush.bin, from `npm run bake`).
import packUrl from '../assets/plush.bin?url';
import { readPack } from './plushpack.js';

let pending = null;
/** Every body: { name: { mesh, anchors } }. */
export function loadBodies() {
  pending ??= fetch(packUrl)
    .then((r) => {
      if (!r.ok) throw new Error(`plush.bin ${r.status}`);
      return r.arrayBuffer();
    })
    .then((buf) => readPack(buf).bodies);
  return pending;
}
