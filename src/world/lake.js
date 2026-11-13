// Crystal Lake (round 6): the second zone, across a crystal bridge from the shrine.
// A round island with a lake in the middle. Three crystals sleep on the shore, each with two lotus
// stones in front of it; the heart crystal sits on an islet in the lake. A dock on the west shore has a
// rowboat for two. Everything is built in local coordinates around LAKE_C (the group sits there):
// positions below are local unless they say "world". The quest logic lives in lakequest.js.
import {
  Group, Mesh, BufferGeometry, Float32BufferAttribute, CylinderGeometry, IcosahedronGeometry, SphereGeometry,
  ConeGeometry, BoxGeometry, CircleGeometry, TorusGeometry, CatmullRomCurve3, Vector3, Quaternion, Object3D,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { PAL } from '../look/palette.js';
import { makeWatercolorMaterial, makeGlowMaterial, makeWaterMaterial } from '../look/material.js';
import { rng, fbm2, noise3 } from './rng.js';
import { displace, setMix } from './shapes.js';

export const LAKE_C = new Vector3(-30, 0, -88); // island centre (world)
const R = 23;                    // island radius
const TOP = 2.0;                 // ground height round the lake
export const WATER_Y = TOP - 0.4;
const LC = { x: 0, z: -2 };      // lake centre
const LR = 10.5;                 // waterline radius
const DEEP = LR - 1.0;           // nearer the middle than this is too deep to wade
const ISLET_R = 2.45;            // walkable top of the heart's islet
const ISLET_Y = WATER_Y + 0.35;
const DEG = Math.PI / 180;
const ARRIVE_TH = Math.atan2(39, 34); // from the island centre towards the shrine
const STEP_TH = 60 * DEG;        // the stepping stones leave the shore here (around the lake centre)
const CRYSTAL_TH = [0, 120, 240].map((a) => a * DEG);
const PAIR_SPREAD = 14 * DEG;    // the two lotus stones of a crystal sit either side of it
const DOCK_TH = 180 * DEG;

const sm = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const edgeR = (th) => R * (0.9 + 0.12 * noise3(Math.cos(th) * 1.6 + 7, Math.sin(th) * 1.6, 4.1) + 0.05 * Math.sin(th * 3 + 0.5));
const around = (th, r, c = LC) => ({ x: c.x + Math.cos(th) * r, z: c.z + Math.sin(th) * r });
const dLake = (x, z) => Math.hypot(x - LC.x, z - LC.z);

const ARRIVE = around(ARRIVE_TH, edgeR(ARRIVE_TH) * 0.9, { x: 0, z: 0 });
const SHORE_STEP = around(STEP_TH, LR + 0.6);
// the sandstone bridge to the Sunset Desert (round 7) leaves the north-east rim; a path leads to it from the beach
const DESERT_TH = Math.atan2(-135 - LAKE_C.z, 25 - LAKE_C.x);
const NE_RIM = around(DESERT_TH, edgeR(DESERT_TH) * 0.9, { x: 0, z: 0 });
const NE_SHORE = (() => { const dx = NE_RIM.x - LC.x, dz = NE_RIM.z - LC.z, d = Math.hypot(dx, dz); return { x: LC.x + dx / d * (LR + 2.2), z: LC.z + dz / d * (LR + 2.2) }; })();

function distSeg(x, z, a, b) {
  const abx = b.x - a.x, abz = b.z - a.z;
  const t = Math.max(0, Math.min(1, ((x - a.x) * abx + (z - a.z) * abz) / (abx * abx + abz * abz)));
  return Math.hypot(x - (a.x + abx * t), z - (a.z + abz * t));
}
const pathMask = (x, z) => 1 - sm(1.0, 2.0, Math.min(distSeg(x, z, ARRIVE, SHORE_STEP), distSeg(x, z, NE_SHORE, NE_RIM)) + (noise3(x * 0.3, 5, z * 0.3) - 0.5));

const bedDepth = (d) => 0.36 * sm(0, 0.9, d) + 1.9 * sm(0.9, 3.2, d);

/** ground height (local coords): rolling meadow, flat round the lake, a sandy beach and the basin */
export function lakeGround(x, z) {
  const r = Math.hypot(x, z), er = edgeR(Math.atan2(z, x));
  const dl = dLake(x, z);
  let h = (fbm2(x * 0.07 + 31, z * 0.07 - 4) - 0.5) * 3.0;
  h += 1.8 * Math.exp(-((x + 12) ** 2 + (z + 15) ** 2) / 50) + 1.3 * Math.exp(-((x - 12) ** 2 + (z + 13) ** 2) / 40);
  h *= sm(LR + 3, LR + 8, dl) * (1 - 0.6 * pathMask(x, z));
  h += TOP;
  h += (WATER_Y + 0.06 - h) * sm(LR + 2.2, LR, dl); // the beach slopes down to the water
  if (dl < LR) h = WATER_Y + 0.06 - bedDepth(LR - dl);
  h -= sm(er * 0.86, er, r) * 1.0; // rounded lip at the island edge
  return h;
}
const onLakeIsland = (x, z) => Math.hypot(x, z) < edgeR(Math.atan2(z, x)) * 0.97;

/** the north-east rim where the bridge to the Sunset Desert starts (world coords, on the ground) */
export function lakeDesertRim() {
  return new Vector3(NE_RIM.x + LAKE_C.x, lakeGround(NE_RIM.x, NE_RIM.z), NE_RIM.z + LAKE_C.z);
}

function buildTop() {
  const SEG = 128, RINGS = 50;
  const pos = [], idx = [];
  pos.push(0, lakeGround(0, 0), 0);
  for (let i = 1; i <= RINGS; i++) {
    const f = i / RINGS;
    for (let s = 0; s < SEG; s++) {
      const th = (s / SEG) * Math.PI * 2;
      const r = edgeR(th) * Math.pow(f, 0.85);
      const x = Math.cos(th) * r, z = Math.sin(th) * r;
      pos.push(x, lakeGround(x, z), z);
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
  // sand on the beach, under the water and along the path in from the bridge
  setMix(g, (x, y, z) => Math.max(pathMask(x, z) * 0.85, sm(LR + 2.8, LR + 1.0, dLake(x, z))));
  return g;
}

let LM = null;
function lakeMats(M) {
  if (LM) return LM;
  LM = {
    crystalStone: makeWatercolorMaterial({ lit: PAL.crystalStone, rim: 0.7, wash: 0.14 }),
    lotus: makeWatercolorMaterial({ lit: PAL.lotus, rim: 0.5, sway: 0.03 }),
    lily: makeWatercolorMaterial({ lit: PAL.lily, rim: 0.2, wash: 0.2 }),
    shard: makeGlowMaterial(PAL.crystalCore, PAL.crystalHalo, 0.9),
    rope: makeGlowMaterial(PAL.crystalCore, PAL.crystalHalo, 1.0),
    beam: makeGlowMaterial(PAL.crystalCore, PAL.crystalHalo, 1.5),
    water: makeWaterMaterial({ mode: 1, flow: 0.3, opacity: 0.74 }),
    ...M,
  };
  return LM;
}

/** a clump of crystal points (one mesh): the shore crystals, the heart and little shards */
function crystalCluster(mat, size, seed, n = 5) {
  const r = rng(seed);
  const parts = [];
  const o = new Object3D();
  for (let i = 0; i < n; i++) {
    const big = i === 0;
    const h = size * (big ? 1 : 0.4 + r() * 0.35), w = h * (big ? 0.17 : 0.2);
    const piece = mergeGeometries([
      new CylinderGeometry(w, w * 0.85, h * 0.7, 6).translate(0, h * 0.35, 0),
      new ConeGeometry(w, h * 0.3, 6).translate(0, h * 0.85, 0),
    ]);
    o.position.set(0, 0, 0); o.rotation.set(0, 0, 0);
    if (!big) {
      const a = (i / (n - 1)) * Math.PI * 2 + r();
      o.position.set(Math.cos(a) * size * 0.2, 0, Math.sin(a) * size * 0.2);
      o.rotation.set(Math.sin(a) * 0.45, r() * 3, -Math.cos(a) * 0.45);
    }
    o.updateMatrix();
    parts.push(piece.applyMatrix4(o.matrix));
  }
  return new Mesh(mergeGeometries(parts), mat);
}

/**
 * Build Crystal Lake into ctx.root. ctx carries the forest's shared pieces:
 * { root, lights, swingers, colliders, bridges, M, makeBridge, makeTree, makeRock, makeMushroom, makeWaystone, buildCliff, scatter }
 */
export function buildCrystalLake(ctx) {
  const { root, lights, colliders, M: FM } = ctx;
  const M = lakeMats(FM);
  const g = new Group();
  g.position.copy(LAKE_C);
  root.add(g);
  const W = (x, z) => ({ x: x + LAKE_C.x, z: z + LAKE_C.z }); // local -> world
  const addCol = (x, z, r) => { const w = W(x, z); colliders.push({ x: w.x, z: w.z, r }); };
  const gy = lakeGround;

  // ---- island, beach and lake ----
  g.add(new Mesh(buildTop(), M.ground));
  g.add(new Mesh(ctx.buildCliff(edgeR, lakeGround, 22, 21), M.cliff));
  const water = new Mesh(new CircleGeometry(LR + 0.4, 72).rotateX(-Math.PI / 2), M.water);
  water.position.set(LC.x, WATER_Y, LC.z); water.renderOrder = 1;
  g.add(water);
  // lily pads drifting near the shore (still: they bake into one mesh)
  const lr = rng(301);
  const padGeo = new CylinderGeometry(0.42, 0.42, 0.04, 14, 1, false, 0.5, Math.PI * 2 - 0.9);
  for (let i = 0; i < 16; i++) {
    const a = lr() * Math.PI * 2;
    if (Math.abs(Math.atan2(Math.sin(a - STEP_TH), Math.cos(a - STEP_TH))) < 0.35) continue; // keep the stepping stones clear
    if (Math.abs(Math.atan2(Math.sin(a - DOCK_TH), Math.cos(a - DOCK_TH))) < 0.4) continue;
    const p = around(a, 5.2 + lr() * 3.6);
    const pad = new Mesh(padGeo, M.lily);
    pad.position.set(p.x, WATER_Y + 0.02, p.z); pad.rotation.y = lr() * 6; pad.scale.setScalar(0.7 + lr() * 0.6);
    g.add(pad);
  }

  // ---- the heart: an islet in the middle with a sleeping crystal over a round stone ----
  const isletTop = new Mesh(displace(new CylinderGeometry(2.65, 2.85, 0.5, 36, 1), 0.06, 1.5, 3), M.ground);
  isletTop.position.set(LC.x, ISLET_Y - 0.25, LC.z);
  const isletRock = new Mesh(displace(new IcosahedronGeometry(1, 3), 0.12, 1.2, 7), M.cliff);
  isletRock.scale.set(3.0, 1.3, 3.0); isletRock.position.set(LC.x, WATER_Y - 0.95, LC.z);
  const plinth = new Mesh(displace(new CylinderGeometry(0.62, 0.78, 0.5, 16, 2), 0.03, 3, 5), M.stone);
  plinth.position.set(LC.x, ISLET_Y + 0.25, LC.z);
  g.add(isletTop, isletRock, plinth);
  for (let i = 0; i < 6; i++) { // a ring of small stones round the plinth
    const a = (i / 6) * Math.PI * 2 + 0.3;
    const s = new Mesh(displace(new IcosahedronGeometry(0.2, 1), 0.05, 3, 40 + i), M.stone);
    s.position.set(LC.x + Math.cos(a) * 1.05, ISLET_Y + 0.05, LC.z + Math.sin(a) * 1.05); s.scale.y = 0.6;
    g.add(s);
  }
  addCol(LC.x, LC.z, 0.8);
  const heartMat = makeGlowMaterial(PAL.crystalCore, PAL.crystalHalo, 0.7);
  const heart = crystalCluster(heartMat, 2.1, 9, 7);
  heart.position.set(LC.x, ISLET_Y + 0.5, LC.z);
  heart.userData.dynamic = true; // floats and turns
  g.add(heart);
  const heartLight = { obj: heart, str: 0.35, offset: 0.7 };
  lights.push(heartLight);
  const heartWorld = new Vector3(LC.x + LAKE_C.x, ISLET_Y + 1.8, LC.z + LAKE_C.z);

  // ---- three shore crystals, each with two lotus stones in front ----
  const pairs = CRYSTAL_TH.map((th, k) => {
    const c = around(th, 14.5);
    const base = new Mesh(displace(new IcosahedronGeometry(1, 2), 0.16, 1.4, 50 + k), M.crystalStone);
    base.scale.set(1.35, 0.6, 1.35); base.position.set(c.x, gy(c.x, c.z) + 0.1, c.z);
    const mat = makeGlowMaterial(PAL.crystalCore, PAL.crystalHalo, 0.7);
    const cl = crystalCluster(mat, 3.2, 60 + k, 7);
    cl.position.set(c.x, gy(c.x, c.z) + 0.25, c.z);
    cl.rotation.y = th;
    g.add(base, cl);
    addCol(c.x, c.z, 1.15);
    const light = { obj: cl, str: 0.25, offset: 1.6 };
    lights.push(light);
    // the beam it sends to the heart once lit (grows out of the crystal's tip)
    const tip = new Vector3(c.x, gy(c.x, c.z) + 3.3, c.z);
    const to = new Vector3(LC.x, ISLET_Y + 1.6, LC.z);
    const beam = new Mesh(new CylinderGeometry(0.06, 0.06, 1, 6, 1).translate(0, 0.5, 0), M.beam);
    beam.position.copy(tip);
    beam.quaternion.copy(new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), to.clone().sub(tip).normalize()));
    beam.userData.len = tip.distanceTo(to);
    beam.scale.set(1, 0.001, 1); beam.visible = false;
    beam.userData.dynamic = true;
    g.add(beam);
    // lotus stones
    const stones = [-1, 1].map((sgn, j) => {
      const p = around(th + sgn * PAIR_SPREAD, 13);
      const y = gy(p.x, p.z);
      const sg = new Group(); sg.position.set(p.x, y, p.z);
      const disc = new Mesh(displace(new CylinderGeometry(0.85, 0.95, 0.26, 26, 1), 0.03, 2.5, 70 + k * 2 + j), M.stone);
      disc.position.y = -0.07;
      const glowMat = makeGlowMaterial(PAL.crystalCore, PAL.crystalHalo, 0.6);
      const core = new Mesh(new CylinderGeometry(0.3, 0.32, 0.08, 20), glowMat); core.position.y = 0.06;
      sg.add(disc, core);
      for (let i = 0; i < 8; i++) { // carved lotus petals round the glowing middle
        const a = (i / 8) * Math.PI * 2;
        const pet = new Mesh(new SphereGeometry(0.26, 10, 6), M.lotus);
        pet.scale.set(0.5, 0.28, 1); pet.position.set(Math.sin(a) * 0.5, 0.07, Math.cos(a) * 0.5);
        pet.rotation.set(-0.35, a, 0, 'YXZ');
        sg.add(pet);
      }
      const ring = new Mesh(new TorusGeometry(1.05, 0.035, 6, 40), glowMat); // pulses when it's waiting for you
      ring.rotation.x = -Math.PI / 2; ring.position.y = 0.04;
      ring.userData.dynamic = true;
      sg.add(ring);
      g.add(sg);
      const w = W(p.x, p.z);
      return { pos: new Vector3(w.x, y, w.z), glowMat, ring };
    });
    const cw = W(c.x, c.z);
    return { pos: new Vector3(cw.x, gy(c.x, c.z) + 1.4, cw.z), mat, light, beam, stones, cluster: cl };
  });

  // ---- stepping stones to the islet: they rise out of the lake when the heart wakes ----
  const steps = [9.3, 7.8, 6.3, 4.8, 3.3].map((r, i) => {
    const p = around(STEP_TH + (i % 2 ? 0.04 : -0.04), r);
    const top = WATER_Y + 0.3 + (i % 2) * 0.05;
    const sg = new Group(); sg.position.set(p.x, top, p.z);
    const pillar = new Mesh(displace(new CylinderGeometry(0.8, 1.05, 2.8, 18, 2), 0.06, 1.8, 90 + i), M.stone);
    pillar.position.y = -1.4;
    const moss = new Mesh(displace(new SphereGeometry(0.62, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2), 0.05, 3, 95 + i), M.moss);
    moss.scale.y = 0.18; moss.position.y = -0.04;
    sg.add(pillar, moss);
    sg.userData = { y: top, t: i / 4, dynamic: true };
    sg.visible = false;
    g.add(sg);
    return { group: sg, x: p.x, z: p.z, y: top };
  });
  let stepsUp = false;
  const setSteps = (k) => {
    for (const s of steps) {
      const e = Math.max(0, Math.min(1, k * 1.5 - s.group.userData.t * 0.5));
      s.group.visible = e > 0.01;
      const ease = 1 - Math.pow(1 - e, 3);
      s.group.position.y = s.y - (1 - ease) * 2.4;
    }
    stepsUp = k >= 1;
  };

  // ---- a wooden dock on the west shore, with a rowboat for two ----
  const dockIn = around(DOCK_TH, LR + 1.6), dockOut = around(DOCK_TH, LR - 2.6);
  const dockDir = { x: dockOut.x - dockIn.x, z: dockOut.z - dockIn.z };
  const dockLen = Math.hypot(dockDir.x, dockDir.z); dockDir.x /= dockLen; dockDir.z /= dockLen;
  const DOCK_Y = WATER_Y + 0.42;
  const plankGeo = displace(new BoxGeometry(0.42, 0.1, 1.7, 2, 1, 3), 0.012, 3, 4);
  const dockYaw = Math.atan2(-dockDir.z, dockDir.x);
  for (let s = 0.2; s < dockLen; s += 0.47) {
    const pl = new Mesh(plankGeo, M.wood);
    pl.position.set(dockIn.x + dockDir.x * s, DOCK_Y - 0.05, dockIn.z + dockDir.z * s);
    pl.rotation.y = dockYaw; pl.rotation.x = ((s * 7) % 3 - 1) * 0.015;
    g.add(pl);
  }
  const side = { x: -dockDir.z, z: dockDir.x };
  for (const s of [1.4, dockLen - 0.2]) {
    for (const sg of [-1, 1]) {
      const post = new Mesh(displace(new CylinderGeometry(0.1, 0.12, 1.9, 7, 2), 0.02, 3, s + sg), M.wood);
      post.position.set(dockIn.x + dockDir.x * s + side.x * 0.9 * sg, WATER_Y - 0.25, dockIn.z + dockDir.z * s + side.z * 0.9 * sg);
      g.add(post);
    }
  }
  // a little lantern post at the end of the dock
  const lp = { x: dockOut.x + side.x * 0.9, z: dockOut.z + side.z * 0.9 };
  const pole = new Mesh(new CylinderGeometry(0.07, 0.09, 1.6, 6), M.wood); pole.position.set(lp.x, DOCK_Y + 0.75, lp.z);
  const lantern = new Mesh(new CylinderGeometry(0.15, 0.15, 0.28, 10), M.glow); lantern.position.set(lp.x, DOCK_Y + 1.7, lp.z);
  const lcap = new Mesh(new ConeGeometry(0.2, 0.14, 10), M.wood); lcap.position.set(lp.x, DOCK_Y + 1.91, lp.z);
  g.add(pole, lantern, lcap);
  lights.push({ obj: lantern, str: 0.8 });
  addCol(lp.x, lp.z, 0.15);

  // the rowboat waits at the end of the dock, pointing out over the lake. Its ride: round the near
  // side of the heart, a slow turn at the east end, back along the far side, never crossing the stepping stones.
  const DOCKED = around(DOCK_TH, 6.35);
  const ridePts = [[6.35, 180], [5.3, 200], [4.2, 235], [4.1, 275], [4.5, 315], [5.6, 345], [7.0, 330], [7.7, 290], [7.8, 250], [7.5, 212]]
    .map(([r, a]) => { const p = around(a * DEG, r); return new Vector3(p.x, 0, p.z); });
  const ride = new CatmullRomCurve3(ridePts, true, 'centripetal');
  const boat = makeBoat(M);
  const BOAT_Y = WATER_Y + 0.05;
  const dockedYaw = Math.atan2(LC.x - DOCKED.x, LC.z - DOCKED.z);
  const boatState = { x: DOCKED.x, z: DOCKED.z, yaw: dockedYaw };
  /** u: 0..1 along the ride (0 and 1 = tied up at the dock) */
  const placeBoat = (u, t = 0) => {
    if (u <= 0 || u >= 1) { boatState.x = DOCKED.x; boatState.z = DOCKED.z; boatState.yaw = dockedYaw; } else {
      const p = ride.getPointAt(u), tan = ride.getTangentAt(u);
      let yaw = Math.atan2(tan.x, tan.z);
      const k = Math.min(1, u / 0.07, (1 - u) / 0.07); // turn smoothly out of and back into the dock
      let d = yaw - dockedYaw; d = Math.atan2(Math.sin(d), Math.cos(d));
      yaw = dockedYaw + d * k * k * (3 - 2 * k);
      boatState.x = p.x; boatState.z = p.z; boatState.yaw = yaw;
    }
    boat.position.set(boatState.x, BOAT_Y + Math.sin(t * 1.3) * 0.03, boatState.z);
    boat.rotation.set(Math.sin(t * 1.1) * 0.025, boatState.yaw, Math.sin(t * 0.9) * 0.03, 'YXZ');
  };
  placeBoat(0);
  g.add(boat);

  // ---- trees, rocks and flowers round the meadow ----
  const local = [];
  const treeSpots = [[-15, 4, 1.0, 211, true], [16, 7, 0.9, 212, false], [8, -16, 1.05, 213, true], [-17, -8, 0.95, 214, false], [2, -18.5, 0.85, 215, false], [-7, 17, 0.85, 216, true]];
  for (const [x, z, s, seed, alt] of treeSpots) {
    const t = ctx.makeTree(x, z, s, seed, lights, ctx.swingers, local, alt);
    t.position.y = gy(x, z) - 0.25;
    g.add(t);
  }
  for (const [x, z, s, seed, block] of [[-12, 12, 0.8, 221, true], [17, -9, 0.7, 222, false], [-4, -17, 0.9, 223, true], [18, -2, 0.6, 224, false], [-18, 1, 0.7, 225, false], [5, 16, 0.6, 226, true]]) {
    const rk = ctx.makeRock(x, z, s, seed, local, block);
    rk.position.y = gy(x, z) + s * (block ? 0.3 : 0.15);
    g.add(rk);
  }
  const mr = rng(231);
  for (const [cx, cz] of [[-13, 2], [14, 5], [6, -14]]) {
    for (let i = 0; i < 3; i++) {
      const x = cx + (mr() - 0.5) * 2, z = cz + (mr() - 0.5) * 2;
      const m = ctx.makeMushroom(x, z, 0.7 + mr() * 0.8, mr() * 100);
      m.position.y = gy(x, z) - 0.03;
      g.add(m);
    }
  }
  for (const c of local) addCol(c.x, c.z, c.r);
  // little crystal shards in the grass (one material: they bake into a single mesh)
  const sr = rng(241);
  for (let i = 0; i < 14; i++) {
    const a = sr() * Math.PI * 2, d = 15.5 + sr() * 4;
    const p = around(a, d, { x: 0, z: 0 });
    if (!onLakeIsland(p.x * 1.08, p.z * 1.08) || distSeg(p.x, p.z, ARRIVE, SHORE_STEP) < 2.5 || distSeg(p.x, p.z, NE_SHORE, NE_RIM) < 2.5) continue;
    const sh = crystalCluster(M.shard, 0.5 + sr() * 0.5, 250 + i, 3);
    sh.position.set(p.x, gy(p.x, p.z) - 0.05, p.z);
    g.add(sh);
  }
  // grass tufts and flowers, calm on the beach and path
  g.add(ctx.scatter('tuft', 1500, (r) => {
    const a = r() * 6.283, d = Math.sqrt(r()) * R;
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (!onLakeIsland(x, z) || dLake(x, z) < LR + 2.4 || pathMask(x, z) > 0.1) return null;
    if (noise3(x * 0.35 + 9, 1, z * 0.35) < 0.45) return null;
    return { x, y: gy(x, z) - 0.05, z, s: 0.5 + r() * 0.6, rx: (r() - 0.5) * 0.5, rz: (r() - 0.5) * 0.5 };
  }, 251));
  g.add(ctx.scatter('flower', 700, (r) => {
    const a = r() * 6.283, d = Math.sqrt(r()) * R;
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (!onLakeIsland(x, z) || dLake(x, z) < LR + 2.6 || pathMask(x, z) > 0.05) return null;
    if (noise3(x * 0.22 + 17, 2, z * 0.22) < 0.6 + r() * 0.1) return null;
    return { x, y: gy(x, z) + 0.1 + r() * 0.16, z, s: 0.7 + r() * 0.6 };
  }, 252));

  // ---- the crystal bridge from the shrine island (rises when you reach the shrine) ----
  const shrineIsle = { x: 4, z: -49 };
  const dir = new Vector3(LAKE_C.x + ARRIVE.x - shrineIsle.x, 0, LAKE_C.z + ARRIVE.z - shrineIsle.z).normalize();
  const bFrom = new Vector3(shrineIsle.x + dir.x * 8.0, 1.4, shrineIsle.z + dir.z * 8.0);
  const bTo = new Vector3(LAKE_C.x + ARRIVE.x, lakeGround(ARRIVE.x, ARRIVE.z) + 0.05, LAKE_C.z + ARRIVE.z);
  const bridge = ctx.makeBridge(bFrom, bTo, lights, colliders, 0.8, { plank: M.crystalStone, post: M.crystalStone, rope: M.rope });
  bridge.group.userData.dynamic = true;
  bridge.setRise(0);
  root.add(bridge.group);
  ctx.bridges.push(bridge.data);

  // checkpoint just inside the island, on the path from the bridge
  const cpL = { x: ARRIVE.x + (SHORE_STEP.x - ARRIVE.x) * 0.22, z: ARRIVE.z + (SHORE_STEP.z - ARRIVE.z) * 0.22 };
  const cpW = W(cpL.x, cpL.z);
  const checkpoint = ctx.makeWaystone(cpW.x, cpW.z, gy(cpL.x, cpL.z));
  root.add(checkpoint.obj);
  colliders.push({ x: cpW.x + 1.25, z: cpW.z, r: 0.2 });

  // ---- walking: floors, water and boat ----
  const BOAT_HL = 1.45, BOAT_HW = 0.72, BOAT_DECK = BOAT_Y + 0.22;
  const inBoat = (x, z, pad = 0) => { // local coords, in the boat's own frame
    const dx = x - boatState.x, dz = z - boatState.z, c = Math.cos(boatState.yaw), s = Math.sin(boatState.yaw);
    const along = dx * s + dz * c, across = dx * c - dz * s;
    return Math.abs(along) < BOAT_HL + pad && Math.abs(across) < BOAT_HW + pad;
  };
  const onDock = (x, z) => {
    const rx = x - dockIn.x, rz = z - dockIn.z, along = rx * dockDir.x + rz * dockDir.z, across = rx * side.x + rz * side.z;
    return along > -0.4 && along < dockLen + 0.2 && Math.abs(across) < 0.95;
  };
  /** height of anything built over the water at local x,z (null if nothing) */
  const structure = (x, z) => {
    let best = null;
    const dl = dLake(x, z);
    if (dl < ISLET_R) best = ISLET_Y;
    if (stepsUp) for (const s of steps) if (Math.hypot(x - s.x, z - s.z) < 1.0) best = Math.max(best ?? -1e9, s.y);
    if (onDock(x, z)) best = Math.max(best ?? -1e9, DOCK_Y);
    if (inBoat(x, z)) best = Math.max(best ?? -1e9, BOAT_DECK);
    return best;
  };
  const toL = (wx, wz) => [wx - LAKE_C.x, wz - LAKE_C.z];
  const near = (wx, wz) => Math.abs(wx - LAKE_C.x) < R + 2 && Math.abs(wz - LAKE_C.z) < R + 2;
  const lake = {
    root: g,
    pairs, steps, heart, heartMat, heartLight, heartWorld, bridge, checkpoint, boat, ride, placeBoat, boatState, setSteps,
    get stepsUp() { return stepsUp; },
    center: LAKE_C.clone(), lakeCenter: new Vector3(LC.x + LAKE_C.x, WATER_Y, LC.z + LAKE_C.z), waterY: WATER_Y,
    starPos: new Vector3(LC.x + LAKE_C.x + 1.25, ISLET_Y + 0.9, LC.z + LAKE_C.z + 1.0),
    boatSeats: [0.62, -0.62], boatDeck: BOAT_DECK, heartY: ISLET_Y + 0.5,
    boatWorld(out = new Vector3()) { return out.set(boatState.x + LAKE_C.x, BOAT_DECK, boatState.z + LAKE_C.z); },
    /** walkable floor at world x,z from the lake island (null = not here) */
    floor(wx, wz) {
      if (!near(wx, wz)) return null;
      const [x, z] = toL(wx, wz);
      if (!onLakeIsland(x, z)) return null;
      const s = structure(x, z);
      return s === null ? lakeGround(x, z) : Math.max(s, lakeGround(x, z));
    },
    /** water too deep to wade into (and nothing built there to stand on) */
    deep(wx, wz) {
      if (!near(wx, wz)) return false;
      const [x, z] = toL(wx, wz);
      return dLake(x, z) < DEEP && structure(x, z) === null;
    },
    /** the water surface height if world x,z is over open water, else null */
    waterAt(wx, wz) {
      if (!near(wx, wz)) return null;
      const [x, z] = toL(wx, wz);
      return dLake(x, z) < LR && structure(x, z) === null ? WATER_Y : null;
    },
    onIsland(p) { const [x, z] = toL(p.x, p.z); return onLakeIsland(x, z) && Math.abs(p.y - lakeGround(x, z)) < 1.5; },
    inBoat(p, pad = 0) { const [x, z] = toL(p.x, p.z); return inBoat(x, z, pad) && Math.abs(p.y - BOAT_DECK) < 0.8; },
    /** footstep sound for a traveler standing at p (null if not on the lake island) */
    surface(p) {
      if (!near(p.x, p.z)) return null;
      const [x, z] = toL(p.x, p.z);
      if (!onLakeIsland(x, z)) return null;
      const dl = dLake(x, z);
      if (inBoat(x, z) || onDock(x, z)) return 'wood';
      if (dl < LR + 0.05) return structure(x, z) === null ? 'water' : 'path';
      return pathMask(x, z) > 0.5 || dl < LR + 1.8 ? 'path' : 'grass';
    },
    toWorld: W,
    dock: { shore: new Vector3(W(dockIn.x, dockIn.z).x, DOCK_Y, W(dockIn.x, dockIn.z).z), end: new Vector3(W(dockOut.x, dockOut.z).x, DOCK_Y, W(dockOut.x, dockOut.z).z) },
  };
  return lake;
}

function makeBoat(M) {
  const g = new Group();
  // hull: a squashed half-sphere stretched into a boat, open on top, with a rim and two seats
  const hullGeo = new SphereGeometry(1, 24, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
  const hull = new Mesh(displace(hullGeo, 0.01, 3, 2), M.boat ?? M.wood);
  hull.scale.set(0.8, 0.42, 1.6); hull.position.y = 0.3;
  const inner = new Mesh(new CylinderGeometry(0.72, 0.72, 0.04, 20), M.wood);
  inner.scale.set(1, 1, 1.95); inner.position.y = 0.2;
  const rim = new Mesh(new TorusGeometry(1, 0.05, 6, 40), M.wood);
  rim.rotation.x = -Math.PI / 2; rim.scale.set(0.8, 1.6, 1); rim.position.y = 0.31;
  g.add(hull, inner, rim);
  for (const z of [0.62, -0.62]) {
    const seat = new Mesh(new BoxGeometry(1.3, 0.07, 0.32), M.wood); seat.position.set(0, 0.3, z);
    g.add(seat);
  }
  // a tiny lantern on a hook at the bow
  const hook = new Mesh(new CylinderGeometry(0.03, 0.03, 0.8, 5), M.wood); hook.position.set(0, 0.65, 1.42); hook.rotation.x = 0.35;
  const lamp = new Mesh(new CylinderGeometry(0.1, 0.1, 0.18, 8), M.glow); lamp.position.set(0, 0.85, 1.62);
  g.add(hook, lamp);
  g.userData.dynamic = true; // it moves
  g.userData.lamp = lamp;
  return g;
}
