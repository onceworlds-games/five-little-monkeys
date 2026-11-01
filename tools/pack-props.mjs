// Pack downloaded CC0 glTF models (Poly Haven's 1k glTF folders) into small GLBs for the game, with their textures
// shrunk: `node tools/pack-props.mjs <folder with one subfolder per model> <id>:<texture px> ...`
// Writes game/src/assets/props/<id>.glb. Uses macOS `sips` to resize textures. See CREDITS.md for the sources.
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const [src, ...items] = process.argv.slice(2);
const outDir = fileURLToPath(new URL('../game/src/assets/props/', import.meta.url));
const tmp = mkdtempSync(join(tmpdir(), 'props-'));
const pad4 = (n) => (n + 3) & ~3;

for (const item of items) {
  const [id, px = '512'] = item.split(':');
  const dir = join(src, id);
  const gltf = JSON.parse(readFileSync(join(dir, `${id}.gltf`), 'utf8'));
  const parts = [];
  let size = 0;
  const push = (buf) => {
    const at = size;
    parts.push(buf);
    size += buf.length;
    const pad = pad4(size) - size;
    if (pad) {
      parts.push(Buffer.alloc(pad));
      size += pad;
    }
    return at;
  };
  // Every buffer, one after another; bufferViews shift by where each landed.
  const starts = gltf.buffers.map((b) => push(readFileSync(join(dir, decodeURIComponent(b.uri)))));
  for (const bv of gltf.bufferViews) {
    bv.byteOffset = (bv.byteOffset ?? 0) + starts[bv.buffer];
    bv.buffer = 0;
  }
  for (const [i, img] of (gltf.images ?? []).entries()) {
    const file = join(dir, decodeURIComponent(img.uri));
    const png = /\.png$/i.test(img.uri);
    const out = join(tmp, `${id}-${i}.${png ? 'png' : 'jpg'}`);
    const args = png ? ['-Z', px, file, '--out', out] : ['-s', 'format', 'jpeg', '-s', 'formatOptions', '80', '-Z', px, file, '--out', out];
    execFileSync('sips', args, { stdio: 'ignore' });
    const data = readFileSync(out);
    const at = push(data);
    gltf.bufferViews.push({ buffer: 0, byteOffset: at, byteLength: data.length });
    delete img.uri;
    img.bufferView = gltf.bufferViews.length - 1;
    img.mimeType = png ? 'image/png' : 'image/jpeg';
  }
  gltf.buffers = [{ byteLength: size }];
  const bin = Buffer.concat(parts, size);
  let json = Buffer.from(JSON.stringify(gltf));
  json = Buffer.concat([json, Buffer.alloc(pad4(json.length) - json.length, 0x20)]);
  const total = 12 + 8 + json.length + 8 + bin.length;
  const head = Buffer.alloc(12);
  head.writeUInt32LE(0x46546c67, 0);
  head.writeUInt32LE(2, 4);
  head.writeUInt32LE(total, 8);
  const jh = Buffer.alloc(8);
  jh.writeUInt32LE(json.length, 0);
  jh.writeUInt32LE(0x4e4f534a, 4);
  const bh = Buffer.alloc(8);
  bh.writeUInt32LE(bin.length, 0);
  bh.writeUInt32LE(0x004e4942, 4);
  writeFileSync(join(outDir, `${id}.glb`), Buffer.concat([head, jh, json, bh, bin]));
  console.log(`${id}.glb ${(total / 1024).toFixed(0)} KB`);
}
