// Sunset Desert Ruins (round 7): the third zone, across a sandstone bridge from Crystal Lake's
// north-east shore. A round island of dunes and ruined sandstone walls. An old city wall runs right
// across it: the south half (the bridge, the sun spirit's nest, the hidden oasis) and the north half
// (the sundial plaza) only meet through the Windy Pass, a walled canyon where sand gusts blow down
// every few seconds. Three wall stubs in the pass give shelter. East of the plaza, the sun gate in the
// terrace wall opens when the spirit is home; the island's star waits on the terrace behind it (and,
// in round 8, the old rope bridge to the Hollow will leave from there).
// Built in local coordinates around DESERT_C (the group sits there): positions are local unless they
// say "world". The quest logic lives in desertquest.js.
import {
  Group, Mesh, BufferGeometry, Float32BufferAttribute, CylinderGeometry, IcosahedronGeometry, SphereGeometry,
  ConeGeometry, BoxGeometry, CircleGeometry, TorusGeometry, PlaneGeometry, Vector3, Shape,
  ExtrudeGeometry, InstancedMesh, CatmullRomCurve3,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { PAL } from '../look/palette.js';
import { makeWatercolorMaterial, makeGlowMaterial, makeWaterMaterial, makeSoftMaterial } from '../look/material.js';
import { rng, fbm2, noise3 } from './rng.js';
import { displace, setMix } from './shapes.js';
import { lakeDesertRim } from './lake.js';

export const DESERT_C = new Vector3(25, 0, -135); // island centre (world)
const R = 26;            // island radius
const TOP = 3.0;         // height of the flat ground (paths, the pass, the plaza)
const DEG = Math.PI / 180;
const ARRIVE_TH = Math.atan2(-88 - DESERT_C.z, -30 - DESERT_C.x); // towards Crystal Lake (south-west)
const HOLLOW_TH = Math.atan2(-150 - DESERT_C.z, 85 - DESERT_C.x); // towards Whispering Hollow (round 8, east)

const sm = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const edgeR = (th) => R * (0.9 + 0.12 * noise3(Math.cos(th) * 1.6 + 3, Math.sin(th) * 1.6, 8.3) + 0.05 * Math.sin(th * 3 + 1.2));
const around = (th, r, c = { x: 0, z: 0 }) => ({ x: c.x + Math.cos(th) * r, z: c.z + Math.sin(th) * r });
const flat = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
function distSeg(x, z, a, b) {
  const abx = b.x - a.x, abz = b.z - a.z;
  const t = Math.max(0, Math.min(1, ((x - a.x) * abx + (z - a.z) * abz) / (abx * abx + abz * abz)));
  return Math.hypot(x - (a.x + abx * t), z - (a.z + abz * t));
}
const P = (x, z) => ({ x, z });

// ---- the layout (local: +x east, +z south) ----
const ARRIVE = around(ARRIVE_TH, edgeR(ARRIVE_TH) * 0.9);
const NEST = P(-8, 11.5);                // the sleeping sun spirit's stone bowl
const BEND = P(-9.5, 9.6);               // the arrival path bends here towards the pass
export const WALL_X = 3.6;               // the pass's side walls (centre lines)
export const PASS = { x: 3.0, zS: 4.0, zN: -11.0, zIn: 6.2, zOut: -12.6 }; // open width ±x; walls run zS..zN; gusts blow from zOut to zIn
const STUBS = [{ z: 0.0, side: -1 }, { z: -4.0, side: 1 }, { z: -8.0, side: -1 }]; // shelter walls (side: -1 grows from the west wall)
const STUB_TIP = 0.3;                    // how far past the middle a stub reaches
const MOUTH_S = P(0, PASS.zIn), MOUTH_N = P(0, PASS.zOut);
const DIAL = P(0, -17), DIAL_R = 3.6, DIAL_TOP = 2.7; // the sundial: a round step, then the dial
const GATE_X = 14, GATE_N = -7.6, GATE_S = -4.4;         // the sun gate's opening in the terrace wall
const GATE_MID = P(GATE_X, (GATE_N + GATE_S) / 2);
const TERRACE = P(19.5, -5.5);
const OASIS = P(12, 13.5), OASIS_R = 4.3, POOL_R = 1.7, ARCH_TH = -90 * DEG; // the oasis ring wall opens to the north
const ARCH_GAP = 19 * DEG, ARCH_POST = 21 * DEG;

// ruined walls: polylines of [x, z]; each becomes a row of sandstone blocks and a collider
const WALLS = [
  [[-34, 6.0], [-20, 4.6], [-10, 4.2], [-WALL_X, 4.0]],                  // the city wall, west half
  [[-WALL_X, 4.0], [-WALL_X, PASS.zN]],                                  // the pass, west side
  [[WALL_X, 4.0], [WALL_X, PASS.zN]],                                    // the pass, east side
  [[WALL_X, 4.0], [10, 4.2], [GATE_X, 4.4], [20, 5.0], [34, 7.0]],       // the city wall, east half
  [[GATE_X, 4.4], [GATE_X, GATE_S - 0.35]],                              // terrace wall, south of the gate
  [[GATE_X, GATE_N + 0.35], [GATE_X, -32]],                              // terrace wall, north of the gate
];
const wallSegs = [];
for (const line of WALLS) for (let i = 0; i < line.length - 1; i++) wallSegs.push([P(...line[i]), P(...line[i + 1])]);

// paths: [a, b, half width, paving 0..1]
const PATHS = [
  [ARRIVE, BEND, 1.9, 0.55], [BEND, MOUTH_S, 1.9, 0.55],
  [MOUTH_N, DIAL, 2.2, 1], [DIAL, P(8, -11), 1.9, 1], [P(8, -11), P(GATE_X - 0.5, GATE_MID.z), 1.9, 1],
  [P(GATE_X, GATE_MID.z), TERRACE, 2.0, 1],
];

/** 0 = dunes free to roll .. 1 = flat (paths, the pass, the plaza, the oasis, the terrace, along walls) */
function flatMask(x, z) {
  let f = 0;
  for (const [a, b, w] of PATHS) f = Math.max(f, 1 - sm(w, w + 1.6, distSeg(x, z, a, b)));
  const dx = Math.max(0, Math.abs(x) - WALL_X), dz = Math.max(0, z - PASS.zIn, PASS.zOut - z);
  f = Math.max(f, 1 - sm(0, 2.2, Math.hypot(dx, dz)));
  f = Math.max(f, 1 - sm(DIAL_R + 3.5, DIAL_R + 6, Math.hypot(x - DIAL.x, z - DIAL.z)));
  f = Math.max(f, 1 - sm(OASIS_R + 0.6, OASIS_R + 2.6, Math.hypot(x - OASIS.x, z - OASIS.z)));
  f = Math.max(f, 1 - sm(1.6, 3.4, Math.hypot(x - NEST.x, z - NEST.z)));
  f = Math.max(f, sm(GATE_X - 3, GATE_X - 0.6, x) * (1 - sm(5.5, 8, z))); // the terrace
  let dw = Infinity;
  for (const [a, b] of wallSegs) dw = Math.min(dw, distSeg(x, z, a, b));
  return Math.max(f, 1 - sm(1.3, 2.8, dw));
}
function paveMask(x, z) {
  let f = 0;
  for (const [a, b, w, k] of PATHS) f = Math.max(f, k * (1 - sm(w * 0.55, w, distSeg(x, z, a, b) + (noise3(x * 0.4, 3, z * 0.4) - 0.5) * 0.8)));
  f = Math.max(f, 1 - sm(DIAL_R + 2.2, DIAL_R + 3.4, Math.hypot(x - DIAL.x, z - DIAL.z) + (noise3(x * 0.3, 9, z * 0.3) - 0.5)));
  f = Math.max(f, 1 - sm(2.6, 4.2, Math.hypot(x - TERRACE.x, z - TERRACE.z)));
  return f;
}

/** ground height (local coords): rolling dunes, calm and flat wherever you need to walk */
export function desertGround(x, z) {
  const r = Math.hypot(x, z), er = edgeR(Math.atan2(z, x));
  const dune = (fbm2(x * 0.055 + 11, z * 0.055 - 7) - 0.44) * 4.4 + 0.6 * Math.sin(x * 0.21 + z * 0.16 + fbm2(x * 0.03 + 2, z * 0.03) * 7);
  let h = TOP + Math.max(-0.35, dune) * (1 - flatMask(x, z));
  h -= 0.45 * sm(POOL_R + 0.5, POOL_R - 0.4, Math.hypot(x - OASIS.x, z - OASIS.z)); // the pool's hollow
  h -= sm(er * 0.86, er, r) * 1.0; // rounded lip at the island edge
  return h;
}
const onDesert = (x, z) => Math.hypot(x, z) < edgeR(Math.atan2(z, x)) * 0.97;

function buildTop() {
  const SEG = 128, RINGS = 52;
  const pos = [], idx = [];
  pos.push(0, desertGround(0, 0), 0);
  for (let i = 1; i <= RINGS; i++) {
    const f = i / RINGS;
    for (let s = 0; s < SEG; s++) {
      const th = (s / SEG) * Math.PI * 2;
      const r = edgeR(th) * Math.pow(f, 0.85);
      const x = Math.cos(th) * r, z = Math.sin(th) * r;
      pos.push(x, desertGround(x, z), z);
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
  setMix(g, (x, y, z) => paveMask(x, z));
  return g;
}

let DM = null;
function desertMats(M) {
  if (DM) return DM;
  DM = {
    ...M,
    ground: makeWatercolorMaterial({ lit: PAL.sand, lit2: PAL.paving, mix: true, rim: 0.0, wash: 0.2 }),
    cliff: makeWatercolorMaterial({ lit: PAL.sandstone, lit2: PAL.sand, mix: true, rim: 0.4 }),
    sandstone: makeWatercolorMaterial({ lit: PAL.sandstone, rim: 0.4, wash: 0.2 }),
    paving: makeWatercolorMaterial({ lit: PAL.paving, rim: 0.3, wash: 0.16 }),
    cactus: makeWatercolorMaterial({ lit: PAL.cactus, rim: 0.55, wash: 0.14 }),
    palm: makeWatercolorMaterial({ lit: PAL.palm, rim: 0.5, sway: 0.04, wash: 0.2, breakup: 0.4 }),
    eye: makeWatercolorMaterial({ lit: PAL.eye, rim: 0.0, lightRecv: 0 }),
    rope: makeGlowMaterial(PAL.sunCore, PAL.sunHalo, 0.95),
    water: makeWaterMaterial({ mode: 1, flow: 0.25, opacity: 0.8 }),
  };
  return DM;
}

/** the lost sun spirit: a small round sun with a face and a ring of rays. Moved by desertquest.js. */
function makeSpirit() {
  const g = new Group();
  const mat = makeGlowMaterial(PAL.sunCore, PAL.sunHalo, 0.6);
  const core = new Mesh(new SphereGeometry(0.34, 20, 14), mat);
  const rays = new Group();
  const rayGeo = new ConeGeometry(0.075, 0.28, 5).translate(0, 0.5, 0);
  for (let i = 0; i < 9; i++) {
    const r = new Mesh(rayGeo, mat);
    r.rotation.z = (i / 9) * Math.PI * 2;
    rays.add(r);
  }
  const face = new Group();
  const eyeMat = DM.eye;
  const eyes = [-1, 1].map((s) => {
    const e = new Mesh(new SphereGeometry(0.045, 8, 6), eyeMat);
    e.position.set(s * 0.11, 0.05, 0.315); e.scale.set(1, 1.35, 0.5);
    face.add(e);
    return e;
  });
  const smile = new Mesh(new TorusGeometry(0.06, 0.014, 4, 10, Math.PI), eyeMat);
  smile.position.set(0, -0.055, 0.325); smile.rotation.z = Math.PI;
  face.add(smile);
  g.add(core, rays, face);
  g.userData.dynamic = true;
  return { group: g, mat, rays, face, eyes, smile };
}

/** a column of sandstone drums, sometimes broken off */
function column(M, h, seed) {
  const r = rng(seed);
  const parts = [];
  let y = 0;
  parts.push(new CylinderGeometry(0.62, 0.7, 0.3, 10).translate(0, 0.15, 0)); y = 0.3;
  while (y < h - 0.2) {
    const dh = Math.min(0.7 + r() * 0.3, h - y);
    parts.push(new CylinderGeometry(0.46, 0.48, dh - 0.04, 12).translate((r() - 0.5) * 0.04, y + dh / 2, (r() - 0.5) * 0.04));
    y += dh;
  }
  if (r() < 0.5) parts.push(new BoxGeometry(1.15, 0.3, 1.15).translate(0, y + 0.15, 0)); // still has its capital
  return new Mesh(displace(mergeGeometries(parts.map((p) => p.toNonIndexed())), 0.03, 2.5, seed), M.sandstone);
}

/** a clay jar */
function jar(M, s, seed) {
  const body = new SphereGeometry(0.4, 12, 8).scale(1, 1.15, 1).translate(0, 0.42, 0);
  const neck = new CylinderGeometry(0.17, 0.22, 0.24, 10).translate(0, 0.9, 0);
  const lip = new TorusGeometry(0.17, 0.045, 5, 12).rotateX(Math.PI / 2).translate(0, 1.02, 0);
  const m = new Mesh(displace(mergeGeometries([body.toNonIndexed(), neck.toNonIndexed(), lip.toNonIndexed()]), 0.02, 3, seed), M.wood);
  m.scale.setScalar(s);
  return m;
}

/** a cactus: a rounded column with an arm or two (and sometimes a pink flower on top) */
function cactus(M, h, seed) {
  const r = rng(seed);
  const g = new Group();
  const parts = [new CylinderGeometry(0.34, 0.38, h, 10).translate(0, h / 2, 0), new SphereGeometry(0.34, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, h, 0)];
  const arms = 1 + Math.floor(r() * 2);
  for (let i = 0; i < arms; i++) {
    const side = i === 0 ? 1 : -1, y = h * (0.35 + r() * 0.25), up = 0.5 + r() * 0.5;
    parts.push(new CylinderGeometry(0.2, 0.2, 0.55, 8).rotateZ(Math.PI / 2).translate(side * 0.5, y, 0));
    parts.push(new CylinderGeometry(0.2, 0.21, up, 8).translate(side * 0.75, y + up / 2, 0));
    parts.push(new SphereGeometry(0.2, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2).translate(side * 0.75, y + up, 0));
  }
  g.add(new Mesh(displace(mergeGeometries(parts.map((p) => p.toNonIndexed())), 0.025, 4, seed), M.cactus));
  if (r() < 0.6) {
    const fl = new Mesh(new IcosahedronGeometry(0.11, 1), M.mush);
    fl.position.y = h + 0.3; fl.scale.y = 0.6;
    g.add(fl);
  }
  g.rotation.y = r() * 6;
  return g;
}

/** an oasis palm: a ringed, leaning trunk and a crown of drooping fronds */
function palm(M, h, lean, seed) {
  const r = rng(seed);
  const g = new Group();
  const pts = [];
  for (let i = 0; i <= 6; i++) { const k = i / 6; pts.push(new Vector3(Math.sin(k * 1.4) * lean, k * h, 0)); }
  const curve = new CatmullRomCurve3(pts);
  const rings = [];
  for (let i = 0; i < 9; i++) {
    const k = i / 9, p = curve.getPointAt(k + 0.055), rad = 0.24 - k * 0.09;
    rings.push(new CylinderGeometry(rad * 0.86, rad, h / 9 + 0.02, 9).translate(p.x, p.y, p.z));
  }
  g.add(new Mesh(displace(mergeGeometries(rings.map((q) => q.toNonIndexed())), 0.012, 4, seed), M.trunk));
  const top = curve.getPointAt(1);
  const crown = new Group(); crown.position.copy(top);
  const frondGeo = displace(new SphereGeometry(1, 10, 6), 0.04, 2, seed).scale(0.26, 0.05, 1.25).translate(0, 0, 1.15);
  const n = 8;
  for (let i = 0; i < n; i++) {
    const f = new Mesh(frondGeo, M.palm);
    f.rotation.set(0.35 + r() * 0.35, (i / n) * Math.PI * 2 + r() * 0.3, 0, 'YXZ');
    crown.add(f);
  }
  const nut = new Mesh(new IcosahedronGeometry(0.28, 1), M.trunk); nut.position.y = -0.12;
  crown.add(nut);
  g.add(crown);
  g.rotation.y = r() * 6;
  return g;
}

/**
 * Build the Sunset Desert into ctx.root. ctx carries the forest's shared pieces:
 * { root, lights, colliders, bridges, M, makeBridge, makeRock, makeWaystone, buildCliff, scatter }
 */
export function buildDesert(ctx) {
  const { root, lights, colliders } = ctx;
  const M = desertMats(ctx.M);
  const g = new Group();
  g.position.copy(DESERT_C);
  root.add(g);
  const W = (x, z) => ({ x: x + DESERT_C.x, z: z + DESERT_C.z }); // local -> world
  const addCol = (x, z, r) => { const w = W(x, z); colliders.push({ x: w.x, z: w.z, r }); };
  const addSeg = (a, b, r) => { const wa = W(a.x, a.z), wb = W(b.x, b.z); const c = { ax: wa.x, az: wa.z, bx: wb.x, bz: wb.z, r }; colliders.push(c); return c; };
  const gy = desertGround;
  const local = []; // colliders from the forest helpers, in local coords

  // ---- the island ----
  g.add(new Mesh(buildTop(), M.ground));
  g.add(new Mesh(ctx.buildCliff(edgeR, desertGround, 24, 31), M.cliff));

  // ---- ruined walls: rows of sandstone blocks with broken tops ----
  const blockGeo = displace(new BoxGeometry(1, 1, 1, 2, 3, 2), 0.035, 2.2, 11);
  const wr = rng(401);
  const block = (x, z, yaw, len, h, thick, y0) => {
    const b = new Mesh(blockGeo, M.sandstone);
    b.scale.set(len, h, thick);
    b.position.set(x, y0 + h / 2, z);
    b.rotation.y = yaw + (wr() - 0.5) * 0.05;
    g.add(b);
    return b;
  };
  // a wall: a lower course of long blocks, an upper course of shorter ones with a broken, uneven top
  const wallRow = (a, b, hMin, hMax, thick = 1.15) => {
    const len = flat(a, b), dx = (b.x - a.x) / len, dz = (b.z - a.z) / len, yaw = Math.atan2(-dz, dx);
    let s = 0;
    while (s < len - 0.05) {
      let Lc = 2.3 + wr() * 1.5;
      if (len - s - Lc < 1.0) Lc = len - s; // no slivers at the end
      const m = s + Lc / 2, x = a.x + dx * m, z = a.z + dz * m;
      if (onDesert(x, z)) {
        const y0 = gy(x, z) - 0.35;
        const h1 = hMin * (0.5 + wr() * 0.12);
        block(x, z, yaw, Lc + 0.03, h1 + 0.35, thick, y0);
        let u = 0;
        while (u < Lc - 0.2) {
          const ul = Math.min(Lc - u, 0.8 + wr() * 1.2);
          const um = s + u + ul / 2;
          const top = hMin + (hMax - hMin) * Math.pow(wr(), 0.8);
          block(a.x + dx * um, a.z + dz * um, yaw + (wr() - 0.5) * 0.04, ul - 0.05, top - h1, thick * (0.9 + wr() * 0.07), y0 + h1 + 0.35);
          u += ul;
        }
        if (wr() < 0.18) { // a fallen block in the sand beside the wall
          const side = wr() < 0.5 ? 1 : -1, ox = -dz * side * 1.25, oz = dx * side * 1.25;
          const fb = block(x + ox, z + oz, yaw + wr(), 0.8, 0.5, 0.65, gy(x + ox, z + oz) - 0.15);
          fb.rotation.z = (wr() - 0.5) * 0.5;
        }
      }
      s += Lc;
    }
  };
  const passWall = (a, b) => wallRow(a, b, 2.4, 2.9, 1.2);
  WALLS.forEach((line, k) => {
    for (let i = 0; i < line.length - 1; i++) {
      const a = P(...line[i]), b = P(...line[i + 1]);
      if (k === 1 || k === 2) passWall(a, b); else wallRow(a, b, 1.85, 2.5);
      addSeg(a, b, 0.6);
    }
  });
  // shelter stubs in the pass: they grow from a side wall to a little past the middle
  for (const st of STUBS) {
    const a = P(st.side * WALL_X, st.z), b = P(-st.side * STUB_TIP, st.z);
    const len = flat(a, b), n = 3, step = len / n;
    for (let i = 0; i < n; i++) {
      const x = a.x + (b.x - a.x) * (i + 0.5) / n;
      const h = 2.4 - i * 0.2;
      const bl = block(x, st.z, 0, step + 0.04, h + 0.35, 1.1, gy(x, st.z) - 0.35);
      bl.userData.occluder = true;
    }
    addSeg(a, b, 0.55);
  }
  // the pass's mouths: a pair of taller pillars each end
  for (const z of [PASS.zS + 0.2, PASS.zN - 0.2]) {
    for (const s of [-1, 1]) {
      const pil = column(M, 3.4, 410 + z + s);
      pil.position.set(s * (WALL_X + 0.05), gy(s * WALL_X, z) - 0.1, z);
      g.add(pil);
    }
  }

  // ---- the sun spirit's nest: a stone bowl on a short pedestal by the path ----
  const nestY = gy(NEST.x, NEST.z);
  const ped = new Mesh(displace(new CylinderGeometry(0.42, 0.58, 0.75, 12, 2), 0.03, 3, 3), M.sandstone);
  ped.position.set(NEST.x, nestY + 0.3, NEST.z);
  const bowl = new Mesh(displace(new SphereGeometry(0.8, 18, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), 0.03, 3, 4), M.sandstone);
  bowl.scale.set(1, 0.55, 1); bowl.position.set(NEST.x, nestY + 0.95, NEST.z);
  const bowlRim = new Mesh(new TorusGeometry(0.8, 0.07, 6, 24), M.sandstone);
  bowlRim.rotation.x = -Math.PI / 2; bowlRim.position.set(NEST.x, nestY + 0.95, NEST.z);
  g.add(ped, bowl, bowlRim);
  addCol(NEST.x, NEST.z, 0.75);
  for (const [dx, dz, s] of [[1.4, 0.6, 0.8], [-1.2, 1.0, 0.65]]) { const j = jar(M, s, 420 + dx); j.position.set(NEST.x + dx, gy(NEST.x + dx, NEST.z + dz) - 0.03, NEST.z + dz); g.add(j); addCol(NEST.x + dx, NEST.z + dz, 0.35 * s + 0.05); }
  const nestPos = new Vector3(NEST.x + DESERT_C.x, nestY + 1.25, NEST.z + DESERT_C.z);

  // ---- the sundial plaza ----
  const dy = gy(DIAL.x, DIAL.z);
  const step1 = new Mesh(displace(new CylinderGeometry(DIAL_R, DIAL_R + 0.12, 0.3, 40, 1), 0.03, 2, 5), M.paving);
  step1.position.set(DIAL.x, dy + 0.13, DIAL.z);
  const face = new Mesh(displace(new CylinderGeometry(DIAL_TOP, DIAL_TOP + 0.1, 0.18, 40, 1), 0.02, 2, 6), M.sandstone);
  face.position.set(DIAL.x, dy + 0.35, DIAL.z);
  g.add(step1, face);
  const dialMat = makeGlowMaterial(PAL.sunCore, PAL.sunHalo, 0.3);
  const lineGeo = new BoxGeometry(0.07, 0.04, 0.75).translate(0, 0, 1.75);
  for (let i = 0; i < 12; i++) {
    const ln = new Mesh(lineGeo, dialMat);
    ln.position.set(DIAL.x, dy + 0.45, DIAL.z); ln.rotation.y = (i / 12) * Math.PI * 2;
    g.add(ln);
  }
  const dialRing = new Mesh(new TorusGeometry(DIAL_TOP - 0.15, 0.04, 6, 64), dialMat);
  dialRing.rotation.x = -Math.PI / 2; dialRing.position.set(DIAL.x, dy + 0.45, DIAL.z);
  g.add(dialRing);
  // the gnomon: a stone fin pointing north, its tip where the little sun will sit
  const fin = new Shape(); fin.moveTo(0, 0); fin.lineTo(1.5, 0); fin.lineTo(0, 1.65); fin.lineTo(0, 0);
  const finGeo = new ExtrudeGeometry(fin, { depth: 0.2, bevelEnabled: false }).translate(0, 0, -0.1);
  const gnomon = new Mesh(displace(finGeo, 0.01, 3, 7), M.sandstone);
  gnomon.rotation.y = Math.PI / 2; // the long edge runs north from the middle
  gnomon.position.set(DIAL.x, dy + 0.42, DIAL.z + 0.6);
  g.add(gnomon);
  addCol(DIAL.x, DIAL.z - 0.1, 0.62);
  lights.push({ obj: face, str: 0.0, offset: 0.6, dial: true });
  const dialLight = lights[lights.length - 1];
  const sunHome = new Vector3(DIAL.x + DESERT_C.x, dy + 2.75, DIAL.z + DESERT_C.z + 0.55);
  const dialPos = new Vector3(DIAL.x + DESERT_C.x, dy + 0.45, DIAL.z + DESERT_C.z);
  // broken columns round the plaza (gaps for the pass and the way to the gate)
  const cr = rng(431);
  [200, 228, 256, 300, 330, 358, 165].forEach((a, i) => {
    const p = around(a * DEG, 6.6, DIAL);
    if (!onDesert(p.x, p.z)) return;
    const h = 1.4 + cr() * 2.6;
    const col = column(M, h, 440 + i);
    col.position.set(p.x, gy(p.x, p.z) - 0.05, p.z);
    g.add(col);
    addCol(p.x, p.z, 0.62);
  });
  { // and one that fell long ago, near the sun mask
    const p = P(-16, -13), yaw = 0.3;
    const fallen = column(M, 3.2, 452);
    fallen.rotation.set(0, yaw, -Math.PI / 2 + 0.06, 'YXZ');
    fallen.position.set(p.x, gy(p.x, p.z) + 0.42, p.z);
    g.add(fallen);
    addSeg(p, P(p.x + Math.cos(yaw) * 3.0, p.z - Math.sin(yaw) * 3.0), 0.45);
  }
  for (const [x, z, s] of [[-4.4, -21, 0.9], [4.6, -20.5, 0.75]]) { const j = jar(M, s, 460 + x); j.position.set(x, gy(x, z) - 0.03, z); g.add(j); addCol(x, z, 0.38 * s + 0.05); }

  // ---- the sun gate and the terrace ----
  const gateY = gy(GATE_X, GATE_MID.z);
  for (const z of [GATE_N - 0.5, GATE_S + 0.5]) {
    const pil = new Mesh(blockGeo, M.sandstone);
    pil.scale.set(1.3, 5.0, 1.0); pil.position.set(GATE_X, gateY + 2.2, z);
    g.add(pil);
    addCol(GATE_X, z, 0.72);
  }
  const lintel = new Mesh(blockGeo, M.sandstone);
  lintel.scale.set(1.5, 0.85, GATE_S - GATE_N + 2.4); lintel.position.set(GATE_X, gateY + 5.0, GATE_MID.z);
  g.add(lintel);
  const gateSunMat = makeGlowMaterial(PAL.sunCore, PAL.sunHalo, 0.35);
  const gateSun = new Mesh(new CylinderGeometry(0.5, 0.5, 0.12, 20).rotateZ(Math.PI / 2), gateSunMat);
  gateSun.position.set(GATE_X - 0.78, gateY + 5.0, GATE_MID.z);
  g.add(gateSun);
  for (let i = 0; i < 10; i++) { // carved rays round the sun on the lintel
    const a = (i / 10) * Math.PI * 2;
    const ray = new Mesh(new ConeGeometry(0.08, 0.3, 4), gateSunMat);
    ray.position.set(GATE_X - 0.76, gateY + 5.0 + Math.cos(a) * 0.72, GATE_MID.z + Math.sin(a) * 0.72);
    ray.rotation.x = a;
    g.add(ray);
  }
  lights.push({ obj: gateSun, str: 0.25 });
  const gateLight = lights[lights.length - 1];
  const door = new Mesh(displace(new BoxGeometry(0.6, 4.0, GATE_S - GATE_N + 0.2, 2, 4, 3), 0.03, 2.5, 12), M.sandstone);
  door.position.set(GATE_X, gateY + 2.0, GATE_MID.z);
  door.userData.dynamic = true;
  g.add(door);
  const doorSun = new Mesh(new CylinderGeometry(0.42, 0.42, 0.08, 18).rotateZ(Math.PI / 2), gateSunMat);
  doorSun.position.set(-0.33, 0.6, 0); door.add(doorSun);
  const doorCol = addSeg(P(GATE_X, GATE_N), P(GATE_X, GATE_S), 0.4);
  const setGate = (k) => {
    const e = k * k * (3 - 2 * k);
    door.position.y = gateY + 2.0 - e * 4.1;
    door.visible = e < 0.999;
    doorCol.off = k >= 0.6;
  };
  const tY = gy(TERRACE.x, TERRACE.z);
  const starPos = new Vector3(TERRACE.x + 0.8 + DESERT_C.x, tY + 1.05, TERRACE.z + DESERT_C.z);
  { // a worn sun disc set in the paving under the star
    const pl = new Mesh(displace(new CylinderGeometry(0.95, 1.05, 0.16, 18, 1), 0.02, 3, 13), M.sandstone);
    pl.position.set(TERRACE.x + 0.8, tY + 0.0, TERRACE.z);
    g.add(pl);
  }
  const hollowEnd = around(HOLLOW_TH, edgeR(HOLLOW_TH) * 0.9);

  // ---- the hidden oasis: a ring of ruined wall round a pool, its only way in a broken arch ----
  const oy = gy(OASIS.x, OASIS.z);
  const pool = new Mesh(new CircleGeometry(POOL_R + 0.25, 40).rotateX(-Math.PI / 2), M.water);
  pool.position.set(OASIS.x, TOP - 0.2, OASIS.z); pool.renderOrder = 1;
  g.add(pool);
  const ringN = 16;
  for (let i = 0; i < ringN; i++) {
    const a0 = (i / ringN) * Math.PI * 2, a1 = ((i + 1) / ringN) * Math.PI * 2;
    const am = (a0 + a1) / 2;
    if (Math.abs(Math.atan2(Math.sin(am - ARCH_TH), Math.cos(am - ARCH_TH))) < ARCH_GAP) continue;
    const pa = around(a0, OASIS_R, OASIS), pb = around(a1, OASIS_R, OASIS);
    wallRow(pa, pb, 1.75, 2.3, 1.0);
    addSeg(pa, pb, 0.55);
  }
  // the broken arch over the gap: two posts, and half an arch still standing on one side
  const archA = around(ARCH_TH - ARCH_POST, OASIS_R, OASIS), archB = around(ARCH_TH + ARCH_POST, OASIS_R, OASIS);
  for (const p of [archA, archB]) { const post = new Mesh(blockGeo, M.sandstone); post.scale.set(0.95, 3.0, 0.95); post.position.set(p.x, gy(p.x, p.z) + 1.15, p.z); g.add(post); addCol(p.x, p.z, 0.5); }
  for (let i = 0; i < 4; i++) {
    const k = i / 6, x = archA.x + (archB.x - archA.x) * k, z = archA.z + (archB.z - archA.z) * k;
    const bl = new Mesh(blockGeo, M.sandstone);
    bl.scale.set(0.7, 0.55, 0.95); bl.position.set(x, gy(archA.x, archA.z) + 3.1 + Math.sin(k * Math.PI) * 0.9, z);
    bl.rotation.z = -0.5 + k * 1.4;
    g.add(bl);
  }
  for (const [dx, dz, ry] of [[1.9, -1.0, 0.5], [2.6, -0.2, 1.4]]) { const fb = new Mesh(blockGeo, M.sandstone); fb.scale.set(0.75, 0.5, 0.65); fb.position.set(archB.x + dx, gy(archB.x + dx, archB.z + dz) + 0.15, archB.z + dz); fb.rotation.set(0.3, ry, 0.2); g.add(fb); }
  // inside: palms, rim stones, two stones to sit on, and green round the water
  [[200, 2.9, 3.6, 0.9, 471], [330, 3.0, 4.0, -0.8, 472], [75, 2.9, 3.2, 0.7, 473]].forEach(([a, r, h, lean, seed]) => {
    const p = around(a * DEG, r, OASIS);
    const t = palm(M, h, lean, seed);
    t.position.set(p.x, gy(p.x, p.z) - 0.1, p.z);
    g.add(t);
    addCol(p.x, p.z, 0.3);
  });
  for (let i = 0; i < 11; i++) {
    const a = (i / 11) * Math.PI * 2 + 0.2, p = around(a, POOL_R + 0.25, OASIS);
    const st = new Mesh(displace(new IcosahedronGeometry(0.22 + (i % 3) * 0.05, 1), 0.05, 3, 480 + i), M.stone);
    st.position.set(p.x, TOP - 0.18, p.z); st.scale.y = 0.55;
    g.add(st);
  }
  for (const a of [120, 20]) {
    const p = around(a * DEG, 2.65, OASIS);
    const seat = new Mesh(displace(new CylinderGeometry(0.42, 0.5, 0.42, 12, 1), 0.04, 3, a), M.stone);
    seat.position.set(p.x, gy(p.x, p.z) + 0.18, p.z);
    g.add(seat);
  }
  const oasisWorld = new Vector3(OASIS.x + DESERT_C.x, oy + 1.2, OASIS.z + DESERT_C.z);

  // ---- landmarks and dressing ----
  { // a giant sun mask, half buried and tipped back in the sand (north-west)
    const c = P(-13, -7.5), y0 = gy(c.x, c.z);
    const mg = new Group(); mg.position.set(c.x, y0 + 0.4, c.z); mg.rotation.set(-0.75, 0.55, 0.12, 'YXZ');
    const disc = new Mesh(displace(new CylinderGeometry(2.0, 2.1, 0.55, 28, 1), 0.06, 1.5, 14).rotateX(Math.PI / 2), M.sandstone);
    mg.add(disc);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const ray = new Mesh(displace(new ConeGeometry(0.34, 1.0, 5), 0.03, 3, i), M.sandstone);
      ray.position.set(Math.cos(a) * 2.45, Math.sin(a) * 2.45, 0); ray.rotation.z = a - Math.PI / 2;
      mg.add(ray);
    }
    for (const s of [-1, 1]) { const eye = new Mesh(new TorusGeometry(0.32, 0.08, 6, 16, Math.PI), M.sandstone); eye.position.set(s * 0.7, 0.45, 0.3); mg.add(eye); }
    const mouth = new Mesh(new TorusGeometry(0.6, 0.09, 6, 18, Math.PI), M.sandstone); mouth.rotation.z = Math.PI; mouth.position.set(0, -0.35, 0.3); mg.add(mouth);
    g.add(mg);
    addCol(c.x, c.z, 2.1);
  }
  const cacti = [[-14, 9.5, 1.7], [-3.5, 17, 2.1], [5.5, 10.5, 1.5], [-19, -1.5, 2.2], [9, -1, 1.8], [-8.5, -15, 1.6], [19.5, 0.5, 1.4], [-17, 13.5, 1.3]];
  cacti.forEach(([x, z, h], i) => { if (!onDesert(x, z)) return; const c = cactus(M, h, 490 + i); c.position.set(x, gy(x, z) - 0.08, z); g.add(c); addCol(x, z, 0.42); });
  for (const [x, z, s, seed, blk] of [[-16, 6.5, 0.8, 501, true], [7.5, 15.5, 0.9, 502, false], [-6, -3, 0.9, 503, true], [10, -14, 0.7, 504, false], [-21, 9, 0.6, 505, false], [20, -12, 0.75, 506, true]]) {
    if (!onDesert(x, z)) continue;
    const rk = ctx.makeRock(x, z, s, seed, local, blk);
    rk.position.y = gy(x, z) + s * (blk ? 0.3 : 0.15);
    g.add(rk);
  }
  for (const [x, z, h, seed] of [[-9, -2.5, 2.2, 511], [8.5, -5.5, 3.0, 512], [-19, -6, 1.6, 513], [6, 8.0, 1.2, 514]]) {
    if (!onDesert(x, z)) continue;
    const col = column(M, h, seed); col.position.set(x, gy(x, z) - 0.1, z); g.add(col); addCol(x, z, 0.62);
  }
  for (const c of local) addCol(c.x, c.z, c.r);
  // dry tufts on the dunes (none on the paths), and green ones in the oasis
  const dry = [PAL.sand[0].clone().multiplyScalar(1.15), PAL.paving[0].clone().multiplyScalar(1.2), PAL.dust.clone().multiplyScalar(1.1)];
  g.add(ctx.scatter('tuft', 420, (r) => {
    const a = r() * 6.283, d = Math.sqrt(r()) * R;
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (!onDesert(x * 1.05, z * 1.05) || flatMask(x, z) > 0.25 || Math.hypot(x - OASIS.x, z - OASIS.z) < OASIS_R + 1.5) return null;
    if (noise3(x * 0.3 + 4, 1, z * 0.3) < 0.55) return null;
    return { x, y: gy(x, z) - 0.05, z, s: 0.6 + r() * 0.7, rx: (r() - 0.5) * 0.4, rz: (r() - 0.5) * 0.4 };
  }, 521, dry));
  g.add(ctx.scatter('tuft', 160, (r) => {
    const a = r() * 6.283, d = POOL_R + 0.5 + r() * (OASIS_R - POOL_R - 1.1);
    const x = OASIS.x + Math.cos(a) * d, z = OASIS.z + Math.sin(a) * d;
    return { x, y: gy(x, z) - 0.05, z, s: 0.6 + r() * 0.6, rx: (r() - 0.5) * 0.4, rz: (r() - 0.5) * 0.4 };
  }, 522));
  g.add(ctx.scatter('flower', 90, (r) => {
    const a = r() * 6.283, d = POOL_R + 0.6 + r() * (OASIS_R - POOL_R - 1.2);
    const x = OASIS.x + Math.cos(a) * d, z = OASIS.z + Math.sin(a) * d;
    return { x, y: gy(x, z) + 0.1 + r() * 0.15, z, s: 0.7 + r() * 0.6 };
  }, 523));

  // ---- shade in the lee of each shelter: soft lavender patches that say "stand here" ----
  const shadeGeo = mergeGeometries(STUBS.map((st) => {
    const lee = leeRect(st);
    const q = new PlaneGeometry(lee.x1 - lee.x0 + 0.6, lee.z1 - lee.z0 + 0.8).rotateX(-Math.PI / 2);
    return q.translate((lee.x0 + lee.x1) / 2, TOP + 0.04, (lee.z0 + lee.z1) / 2 - 0.15);
  }));
  const shade = new Mesh(shadeGeo, makeSoftMaterial(PAL.shadowBlob, 0.3));
  shade.renderOrder = 2;
  g.add(shade);

  // ---- sand gusts: soft dust puffs streaming down the pass (one instanced draw) ----
  const DUST_N = 70;
  const dustMat = makeSoftMaterial(PAL.dust, 0);
  const dust = new InstancedMesh(new PlaneGeometry(1, 1), dustMat, DUST_N);
  dust.frustumCulled = false; dust.visible = false; dust.renderOrder = 3;
  dust.userData.dynamic = true;
  const dr = rng(531);
  const puffs = Array.from({ length: DUST_N }, () => ({ x: (dr() - 0.5) * 2 * (PASS.x - 0.2), y: 0.2 + dr() * 2.4, k: dr(), sp: 0.75 + dr() * 0.5, sx: 1.0 + dr() * 1.8, sy: 0.35 + dr() * 0.45 }));
  g.add(dust);

  // ---- the spirit ----
  const spirit = makeSpirit();
  spirit.group.position.copy(nestPos).sub(DESERT_C);
  g.add(spirit.group);
  lights.push({ obj: spirit.group, str: 0.4 });
  spirit.light = lights[lights.length - 1];

  // ---- the sandstone bridge from Crystal Lake (rises when the crystal heart wakes) ----
  const rim = lakeDesertRim();
  const bFrom = new Vector3(rim.x, rim.y + 0.05, rim.z);
  const aw = W(ARRIVE.x, ARRIVE.z);
  const bTo = new Vector3(aw.x, gy(ARRIVE.x, ARRIVE.z) + 0.05, aw.z);
  const bridge = ctx.makeBridge(bFrom, bTo, lights, colliders, 0.9, { plank: M.sandstone, post: M.sandstone, rope: M.rope });
  bridge.group.userData.dynamic = true;
  bridge.setRise(0);
  root.add(bridge.group);
  ctx.bridges.push(bridge.data);

  // checkpoints: just past the bridge, and at the plaza end of the pass
  const checkpoints = [
    { x: ARRIVE.x + (BEND.x - ARRIVE.x) * 0.25, z: ARRIVE.z + (BEND.z - ARRIVE.z) * 0.25 },
    { x: -5.2, z: -13.6 },
  ].map((p) => {
    const w = W(p.x, p.z);
    const ws = ctx.makeWaystone(w.x, w.z, gy(p.x, p.z));
    root.add(ws.obj);
    colliders.push({ x: w.x + 1.25, z: w.z, r: 0.2 });
    return ws;
  });

  // ---- walking ----
  const toL = (wx, wz) => [wx - DESERT_C.x, wz - DESERT_C.z];
  const near = (wx, wz) => Math.abs(wx - DESERT_C.x) < R + 2 && Math.abs(wz - DESERT_C.z) < R + 2;
  const structure = (x, z) => {
    const d = Math.hypot(x - DIAL.x, z - DIAL.z);
    if (d < DIAL_TOP) return dy + 0.44;
    if (d < DIAL_R) return dy + 0.28;
    return null;
  };
  const inLee = (x, z) => STUBS.some((st) => { const l = leeRect(st); return x > l.x0 && x < l.x1 && z > l.z0 && z < l.z1; });
  const desert = {
    root: g, bridge, checkpoints, spirit, dust, puffs, dustMat, dialMat, dialLight, gateLight, gateSunMat, door, setGate,
    center: DESERT_C.clone(), nestPos, sunHome, dialPos, starPos, oasisWorld,
    passMid: new Vector3(DESERT_C.x, TOP + 1, DESERT_C.z + (PASS.zS + PASS.zN) / 2),
    pass: { ...PASS, x0: DESERT_C.x - PASS.x, x1: DESERT_C.x + PASS.x, zIn: DESERT_C.z + PASS.zIn, zOut: DESERT_C.z + PASS.zOut, cx: DESERT_C.x },
    /** where the bot waits out a gust behind each shelter (world) */
    shelters: STUBS.map((st) => { const l = leeRect(st); const w = W((l.x0 + l.x1) / 2 + 0.25 * -st.side, st.z + 1.6); return new Vector3(w.x, TOP, w.z); }),
    gatePos: new Vector3(GATE_MID.x + DESERT_C.x, gateY, GATE_MID.z + DESERT_C.z),
    terrace: new Vector3(TERRACE.x + DESERT_C.x, tY, TERRACE.z + DESERT_C.z),
    hollowEnd: new Vector3(hollowEnd.x + DESERT_C.x, gy(hollowEnd.x, hollowEnd.z), hollowEnd.z + DESERT_C.z),
    arrive: new Vector3(aw.x, gy(ARRIVE.x, ARRIVE.z), aw.z),
    oasisArch: (() => { const a = around(ARCH_TH, OASIS_R + 1.6, OASIS); const w = W(a.x, a.z); return new Vector3(w.x, gy(a.x, a.z), w.z); })(),
    /** walkable floor at world x,z from the desert island (null = not here) */
    floor(wx, wz) {
      if (!near(wx, wz)) return null;
      const [x, z] = toL(wx, wz);
      if (!onDesert(x, z)) return null;
      const s = structure(x, z);
      return s === null ? gy(x, z) : Math.max(s, gy(x, z));
    },
    onIsland(p) { if (!near(p.x, p.z)) return false; const [x, z] = toL(p.x, p.z); return onDesert(x, z) && Math.abs(p.y - gy(x, z)) < 1.5; },
    /** in the Windy Pass, where the gusts blow */
    inPass(p) { const [x, z] = toL(p.x, p.z); return Math.abs(x) < PASS.x && z < PASS.zIn && z > PASS.zOut && Math.abs(p.y - TOP) < 2.5; },
    /** in the lee of a shelter wall */
    sheltered(p) { const [x, z] = toL(p.x, p.z); return inLee(x, z); },
    inOasis(p) { const [x, z] = toL(p.x, p.z); return Math.hypot(x - OASIS.x, z - OASIS.z) < OASIS_R - 0.9 && Math.abs(p.y - oy) < 2; },
    /** footstep sound for a traveler standing at p (null if not on the desert) */
    surface(p) {
      if (!near(p.x, p.z)) return null;
      const [x, z] = toL(p.x, p.z);
      if (!onDesert(x, z)) return null;
      if (Math.hypot(x - OASIS.x, z - OASIS.z) < POOL_R + 0.1) return 'water';
      if (structure(x, z) !== null || paveMask(x, z) > 0.5) return 'path';
      return 'sand';
    },
    toWorld: W,
  };
  return desert;
}

export const _desertDebug = { edgeR, onDesert, flatMask, ARRIVE, DIAL, OASIS, TERRACE, NEST, around, desertGround };

/** the calm patch behind a shelter stub (local coords) */
function leeRect(st) {
  const tip = -st.side * STUB_TIP;
  const [x0, x1] = st.side < 0 ? [-PASS.x, tip + 0.35] : [tip - 0.35, PASS.x];
  return { x0, x1, z0: st.z + 0.55, z1: st.z + 3.3 }; // deep enough for two side by side
}
