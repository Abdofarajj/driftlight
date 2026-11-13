// Hidden secrets in the Lantern Forest (round 4):
//   grotto  - a little waterfall at the south edge; behind it, a cave where Roro Jr waits
//   fox     - a light fox asleep in the roots of the north-east tree; it wakes and follows you
//   ring    - a fairy ring of mushrooms in a clearing east of the path; it lights up only for two
//   garden  - a secret sunflower garden on the meadow island, whose flowers turn to watch you
//   boat    - the rowboat at Crystal Lake drifts round the lake when you both sit in it (lakequest.js)
// Each has a small discovery moment (events: 'secret'), and the found set is shared online like stars.
import { Group, Mesh, IcosahedronGeometry, PlaneGeometry, CircleGeometry, ConeGeometry, CylinderGeometry, SphereGeometry, Vector3 } from 'three';
import { makeWatercolorMaterial, makeGlowMaterial, makeSoftMaterial, makeWaterMaterial } from '../look/material.js';
import { PAL } from '../look/palette.js';
import { displace } from './shapes.js';
import { rng } from './rng.js';
import { groundHeight } from './forest.js';
import { makeRoroJr, makeSunflower, makeFairyMushroom } from './props.js';
import { LightFox } from './fox.js';
import { GRAV } from '../player/actor.js';
import { Motes } from './sparkles.js';
import { SECRETS_TEXT } from './jokes.js';

export const GROTTO_C = new Vector3(-9.3, 0, 16.1); // on the south edge, mouth facing the island centre
const FOX_NEST = [13.4, -11.3];                     // north-east side of the big tree at (11, -9)
const RING_C = new Vector3(9.5, 0, -1.5);           // a clearing east of the path, between the mushroom patches
const GARDEN_C = new Vector3(-55.2, 3.0, -7.6);     // behind the tree on the meadow island

const flat = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

export class Secrets {
  constructor(world, scene, events) {
    this.world = world;
    this.events = events;
    this.motes = new Motes(scene, 220);
    this.items = ['grotto', 'fox', 'ring', 'garden', 'boat'].map((id) => ({ id, found: false, pos: new Vector3() }));
    this.count = 0;
    this.buildGrotto(scene);
    this.fox = new LightFox(scene, FOX_NEST[0], FOX_NEST[1], -2.2, world.colliders, this.motes);
    this.items[1].pos.copy(this.fox.nest);
    this.buildRing(scene);
    this.buildGarden(scene);
  }

  // ---------- the grotto behind the waterfall, with Roro Jr inside ----------
  buildGrotto(scene) {
    const C = GROTTO_C, f = new Vector3(-C.x, 0, -C.z).normalize(); // local +z: out of the mouth, towards the island centre
    const th = Math.atan2(f.x, f.z), cs = Math.cos(th), sn = Math.sin(th);
    const toWorld = (lx, lz) => ({ x: C.x + lx * cs + lz * sn, z: C.z - lx * sn + lz * cs });
    this.gToWorld = toWorld;
    this.gLocal = (p) => { const dx = p.x - C.x, dz = p.z - C.z; return { x: dx * cs - dz * sn, z: dx * sn + dz * cs }; };
    const baseY = groundHeight(C.x, C.z);
    this.gBaseY = baseY;
    const g = new Group(); g.position.set(C.x, baseY, C.z); g.rotation.y = th; scene.add(g);
    const stone = makeWatercolorMaterial({ lit: PAL.cliff, rim: 0.3, wash: 0.18 });
    const moss = makeWatercolorMaterial({ lit: PAL.moss, rim: 0.35, breakup: 0.4 });
    const rock = (lx, ly, lz, sx, sy, sz, seed, mat = stone) => {
      const m = new Mesh(displace(new IcosahedronGeometry(1, 3), 0.15, 1.3, seed), mat);
      m.position.set(lx, ly, lz); m.scale.set(sx, sy, sz); m.rotation.y = (((seed * 0.618) % 1) - 0.5) * 0.3; // small turn: a big one would swing the long axis round
      m.userData.occluder = true; this.world.occluders.push(m);
      g.add(m); return m;
    };
    // walls, roof and a mossy top: a hollow about 2.2 m wide, 2 m deep and 2.5 m high
    rock(0, 1.5, -2.45, 2.6, 2.3, 1.2, 61); rock(-1.65, 1.2, -2.0, 1.35, 2.0, 1.3, 62); rock(1.65, 1.3, -2.1, 1.35, 2.1, 1.3, 63);
    rock(-2.5, 1.3, -0.5, 1.2, 2.0, 1.8, 64); rock(2.5, 1.3, -0.5, 1.2, 2.0, 1.8, 65);
    rock(-2.2, 1.6, 0.95, 0.9, 2.2, 0.9, 66); rock(2.2, 1.6, 0.95, 0.9, 2.2, 0.9, 67);
    rock(0, 3.45, -0.6, 3.2, 0.9, 2.35, 68);
    rock(-1.0, 4.05, -1.6, 1.9, 1.2, 1.6, 69, moss); rock(1.2, 3.95, -1.9, 1.7, 1.1, 1.4, 70, moss); rock(0.2, 4.4, -0.9, 1.5, 0.8, 1.4, 71, moss);
    for (const [lx, lz, r] of [[-2.5, -0.5, 1.1], [2.5, -0.5, 1.1], [-2.2, 0.95, 0.8], [2.2, 0.95, 0.8], [0, -2.45, 1.1], [-1.65, -2.0, 0.95], [1.65, -2.1, 0.95], [0, -0.45, 0.95]]) { // last one: Roro's cushion, so you stop where the camera can see him
      const w = toWorld(lx, lz); this.world.colliders.push({ x: w.x, z: w.z, r });
    }
    // the falling curtain over the mouth, bulging out a little at the bottom
    const cg = new PlaneGeometry(3.1, 3.35, 8, 12);
    const pa = cg.attributes.position;
    for (let i = 0; i < pa.count; i++) { const y = pa.getY(i); pa.setZ(i, ((1.675 - y) / 3.35) ** 2 * 0.4); }
    cg.computeVertexNormals();
    const curtain = new Mesh(cg, makeWaterMaterial({ mode: 0, flow: 1.5, opacity: 0.62 }));
    curtain.position.set(0, 1.62, 1.62); curtain.renderOrder = 2; g.add(curtain);
    this.curtain = curtain;
    // the pool it falls into, with a ring of pebbles
    const pw = toWorld(0, 2.75);
    const pool = new Mesh(new CircleGeometry(1.75, 40).rotateX(-Math.PI / 2), makeWaterMaterial({ mode: 1, flow: 0.5, opacity: 0.5 }));
    pool.position.set(0, groundHeight(pw.x, pw.z) - baseY + 0.07, 2.75); pool.renderOrder = 1; g.add(pool);
    const pr = rng(71);
    for (let i = 0; i < 13; i++) {
      const a = (i / 13) * Math.PI * 2 + pr() * 0.2;
      if (Math.cos(a) > 0.75) continue; // leave the way in open
      const lx = Math.sin(a) * 1.85, lz = 2.75 + Math.cos(a) * 1.85, w = toWorld(lx, lz);
      const peb = new Mesh(displace(new IcosahedronGeometry(1, 1), 0.2, 1.5, 80 + i), stone);
      peb.scale.set(0.22 + pr() * 0.12, 0.13, 0.2 + pr() * 0.1); peb.position.set(lx, groundHeight(w.x, w.z) - baseY + 0.04, lz); g.add(peb);
    }
    // mist where the water lands
    this.mist = [];
    const mistMat = makeSoftMaterial(PAL.water[0], 0.32);
    for (let i = 0; i < 5; i++) { const m = new Mesh(new PlaneGeometry(1.3, 1.3), mistMat); m.position.set(-1.1 + i * 0.55, 0.35, 1.95); m.renderOrder = 3; g.add(m); this.mist.push(m); }
    this.grottoGroup = g;
    // spill off the island edge behind the outcrop, into the clouds
    const spill = new Mesh(new CylinderGeometry(1.4, 1.9, 18, 14, 1, true, -Math.PI / 2, Math.PI), makeWaterMaterial({ mode: 0, flow: 1.8, opacity: 0.55 }));
    const sw = toWorld(0, -5.6);
    spill.position.set(0, groundHeight(sw.x, sw.z) - baseY - 8.9, -5.6); spill.rotation.y = Math.PI; g.add(spill);
    // inside: glowing crystals, Roro Jr on a mossy cushion, a sunflower either side
    const crystal = makeGlowMaterial(PAL.crystalCore, PAL.crystalHalo, 1.15);
    const cr = rng(90);
    const crystals = new Group(); g.add(crystals);
    for (const [lx, lz] of [[-1.15, -1.05], [-0.95, -1.3], [1.1, -1.1], [1.25, -0.8], [0.6, -1.4], [-0.5, -1.45]]) {
      const h = 0.35 + cr() * 0.5;
      const c = new Mesh(new ConeGeometry(0.08 + cr() * 0.06, h, 5).translate(0, h / 2, 0), crystal);
      c.position.set(lx, -0.05, lz); c.rotation.set((cr() - 0.5) * 0.6, cr() * 3, (cr() - 0.5) * 0.6); crystals.add(c);
    }
    this.world.lights.push({ obj: crystals, str: 0.9, offset: 0.6 });
    const cushion = new Mesh(displace(new SphereGeometry(0.46, 16, 10), 0.04, 3, 91), moss);
    cushion.scale.set(1, 0.32, 0.9); cushion.position.set(0, 0.06, -0.6); g.add(cushion);
    this.roro = makeRoroJr();
    this.roro.position.set(0, 0.16, -0.62); this.roro.scale.setScalar(1.05); g.add(this.roro);
    this.roro.userData.dynamic = true; // he waves
    for (const s of [-1, 1]) { const sf = makeSunflower(0.95, 100 + s); sf.group.position.set(s * 0.82, -0.02, -0.75); sf.head.rotation.y = -s * 0.35; g.add(sf.group); }
    this.waveT = 0; this.lastWave = -99; this.showT = 0; this.showSide = 1;
    const rw = toWorld(0, -0.4);
    this.items[0].pos.set(rw.x, baseY + 0.8, rw.z);
    this.waterPos = new Vector3(toWorld(0, 1.6).x, baseY + 1.2, toWorld(0, 1.6).z);
  }

  // ---------- the fairy ring ----------
  buildRing(scene) {
    const g = new Group(); scene.add(g); this.ringGroup = g;
    const y0 = groundHeight(RING_C.x, RING_C.z);
    RING_C.y = y0;
    this.ringMush = [];
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      const x = RING_C.x + Math.cos(a) * 1.85, z = RING_C.z + Math.sin(a) * 1.85;
      const m = makeFairyMushroom(0.72 + ((i * 37) % 10) / 40, 200 + i);
      m.group.position.set(x, groundHeight(x, z) - 0.03, z);
      g.add(m.group); this.ringMush.push({ ...m, lit: 0, rang: false, pos: new Vector3(x, groundHeight(x, z) + 0.4, z) });
    }
    this.ringLight = new Mesh(new SphereGeometry(0.01), makeGlowMaterial()); this.ringLight.position.set(RING_C.x, y0 + 0.6, RING_C.z); g.add(this.ringLight);
    this.ringLightEntry = { obj: this.ringLight, str: 0 };
    this.world.lights.push(this.ringLightEntry);
    this.ring = { state: 'idle', t: 0, cool: 0, hintT: -99, dustT: 0 };
    this.ringCenter = RING_C;
    this.items[2].pos.set(RING_C.x, y0 + 0.5, RING_C.z);
  }

  // ---------- the sunflower garden ----------
  buildGarden(scene) {
    const g = new Group(); g.position.copy(GARDEN_C); scene.add(g); this.gardenGroup = g;
    const r = rng(300);
    this.flowers = [];
    const spots = [];
    for (let tries = 0; spots.length < 13 && tries < 400; tries++) {
      const a = r() * Math.PI * 2, d = Math.sqrt(r()) * 2.5;
      const x = Math.cos(a) * d, z = Math.sin(a) * d;
      if (spots.some((s) => Math.hypot(s[0] - x, s[1] - z) < 0.75)) continue;
      spots.push([x, z]);
    }
    spots.forEach(([x, z], i) => {
      const sf = makeSunflower(1.3 + r() * 0.65, 400 + i);
      sf.group.position.set(x, -0.02, z);
      sf.base = Math.PI / 2 + (r() - 0.5) * 0.7; // facing east, towards the forest, until you find them
      sf.head.rotation.y = sf.base; sf.ph = r() * 6; sf.bounce = 0; sf.world = new Vector3(GARDEN_C.x + x, GARDEN_C.y + 1.6, GARDEN_C.z + z);
      sf.group.userData.dynamic = true; // sways, and the heads turn to watch you
      g.add(sf.group); this.flowers.push(sf);
    });
    this.items[3].pos.copy(GARDEN_C).setY(GARDEN_C.y + 1.4);
    this.gardenCenter = GARDEN_C;
  }

  /** mark secret i found (also when your partner found it). quiet: no fanfare, e.g. on joining */
  take(i, quiet = false) {
    const it = this.items[i];
    if (!it || it.found) return;
    it.found = true; this.count++;
    if (!quiet) {
      this.motes.emit(it.pos, 34, { speed: 3, up: 2.2, life: 1.6, size: 0.26, spread: 0.4 });
      if (it.id === 'grotto') this.waveT = 4.5;
      if (it.id === 'garden') this.flowers.forEach((f, k) => { f.bounce = -0.08 * k; });
    }
    this.events.emit('secret', { i, id: it.id, n: this.count, of: this.items.length, pos: it.pos, quiet, ...SECRETS_TEXT[it.id] });
  }

  /** 0 outside .. 1 well inside the grotto (the camera comes in low and close so you can see Roro) */
  grottoK(p) {
    const l = this.gLocal(p);
    if (Math.abs(p.y - this.gBaseY) > 2 || Math.abs(l.x) > 2) return 0;
    return Math.max(0, Math.min(1, (2.4 - l.z) / 1.6));
  }

  /**
   * The little camera moment when you step in to Roro: for a few seconds the camera moves in front of you,
   * off to one side, and looks at him waving. Returns null when there's nothing to show.
   */
  grottoCam() {
    if (this.showT <= 0) return null;
    const side = this.showSide;
    if (!this._gcam || this._gcam.side !== side) {
      const c = this.gToWorld(side * 0.85, 0.62), l = this.gToWorld(-side * 0.08, -0.6);
      this._gcam = { side, pos: new Vector3(c.x, this.gBaseY + 1.35, c.z), look: new Vector3(l.x, this.gBaseY + 0.9, l.z) }; // his face, a bit below the middle of the screen
    }
    return this._gcam;
  }

  mask() { return this.items.reduce((m, it, i) => m | (it.found ? 1 << i : 0), 0); }

  /** travelers: [you, partner] actors. Discovery by either of you counts for both. */
  update(dt, t, travelers, camera) {
    const ps = travelers.map((a) => a.pos);
    // grotto: step behind the water
    const inGrotto = ps.some((p) => { const l = this.gLocal(p); return l.z < 1.2 && l.z > -1.4 && Math.abs(l.x) < 1.35 && Math.abs(p.y - this.gBaseY) < 1.6; });
    if (inGrotto && !this.items[0].found) this.take(0);
    if (this.items[0].found) {
      const near = ps.some((p) => flat(p, this.items[0].pos) < 2.4);
      if (near && t - this.lastWave > 9 && this.waveT <= 0) { this.waveT = 3; this.lastWave = t; }
    }
    this.waveT = Math.max(0, this.waveT - dt);
    // the camera moment: when you (not your partner) step in and he's been found
    const me = travelers[0];
    const aIn = !!me && this.grottoK(me.pos) > 0.6;
    const foundNow = this.items[0].found && !this.wasFound0; this.wasFound0 = this.items[0].found;
    if (aIn && this.items[0].found && (!this.aIn || foundNow)) { this.showT = 4.2; this.showSide = this.gLocal(me.pos).x > 0 ? -1 : 1; if (this.waveT <= 0) { this.waveT = 3; this.lastWave = t; } }
    this.aIn = aIn;
    this.showT = aIn ? Math.max(0, this.showT - dt) : 0;
    this.roroK = (this.roroK ?? 0) + ((this.waveT > 0 ? 1 : 0) - (this.roroK ?? 0)) * Math.min(1, dt * 5);
    this.roro.userData.wave(t, this.roroK);
    // the water thins while someone is inside, so the camera can see in
    const gk = Math.max(0, ...ps.map((p) => this.grottoK(p)));
    const op = this.curtain.material.uniforms.uOp;
    op.value += ((0.62 - gk * 0.34) - op.value) * Math.min(1, dt * 3);
    this.mist.forEach((m, i) => { m.quaternion.copy(camera.quaternion); m.scale.setScalar(1 + Math.sin(t * 1.3 + i * 1.7) * 0.18); });

    // fox
    this.fox.update(dt, t, ps);
    for (const e of this.fox.events) {
      this.events.emit('sfx', { name: 'yip', pos: this.fox.pos });
      if (e.first && !this.items[1].found) this.take(1);
    }
    this.fox.events.length = 0;

    // fairy ring: both of you inside it
    const R = this.ring;
    const inside = (p) => flat(p, RING_C) < 1.55 && Math.abs(p.y - RING_C.y) < 1.4;
    const ins = ps.map(inside);
    R.cool = Math.max(0, R.cool - dt);
    if (R.state === 'idle') {
      if (ps.length > 1 && ins.every(Boolean) && R.cool <= 0) {
        R.state = 'dance'; R.t = 0;
        this.ringMush.forEach((m) => { m.rang = false; });
        if (!this.items[2].found) this.take(2);
      } else if (ins[0] && !ins.slice(1).some(Boolean) && t - R.hintT > 12) {
        R.hintT = t; this.events.emit('hint', 'The mushrooms rustle, as if waiting for two…');
      }
      // a little fairy dust when someone's nearby: a hint that it's special
      if (ps.some((p) => flat(p, RING_C) < 9) && (R.dustT -= dt) < 0) {
        R.dustT = 0.5; const m = this.ringMush[Math.floor(Math.random() * 9)];
        this.motes.emit(m.pos, 1, { speed: 0.2, up: 0.6, life: 2.0, size: 0.09, spread: 0.1, grav: 0.1, drag: 0.6 });
      }
    } else {
      R.t += dt;
      this.ringMush.forEach((m, i) => {
        const on = Math.max(0, Math.min(1, (R.t - i * 0.22) / 0.25));
        const off = R.t > 8 ? Math.max(0, 1 - (R.t - 8) / 1.5) : 1;
        m.lit = on * off; m.light(m.lit);
        if (on > 0 && !m.rang) { m.rang = true; this.events.emit('sfx', { name: 'ring', k: i, pos: m.pos }); this.motes.emit(m.pos, 6, { speed: 1.2, up: 1.2, life: 0.9, size: 0.14 }); }
      });
      if (R.t > 2.2 && !R.burst) { R.burst = true; this.motes.emit(this.items[2].pos, 40, { speed: 2.5, up: 3.2, life: 2.2, size: 0.22, spread: 0.6, grav: -0.3 }); this.events.emit('sfx', { name: 'fairy', pos: this.items[2].pos }); }
      this.ringLightEntry.str = 1.7 * Math.min(1, R.t / 2) * (R.t > 8 ? Math.max(0, 1 - (R.t - 8) / 1.5) : 1);
      if (R.t > 9.5) { R.state = 'idle'; R.cool = 6; R.burst = false; this.ringLightEntry.str = 0; }
    }

    // garden: walk in among them; once found, every flower watches the nearest of you
    if (!this.items[3].found && ps.some((p) => flat(p, GARDEN_C) < 3.2 && Math.abs(p.y - GARDEN_C.y) < 1.6)) this.take(3);
    for (const f of this.flowers) {
      let yaw = f.base + Math.sin(t * 0.7 + f.ph) * 0.08;
      if (this.items[3].found && ps.length) {
        const near = ps.reduce((b, p) => (flat(p, f.world) < flat(b, f.world) ? p : b), ps[0]);
        if (flat(near, f.world) < 14) yaw = Math.atan2(near.x - f.world.x, near.z - f.world.z);
      }
      let d = yaw - f.head.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d));
      f.head.rotation.y += d * Math.min(1, dt * 2.5);
      if (f.bounce < 1) { f.bounce += dt * 1.6; const b = Math.max(0, f.bounce); f.head.scale.setScalar(1 + Math.sin(Math.min(1, b) * Math.PI) * 0.22); }
      f.group.rotation.z = Math.sin(t * 0.9 + f.ph) * 0.03;
    }
    this.motes.update(dt, camera);
  }

  /** is this traveler being floated by the fairy ring right now? (the wind leaves dancers alone) */
  dancing(act) { const R = this.ring; return R.state === 'dance' && R.t >= 2.2 && R.t <= 6.0 && flat(act.pos, RING_C) < 2.6; }

  /** the fairy ring lifts whoever is dancing in it: up about a metre, a slow twirl, and gently down */
  lift(act, dt) {
    if (!this.dancing(act) || act.carried) return;
    const R = this.ring;
    const k = (R.t - 2.2) / 3.8, f = this.world.floorAt(act.pos.x, act.pos.z) ?? act.pos.y;
    const h = Math.sin(k * Math.PI) ** 0.7 * 1.15;
    act.vel.y = (f + h - act.pos.y) * 4 + GRAV * dt; // integrate() takes gravity off again
    act.grounded = false;
    act.heading += dt * 1.8;
  }
}
