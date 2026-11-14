// Whispering Hollow (round 8): the fourth zone, the dark island. An old rope bridge leads to it from the
// desert's sun terrace, behind the sun gate. It sits under its own storm cloud: in the dark only lights
// show colour (material.js uDark), so your two lanterns are the only light, and holding hands makes one
// bigger circle. Twisted bare trees, cold blue wisps, low fog, creaks and whispers.
// The quest (hollowquest.js): relight 3 lamp posts (hold hands at each), ring the two bells on opposite
// sides at the same moment (one of you at each), then stand together at the heart while the Lonely
// Shadow circles in, until it turns into fireflies. Shy shadows creep towards whoever is alone in the
// dark and dim their lantern. The island's star waits on a mossy boulder you jump onto, and the secret
// is a crooked little house whose music box only plays when you both stand inside.
// Built in local coordinates around HOLLOW_C (the group sits there): positions are local unless they say "world".
import {
  Group, Mesh, BufferGeometry, Float32BufferAttribute, CylinderGeometry, IcosahedronGeometry, SphereGeometry,
  ConeGeometry, BoxGeometry, CircleGeometry, TorusGeometry, PlaneGeometry, Vector3, Vector2, TubeGeometry,
  CatmullRomCurve3, InstancedMesh, LatheGeometry,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { PAL } from '../look/palette.js';
import { makeWatercolorMaterial, makeGlowMaterial, makeSoftMaterial } from '../look/material.js';
import { rng, fbm2, noise3 } from './rng.js';
import { displace, setMix } from './shapes.js';

export const HOLLOW_C = new Vector3(85, 0, -150); // island centre (world)
const R = 22;            // island radius
const TOP = 2.2;         // height of the ground
const ARRIVE_TH = Math.atan2(-135 - HOLLOW_C.z, 25 - HOLLOW_C.x); // towards the desert (west)
const PEAK_TH = Math.atan2(-85 - HOLLOW_C.z, 100 - HOLLOW_C.x);   // towards the snowy peak (round 9, south)
export const DARK_R = R + 3; // radius of the darkness (material.js uDark)

const sm = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const edgeR = (th) => R * (0.9 + 0.1 * noise3(Math.cos(th) * 1.7 + 9, Math.sin(th) * 1.7, 2.1) + 0.05 * Math.sin(th * 4 + 0.7));
const around = (th, r, c = { x: 0, z: 0 }) => ({ x: c.x + Math.cos(th) * r, z: c.z + Math.sin(th) * r });
function distSeg(x, z, a, b) {
  const abx = b.x - a.x, abz = b.z - a.z;
  const t = Math.max(0, Math.min(1, ((x - a.x) * abx + (z - a.z) * abz) / (abx * abx + abz * abz)));
  return Math.hypot(x - (a.x + abx * t), z - (a.z + abz * t));
}
const P = (x, z) => ({ x, z });

// ---- the layout (local: +x east, +z south) ----
const ARRIVE = around(ARRIVE_TH, edgeR(ARRIVE_TH) * 0.9);
const EXIT = around(PEAK_TH, edgeR(PEAK_TH) * 0.88);       // where the fireflies lead (the peak's bridge, round 9)
const HEART = P(0, 0), HEART_R = 3.2;                       // the stone ring where the Lonely Shadow comes
const BIGTREE = P(0.5, -6.8);                               // the great hollow tree behind the heart
export const LAMPS = [P(-10.5, 8.5), P(-6, -12.5), P(11.5, -7)];
export const BELLS = [P(-16, -5), P(15.5, 4.5)];            // opposite sides: one of you at each
const HOUSE = P(-8.5, 15.2), HOUSE_YAW = -0.5;              // the crooked house (its door faces the heart)
const HOUSE_W = 4.0, HOUSE_D = 3.4;
const LEDGE = P(14.5, 12.5), LEDGE_R = 1.25, LEDGE_H = 1.25; // the mossy boulder with the star on top
const WAY = [P(-14.5, 5.0)];                                // the waystone just past the bridge
const PATHS = [
  [ARRIVE, P(-12, 6.2), 1.5], [P(-12, 6.2), HEART, 1.4], [HEART, LAMPS[1], 1.2], [HEART, P(7, -4), 1.2], [P(7, -4), LAMPS[2], 1.2],
  [P(-6, -2.5), BELLS[0], 1.1], [P(7, -4), BELLS[1], 1.1], [HEART, EXIT, 1.2], [P(-12, 6.2), LAMPS[0], 1.0],
];
const CLEAR = [[HEART, HEART_R + 2.5], [BIGTREE, 3.4], ...LAMPS.map((l) => [l, 2.6]), ...BELLS.map((b) => [b, 2.6]),
  [HOUSE, 4.4], [LEDGE, 2.6], [ARRIVE, 3.5], [EXIT, 3.0], [WAY[0], 2.2]];

function flatMask(x, z) {
  let f = 0;
  for (const [a, b, w] of PATHS) f = Math.max(f, 1 - sm(w, w + 1.5, distSeg(x, z, a, b)));
  for (const [c, r] of CLEAR) f = Math.max(f, 1 - sm(r * 0.7, r + 0.8, Math.hypot(x - c.x, z - c.z)));
  return f;
}
function stoneMask(x, z) {
  let f = 0;
  for (const [a, b, w] of PATHS) f = Math.max(f, 1 - sm(w * 0.4, w * 0.85, distSeg(x, z, a, b) + (noise3(x * 0.5, 4, z * 0.5) - 0.5) * 0.9));
  f = Math.max(f, 1 - sm(HEART_R - 0.3, HEART_R + 0.4, Math.hypot(x - HEART.x, z - HEART.z) + (noise3(x * 0.4, 7, z * 0.4) - 0.5) * 0.6));
  return f;
}

/** ground height (local): low mossy bumps and roots, calm along the paths and in the clearings */
export function hollowGround(x, z) {
  const r = Math.hypot(x, z), er = edgeR(Math.atan2(z, x));
  const bump = (fbm2(x * 0.07 - 5, z * 0.07 + 3) - 0.45) * 2.2;
  let h = TOP + Math.max(-0.3, bump) * (1 - flatMask(x, z));
  h -= sm(er * 0.86, er, r) * 1.0;
  return h;
}
const onHollow = (x, z) => Math.hypot(x, z) < edgeR(Math.atan2(z, x)) * 0.97;

function buildTop() {
  const SEG = 120, RINGS = 46;
  const pos = [], idx = [];
  pos.push(0, hollowGround(0, 0), 0);
  for (let i = 1; i <= RINGS; i++) {
    const f = i / RINGS;
    for (let s = 0; s < SEG; s++) {
      const th = (s / SEG) * Math.PI * 2, r = edgeR(th) * Math.pow(f, 0.85);
      const x = Math.cos(th) * r, z = Math.sin(th) * r;
      pos.push(x, hollowGround(x, z), z);
    }
  }
  for (let s = 0; s < SEG; s++) idx.push(0, 1 + ((s + 1) % SEG), 1 + s);
  for (let i = 1; i < RINGS; i++) {
    const a = 1 + (i - 1) * SEG, b = 1 + i * SEG;
    for (let s = 0; s < SEG; s++) { const s1 = (s + 1) % SEG; idx.push(a + s, a + s1, b + s, a + s1, b + s1, b + s); }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  setMix(g, (x, y, z) => stoneMask(x, z));
  return g;
}

let HM = null;
function hollowMats(M) {
  if (HM) return HM;
  HM = {
    ...M,
    ground: makeWatercolorMaterial({ lit: PAL.moor, lit2: PAL.mossPath, mix: true, rim: 0.0, wash: 0.22 }),
    cliff: makeWatercolorMaterial({ lit: PAL.bark, lit2: PAL.moor, mix: true, rim: 0.4 }),
    bark: makeWatercolorMaterial({ lit: PAL.bark, rim: 0.45, wash: 0.2 }),
    stone: makeWatercolorMaterial({ lit: PAL.mossPath, rim: 0.35, wash: 0.18 }),
    mossy: makeWatercolorMaterial({ lit: PAL.moor, rim: 0.3, wash: 0.2 }),
    lip: makeWatercolorMaterial({ lit: PAL.moor, lit2: PAL.hollowMoss, mix: true, rim: 0.3, wash: 0.22 }),
    vine: makeWatercolorMaterial({ lit: PAL.hollowMoss, rim: 0.5, wash: 0.22 }),
    roof: makeWatercolorMaterial({ lit: PAL.roof, rim: 0.4, wash: 0.2 }),
    brass: makeWatercolorMaterial({ lit: PAL.brass, rim: 0.6, wash: 0.1 }),
    shy: makeWatercolorMaterial({ lit: PAL.shy, rim: 0.7, wash: 0.1, lightRecv: 0.4, darkRecv: 0.3 }),
    cloud: makeWatercolorMaterial({ lit: [PAL.mossPath[1], PAL.moor[1]], rim: 0.3, wash: 0.08, lightRecv: 0 }),
    rope: makeWatercolorMaterial({ lit: PAL.bark, rim: 0.3 }),
    eyes: makeGlowMaterial(PAL.wispCore, PAL.wispHalo, 1.1),
    wisp: makeGlowMaterial(PAL.wispCore, PAL.wispHalo, 1.0),
    fly: makeGlowMaterial(PAL.flyCore, PAL.flyHalo, 1.2),
    fog: makeSoftMaterial(PAL.shy[0], 0.3),
  };
  return HM;
}

/** a twisted bare tree: a bent trunk and a few crooked branches (local origin at its foot) */
function twistedTree(r, M, h = 4.5) {
  const parts = [];
  const lean = (r() - 0.5) * 0.9, turn = r() * 6.28;
  const pts = [];
  for (let i = 0; i <= 5; i++) {
    const k = i / 5;
    pts.push(new Vector3(Math.cos(turn) * lean * k * k * 1.6 + Math.sin(k * 5 + turn) * 0.25 * k, k * h, Math.sin(turn) * lean * k * k * 1.6 + Math.cos(k * 4 + turn) * 0.25 * k));
  }
  const trunkCurve = new CatmullRomCurve3(pts);
  const trunk = new TubeGeometry(trunkCurve, 14, 0.28, 6);
  // taper: squeeze the tube's rings towards the top
  const pa = trunk.attributes.position;
  for (let i = 0; i < pa.count; i++) {
    const y = pa.getY(i), k = Math.max(0, Math.min(1, y / h)), c = trunkCurve.getPoint(k);
    const s = 1.25 - k * 0.85;
    pa.setXYZ(i, c.x + (pa.getX(i) - c.x) * s, y, c.z + (pa.getZ(i) - c.z) * s);
  }
  trunk.computeVertexNormals();
  parts.push(displace(trunk, 0.04, 2.5, Math.floor(r() * 99)));
  const nb = 3 + Math.floor(r() * 3);
  for (let b = 0; b < nb; b++) {
    const k0 = 0.45 + r() * 0.45, base = trunkCurve.getPoint(k0), a = r() * 6.28, len = 1.2 + r() * 1.6;
    const bp = [base.clone()];
    for (let i = 1; i <= 3; i++) {
      const k = i / 3;
      bp.push(new Vector3(base.x + Math.cos(a) * len * k + Math.sin(k * 4 + a) * 0.2, base.y + len * 0.55 * k - (k * k) * 0.25 + (r() - 0.5) * 0.25, base.z + Math.sin(a) * len * k + Math.cos(k * 3 + a) * 0.2));
    }
    parts.push(new TubeGeometry(new CatmullRomCurve3(bp), 6, 0.09 * (1.2 - k0 * 0.6), 5));
  }
  // roots
  for (let i = 0; i < 3; i++) {
    const a = turn + i * 2.1 + r() * 0.5;
    parts.push(new TubeGeometry(new CatmullRomCurve3([new Vector3(0, 0.5, 0), new Vector3(Math.cos(a) * 0.55, 0.12, Math.sin(a) * 0.55), new Vector3(Math.cos(a) * 1.0, -0.1, Math.sin(a) * 1.0)]), 5, 0.11, 5));
  }
  const clean = (geo) => { const n = geo.index ? geo.toNonIndexed() : geo; for (const k of Object.keys(n.attributes)) if (k !== 'position' && k !== 'normal') n.deleteAttribute(k); return n; };
  return new Mesh(mergeGeometries(parts.map(clean)), M.bark);
}

/** a shy shadow: a soft indigo blob with a wispy tail and two pale eyes */
export function makeShadowCreature(M, scale = 1) {
  const g = new Group();
  const body = new Mesh(displace(new SphereGeometry(0.5, 16, 12), 0.05, 2.0, 3), M.shy);
  body.scale.set(1, 1.08, 0.92);
  g.add(body);
  const tail = new Mesh(displace(new ConeGeometry(0.42, 0.9, 12, 3, true), 0.06, 2.2, 5), M.shy);
  tail.rotation.x = Math.PI; tail.position.y = -0.62;
  g.add(tail);
  const eyes = new Group();
  for (const s of [-1, 1]) {
    const e = new Mesh(new SphereGeometry(0.075, 10, 8), M.eyes);
    e.scale.set(1, 1.35, 0.6);
    e.position.set(s * 0.17, 0.1, 0.43);
    eyes.add(e);
  }
  g.add(eyes);
  g.scale.setScalar(scale);
  g.userData.dynamic = true;
  return { group: g, body, tail, eyes };
}

/**
 * Build Whispering Hollow into ctx.root. ctx carries the forest's shared pieces:
 * { root, lights, colliders, bridges, M, makeBridge, makeRock, makeWaystone, buildCliff, scatter }
 */
export function buildHollow(ctx, desert) {
  const { root, lights, colliders } = ctx;
  const M = hollowMats(ctx.M);
  const g = new Group();
  g.position.copy(HOLLOW_C);
  root.add(g);
  const W = (x, z) => ({ x: x + HOLLOW_C.x, z: z + HOLLOW_C.z }); // local -> world
  const addCol = (x, z, r, top) => { const w = W(x, z); const c = { x: w.x, z: w.z, r }; if (top !== undefined) c.top = top; colliders.push(c); return c; };
  const addSeg = (a, b, r) => { const wa = W(a.x, a.z), wb = W(b.x, b.z); const c = { ax: wa.x, az: wa.z, bx: wb.x, bz: wb.z, r }; colliders.push(c); return c; };
  const gy = hollowGround;
  const wv = (x, z, dy = 0) => { const w = W(x, z); return new Vector3(w.x, gy(x, z) + dy, w.z); };

  // ---- the island ----
  g.add(new Mesh(buildTop(), M.ground));
  g.add(new Mesh(ctx.buildCliff(edgeR, hollowGround, 22, 47), M.cliff));
  g.add(ctx.buildEdge(edgeR, hollowGround, 22, 47, 160, 46, { lip: M.lip, vine: M.vine, vines: 90, vineLen: 1.3, leaf: 4 })); // long trailing moss

  // ---- the storm cloud overhead: a slow lid of dark puffs ----
  const cloud = new Group();
  const cr = rng(811);
  const puffGeo = displace(new IcosahedronGeometry(1, 2), 0.12, 1.4, 4);
  for (let i = 0; i < 26; i++) {
    const a = cr() * 6.283, d = Math.sqrt(cr()) * (R - 1);
    const p = new Mesh(puffGeo, M.cloud);
    const s = 4 + cr() * 4.5;
    p.scale.set(s * 1.35, s * 0.55, s);
    p.position.set(Math.cos(a) * d, 20 + cr() * 4 + (d / R) * -2, Math.sin(a) * d);
    cloud.add(p);
  }
  cloud.userData.dynamic = true; // it drifts and turns, very slowly
  g.add(cloud);

  // ---- twisted bare trees, kept off the paths and the clearings ----
  const tr = rng(823);
  const trees = [];
  for (let n = 0; n < 400 && trees.length < 26; n++) {
    const a = tr() * 6.283, d = 4 + Math.sqrt(tr()) * (R - 5);
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (!onHollow(x, z) || Math.hypot(x, z) > edgeR(a) * 0.86 || flatMask(x, z) > 0.15) continue;
    if (trees.some((t) => Math.hypot(t.x - x, t.z - z) < 3.6)) continue;
    const t = twistedTree(tr, M, 3.6 + tr() * 2.4);
    t.position.set(x, gy(x, z) - 0.1, z);
    t.rotation.y = tr() * 6.28;
    t.userData.occluder = true;
    g.add(t);
    addCol(x, z, 0.38);
    trees.push({ x, z, obj: t });
  }
  // the great hollow tree behind the heart: huge, split, with a dark hole where the island got its name
  {
    const big = twistedTree(rng(831), M, 7.5);
    big.scale.set(2.3, 1.15, 2.3);
    big.position.set(BIGTREE.x, gy(BIGTREE.x, BIGTREE.z) - 0.2, BIGTREE.z);
    g.add(big);
    const hole = new Mesh(new SphereGeometry(0.62, 12, 10), M.shy);
    hole.scale.set(0.8, 1.3, 0.35);
    hole.position.set(BIGTREE.x, gy(BIGTREE.x, BIGTREE.z) + 1.2, BIGTREE.z + 0.6);
    g.add(hole);
    addCol(BIGTREE.x, BIGTREE.z, 0.95);
  }

  // ---- rocks, stumps and old fence posts ----
  const rr = rng(845);
  for (let n = 0; n < 160; n++) {
    const a = rr() * 6.283, d = Math.sqrt(rr()) * (R - 2);
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (!onHollow(x, z) || flatMask(x, z) > 0.3 || trees.some((t) => Math.hypot(t.x - x, t.z - z) < 1.6)) continue;
    if (rr() < 0.75) continue;
    const s = 0.3 + rr() * 0.5;
    const rock = new Mesh(displace(new IcosahedronGeometry(1, 1), 0.16, 1.4, n), M.stone);
    rock.scale.set(s * 1.2, s * 0.6, s);
    rock.position.set(x, gy(x, z) + s * 0.1, z);
    rock.rotation.y = rr() * 6;
    g.add(rock);
    if (s > 0.55) addCol(x, z, s * 0.75);
  }
  // a broken fence leaning along the arrival path
  for (let i = 0; i < 6; i++) {
    const k = 0.15 + i * 0.11, x = ARRIVE.x + (-12 - ARRIVE.x) * k, z = ARRIVE.z + (6.2 - ARRIVE.z) * k - 2.1;
    const post = new Mesh(displace(new BoxGeometry(0.14, 1.1, 0.14, 1, 3, 1), 0.02, 3, i), M.bark);
    post.position.set(x, gy(x, z) + 0.45, z);
    post.rotation.z = (i % 2 ? 0.18 : -0.12); post.rotation.x = 0.1 * (i % 3 - 1);
    g.add(post);
  }

  // ---- the heart: a ring of flat stones round a carved centre stone ----
  const hy = gy(HEART.x, HEART.z);
  const heartStone = new Mesh(displace(new CylinderGeometry(0.9, 1.05, 0.3, 16, 1), 0.03, 3, 2), M.stone);
  heartStone.position.set(HEART.x, hy + 0.05, HEART.z);
  g.add(heartStone);
  const heartRing = new Mesh(new TorusGeometry(0.62, 0.05, 6, 32).rotateX(-Math.PI / 2), makeGlowMaterial(PAL.wispCore, PAL.wispHalo, 0.5));
  heartRing.position.set(HEART.x, hy + 0.22, HEART.z);
  heartRing.userData.dynamic = true;
  g.add(heartRing);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * 6.283 + 0.2, p = around(a, HEART_R + 0.4, HEART);
    const st = new Mesh(displace(new BoxGeometry(0.7, 0.5, 0.45, 2, 2, 2), 0.05, 2, i), M.stone);
    st.position.set(p.x, gy(p.x, p.z) + 0.1, p.z);
    st.rotation.y = -a; st.rotation.z = (i % 3 - 1) * 0.12;
    g.add(st);
  }

  // ---- the lamp posts: crooked iron-wood posts with a lantern cage; dark until you relight them together ----
  const lamps = LAMPS.map((L, i) => {
    const y = gy(L.x, L.z);
    const grp = new Group();
    grp.position.set(L.x, y, L.z);
    const post = new Mesh(displace(new CylinderGeometry(0.1, 0.16, 2.6, 7, 4), 0.025, 3, i), M.bark);
    post.position.y = 1.3; post.rotation.z = (i - 1) * 0.06;
    grp.add(post);
    const arm = new Mesh(new CylinderGeometry(0.05, 0.06, 0.8, 5), M.bark);
    arm.rotation.z = Math.PI / 2; arm.position.set(0.32, 2.45, 0);
    grp.add(arm);
    for (let k = 0; k < 4; k++) { // an open cage of four thin bars, so the flame shows from every side
      const a = k * Math.PI / 2 + 0.4;
      const bar = new Mesh(new CylinderGeometry(0.022, 0.022, 0.5, 4), M.bark);
      bar.position.set(0.68 + Math.cos(a) * 0.24, 2.05, Math.sin(a) * 0.24);
      grp.add(bar);
    }
    const base = new Mesh(new CylinderGeometry(0.26, 0.2, 0.06, 8), M.bark);
    base.position.set(0.68, 1.8, 0);
    grp.add(base);
    const capM = new Mesh(new ConeGeometry(0.3, 0.25, 6), M.bark);
    capM.position.set(0.68, 2.42, 0);
    grp.add(capM);
    const flameMat = makeGlowMaterial(PAL.glowCore, PAL.glowHalo, 0.5);
    const flame = new Mesh(new SphereGeometry(0.17, 12, 10), flameMat);
    flame.position.set(0.68, 2.03, 0);
    flame.userData.dynamic = true;
    grp.add(flame);
    const ringMat = makeGlowMaterial(PAL.glowCore, PAL.glowHalo, 0.5);
    const ring = new Mesh(new TorusGeometry(1.5, 0.045, 6, 40).rotateX(-Math.PI / 2), ringMat);
    ring.position.y = 0.08; ring.userData.dynamic = true;
    grp.add(ring);
    g.add(grp);
    addCol(L.x, L.z, 0.22);
    const light = { obj: flame, str: 0 };
    lights.push(light);
    const pos = wv(L.x, L.z);
    return { pos, flame, flameMat, ring, ringMat, light, lit: false, head: wv(L.x + 0.68, L.z, 2.0) };
  });

  // ---- the bells: a wooden frame with a brass bell over a round stone to stand on ----
  const bellGeo = (() => {
    const pts = [];
    for (let i = 0; i <= 12; i++) { const k = i / 12; pts.push(new Vector2(0.06 + 0.5 * Math.pow(k, 1.8) + 0.05 * Math.sin(k * 3.1), 0.9 - k * 0.9)); }
    return new LatheGeometry(pts, 18);
  })();
  const bells = BELLS.map((B, i) => {
    const y = gy(B.x, B.z), face = Math.atan2(-B.z, -B.x); // the frame faces the heart
    const grp = new Group();
    grp.position.set(B.x, y, B.z);
    grp.rotation.y = -face + Math.PI / 2;
    for (const s of [-1, 1]) {
      const post = new Mesh(displace(new BoxGeometry(0.2, 3.0, 0.2, 1, 4, 1), 0.02, 3, i * 3 + s), M.bark);
      post.position.set(s * 1.25, 1.45, -1.0); post.rotation.z = s * -0.05;
      grp.add(post);
    }
    const beam = new Mesh(displace(new BoxGeometry(2.9, 0.22, 0.24, 4, 1, 1), 0.02, 3, i), M.bark);
    beam.position.set(0, 2.95, -1.0);
    grp.add(beam);
    const swing = new Group(); // the bell hangs from the beam and swings when rung
    swing.position.set(0, 2.85, -1.0);
    swing.userData.dynamic = true;
    const bell = new Mesh(bellGeo, M.brass);
    bell.position.y = -0.95;
    swing.add(bell);
    const clap = new Mesh(new SphereGeometry(0.09, 8, 6), M.bark);
    clap.position.y = -0.95;
    swing.add(clap);
    grp.add(swing);
    const plate = new Mesh(displace(new CylinderGeometry(1.05, 1.15, 0.18, 20, 1), 0.02, 3, i), M.stone);
    plate.position.set(0, 0.04, 0.3);
    grp.add(plate);
    const ringMat = makeGlowMaterial(PAL.wispCore, PAL.wispHalo, 0.55);
    const ring = new Mesh(new TorusGeometry(0.85, 0.04, 6, 36).rotateX(-Math.PI / 2), ringMat);
    ring.position.set(0, 0.16, 0.3); ring.userData.dynamic = true;
    grp.add(ring);
    g.add(grp);
    // colliders for the two posts (world)
    for (const s of [-1, 1]) {
      const lx = s * 1.25, lz = -1.0, c = Math.cos(grp.rotation.y), sn = Math.sin(grp.rotation.y);
      addCol(B.x + lx * c + lz * sn, B.z - lx * sn + lz * c, 0.18);
    }
    const c = Math.cos(grp.rotation.y), sn = Math.sin(grp.rotation.y);
    const plateL = { x: B.x + 0.3 * sn, z: B.z + 0.3 * c };
    return { swing, ring, ringMat, plate: wv(plateL.x, plateL.z), pos: wv(B.x, B.z, 2.2), yaw: grp.rotation.y };
  });

  // ---- the crooked house (the secret): leaning walls, a sagging roof, a lit window, a music box inside ----
  const house = new Group();
  const hY = gy(HOUSE.x, HOUSE.z);
  house.position.set(HOUSE.x, hY, HOUSE.z);
  house.rotation.y = HOUSE_YAW;
  const wallGeo = displace(new BoxGeometry(1, 1, 1, 3, 3, 1), 0.02, 2.4, 7);
  const wall = (x, z, w, d, h, lean = 0) => {
    const m = new Mesh(wallGeo, M.bark);
    m.scale.set(w, h, d); m.position.set(x, h / 2 - 0.1, z); m.rotation.z = lean;
    m.userData.occluder = true; // the camera steps in front of the walls
    house.add(m);
    return m;
  };
  const hw = HOUSE_W / 2, hd = HOUSE_D / 2, T = 0.2;
  wall(0, hd, HOUSE_W, T, 2.4, 0.04);            // back
  wall(-hw, 0, T, HOUSE_D, 2.3, 0.05);           // west
  wall(hw, 0, T, HOUSE_D, 2.5, -0.03);           // east
  wall(-hw + 0.75, -hd, 1.5, T, 2.35, 0.03);     // front, left of the door
  wall(hw - 0.75, -hd, 1.5, T, 2.45, -0.02);     // front, right of the door
  const lintel = new Mesh(wallGeo, M.bark); lintel.scale.set(1.2, 0.5, T); lintel.position.set(0, 2.1, -hd); lintel.rotation.z = 0.08; house.add(lintel);
  const roofs = []; // lifted away while you're inside, so the camera can look in
  for (const s of [-1, 1]) {
    const roof = new Mesh(displace(new BoxGeometry(1, 1, 1, 3, 1, 3), 0.03, 2, 9 + s), M.roof);
    roof.userData.dynamic = true; roofs.push(roof);
    roof.scale.set(HOUSE_W * 0.62, 0.16, HOUSE_D + 0.7);
    roof.position.set(s * HOUSE_W * 0.26, 2.75 + (s > 0 ? 0.12 : 0), 0);
    roof.rotation.z = -s * 0.62 + 0.06;
    roof.userData.occluder = true;
    house.add(roof);
  }
  const chimney = new Mesh(wallGeo, M.stone); chimney.scale.set(0.45, 1.1, 0.45); chimney.position.set(1.1, 3.1, 0.7); chimney.rotation.z = -0.12; house.add(chimney);
  chimney.userData.dynamic = true; roofs.push(chimney);
  const windowGlow = new Mesh(new PlaneGeometry(0.55, 0.5), makeGlowMaterial(PAL.glowCore, PAL.glowHalo, 0.55));
  windowGlow.position.set(hw + 0.11, 1.45, -0.3); windowGlow.rotation.y = Math.PI / 2;
  house.add(windowGlow);
  // inside: a little table and the music box
  const table = new Mesh(displace(new CylinderGeometry(0.45, 0.4, 0.75, 10), 0.02, 3, 4), M.bark);
  table.position.set(0, 0.37, 0.7); house.add(table);
  const box = new Mesh(displace(new BoxGeometry(0.42, 0.22, 0.3, 2, 1, 2), 0.01, 3, 5), M.roof);
  box.position.set(0, 0.86, 0.7); house.add(box);
  const lid = new Mesh(new BoxGeometry(0.42, 0.03, 0.3), M.roof);
  lid.position.set(0, 1.06, 0.88); lid.rotation.x = -1.1; lid.userData.dynamic = true; house.add(lid);
  const dancerMat = makeGlowMaterial(PAL.flyCore, PAL.flyHalo, 0.5);
  const dancer = new Mesh(new ConeGeometry(0.05, 0.16, 8), dancerMat);
  dancer.position.set(0, 1.05, 0.7); dancer.userData.dynamic = true; house.add(dancer);
  g.add(house);
  // house colliders: walls as segments (world)
  const hc = Math.cos(HOUSE_YAW), hs = Math.sin(HOUSE_YAW);
  const HL = (x, z) => P(HOUSE.x + x * hc + z * hs, HOUSE.z - x * hs + z * hc);
  for (const [a, b] of [[[-hw, hd], [hw, hd]], [[-hw, -hd], [-hw, hd]], [[hw, -hd], [hw, hd]], [[-hw, -hd], [-0.55, -hd]], [[0.55, -hd], [hw, -hd]], [[0, 0.7], [0, 0.71]]]) {
    addSeg(HL(a[0], a[1]), HL(b[0], b[1]), a[0] === 0 ? 0.45 : 0.16);
  }
  const houseIn = (x, z) => { const dx = x - HOUSE.x, dz = z - HOUSE.z; const lx = dx * hc - dz * hs, lz = dx * hs + dz * hc; return Math.abs(lx) < hw - 0.25 && Math.abs(lz) < hd - 0.2; };
  const houseDoor = HL(0, -hd - 1.3), houseInside = HL(0, -0.35);

  // ---- the star's mossy boulder: too tall to walk onto, you jump up ----
  const ledgeY = gy(LEDGE.x, LEDGE.z) + LEDGE_H;
  {
    const b = new Mesh(displace(new CylinderGeometry(LEDGE_R * 0.95, LEDGE_R * 1.15, LEDGE_H + 0.4, 14, 3), 0.08, 1.6, 6), M.stone);
    b.position.set(LEDGE.x, ledgeY - (LEDGE_H + 0.4) / 2, LEDGE.z);
    g.add(b);
    const moss = new Mesh(displace(new CylinderGeometry(LEDGE_R * 0.9, LEDGE_R * 0.95, 0.08, 14, 1), 0.03, 2, 7), M.mossy);
    moss.position.set(LEDGE.x, ledgeY, LEDGE.z);
    g.add(moss);
    addCol(LEDGE.x, LEDGE.z, LEDGE_R - 0.15, ledgeY);
    // a low step stone beside it, so it reads as climbable
    const step = new Mesh(displace(new IcosahedronGeometry(0.5, 1), 0.08, 2, 8), M.stone);
    step.scale.set(1, 0.45, 0.9); step.position.set(LEDGE.x - 1.9, gy(LEDGE.x - 1.9, LEDGE.z) + 0.1, LEDGE.z + 0.3);
    g.add(step);
  }
  const starPos = new Vector3(LEDGE.x + HOLLOW_C.x, ledgeY + 1.0, LEDGE.z + HOLLOW_C.z);

  // ---- cold blue wisps drifting between the trees (each a small light) ----
  const wr = rng(861);
  const wisps = [];
  for (let i = 0; i < 7; i++) {
    const t = trees[(i * 3 + 1) % trees.length];
    const m = new Mesh(new SphereGeometry(0.11, 10, 8), M.wisp);
    m.userData.dynamic = true;
    const home = new Vector3(t.x + (wr() - 0.5) * 2, gy(t.x, t.z) + 1.4 + wr() * 1.2, t.z + (wr() - 0.5) * 2);
    m.position.copy(home);
    g.add(m);
    lights.push({ obj: m, str: 0.22 });
    wisps.push({ m, home, ph: wr() * 6.28 });
  }

  // ---- glowing toadstools along the paths: little blue lights to find your way by ----
  const toadGeo = mergeGeometries([new CylinderGeometry(0.03, 0.04, 0.16, 5).translate(0, 0.08, 0), new SphereGeometry(0.08, 8, 5, 0, 6.283, 0, 1.6).scale(1, 0.6, 1).translate(0, 0.16, 0)]);
  const toadMat = makeGlowMaterial(PAL.wispCore, PAL.wispHalo, 0.6);
  const tr2 = rng(873);
  const toadPts = [];
  for (const [a, b] of PATHS) {
    const len = Math.hypot(b.x - a.x, b.z - a.z), n = Math.floor(len / 3.2);
    for (let i = 1; i < n; i++) {
      const k = i / n, side = tr2() < 0.5 ? -1 : 1, nx = -(b.z - a.z) / len, nz = (b.x - a.x) / len;
      const x = a.x + (b.x - a.x) * k + nx * side * (1.6 + tr2() * 0.5), z = a.z + (b.z - a.z) * k + nz * side * (1.6 + tr2() * 0.5);
      if (!onHollow(x, z) || tr2() < 0.35) continue;
      toadPts.push([x, gy(x, z) - 0.02, z, 0.8 + tr2() * 0.7]);
    }
  }
  const toads = new InstancedMesh(toadGeo, toadMat, toadPts.length);
  {
    const m = new Mesh(); // a throwaway object to compose matrices
    toadPts.forEach(([x, y, z, s], i) => { m.position.set(x, y, z); m.scale.setScalar(s); m.rotation.y = i; m.updateMatrix(); toads.setMatrixAt(i, m.matrix); });
  }
  g.add(toads);

  // ---- low fog drifting over the ground (one instanced draw of soft billboards) ----
  const FOG_N = 46;
  const fog = new InstancedMesh(new PlaneGeometry(1, 1), M.fog, FOG_N);
  fog.frustumCulled = false; fog.renderOrder = 3; fog.userData.dynamic = true;
  const fr = rng(887);
  const fogs = Array.from({ length: FOG_N }, () => { const a = fr() * 6.283, d = Math.sqrt(fr()) * (R - 2); return { x: Math.cos(a) * d, z: Math.sin(a) * d, y: 0.25 + fr() * 0.7, s: 2.5 + fr() * 3.5, sp: 0.15 + fr() * 0.25, ph: fr() * 6.28 }; });
  g.add(fog);

  // ---- the shy shadows and the Lonely Shadow ----
  const shadowN = 5;
  const sr = rng(899);
  const shadowHomes = [];
  for (let n = 0; n < 200 && shadowHomes.length < shadowN; n++) {
    const a = sr() * 6.283, d = 6 + sr() * (R - 9), x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (!onHollow(x, z) || LAMPS.some((l) => Math.hypot(l.x - x, l.z - z) < 7.5) || Math.hypot(x - ARRIVE.x, z - ARRIVE.z) < 8) continue;
    if (shadowHomes.some((h) => Math.hypot(h.x - x, h.z - z) < 7)) continue;
    shadowHomes.push(P(x, z));
  }
  const shadows = shadowHomes.map((h) => { const c = makeShadowCreature(M, 0.9); c.group.position.set(h.x, gy(h.x, h.z) + 1.0, h.z); g.add(c.group); return c; });
  const lonely = makeShadowCreature(M, 2.3);
  lonely.group.visible = false;
  g.add(lonely.group);

  // ---- fireflies: they wait to be born from the Lonely Shadow, then light the way out ----
  const FLY_N = 60;
  const flies = new InstancedMesh(new SphereGeometry(0.07, 6, 5), M.fly, FLY_N);
  flies.frustumCulled = false; flies.visible = false; flies.userData.dynamic = true;
  g.add(flies);

  // ---- the old rope bridge from the desert's sun terrace (rises when the little sun is home) ----
  const he = desert.hollowEnd;
  const bFrom = new Vector3(he.x, he.y + 0.05, he.z);
  const aw = W(ARRIVE.x, ARRIVE.z);
  const bTo = new Vector3(aw.x, gy(ARRIVE.x, ARRIVE.z) + 0.05, aw.z);
  const bridge = ctx.makeBridge(bFrom, bTo, lights, colliders, 1.6, { plank: M.bark, post: M.bark, rope: M.rope });
  bridge.group.userData.dynamic = true;
  bridge.setRise(0);
  root.add(bridge.group);
  ctx.bridges.push(bridge.data);

  // the waystone checkpoint just past the bridge
  const wp = W(WAY[0].x, WAY[0].z);
  const way = ctx.makeWaystone(wp.x, wp.z, gy(WAY[0].x, WAY[0].z));
  root.add(way.obj);
  colliders.push({ x: wp.x + 1.25, z: wp.z, r: 0.2 });

  // ---- walking ----
  const toL = (wx, wz) => [wx - HOLLOW_C.x, wz - HOLLOW_C.z];
  const near = (wx, wz) => Math.abs(wx - HOLLOW_C.x) < R + 2 && Math.abs(wz - HOLLOW_C.z) < R + 2;
  const structure = (x, z) => {
    if (Math.hypot(x - LEDGE.x, z - LEDGE.z) < LEDGE_R - 0.05) return ledgeY;
    const dh = Math.hypot(x - HEART.x, z - HEART.z);
    if (dh < 1.0) return hy + 0.2;
    return null;
  };
  const hollow = {
    root: g, bridge, cloud, lamps, bells, shadows, shadowHomes: shadowHomes.map((h) => wv(h.x, h.z)), lonely, flies, fog, fogs, wisps, heartRing,
    lid, dancer, dancerMat, roofs, toads, way, trees,
    center: HOLLOW_C.clone(), radius: R, darkR: DARK_R,
    heart: wv(HEART.x, HEART.z), heartR: HEART_R, starPos,
    arrive: wv(ARRIVE.x, ARRIVE.z), exit: wv(EXIT.x, EXIT.z),
    houseDoor: wv(houseDoor.x, houseDoor.z), houseAt: (x, z, dy = 0) => { const q = HL(x, z); return wv(q.x, q.z, dy); }, houseInside: wv(houseInside.x, houseInside.z), houseWorld: wv(HOUSE.x, HOUSE.z),
    ledge: wv(LEDGE.x, LEDGE.z), ledgeTop: ledgeY, ledgeStep: wv(LEDGE.x - 2.6, LEDGE.z),
    /** walkable floor at world x,z from the Hollow (null = not here) */
    floor(wx, wz) {
      if (!near(wx, wz)) return null;
      const [x, z] = toL(wx, wz);
      if (!onHollow(x, z)) return null;
      const s = structure(x, z);
      return s === null ? gy(x, z) : Math.max(s, gy(x, z));
    },
    onIsland(p) { if (!near(p.x, p.z)) return false; const [x, z] = toL(p.x, p.z); return onHollow(x, z) && Math.abs(p.y - gy(x, z)) < 2; },
    /** 0 outside .. 1 deep inside the dark (by position only) */
    darkAt(p) { const d = Math.hypot(p.x - HOLLOW_C.x, p.z - HOLLOW_C.z); return 1 - sm(DARK_R - 5, DARK_R + 5, d); },
    inHouse(p) { const [x, z] = toL(p.x, p.z); return houseIn(x, z) && Math.abs(p.y - hY) < 1.5; },
    surface(p) {
      if (!near(p.x, p.z)) return null;
      const [x, z] = toL(p.x, p.z);
      if (!onHollow(x, z)) return null;
      if (houseIn(x, z)) return 'wood';
      return stoneMask(x, z) > 0.5 || structure(x, z) !== null ? 'path' : 'grass';
    },
    toWorld: W,
    groundY: (wx, wz) => { const [x, z] = toL(wx, wz); return gy(x, z); },
  };
  return hollow;
}
