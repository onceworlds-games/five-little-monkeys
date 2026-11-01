import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BODIES, BONES, meshBody } from '../game/src/render/plush.js';
import { readPack, packKey } from '../game/src/render/plushpack.js';

const file = (p) => new URL(p, import.meta.url);
const raw = readFileSync(file('../game/src/assets/plush.bin'));
const pack = readPack(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength));

test('the baked bodies match the sculpting code (run npm run bake after changing plush.js)', () => {
  assert.equal(pack.key, packKey(readFileSync(file('../game/src/render/plush.js'), 'utf8'), BODIES));
  assert.deepEqual(Object.keys(pack.bodies).sort(), Object.keys(BODIES).sort());
});

test('every baked body is a whole, weighted, rigged mesh with its anchors', () => {
  for (const [name, { mesh, anchors }] of Object.entries(pack.bodies)) {
    assert.ok(mesh.count > 5000 && mesh.count < 20000, name);
    for (const i of mesh.indices) assert.ok(i < mesh.count);
    for (let v = 0; v < mesh.count; v++) {
      let w = 0;
      for (let c = 0; c < 4; c++) {
        w += mesh.skinWeight[v * 4 + c];
        assert.ok(mesh.skinIndex[v * 4 + c] < BONES.length);
      }
      assert.equal(w, 255);
    }
    for (const [bone] of BONES) assert.ok(mesh.joints[bone], `${name} ${bone}`);
    for (const a of ['eyeL', 'eyeR', 'mouth', 'nose', 'browL', 'browR', 'crown', 'bump', 'handL', 'handR']) assert.ok(anchors[a], `${name} ${a}`);
    if (!BODIES[name].bear) for (const a of ['pocket', 'button1', 'button2', 'button3']) assert.ok(anchors[a], `${name} ${a}`);
    // Closed: every edge is shared by two triangles (all but a couple).
    const edges = new Map();
    for (let t = 0; t < mesh.indices.length; t += 3) for (let e = 0; e < 3; e++) {
      const a = mesh.indices[t + e];
      const b = mesh.indices[t + ((e + 1) % 3)];
      const k = a < b ? a * 65536 + b : b * 65536 + a;
      edges.set(k, (edges.get(k) ?? 0) + 1);
    }
    let open = 0;
    for (const c of edges.values()) if (c !== 2) open++;
    assert.ok(open <= 8, `${name}: ${open} open edges`);
  }
});

test('meshing is the same every time', () => {
  const a = meshBody(BODIES.tiptoe, 0.04);
  const b = meshBody(BODIES.tiptoe, 0.04);
  assert.equal(a.count, b.count);
  assert.deepEqual(Array.from(a.positions.slice(0, 30)), Array.from(b.positions.slice(0, 30)));
});
