// The baked plush bodies: one binary file with every body's mesh (positions, normals, skin and fabric weights), joints
// and anchors, written by `npm run bake` (tools/bake.mjs) so phones never mesh at load. Pure: no three.js, no fetch.

export const PACK_MAGIC = 0x31534c50; // 'PLS1'
export const PACK_CELL = 0.016;

/** A fingerprint of what the bodies are made from (the sculpting code and the cast), to tell when a bake is stale. */
export function packKey(source, bodies) {
  const text = `${source}\n${JSON.stringify(bodies)}\n${PACK_CELL}`;
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ c, 0x5bd1e995) >>> 0;
  }
  return h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0');
}

const align = (n) => (n + 3) & ~3;

/** Pack meshed bodies ({ name: { mesh, anchors } }) into one ArrayBuffer. */
export function writePack(bodies, key) {
  const header = { key, cell: PACK_CELL, bodies: {} };
  const blocks = [];
  let off = 0;
  const put = (arr) => {
    const at = off;
    blocks.push({ at, arr });
    off = align(off + arr.byteLength);
    return at;
  };
  for (const [name, { mesh, anchors }] of Object.entries(bodies)) {
    const n = mesh.count;
    // Positions as 16-bit over the body's box; normals, skin weights and fabric as bytes.
    const lo = [Infinity, Infinity, Infinity];
    const hi = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < n; i++) for (let c = 0; c < 3; c++) {
      lo[c] = Math.min(lo[c], mesh.positions[i * 3 + c]);
      hi[c] = Math.max(hi[c], mesh.positions[i * 3 + c]);
    }
    const pos = new Uint16Array(n * 3);
    for (let i = 0; i < n * 3; i++) {
      const c = i % 3;
      pos[i] = Math.round(((mesh.positions[i] - lo[c]) / (hi[c] - lo[c] || 1)) * 65535);
    }
    const nrm = new Int8Array(n * 3);
    for (let i = 0; i < n * 3; i++) nrm[i] = Math.max(-127, Math.min(127, Math.round(mesh.normals[i] * 127)));
    const si = new Uint8Array(n * 4);
    const sw = new Uint8Array(n * 4);
    const fab = new Uint8Array(n * 4);
    for (let v = 0; v < n; v++) {
      let sum = 0;
      let big = 0;
      for (let c = 0; c < 4; c++) {
        si[v * 4 + c] = mesh.skinIndex[v * 4 + c];
        sw[v * 4 + c] = Math.round(mesh.skinWeight[v * 4 + c] * 255);
        sum += sw[v * 4 + c];
        if (sw[v * 4 + c] > sw[v * 4 + big]) big = c;
        fab[v * 4 + c] = Math.round(mesh.fabric[v * 4 + c] * 255);
      }
      sw[v * 4 + big] += 255 - sum;
    }
    const idx = mesh.indices instanceof Uint16Array ? mesh.indices : Uint32Array.from(mesh.indices);
    header.bodies[name] = {
      count: n, joints: mesh.joints, anchors, lo, hi, wide: !(idx instanceof Uint16Array), nidx: idx.length,
      pos: put(pos), nrm: put(nrm), si: put(si), sw: put(sw), fab: put(fab), idx: put(idx),
    };
  }
  const json = new TextEncoder().encode(JSON.stringify(header));
  const start = align(8 + json.length);
  const buf = new ArrayBuffer(start + off);
  const dv = new DataView(buf);
  dv.setUint32(0, PACK_MAGIC, true);
  dv.setUint32(4, json.length, true);
  new Uint8Array(buf, 8, json.length).set(json);
  for (const { at, arr } of blocks) new Uint8Array(buf, start + at, arr.byteLength).set(new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength));
  return buf;
}

/** Read a pack: { key, bodies: { name: { mesh: { positions (Float32), normals (Int8, normalized), skinIndex (Uint8),
 * skinWeight (Uint8, normalized), fabric (Uint8, normalized), indices, joints, count }, anchors } } }. */
export function readPack(buf) {
  const dv = new DataView(buf);
  if (dv.getUint32(0, true) !== PACK_MAGIC) throw new Error('not a plush pack');
  const len = dv.getUint32(4, true);
  const header = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 8, len)));
  const start = align(8 + len);
  const out = { key: header.key, cell: header.cell, bodies: {} };
  for (const [name, b] of Object.entries(header.bodies)) {
    const n = b.count;
    const q = new Uint16Array(buf, start + b.pos, n * 3);
    const positions = new Float32Array(n * 3);
    for (let i = 0; i < n * 3; i++) {
      const c = i % 3;
      positions[i] = b.lo[c] + (q[i] / 65535) * (b.hi[c] - b.lo[c]);
    }
    out.bodies[name] = {
      mesh: {
        positions,
        normals: new Int8Array(buf, start + b.nrm, n * 3),
        skinIndex: new Uint8Array(buf, start + b.si, n * 4),
        skinWeight: new Uint8Array(buf, start + b.sw, n * 4),
        fabric: new Uint8Array(buf, start + b.fab, n * 4),
        indices: b.wide ? new Uint32Array(buf, start + b.idx, b.nidx) : new Uint16Array(buf, start + b.idx, b.nidx),
        joints: b.joints,
        count: n,
      },
      anchors: b.anchors,
    };
  }
  return out;
}
