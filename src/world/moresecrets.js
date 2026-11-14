// More secrets (2026-11-14, Abdo: "more to explore on every island"): two more on each island, appended to
// the secrets list in secrets.js (so older secrets keep their places in the online found-mask).
//   heartstone - forest: a standing stone with a heart painted on it, found when you both stand at it
//   swing      - forest: a swing for two on the south rim looking out over the clouds; sit on it together
//   boats      - lake: two paper boats, one red, one blue, drifting round each other off the north shore
//   cairn      - lake: a tall little tower of balanced stones on the east shore
//   picnic     - desert: two trails of footprints lead behind a dune to a picnic blanket for two
//   castles    - desert: two sandcastles side by side, a blue flag and a red one (the red one is taller)
//   owl        - Hollow: two cold glowing eyes in a dead tree… up close, a sleepy little owl (spooky, never scary)
//   letterbox  - Hollow: a crooked letterbox by the path in, with a note for the two of you
//   snowmen    - peak: two snowmen, a blue scarf and a red one, leaning together
//   angels     - peak: two snow angels side by side, holding hands
//   bottle     - Cloud Kingdom: a message in a bottle, stuck in a little cloud on the rim
//   telescope  - Cloud Kingdom: a brass telescope on the west rim; look through it together
import { Group, Mesh, Vector3, BoxGeometry, CylinderGeometry, IcosahedronGeometry, SphereGeometry, ConeGeometry, Shape, ShapeGeometry, CircleGeometry, PlaneGeometry, TorusGeometry } from 'three';
import { makeWatercolorMaterial, makeGlowMaterial } from '../look/material.js';
import { PAL } from '../look/palette.js';
import { displace } from './shapes.js';
import { rng } from './rng.js';
import { settle } from './keepsakes.js';

const flat = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const wc = (lit, o = {}) => makeWatercolorMaterial({ lit, rim: 0.35, ...o });

function heartShape(s) {
  const h = new Shape();
  h.moveTo(0, -0.5 * s);
  h.bezierCurveTo(-0.15 * s, -0.3 * s, -0.55 * s, -0.1 * s, -0.5 * s, 0.18 * s);
  h.bezierCurveTo(-0.45 * s, 0.45 * s, -0.08 * s, 0.48 * s, 0, 0.22 * s);
  h.bezierCurveTo(0.08 * s, 0.48 * s, 0.45 * s, 0.45 * s, 0.5 * s, 0.18 * s);
  h.bezierCurveTo(0.55 * s, -0.1 * s, 0.15 * s, -0.3 * s, 0, -0.5 * s);
  return h;
}

export class MoreSecrets {
  /** secrets: the Secrets object (we call its take); spots: world positions (Vector3) for each */
  constructor(world, scene, secrets) {
    this.world = world; this.secrets = secrets;
    this.group = new Group();  // still parts: baked with the forest
    this.moving = [];          // parts that move: never baked
    const W = world;
    const L = world.lake, D = world.desert;
    this.spots = {
      heartstone: settle(W, -18.5, 6.5, 1.4),
      swing: settle(W, 11, 17.5, 1.6),
      boats: new Vector3(L.lakeCenter.x - 1, L.waterY + 0.1, L.lakeCenter.z - 6.6),
      cairn: settle(W, -12.5, -92.5, 1.2),
      picnic: settle(W, 3, -137, 2.0),
      castles: settle(W, 13, -149, 1.6),
      owl: settle(W, 93, -164, 1.4),
      letterbox: settle(W, 69.5, -149.5, 1.0),
      snowmen: settle(W, 113.5, -83, 1.6, world.peak.levels[0]),
      angels: settle(W, 100, -67.5, 1.8, world.peak.levels[0]),
      bottle: settle(W, 54, -74, 1.0, world.tower.levelY),
      telescope: settle(W, 33, -90, 1.4, world.tower.levelY),
    };
    this.ids = Object.keys(this.spots);
    this.idx = Object.fromEntries(this.ids.map((id) => [id, secrets.items.findIndex((it) => it.id === id)]));
    for (const id of this.ids) secrets.items[this.idx[id]].pos.copy(this.spots[id]).setY(this.spots[id].y + 0.8);
    this.buildHeartstone(); this.buildSwing(scene); this.buildBoats(scene); this.buildCairn(); this.buildPicnic(); this.buildCastles();
    this.buildOwl(scene); this.buildLetterbox(); this.buildSnowmen(); this.buildAngels(); this.buildBottle(); this.buildTelescope();
    scene.add(this.group);
    this.hintT = {};
    this.swingK = 0;
    this.update(0, 0, []); // place the moving parts
  }

  /** the island centre a spot should face */
  faceIn(p, c = new Vector3()) { return Math.atan2(c.x - p.x, c.z - p.z); }

  buildHeartstone() {
    const p = this.spots.heartstone, g = new Group();
    g.position.copy(p); g.rotation.y = this.faceIn(p);
    const stone = new Mesh(displace(new IcosahedronGeometry(1, 3), 0.07, 1.6, 31), wc(PAL.stone, { wash: 0.2 }));
    stone.scale.set(0.8, 1.05, 0.38); stone.position.y = 0.9; stone.rotation.z = 0.05;
    const mossCap = new Mesh(displace(new SphereGeometry(0.55, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), 0.05, 3, 32), wc(PAL.moss, { breakup: 0.4 }));
    mossCap.scale.set(1.25, 0.4, 0.62); mossCap.position.y = 1.72;
    const heart = new Mesh(new ShapeGeometry(heartShape(0.62), 10), wc(PAL.capeRed, { rim: 0.2, wash: 0.25 }));
    heart.position.set(0, 1.0, 0.47);
    // two little figures inside the heart: one blue, one red
    for (const [x, col] of [[-0.1, PAL.capeBlue], [0.1, PAL.capeRed]]) {
      const f = new Mesh(new CircleGeometry(0.055, 10), wc(PAL.tunic, { rim: 0.1 }));
      f.position.set(x, 1.05, 0.48);
      const body = new Mesh(new ConeGeometry(0.07, 0.16, 3).rotateZ(Math.PI), wc(col, { rim: 0.1 }));
      body.scale.z = 0.05; body.rotation.z = Math.PI; body.position.set(x, 0.94, 0.48);
      g.add(f, body);
    }
    g.add(stone, mossCap, heart);
    this.group.add(g);
    this.world.colliders.push({ x: p.x, z: p.z, r: 0.75 });
  }

  buildSwing(scene) {
    const p = this.spots.swing, g = new Group();
    g.position.copy(p); g.rotation.y = this.faceIn(p) + Math.PI; // faces out, over the clouds
    const wood = wc(PAL.wood), rope = wc(PAL.trunk, { rim: 0.2 });
    for (const s of [-1, 1]) {
      for (const lean of [-1, 1]) {
        const post = new Mesh(new CylinderGeometry(0.07, 0.09, 2.7, 6), wood);
        post.position.set(s * 1.25, 1.3, lean * 0.35); post.rotation.x = lean * 0.26; g.add(post);
      }
      this.world.colliders.push({ ...(() => { const c = Math.cos(g.rotation.y), sn = Math.sin(g.rotation.y); return { x: p.x + s * 1.25 * c, z: p.z - s * 1.25 * sn }; })(), r: 0.25 });
    }
    const bar = new Mesh(new CylinderGeometry(0.08, 0.08, 2.9, 8).rotateZ(Math.PI / 2), wood);
    bar.position.y = 2.62; g.add(bar);
    // flowers wound round the bar
    const fr = rng(41);
    for (let i = 0; i < 9; i++) {
      const fl = new Mesh(new SphereGeometry(0.07, 6, 4), wc([PAL.lotus, PAL.petal, PAL.fairyCap][i % 3], { rim: 0.2 }));
      fl.position.set(-1.3 + i * 0.32, 2.66 + fr() * 0.05, (fr() - 0.5) * 0.12); g.add(fl);
    }
    this.group.add(g);
    // the seat hangs from a pivot so it can sway (dynamic: never baked)
    const pivot = new Group(); pivot.position.copy(p).setY(p.y + 2.6); pivot.rotation.y = g.rotation.y; pivot.userData.dynamic = true;
    const seat = new Mesh(displace(new BoxGeometry(1.7, 0.1, 0.5, 4, 1, 2), 0.01, 3, 5), wood);
    seat.position.y = -2.05; pivot.add(seat);
    for (const s of [-0.75, 0.75]) { const r = new Mesh(new CylinderGeometry(0.02, 0.02, 2.05, 4), rope); r.position.set(s, -1.02, 0); pivot.add(r); }
    scene.add(pivot);
    this.swing = pivot;
  }

  buildBoats(scene) {
    const p = this.spots.boats;
    const paper = (col) => {
      const b = new Group();
      const hull = new Mesh(new CylinderGeometry(0.3, 0.12, 0.16, 4, 1).rotateY(Math.PI / 4), wc(col, { rim: 0.3 }));
      hull.scale.set(1.6, 1, 0.6); hull.position.y = 0.08;
      const sail = new Mesh(new ConeGeometry(0.2, 0.36, 4).rotateY(Math.PI / 4), wc(col, { rim: 0.3 }));
      sail.scale.z = 0.12; sail.position.y = 0.32;
      b.add(hull, sail); b.scale.setScalar(1.4); b.userData.dynamic = true; scene.add(b);
      return b;
    };
    this.boats = [paper(PAL.capeBlue), paper(PAL.capeRed)];
  }

  buildCairn() {
    const p = this.spots.cairn, g = new Group(); g.position.copy(p);
    const r = rng(52); let y = 0;
    const cols = [PAL.stone, PAL.crystalStone, PAL.cliff, PAL.stone];
    for (let i = 0; i < 9; i++) {
      const s = 0.42 - i * 0.032, h = s * (0.45 + r() * 0.15);
      const m = new Mesh(displace(new SphereGeometry(s, 10, 6), 0.02, 3, 60 + i), wc(cols[i % 4], { wash: 0.2 }));
      m.scale.y = h / s; m.position.set((r() - 0.5) * 0.06, y + h * 0.9, (r() - 0.5) * 0.06); m.rotation.y = r() * 3; g.add(m);
      y += h * 1.75;
    }
    const flower = new Mesh(new SphereGeometry(0.08, 8, 6), wc(PAL.lotus, { rim: 0.2 }));
    flower.position.y = y + 0.05; g.add(flower);
    this.group.add(g);
    this.world.colliders.push({ x: p.x, z: p.z, r: 0.45 });
  }

  buildPicnic() {
    const p = this.spots.picnic, g = new Group(); g.position.copy(p); g.rotation.y = this.faceIn(p, this.world.desert.center ?? new Vector3(25, 0, -135));
    // the blanket: a checked cloth, lying on the sand
    const cloth = new Group(); g.add(cloth);
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
      const sq = new Mesh(new PlaneGeometry(0.5, 0.5).rotateX(-Math.PI / 2), wc((i + j) % 2 ? PAL.tunic : PAL.bannerRed, { rim: 0.1, wash: 0.2 }));
      sq.position.set(-0.75 + i * 0.5, 0.06 + this.groundAt(g, -0.75 + i * 0.5, -0.75 + j * 0.5), -0.75 + j * 0.5); cloth.add(sq);
    }
    const basket = new Mesh(new CylinderGeometry(0.28, 0.22, 0.3, 10), wc(PAL.wood, { breakup: 0.3 }));
    basket.position.set(0.45, 0.22, -0.35); basket.scale.z = 0.7;
    const handle = new Mesh(new TorusGeometry(0.2, 0.025, 5, 12, Math.PI), wc(PAL.wood)); handle.position.set(0.45, 0.36, -0.35);
    g.add(basket, handle);
    for (const [x, col] of [[-0.35, PAL.capeBlue], [-0.05, PAL.capeRed]]) {
      const cup = new Mesh(new CylinderGeometry(0.07, 0.06, 0.14, 10), wc(col, { rim: 0.3 })); cup.position.set(x, 0.14, 0.3); g.add(cup);
    }
    // two trails of footprints leading in from the dunes, side by side
    const foot = wc(PAL.sand, { rim: 0, wash: 0.3, lit2: PAL.sandstone }), fg = new CircleGeometry(0.09, 8).rotateX(-Math.PI / 2);
    for (let k = 0; k < 14; k++) {
      for (const [side, off] of [[-0.35, 0], [0.35, 0.3]]) {
        const lz = 1.4 + k * 0.62 + off, lx = side + ((k % 2) - 0.5) * 0.18 + Math.sin(k * 0.4) * 0.5;
        const f = new Mesh(fg, foot); f.scale.set(0.8, 1, 1.4);
        f.position.set(lx, this.groundAt(g, lx, lz) + 0.03, lz); g.add(f);
      }
    }
    this.group.add(g);
  }

  buildCastles() {
    const p = this.spots.castles, g = new Group(); g.position.copy(p);
    const sand = wc(PAL.sand, { wash: 0.22 });
    const castle = (x, s, col) => {
      const c = new Group(); c.position.set(x, 0, 0);
      const base = new Mesh(displace(new CylinderGeometry(0.42 * s, 0.5 * s, 0.4 * s, 10), 0.02, 4, 3), sand); base.position.y = 0.2 * s;
      const keep = new Mesh(displace(new CylinderGeometry(0.22 * s, 0.26 * s, 0.5 * s, 8), 0.015, 4, 4), sand); keep.position.y = 0.62 * s;
      c.add(base, keep);
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2;
        const t = new Mesh(new CylinderGeometry(0.1 * s, 0.12 * s, 0.28 * s, 6), sand); t.position.set(Math.cos(a) * 0.36 * s, 0.52 * s, Math.sin(a) * 0.36 * s); c.add(t);
      }
      const pole = new Mesh(new CylinderGeometry(0.012, 0.012, 0.4 * s, 4), wc(PAL.wood)); pole.position.y = 1.05 * s;
      const flag = new Mesh(new PlaneGeometry(0.2 * s, 0.12 * s), wc(col, { rim: 0.2, side: 2 })); flag.position.set(0.1 * s, 1.18 * s, 0);
      c.add(pole, flag);
      g.add(c);
    };
    castle(-0.6, 1.0, PAL.capeBlue);
    castle(0.6, 1.12, PAL.capeRed); // hers is taller
    this.group.add(g);
    this.world.colliders.push({ x: p.x, z: p.z, r: 1.15, top: p.y + 0.5 });
  }

  buildOwl(scene) {
    const p = this.spots.owl, g = new Group(); g.position.copy(p); g.rotation.y = this.faceIn(p, this.world.hollow.center);
    const bark = wc(PAL.bark, { wash: 0.2 });
    const trunk = new Mesh(displace(new CylinderGeometry(0.28, 0.45, 2.6, 8, 4), 0.05, 2, 71), bark); trunk.position.y = 1.3; trunk.rotation.z = 0.06;
    const branch = new Mesh(new CylinderGeometry(0.07, 0.12, 1.5, 6), bark); branch.position.set(0.55, 2.2, 0); branch.rotation.z = -1.05;
    const twig = new Mesh(new CylinderGeometry(0.03, 0.06, 0.8, 5), bark); twig.position.set(-0.4, 2.55, 0); twig.rotation.z = 0.8;
    const hole = new Mesh(new CircleGeometry(0.2, 12), wc(PAL.shy, { rim: 0 })); hole.position.set(0, 1.9, 0.31); hole.scale.y = 1.3;
    g.add(trunk, branch, twig, hole);
    this.group.add(g);
    this.world.colliders.push({ x: p.x, z: p.z, r: 0.5 });
    // the owl itself, peeking out of the hole (moves: never baked)
    const owl = new Group(); owl.userData.dynamic = true;
    owl.position.copy(p); owl.rotation.y = g.rotation.y;
    const head = new Group(); head.position.set(0, 1.92, 0.2); owl.add(head);
    const body = new Mesh(new SphereGeometry(0.2, 12, 8), wc(PAL.roof, { rim: 0.5 })); body.scale.set(1, 0.95, 0.9); head.add(body);
    const face = new Mesh(new CircleGeometry(0.15, 14), wc(PAL.tunic, { rim: 0.1 })); face.position.z = 0.17; face.scale.x = 1.25; head.add(face);
    for (const sx of [-1, 1]) { const ear = new Mesh(new ConeGeometry(0.05, 0.12, 4), wc(PAL.roof)); ear.position.set(sx * 0.12, 0.2, 0); ear.rotation.z = -sx * 0.4; head.add(ear); }
    const beak = new Mesh(new ConeGeometry(0.025, 0.07, 4).rotateX(Math.PI / 2 + 0.4), wc(PAL.brass)); beak.position.set(0, -0.03, 0.2); head.add(beak);
    this.owlEyes = makeGlowMaterial(PAL.wispCore, PAL.wispHalo, 1.3);
    const lids = [];
    for (const sx of [-1, 1]) {
      const e = new Mesh(new SphereGeometry(0.045, 10, 8), this.owlEyes); e.position.set(sx * 0.07, 0.03, 0.18); head.add(e);
      lids.push(e);
    }
    scene.add(owl);
    this.owl = { group: owl, head, eyes: lids, k: 0, blink: 0 };
  }

  buildLetterbox() {
    const p = this.spots.letterbox, g = new Group(); g.position.copy(p); g.rotation.y = this.faceIn(p, this.world.hollow.center) + 0.5;
    const wood = wc(PAL.bark, { wash: 0.2 });
    const post = new Mesh(new CylinderGeometry(0.06, 0.08, 1.1, 6), wood); post.position.y = 0.55; post.rotation.z = 0.12;
    const box = new Mesh(displace(new BoxGeometry(0.42, 0.34, 0.6, 2, 2, 2), 0.01, 4, 9), wc(PAL.roof, { rim: 0.4 })); box.position.set(0.07, 1.22, 0); box.rotation.z = 0.14;
    const roof = new Mesh(new CylinderGeometry(0.21, 0.21, 0.6, 10, 1, false, 0, Math.PI).rotateX(Math.PI / 2).rotateZ(Math.PI / 2), wc(PAL.roof, { rim: 0.4 })); roof.position.set(0.09, 1.39, 0); roof.rotation.z = 0.14 - Math.PI / 2;
    const flag = new Mesh(new BoxGeometry(0.03, 0.2, 0.08), wc(PAL.capeRed)); flag.position.set(0.3, 1.36, 0.15);
    const letter = new Mesh(new PlaneGeometry(0.26, 0.17), wc(PAL.tunic, { rim: 0.1, side: 2 })); letter.position.set(0.05, 1.28, 0.31); letter.rotation.x = -0.4;
    const seal = new Mesh(new CircleGeometry(0.03, 8), wc(PAL.capeRed)); seal.position.set(0.05, 1.27, 0.32); seal.rotation.x = -0.4;
    g.add(post, box, roof, flag, letter, seal);
    this.group.add(g);
    this.world.colliders.push({ x: p.x, z: p.z, r: 0.3 });
  }

  buildSnowmen() {
    const p = this.spots.snowmen, g = new Group(); g.position.copy(p); g.rotation.y = this.faceIn(p, this.world.peak.mc);
    const snow = wc(PAL.snow, { wash: 0.12 });
    const man = (x, lean, scarf, h) => {
      const m = new Group(); m.position.x = x; m.rotation.z = lean;
      const b1 = new Mesh(displace(new SphereGeometry(0.5 * h, 12, 8), 0.02, 3, 1), snow); b1.position.y = 0.42 * h;
      const b2 = new Mesh(displace(new SphereGeometry(0.36 * h, 12, 8), 0.02, 3, 2), snow); b2.position.y = 1.0 * h;
      const b3 = new Mesh(displace(new SphereGeometry(0.26 * h, 12, 8), 0.015, 3, 3), snow); b3.position.y = 1.44 * h;
      const sc = new Mesh(new TorusGeometry(0.25 * h, 0.07 * h, 6, 14), wc(scarf, { rim: 0.3 })); sc.rotation.x = Math.PI / 2; sc.position.y = 1.24 * h;
      const tail = new Mesh(new BoxGeometry(0.1 * h, 0.35 * h, 0.04 * h), wc(scarf, { rim: 0.3 })); tail.position.set(0.12 * h, 1.08 * h, 0.24 * h); tail.rotation.z = 0.2;
      const nose = new Mesh(new ConeGeometry(0.04 * h, 0.22 * h, 6).rotateX(Math.PI / 2), wc(PAL.petal)); nose.position.set(0, 1.44 * h, 0.3 * h);
      m.add(b1, b2, b3, sc, tail, nose);
      for (const sx of [-1, 1]) { const e = new Mesh(new SphereGeometry(0.03 * h, 6, 4), wc(PAL.eye, { rim: 0 })); e.position.set(sx * 0.09 * h, 1.52 * h, 0.23 * h); m.add(e); }
      // a stick arm reaching for the other one's
      const arm = new Mesh(new CylinderGeometry(0.02, 0.025, 0.7 * h, 4), wc(PAL.logs)); arm.position.set(-Math.sign(x) * 0.42 * h, 1.05 * h, 0); arm.rotation.z = Math.sign(x) * 1.1; m.add(arm);
      g.add(m);
    };
    man(-0.6, 0.1, PAL.capeBlue, 1.0);
    man(0.6, -0.1, PAL.capeRed, 0.95);
    this.group.add(g);
    this.world.colliders.push({ x: p.x, z: p.z, r: 1.1 });
  }

  buildAngels() {
    const p = this.spots.angels, g = new Group(); g.position.copy(p); g.rotation.y = this.faceIn(p, this.world.peak.mc);
    const dent = wc(PAL.ice, { rim: 0, wash: 0.15 });
    for (const x of [-0.55, 0.55]) {
      const wings = new Mesh(new CircleGeometry(0.62, 18).rotateX(-Math.PI / 2), dent); wings.scale.set(1.0, 1, 0.6); wings.position.set(x, 0.03, -0.25);
      const skirt = new Mesh(new CircleGeometry(0.5, 3).rotateX(-Math.PI / 2).rotateY(Math.PI / 2), dent); skirt.scale.set(0.9, 1, 1.1); skirt.position.set(x, 0.03, 0.35);
      const head = new Mesh(new CircleGeometry(0.17, 14).rotateX(-Math.PI / 2), dent); head.position.set(x, 0.03, -0.72);
      g.add(wings, skirt, head);
    }
    this.group.add(g);
  }

  buildBottle() {
    const p = this.spots.bottle, g = new Group(); g.position.copy(p);
    const tuft = new Mesh(displace(new SphereGeometry(0.55, 12, 8), 0.06, 2.5, 5), wc(PAL.cloud, { rim: 0.5, wash: 0.05 })); tuft.scale.set(1.2, 0.55, 1); tuft.position.y = 0.15;
    // the bottle lies across the top of the tuft, neck up a little, a rolled note inside
    const bottle = new Group(); bottle.position.set(0, 0.6, 0); bottle.rotation.z = 1.25;
    const glassMat = makeGlowMaterial(PAL.crystalCore, PAL.pool[0], 0.75);
    const glass = new Mesh(new CylinderGeometry(0.15, 0.16, 0.5, 12), glassMat);
    const shoulder = new Mesh(new SphereGeometry(0.15, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), glassMat); shoulder.position.y = 0.25;
    const neck = new Mesh(new CylinderGeometry(0.055, 0.07, 0.18, 10), glassMat); neck.position.y = 0.44;
    const cork = new Mesh(new CylinderGeometry(0.05, 0.055, 0.08, 8), wc(PAL.wood)); cork.position.y = 0.56;
    const note = new Mesh(new CylinderGeometry(0.06, 0.06, 0.34, 8), wc(PAL.tunic, { rim: 0.1 }));
    const ribbon = new Mesh(new TorusGeometry(0.062, 0.012, 4, 12), wc(PAL.capeRed)); ribbon.rotation.x = Math.PI / 2;
    bottle.add(glass, shoulder, neck, cork, note, ribbon);
    g.add(tuft, bottle);
    this.group.add(g);
  }

  buildTelescope() {
    const p = this.spots.telescope, g = new Group(); g.position.copy(p);
    const c = this.world.tower.center; g.rotation.y = this.faceIn(p, c) + Math.PI; // points out, away from the tower
    const brass = wc(PAL.brass, { rim: 0.6, wash: 0.1 }), wood = wc(PAL.wood);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      const leg = new Mesh(new CylinderGeometry(0.03, 0.04, 1.3, 5), wood); leg.position.set(Math.cos(a) * 0.25, 0.6, Math.sin(a) * 0.25); leg.rotation.set(Math.sin(a) * 0.2, 0, -Math.cos(a) * 0.2); g.add(leg);
    }
    const tube = new Mesh(new CylinderGeometry(0.07, 0.11, 1.1, 12).rotateX(Math.PI / 2), brass); tube.position.set(0, 1.32, 0.12); tube.rotation.x = -0.45;
    const lens = new Mesh(new CircleGeometry(0.105, 12), makeGlowMaterial(PAL.crystalCore, PAL.crystalHalo, 0.8)); lens.position.set(0, 1.56, 0.62); lens.rotation.x = -0.45;
    g.add(tube, lens);
    this.group.add(g);
    this.world.colliders.push({ x: p.x, z: p.z, r: 0.4 });
  }

  /** ground height at a group's local x,z, relative to the group */
  groundAt(g, lx, lz) {
    const c = Math.cos(g.rotation.y), s = Math.sin(g.rotation.y);
    const wx = g.position.x + lx * c + lz * s, wz = g.position.z - lx * s + lz * c;
    return (this.world.floorAt(wx, wz) ?? g.position.y) - g.position.y;
  }

  update(dt, t, travelers) {
    const ps = travelers.map((a) => a.pos);
    const S = this.secrets, found = (id) => S.items[this.idx[id]].found, take = (id) => { if (!found(id)) S.take(this.idx[id]); };
    const near = (id, r, dy = 1.8) => ps.map((p) => flat(p, this.spots[id]) < r && Math.abs(p.y - this.spots[id].y) < dy);
    const together = (id, r, hint) => {
      const n = near(id, r);
      if (ps.length > 1 && n.every(Boolean)) take(id);
      else if (n[0] && !found(id) && t - (this.hintT[id] ?? -99) > 12) { this.hintT[id] = t; S.events.emit('hint', hint); }
    };
    together('heartstone', 2.3, 'Two little figures in a painted heart… it feels like it wants both of you here');
    together('swing', 1.6, 'A swing just wide enough for two…');
    if (near('cairn', 2.2).some(Boolean)) take('cairn');
    if (near('picnic', 2.0).some(Boolean)) take('picnic');
    if (near('castles', 2.4).some(Boolean)) take('castles');
    if (near('owl', 3.4, 3).some(Boolean)) take('owl');
    if (near('letterbox', 1.9).some(Boolean)) take('letterbox');
    if (near('snowmen', 2.6).some(Boolean)) take('snowmen');
    if (near('angels', 1.6).some(Boolean)) take('angels');
    if (near('bottle', 1.7).some(Boolean)) take('bottle');
    together('telescope', 2.2, 'Two eyepieces… no, one. But it would be nicer to look together');

    // the owl: cold eyes from afar; close by (or once found) they warm, it blinks and turns to look at you
    const O = this.owl;
    if (O) {
      const dmin = Math.min(99, ...ps.map((p) => flat(p, this.spots.owl)));
      O.k += (((dmin < 5 || found('owl')) && dmin < 12 ? 1 : 0) - O.k) * Math.min(1, dt * 2);
      const u = this.owlEyes.uniforms;
      u.uCore.value.copy(PAL.wispCore).lerp(PAL.glowCore, O.k); u.uHalo.value.copy(PAL.wispHalo).lerp(PAL.glowHalo, O.k);
      const blink = (t % 4.2) < 0.14 ? 0.15 : 1;
      O.eyes.forEach((e) => { e.scale.y = blink; });
      O.head.rotation.z = Math.sin(t * 0.7) * 0.12 * O.k;
      O.head.position.y = 1.86 + O.k * 0.08;
    }
    if (ps.some((p) => flat(p, this.spots.boats) < 6.5 && Math.abs(p.y - this.spots.boats.y) < 3)) take('boats');

    // the swing sways gently while you're both on it (and a little in the wind otherwise)
    const on = near('swing', 1.6).filter(Boolean).length;
    this.swingK += ((on >= 2 ? 1 : on ? 0.5 : 0.15) - this.swingK) * Math.min(1, dt * 1.5);
    this.swing.rotation.x = Math.sin(t * 1.6) * 0.22 * this.swingK;
    this.swing.rotation.order = 'YXZ';
    // the paper boats circle each other slowly, bobbing
    const B = this.spots.boats;
    this.boats.forEach((b, i) => {
      const a = t * 0.25 + i * Math.PI;
      b.position.set(B.x + Math.cos(a) * 0.55, B.y + Math.sin(t * 1.4 + i) * 0.03, B.z + Math.sin(a) * 0.55);
      b.rotation.set(Math.sin(t * 1.1 + i) * 0.08, -a, Math.sin(t * 0.9 + i * 2) * 0.06);
    });
  }
}
