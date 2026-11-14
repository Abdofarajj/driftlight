// Lantern Forest: the first zone. Everything is built from primitives through the look recipe.
import {
  Group, Mesh, InstancedMesh, Object3D, BufferGeometry, Float32BufferAttribute, CylinderGeometry, IcosahedronGeometry,
  SphereGeometry, BoxGeometry, ConeGeometry, TubeGeometry, CatmullRomCurve3, Vector3, Color, TorusGeometry,
} from 'three';
import { PAL } from '../look/palette.js';
import { makeWatercolorMaterial, makeGlowMaterial } from '../look/material.js';
import { rng, fbm2, noise3 } from './rng.js';
import { displace, setMix } from './shapes.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { buildCrystalLake } from './lake.js';
import { buildDesert } from './desert.js';
import { buildHollow } from './hollow.js';
import { buildPeak } from './peak.js';
import { buildTower } from './tower.js';
import { mergeSiblings } from '../look/merge.js';

const R = 24; // main island radius

// ---------- path + terrain ----------
export const PATH = [
  [27, 7], [21, 6.5], [14, 7.5], [7, 9], [1, 9], [-2, 5], [-1.5, 0], [0.5, -5], [1.5, -10], [2, -15], [2, -20],
].map(([x, z]) => new Vector3(x, 0, z));

function distToPath(x, z) {
  let best = 1e9;
  for (let i = 0; i < PATH.length - 1; i++) {
    const a = PATH[i], b = PATH[i + 1];
    const abx = b.x - a.x, abz = b.z - a.z;
    const t = Math.max(0, Math.min(1, ((x - a.x) * abx + (z - a.z) * abz) / (abx * abx + abz * abz)));
    const dx = x - (a.x + abx * t), dz = z - (a.z + abz * t);
    best = Math.min(best, Math.hypot(dx, dz));
  }
  return best;
}

function edgeRadius(theta) {
  return R * (0.9 + 0.12 * noise3(Math.cos(theta) * 1.6 + 3, Math.sin(theta) * 1.6, 0.3) + 0.05 * Math.sin(theta * 3 + 1));
}

export function pathMask(x, z) {
  const d = distToPath(x, z);
  const w = 1.5 + 0.5 * noise3(x * 0.3, 0, z * 0.3);
  return 1 - smoothstep(w - 0.6, w + 0.5, d);
}

function smoothstep(a, b, x) { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); }

export function groundHeight(x, z) {
  const r = Math.hypot(x, z);
  const th = Math.atan2(z, x);
  const er = edgeRadius(th);
  let h = (fbm2(x * 0.06 + 5, z * 0.06) - 0.5) * 4.0;
  h += 1.6 * Math.exp(-((x + 12) ** 2 + (z + 10) ** 2) / 60); // soft hill west
  h += 1.0 * Math.exp(-((x - 13) ** 2 + (z + 14) ** 2) / 50);
  h *= 1 - 0.55 * pathMask(x, z);
  h -= smoothstep(er * 0.86, er * 1.0, r) * 1.0; // rounded lip
  return h;
}

// floor candidates (see floorAt)
const FL = { best: null, top: null, lim: Infinity };
function flc(v) { if (v === null) return; if (FL.top === null || v > FL.top) FL.top = v; if (v <= FL.lim && (FL.best === null || v > FL.best)) FL.best = v; }

export function onIsland(x, z) {
  return Math.hypot(x, z) < edgeRadius(Math.atan2(z, x)) * 0.97;
}

function buildIslandTop() {
  const SEG = 128, RINGS = 46;
  const pos = [], idx = [];
  pos.push(0, groundHeight(0, 0), 0);
  for (let i = 1; i <= RINGS; i++) {
    const f = i / RINGS;
    for (let s = 0; s < SEG; s++) {
      const th = (s / SEG) * Math.PI * 2;
      const r = edgeRadius(th) * Math.pow(f, 0.85);
      const x = Math.cos(th) * r, z = Math.sin(th) * r;
      pos.push(x, groundHeight(x, z), z);
    }
  }
  for (let s = 0; s < SEG; s++) idx.push(0, 1 + ((s + 1) % SEG), 1 + s);
  for (let i = 1; i < RINGS; i++) {
    const a = 1 + (i - 1) * SEG, b = 1 + i * SEG;
    for (let s = 0; s < SEG; s++) {
      const s1 = (s + 1) % SEG;
      idx.push(a + s, a + s1, b + s, a + s1, b + s1, b + s);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  setMix(g, (x, y, z) => pathMask(x, z));
  return g;
}

function buildCliff(radiusFn, topY, depth, seed, segs = 96, rows = 22) {
  const pos = [], idx = [];
  for (let k = 0; k <= rows; k++) {
    const f = k / rows;
    for (let s = 0; s < segs; s++) {
      const th = (s / segs) * Math.PI * 2;
      const er = radiusFn(th);
      const shrink = 1 - Math.pow(f, 1.5) * 0.93;
      const strata = 1 + 0.1 * (noise3(th * 4 + seed, f * 6, seed) - 0.5) + 0.06 * Math.sin(f * 25 + th * 3);
      const r = er * shrink * strata;
      const x = Math.cos(th) * r, z = Math.sin(th) * r;
      const y = (k === 0 ? topY(x * 0.98, z * 0.98) : topY(Math.cos(th) * er * 0.97, Math.sin(th) * er * 0.97)) - f * depth - (k === 0 ? 0 : 0.5);
      pos.push(x, y, z);
    }
  }
  for (let k = 0; k < rows; k++) {
    for (let s = 0; s < segs; s++) {
      const a = k * segs + s, b = k * segs + ((s + 1) % segs), c = (k + 1) * segs + s, d = (k + 1) * segs + ((s + 1) % segs);
      idx.push(a, c, b, b, c, d);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  // moss at the top rows
  setMix(g, (x, y) => smoothstep(-3.5, -0.8, y));
  return g;
}

// ---------- materials (one instance each) ----------
const M = {};
function mats() {
  if (M.grass) return M;
  M.ground = makeWatercolorMaterial({ lit: PAL.grass, lit2: PAL.path, mix: true, rim: 0.0, wash: 0.16 });
  M.cliff = makeWatercolorMaterial({ lit: PAL.cliff, lit2: PAL.moss, mix: true, rim: 0.4 });
  M.trunk = makeWatercolorMaterial({ lit: PAL.trunk, rim: 0.4 });
  M.canopy = makeWatercolorMaterial({ lit: PAL.canopy, rim: 0.6, sway: 0.03, wash: 0.22, breakup: 0.85 });
  M.canopyAlt = makeWatercolorMaterial({ lit: PAL.canopyAlt, rim: 0.6, sway: 0.03, wash: 0.22, breakup: 0.85 });
  M.stone = makeWatercolorMaterial({ lit: PAL.stone, rim: 0.35, wash: 0.18 });
  M.moss = makeWatercolorMaterial({ lit: PAL.moss, rim: 0.3, sway: 0.02 });
  M.wood = makeWatercolorMaterial({ lit: PAL.wood, rim: 0.3 });
  M.mush = makeWatercolorMaterial({ lit: PAL.mushroom, rim: 0.4 });
  M.spot = makeWatercolorMaterial({ lit: PAL.spot, rim: 0.2 });
  M.stem = makeWatercolorMaterial({ lit: PAL.tunic, rim: 0.2 });
  M.tuft = makeWatercolorMaterial({ lit: [new Color('#b2bb70'), new Color('#76926e')], rim: 0.0, sway: 0.12, tint: true, lightRecv: 0.7 });
  M.flower = makeWatercolorMaterial({ lit: [new Color('#ffffff'), new Color('#b8a3c4')], rim: 0.25, sway: 0.08, tint: true });
  M.glow = makeGlowMaterial();
  M.glowDim = makeGlowMaterial(PAL.glowCore, PAL.glowHalo, 0.75);
  M.rope = makeGlowMaterial(PAL.glowCore, PAL.glowHalo, 0.95);
  return M;
}

// ---------- props ----------
// shared by every hanging lantern, so they can all be drawn as one instanced mesh (look/merge.js)
let LG = null;
const lanternGeos = () => LG || (LG = {
  body: new CylinderGeometry(0.17, 0.17, 0.32, 10),
  cap: new ConeGeometry(0.22, 0.14, 10),
  base: new CylinderGeometry(0.19, 0.15, 0.05, 10),
  string: new CylinderGeometry(0.015, 0.015, 1, 4), // scaled to the string's length
});

function makeLantern(lights, swingers, str = 0.9) {
  // hanging paper lantern: body glows, cap + base wood
  const G = lanternGeos();
  const g = new Group();
  const body = new Mesh(G.body, M.glow);
  const cap = new Mesh(G.cap, M.wood);
  cap.position.y = 0.23;
  const base = new Mesh(G.base, M.wood);
  base.position.y = -0.18;
  g.add(body, cap, base);
  lights.push({ obj: body, str });
  return g;
}

function hangLantern(parent, x, y, z, len, lights, swingers, ph) {
  const pivot = new Group();
  pivot.position.set(x, y, z);
  const string = new Mesh(lanternGeos().string, M.wood);
  string.scale.y = len;
  string.position.y = -len / 2;
  const l = makeLantern(lights, swingers);
  l.position.y = -len - 0.18;
  pivot.add(string, l);
  pivot.userData.ph = ph;
  pivot.userData.dynamic = true; // swings: drawn instanced, never baked
  swingers.push(pivot);
  parent.add(pivot);
}

/** Tube along a curve whose radius tapers from r0 to r1. Ends are capped by sinking them into other shapes. */
function taperTube(points, r0, r1, radial = 10, tubular = 16, seed = 0, amp = 0.06) {
  const curve = new CatmullRomCurve3(points);
  const geo = new TubeGeometry(curve, tubular, 1, radial, false);
  const p = geo.attributes.position;
  const c = new Vector3();
  for (let i = 0; i <= tubular; i++) {
    const t = i / tubular;
    curve.getPointAt(t, c);
    const rad = r0 + (r1 - r0) * Math.pow(t, 0.8);
    for (let j = 0; j <= radial; j++) {
      const k = i * (radial + 1) + j;
      const x = p.getX(k) - c.x, y = p.getY(k) - c.y, z = p.getZ(k) - c.z;
      const n = 1 + (noise3(p.getX(k) * 2 + seed, p.getY(k) * 2, p.getZ(k) * 2) - 0.5) * amp * 2;
      p.setXYZ(k, c.x + x * rad * n, c.y + y * rad * n, c.z + z * rad * n);
    }
  }
  geo.computeVertexNormals();
  return { geo, curve };
}

function makeTree(x, z, s, seed, lights, swingers, colliders, alt = false) {
  const r = rng(seed);
  const g = new Group();
  g.userData.occluder = true;
  const y0 = groundHeight(x, z);
  g.position.set(x, y0 - 0.25, z);
  g.rotation.y = r() * Math.PI * 2;
  const H = 5.5 * s;
  const lean = (r() - 0.5) * 1.6 * s;
  // trunk spine: gentle S-curve with a lean; everything else attaches to points on this curve
  const spine = [0, 0.25, 0.5, 0.75, 1].map((t) => new Vector3(lean * t * t + Math.sin(t * 3.1) * 0.25 * s, t * H, Math.sin(t * 2.3 + seed) * 0.2 * s));
  const { geo: trunkGeo, curve } = taperTube(spine, 0.95 * s, 0.5 * s, 12, 18, seed, 0.08);
  g.add(new Mesh(trunkGeo, M.trunk));
  const top = curve.getPointAt(1);
  // root flares, sunk into the trunk base and the ground
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + r() * 0.6;
    const dir = new Vector3(Math.cos(a), 0, Math.sin(a));
    const pts = [new Vector3(0, 1.0 * s, 0).addScaledVector(dir, 0.2 * s), new Vector3(0, 0.35 * s, 0).addScaledVector(dir, 0.9 * s), new Vector3(0, -0.1, 0).addScaledVector(dir, 1.6 * s)];
    g.add(new Mesh(taperTube(pts, 0.42 * s, 0.1 * s, 7, 6, seed + i, 0.05).geo, M.trunk));
  }
  // canopy: overlapping blobs in a wide dome centred over the trunk top
  const blobGeo = displace(displace(new IcosahedronGeometry(1, 4), 0.1, 1.8, seed), 0.07, 4.5, seed + 3);
  const nb = 20;
  const mat = alt ? M.canopyAlt : M.canopy;
  const cy = top.y + 1.4 * s;
  const blobs = [];
  for (let i = 0; i < nb; i++) {
    const a = (i / nb) * Math.PI * 2 + r() * 0.6;
    const d = i === 0 ? 0 : (1.4 + r() * 2.0) * s;
    const b = new Mesh(blobGeo, mat);
    const rad = (i === 0 ? 2.6 : 1.15 + r() * 0.8) * s;
    b.position.set(top.x + Math.cos(a) * d, cy + (i === 0 ? 0.9 * s : (r() - 0.35) * 1.4 * s), top.z + Math.sin(a) * d);
    b.scale.set(rad, rad * 0.78, rad);
    b.rotation.y = r() * 6;
    b.userData.rad = rad;
    g.add(b);
    blobs.push(b);
  }
  // branches: from a point on the trunk into the centre of an outer blob (always attached at both ends)
  const outer = blobs.slice(1).sort((p, q) => q.userData.rad - p.userData.rad);
  for (let i = 0; i < 3; i++) {
    const b = outer[i * 3 % outer.length];
    const st = curve.getPointAt(0.62 + i * 0.1);
    const end = b.position.clone();
    const mid = st.clone().lerp(end, 0.5); mid.y -= 0.35 * s;
    g.add(new Mesh(taperTube([st, mid, end], 0.34 * s, 0.14 * s, 8, 10, seed + 10 + i, 0.06).geo, M.trunk));
  }
  // hanging lanterns: each hangs from the underside of a real blob
  const nl = 3 + Math.floor(r() * 3);
  for (let i = 0; i < nl; i++) {
    const b = outer[(i * 2 + 1) % outer.length];
    const rad = b.userData.rad;
    const a = r() * Math.PI * 2, off = rad * 0.45;
    const hx = b.position.x + Math.cos(a) * off, hz = b.position.z + Math.sin(a) * off;
    // underside of an ellipsoid at that offset, nudged inside so the string disappears into the leaves
    const hy = b.position.y - rad * 0.78 * Math.sqrt(1 - 0.45 * 0.45) + 0.15;
    hangLantern(g, hx, hy, hz, 0.5 + r() * 1.0, lights, swingers, r() * 6);
  }
  colliders.push({ x, z, r: 1.0 * s });
  return g;
}

function makeRock(x, z, s, seed, colliders, block = false) {
  const geo = block
    ? displace(new BoxGeometry(1, 1, 1, 4, 4, 4), 0.06, 2.5, seed)
    : displace(new IcosahedronGeometry(1, 2), 0.18, 1.3, seed);
  const m = new Mesh(geo, M.stone);
  m.scale.set(s * (block ? 1.1 : 1.2), s * (block ? 0.85 : 0.65), s);
  m.position.set(x, groundHeight(x, z) + s * (block ? 0.3 : 0.15), z);
  m.rotation.y = seed;
  if (colliders) colliders.push({ x, z, r: s * 0.75 });
  return m;
}

function makeMushroom(x, z, s, seed) {
  const g = new Group();
  const stem = new Mesh(displace(new CylinderGeometry(0.12, 0.17, 0.42, 8, 2), 0.01, 3, seed), M.stem);
  stem.position.y = 0.21;
  const cap = new Mesh(displace(new SphereGeometry(0.34, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), 0.02, 3, seed), M.mush);
  cap.scale.y = 0.75;
  cap.position.y = 0.36;
  g.add(stem, cap);
  const r = rng(seed + 5);
  for (let i = 0; i < 5; i++) {
    const a = r() * Math.PI * 2, el = 0.35 + r() * 0.8;
    const sp = new Mesh(new SphereGeometry(0.05, 6, 4), M.spot);
    sp.position.set(Math.cos(a) * Math.cos(el) * 0.33, 0.36 + Math.sin(el) * 0.25, Math.sin(a) * Math.cos(el) * 0.33);
    sp.scale.y = 0.4;
    g.add(sp);
  }
  g.scale.setScalar(s);
  g.position.set(x, groundHeight(x, z) - 0.03, z);
  g.rotation.y = seed;
  return g;
}

/** Stone lantern from the props sheet. `lit` 0..1 is driven by the quest later. */
export function makeStoneLantern(x, z, lights, colliders, lit = 0.25) {
  const g = new Group();
  const base = new Mesh(displace(new BoxGeometry(0.9, 0.3, 0.9, 3, 2, 3), 0.03, 3, x), M.stone); base.position.y = 0.15;
  const pillar = new Mesh(displace(new CylinderGeometry(0.22, 0.28, 1.0, 8, 3), 0.03, 3, z), M.stone); pillar.position.y = 0.8;
  const shelf = new Mesh(displace(new BoxGeometry(0.8, 0.14, 0.8, 3, 1, 3), 0.02, 3, 1), M.stone); shelf.position.y = 1.35;
  const box = new Mesh(new BoxGeometry(0.55, 0.5, 0.55), M.stone); box.position.y = 1.67;
  const glowMat = makeGlowMaterial(PAL.glowCore, PAL.glowHalo, 0.4 + lit);
  const win = new Mesh(new BoxGeometry(0.58, 0.32, 0.36), glowMat); win.position.y = 1.67;
  const win2 = new Mesh(new BoxGeometry(0.36, 0.32, 0.58), glowMat); win2.position.y = 1.67;
  const roof = new Mesh(displace(new ConeGeometry(0.72, 0.42, 4, 2), 0.02, 3, 2), M.stone); roof.position.y = 2.1; roof.rotation.y = Math.PI / 4;
  const knob = new Mesh(new SphereGeometry(0.12, 8, 6), M.stone); knob.position.y = 2.38;
  const ivy = new Mesh(displace(new IcosahedronGeometry(0.28, 1), 0.06, 4, 3), M.moss); ivy.position.set(0.3, 2.05, 0.2); ivy.scale.set(1, 0.5, 1);
  g.add(base, pillar, shelf, box, win, win2, roof, knob, ivy);
  g.position.set(x, groundHeight(x, z) - 0.05, z);
  const light = { obj: win, str: 0.5 + lit * 1.5 };
  lights.push(light);
  colliders.push({ x, z, r: 0.6 });
  g.userData = { glowMat, light };
  return g;
}

function makeArch(x, z, rotY, s, colliders) {
  const g = new Group();
  const blockGeo = displace(new BoxGeometry(1, 1, 1, 3, 3, 3), 0.05, 2.5, 4);
  const r = rng(Math.floor(x * 10 + z));
  const W = 2.4 * s, Hh = 3.4 * s;
  for (const side of [-1, 1]) {
    for (let i = 0; i < 4; i++) {
      const b = new Mesh(blockGeo, M.stone);
      b.scale.set(0.9 * s, 0.85 * s, 0.9 * s);
      b.position.set(side * W, 0.42 * s + i * 0.85 * s, 0);
      b.rotation.y = (r() - 0.5) * 0.15;
      g.add(b);
    }
  }
  const steps = 9;
  for (let i = 0; i < steps; i++) {
    const a = Math.PI * (i / (steps - 1));
    const b = new Mesh(blockGeo, M.stone);
    b.scale.set(0.8 * s, 0.6 * s, 0.9 * s);
    b.position.set(Math.cos(a) * W, Hh + Math.sin(a) * W * 0.85, 0);
    b.rotation.z = a - Math.PI / 2;
    g.add(b);
  }
  // ivy
  for (let i = 0; i < 7; i++) {
    const a = Math.PI * r();
    const v = new Mesh(displace(new IcosahedronGeometry(0.45 * s, 1), 0.1, 3, i), M.moss);
    v.position.set(Math.cos(a) * W * 1.05, Hh + Math.sin(a) * W * 0.9 + 0.3, (r() - 0.5) * 0.6);
    v.scale.y = 0.6;
    g.add(v);
  }
  g.position.set(x, groundHeight(x, z) - 0.1, z);
  g.rotation.y = rotY;
  const c = Math.cos(rotY), sn = Math.sin(rotY);
  for (const side of [-1, 1]) colliders.push({ x: x + side * W * c, z: z - side * W * sn, r: 0.7 * s });
  return g;
}

const noMerge = typeof location !== 'undefined' && new URLSearchParams(location.search).has('nomerge');
function makeBridge(from, to, lights, colliders, sagAmt = 1.0, look = {}) {
  const plankMat = look.plank || M.wood, postMat = look.post || M.wood, ropeMat = look.rope || M.rope;
  const g = new Group();
  const dir = new Vector3().subVectors(to, from);
  const len = dir.length();
  dir.normalize();
  const side = new Vector3(-dir.z, 0, dir.x);
  const n = Math.floor(len / 0.55);
  const plankGeo = displace(new BoxGeometry(0.48, 0.12, 2.6, 2, 1, 3), 0.015, 3, 9);
  const sag = (t) => -Math.sin(t * Math.PI) * sagAmt;
  const planks = [], extras = [], rails = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const p = new Vector3().lerpVectors(from, to, t);
    p.y += sag(t);
    const b = new Mesh(plankGeo, plankMat);
    b.position.copy(p);
    b.rotation.y = Math.atan2(-dir.z, dir.x);
    b.rotation.x = (i % 3 - 1) * 0.02;
    b.userData = { t, y: p.y };
    g.add(b);
    planks.push(b);
  }
  // posts + glowing rope rails
  for (const sgn of [-1, 1]) {
    const pts = [];
    const postN = Math.max(3, Math.round(len / 4));
    for (let i = 0; i <= postN; i++) {
      const t = i / postN;
      const p = new Vector3().lerpVectors(from, to, t).addScaledVector(side, 1.35 * sgn);
      p.y += sag(t);
      const post = new Mesh(displace(new CylinderGeometry(0.1, 0.13, 1.3, 7, 2), 0.02, 3, i), postMat);
      post.position.copy(p).setY(p.y + 0.55);
      g.add(post); extras.push(post);
      pts.push(p.clone().setY(p.y + 1.05));
      if (i < postN) {
        const q = new Vector3().lerpVectors(from, to, t + 0.5 / postN).addScaledVector(side, 1.35 * sgn);
        q.y += sag(t + 0.5 / postN) + 0.85;
        pts.push(q);
      }
      if (i % 2 === 0) lights.push({ obj: post, str: 0.35, offset: 1.1 });
    }
    const rope = new Mesh(new TubeGeometry(new CatmullRomCurve3(pts), 60, 0.05, 5), ropeMat);
    g.add(rope); extras.push(rope);
    const a = new Vector3().copy(from).addScaledVector(side, 1.35 * sgn), b = new Vector3().copy(to).addScaledVector(side, 1.35 * sgn);
    const c = { ax: a.x, az: a.z, bx: b.x, bz: b.z, r: 0.15 };
    colliders.push(c); rails.push(c);
  }
  const data = { from, to, dir, len, sag: sagAmt, enabled: true };
  /** 0..1: planks rise out of the clouds one after another, then posts and ropes appear */
  const setRise = (k) => {
    for (const pl of planks) {
      const e = Math.max(0, Math.min(1, k * 1.4 - pl.userData.t * 0.9));
      pl.visible = e > 0.01;
      const ease = 1 - Math.pow(1 - e, 3);
      pl.position.y = pl.userData.y - (1 - ease) * 6;
      pl.scale.setScalar(0.3 + 0.7 * ease);
    }
    for (const x of extras) x.visible = k >= 1;
    data.enabled = k >= 1;
    for (const c of rails) c.off = k < 1;
    // once it's fully up it never moves again: bake planks, posts and ropes into a few meshes (phones)
    if (k >= 1 && !baked && !noMerge) { baked = true; mergeSiblings(g); }
  };
  let baked = false;
  return { group: g, data, setRise };
}

/** The lantern shrine (ref: lantern-shrine.png). Dim until the quest is done. */
function makeShrine(lights, colliders, wx = 4, wz = -51) {
  const g = new Group();
  const glowMat = makeGlowMaterial(PAL.glowCore, PAL.glowHalo, 0.35);
  // round steps
  [[3.4, 0.22], [2.7, 0.22], [2.0, 0.22]].forEach(([r, h], i) => {
    const d = new Mesh(displace(new CylinderGeometry(r, r + 0.1, h, 32, 1), 0.04, 2, i), M.stone);
    d.position.y = h / 2 + i * h;
    g.add(d);
  });
  const base = 0.66;
  // tower: tiers + a glowing star window
  const tiers = [[0.9, 0.7], [0.75, 0.9], [0.6, 0.5]];
  let y = base;
  tiers.forEach(([r, h], i) => {
    const t = new Mesh(displace(new CylinderGeometry(r * 0.9, r, h, 8, 2), 0.03, 3, i + 5), M.stone);
    t.position.y = y + h / 2; y += h;
    g.add(t);
    if (i === 1) {
      for (const ry of [0, Math.PI / 2]) {
        const w = new Mesh(new BoxGeometry(0.5, 0.6, r * 1.95), glowMat);
        w.position.y = t.position.y; w.rotation.y = ry;
        g.add(w);
      }
    }
  });
  const roof = new Mesh(displace(new ConeGeometry(0.85, 0.7, 8, 2), 0.03, 3, 9), M.stone);
  roof.position.y = y + 0.35; g.add(roof);
  const knob = new Mesh(new SphereGeometry(0.22, 10, 8), M.stone); knob.position.y = y + 0.8; g.add(knob);
  const star = new Mesh(new ConeGeometry(0.28, 0.5, 4).translate(0, 0.25, 0), glowMat);
  const star2 = star.clone(); star2.rotation.z = Math.PI;
  const starG = new Group(); starG.add(star, star2); starG.position.y = y + 1.6; g.add(starG);
  starG.userData.dynamic = true; // spins
  lights.push({ obj: starG, str: 0.6 });
  // four pillars with diamond glows
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const px = Math.cos(a) * 4.6, pz = Math.sin(a) * 4.6;
    const pil = new Mesh(displace(new BoxGeometry(0.8, 1.8, 0.8, 2, 3, 2), 0.04, 2.5, i), M.stone);
    pil.position.set(px, 0.9, pz); pil.rotation.y = -a;
    const gem = new Mesh(new ConeGeometry(0.18, 0.3, 4).translate(0, 0.15, 0), glowMat);
    const gem2 = gem.clone(); gem2.rotation.z = Math.PI;
    const gg = new Group(); gg.add(gem, gem2); gg.position.set(px, 1.2, pz); gg.lookAt(0, 1.2, 0);
    gg.translateZ(0.42);
    const ivy = new Mesh(displace(new IcosahedronGeometry(0.35, 1), 0.07, 3, i), M.moss); ivy.position.set(px, 1.85, pz); ivy.scale.y = 0.5;
    g.add(pil, gg, ivy);
    colliders.push({ x: wx + px, z: wz + pz, r: 0.6 });
  }
  colliders.push({ x: wx, z: wz, r: 1.1 });
  const ring = new Mesh(new TorusGeometry(2.4, 0.05, 6, 64), glowMat);
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.67; g.add(ring);
  g.userData = {
    glow: 0, starG,
    setGlow(k) { this.glow = k; glowMat.uniforms.uStr.value = 0.35 + k * 1.2; },
    update(t) { starG.rotation.y = t * (0.3 + this.glow * 1.2); starG.position.y = y + 1.6 + Math.sin(t * 1.5) * 0.1 * this.glow; },
  };
  return g;
}

/** A small floating island with a grassy top and a cliff underside. */
function makeIsle(cx, cz, rad, topY, seed, depth = 12) {
  const g = new Group();
  const er = (th) => rad * (0.9 + 0.15 * noise3(Math.cos(th) * 2 + seed, Math.sin(th) * 2, 9));
  const top = new Mesh(displace(new CylinderGeometry(rad, rad, 0.6, 40, 1), 0.2, 0.5, seed), M.ground);
  top.position.y = -0.3;
  g.add(top);
  g.add(new Mesh(buildCliff(er, () => -0.1, depth, seed, 48, 14), M.cliff));
  g.position.set(cx, topY, cz);
  return { group: g, floor: { x: cx, z: cz, r: rad * 0.88, y: topY } };
}

function scatterInstanced(geo, mat, count, place, seed, tints) {
  const im = new InstancedMesh(geo, mat, count);
  const o = new Object3D();
  const r = rng(seed);
  let k = 0;
  for (let tries = 0; k < count && tries < count * 30; tries++) {
    const res = place(r);
    if (!res) continue;
    o.position.set(res.x, res.y, res.z);
    o.rotation.set(res.rx || 0, res.ry ?? r() * 6.28, res.rz || 0);
    o.scale.set(res.sx ?? res.s, res.sy ?? res.s, res.sz ?? res.s);
    o.updateMatrix();
    im.setMatrixAt(k, o.matrix);
    if (tints) im.setColorAt(k, tints[Math.floor(r() * tints.length)]);
    k++;
  }
  im.count = k;
  return im;
}

/** Checkpoint: a round stepping stone with a small star pillar that lights up when you pass. */
function makeWaystone(x, z, y) {
  const g = new Group();
  const disc = new Mesh(displace(new CylinderGeometry(1.0, 1.1, 0.22, 24, 1), 0.03, 2, x), M.stone);
  disc.position.y = 0.0;
  const ring = new Mesh(new TorusGeometry(0.75, 0.035, 6, 40), makeGlowMaterial(PAL.glowCore, PAL.glowHalo, 0.5));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.12;
  const pillar = new Mesh(displace(new CylinderGeometry(0.12, 0.18, 0.75, 7, 2), 0.02, 3, z), M.stone);
  pillar.position.set(1.25, 0.4, 0);
  const starMat = makeGlowMaterial(PAL.glowCore, PAL.glowHalo, 0.45);
  const star = new Mesh(new ConeGeometry(0.16, 0.42, 4), starMat);
  star.position.set(1.25, 0.95, 0);
  const star2 = star.clone(); star2.rotation.z = Math.PI;
  star.geometry.translate(0, 0.21, 0); // two cones tip to tip = a 4-point star
  g.add(disc, ring, pillar, star, star2);
  star.userData.dynamic = star2.userData.dynamic = true; // spin
  g.position.set(x, y - 0.06, z);
  const ws = {
    obj: g, pos: new Vector3(x, y, z), active: false, pulse: 0,
    activate() { if (this.active) return false; this.active = true; this.pulse = 1; return true; },
    update(t, dt) {
      this.pulse = Math.max(0, this.pulse - dt * 0.8);
      const base = this.active ? 1.25 : 0.45;
      starMat.uniforms.uStr.value = base + this.pulse * 1.5 + (this.active ? Math.sin(t * 2) * 0.1 : 0);
      ring.material.uniforms.uStr.value = this.active ? 0.95 + this.pulse : 0.5;
      star.rotation.y = star2.rotation.y = t * (this.active ? 1.2 : 0.3);
    },
  };
  return ws;
}

// ---------- build the zone ----------
export function buildLanternForest() {
  mats();
  const root = new Group();
  const lights = [];   // {obj, str} world-space light sources (lanterns)
  const swingers = []; // pivots that sway
  const colliders = [];
  const stoneLanterns = [];

  // island
  root.add(new Mesh(buildIslandTop(), M.ground));
  root.add(new Mesh(buildCliff(edgeRadius, groundHeight, 20, 1), M.cliff));

  // trees (big shapes at the edges, path stays open)
  const trees = [
    [-11, -5, 1.25, 11, false], [11, -9, 1.15, 12, true], [-14, 9, 1.0, 13, true], [-4, -17, 1.1, 14, false],
    [13, -19, 0.95, 15, false], [16, 0.5, 0.85, 16, true], [-17, -12, 0.9, 17, true], [7, 16, 0.8, 18, false],
  ];
  for (const [x, z, s, seed, alt] of trees) root.add(makeTree(x, z, s, seed, lights, swingers, colliders, alt));

  // ruin arch gate at the end of the path + a small broken ruin west
  root.add(makeArch(2, -20.5, 0, 1.0, colliders));
  const ruin = makeArch(-16, 1, 1.2, 0.7, colliders);
  ruin.children.splice(9, 6); // broken top
  root.add(ruin);

  // stone blocks & rocks
  const rocks = [[-5, 3, 0.9, 1, true], [5, 5, 0.7, 2, false], [-7, -3, 0.6, 3, false], [6.5, -6, 1.0, 4, true], [-3, 12, 0.8, 5, true],
    [9, 11, 0.6, 6, false], [-12, -16, 0.9, 7, false], [17, -6, 0.8, 8, true], [-19, 4, 0.7, 9, false], [4, -12, 0.5, 10, false]];
  for (const [x, z, s, seed, block] of rocks) root.add(makeRock(x, z, s, seed, colliders, block));

  // stone lanterns (quest targets in round 3)
  for (const [x, z] of [[-4.5, 7.5], [4.5, 1.5], [-4, -8], [5.5, -14], [-6.5, -13]]) {
    const sl = makeStoneLantern(x, z, lights, colliders);
    stoneLanterns.push(sl);
    root.add(sl);
  }

  // mushrooms in little clusters near trees
  const mr = rng(31);
  for (const [cx, cz] of [[-9, -2], [9, -6], [-12, 11], [3, 13], [14, -16], [11, 4]]) {
    for (let i = 0; i < 3; i++) root.add(makeMushroom(cx + (mr() - 0.5) * 2, cz + (mr() - 0.5) * 2, 0.7 + mr() * 0.9, mr() * 100));
  }

  // fence along the path near the bridge: posts sunk into the ground, rails span post to post
  const fencePts = [];
  for (let i = 0; i < 6; i++) {
    const x = 6.5 + i * 2.1, z = 12.2 - i * 0.35 + Math.sin(i * 1.3) * 0.2;
    fencePts.push(new Vector3(x, groundHeight(x, z), z));
  }
  const postGeo = displace(new CylinderGeometry(0.12, 0.15, 1.6, 7, 2), 0.02, 3, 1);
  const railGeo = new CylinderGeometry(0.055, 0.055, 1, 6);
  railGeo.rotateZ(Math.PI / 2);
  fencePts.forEach((pt, i) => {
    const post = new Mesh(postGeo, M.wood);
    post.position.set(pt.x, pt.y + 0.45, pt.z); // 0.35 of it is under the ground
    post.rotation.z = (i % 2 ? 1 : -1) * 0.04;
    root.add(post);
    const cap = new Mesh(new SphereGeometry(0.14, 8, 6), M.wood); cap.scale.y = 0.5; cap.position.set(pt.x, pt.y + 1.25, pt.z);
    root.add(cap);
    if (i < fencePts.length - 1) {
      const nx = fencePts[i + 1];
      for (const h of [0.55, 0.95]) {
        const p0 = new Vector3(pt.x, pt.y + h, pt.z), p1 = new Vector3(nx.x, nx.y + h, nx.z);
        const rail = new Mesh(railGeo, M.wood);
        rail.position.copy(p0).lerp(p1, 0.5);
        rail.scale.x = p0.distanceTo(p1) + 0.1;
        rail.lookAt(p1); rail.rotateY(-Math.PI / 2); // align the rail's X axis with p0 -> p1
        root.add(rail);
      }
      colliders.push({ ax: pt.x, az: pt.z, bx: nx.x, bz: nx.z, r: 0.15 });
    }
  });

  // ---- islands and bridges ----
  const isles = [];   // flat walkable tops {x, z, r, y}
  const bridges = []; // {from, to, dir, len, sag, enabled}
  const addIsle = (...args) => { const i = makeIsle(...args); root.add(i.group); isles.push(i.floor); return i.group; };

  // east: small island over the rope bridge
  const bFrom = new Vector3(22.5, groundHeight(22, 6.8) + 0.05, 6.8);
  const bTo = new Vector3(42, 0.2, 8);
  const east = makeBridge(bFrom, bTo, lights, colliders);
  root.add(east.group); bridges.push(east.data);
  const small = addIsle(50, 8, 8, 0.5, 4);
  small.add(makeTree(1.5, -1, 0.9, 41, lights, swingers, [], true).translateY(-0.2 - groundHeight(1.5, -1)));
  colliders.push({ x: 51.5, z: 7, r: 0.9 });

  // north: the shrine island. Its bridge rises when all five stone lanterns are lit.
  const nFrom = new Vector3(2, groundHeight(2, -22.4) + 0.05, -22.4);
  const nTo = new Vector3(3.5, 1.4, -41);
  const north = makeBridge(nFrom, nTo, lights, colliders, 0.7);
  root.add(north.group); bridges.push(north.data);
  north.group.userData.dynamic = true; // its planks rise one by one
  north.setRise(0);
  const shrineIsle = addIsle(4, -49, 9.5, 1.4, 7, 14);
  const shrine = makeShrine(lights, colliders, 4, -51);
  shrine.position.set(4, 1.4, -51);
  root.add(shrine);

  // west: meadow island reached only on the warm wind
  const west = addIsle(-50, -7, 9, 3.0, 11, 13);
  west.add(makeTree(-2.5, -2, 0.85, 51, lights, swingers, [], false).translateY(-0.2 - groundHeight(-2.5, -2)));
  colliders.push({ x: -52.5, z: -9, r: 0.85 });
  for (let i = 0; i < 4; i++) west.add(makeMushroom(2 + i * 0.6, 3 - (i % 2) * 0.7, 0.8 + (i % 3) * 0.3, 70 + i).translateY(-groundHeight(2 + i * 0.6, 3 - (i % 2) * 0.7)));

  // grass tufts at the edges (calm in the middle), flowers in drifts
  const tuftGeo = mergeGeometries([-0.35, 0.05, 0.4].map((lean, i) => {
    const g = new ConeGeometry(0.03, 0.34 - i * 0.04, 3, 1).translate(0, 0.17, 0);
    g.rotateZ(lean); g.rotateY(i * 2.1); g.translate(Math.sin(i * 2.1) * 0.04, 0, Math.cos(i * 2.1) * 0.04);
    return g;
  }));
  const tuftTints = [new Color('#ffffff'), new Color('#e8f0c8'), new Color('#d6e6b0'), new Color('#f2e4b0')];
  root.add(scatterInstanced(tuftGeo, M.tuft, 2600, (r) => {
    const a = r() * 6.283, d = Math.sqrt(r()) * R;
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (!onIsland(x, z) || pathMask(x, z) > 0.1) return null;
    const cluster = noise3(x * 0.35, 1, z * 0.35);
    if (cluster < 0.45) return null;
    return { x, y: groundHeight(x, z) - 0.05, z, s: 0.5 + r() * 0.6, rx: (r() - 0.5) * 0.5, rz: (r() - 0.5) * 0.5 };
  }, 51, tuftTints));

  const flowerGeo = displace(new IcosahedronGeometry(0.075, 1), 0.012, 5, 1);
  root.add(scatterInstanced(flowerGeo, M.flower, 1400, (r) => {
    const a = r() * 6.283, d = Math.sqrt(r()) * R;
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (!onIsland(x, z) || pathMask(x, z) > 0.05) return null;
    const drift = noise3(x * 0.22 + 7, 2, z * 0.22);
    if (drift < 0.6 + r() * 0.1) return null;
    return { x, y: groundHeight(x, z) + 0.1 + r() * 0.16, z, s: 0.7 + r() * 0.6 };
  }, 52, PAL.flowers));

  // (the waterfall and its grotto live in secrets.js)

  // ---- Crystal Lake: the next island, across a crystal bridge from the shrine (lake.js) ----
  const zoneCtx = {
    root, lights, swingers, colliders, bridges, M, makeBridge, makeTree, makeRock, makeMushroom, makeWaystone, buildCliff,
    scatter: (kind, count, place, seed, tints) => kind === 'tuft'
      ? scatterInstanced(tuftGeo, M.tuft, count, place, seed, tints || tuftTints)
      : scatterInstanced(flowerGeo, M.flower, count, place, seed, tints || PAL.flowers),
  };
  const lake = buildCrystalLake(zoneCtx);
  // ---- Sunset Desert: across a sandstone bridge from the lake's north-east shore (desert.js) ----
  const desert = buildDesert(zoneCtx);
  // ---- Whispering Hollow: over an old rope bridge from the desert's sun terrace (hollow.js) ----
  const hollow = buildHollow(zoneCtx, desert);
  // ---- Snowy Aurora Peak: over a stone bridge from the Hollow's south-east edge (peak.js) ----
  const peak = buildPeak(zoneCtx, hollow);
  // ---- the Cloud Kingdom: up a stair of cloud steps from the peak's summit (tower.js). When its beacon is lit,
  // every island sends up a beam of light ----
  const tower = buildTower(zoneCtx, peak, [new Vector3(0, -1, 0), new Vector3(4, 0, -49), lake.center, desert.center, hollow.center, peak.mc]);

  const update = (t) => {
    for (const p of swingers) p.rotation.z = Math.sin(t * 1.3 + p.userData.ph) * 0.07, p.rotation.x = Math.cos(t * 1.1 + p.userData.ph) * 0.05;
  };

  // walkable floor: main island, isles, enabled bridges. Returns null over the void. With y (your feet), the
  // highest floor at most 1.2 m above it (where floors overlap: the cloud steps over the peak, the tower's ramp),
  // else the highest
  const floorAt = (x, z, y) => {
    FL.lim = y === undefined ? Infinity : y + 1.2; FL.best = null; FL.top = null;
    if (onIsland(x, z)) flc(groundHeight(x, z));
    for (const i of isles) if (Math.hypot(x - i.x, z - i.z) < i.r) flc(i.y);
    for (const br of bridges) {
      if (!br.enabled) continue;
      const t = ((x - br.from.x) * br.dir.x + (z - br.from.z) * br.dir.z) / br.len;
      const lat = Math.abs((x - br.from.x) * -br.dir.z + (z - br.from.z) * br.dir.x);
      if (t >= -0.05 && t <= 1.05 && lat < 1.25) {
        const tt = Math.max(0, Math.min(1, t));
        flc(br.from.y + (br.to.y - br.from.y) * tt - Math.sin(tt * Math.PI) * br.sag + 0.06);
      }
    }
    flc(lake.floor(x, z)); flc(desert.floor(x, z)); flc(hollow.floor(x, z)); flc(peak.floor(x, z)); flc(tower.floor(x, z, y));
    return FL.best ?? FL.top;
  };

  // checkpoints: start, before the arch, and on the far side of the bridge
  const checkpoints = [[1.2, 11.5], [1.4, -13.5], [46, 8.2]].map(([x, z]) => {
    const ws = makeWaystone(x, z, floorAt(x, z));
    root.add(ws.obj);
    colliders.push({ x: x + 1.25, z, r: 0.2 });
    return ws;
  });
  checkpoints.push(lake.checkpoint); // Crystal Lake, just past the crystal bridge
  checkpoints.push(...desert.checkpoints); // Sunset Desert: past the sandstone bridge, and at the plaza end of the Windy Pass
  checkpoints.push(hollow.way); // Whispering Hollow: just past the rope bridge
  // ...and each lamp you relight there (a checkpoint only once it burns: "you wake by the last lamp you lit")
  for (const L of hollow.lamps) {
    const toHeart = new Vector3().subVectors(hollow.heart, L.pos).setY(0).normalize();
    const p = L.pos.clone().addScaledVector(toHeart, 1.7);
    p.y = hollow.floor(p.x, p.z) ?? L.pos.y;
    L.checkpoint = { obj: null, pos: p, active: false, pulse: 0, lamp: L, get ready() { return !!L.lit; },
      activate() { if (this.active) return false; this.active = true; return true; }, update() {} };
    checkpoints.push(L.checkpoint);
  }
  checkpoints.push(peak.cairn); // Snowy Aurora Peak: just past the stone bridge
  checkpoints.push(tower.rest, tower.way); // the Cloud Kingdom: the resting cloud halfway up the cloud steps, and past the steps
  // ...and each brazier you light (you wake by the last one, in its warm circle)
  for (const Bz of peak.braziers) {
    // on the meadow: towards the mountain; on a terrace: along the ring, the way you're going (it's narrow)
    const toMid = new Vector3().subVectors(peak.mc, Bz.pos).setY(0).normalize();
    const along = new Vector3(toMid.z, 0, -toMid.x);
    const p = Bz.pos.clone().addScaledVector(Bz.level === 0 ? toMid : along, Bz.level === 0 ? 1.7 : 1.4);
    p.y = peak.floor(p.x, p.z) ?? Bz.pos.y;
    Bz.checkpoint = { obj: null, pos: p, active: false, pulse: 0, brazier: Bz, get ready() { return !!Bz.lit; },
      activate() { if (this.active) return false; this.active = true; return true; }, update() {} };
    checkpoints.push(Bz.checkpoint);
  }
  const update2 = (t, dt) => { update(t); checkpoints.forEach((c) => c.update(t, dt)); shrine.userData.update(t); };

  const swingParts = [];
  for (const p of swingers) p.traverse((o) => { if (o.isMesh) swingParts.push(o); });
  return { root, lights, colliders, stoneLanterns, checkpoints, update: update2, floorAt, isles, swingParts, occluders: (() => { const o = []; root.traverse((c) => { if (c.userData.occluder) o.push(c); }); return o; })(), northBridge: north, shrine, lake, desert, hollow, peak, tower, deep: lake.deep, waterAt: lake.waterAt, spawn: new Vector3(1.2, 0, 11.5) };
}
