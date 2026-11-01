import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { lowMaterial, lowify } from '../game/src/render/lowmat.js';

test('the low look: plain lit materials become one Lambert each, shader-owning ones stay, and it can be undone', () => {
  const wood = new THREE.MeshStandardMaterial({ color: '#8a5a3a', roughness: 0.6, transparent: true, opacity: 0.5, side: THREE.DoubleSide });
  const velvet = new THREE.MeshPhysicalMaterial({ color: '#c03030', sheen: 1, emissive: '#110000', emissiveIntensity: 2 });
  const quilt = new THREE.MeshStandardMaterial({ color: '#ffffff' });
  quilt.onBeforeCompile = () => {};
  const basic = new THREE.MeshBasicMaterial({ color: '#ffffff' });

  const lw = lowMaterial(wood);
  assert.ok(lw.isMeshLambertMaterial);
  assert.equal(lowMaterial(wood), lw, 'the same stand-in every time');
  assert.equal(lw.color.getHexString(), wood.color.getHexString());
  assert.equal(lw.opacity, 0.5);
  assert.equal(lw.transparent, true);
  assert.equal(lw.side, THREE.DoubleSide);
  const lv = lowMaterial(velvet);
  assert.ok(lv.isMeshLambertMaterial);
  assert.equal(lv.emissiveIntensity, 2);
  assert.equal(lowMaterial(quilt), quilt, 'a material with its own shader code stays');
  assert.equal(lowMaterial(basic), basic);
  assert.equal(lowMaterial(null), null);

  const g = new THREE.Group();
  const box = new THREE.BoxGeometry();
  const a = new THREE.Mesh(box, wood);
  const b = new THREE.Mesh(box, [velvet, quilt]);
  const c = new THREE.Mesh(box, basic);
  g.add(a, b, c);
  lowify(g);
  assert.equal(a.material, lw);
  assert.deepEqual(b.material, [lv, quilt]);
  assert.equal(c.material, basic);
  lowify(g);
  assert.equal(a.material, lw, 'twice is the same as once');
  lowify(g, false);
  assert.equal(a.material, wood);
  assert.deepEqual(b.material, [velvet, quilt]);
  assert.equal(c.material, basic);
});
