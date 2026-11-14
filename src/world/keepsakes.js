// Island keepsakes (Abdo's idea, 2026-11-14). Three are hidden on each island; either of you picks one up by
// walking into it, and it goes into your shared satchel. By the island's way on stands a little keepsake stone
// with three cups: stand at it together, holding hands, and the keepsakes float into the cups. The next bridge
// only rises once the island's quest is done AND its keepsakes are placed (Abdo picked "required, with the quest").
// Keepsakes shimmer and chime softly when you're near, so it's a wander, not a hunt.
//   forest: firefly jars  -> the north bridge to the shrine
//   lake:   moon pearls   -> the sandstone bridge to the desert (one floats on the rowboat's drift)
//   desert: sun-glass     -> the old rope bridge into Whispering Hollow
//   hollow: lullaby notes -> the stone bridge to the Snowy Peak (they hum softly in the dark)
//   peak:   aurora feathers -> the cloud steps up to the Cloud Kingdom
//   tower:  two halves of a locket, one blue, one red: no stone, the beacon itself only lights once both are found,
//           and lighting it joins them (towerquest.js). The closing card shows the joined locket.
// Online: whoever touches a keepsake gets it for both (merged like stars); the host decides when a stone is
// filled and sends it over (placedMask / applyPlaced).
import { Group, Mesh, Vector3, BoxGeometry, CylinderGeometry, SphereGeometry, OctahedronGeometry, PlaneGeometry, TorusGeometry, IcosahedronGeometry, CircleGeometry } from 'three';
import { makeWatercolorMaterial, makeGlowMaterial, makeSoftMaterial } from '../look/material.js';
import { PAL } from '../look/palette.js';
import { displace } from './shapes.js';

const PICK = 1.35;   // how close you walk to pick one up
const NEAR = 8;      // the shimmer and chime start this close
const SOCKET_R = 3.0; // both of you this close to the stone
const NEED = 1.4;    // seconds of standing there together
const flat = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

export const KEEPSAKE_SETS_ALL = [
  { id: 'forest', name: 'Firefly jars', one: 'firefly jar', many: 'firefly jars', where: 'by the north bridge', make: makeJar,
    hint: 'One rests in the roots of the big north-west tree, one waits by the east fence, and one rode the warm wind to the meadow island.' },
  { id: 'lake', name: 'Moon pearls', one: 'moon pearl', many: 'moon pearls', where: 'on the north-east shore, by the way to the desert', make: makePearl,
    hint: 'One sleeps in the reeds on the north shore, one by the east shore, and one floats out on the water where only a boat can drift.' },
  { id: 'hollow', name: 'Lullaby notes', one: 'lullaby note', many: 'lullaby notes', where: 'by the far side, where the way on opens', make: makeNote, chime: 'hum',
    hint: 'Listen for humming in the dark: one by the crooked house, one far south past the old lamp, and one near the east bell.' },
  { id: 'peak', name: 'Aurora feathers', one: 'aurora feather', many: 'aurora feathers', where: 'on the summit, beside the aurora bell', make: makeFeather,
    hint: 'One rests in the snow on the west meadow, one on the first terrace, and one up on the second, round the far side of the mountain.' },
  { id: 'tower', name: 'Locket halves', one: 'half a locket', many: 'locket halves', where: 'at the beacon (it only lights once the locket is whole)', make: makeLocket, noStone: true,
    hint: 'One half waits on the big resting cloud halfway up the steps; the other on the Cloud Kingdom\'s north rim.' },
  { id: 'desert', name: 'Sun-glass', one: 'piece of sun-glass', many: 'pieces of sun-glass', where: 'on the sun terrace, by the old rope bridge', make: makeShard,
    hint: 'One glints in the hidden oasis, one sheltered behind a wall in the Windy Pass, and one half-buried in the dunes to the south-west.' },
];

// the online masks count in this order: never reorder, only append
const ORDER = ['forest', 'lake', 'desert', 'hollow', 'peak', 'tower'];
export const KEEPSAKE_SETS = ORDER.map((id) => KEEPSAKE_SETS_ALL.find((s) => s.id === id));

/** clearance from every collider at x,z (0 = touching) */
function clearance(world, x, z) {
  let best = Infinity;
  for (const c of world.colliders) {
    if (c.off) continue;
    let cx, cz;
    if (c.ax !== undefined) {
      const abx = c.bx - c.ax, abz = c.bz - c.az;
      const t = Math.max(0, Math.min(1, ((x - c.ax) * abx + (z - c.az) * abz) / (abx * abx + abz * abz || 1)));
      cx = c.ax + abx * t; cz = c.az + abz * t;
    } else { cx = c.x; cz = c.z; }
    best = Math.min(best, Math.hypot(x - cx, z - cz) - c.r);
  }
  return best;
}

/** the nearest open, dry, walkable spot to (x, z): clear of trees, rocks and walls by `room` metres */
export function settle(world, x, z, room = 1.0, y) {
  for (let r = 0; r <= 4; r += 0.4) {
    const n = r === 0 ? 1 : Math.ceil(r * 8);
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2, px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
      const f = world.floorAt(px, pz, y);
      if (f == null || (world.deep && world.deep(px, pz))) continue;
      if (y !== undefined && Math.abs(f - y) > 1.2) continue;
      if (clearance(world, px, pz) < room) continue;
      return new Vector3(px, f, pz);
    }
  }
  return new Vector3(x, world.floorAt(x, z, y) ?? 0, z);
}

// ---------- the keepsakes themselves (primitives, through the look recipe) ----------
function halo(color, size, y = 0.22) {
  const h = new Mesh(new PlaneGeometry(size, size), makeSoftMaterial(color, 0.5, true));
  h.renderOrder = 3; h.userData.billboard = true; h.position.y = y;
  return h;
}

function makeJar() {
  const g = new Group();
  const glass = new Mesh(new CylinderGeometry(0.17, 0.15, 0.36, 14), makeSoftMaterial(PAL.crystalCore, 0.42));
  glass.position.y = 0.18; glass.renderOrder = 2;
  const lip = new Mesh(new CylinderGeometry(0.13, 0.17, 0.06, 14), makeSoftMaterial(PAL.crystalCore, 0.5));
  lip.position.y = 0.38; lip.renderOrder = 2;
  const cork = new Mesh(new CylinderGeometry(0.1, 0.11, 0.09, 10), makeWatercolorMaterial({ lit: PAL.wood, rim: 0.3 }));
  cork.position.y = 0.44;
  const string = new Mesh(new TorusGeometry(0.135, 0.015, 5, 16), makeWatercolorMaterial({ lit: PAL.trunk, rim: 0.2 }));
  string.rotation.x = Math.PI / 2; string.position.y = 0.4;
  g.add(glass, lip, cork, string);
  const flies = new Group();
  const fly = makeGlowMaterial(PAL.glowCore, PAL.glowHalo, 1.6);
  for (let i = 0; i < 4; i++) { const f = new Mesh(new SphereGeometry(0.035, 6, 4), fly); f.userData.ph = i * 1.7; flies.add(f); }
  flies.position.y = 0.18; g.add(flies);
  g.add(halo(PAL.glowHalo, 1.3));
  g.userData.spin = (t) => flies.children.forEach((f, i) => {
    const a = t * (1.2 + i * 0.3) + f.userData.ph;
    f.position.set(Math.cos(a) * 0.08, Math.sin(t * 2.1 + i) * 0.1, Math.sin(a) * 0.08);
  });
  return g;
}

function makePearl() {
  const g = new Group();
  const shell = makeWatercolorMaterial({ lit: PAL.shell, rim: 0.45 });
  const lower = new Mesh(displace(new SphereGeometry(0.26, 14, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), 0.015, 6, 3), shell);
  lower.scale.y = 0.45; lower.position.y = 0.12;
  const upper = new Mesh(displace(new SphereGeometry(0.26, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2), 0.015, 6, 4), shell);
  upper.scale.y = 0.45; upper.position.set(0, 0.13, -0.17); upper.rotation.x = -0.9;
  const pearl = new Mesh(new SphereGeometry(0.11, 14, 10), makeGlowMaterial(PAL.crystalCore, PAL.crystalHalo, 1.5));
  pearl.position.y = 0.2;
  g.add(lower, upper, pearl, halo(PAL.crystalHalo, 1.2));
  return g;
}

function makeShard() {
  const g = new Group();
  const glow = makeGlowMaterial(PAL.sunCore, PAL.sunHalo, 1.5);
  const a = new Mesh(new OctahedronGeometry(0.17, 0), glow); a.scale.set(0.7, 1.5, 0.7); a.position.y = 0.2; a.rotation.z = 0.35;
  const b = new Mesh(new OctahedronGeometry(0.1, 0), glow); b.scale.set(0.7, 1.4, 0.7); b.position.set(0.14, 0.1, 0.05); b.rotation.z = -0.5;
  const sand = new Mesh(displace(new IcosahedronGeometry(0.24, 1), 0.04, 4, 7), makeWatercolorMaterial({ lit: PAL.sand, rim: 0.2 }));
  sand.scale.set(1.2, 0.3, 1.1); sand.position.y = 0.02;
  g.add(sand, a, b, halo(PAL.sunHalo, 1.3));
  return g;
}

function makeNote() {
  const g = new Group();
  const glow = makeGlowMaterial(PAL.flyCore, PAL.flyHalo, 1.6);
  const head = new Mesh(new SphereGeometry(0.11, 12, 8), glow); head.scale.set(1.25, 0.9, 0.7); head.position.set(-0.08, 0.2, 0); head.rotation.z = 0.4;
  const head2 = new Mesh(new SphereGeometry(0.11, 12, 8), glow); head2.scale.set(1.25, 0.9, 0.7); head2.position.set(0.2, 0.28, 0); head2.rotation.z = 0.4;
  const stem = new Mesh(new CylinderGeometry(0.022, 0.022, 0.42, 5), glow); stem.position.set(0.04, 0.4, 0);
  const stem2 = new Mesh(new CylinderGeometry(0.022, 0.022, 0.42, 5), glow); stem2.position.set(0.32, 0.48, 0);
  const beam = new Mesh(new BoxGeometry(0.32, 0.06, 0.04), glow); beam.position.set(0.18, 0.64, 0); beam.rotation.z = 0.25;
  g.add(head, head2, stem, stem2, beam, halo(PAL.flyHalo, 1.4, 0.35));
  return g;
}

function makeFeather() {
  const g = new Group();
  const vane = new Mesh(new SphereGeometry(0.14, 12, 8), makeGlowMaterial(PAL.glowCore, PAL.auroraA, 1.4));
  vane.scale.set(0.55, 2.3, 0.18); vane.position.y = 0.38; vane.rotation.z = 0.3;
  const tip = new Mesh(new SphereGeometry(0.1, 10, 6), makeGlowMaterial(PAL.glowCore, PAL.auroraB, 1.4));
  tip.scale.set(0.5, 1.4, 0.16); tip.position.set(-0.1, 0.62, 0); tip.rotation.z = 0.3;
  const quill = new Mesh(new CylinderGeometry(0.012, 0.018, 0.3, 4), makeWatercolorMaterial({ lit: PAL.snow, rim: 0.3 }));
  quill.position.set(0.08, 0.08, 0); quill.rotation.z = 0.3;
  g.add(vane, tip, quill, halo(PAL.auroraA, 1.3, 0.4));
  return g;
}

function makeLocket() {
  const g = new Group();
  const gold = makeWatercolorMaterial({ lit: PAL.brass, rim: 0.6, wash: 0.1 });
  const half = new Mesh(new SphereGeometry(0.2, 14, 10, 0, Math.PI), gold); half.scale.set(1, 1.15, 0.35); half.position.y = 0.3;
  const gem = new Mesh(new SphereGeometry(0.07, 10, 8), makeGlowMaterial(PAL.glowCore, PAL.glowHalo, 1.5)); gem.position.set(0, 0.3, 0.06);
  const loop = new Mesh(new TorusGeometry(0.05, 0.015, 5, 10), gold); loop.position.y = 0.55;
  g.add(half, gem, loop, halo(PAL.glowHalo, 1.2, 0.3));
  g.userData.gem = gem;
  return g;
}

function makeStone(set, n = 3) {
  const g = new Group();
  const stone = makeWatercolorMaterial({ lit: PAL.stone, rim: 0.35, wash: 0.18 });
  const moss = makeWatercolorMaterial({ lit: PAL.moss, rim: 0.3, breakup: 0.4 });
  const base = new Mesh(displace(new CylinderGeometry(0.75, 0.9, 0.55, 12, 2), 0.04, 3, 11), stone);
  base.position.y = 0.2;
  const top = new Mesh(displace(new CylinderGeometry(0.82, 0.78, 0.14, 14, 1), 0.02, 4, 12), moss);
  top.position.y = 0.52;
  g.add(base, top);
  const cups = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + Math.PI / 2;
    const cup = new Mesh(new TorusGeometry(0.17, 0.045, 6, 16), stone);
    cup.rotation.x = Math.PI / 2; cup.position.set(Math.cos(a) * 0.45, 0.6, Math.sin(a) * 0.45);
    const dot = new Mesh(new CircleGeometry(0.13, 12).rotateX(-Math.PI / 2), makeGlowMaterial(PAL.glowCore, PAL.glowHalo, 0.35));
    dot.position.copy(cup.position).setY(0.595);
    const k = set.make(); k.scale.setScalar(0.62); k.position.copy(cup.position).setY(0.58); k.visible = false;
    g.add(cup, dot, k);
    cups.push({ dot, k });
  }
  const ring = new Mesh(new TorusGeometry(SOCKET_R * 0.55, 0.05, 6, 48), makeGlowMaterial(PAL.glowCore, PAL.glowHalo, 0.0));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.06; ring.visible = false;
  g.add(ring);
  return { g, cups, ring };
}

export class Keepsakes {
  /** spots: { forest: [[x, z(, y)], ...], ... }, sockets: { forest: Vector3, ... }, opts.floating: item keys that float on water at a fixed y */
  constructor(world, scene, events, motes, { spots, sockets, floating = {} }) {
    this.world = world; this.events = events; this.motes = motes;
    this.remote = false; // online guest: the host fills the stones
    this.sets = KEEPSAKE_SETS.filter((s) => spots[s.id]).map((s, si) => {
      if (s.noStone || !sockets[s.id]) return { ...s, si, stone: null, pos: (sockets[s.id] ?? new Vector3()).clone(), light: null, placed: false, charge: 0, flyK: 1, hintT: -99 };
      const st = makeStone(s, spots[s.id].length);
      const sp = settle(world, sockets[s.id].x, sockets[s.id].z, 1.3, sockets[s.id].y);
      st.g.position.copy(sp); st.g.userData.dynamic = true; scene.add(st.g);
      world.colliders.push({ x: sp.x, z: sp.z, r: 0.75, top: sp.y + 0.62 });
      this.world.lights?.push({ obj: st.g, str: 0, offset: 0.8 });
      const light = this.world.lights?.[this.world.lights.length - 1];
      return { ...s, si, stone: st, pos: sp, light, placed: false, charge: 0, flyK: 0, hintT: -99 };
    });
    this.items = [];
    for (const set of this.sets) {
      spots[set.id].forEach(([x, z, y], i) => {
        const key = `${set.id}${i}`;
        const pos = floating[key] != null ? new Vector3(x, floating[key], z) : settle(world, x, z, 0.8, y);
        const g = set.make(); g.position.copy(pos); g.userData.dynamic = true; scene.add(g);
        this.items.push({ set, i, key, g, pos, got: false, pop: 0, ph: i * 2.1 + set.si, chimeT: -99 });
      });
    }
    this.moteT = 0;
  }

  count(id) { return this.items.filter((it) => it.set.id === id && it.got).length; }
  of(id) { return this.items.filter((it) => it.set.id === id).length; }
  set(id) { return this.sets.find((s) => s.id === id); }
  /** has this island's stone been filled? (the bridge waits for it) */
  placed(id) { const s = this.set(id); return !s || s.placed; }

  /** bit i set = keepsake i picked up */
  mask() { return this.items.reduce((m, it, i) => m | (it.got ? 1 << i : 0), 0); }
  placedMask() { return this.sets.reduce((m, s, i) => m | (s.placed ? 1 << i : 0), 0); }
  applyPlaced(m, quiet) { this.sets.forEach((s, i) => { if (m & (1 << i)) this.place(s, quiet); }); }

  /** pick up keepsake i (also when your partner did, on their screen) */
  take(i, quiet = false) {
    const it = this.items[i];
    if (!it || it.got) return;
    it.got = true;
    if (quiet) { it.pop = 1; it.g.visible = false; } else this.motes.emit(it.pos.clone().setY(it.pos.y + 0.3), 28, { speed: 2.2, up: 2.2, life: 1.4, size: 0.2, spread: 0.3 });
    const n = this.count(it.set.id);
    this.events.emit('keepsake', { set: it.set.id, name: it.set.name, one: it.set.one, many: it.set.many, where: it.set.where, n, of: this.of(it.set.id), pos: it.pos, quiet });
  }

  place(s, quiet = false) {
    if (s.placed) return;
    s.placed = true; s.charge = 1;
    if (quiet) s.flyK = 1;
    for (const it of this.items) if (it.set === s && !it.got) this.take(this.items.indexOf(it), true); // joining late
    this.events.emit('keepsake-placed', { set: s.id, name: s.name, many: s.many, pos: s.pos, quiet });
  }

  update(dt, t, travelers, linked, camera, pickers = travelers) {
    const [a, b] = travelers;
    // ---- keepsakes: bob, shimmer, chime when near, picked up on touch ----
    this.moteT -= dt;
    for (const it of this.items) {
      if (it.got) {
        if (it.pop < 1) { it.pop = Math.min(1, it.pop + dt * 2.2); it.g.scale.setScalar(Math.max(0.001, (1 + it.pop * 0.6) * (1 - it.pop))); it.g.position.y += dt * 2.2; }
        else it.g.visible = false;
        continue;
      }
      it.g.position.y = it.pos.y + 0.12 + Math.sin(t * 2 + it.ph) * 0.07;
      it.g.rotation.y = t * 0.6 + it.ph;
      it.g.userData.spin?.(t);
      it.g.traverse((c) => { if (c.userData.billboard) c.quaternion.copy(camera.quaternion).premultiply(it.g.quaternion.clone().invert()); });
      const d = Math.min(...travelers.map((p) => p.pos.distanceTo(it.pos)));
      if (d < NEAR) {
        if (this.moteT < 0) this.motes.emit(it.pos.clone().setY(it.pos.y + 0.35), 1, { speed: 0.3, up: 0.7, life: 1.6, size: 0.1, spread: 0.25, grav: 0.1, drag: 0.6 });
        if (t - it.chimeT > 3.2) { it.chimeT = t; this.events.emit('sfx', { name: it.set.chime ?? 'twinkle', pos: it.pos }); }
      }
      if (pickers.some((p) => p.pos.distanceTo(it.pos) < PICK + 0.25)) this.take(this.items.indexOf(it), false);
    }
    if (this.moteT < 0) this.moteT = 0.35;

    // ---- the stones: hold hands at one with its whole set to fill it ----
    for (const s of this.sets) {
      if (!s.stone) continue; // the locket: the beacon fills it (towerquest.js)
      const have = this.count(s.id), all = have >= this.of(s.id);
      const near = (p) => p && flat(p.pos, s.pos) < SOCKET_R && Math.abs(p.pos.y - s.pos.y) < 1.8;
      const both = near(a) && near(b) && linked;
      if (!s.placed) {
        if (!this.remote) {
          s.charge = all && both ? s.charge + dt / NEED : Math.max(0, s.charge - dt);
          if (s.charge >= 1) this.place(s, false);
        }
        if (near(a) && t - s.hintT > 9) {
          s.hintT = t;
          this.events.emit('hint', !all ? `This stone has ${['', 'one little cup', 'two little cups', 'three little cups'][this.of(s.id)] ?? 'little cups'}. ${this.of(s.id) - have} ${this.of(s.id) - have === 1 ? s.one : s.many} still to find`
            : !both ? 'Hold hands here to place them together' : '');
        }
      }
      if (s.placed && s.flyK < 1) s.flyK = Math.min(1, s.flyK + dt / 1.6);
      // visuals: an empty cup glows faintly once you carry its keepsake; filled cups glow warm
      s.stone.cups.forEach((c, i) => {
        const filled = s.placed && s.flyK > i / s.stone.cups.length;
        if (filled && !c.k.visible) { c.k.visible = true; this.motes.emit(s.pos.clone().setY(s.pos.y + 0.7), 10, { speed: 1.2, up: 1.6, life: 1, size: 0.15, spread: 0.3 }); }
        c.k.userData.spin?.(t);
        c.k.traverse((m) => { if (m.userData.billboard) m.quaternion.copy(camera.quaternion); });
        c.dot.material.uniforms.uStr.value = filled ? 1.2 : i < have ? 0.6 + Math.sin(t * 3 + i) * 0.15 : 0.3;
      });
      s.stone.ring.visible = !s.placed && s.charge > 0.01;
      s.stone.ring.material.uniforms.uStr.value = 0.4 + s.charge * 1.2;
      s.stone.ring.scale.setScalar(1.15 - s.charge * 0.4);
      if (s.light) s.light.str = s.placed ? 1.1 : all ? 0.5 + Math.sin(t * 2.5) * 0.2 : 0;
    }
  }

  /** has every keepsake of this set been picked up? */
  all(id) { return this.count(id) >= this.of(id); }

  /** debug / test skips: pick up and place a whole set (or every set) at once */
  completeNow(id) {
    for (const s of this.sets) if (!id || s.id === id) {
      this.items.forEach((it, i) => { if (it.set === s) this.take(i, true); });
      this.place(s, true);
    }
  }
}
