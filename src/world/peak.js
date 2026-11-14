// Snowy Aurora Peak (round 9): the fifth zone. When the Lonely Shadow in Whispering Hollow turns into
// fireflies, they drift to the Hollow's south-east edge and a stone bridge rises from there to a snowy
// island with a terraced mountain in the middle.
// It's cold up here: a traveler on their own slowly loses their lantern to the cold, holding hands keeps you
// both warm, and every brazier you light is a warm circle (and the place you wake). The way up: the snowy
// meadow, a ramp along the mountain to the first terrace, two frost steps too tall to climb alone (hold hands
// and jump together: together you jump higher), the upper terrace, a ramp round the summit, and the aurora
// bell, frozen until the 3 braziers burn and hung too high for one of you to reach.
// Secret: a log cabin on the meadow with two mugs of cocoa by the fire. Star 7 waits on a frozen pillar on
// the first terrace (another jump together).
// Built in local coordinates around PEAK_C (the group sits there): positions are local unless they say "world".
import {
  Group, Mesh, BufferGeometry, Float32BufferAttribute, CylinderGeometry, IcosahedronGeometry, SphereGeometry,
  ConeGeometry, BoxGeometry, TorusGeometry, PlaneGeometry, Vector3, Vector2, InstancedMesh, LatheGeometry,
  ShaderMaterial, AdditiveBlending, DoubleSide,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { PAL } from '../look/palette.js';
import { makeWatercolorMaterial, makeGlowMaterial, makeSoftMaterial, shared } from '../look/material.js';
import { rng, fbm2, noise3 } from './rng.js';
import { displace, setMix } from './shapes.js';

export const PEAK_C = new Vector3(100, 0, -85); // island centre (world)
const R = 22;
// heights: the snowy meadow, the first terrace, the frost step, the upper terrace, the summit
export const Y0 = 2.6, Y1 = 6.2, YS = 8.0, Y2 = 9.8, Y3 = 13.2;
const ARRIVE_TH = Math.atan2(-150 - PEAK_C.z, 85 - PEAK_C.x); // towards Whispering Hollow (north)
const TOWER_TH = Math.atan2(-85 - PEAK_C.z, 45 - PEAK_C.x);   // towards the cloud tower (west, round 10)

const sm = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const P = (x, z) => ({ x, z });
const polar = (c, r, th) => P(c.x + Math.cos(th) * r, c.z + Math.sin(th) * r);
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const edgeR = (th) => R * (0.9 + 0.1 * noise3(Math.cos(th) * 1.6 + 3, Math.sin(th) * 1.6, 5.3) + 0.04 * Math.sin(th * 5 + 1.1));
const onPeakL = (x, z) => Math.hypot(x, z) < edgeR(Math.atan2(z, x)) * 0.97;

// ---- the mountain: three round terraces stacked around MC (local: +x east, +z south) ----
const MC = P(1, 3);
const TIER = [11.5, 7.6, 4.1];
const TIER_Y = [Y1, Y2, Y3];
const tierR = (k, th) => TIER[k] * (1 + 0.055 * (noise3(Math.cos(th) * 1.4 + k * 5.1, Math.sin(th) * 1.4, 3.3 + k) - 0.5) * 2);
const fromMC = (x, z) => [Math.hypot(x - MC.x, z - MC.z), Math.atan2(z - MC.z, x - MC.x)];

// ramps: arcs round the mountain, hugging the terrace wall on their inside. The first climbs the meadow to
// the first terrace (west), the second climbs the upper terrace to the summit (south-west). Each ends in a
// flat landing that runs right up to the terrace it climbs to.
const RAMPS = [
  { a0: -2.15, a1: -2.9, h0: Y0, h1: Y1, w: 1.2, inner: 0 },
  { a0: 1.0, a1: 2.62, h0: Y2, h1: Y3, w: 1.05, inner: 2 },
];
const LAND = 0.8; // the landing: the last stretch of each ramp is flat
for (const rp of RAMPS) {
  if (rp.inner === 0) continue;
  let room = 1e9; // squeeze the summit ramp between the summit and the upper terrace's edge
  for (let i = 0; i <= 24; i++) { const th = rp.a0 + (rp.a1 - rp.a0) * i / 24; room = Math.min(room, (tierR(rp.inner - 1, th) - tierR(rp.inner, th) - 0.75) / 2); }
  rp.w = Math.min(rp.w, room);
}
/** a ramp's inner edge and middle at angle th (radius round MC) */
const rampIn = (rp, th) => tierR(rp.inner, th) - 0.02;
const rampMid = (rp, th) => rampIn(rp, th) + rp.w;
const rampT = (rp, th) => wrap(th - rp.a0) / (rp.a1 - rp.a0);
const rampY = (rp, t) => rp.h0 + (rp.h1 - rp.h0) * Math.max(0, Math.min(1, t / LAND));
/** the ramp's walking height at local x,z (null = not on a ramp) */
function rampH(x, z) {
  const [r, th] = fromMC(x, z);
  let best = null;
  for (const rp of RAMPS) {
    const t = rampT(rp, th);
    if (t < -0.02 || t > 1.0001) continue;
    const ri = rampIn(rp, th) - (t > LAND ? 0.7 : 0.02); // the landing runs into the terrace
    if (r < ri || r > ri + 2 * rp.w + (t > LAND ? 0.7 : 0.02)) continue;
    best = Math.max(best ?? -1e9, rampY(rp, t));
  }
  return best;
}
const rampPt = (rp, t, dr = 0) => { const th = rp.a0 + (rp.a1 - rp.a0) * t; return polar(MC, rampMid(rp, th) + dr, th); };

// ---- what stands where (local) ----
const ARRIVE = polar(P(0, 0), edgeR(ARRIVE_TH) * 0.9, ARRIVE_TH);
const CAIRN = polar(P(0, 0), 15.5, ARRIVE_TH + 0.06);  // the checkpoint just past the bridge
const S1_TH = 0.15, S1R = 1.5;                          // the frost step between the two terraces
const S1 = polar(MC, tierR(1, S1_TH) + 0.95, S1_TH);
const SP_TH = 2.45, SPR = 1.0, SPY = Y1 + 1.9;          // the frozen pillar with the star on it
const SP = polar(MC, (tierR(0, SP_TH) + tierR(1, SP_TH)) / 2, SP_TH);
const BRAZIERS = [
  polar(MC, 16.2, -2.05),                                            // on the meadow, by the first ramp
  polar(MC, (tierR(0, -0.5) + tierR(1, -0.5)) / 2, -0.5),           // on the first terrace, before the frost step
  polar(MC, (tierR(1, 0.55) + tierR(2, 0.55)) / 2, 0.55),           // on the upper terrace, before the summit ramp
];
const BELL = P(MC.x, MC.z);
const BELL_AX = 0.75;                                   // the arch's pillars stand along this angle
const CABIN = P(12.0, -9.0), CABIN_YAW = 1.19;          // its door faces the meadow (west-north-west)
const CABIN_W = 4.2, CABIN_D = 3.6;
const FOOTPATHS = [[ARRIVE, CAIRN, 1.3], [CAIRN, BRAZIERS[0], 1.1], [BRAZIERS[0], rampPt(RAMPS[0], 0, 0), 1.2], [CAIRN, polar(CABIN, 3.2, CABIN_YAW + Math.PI), 0.9]];
const CLEAR = [[ARRIVE, 3.5], [CAIRN, 2.6], [BRAZIERS[0], 3.0], [CABIN, 4.6]];

function distSeg(x, z, a, b) {
  const abx = b.x - a.x, abz = b.z - a.z;
  const t = Math.max(0, Math.min(1, ((x - a.x) * abx + (z - a.z) * abz) / (abx * abx + abz * abz)));
  return Math.hypot(x - (a.x + abx * t), z - (a.z + abz * t));
}
function pathMask(x, z) {
  let f = 0;
  for (const [a, b, w] of FOOTPATHS) f = Math.max(f, 1 - sm(w * 0.45, w, distSeg(x, z, a, b) + (noise3(x * 0.6, 3, z * 0.6) - 0.5) * 0.6));
  return f;
}
function flatMask(x, z) {
  let f = pathMask(x, z);
  for (const [c, r] of CLEAR) f = Math.max(f, 1 - sm(r * 0.7, r + 0.8, Math.hypot(x - c.x, z - c.z)));
  const [r] = fromMC(x, z);
  f = Math.max(f, 1 - sm(TIER[0] + 1.5, TIER[0] + 4, r)); // calm snow round the mountain's foot
  return f;
}
/** the meadow's snow (local), ignoring the mountain */
export function meadowH(x, z) {
  const r = Math.hypot(x, z), er = edgeR(Math.atan2(z, x));
  const bump = (fbm2(x * 0.08 + 11, z * 0.08 - 4) - 0.42) * 1.8;
  let h = Y0 + Math.max(-0.25, bump) * (1 - flatMask(x, z));
  h -= sm(er * 0.86, er, r) * 0.9;
  return h;
}
function terraceH(x, z) {
  const [r, th] = fromMC(x, z);
  for (let k = 2; k >= 0; k--) if (r < tierR(k, th)) return TIER_Y[k];
  return null;
}
/** walking height (local) */
function groundAt(x, z) {
  let h = terraceH(x, z) ?? meadowH(x, z);
  if (Math.hypot(x - S1.x, z - S1.z) < S1R) h = Math.max(h, YS);
  if (Math.hypot(x - SP.x, z - SP.z) < SPR - 0.05) h = Math.max(h, SPY);
  const rp = rampH(x, z);
  if (rp !== null) h = Math.max(h, rp);
  return h;
}
/** which level you're on: 0 meadow, 1 first terrace (and the frost step), 2 upper terrace, 3 summit */
function levelAt(x, z, y) {
  if (y > Y3 - 0.6) return 3;
  if (y > Y2 - 0.6) return 2;
  if (y > Y1 - 0.6) return 1;
  return 0;
}

// ---- materials ----
let PM = null;
function peakMats(M) {
  if (PM) return PM;
  PM = {
    ...M,
    snow: makeWatercolorMaterial({ lit: PAL.snow, lit2: PAL.snowPath, mix: true, rim: 0.0, wash: 0.14 }),
    snowPlain: makeWatercolorMaterial({ lit: PAL.snow, rim: 0.25, wash: 0.12 }),
    rock: makeWatercolorMaterial({ lit: PAL.rockCold, lit2: PAL.snow, mix: true, rim: 0.4, wash: 0.2 }),
    stone: makeWatercolorMaterial({ lit: PAL.rockCold, rim: 0.4, wash: 0.18 }),
    ice: makeWatercolorMaterial({ lit: PAL.ice, rim: 0.7, wash: 0.1 }),
    pine: makeWatercolorMaterial({ lit: PAL.pine, rim: 0.5, wash: 0.2, breakup: 0.4 }),
    trunk: makeWatercolorMaterial({ lit: PAL.logs, rim: 0.3 }),
    logs: makeWatercolorMaterial({ lit: PAL.logs, rim: 0.4, wash: 0.2 }),
    roof: makeWatercolorMaterial({ lit: PAL.snow, lit2: PAL.logs, mix: true, rim: 0.3, wash: 0.14 }),
    cocoa: makeWatercolorMaterial({ lit: PAL.cocoa, rim: 0.4 }),
    floor: makeWatercolorMaterial({ lit: PAL.wood, rim: 0.2, wash: 0.2 }),
    mug: makeWatercolorMaterial({ lit: PAL.capeRed, rim: 0.4 }),
    mug2: makeWatercolorMaterial({ lit: PAL.capeBlue, rim: 0.4 }),
    brass: makeWatercolorMaterial({ lit: PAL.brass, rim: 0.6, wash: 0.1 }),
    rope: makeWatercolorMaterial({ lit: PAL.ice, rim: 0.4 }),
    fire: makeGlowMaterial(PAL.emberCore, PAL.emberHalo, 1.3),
    hint: makeGlowMaterial(PAL.glowCore, PAL.auroraA, 1.0),
    flake: makeSoftMaterial(PAL.snow[0], 0.85),
    steam: makeSoftMaterial(PAL.snow[0], 0.55),
  };
  return PM;
}

// ---- geometry helpers ----
/** a flat-ish disc on the polar grid round c (local), radius rf(th), height hf(x,z) */
export function discGeo(c, rf, hf, rings = 18, segs = 96) {
  const pos = [], idx = [];
  pos.push(c.x, hf(c.x, c.z), c.z);
  for (let i = 1; i <= rings; i++) {
    const f = i / rings;
    for (let s = 0; s < segs; s++) {
      const th = (s / segs) * Math.PI * 2, r = rf(th) * Math.pow(f, 0.8);
      const x = c.x + Math.cos(th) * r, z = c.z + Math.sin(th) * r;
      pos.push(x, hf(x, z), z);
    }
  }
  for (let s = 0; s < segs; s++) idx.push(0, 1 + ((s + 1) % segs), 1 + s);
  for (let i = 1; i < rings; i++) {
    const a = 1 + (i - 1) * segs, b = 1 + i * segs;
    for (let s = 0; s < segs; s++) { const s1 = (s + 1) % segs; idx.push(a + s, a + s1, b + s, a + s1, b + s1, b + s); }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
/** a rocky ring wall round c from height top down to bottom (snowy along its lip) */
function wallGeo(c, rf, top, bottom, seed, segs = 120, rows = 10) {
  const pos = [], idx = [];
  for (let k = 0; k <= rows; k++) {
    const f = k / rows;
    for (let s = 0; s < segs; s++) {
      const th = (s / segs) * Math.PI * 2;
      // rugged rock: big slow bulges, smaller knobs, a couple of ledges, a little wider at the foot
      const big = (noise3(Math.cos(th) * 3 + seed, f * 2.5, Math.sin(th) * 3) - 0.5) * 0.9;
      const knob = (noise3(Math.cos(th) * 11 + seed * 2, f * 7, Math.sin(th) * 11) - 0.5) * 0.55;
      const ledge = Math.max(0, Math.sin(f * Math.PI * 2.5 + noise3(Math.cos(th) * 2, seed, Math.sin(th) * 2) * 4)) * 0.22;
      const bulge = k === 0 ? 0 : big + knob + ledge + f * 0.55;
      const r = rf(th) + 0.05 + Math.max(-0.05, bulge);
      pos.push(c.x + Math.cos(th) * r, top - f * (top - bottom) + (k === 0 ? 0.04 : 0), c.z + Math.sin(th) * r);
    }
  }
  for (let k = 0; k < rows; k++) {
    for (let s = 0; s < segs; s++) {
      const a = k * segs + s, b = k * segs + ((s + 1) % segs), cc = (k + 1) * segs + s, d = (k + 1) * segs + ((s + 1) % segs);
      idx.push(a, b, cc, b, d, cc);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  setMix(g, (x, y, z) => sm(top - 0.75 - noise3(x * 0.8, 1, z * 0.8) * 0.5, top - 0.2, y)); // 0 = rock, 1 = snow on the lip
  return g;
}
/** a ramp: an arc of snowy slab with rock sides down to `base` */
function rampGeos(rp, base) {
  const top = [], side = [], ti = [], si = [];
  const n = 40;
  for (let i = 0; i <= n; i++) {
    const t = i / n, th = rp.a0 + (rp.a1 - rp.a0) * t;
    const h = rampY(rp, t) + 0.02;
    const ri0 = rampIn(rp, th), ro = ri0 + 2 * rp.w;
    const ri = t > LAND - 0.02 ? ri0 - 0.5 : ri0; // the landing tucks into the terrace
    const c = Math.cos(th), s = Math.sin(th);
    top.push(MC.x + c * ri, h, MC.z + s * ri, MC.x + c * ro, h, MC.z + s * ro);
    side.push(MC.x + c * ro, h, MC.z + s * ro, MC.x + c * (ro + 0.25), base, MC.z + s * (ro + 0.25));
    side.push(MC.x + c * ri, h, MC.z + s * ri, MC.x + c * (ri - 0.1), base, MC.z + s * (ri - 0.1));
    if (i < n) {
      const a = i * 2;
      ti.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      const b = i * 4;
      si.push(b, b + 4, b + 1, b + 1, b + 4, b + 5); // outer wall
      si.push(b + 2, b + 3, b + 6, b + 3, b + 7, b + 6); // inner wall
    }
  }
  const mk = (p, i) => { const g = new BufferGeometry(); g.setAttribute('position', new Float32BufferAttribute(p, 3)); g.setIndex(i); g.computeVertexNormals(); return g; };
  const tg = mk(top, ti), sg = mk(side, si);
  // the ramp's top has a trodden-snow middle; its sides are rock with a snowy lip
  setMix(tg, (x, y, z) => { const [r, th] = fromMC(x, z); return 1 - sm(rp.w * 0.5, rp.w, Math.abs(r - rampMid(rp, th))); });
  setMix(sg, (x, y) => (y > base + 0.3 ? 0.1 : 0)); // rock, a dusting of snow
  return { tg, sg };
}
/** an ice column: a faceted hex prism (flat facets catch the light like ice), a little tapered and uneven.
 * Origin at its foot; r is the corner radius. */
function iceColumn(r, h, seed, taper = 0.9) {
  const geo = new CylinderGeometry(r * taper, r, h, 6, 2).translate(0, h / 2, 0);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) { // jitter by position, so the shared corners stay joined
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const k = (noise3(x * 2.1 + seed, y * 1.3, z * 2.1) - 0.5) * 0.16 * r;
    p.setXYZ(i, x * (1 + k), y + (y > h - 0.01 ? (noise3(x * 3 + seed, 7, z * 3) - 0.5) * 0.05 : 0), z * (1 + k));
  }
  const flat = geo.toNonIndexed();
  flat.computeVertexNormals();
  return flat;
}
/** a snowy pine: a short trunk and three stacked cones, each with a snow cap */
function snowPine(r, M, h) {
  const g = new Group();
  const trunk = new Mesh(new CylinderGeometry(0.12, 0.18, h * 0.3, 6), M.trunk);
  trunk.position.y = h * 0.15;
  g.add(trunk);
  const greens = [], snows = [];
  const tiers = 3;
  for (let i = 0; i < tiers; i++) {
    const f = i / tiers, rad = (1.25 - f * 0.75) * (h / 4.2), th = h * 0.42;
    const y = h * 0.22 + i * h * 0.24;
    const cone = displace(new ConeGeometry(rad, th, 9, 2), 0.05, 2, Math.floor(r() * 99)).translate(0, y + th / 2, 0);
    greens.push(cone);
    const cap = displace(new ConeGeometry(rad * 0.72, th * 0.55, 9, 1), 0.03, 2, Math.floor(r() * 99)).translate(0, y + th * 0.72, 0);
    snows.push(cap);
  }
  const clean = (geos) => geos.map((q) => { const b = new BufferGeometry(); b.setAttribute('position', q.getAttribute('position')); b.setAttribute('normal', q.getAttribute('normal')); if (q.index) b.setIndex(q.index); return b; });
  g.add(new Mesh(mergeGeometries(clean(greens)), M.pine));
  g.add(new Mesh(mergeGeometries(clean(snows)), M.snowPlain));
  return g;
}
function snowRock(s, seed, M) {
  const g = new Group();
  const rock = new Mesh(displace(new IcosahedronGeometry(s, 1), s * 0.22, 1.3, seed), M.stone);
  rock.scale.y = 0.7;
  const cap = new Mesh(displace(new SphereGeometry(s * 0.85, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.45), s * 0.08, 2, seed + 3), M.snowPlain);
  cap.position.y = s * 0.18;
  g.add(rock, cap);
  return g;
}

// ---- the aurora: soft curtains of light high over the peak (sky, like the dome: no lantern light) ----
const AUR_VERT = /* glsl */ `
  varying vec2 vUv;
  void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;
const AUR_FRAG = /* glsl */ `
  uniform float uTime; uniform float uK; uniform vec3 uA; uniform vec3 uB; uniform float uSeed;
  varying vec2 vUv;
  void main(){
    float x = vUv.x, y = vUv.y;
    float slow = sin(x * 7.0 + uTime * 0.25 + uSeed) * 0.5 + 0.5;
    float rays = 0.55 + 0.45 * sin(x * 90.0 + sin(x * 6.0 + uTime * 0.35 + uSeed) * 4.0);
    float band = smoothstep(0.0, 0.18, y) * (1.0 - smoothstep(0.3, 1.0, y));
    float ends = smoothstep(0.0, 0.12, x) * (1.0 - smoothstep(0.88, 1.0, x));
    vec3 col = mix(uA, uB, smoothstep(0.15, 0.85, y + slow * 0.15));
    float a = band * ends * rays * (0.45 + 0.55 * slow) * uK * 0.8;
    gl_FragColor = vec4(col * a, a);
  }
`;
function makeAurora() {
  const g = new Group();
  const mats = [];
  // two high over the peak (you look up), three far off and low to the north, east and south, so they show at the
  // top of the screen from the usual camera too (none over the other islands)
  const curtains = [
    { c: [-30, -60], len: 150, rot: 0.25, base: 46, h: 34, cols: [PAL.auroraA, PAL.auroraB], seed: 0.0 },
    { c: [10, -40], len: 120, rot: -0.35, base: 52, h: 30, cols: [PAL.auroraA, PAL.auroraC], seed: 2.1 },
    { c: [40, -110], len: 170, rot: 0.15, base: 20, h: 40, cols: [PAL.auroraA, PAL.auroraB], seed: 4.3 },
    { c: [100, -10], len: 160, rot: 1.45, base: 22, h: 38, cols: [PAL.auroraC, PAL.auroraB], seed: 6.7 },
    { c: [50, 85], len: 150, rot: -0.3, base: 18, h: 36, cols: [PAL.auroraA, PAL.auroraC], seed: 8.9 },
  ];
  for (const cu of curtains) {
    const n = 80, pos = [], uv = [], idx = [];
    for (let i = 0; i <= n; i++) {
      const u = i / n, x = (u - 0.5) * cu.len;
      const z = Math.sin(u * 5.3 + cu.seed) * 9 + Math.sin(u * 11.7 + cu.seed * 2) * 3.5;
      const c = Math.cos(cu.rot), s = Math.sin(cu.rot);
      const wx = cu.c[0] + x * c - z * s, wz = cu.c[1] + x * s + z * c;
      pos.push(wx, cu.base, wz, wx, cu.base + cu.h, wz);
      uv.push(u, 0, u, 1);
      if (i < n) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    }
    const geo = new BufferGeometry();
    geo.setAttribute('position', new Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    const m = new ShaderMaterial({
      uniforms: { uTime: shared.uTime, uK: { value: 0 }, uA: { value: cu.cols[0].clone() }, uB: { value: cu.cols[1].clone() }, uSeed: { value: cu.seed } },
      vertexShader: AUR_VERT, fragmentShader: AUR_FRAG,
      transparent: true, depthWrite: false, blending: AdditiveBlending, side: DoubleSide,
    });
    mats.push(m);
    const mesh = new Mesh(geo, m);
    mesh.frustumCulled = false;
    g.add(mesh);
  }
  g.userData.dynamic = true;
  g.visible = false;
  return { group: g, setK(k) { g.visible = k > 0.002; for (const m of mats) m.uniforms.uK.value = k; } };
}

/**
 * Build the Snowy Aurora Peak into ctx.root (see buildHollow for ctx). `hollow` gives the bridge's start.
 */
export function buildPeak(ctx, hollow) {
  const { root, lights, colliders } = ctx;
  const M = peakMats(ctx.M);
  const g = new Group();
  g.position.copy(PEAK_C);
  root.add(g);
  const W = (x, z) => ({ x: x + PEAK_C.x, z: z + PEAK_C.z });
  const addCol = (x, z, r, top) => { const w = W(x, z); const c = { x: w.x, z: w.z, r }; if (top !== undefined) c.top = top; colliders.push(c); return c; };
  const addSeg = (a, b, r, top) => { const wa = W(a.x, a.z), wb = W(b.x, b.z); const c = { ax: wa.x, az: wa.z, bx: wb.x, bz: wb.z, r }; if (top !== undefined) c.top = top; colliders.push(c); return c; };
  const wv = (x, z, dy = 0) => { const w = W(x, z); return new Vector3(w.x, groundAt(x, z) + dy, w.z); };

  // ---- the island: snowy meadow, cliff below ----
  const meadow = discGeo(P(0, 0), (th) => edgeR(th), meadowH, 46, 120);
  setMix(meadow, (x, y, z) => pathMask(x, z));
  g.add(new Mesh(meadow, M.snow));
  g.add(new Mesh(ctx.buildCliff(edgeR, meadowH, 24, 61), M.rock));

  // ---- the mountain: three terraces with rocky walls and snowy tops ----
  for (let k = 0; k < 3; k++) {
    const rf = (th) => tierR(k, th);
    const top = discGeo(MC, (th) => rf(th) + 0.12, () => TIER_Y[k] + 0.02, 10, 96);
    g.add(new Mesh(top, M.snowPlain));
    const bottom = k === 0 ? Y0 - 0.8 : TIER_Y[k - 1] - 0.3;
    const wall = new Mesh(wallGeo(MC, rf, TIER_Y[k], bottom, 11 + k * 7), M.rock);
    wall.userData.occluder = true;
    g.add(wall);
    // its edge: you can walk off it, but from below it's a wall (collider `top`). Where a ramp's landing meets
    // it there's no wall: you just walk on
    const N = 64;
    for (let i = 0; i < N; i++) {
      const t0 = (i / N) * Math.PI * 2, t1 = ((i + 1) / N) * Math.PI * 2;
      if (RAMPS.some((rp) => rp.inner === k && rampT(rp, (t0 + t1) / 2) > LAND + 0.02 && rampT(rp, (t0 + t1) / 2) < 1)) continue;
      addSeg(polar(MC, rf(t0) + 0.1, t0), polar(MC, rf(t1) + 0.1, t1), 0.2, TIER_Y[k]);
    }
  }
  // ---- the two ramps ----
  RAMPS.forEach((rp, i) => {
    const base = i === 0 ? Y0 - 0.6 : Y2 - 0.3;
    const { tg, sg } = rampGeos(rp, base);
    g.add(new Mesh(tg, M.snow));
    const sides = new Mesh(sg, M.rock);
    sides.userData.occluder = true;
    g.add(sides);
    // walls along the outer side (and the inner side of the summit ramp): from below they block, from on top
    // you can step off (each piece's `top` is the ramp's height at its low end)
    const n = 14;
    for (let k = 0; k < n; k++) {
      const ta = k / n, tb = (k + 1) / n;
      const h = rampY(rp, ta);
      if (h - rp.h0 < 0.9) continue; // the low end you just walk onto
      addSeg(rampPt(rp, ta, rp.w + 0.05), rampPt(rp, tb, rp.w + 0.05), 0.15, h);
      // little snowy posts along the outer edge (readability: this is the way up)
      if (k % 3 === 1) {
        const pp = rampPt(rp, (ta + tb) / 2, rp.w - 0.15);
        const post = new Mesh(displace(new CylinderGeometry(0.11, 0.14, 0.7, 6, 1), 0.02, 3, k + i * 10), M.stone);
        post.position.set(pp.x, h + 0.35, pp.z);
        g.add(post);
        const cap = new Mesh(new SphereGeometry(0.16, 8, 6), M.snowPlain); cap.scale.y = 0.6; cap.position.set(pp.x, h + 0.74, pp.z); g.add(cap);
      }
    }
  });

  // ---- the frost step: a block of ice between the terraces, too tall to climb alone ----
  {
    const blk = new Mesh(iceColumn(S1R / 0.87 + 0.04, YS - Y1 + 0.3, 5, 0.97), M.ice);
    blk.position.set(S1.x, Y1 - 0.3, S1.z); blk.rotation.y = 0.3;
    g.add(blk);
    const cap = new Mesh(displace(new CylinderGeometry(S1R - 0.12, S1R - 0.02, 0.12, 6, 1), 0.03, 2, 6), M.snowPlain);
    cap.position.set(S1.x, YS + 0.04, S1.z); cap.rotation.y = 0.3;
    g.add(cap);
    addCol(S1.x, S1.z, S1R - 0.12, YS);
    // little ice shards round its foot (away from the side you jump from)
    const [, th] = fromMC(S1.x, S1.z);
    [[0.35, 1.9, 0.3, 1.1], [-0.45, 1.85, 0.24, 0.7], [Math.PI - 0.95, 1.75, 0.28, 0.9], [Math.PI + 0.9, 1.8, 0.22, 0.6], [0.05, 2.05, 0.18, 0.5]].forEach(([a, d, r, h], i) => {
      const sh = new Mesh(iceColumn(r, h, 20 + i, 0.55), M.ice);
      sh.position.set(S1.x + Math.cos(th + a) * d, Y1 - 0.1, S1.z + Math.sin(th + a) * d);
      sh.rotation.set(Math.sin(th + a) * 0.3, i * 1.3, -Math.cos(th + a) * 0.3);
      g.add(sh);
    });
    // a frozen waterfall of ice columns up the upper terrace's wall behind it: the second hop is part of the climb
    [[-0.13, 0.5, 0.0], [-0.04, 0.6, 0.35], [0.06, 0.55, 0.15], [0.15, 0.42, 0.45]].forEach(([dth, r, up], i) => {
      const a = th + dth, cp = polar(MC, tierR(1, a) + 0.2, a);
      const col = new Mesh(iceColumn(r, Y2 - YS + 0.6 + up, 30 + i, 0.75), M.ice);
      col.position.set(cp.x, YS - 0.3, cp.z); col.rotation.y = i * 0.9;
      g.add(col);
    });
  }
  // the hint rings: a soft glow at the foot of each jump together (shown until you've climbed it)
  const stepHint = new Mesh(new TorusGeometry(S1R + 0.45, 0.05, 6, 40).rotateX(-Math.PI / 2), M.hint);
  stepHint.position.set(S1.x, Y1 + 0.08, S1.z);
  stepHint.userData.dynamic = true;
  g.add(stepHint);

  // ---- the frozen pillar with star 7 on top ----
  {
    const pil = new Mesh(iceColumn(SPR / 0.87 + 0.04, SPY - Y1 + 0.3, 8, 0.92), M.ice);
    pil.position.set(SP.x, Y1 - 0.3, SP.z); pil.rotation.y = 1.1;
    g.add(pil);
    const cap = new Mesh(displace(new CylinderGeometry(SPR - 0.15, SPR - 0.05, 0.12, 6, 1), 0.03, 2, 8), M.snowPlain);
    cap.position.set(SP.x, SPY + 0.04, SP.z); cap.rotation.y = 1.1;
    g.add(cap);
    addCol(SP.x, SP.z, SPR - 0.1, SPY);
  }
  const starPos = new Vector3(SP.x + PEAK_C.x, SPY + 1.0, SP.z + PEAK_C.z);

  // ---- braziers: a stone bowl on a short pedestal. Lit, they're a warm circle and where you wake ----
  const braziers = BRAZIERS.map((B, i) => {
    const y = groundAt(B.x, B.z);
    const grp = new Group();
    grp.position.set(B.x, y, B.z);
    const ped = new Mesh(displace(new CylinderGeometry(0.28, 0.4, 0.7, 8, 2), 0.03, 3, i), M.stone);
    ped.position.y = 0.35;
    const bowlPts = [new Vector2(0.18, 0), new Vector2(0.5, 0.06), new Vector2(0.62, 0.3), new Vector2(0.56, 0.36), new Vector2(0.4, 0.2), new Vector2(0.01, 0.16)];
    const bowl = new Mesh(new LatheGeometry(bowlPts, 14), M.stone);
    bowl.position.y = 0.68;
    const ash = new Mesh(new CylinderGeometry(0.42, 0.42, 0.06, 12), M.snowPlain); // snow in the cold bowl
    ash.position.y = 0.92;
    ash.userData.dynamic = true;
    grp.add(ped, bowl, ash);
    const fireMat = makeGlowMaterial(PAL.emberCore, PAL.emberHalo, 1.3);
    const fire = new Group();
    for (let k = 0; k < 3; k++) {
      const f = new Mesh(new ConeGeometry(0.2 - k * 0.04, 0.7 - k * 0.12, 7).translate(0, 0.35 - k * 0.06, 0), fireMat);
      f.position.set(Math.cos(k * 2.1) * 0.12, 0, Math.sin(k * 2.1) * 0.12);
      fire.add(f);
    }
    fire.position.y = 0.95;
    fire.visible = false;
    fire.userData.dynamic = true;
    grp.add(fire);
    const ringMat = makeGlowMaterial(PAL.emberCore, PAL.emberHalo, 0.55);
    const ring = new Mesh(new TorusGeometry(1.6, 0.045, 6, 40).rotateX(-Math.PI / 2), ringMat);
    ring.position.y = 0.08; ring.userData.dynamic = true; ring.visible = false;
    grp.add(ring);
    g.add(grp);
    addCol(B.x, B.z, 0.45);
    const light = { obj: fire, str: 0 };
    lights.push(light);
    return { pos: wv(B.x, B.z), level: i, fire, fireMat, ash, ring, ringMat, light, lit: false, head: wv(B.x, B.z, 1.4) };
  });

  // ---- the summit: a stone arch with the aurora bell, frozen until the braziers burn ----
  const bellY = Y3 + 3.0; // the bell's rim: too high to reach alone, not with a jump together
  const bell = (() => {
    const grp = new Group();
    grp.position.set(BELL.x, Y3, BELL.z);
    const ax = Math.cos(BELL_AX), az = Math.sin(BELL_AX);
    for (const s of [-1, 1]) {
      const pil = new Mesh(displace(new BoxGeometry(0.6, 4.6, 0.6, 2, 4, 2), 0.05, 2, s + 4), M.stone);
      pil.position.set(ax * 1.9 * s, 2.3, az * 1.9 * s);
      pil.rotation.y = -BELL_AX;
      grp.add(pil);
      const cap = new Mesh(new SphereGeometry(0.42, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), M.snowPlain);
      cap.position.set(ax * 1.9 * s, 4.6, az * 1.9 * s); cap.scale.y = 0.6;
      grp.add(cap);
      addCol(BELL.x + ax * 1.9 * s, BELL.z + az * 1.9 * s, 0.42);
    }
    const beam = new Mesh(displace(new BoxGeometry(4.6, 0.45, 0.55, 4, 1, 1), 0.04, 2, 7), M.stone);
    beam.position.y = 4.5; beam.rotation.y = -BELL_AX;
    grp.add(beam);
    const snowBeam = new Mesh(new BoxGeometry(4.5, 0.14, 0.6), M.snowPlain);
    snowBeam.position.y = 4.78; snowBeam.rotation.y = -BELL_AX;
    grp.add(snowBeam);
    const swing = new Group();
    swing.position.y = 4.3;
    const pts = [new Vector2(0.01, 0), new Vector2(0.3, -0.05), new Vector2(0.42, -0.35), new Vector2(0.52, -0.8), new Vector2(0.72, -1.22), new Vector2(0.78, -1.3), new Vector2(0.01, -1.3)];
    const bellM = new Mesh(new LatheGeometry(pts, 20), M.brass);
    const clapper = new Mesh(new SphereGeometry(0.14, 10, 8), M.brass);
    clapper.position.y = -1.28;
    swing.add(bellM, clapper);
    const icePts = pts.map((p) => new Vector2(p.x * 1.12 + 0.03, p.y * 1.05 + 0.04));
    const ice = new Mesh(displace(new LatheGeometry(icePts, 14), 0.05, 2.5, 3), M.ice);
    swing.add(ice);
    swing.userData.dynamic = true; ice.userData.dynamic = true;
    grp.add(swing);
    const ringMat = makeGlowMaterial(PAL.glowCore, PAL.auroraA, 1.0);
    const ring = new Mesh(new TorusGeometry(1.15, 0.05, 6, 40).rotateX(-Math.PI / 2), ringMat);
    ring.position.y = 0.08; ring.userData.dynamic = true;
    grp.add(ring);
    g.add(grp);
    lights.push({ obj: bellM, str: 0, bell: true });
    return { swing, ice, ring, ringMat, pos: wv(BELL.x, BELL.z), rimY: bellY, light: lights[lights.length - 1] };
  })();

  // ---- the log cabin (the secret): warm inside, two mugs of cocoa by the fire ----
  const cabin = new Group();
  const cY = meadowH(CABIN.x, CABIN.z);
  cabin.position.set(CABIN.x, cY, CABIN.z);
  cabin.rotation.y = CABIN_YAW;
  const hw = CABIN_W / 2, hd = CABIN_D / 2, T = 0.24;
  const logGeo = displace(new BoxGeometry(1, 1, 1, 4, 3, 1), 0.02, 3, 2);
  const wall = (x, z, w, d, h) => {
    const m = new Mesh(logGeo, M.logs);
    m.scale.set(w, h, d); m.position.set(x, h / 2 - 0.1, z);
    m.userData.occluder = true;
    cabin.add(m);
  };
  wall(0, hd, CABIN_W, T, 2.3);
  wall(-hw, 0, T, CABIN_D, 2.3);
  wall(hw, 0, T, CABIN_D, 2.3);
  wall(-hw + 0.8, -hd, 1.6, T, 2.3);
  wall(hw - 0.8, -hd, 1.6, T, 2.3);
  const lintel = new Mesh(logGeo, M.logs); lintel.scale.set(1.2, 0.45, T); lintel.position.set(0, 2.0, -hd); cabin.add(lintel);
  // log ends at the corners (it reads as a log cabin)
  for (const [x, z] of [[-hw, -hd], [hw, -hd], [-hw, hd], [hw, hd]]) {
    for (let k = 0; k < 5; k++) {
      const end = new Mesh(new CylinderGeometry(0.16, 0.16, 0.5, 8), M.logs);
      end.rotation.x = Math.PI / 2; end.position.set(x, 0.2 + k * 0.45, z);
      cabin.add(end);
    }
  }
  const roofs = [];
  for (const s of [-1, 1]) {
    const roof = new Mesh(displace(new BoxGeometry(1, 1, 1, 3, 1, 3), 0.03, 2, 4 + s), M.roof);
    roof.scale.set(CABIN_W * 0.62, 0.22, CABIN_D + 0.8);
    roof.position.set(s * CABIN_W * 0.26, 2.75, 0);
    roof.rotation.z = -s * 0.6;
    roof.userData.occluder = true; roof.userData.dynamic = true;
    cabin.add(roof); roofs.push(roof);
  }
  const chimney = new Mesh(displace(new BoxGeometry(0.6, 1.6, 0.6, 2, 2, 2), 0.03, 2, 3), M.stone);
  chimney.position.set(-1.1, 3.0, 0.9); chimney.userData.dynamic = true;
  cabin.add(chimney); roofs.push(chimney);
  const windowGlow = new Mesh(new PlaneGeometry(0.6, 0.5), makeGlowMaterial(PAL.emberCore, PAL.emberHalo, 0.7));
  windowGlow.position.set(hw + 0.13, 1.4, 0.2); windowGlow.rotation.y = Math.PI / 2;
  cabin.add(windowGlow);
  // inside: the fireplace on the back wall, a rug, a little table and two mugs
  const hearth = new Mesh(displace(new BoxGeometry(1.4, 1.3, 0.6, 2, 2, 1), 0.03, 2, 5), M.stone);
  hearth.position.set(0, 0.55, hd - 0.4);
  cabin.add(hearth);
  const hearthFire = new Group();
  for (let k = 0; k < 3; k++) {
    const f = new Mesh(new ConeGeometry(0.16, 0.45 - k * 0.08, 7).translate(0, 0.22, 0), M.fire);
    f.position.set((k - 1) * 0.18, 0, 0);
    hearthFire.add(f);
  }
  hearthFire.position.set(0, 0.25, hd - 0.62);
  hearthFire.userData.dynamic = true;
  cabin.add(hearthFire);
  const floor = new Mesh(displace(new BoxGeometry(CABIN_W - 0.3, 0.08, CABIN_D - 0.3, 6, 1, 4), 0.01, 3, 2), M.floor);
  floor.position.set(0, 0.0, 0);
  cabin.add(floor);
  const rug = new Mesh(new CylinderGeometry(1.0, 1.0, 0.03, 20), M.mug);
  rug.scale.z = 0.7; rug.position.set(0, 0.0, 0.1);
  cabin.add(rug);
  const table = new Mesh(displace(new CylinderGeometry(0.42, 0.36, 0.55, 10), 0.02, 3, 4), M.logs);
  table.position.set(0, 0.27, 0.15);
  cabin.add(table);
  const mugs = [];
  for (const s of [-1, 1]) {
    const mug = new Group();
    const cup = new Mesh(new CylinderGeometry(0.09, 0.08, 0.18, 10), s < 0 ? M.mug : M.mug2);
    const drink = new Mesh(new CylinderGeometry(0.075, 0.075, 0.02, 10), M.cocoa);
    drink.position.y = 0.08;
    const handle = new Mesh(new TorusGeometry(0.05, 0.015, 5, 10), s < 0 ? M.mug : M.mug2);
    handle.position.set(0.1 * s, 0, 0); handle.rotation.y = Math.PI / 2 * 0;
    mug.add(cup, drink, handle);
    mug.position.set(0.16 * s, 0.64, 0.15);
    cabin.add(mug);
    mugs.push(mug);
  }
  g.add(cabin);
  // cabin colliders (walls as segments, world) and the table
  const cc = Math.cos(CABIN_YAW), cs = Math.sin(CABIN_YAW);
  const CL = (x, z) => P(CABIN.x + x * cc + z * cs, CABIN.z - x * cs + z * cc);
  for (const [a, b] of [[[-hw, hd], [hw, hd]], [[-hw, -hd], [-hw, hd]], [[hw, -hd], [hw, hd]], [[-hw, -hd], [-0.55, -hd]], [[0.55, -hd], [hw, -hd]], [[-0.6, hd - 0.4], [0.6, hd - 0.4]]]) {
    addSeg(CL(a[0], a[1]), CL(b[0], b[1]), a[1] === hd - 0.4 ? 0.3 : 0.16);
  }
  const tw = CL(0, 0.15); addCol(tw.x, tw.z, 0.42);
  const cabinIn = (x, z) => { const dx = x - CABIN.x, dz = z - CABIN.z; const lx = dx * cc - dz * cs, lz = dx * cs + dz * cc; return Math.abs(lx) < hw - 0.2 && Math.abs(lz) < hd - 0.15; };
  const cabinDoor = CL(0, -hd - 1.4), cabinInside = CL(0.75, -0.4);
  const fw = CL(0, hd - 0.62);
  lights.push({ obj: hearthFire, str: 0.7 });
  // steam from the mugs and smoke from the chimney: soft puffs (instanced)
  const puffGeo = new PlaneGeometry(0.5, 0.5);
  const steam = new InstancedMesh(puffGeo, M.steam, 14);
  steam.frustumCulled = false; steam.userData.dynamic = true;
  g.add(steam);

  // ---- snowy pines and rocks on the meadow, off the paths ----
  const tr = rng(907);
  const trees = [];
  for (let n = 0; n < 500 && trees.length < 24; n++) {
    const a = tr() * 6.283, d = 6 + Math.sqrt(tr()) * (R - 6);
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (!onPeakL(x, z) || d > edgeR(a) * 0.84 || flatMask(x, z) > 0.12) continue;
    if (fromMC(x, z)[0] < TIER[0] + 2.4) continue;
    if (trees.some((t) => Math.hypot(t.x - x, t.z - z) < 3.2)) continue;
    const h = 3.2 + tr() * 2.6;
    const t = snowPine(tr, M, h);
    t.position.set(x, meadowH(x, z) - 0.1, z);
    t.rotation.y = tr() * 6.28;
    t.userData.occluder = true;
    g.add(t);
    addCol(x, z, 0.32);
    trees.push({ x, z });
  }
  const rr = rng(911);
  for (let n = 0, k = 0; n < 300 && k < 14; n++) {
    const a = rr() * 6.283, d = TIER[0] + 0.8 + rr() * 8;
    const x = MC.x + Math.cos(a) * d, z = MC.z + Math.sin(a) * d;
    if (!onPeakL(x, z) || flatMask(x, z) > 0.5 || rampH(x, z) !== null) continue;
    if (trees.some((t) => Math.hypot(t.x - x, t.z - z) < 1.6)) continue;
    if (Math.hypot(x - CABIN.x, z - CABIN.z) < 4) continue;
    const s = 0.5 + rr() * 0.6;
    const rock = snowRock(s, k + 21, M);
    rock.position.set(x, meadowH(x, z) - 0.1, z);
    rock.rotation.y = rr() * 6;
    g.add(rock);
    if (s > 0.75) addCol(x, z, s * 0.8);
    k++;
  }

  // ---- falling snow round the camera (instanced soft flakes) ----
  const FLAKES = 140;
  const flakes = new InstancedMesh(new PlaneGeometry(0.09, 0.09), M.flake, FLAKES);
  flakes.frustumCulled = false; flakes.userData.dynamic = true; flakes.visible = false;
  root.add(flakes); // world space: it follows the camera
  const flakeData = Array.from({ length: FLAKES }, () => ({ x: Math.random() * 28 - 14, y: Math.random() * 14, z: Math.random() * 28 - 14, sp: 0.7 + Math.random() * 0.8, ph: Math.random() * 6.28 }));

  // ---- the aurora (lit by the bell) ----
  const aurora = makeAurora();
  g.add(aurora.group);

  // ---- the stone bridge from the Hollow (rises when the Lonely Shadow turns into fireflies) ----
  const he = hollow.exit;
  const bFrom = new Vector3(he.x, he.y + 0.05, he.z);
  const aw = W(ARRIVE.x, ARRIVE.z);
  const bTo = new Vector3(aw.x, meadowH(ARRIVE.x, ARRIVE.z) + 0.05, aw.z);
  const bridge = ctx.makeBridge(bFrom, bTo, lights, colliders, 0.5, { plank: M.stone, post: M.stone, rope: M.rope });
  bridge.group.userData.dynamic = true;
  bridge.setRise(0);
  root.add(bridge.group);
  ctx.bridges.push(bridge.data);

  // the cairn checkpoint just past the bridge
  const cw = W(CAIRN.x, CAIRN.z);
  const cairn = ctx.makeWaystone(cw.x, cw.z, meadowH(CAIRN.x, CAIRN.z));
  root.add(cairn.obj);
  colliders.push({ x: cw.x + 1.25, z: cw.z, r: 0.2 });

  // ---- walking ----
  const toL = (wx, wz) => [wx - PEAK_C.x, wz - PEAK_C.z];
  const near = (wx, wz) => Math.abs(wx - PEAK_C.x) < R + 2 && Math.abs(wz - PEAK_C.z) < R + 2;
  return {
    root: g, bridge, braziers, bell, aurora, flakes, flakeData, steam, mugs, hearthFire, roofs, stepHint, trees, cairn,
    center: PEAK_C.clone(), radius: R, starPos,
    arrive: wv(ARRIVE.x, ARRIVE.z), summit: wv(BELL.x, BELL.z),
    // for tests and shots
    ramps: RAMPS.map((rp) => ({ from: wv(rampPt(rp, 0).x, rampPt(rp, 0).z), mid: wv(rampPt(rp, 0.5).x, rampPt(rp, 0.5).z), to: wv(rampPt(rp, 0.97).x, rampPt(rp, 0.97).z), w: rp.w,
      at: (t, dr = 0) => { const q = rampPt(rp, t, dr); return wv(q.x, q.z); } })),
    step: { pos: wv(S1.x, S1.z), r: S1R, top: YS }, pillar: { pos: wv(SP.x, SP.z), r: SPR, top: SPY },
    mc: wv(MC.x, MC.z), tierR: (k, th) => tierR(k, th), levels: [Y0, Y1, Y2, Y3],
    /** a point on a terrace ring (world): level k (1..3), angle th round the mountain, dr out from the middle of the ring */
    ringAt(k, th, f = 0.5) { const ri = k >= 3 ? 0 : tierR(k, th), ro = tierR(k - 1, th); const p = polar(MC, ri + (ro - ri) * f, th); return wv(p.x, p.z); },
    cabinDoor: wv(cabinDoor.x, cabinDoor.z), cabinInside: wv(cabinInside.x, cabinInside.z), cabinWorld: wv(CABIN.x, CABIN.z),
    cabinAt: (x, z, dy = 0) => { const q = CL(x, z); return wv(q.x, q.z, dy); }, fireWorld: wv(fw.x, fw.z, 0.6),
    bellRimY: bellY, towerTh: TOWER_TH,
    /** walkable floor at world x,z from the peak (null = not here) */
    floor(wx, wz) {
      if (!near(wx, wz)) return null;
      const [x, z] = toL(wx, wz);
      if (!onPeakL(x, z)) return null;
      return groundAt(x, z);
    },
    onIsland(p) { if (!near(p.x, p.z)) return false; const [x, z] = toL(p.x, p.z); return onPeakL(x, z) && p.y > groundAt(x, z) - 2.5 && p.y < Y3 + 6; },
    level(p) { const [x, z] = toL(p.x, p.z); return levelAt(x, z, p.y); },
    inCabin(p) { const [x, z] = toL(p.x, p.z); return cabinIn(x, z) && Math.abs(p.y - cY) < 1.5; },
    surface(p) {
      if (!near(p.x, p.z)) return null;
      const [x, z] = toL(p.x, p.z);
      if (!onPeakL(x, z)) return null;
      if (cabinIn(x, z)) return 'wood';
      return 'snow';
    },
    toWorld: W,
    groundY: (wx, wz) => { const [x, z] = toL(wx, wz); return groundAt(x, z); },
  };
}
