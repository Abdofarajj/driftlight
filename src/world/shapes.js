// Geometry helpers shared by every asset (part of the look recipe: smooth, rounded, displaced).
import { BufferAttribute, PlaneGeometry, CylinderGeometry, SphereGeometry, BoxGeometry } from 'three';
import { mergeVertices, mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { noise3 } from './rng.js';

/** Smooth the geometry and push vertices along their normal by noise. */
export function displace(geo, amp = 0.1, freq = 1, seed = 0) {
  geo.deleteAttribute('normal');
  geo.deleteAttribute('uv');
  geo = mergeVertices(geo, 1e-4);
  geo.computeVertexNormals();
  const p = geo.attributes.position, n = geo.attributes.normal;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const d = (noise3(x * freq + seed * 13.1, y * freq, z * freq) - 0.5) * 2 * amp;
    p.setXYZ(i, x + n.getX(i) * d, y + n.getY(i) * d, z + n.getZ(i) * d);
  }
  geo.computeVertexNormals();
  return geo;
}

/** Smooth normals without displacement. */
export function smooth(geo) {
  return displace(geo, 0);
}

/** Bend a geometry along X by `amount` (radians per unit height). For trunks. */
export function bend(geo, amount = 0.1, axis = 'x') {
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    if (axis === 'x') p.setX(i, p.getX(i) + Math.sin(y * amount) * y * 0.5);
    else p.setZ(i, p.getZ(i) + Math.sin(y * amount) * y * 0.5);
  }
  geo.computeVertexNormals();
  return geo;
}

export function setMix(geo, fn) {
  const p = geo.attributes.position;
  const a = new Float32Array(p.count);
  for (let i = 0; i < p.count; i++) a[i] = fn(p.getX(i), p.getY(i), p.getZ(i));
  geo.setAttribute('aMix', new BufferAttribute(a, 1));
  return geo;
}

/** A hanging banner (look round 4), top at y 0, facing +z: a cloth with a notched tail, and its gold parts (a rod, a
 *  diamond outline and a dot on the front). Shared by every banner. */
let BG = null;
export function bannerGeos() {
  if (BG) return BG;
  const cloth = new PlaneGeometry(0.9, 2.1, 2, 10).translate(0, -1.05, 0);
  const p = cloth.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i);
    const t = -y / 2.1;
    p.setY(i, y + (Math.abs(x) < 0.01 && t > 0.99 ? 0.38 : 0));
    p.setZ(i, 0.05 * Math.sin(t * 5.0) * t + 0.03 * x * t);
  }
  cloth.deleteAttribute('uv'); cloth.computeVertexNormals();
  const gold = [];
  const rod = new CylinderGeometry(0.035, 0.035, 1.1, 8).rotateZ(Math.PI / 2); gold.push(rod);
  for (const sx of [-1, 1]) gold.push(new SphereGeometry(0.06, 8, 6).translate(sx * 0.57, 0, 0));
  const cy = -0.95, hd = 0.3;
  for (const [ax, ay, bx, by] of [[0, hd, hd * 0.7, 0], [hd * 0.7, 0, 0, -hd], [0, -hd, -hd * 0.7, 0], [-hd * 0.7, 0, 0, hd]]) {
    const len = Math.hypot(bx - ax, by - ay);
    const bar = new BoxGeometry(0.05, len + 0.05, 0.02).rotateZ(Math.atan2(-(bx - ax), by - ay)).translate((ax + bx) / 2, cy + (ay + by) / 2, 0.075);
    gold.push(bar);
  }
  gold.push(new SphereGeometry(0.055, 8, 6).scale(1, 1, 0.4).translate(0, cy, 0.08));
  for (const y of [-0.35, -1.6]) gold.push(new BoxGeometry(0.72, 0.035, 0.02).translate(0, y, 0.065));
  BG = { cloth, gold: mergeGeometries(gold.map((q) => { q.deleteAttribute('uv'); return q.index ? q.toNonIndexed() : q; })) };
  return BG;
}
