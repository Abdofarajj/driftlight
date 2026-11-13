// Little models for the secrets (round 4), built from primitives through the shared look recipe:
// Roro Jr (Abdo's pink teddy, from docs/refs/roro-jr.jpg), sunflowers, and fairy-ring mushrooms.
import { Group, Mesh, SphereGeometry, CapsuleGeometry, CylinderGeometry, BoxGeometry, TorusGeometry } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { makeWatercolorMaterial, makeGlowMaterial } from '../look/material.js';
import { PAL } from '../look/palette.js';
import { displace } from './shapes.js';
import { rng } from './rng.js';

let M = null;
function mats() {
  if (M) return M;
  M = {
    // Roro sits in a lit grotto right next to the crystals: take less of their light so his pink stays pink
    fur: makeWatercolorMaterial({ lit: PAL.roro, rim: 0.28, wash: 0.2, lightRecv: 0.35 }),
    muzzle: makeWatercolorMaterial({ lit: PAL.roroMuzzle, rim: 0.2, lightRecv: 0.35 }),
    dark: makeWatercolorMaterial({ lit: PAL.eye, rim: 0.2 }),
    bow: makeWatercolorMaterial({ lit: PAL.bow, rim: 0.3, lightRecv: 0.5 }),
    dot: makeWatercolorMaterial({ lit: PAL.bowDot, rim: 0.2 }),
    petal: makeWatercolorMaterial({ lit: PAL.petal, rim: 0.5, wash: 0.15 }),
    seed: makeWatercolorMaterial({ lit: PAL.seedHead, rim: 0.2 }),
    leaf: makeWatercolorMaterial({ lit: PAL.leaf, rim: 0.3, sway: 0.02 }),
    stem: makeWatercolorMaterial({ lit: PAL.spot, rim: 0.3 }),
    fairyCap: makeWatercolorMaterial({ lit: PAL.fairyCap, rim: 0.45 }),
  };
  return M;
}

const fluffy = (r, seed, sx = 1, sy = 1, sz = 1) => {
  const g = displace(new SphereGeometry(r, 22, 16), r * 0.07, 7, seed);
  g.scale(sx, sy, sz);
  return g;
};
const at = (mesh, x, y, z) => { mesh.position.set(x, y, z); return mesh; };

/**
 * Roro Jr, sitting. Peachy-pink fluffy fur, lighter muzzle and paw pads, dark round nose and eyes,
 * a little stitched smile, and his big burgundy bow with cream polka dots and a cream knot.
 * Returns the group; group.userData.wave(t, k) lifts his right paw (k 0..1).
 */
export function makeRoroJr() {
  const m = mats();
  const g = new Group();
  g.add(at(new Mesh(fluffy(0.3, 1, 1.0, 1.1, 0.9), m.fur), 0, 0.33, 0));                 // body
  const head = new Group(); head.position.set(0, 0.78, 0.02); g.add(head);
  head.add(new Mesh(fluffy(0.27, 2, 1.08, 0.98, 0.95), m.fur));
  for (const s of [-1, 1]) {
    head.add(at(new Mesh(fluffy(0.1, 3 + s, 1, 1, 0.6), m.fur), s * 0.21, 0.2, -0.01));     // ears
    head.add(at(new Mesh(new SphereGeometry(0.058, 12, 8).scale(1, 1, 0.4), m.muzzle), s * 0.21, 0.2, 0.035));
    head.add(at(new Mesh(new SphereGeometry(0.027, 10, 8), m.dark), s * 0.1, 0.05, 0.215)); // eyes
  }
  head.add(at(new Mesh(new SphereGeometry(0.11, 16, 12).scale(1.15, 0.85, 0.8), m.muzzle), 0, -0.06, 0.2));
  head.add(at(new Mesh(new SphereGeometry(0.042, 12, 10).scale(1.3, 0.9, 0.9), m.dark), 0, -0.03, 0.29)); // nose
  for (const s of [-1, 1]) { // stitched smile: two little arcs, like an ω
    const arc = new Mesh(new TorusGeometry(0.024, 0.006, 4, 10, Math.PI), m.dark);
    arc.position.set(s * 0.024, -0.095, 0.283); arc.rotation.z = Math.PI;
    head.add(arc);
  }
  // arms: the right one can wave
  const armGeo = new CapsuleGeometry(0.075, 0.17, 4, 10);
  const left = new Mesh(armGeo, m.fur); left.position.set(-0.29, 0.36, 0.07); left.rotation.set(-0.35, 0, -0.45); g.add(left);
  const shoulder = new Group(); shoulder.position.set(0.24, 0.5, 0.03); g.add(shoulder);
  const right = new Mesh(armGeo, m.fur); right.position.set(0.05, -0.13, 0.04); right.rotation.set(-0.35, 0, 0.45); shoulder.add(right);
  // legs stretched forward, with pale foot pads
  for (const s of [-1, 1]) {
    const leg = new Mesh(new CapsuleGeometry(0.09, 0.15, 4, 10), m.fur); leg.position.set(s * 0.14, 0.1, 0.18); leg.rotation.x = Math.PI / 2 - 0.15; g.add(leg);
    g.add(at(new Mesh(new SphereGeometry(0.068, 12, 8).scale(1, 1, 0.35), m.muzzle), s * 0.14, 0.12, 0.33));
  }
  // the bow
  const bow = new Group(); bow.position.set(0, 0.56, 0.24); g.add(bow);
  const r = rng(7);
  for (const s of [-1, 1]) {
    const loop = new Mesh(new SphereGeometry(0.1, 16, 10).scale(1.6, 1.0, 0.42), m.bow); loop.position.set(s * 0.14, 0.03, 0); loop.rotation.z = s * 0.3; bow.add(loop);
    const trim = new Mesh(new SphereGeometry(0.1, 16, 10).scale(1.72, 1.12, 0.36), m.dot); trim.position.set(s * 0.14, 0.03, -0.012); trim.rotation.z = s * 0.3; bow.add(trim); // cream edging
    const tail = new Mesh(new BoxGeometry(0.075, 0.25, 0.02), m.bow); tail.position.set(s * 0.06, -0.14, 0.015); tail.rotation.z = s * 0.3; bow.add(tail);
    for (let i = 0; i < 6; i++) { // cream polka dots on the front of each loop
      const dot = new Mesh(new SphereGeometry(0.011, 6, 4), m.dot);
      dot.position.set(s * (0.06 + r() * 0.14), -0.05 + r() * 0.13, 0.046); bow.add(dot);
    }
  }
  bow.add(at(new Mesh(new SphereGeometry(0.045, 12, 10).scale(1, 1.2, 0.8), m.dot), 0, 0.01, 0.03)); // cream knot
  g.userData.wave = (t, k) => {
    shoulder.rotation.z = k * (2.3 + Math.sin(t * 9) * 0.35);
    head.rotation.z = Math.sin(t * 1.3) * 0.06 + k * 0.12;
    g.scale.y = 1 + Math.sin(t * 2) * 0.012; // breathing
  };
  return g;
}

/** A sunflower about h tall. Returns { group, head }; aim `head` (its +z is the flower's face). */
export function makeSunflower(h, seed) {
  const m = mats();
  const r = rng(seed);
  const group = new Group();
  const stem = new Mesh(displace(new CylinderGeometry(0.03, 0.045, h, 6, 4).translate(0, h / 2, 0), 0.012, 2, seed), m.leaf);
  group.add(stem);
  for (const [y, s] of [[0.38, 1], [0.6, -1]]) {
    const leaf = new Mesh(new SphereGeometry(0.15, 10, 6).scale(1, 0.14, 0.55), m.leaf);
    leaf.position.set(s * 0.12, h * y, 0); leaf.rotation.set(0, r() * 3, s * 0.4);
    group.add(leaf);
  }
  const head = new Group(); head.position.y = h; group.add(head);
  const face = new Group(); face.rotation.x = 0.28; head.add(face); // nodding a little
  face.add(new Mesh(displace(new CylinderGeometry(0.12, 0.12, 0.07, 18, 1).rotateX(Math.PI / 2), 0.012, 9, seed), m.seed));
  const petals = [];
  for (let ring = 0; ring < 2; ring++) {
    for (let i = 0; i < 12; i++) {
      const a = (i + ring * 0.5) / 12 * Math.PI * 2;
      const p = new SphereGeometry(0.055, 6, 4).scale(0.62, 1.9, 0.25);
      p.rotateZ(a - Math.PI / 2); p.rotateX(ring ? -0.18 : -0.05);
      p.translate(Math.cos(a) * (0.2 - ring * 0.015), Math.sin(a) * (0.2 - ring * 0.015), -0.01 - ring * 0.02);
      petals.push(p);
    }
  }
  face.add(new Mesh(mergeGeometries(petals), m.petal));
  return { group, head };
}

/** Fairy-ring mushroom: pale lilac cap that can switch to a glowing one. Returns { group, light(k) }. */
export function makeFairyMushroom(s, seed) {
  const m = mats();
  const group = new Group();
  group.add(at(new Mesh(displace(new CylinderGeometry(0.09, 0.13, 0.36, 8, 2), 0.01, 3, seed), m.stem), 0, 0.18, 0));
  const capGeo = displace(new SphereGeometry(0.27, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), 0.018, 3, seed);
  const cap = at(new Mesh(capGeo, m.fairyCap), 0, 0.3, 0); cap.scale.y = 0.7;
  const glowMat = makeGlowMaterial(PAL.fairyCore, PAL.fairyHalo, 0);
  const glow = at(new Mesh(capGeo, glowMat), 0, 0.3, 0); glow.scale.set(1.03, 0.73, 1.03); glow.visible = false;
  group.add(cap, glow);
  group.scale.setScalar(s);
  group.rotation.y = seed;
  /** k 0..1: how lit the cap is */
  const light = (k) => { glow.visible = k > 0.02; cap.visible = k < 0.98; glowMat.uniforms.uStr.value = 0.35 + k * 1.05; };
  return { group, light };
}
