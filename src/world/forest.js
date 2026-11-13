// Lantern Forest: the first zone. Everything is built from primitives through the look recipe.
import {
  Group, Mesh, InstancedMesh, Object3D, BufferGeometry, Float32BufferAttribute, CylinderGeometry, IcosahedronGeometry,
  SphereGeometry, BoxGeometry, ConeGeometry, TubeGeometry, CatmullRomCurve3, Vector3, Color, TorusGeometry,
} from 'three';
import { PAL } from '../look/palette.js';
import { makeWatercolorMaterial, makeGlowMaterial } from '../look/material.js';
import { rng, fbm2, noise3 } from './rng.js';
import { displace, bend, setMix } from './shapes.js';

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
  M.canopy = makeWatercolorMaterial({ lit: PAL.canopy, rim: 0.55, sway: 0.03, wash: 0.2, breakup: 0.55 });
  M.canopyAlt = makeWatercolorMaterial({ lit: PAL.canopyAlt, rim: 0.55, sway: 0.03, wash: 0.2, breakup: 0.55 });
  M.stone = makeWatercolorMaterial({ lit: PAL.stone, rim: 0.35, wash: 0.18 });
  M.moss = makeWatercolorMaterial({ lit: PAL.moss, rim: 0.3, sway: 0.02 });
  M.wood = makeWatercolorMaterial({ lit: PAL.wood, rim: 0.3 });
  M.mush = makeWatercolorMaterial({ lit: PAL.mushroom, rim: 0.4 });
  M.spot = makeWatercolorMaterial({ lit: PAL.spot, rim: 0.2 });
  M.stem = makeWatercolorMaterial({ lit: PAL.tunic, rim: 0.2 });
  M.tuft = makeWatercolorMaterial({ lit: [new Color('#c3c472'), new Color('#7c9870')], rim: 0.0, sway: 0.12, tint: true, lightRecv: 0.7 });
  M.flower = makeWatercolorMaterial({ lit: [new Color('#ffffff'), new Color('#b8a3c4')], rim: 0.25, sway: 0.08, tint: true });
  M.glow = makeGlowMaterial();
  M.glowDim = makeGlowMaterial(PAL.glowCore, PAL.glowHalo, 0.75);
  M.rope = makeGlowMaterial(PAL.glowCore, PAL.glowHalo, 0.95);
  return M;
}

// ---------- props ----------
function makeLantern(lights, swingers, str = 0.9) {
  // hanging paper lantern: body glows, cap + base wood
  const g = new Group();
  const body = new Mesh(new CylinderGeometry(0.17, 0.17, 0.32, 10), M.glow);
  body.scale.set(1, 1, 1);
  const cap = new Mesh(new ConeGeometry(0.22, 0.14, 10), M.wood);
  cap.position.y = 0.23;
  const base = new Mesh(new CylinderGeometry(0.19, 0.15, 0.05, 10), M.wood);
  base.position.y = -0.18;
  g.add(body, cap, base);
  lights.push({ obj: body, str });
  return g;
}

function hangLantern(parent, x, y, z, len, lights, swingers, ph) {
  const pivot = new Group();
  pivot.position.set(x, y, z);
  const string = new Mesh(new CylinderGeometry(0.015, 0.015, len, 4), M.wood);
  string.position.y = -len / 2;
  const l = makeLantern(lights, swingers);
  l.position.y = -len - 0.18;
  pivot.add(string, l);
  pivot.userData.ph = ph;
  swingers.push(pivot);
  parent.add(pivot);
}

function makeTree(x, z, s, seed, lights, swingers, colliders, alt = false) {
  const r = rng(seed);
  const g = new Group();
  const y0 = groundHeight(x, z);
  g.position.set(x, y0 - 0.2, z);
  const H = 5.5 * s;
  const trunkGeo = bend(displace(new CylinderGeometry(0.55 * s, 1.0 * s, H, 12, 10).translate(0, H / 2, 0), 0.12 * s, 1.2, seed), 0.25 * (r() - 0.5));
  const trunk = new Mesh(trunkGeo, M.trunk);
  trunk.rotation.y = r() * 6;
  g.add(trunk);
  // root flares
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + r();
    const root = new Mesh(displace(new ConeGeometry(0.45 * s, 1.8 * s, 7, 3), 0.06, 2, seed + i), M.trunk);
    root.position.set(Math.cos(a) * 0.7 * s, 0.25 * s, Math.sin(a) * 0.7 * s);
    root.rotation.set(Math.sin(a) * 1.25, 0, -Math.cos(a) * 1.25);
    g.add(root);
  }
  // branches
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + r() * 1.5;
    const L = 2.6 * s;
    const br = new Mesh(new CylinderGeometry(0.16 * s, 0.32 * s, L, 7).translate(0, L / 2, 0), M.trunk);
    br.position.y = H * (0.7 + r() * 0.2);
    br.rotation.set(Math.sin(a) * 0.9, 0, -Math.cos(a) * 0.9);
    g.add(br);
  }
  // canopy: overlapping blobs in a wide dome
  const blobGeo = displace(new IcosahedronGeometry(1, 4), 0.1, 1.8, seed);
  const nb = 14;
  const mat = alt ? M.canopyAlt : M.canopy;
  const cy = H + 1.6 * s;
  const blobs = [];
  for (let i = 0; i < nb; i++) {
    const a = (i / nb) * Math.PI * 2 + r() * 0.6;
    const d = i === 0 ? 0 : (1.6 + r() * 2.2) * s;
    const b = new Mesh(blobGeo, mat);
    const rad = (i === 0 ? 2.8 : 1.4 + r() * 0.9) * s;
    b.position.set(Math.cos(a) * d, cy + (i === 0 ? 1.0 * s : (r() - 0.3) * 1.6 * s), Math.sin(a) * d);
    b.scale.set(rad, rad * 0.78, rad);
    b.rotation.y = r() * 6;
    g.add(b);
    blobs.push(b);
  }
  // hanging lanterns along the canopy underside
  const nl = 3 + Math.floor(r() * 3);
  for (let i = 0; i < nl; i++) {
    const a = r() * Math.PI * 2, d = (2.0 + r() * 2.2) * s;
    hangLantern(g, Math.cos(a) * d, cy - 1.1 * s, Math.sin(a) * d, 0.6 + r() * 1.2, lights, swingers, r() * 6);
  }
  colliders.push({ x, z, r: 1.1 * s });
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

function makeBridge(from, to, lights, colliders) {
  const g = new Group();
  const dir = new Vector3().subVectors(to, from);
  const len = dir.length();
  dir.normalize();
  const side = new Vector3(-dir.z, 0, dir.x);
  const n = Math.floor(len / 0.55);
  const plankGeo = displace(new BoxGeometry(0.48, 0.12, 2.6, 2, 1, 3), 0.015, 3, 9);
  const sag = (t) => -Math.sin(t * Math.PI) * 1.0;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const p = new Vector3().lerpVectors(from, to, t);
    p.y += sag(t);
    const b = new Mesh(plankGeo, M.wood);
    b.position.copy(p);
    b.rotation.y = Math.atan2(-dir.z, dir.x);
    b.rotation.x = (i % 3 - 1) * 0.02;
    g.add(b);
  }
  // posts + glowing rope rails
  for (const sgn of [-1, 1]) {
    const pts = [];
    const postN = 5;
    for (let i = 0; i <= postN; i++) {
      const t = i / postN;
      const p = new Vector3().lerpVectors(from, to, t).addScaledVector(side, 1.35 * sgn);
      p.y += sag(t);
      const post = new Mesh(displace(new CylinderGeometry(0.1, 0.13, 1.3, 7, 2), 0.02, 3, i), M.wood);
      post.position.copy(p).setY(p.y + 0.55);
      g.add(post);
      pts.push(p.clone().setY(p.y + 1.05));
      if (i < postN) {
        const q = new Vector3().lerpVectors(from, to, t + 0.5 / postN).addScaledVector(side, 1.35 * sgn);
        q.y += sag(t + 0.5 / postN) + 0.85;
        pts.push(q);
      }
      if (i % 2 === 0) lights.push({ obj: post, str: 0.35, offset: 1.1 });
    }
    const rope = new Mesh(new TubeGeometry(new CatmullRomCurve3(pts), 60, 0.05, 5), M.rope);
    g.add(rope);
  }
  return g;
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
  for (const [x, z] of [[-4.5, 7.5], [4.5, 1.5], [-4, -8], [5.5, -14], [-1.5, -21]]) {
    const sl = makeStoneLantern(x, z, lights, colliders);
    stoneLanterns.push(sl);
    root.add(sl);
  }

  // mushrooms in little clusters near trees
  const mr = rng(31);
  for (const [cx, cz] of [[-9, -2], [9, -6], [-12, 11], [3, 13], [14, -16], [-15, -9], [11, 4]]) {
    for (let i = 0; i < 3; i++) root.add(makeMushroom(cx + (mr() - 0.5) * 2, cz + (mr() - 0.5) * 2, 0.7 + mr() * 0.9, mr() * 100));
  }

  // fence along the path near the bridge
  for (let i = 0; i < 5; i++) {
    const x = 8 + i * 2.2, z = 11.5 + Math.sin(i) * 0.3;
    const post = new Mesh(displace(new CylinderGeometry(0.12, 0.15, 1.2, 7, 2), 0.02, 3, i), M.wood);
    post.position.set(x, groundHeight(x, z) + 0.5, z);
    root.add(post);
    if (i < 4) {
      const rail = new Mesh(new BoxGeometry(2.2, 0.1, 0.08), M.wood);
      rail.position.set(x + 1.1, groundHeight(x, z) + 0.85, z);
      root.add(rail);
    }
  }

  // bridge east to a small island
  const bFrom = new Vector3(22.5, groundHeight(22, 6.8) + 0.05, 6.8);
  const bTo = new Vector3(42, 0.2, 8);
  root.add(makeBridge(bFrom, bTo, lights, colliders));
  const small = new Group();
  const sr = (th) => 8 * (0.9 + 0.15 * noise3(Math.cos(th) * 2, Math.sin(th) * 2, 9));
  const top = new Mesh(displace(new CylinderGeometry(8, 8, 0.6, 40, 1), 0.2, 0.5, 3), M.ground);
  small.add(top);
  small.add(new Mesh(buildCliff(sr, () => 0.2, 12, 4, 48, 14), M.cliff));
  small.position.set(50, 0, 8);
  small.add(makeTree(0, 0, 0.9, 41, lights, swingers, [], true).translateY(0.3 - groundHeight(0, 0)));
  root.add(small);

  // grass tufts at the edges (calm in the middle), flowers in drifts
  const tuftGeo = new ConeGeometry(0.06, 0.36, 4, 1).translate(0, 0.18, 0);
  const tuftTints = [new Color('#ffffff'), new Color('#e8f0c8'), new Color('#d6e6b0'), new Color('#f2e4b0')];
  root.add(scatterInstanced(tuftGeo, M.tuft, 2600, (r) => {
    const a = r() * 6.283, d = Math.sqrt(r()) * R;
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (!onIsland(x, z) || pathMask(x, z) > 0.1) return null;
    const cluster = noise3(x * 0.35, 1, z * 0.35);
    if (cluster < 0.45) return null;
    return { x, y: groundHeight(x, z) - 0.05, z, s: 0.5 + r() * 0.6, rx: (r() - 0.5) * 0.5, rz: (r() - 0.5) * 0.5 };
  }, 51, tuftTints));

  const flowerGeo = displace(new IcosahedronGeometry(0.11, 1), 0.02, 5, 1);
  root.add(scatterInstanced(flowerGeo, M.flower, 900, (r) => {
    const a = r() * 6.283, d = Math.sqrt(r()) * R;
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (!onIsland(x, z) || pathMask(x, z) > 0.05) return null;
    const drift = noise3(x * 0.22 + 7, 2, z * 0.22);
    if (drift < 0.56 + r() * 0.12) return null;
    return { x, y: groundHeight(x, z) + 0.12 + r() * 0.15, z, s: 0.8 + r() * 0.8, sy: 0.6 };
  }, 52, PAL.flowers));

  // waterfall off the north-west cliff (secret cave goes here in round 4)
  const fall = new Mesh(new CylinderGeometry(1.2, 1.6, 18, 12, 1, true), makeWatercolorMaterial({ lit: [new Color('#f4f0ff'), new Color('#a9b4dc')], rim: 0.8, wash: 0.25, side: 2 }));
  const fx = -17, fz = -15;
  fall.position.set(fx, groundHeight(fx, fz) - 9.5, fz);
  root.add(fall);

  const update = (t) => {
    for (const p of swingers) p.rotation.z = Math.sin(t * 1.3 + p.userData.ph) * 0.07, p.rotation.x = Math.cos(t * 1.1 + p.userData.ph) * 0.05;
  };

  // walkable floor: main island, bridge, small island. Returns null over the void.
  const bdir = new Vector3().subVectors(bTo, bFrom); const blen = bdir.length(); bdir.normalize();
  const floorAt = (x, z) => {
    let best = null;
    if (onIsland(x, z)) best = groundHeight(x, z);
    if (Math.hypot(x - 50, z - 8) < 7.3) best = Math.max(best ?? -1e9, 0.5);
    const t = ((x - bFrom.x) * bdir.x + (z - bFrom.z) * bdir.z) / blen;
    const lat = Math.abs((x - bFrom.x) * -bdir.z + (z - bFrom.z) * bdir.x);
    if (t >= -0.05 && t <= 1.05 && lat < 1.25) {
      const tt = Math.max(0, Math.min(1, t));
      best = Math.max(best ?? -1e9, bFrom.y + (bTo.y - bFrom.y) * tt - Math.sin(tt * Math.PI) * 1.0 + 0.06);
    }
    return best;
  };

  return { root, lights, colliders, stoneLanterns, update, floorAt, spawn: new Vector3(1, 0, 10) };
}
