// Particle sprites drawn in code, white so the particle colour tints them: a four-point glint, a heart, a lightning bolt,
// a Z, a soap bubble, a paper chip for confetti and a wisp of quilt lint.
import * as THREE from 'three';
import { canvas } from './textures.js';

function tex(c) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

/** A four-point sparkle with a soft core. */
export function glintTexture() {
  const c = canvas(64, 64);
  const g = c.getContext('2d');
  const rg = g.createRadialGradient(32, 32, 0, 32, 32, 30);
  rg.addColorStop(0, 'rgba(255,255,255,1)');
  rg.addColorStop(0.25, 'rgba(255,255,255,0.55)');
  rg.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = rg;
  g.fillRect(0, 0, 64, 64);
  g.fillStyle = '#fff';
  g.beginPath();
  g.moveTo(32, 2);
  g.quadraticCurveTo(35, 29, 62, 32);
  g.quadraticCurveTo(35, 35, 32, 62);
  g.quadraticCurveTo(29, 35, 2, 32);
  g.quadraticCurveTo(29, 29, 32, 2);
  g.fill();
  return tex(c);
}

export function heartTexture() {
  const c = canvas(64, 64);
  const g = c.getContext('2d');
  g.fillStyle = '#fff';
  g.beginPath();
  g.moveTo(32, 56);
  g.bezierCurveTo(4, 36, 4, 10, 20, 10);
  g.bezierCurveTo(28, 10, 32, 18, 32, 22);
  g.bezierCurveTo(32, 18, 36, 10, 44, 10);
  g.bezierCurveTo(60, 10, 60, 36, 32, 56);
  g.fill();
  g.fillStyle = 'rgba(255,255,255,0.0)';
  return tex(c);
}

export function boltTexture() {
  const c = canvas(64, 64);
  const g = c.getContext('2d');
  g.fillStyle = '#fff';
  g.beginPath();
  g.moveTo(38, 2);
  g.lineTo(12, 36);
  g.lineTo(30, 36);
  g.lineTo(22, 62);
  g.lineTo(52, 24);
  g.lineTo(34, 24);
  g.closePath();
  g.fill();
  return tex(c);
}

export function zTexture() {
  const c = canvas(64, 64);
  const g = c.getContext('2d');
  g.fillStyle = '#fff';
  g.beginPath();
  g.moveTo(12, 10);
  g.lineTo(54, 10);
  g.lineTo(54, 20);
  g.lineTo(27, 46);
  g.lineTo(54, 46);
  g.lineTo(54, 56);
  g.lineTo(10, 56);
  g.lineTo(10, 46);
  g.lineTo(37, 20);
  g.lineTo(12, 20);
  g.closePath();
  g.fill();
  return tex(c);
}

export function bubbleTexture() {
  const c = canvas(64, 64);
  const g = c.getContext('2d');
  const rg = g.createRadialGradient(32, 32, 18, 32, 32, 30);
  rg.addColorStop(0, 'rgba(255,255,255,0.08)');
  rg.addColorStop(0.8, 'rgba(255,255,255,0.55)');
  rg.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = rg;
  g.beginPath();
  g.arc(32, 32, 30, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = 'rgba(255,255,255,0.95)';
  g.beginPath();
  g.ellipse(22, 21, 7, 4, -0.7, 0, Math.PI * 2);
  g.fill();
  return tex(c);
}

export function chipTexture() {
  const c = canvas(32, 32);
  const g = c.getContext('2d');
  g.fillStyle = '#fff';
  g.fillRect(6, 11, 20, 10);
  return tex(c);
}

/** A wisp of cotton: a few overlapping soft blobs. */
export function lintTexture() {
  const c = canvas(64, 64);
  const g = c.getContext('2d');
  for (const [x, y, r] of [[24, 34, 14], [38, 28, 12], [34, 40, 10], [44, 38, 8]]) {
    const rg = g.createRadialGradient(x, y, 0, x, y, r);
    rg.addColorStop(0, 'rgba(255,255,255,0.95)');
    rg.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = rg;
    g.fillRect(0, 0, 64, 64);
  }
  return tex(c);
}
