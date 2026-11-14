// Cloud Kingdom (round 10): the finale. When the aurora bell rings on the Snowy Peak, the aurora lifts a stair of
// drifting cloud steps from the summit, curving west over the cloud sea to a high island of pale cloud-stone.
// On it a tower winds up into the sky: a ramp spirals round it, broken in three places where only a bridge of
// light can carry you, and the light only holds while you hold hands. At the top waits the beacon: light it
// together and every island sends up a beam of light, the sun rises, and the closing card appears.
// Star 8 floats over three little cloud puffs near the island's edge; secret 9 is a bench on the rim that looks
// back over the whole journey (found when you both stand at it).
// The island is built in local coordinates around TOWER_C (its group sits there); the cloud steps and the
// beams of light live in world space.
import {
  Group, Mesh, Object3D, BufferGeometry, Float32BufferAttribute, CylinderGeometry, IcosahedronGeometry, SphereGeometry,
  ConeGeometry, BoxGeometry, TorusGeometry, Vector3, Vector2, InstancedMesh, LatheGeometry, Matrix4, Quaternion,
  ShaderMaterial, AdditiveBlending, DoubleSide,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { PAL } from '../look/palette.js';
import { makeWatercolorMaterial, makeGlowMaterial, shared } from '../look/material.js';
import { rng, noise3 } from './rng.js';
import { displace, setMix } from './shapes.js';
import { discGeo } from './peak.js';

export const TOWER_C = new Vector3(45, 0, -85); // island centre (world)
const R = 18;
export const YT = 28;                  // the island's top
const CR = 3.8, RO = 6.4, RM = (CR + RO) / 2; // the tower: its core, the ramp's outer edge and its middle
const FTOP = 2.6, LAND = 0.08;          // the ramp winds 2.6 times round the core; its last stretch is flat
export const YTOP = YT + 15.6;          // the top of the tower (and of the ramp)
const ENTRY = 0.12;                     // the ramp's first stretch, low enough to step on and off anywhere
const GAPS = [[1.1, 1.38], [1.6, 1.88], [2.1, 2.36]]; // where the ramp breaks: bridges of light, only while you hold hands
const RAIL_H = 0.55;
const A0 = -0.62;                       // the ramp starts here (east-north-east, by the path from the cloud steps)
const TAU = Math.PI * 2;
// the cloud steps: 11 clouds from the summit of the Snowy Peak to the island, the 6th a big resting cloud
const STEPS_N = 11, REST = 5, STEP_GAP = 0.55;
const stepHD = (i) => (i === REST ? 1.9 : 1.35); // half depth (along the way): deep enough that a walking jump and a running one both land
const stepHW = (i) => (i === REST ? 2.3 : 1.7); // half width (across)

const sm = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const P = (x, z) => ({ x, z });
const polar = (c, r, th) => P(c.x + Math.cos(th) * r, c.z + Math.sin(th) * r);
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const edgeR = (th) => R * (0.92 + 0.08 * noise3(Math.cos(th) * 1.5 + 7, Math.sin(th) * 1.5, 2.7) + 0.03 * Math.sin(th * 4 + 0.5));
const onTowerL = (x, z) => Math.hypot(x, z) < edgeR(Math.atan2(z, x)) * 0.97;
/** the ramp: f = turns from its start; its height, and which gap (if any) f is in */
const rampY = (f) => YT + (YTOP - YT) * Math.min(1, Math.max(0, f) / (FTOP - LAND));
const fOf = (th) => { const f = ((th - A0) / TAU) % 1; return f < 0 ? f + 1 : f; };
const thOf = (f) => A0 + f * TAU;
function gapOf(f) { for (let i = 0; i < GAPS.length; i++) if (f > GAPS[i][0] && f < GAPS[i][1]) return i; return -1; }
const rampPt = (f, r = RM) => polar(P(0, 0), r, thOf(f));
function distSeg(x, z, a, b) {
  const abx = b.x - a.x, abz = b.z - a.z;
  const t = Math.max(0, Math.min(1, ((x - a.x) * abx + (z - a.z) * abz) / (abx * abx + abz * abz)));
  return Math.hypot(x - (a.x + abx * t), z - (a.z + abz * t));
}

// floor candidates: the highest one you could be standing on (at most 1.2 m above your feet), else the highest
const F = { best: null, top: null, lim: Infinity };
function cand(v) { if (F.top === null || v > F.top) F.top = v; if (v <= F.lim && (F.best === null || v > F.best)) F.best = v; }

// ---- materials ----
let TM = null;
function towerMats() {
  if (TM) return TM;
  TM = {
    ground: makeWatercolorMaterial({ lit: PAL.cloudStone, lit2: PAL.cloudPave, mix: true, rim: 0.0, wash: 0.12 }),
    stone: makeWatercolorMaterial({ lit: PAL.cloudStone, rim: 0.45, wash: 0.14 }),
    stoneMix: makeWatercolorMaterial({ lit: PAL.cloudStone, lit2: PAL.cloudPave, mix: true, rim: 0.4, wash: 0.12 }),
    cloud: makeWatercolorMaterial({ lit: PAL.cloud, rim: 0.6, wash: 0.05, lightRecv: 0.5 }),
    cliff: makeWatercolorMaterial({ lit: PAL.cloud, rim: 0.5, wash: 0.08, lightRecv: 0.4 }),
    brass: makeWatercolorMaterial({ lit: PAL.brass, rim: 0.6, wash: 0.1 }),
    wood: makeWatercolorMaterial({ lit: PAL.wood, rim: 0.3, wash: 0.16 }),
    window: makeGlowMaterial(PAL.glowCore, PAL.glowHalo, 0.7),
    lamp: makeGlowMaterial(PAL.glowCore, PAL.glowHalo, 1.2),
  };
  return TM;
}

// ---- geometry helpers ----
/** a strip swept round the tower: for each step of q, prof(q) gives [radius, height] points across; thOfQ(q) its
 * angle. The front faces point along (sweep direction) x (profile direction): see the callers for which way */
function sweep(qa, qb, n, thOfQ, prof) {
  const pos = [], idx = [];
  let K = 0;
  for (let i = 0; i <= n; i++) {
    const q = qa + (qb - qa) * i / n, th = thOfQ(q), c = Math.cos(th), s = Math.sin(th);
    const pts = prof(q); K = pts.length;
    for (const [r, y] of pts) pos.push(c * r, y, s * r);
  }
  for (let i = 0; i < n; i++) for (let k = 0; k < K - 1; k++) { const a = i * K + k, b = a + 1, cc = a + K, d = cc + 1; idx.push(a, cc, b, b, cc, d); }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
/** a flat radial face at angle th from radius r0 to r1 and height y0 to y1, facing forward (+1) or back (-1) */
function radialFace(th, r0, r1, y0, y1, dir) {
  const c = Math.cos(th), s = Math.sin(th);
  const A = [c * r0, y0, s * r0], B = [c * r1, y0, s * r1], C = [c * r1, y1, s * r1], D = [c * r0, y1, s * r0];
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute([...A, ...B, ...C, ...D], 3));
  g.setIndex(dir > 0 ? [0, 1, 3, 1, 2, 3] : [0, 3, 1, 1, 3, 2]);
  g.computeVertexNormals();
  return g;
}
const clean = (g) => { const b = new BufferGeometry(); b.setAttribute('position', g.getAttribute('position')); b.setAttribute('normal', g.getAttribute('normal')); if (g.getAttribute('aMix')) b.setAttribute('aMix', g.getAttribute('aMix')); b.setIndex(g.index); return b; };
/** one stretch of the ramp from turn fa to fb: its paved top, the low wall on its outer edge, its outer face (down
 * to the island on the first turn, which stands on a solid base) and its underside */
function rampSection(fa, fb, { skirt = false, rail = true, capA = false, capB = false }) {
  const n = Math.max(3, Math.ceil((fb - fa) * 80));
  const RI = CR - 0.08, RR = rail ? RO - 0.24 : RO;
  const h = (f) => rampY(f) + 0.02;
  const bot = (f) => (skirt ? YT - 0.4 : h(f) - 0.5);
  const tops = [], sides = [];
  // the top: inner edge, the golden middle, the outer edge (mix in setMix below)
  tops.push(sweep(fa, fb, n, thOf, (f) => [[RI, h(f)], [RM, h(f)], [RR, h(f)]]));
  if (rail) {
    sides.push(sweep(fa, fb, n, thOf, (f) => [[RR, h(f)], [RR, h(f) + RAIL_H]]));          // the wall's inner face (bottom to top)
    sides.push(sweep(fa, fb, n, thOf, (f) => [[RR, h(f) + RAIL_H], [RO, h(f) + RAIL_H]])); // its top (in to out)
  }
  sides.push(sweep(fa, fb, n, thOf, (f) => [[RO, h(f) + (rail ? RAIL_H : 0)], [RO, bot(f)]])); // the outer face (top to bottom)
  if (!skirt) sides.push(sweep(fa, fb, n, thOf, (f) => [[RO, h(f) - 0.5], [RI, h(f) - 0.5]])); // underside (out to in)
  for (const [f, dir, on] of [[fa, -1, capA], [fb, 1, capB]]) {
    if (!on) continue;
    sides.push(radialFace(thOf(f), RI, RO, bot(f), h(f), dir));
    if (rail) sides.push(radialFace(thOf(f), RR, RO, h(f), h(f) + RAIL_H, dir));
  }
  for (const t of tops) setMix(t, (x, y, z) => 1 - sm(0.25, 1.05, Math.abs(Math.hypot(x, z) - RM)));
  return { tops, sides };
}
/** a cloud slab: a puffy ball with a flat top you can stand on (top at y ~ 0.25) */
function slabGeo(seed) {
  const g = displace(new IcosahedronGeometry(1, 3), 0.1, 1.6, seed);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const y = p.getY(i); p.setY(i, y > 0 ? y * 0.24 : y * 0.62); }
  g.computeVertexNormals();
  return g;
}

// ---- the beams of light (the beacon's, and one from every island when it's lit): camera-facing, additive ----
const BEAM_VERT = (n) => /* glsl */ `
  uniform float uK[${n}];
  attribute vec3 aQ; attribute vec2 aS;
  varying vec2 vUv; varying float vK;
  void main(){
    vK = uK[int(aQ.z + 0.5)];
    vec4 mv = viewMatrix * vec4(position + vec3(0.0, aQ.y * aS.y, 0.0), 1.0);
    mv.x += aQ.x * aS.x * 0.5 * (0.55 + 0.45 * vK);
    vUv = vec2(aQ.x * 0.5 + 0.5, aQ.y);
    gl_Position = projectionMatrix * mv;
  }`;
const BEAM_FRAG = /* glsl */ `
  uniform vec3 uC; uniform float uTime; varying vec2 vUv; varying float vK;
  void main(){
    float x = abs(vUv.x - 0.5) * 2.0;
    float a = pow(1.0 - x, 2.5) * smoothstep(1.0, 0.05, vUv.y) * smoothstep(0.0, 0.012, vUv.y);
    a *= (0.8 + 0.2 * sin(uTime * 2.0 + vUv.y * 40.0)) * vK;
    gl_FragColor = vec4(uC * a, 1.0);
  }`;
// ---- the bridges of light across the gaps: a shimmering floor and a glowing rail; a dotted line of sparks while unlit ----
const BRIDGE_VERT = /* glsl */ `
  attribute vec3 aB; varying vec3 vB;
  void main(){ vB = aB; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const BRIDGE_FRAG = /* glsl */ `
  uniform float uK; uniform float uTime; uniform vec3 uCore; uniform vec3 uHalo; varying vec3 vB;
  void main(){
    float u = vB.x, v = vB.y;
    float ends = smoothstep(0.0, 0.03, u) * smoothstep(1.0, 0.97, u);
    // unlit: a dotted line of soft sparks along each edge, drifting across, so you can see where the floor will be
    float dots = smoothstep(0.32, 0.0, abs(fract(u * 18.0 - uTime * 0.4) - 0.5));
    float a;
    if (vB.z < 0.5) {
      float d = abs(v - 0.5) * 2.0;
      float edge = smoothstep(0.75, 0.97, d);
      float flow = 0.5 + 0.5 * sin(u * 38.0 - uTime * 3.0 + v * 4.0);
      a = uK * (0.2 + 0.16 * flow + edge * 0.75) + (1.0 - uK) * smoothstep(0.86, 0.97, d) * dots * 0.55;
    } else {
      float up = 1.0 - v;
      a = uK * 0.65 * up * up;
    }
    a *= ends;
    gl_FragColor = vec4(mix(uHalo, uCore, 0.5 + 0.5 * a) * a, 1.0);
  }`;

/**
 * Build the Cloud Kingdom into ctx.root (see buildHollow for ctx). `peak` gives the summit the cloud steps start
 * from; `beamFrom` the islands that send up a beam of light when the beacon is lit (world positions).
 */
export function buildTower(ctx, peak, beamFrom) {
  const { root, lights, colliders } = ctx;
  const M = towerMats();
  const g = new Group();
  g.position.copy(TOWER_C);
  root.add(g);
  const W = (x, z) => ({ x: x + TOWER_C.x, z: z + TOWER_C.z });
  const addCol = (x, z, r, o) => { const w = W(x, z); const c = { x: w.x, z: w.z, r, ...o }; colliders.push(c); return c; };
  const addSeg = (a, b, r, o) => { const wa = W(a.x, a.z), wb = W(b.x, b.z); const c = { ax: wa.x, az: wa.z, bx: wb.x, bz: wb.z, r, ...o }; colliders.push(c); return c; };
  const wv = (x, z, y = YT) => { const w = W(x, z); return new Vector3(w.x, y, w.z); };

  // ---- the cloud steps: a gentle arc from the summit's edge to the island's rim, bowing out to the north. Its ends
  // sit where the line between the two meets each edge, so it leaves the summit and arrives at the island nearly
  // straight on ----
  const mc = peak.mc, Y3 = peak.levels[3];
  const sAt = [];
  let L = STEP_GAP;
  for (let i = 0; i < STEPS_N; i++) { L += stepHD(i); sAt.push(L); L += stepHD(i) + STEP_GAP; }
  const phS = Math.atan2(TOWER_C.z - mc.z, TOWER_C.x - mc.x), phE = phS + Math.PI;
  let arc = null;
  {
    const r0 = peak.tierR(2, phS) + 0.05;
    const S0 = P(mc.x + Math.cos(phS) * r0, mc.z + Math.sin(phS) * r0);
    const eL = polar(P(0, 0), edgeR(phE) * 0.97 - 0.1, phE), E0 = W(eL.x, eL.z);
    const dx = E0.x - S0.x, dz = E0.z - S0.z, c = Math.hypot(dx, dz);
    const ux = dx / c, uz = dz / c;
    let nx = -uz, nz = ux;
    if (nz > 0) { nx = -nx; nz = -nz; } // it bows out to the north, over the open cloud sea
    const ratio = Math.max(L / c, 1.0005);
    let lo = 1e-3, hi = TAU - 1e-3;
    for (let k = 0; k < 60; k++) { const m = (lo + hi) / 2; if (m / (2 * Math.sin(m / 2)) < ratio) lo = m; else hi = m; }
    const Th = (lo + hi) / 2, ra = c / (2 * Math.sin(Th / 2));
    const Cx = (S0.x + E0.x) / 2 - nx * ra * Math.cos(Th / 2), Cz = (S0.z + E0.z) / 2 - nz * ra * Math.cos(Th / 2);
    const p0 = Math.atan2(S0.z - Cz, S0.x - Cx);
    const sg = Math.sign(wrap(Math.atan2(nz, nx) - p0)) || 1;
    const k = (ra * Th) / L; // stretch the gaps a touch if the arc came out longer
    arc = { S0, E0, Cx, Cz, ra, p0, sg, k, Th };
  }
  const arcAt = (s) => { const ph = arc.p0 + arc.sg * s * arc.k / arc.ra; return { x: arc.Cx + Math.cos(ph) * arc.ra, z: arc.Cz + Math.sin(ph) * arc.ra, ax: -Math.sin(ph) * arc.sg, az: Math.cos(ph) * arc.sg }; };
  const steps = sAt.map((s, i) => {
    const a = arcAt(s);
    return { x: a.x, z: a.z, ax: a.ax, az: a.az, hd: stepHD(i), hw: stepHW(i), top: Y3 + (YT - Y3) * (i + 1) / (STEPS_N + 1), ph: i * 1.7 };
  });
  const SB = { x0: Infinity, x1: -Infinity, z0: Infinity, z1: -Infinity };
  for (const S of steps) { SB.x0 = Math.min(SB.x0, S.x - 3); SB.x1 = Math.max(SB.x1, S.x + 3); SB.z0 = Math.min(SB.z0, S.z - 3); SB.z1 = Math.max(SB.z1, S.z + 3); }
  const stepK = new Float32Array(STEPS_N); // 0..1 how formed each step is (the quest drives it)
  const clock = { t: 0 }, bridge = { on: false };
  const bob = (i) => (i === REST ? 0 : Math.sin(clock.t * 0.8 + steps[i].ph) * 0.07);

  // ---- what stands where on the island (local) ----
  const ARRIVE_TH = Math.atan2(arc.E0.z - TOWER_C.z, arc.E0.x - TOWER_C.x);
  const ARRIVE = polar(P(0, 0), edgeR(ARRIVE_TH) * 0.97 - 0.6, ARRIVE_TH);
  const ENTRY_PT = rampPt(0.05, RO + 0.9);
  const pathDir = (() => { const dx = ENTRY_PT.x - ARRIVE.x, dz = ENTRY_PT.z - ARRIVE.z, d = Math.hypot(dx, dz); return { x: dx / d, z: dz / d, len: d }; })();
  const along = (t, lat = 0) => P(ARRIVE.x + pathDir.x * pathDir.len * t - pathDir.z * lat, ARRIVE.z + pathDir.z * pathDir.len * t + pathDir.x * lat);
  const RING = RO + 1.7; // a paved ring round the tower's foot
  const BENCH_TH = Math.atan2(0 - TOWER_C.z, 0 - TOWER_C.x); // the bench looks back towards the Lantern Forest
  const BENCH = polar(P(0, 0), edgeR(BENCH_TH) - 3.0, BENCH_TH);
  const LOOK = polar(P(0, 0), edgeR(BENCH_TH) - 2.0, BENCH_TH); // stand here, side by side, and look
  const PUFF_TH = BENCH_TH + 0.45;
  const PUFFS = [0, 1, 2].map((k) => { const th = PUFF_TH + k * 0.14, p = polar(P(0, 0), edgeR(th) - 4.2 - k * 0.5, th); return { x: p.x, z: p.z, r: 0.78, top: YT + 1.0 * (k + 1) }; });
  const WAY = along(0.22, -1.2); // the waystone just past the arrival, a little off the path
  const FOOTPATHS = [[ARRIVE, ENTRY_PT, 1.5], [polar(P(0, 0), RING, BENCH_TH), polar(P(0, 0), edgeR(BENCH_TH) - 3.4, BENCH_TH), 1.0]];
  const pathMask = (x, z) => {
    let f = 1 - sm(0.7, 1.25, Math.abs(Math.hypot(x, z) - RING) + (noise3(x * 0.6, 5, z * 0.6) - 0.5) * 0.3);
    for (const [a, b, w] of FOOTPATHS) f = Math.max(f, 1 - sm(w * 0.45, w, distSeg(x, z, a, b) + (noise3(x * 0.6, 3, z * 0.6) - 0.5) * 0.5));
    return f;
  };

  // ---- the island: a flat top of pale cloud-stone, a cloud underneath ----
  const top = discGeo(P(0, 0), (th) => edgeR(th) + 0.06, () => YT + 0.02, 30, 110);
  setMix(top, (x, y, z) => pathMask(x, z));
  g.add(new Mesh(top, M.ground));
  g.add(new Mesh(ctx.buildCliff(edgeR, () => YT, 14, 71, 72, 12), M.cliff));
  // puffy clouds round the rim and under the island (one instanced draw; their tops stay below the ground)
  const puffGeo = displace(new IcosahedronGeometry(1, 2), 0.12, 1.4, 5);
  {
    const pr = rng(1031), list = [];
    for (let i = 0; i < 48; i++) {
      const th = (i / 48) * TAU + pr() * 0.08, er = edgeR(th), s = 1.1 + pr() * 1.5;
      const p = polar(P(0, 0), er + 0.3 + pr() * 1.4, th), w = W(p.x, p.z);
      if (Math.hypot(w.x - arc.E0.x, w.z - arc.E0.z) < 3.2) continue; // keep the cloud steps' landing clear
      list.push([p.x, YT - 0.45 - s * 0.85 - pr() * 0.8, p.z, s]);
    }
    for (let i = 0; i < 18; i++) { const th = pr() * TAU, d = pr() * 13, s = 3 + pr() * 3.5; list.push([Math.cos(th) * d, YT - 7 - pr() * 6, Math.sin(th) * d, s]); }
    const im = new InstancedMesh(puffGeo, M.cloud, list.length);
    const o = new Object3D();
    list.forEach(([x, y, z, s], i) => { o.position.set(x, y, z); o.scale.set(s, s * 0.75, s); o.rotation.y = i * 1.3; o.updateMatrix(); im.setMatrixAt(i, o.matrix); });
    g.add(im);
  }

  // ---- the tower: a round core, a ramp spiralling round it, a crown on top ----
  const coreH = YTOP - YT + 0.8;
  const coreGeo = displace(new CylinderGeometry(CR, CR + 0.2, coreH, 48, 8), 0.04, 1.1, 3).translate(0, YT - 0.8 + coreH / 2, 0);
  setMix(coreGeo, (x, y, z) => (y > YTOP - 0.05 ? 1 - sm(CR - 1.4, CR - 0.9, Math.hypot(x, z)) * 0.6 : sm(YTOP - 1.3, YTOP - 0.7, y)));
  const core = new Mesh(coreGeo, M.stoneMix);
  core.userData.occluder = true;
  g.add(core);
  addCol(0, 0, CR, { top: YTOP });
  {
    const parts = [
      rampSection(0, ENTRY, { skirt: true, rail: false }),
      rampSection(ENTRY, 1.0, { skirt: true, capB: true }),
      rampSection(1.0, GAPS[0][0], { capB: true }),
      rampSection(GAPS[0][1], GAPS[1][0], { capA: true, capB: true }),
      rampSection(GAPS[1][1], GAPS[2][0], { capA: true, capB: true }),
      rampSection(GAPS[2][1], FTOP, { capA: true, capB: true }),
    ];
    const tops = new Mesh(mergeGeometries(parts.flatMap((p) => p.tops).map(clean)), M.ground);
    const sides = new Mesh(mergeGeometries(parts.flatMap((p) => p.sides).map(clean)), M.stone);
    tops.userData.occluder = true; sides.userData.occluder = true;
    g.add(tops, sides);
  }
  // the crown: a low wall round the top, open where the ramp arrives, with golden finials
  const OPEN0 = thOf(FTOP - 0.15), OPEN1 = thOf(FTOP);
  {
    const geos = [];
    const RC0 = CR - 0.32, RC1 = CR - 0.04, y0 = YTOP, y1 = YTOP + RAIL_H;
    const th = (q) => q;
    geos.push(sweep(OPEN1, OPEN0 + TAU, 120, th, () => [[RC0, y0], [RC0, y1]]));
    geos.push(sweep(OPEN1, OPEN0 + TAU, 120, th, () => [[RC0, y1], [RC1, y1]]));
    geos.push(sweep(OPEN1, OPEN0 + TAU, 120, th, () => [[RC1, y1], [RC1, y0 - 0.2]]));
    geos.push(radialFace(OPEN1, RC0, RC1, y0, y1, -1), radialFace(OPEN0 + TAU, RC0, RC1, y0, y1, 1));
    // and a wall across the end of the landing, so the ramp doesn't just stop at the sky
    const e = thOf(FTOP);
    geos.push(radialFace(e - 0.004, CR - 0.05, RO, y0 - 0.5, y1, 1), radialFace(e - 0.05, CR - 0.05, RO, y0, y1, -1));
    geos.push(sweep(e - 0.05, e - 0.004, 2, th, () => [[CR - 0.05, y1], [RO, y1]]));
    const crown = new Mesh(mergeGeometries(geos.map(clean)), M.stone);
    g.add(crown);
    for (let i = 0; i < 6; i++) {
      const a = OPEN1 + (OPEN0 + TAU - OPEN1) * (i + 0.5) / 6, p = polar(P(0, 0), (RC0 + RC1) / 2, a);
      const post = new Mesh(new CylinderGeometry(0.07, 0.09, 0.5, 8), M.brass); post.position.set(p.x, y1 + 0.25, p.z); g.add(post);
      const orb = new Mesh(new SphereGeometry(0.13, 10, 8), M.lamp); orb.position.set(p.x, y1 + 0.58, p.z); g.add(orb);
      if (i % 2 === 0) lights.push({ obj: orb, str: 0.3 });
    }
    // colliders: the crown (only up at the top), the end of the landing
    const N = 40;
    for (let i = 0; i < N; i++) {
      const t0 = (i / N) * TAU, t1 = ((i + 1) / N) * TAU, d = (((t0 + t1) / 2 - OPEN0) % TAU + TAU) % TAU;
      if (d < OPEN1 - OPEN0 + 0.05 || d > TAU - 0.05) continue; // the way in from the landing
      addSeg(polar(P(0, 0), CR - 0.18, t0), polar(P(0, 0), CR - 0.18, t1), 0.12, { bottom: YTOP - 0.5 });
    }
    addSeg(polar(P(0, 0), CR - 0.2, e - 0.03), polar(P(0, 0), RO, e - 0.03), 0.15, { bottom: YTOP - 1.0 });
  }
  // the outer wall of the ramp: a wall all the way round (open at ground level by the ramp's foot); the base under
  // the first turn is solid, so nobody walks in under it
  {
    const N = 90;
    for (let i = 0; i < N; i++) {
      const t0 = (i / N) * TAU, t1 = ((i + 1) / N) * TAU, f = fOf((t0 + t1) / 2);
      addSeg(polar(P(0, 0), RO - 0.1, t0), polar(P(0, 0), RO - 0.1, t1), 0.15, f < ENTRY ? { bottom: YT + 1.5 } : undefined);
    }
    addSeg(polar(P(0, 0), CR, A0), polar(P(0, 0), RO, A0), 0.15, { top: YT + 3.0 }); // behind the ramp's foot
  }
  // windows: tall glowing slits in the core between the turns of the ramp
  {
    for (let j = 0; j < 7; j++) {
      const a = A0 + TAU * (j / 7 + 0.05), f0 = fOf(a);
      for (let k = 0; k < 3; k++) {
        const y = rampY(f0 + k) + 3.0;
        if (f0 + k > FTOP - 0.2 || y > YTOP - 1.6) continue;
        const p = polar(P(0, 0), CR + 0.12, a);
        const win = new Mesh(new BoxGeometry(0.12, 1.0, 0.5), M.window);
        win.position.set(p.x, y, p.z); win.rotation.y = -a;
        const sill = new Mesh(new BoxGeometry(0.22, 0.08, 0.66), M.brass);
        sill.position.set(p.x, y - 0.54, p.z); sill.rotation.y = -a;
        const arch = new Mesh(new CylinderGeometry(0.25, 0.25, 0.12, 12, 1, false, 0, Math.PI), M.window);
        arch.rotation.set(0, -a, Math.PI / 2); arch.position.set(p.x, y + 0.5, p.z);
        g.add(win, sill, arch);
      }
    }
  }

  // ---- the bridges of light across the three gaps (one draw) ----
  const bridgeMat = new ShaderMaterial({
    uniforms: { uK: { value: 0 }, uTime: shared.uTime, uCore: { value: PAL.glowCore.clone() }, uHalo: { value: PAL.glowHalo.clone() } },
    vertexShader: BRIDGE_VERT, fragmentShader: BRIDGE_FRAG,
    transparent: true, depthWrite: false, blending: AdditiveBlending, side: DoubleSide,
  });
  const bridgeLights = [];
  {
    const pos = [], aB = [], idx = [];
    const ribbon = (fa, fb, prof, kind) => {
      const n = 28, o = pos.length / 3;
      for (let i = 0; i <= n; i++) {
        const u = i / n, f = fa + (fb - fa) * u, th = thOf(f), c = Math.cos(th), s = Math.sin(th);
        prof(f).forEach(([r, y], j) => { pos.push(c * r, y, s * r); aB.push(u, j, kind); });
      }
      for (let i = 0; i < n; i++) { const a = o + i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    };
    for (const [fa, fb] of GAPS) {
      ribbon(fa - 0.01, fb + 0.01, (f) => [[CR - 0.02, rampY(f) + 0.04], [RO - 0.08, rampY(f) + 0.04]], 0);
      ribbon(fa - 0.01, fb + 0.01, (f) => [[RO - 0.14, rampY(f) + 0.04], [RO - 0.14, rampY(f) + 0.8]], 1);
      const mid = rampPt((fa + fb) / 2), d = new Object3D();
      d.position.set(mid.x, rampY((fa + fb) / 2) + 0.8, mid.z);
      g.add(d);
      const l = { obj: d, str: 0 }; lights.push(l); bridgeLights.push(l);
    }
    const geo = new BufferGeometry();
    geo.setAttribute('position', new Float32BufferAttribute(pos, 3));
    geo.setAttribute('aB', new Float32BufferAttribute(aB, 3));
    geo.setIndex(idx);
    const mesh = new Mesh(geo, bridgeMat);
    mesh.userData.dynamic = true; mesh.renderOrder = 2;
    g.add(mesh);
  }

  // ---- the beacon: a golden bowl on a pedestal in the middle of the top, a sleeping spark in it ----
  const beacon = (() => {
    const grp = new Group();
    grp.position.set(0, YTOP, 0);
    const ped = new Mesh(displace(new CylinderGeometry(0.5, 0.72, 0.85, 12, 2), 0.03, 3, 5).translate(0, 0.42, 0), M.stone);
    const bowlPts = [new Vector2(0.2, 0), new Vector2(0.62, 0.08), new Vector2(0.82, 0.34), new Vector2(0.76, 0.42), new Vector2(0.52, 0.24), new Vector2(0.01, 0.2)];
    const bowl = new Mesh(new LatheGeometry(bowlPts, 18), M.brass);
    bowl.position.y = 0.82;
    const sparkMat = makeGlowMaterial(PAL.glowCore, PAL.glowHalo, 0.6);
    const spark = new Mesh(new SphereGeometry(0.17, 12, 10), sparkMat);
    spark.position.y = 1.2; spark.userData.dynamic = true;
    const flameMat = makeGlowMaterial(PAL.glowCore, PAL.glowHalo, 1.5);
    const flames = new Group();
    for (let k = 0; k < 4; k++) {
      const f = new Mesh(new ConeGeometry(0.3 - k * 0.05, 1.15 - k * 0.18, 8).translate(0, 0.55 - k * 0.07, 0), flameMat);
      f.position.set(Math.cos(k * 1.7) * (k ? 0.16 : 0), 0, Math.sin(k * 1.7) * (k ? 0.16 : 0));
      flames.add(f);
    }
    flames.position.y = 1.05; flames.visible = false; flames.userData.dynamic = true;
    const ringMat = makeGlowMaterial(PAL.glowCore, PAL.glowHalo, 0.8);
    const ring = new Mesh(new TorusGeometry(2.2, 0.05, 6, 48).rotateX(-Math.PI / 2), ringMat);
    ring.position.y = 0.07; ring.userData.dynamic = true;
    grp.add(ped, bowl, spark, flames, ring);
    g.add(grp);
    addCol(0, 0, 0.78);
    const light = { obj: spark, str: 0.25 };
    lights.push(light);
    return { grp, spark, sparkMat, flames, flameMat, ring, ringMat, light, pos: wv(0, 0, YTOP), head: wv(0, 0, YTOP + 1.6) };
  })();

  // ---- the arrival: a golden arch over the path, a waystone, golden lanterns up to the tower ----
  {
    const ap = along(0.08), grp = new Group();
    grp.position.set(ap.x, YT, ap.z);
    const lx = -pathDir.z, lz = pathDir.x; // across the path
    grp.rotation.y = Math.atan2(-lz, lx);
    for (const s of [-1, 1]) {
      const pil = new Mesh(displace(new BoxGeometry(0.5, 3.2, 0.5, 2, 4, 2), 0.03, 2, s + 9), M.stone);
      pil.position.set(1.9 * s, 1.6, 0); grp.add(pil);
      const knob = new Mesh(new SphereGeometry(0.2, 10, 8), M.brass); knob.position.set(1.9 * s, 3.35, 0); grp.add(knob);
      addCol(ap.x + lx * 1.9 * s, ap.z + lz * 1.9 * s, 0.35);
    }
    const arch = new Mesh(new TorusGeometry(1.9, 0.17, 8, 32, Math.PI), M.brass);
    arch.position.y = 3.2; grp.add(arch);
    const gem = new Mesh(new SphereGeometry(0.2, 10, 8), M.lamp); gem.position.y = 5.15; grp.add(gem);
    lights.push({ obj: gem, str: 0.35 });
    g.add(grp);
  }
  const wayW = W(WAY.x, WAY.z);
  const way = ctx.makeWaystone(wayW.x, wayW.z, YT);
  root.add(way.obj);
  colliders.push({ x: wayW.x + 1.25, z: wayW.z, r: 0.2 });
  const lanterns = [];
  for (const t of [0.45, 0.7, 0.93]) {
    for (const s of [-1, 1]) {
      const p = along(t, 1.9 * s);
      const post = new Mesh(new CylinderGeometry(0.07, 0.1, 1.8, 8), M.brass);
      post.position.set(p.x, YT + 0.9, p.z);
      const lamp = new Mesh(new SphereGeometry(0.2, 12, 10), M.lamp);
      lamp.position.set(p.x, YT + 1.98, p.z);
      const cap = new Mesh(new ConeGeometry(0.24, 0.22, 10), M.brass);
      cap.position.set(p.x, YT + 2.25, p.z);
      g.add(post, lamp, cap);
      addCol(p.x, p.z, 0.15);
      lights.push({ obj: lamp, str: 0.45 });
      lanterns.push(lamp);
    }
  }

  // ---- the lookout bench (the secret): on the rim, looking back over everywhere you've been ----
  {
    const grp = new Group();
    grp.position.set(BENCH.x, YT, BENCH.z);
    grp.rotation.y = Math.PI / 2 - BENCH_TH; // its front faces out, over the edge
    const seat = new Mesh(displace(new BoxGeometry(1.7, 0.12, 0.5, 4, 1, 2), 0.01, 3, 2), M.wood); seat.position.set(0, 0.46, 0);
    const back = new Mesh(displace(new BoxGeometry(1.7, 0.45, 0.1, 4, 2, 1), 0.01, 3, 3), M.wood); back.position.set(0, 0.85, -0.24); back.rotation.x = -0.12;
    grp.add(seat, back);
    for (const sx of [-0.7, 0.7]) for (const sz of [-0.18, 0.18]) {
      const leg = new Mesh(new BoxGeometry(0.1, 0.44, 0.1), M.stone); leg.position.set(sx, 0.22, sz); grp.add(leg);
    }
    // a little heart carved in the back, and two cushions, one red, one blue
    const c1 = new Mesh(displace(new BoxGeometry(0.6, 0.1, 0.38, 2, 1, 2), 0.02, 3, 4), makeWatercolorMaterial({ lit: PAL.capeRed, rim: 0.4 }));
    const c2 = new Mesh(displace(new BoxGeometry(0.6, 0.1, 0.38, 2, 1, 2), 0.02, 3, 5), makeWatercolorMaterial({ lit: PAL.capeBlue, rim: 0.4 }));
    c1.position.set(-0.42, 0.56, 0.02); c2.position.set(0.42, 0.56, 0.02);
    grp.add(c1, c2);
    g.add(grp);
    const ax = Math.cos(BENCH_TH + Math.PI / 2), az = Math.sin(BENCH_TH + Math.PI / 2);
    addSeg(P(BENCH.x - ax * 0.8, BENCH.z - az * 0.8), P(BENCH.x + ax * 0.8, BENCH.z + az * 0.8), 0.3);
  }

  // ---- three little cloud puffs, each a step higher, and star 8 over the last ----
  for (const [k, q] of PUFFS.entries()) {
    const m = new Mesh(slabGeo(40 + k), M.cloud);
    m.scale.set(0.95, 1, 0.95); m.position.set(q.x, q.top - 0.22, q.z); m.rotation.y = k;
    g.add(m);
    const belly = new Mesh(puffGeo, M.cloud); belly.scale.set(0.7, 0.45, 0.7); belly.position.set(q.x, q.top - 0.55, q.z); g.add(belly);
  }
  const starPos = wv(PUFFS[2].x, PUFFS[2].z, PUFFS[2].top + 1.15);

  // ---- cloud trees: soft puffs on slender stems, off the paths ----
  {
    const tr = rng(1203), trees = [];
    const keep = [ARRIVE, WAY, BENCH, LOOK, ...PUFFS, ...[0.45, 0.7, 0.93].flatMap((t) => [along(t, 1.9), along(t, -1.9)]), along(0.08, 1.9), along(0.08, -1.9)];
    for (let n = 0; n < 600 && trees.length < 9; n++) {
      const a = tr() * TAU, d = RO + 4 + tr() * (R - RO - 4);
      const x = Math.cos(a) * d, z = Math.sin(a) * d;
      if (d > edgeR(a) * 0.82 || pathMask(x, z) > 0.08) continue;
      if (keep.some((p) => Math.hypot(p.x - x, p.z - z) < 3.0) || trees.some((t) => Math.hypot(t.x - x, t.z - z) < 3.4)) continue;
      const h = 2.0 + tr() * 1.2, grp = new Group();
      const stem = new Mesh(new CylinderGeometry(0.06, 0.1, h, 7), M.stone); stem.position.y = h / 2; grp.add(stem);
      for (let k = 0; k < 3; k++) {
        const s = 0.75 - k * 0.15 + tr() * 0.2, pf = new Mesh(puffGeo, M.cloud);
        pf.scale.set(s * 1.1, s * 0.85, s * 1.1); pf.position.set((tr() - 0.5) * 0.5, h + k * 0.55 - 0.1, (tr() - 0.5) * 0.5); grp.add(pf);
      }
      grp.position.set(x, YT, z); grp.rotation.y = tr() * TAU;
      g.add(grp);
      addCol(x, z, 0.25);
      trees.push({ x, z });
    }
  }

  // ---- the cloud steps (world space): flat-topped cloud slabs with a few puffs round each (two instanced draws) ----
  const slabs = new InstancedMesh(slabGeo(11), M.cloud, STEPS_N);
  const PER = 4;
  const puffs = new InstancedMesh(puffGeo, M.cloud, STEPS_N * PER);
  for (const im of [slabs, puffs]) { im.frustumCulled = false; im.userData.dynamic = true; im.visible = false; root.add(im); }
  const puffAt = [[0.55, 0.92, 0.62], [-0.65, -0.85, 0.55], [0.05, -1.0, 0.5]]; // along, across (in half sizes), size
  const _m = new Matrix4(), _q = new Quaternion(), _p = new Vector3(), _s = new Vector3(), _up = new Vector3(0, 1, 0);
  const stepQ = steps.map((S) => new Quaternion().setFromAxisAngle(_up, Math.atan2(-S.az, S.ax)));
  /** place the cloud steps: each forms (grows up out of the haze) as stepK goes 0 -> 1, and drifts gently */
  const animateSteps = () => {
    let any = false;
    for (let i = 0; i < STEPS_N; i++) {
      const S = steps[i], k = stepK[i], e = 1 - Math.pow(1 - Math.min(1, k), 3);
      const y = S.top + bob(i) - (1 - e) * 2.4, sc = k <= 0.001 ? 0 : 0.25 + 0.75 * e;
      if (k > 0.001) any = true;
      _m.compose(_p.set(S.x, y - 0.22, S.z), stepQ[i], _s.set(S.hd * 1.08 * sc, sc, S.hw * 1.06 * sc));
      slabs.setMatrixAt(i, _m);
      for (let j = 0; j < PER; j++) {
        let lx, lz, s, py;
        if (j < 3) { const [u, v, ss] = puffAt[j]; lx = u * S.hd; lz = v * S.hw; s = ss * (i === REST ? 1.3 : 1); py = y - 0.18 - s * 0.82; } else { lx = 0; lz = 0; s = 1; py = y - 0.75; }
        _p.set(S.x + S.ax * lx - S.az * lz, py, S.z + S.az * lx + S.ax * lz);
        if (j < 3) _s.set(s * sc, s * 0.75 * sc, s * sc); else _s.set(S.hd * 0.9 * sc, 0.6 * sc, S.hw * 0.8 * sc);
        _m.compose(_p, stepQ[i], _s);
        puffs.setMatrixAt(i * PER + j, _m);
      }
    }
    slabs.visible = puffs.visible = any;
    slabs.instanceMatrix.needsUpdate = true; puffs.instanceMatrix.needsUpdate = true;
  };
  animateSteps();
  // a waystone on the resting cloud (once it has formed)
  const RS = steps[REST], restAt = P(RS.x - RS.az * 1.0, RS.z + RS.ax * 1.0);
  const rest = ctx.makeWaystone(restAt.x, restAt.z, RS.top);
  rest.obj.visible = false; rest.obj.userData.dynamic = true;
  root.add(rest.obj);
  colliders.push({ x: restAt.x + 1.25, z: restAt.z, r: 0.2, bottom: RS.top - 1.0 });
  Object.defineProperty(rest, 'ready', { get: () => stepK[REST] >= 0.9 });

  // ---- beams of light: the beacon's, and one from every island (one draw, all off until the beacon is lit) ----
  const beamList = [{ p: wv(0, 0, YTOP + 1.0), w: 2.6, h: 320 }, ...beamFrom.map((v) => ({ p: v, w: 4.4, h: 300 }))];
  const beamK = new Array(beamList.length).fill(0);
  const beams = (() => {
    const pos = [], q = [], s = [], idx = [];
    beamList.forEach((b, i) => {
      const o = i * 4;
      for (const [sx, v] of [[-1, 0], [1, 0], [1, 1], [-1, 1]]) { pos.push(b.p.x, b.p.y, b.p.z); q.push(sx, v, i); s.push(b.w, b.h); }
      idx.push(o, o + 1, o + 2, o, o + 2, o + 3);
    });
    const geo = new BufferGeometry();
    geo.setAttribute('position', new Float32BufferAttribute(pos, 3));
    geo.setAttribute('aQ', new Float32BufferAttribute(q, 3));
    geo.setAttribute('aS', new Float32BufferAttribute(s, 2));
    geo.setIndex(idx);
    const mat = new ShaderMaterial({
      uniforms: { uK: { value: beamK }, uC: { value: PAL.glowCore.clone() }, uTime: shared.uTime },
      vertexShader: BEAM_VERT(beamList.length), fragmentShader: BEAM_FRAG,
      transparent: true, depthWrite: false, blending: AdditiveBlending, side: DoubleSide,
    });
    const m = new Mesh(geo, mat);
    m.frustumCulled = false; m.visible = false; m.userData.dynamic = true;
    root.add(m);
    return m;
  })();

  // ---- walking ----
  const toL = (wx, wz) => [wx - TOWER_C.x, wz - TOWER_C.z];
  const nearL = (x, z) => Math.abs(x) < R + 1 && Math.abs(z) < R + 1;
  const inSteps = (wx, wz) => wx > SB.x0 && wx < SB.x1 && wz > SB.z0 && wz < SB.z1;
  const onStep = (i, wx, wz, k) => { const S = steps[i], dx = wx - S.x, dz = wz - S.z; const u = (dx * S.ax + dz * S.az) / (S.hd * k), v = (dz * S.ax - dx * S.az) / (S.hw * k); return u * u + v * v < 1; };
  return {
    root: g, steps, stepK, beacon, beams, beamK, beamCount: beamList.length, bridgeMat, bridgeLights, lanterns, way, rest, restIndex: REST,
    center: wv(0, 0, YT), radius: R, top: YTOP, levelY: YT, starPos, gaps: GAPS, ftop: FTOP,
    arrive: wv(ARRIVE.x, ARRIVE.z), entry: wv(rampPt(0.04).x, rampPt(0.04).z, rampY(0.04)),
    stepsFrom: new Vector3(arc.S0.x, Y3, arc.S0.z), stepsTo: new Vector3(arc.E0.x, YT, arc.E0.z),
    bench: wv(BENCH.x, BENCH.z), lookout: wv(LOOK.x, LOOK.z), puffs: PUFFS.map((q) => wv(q.x, q.z, q.top)),
    windowMat: M.window, lampMat: M.lamp,
    /** a point on the ramp (world): f turns up from its foot, dr out from the middle of its width */
    rampAt(f, dr = 0) { const q = rampPt(f, RM + dr); return wv(q.x, q.z, rampY(f)); },
    /** how far up the ramp (in turns) a point on it is */
    rampF(p) { const [x, z] = toL(p.x, p.z), f0 = fOf(Math.atan2(z, x)), fh = (p.y - YT) * (FTOP - LAND) / (YTOP - YT); return Math.min(FTOP, f0 + Math.round(fh - f0)); },
    stepAt(i) { const S = steps[i]; return new Vector3(S.x, S.top, S.z); },
    /** the quest: the bridges of light hold; the clock the cloud steps drift by */
    setBridge(on) { bridge.on = on; },
    setTime(t) { clock.t = t; },
    animateSteps,
    /** walkable floor at world x,z: the highest one at most 1.2 m above y (if given), else the highest (null = none) */
    floor(wx, wz, y) {
      F.best = null; F.top = null; F.lim = y === undefined ? Infinity : y + 1.2;
      const [x, z] = toL(wx, wz);
      if (nearL(x, z)) {
        const r = Math.hypot(x, z);
        if (r < CR) { if (YTOP <= F.lim) cand(YTOP); } // the core is a solid column: its top only counts from up there
        else if (r < edgeR(Math.atan2(z, x)) * 0.97) cand(YT);
        if (r >= CR - 0.1 && r <= RO + 0.05) {
          const f0 = fOf(Math.atan2(z, x));
          for (let k = 0; k < 3; k++) { const f = f0 + k; if (f > FTOP) break; if (!bridge.on && gapOf(f) >= 0) continue; cand(rampY(f)); }
        }
        for (let i = 0; i < PUFFS.length; i++) { const q = PUFFS[i]; if (Math.hypot(x - q.x, z - q.z) < q.r && !(y < q.top - 0.8)) cand(q.top); } // hop up, puff by puff
      }
      // a cloud step only catches you once you're nearly up to it (no stepping up a whole cloud: you have to jump)
      if (inSteps(wx, wz)) for (let i = 0; i < STEPS_N; i++) if (stepK[i] >= 0.9 && onStep(i, wx, wz, 0.95) && !(y < steps[i].top - 0.8)) cand(steps[i].top + bob(i));
      return F.best ?? F.top;
    },
    onIsland(p) { const [x, z] = toL(p.x, p.z); return nearL(x, z) && onTowerL(x, z) && p.y > YT - 3 && p.y < YTOP + 8; },
    /** up on the tower: on the ramp or the top */
    onTower(p) { const [x, z] = toL(p.x, p.z); return Math.hypot(x, z) < RO + 0.3 && p.y > YT + 0.6; },
    /** standing on one of the cloud steps */
    onCloud(p) { if (!inSteps(p.x, p.z)) return false; for (let i = 0; i < STEPS_N; i++) if (stepK[i] >= 0.9 && onStep(i, p.x, p.z, 1.0) && Math.abs(p.y - steps[i].top) < 0.4) return true; return false; },
    /** in the air over the cloud steps (not over the island) */
    overSteps(p) {
      if (!inSteps(p.x, p.z) || this.onIsland(p)) return false;
      for (const S of steps) if (Math.hypot(p.x - S.x, p.z - S.z) < 4.5) return true;
      return false;
    },
    /** at the top of the tower, within d of the beacon */
    atTop(p, d = 99) { const [x, z] = toL(p.x, p.z); return Math.hypot(x, z) < d && Math.abs(p.y - YTOP) < 1.5; },
    /** which bridge of light you're near (or on), within d along the ramp; -1 = none */
    nearGap(p, d = 0.06) {
      const [x, z] = toL(p.x, p.z), r = Math.hypot(x, z);
      if (r < CR - 0.3 || r > RO + 0.3) return -1;
      const f0 = fOf(Math.atan2(z, x));
      for (let k = 0; k < 3; k++) { const f = f0 + k; if (Math.abs(p.y - rampY(f)) > 1.2) continue; for (let i = 0; i < GAPS.length; i++) if (f > GAPS[i][0] - d && f < GAPS[i][1] + d) return i; }
      return -1;
    },
    surface(p) {
      if (inSteps(p.x, p.z)) for (let i = 0; i < STEPS_N; i++) if (stepK[i] >= 0.9 && onStep(i, p.x, p.z, 1) && Math.abs(p.y - steps[i].top - bob(i)) < 0.4) return 'cloud';
      const [x, z] = toL(p.x, p.z);
      if (!nearL(x, z)) return null;
      for (const q of PUFFS) if (Math.hypot(x - q.x, z - q.z) < q.r + 0.1 && Math.abs(p.y - q.top) < 0.4) return 'cloud';
      const r = Math.hypot(x, z);
      if (r < RO + 0.05 && p.y > YT + 0.3) {
        if (r >= CR) { const f0 = fOf(Math.atan2(z, x)); for (let k = 0; k < 3; k++) { const f = f0 + k; if (f <= FTOP && Math.abs(p.y - rampY(f)) < 0.4) return gapOf(f) >= 0 ? 'light' : 'stone'; } }
        return 'stone';
      }
      if (onTowerL(x, z) && Math.abs(p.y - YT) < 0.5) return 'stone';
      return null;
    },
    toWorld: W,
  };
}
