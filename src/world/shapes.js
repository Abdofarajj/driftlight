// Geometry helpers shared by every asset (part of the look recipe: smooth, rounded, displaced).
import { BufferAttribute } from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
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
