// A small caped traveler built from primitives, with cheap procedural animation.
import { Group, Mesh, SphereGeometry, CylinderGeometry, CapsuleGeometry, LatheGeometry, TorusGeometry, ConeGeometry, PlaneGeometry, Vector2, IcosahedronGeometry } from 'three';
import { PAL } from '../look/palette.js';
import { makeWatercolorMaterial, makeGlowMaterial, makeOutlineMaterial, makeSoftMaterial } from '../look/material.js';
import { displace } from '../world/shapes.js';
import { rng } from '../world/rng.js';

const VARIANTS = {
  red: { cape: PAL.capeRed, hair: PAL.hairLight, fluffy: true },
  blue: { cape: PAL.capeBlue, hair: PAL.hairDark, fluffy: false },
};

export class Traveler {
  constructor(kind = 'red') {
    const v = VARIANTS[kind];
    this.kind = kind;
    const S = 1.4; // overall scale: ~1.4 units tall (readability: bigger models first)
    this.S = S;
    const root = new Group();
    const body = new Group(); // animated (bob/squash)
    root.add(body);
    this.root = root; this.body = body;

    const m = {
      cape: makeWatercolorMaterial({ lit: v.cape, rim: 0.6, side: 2, wash: 0.14, lightRecv: 0.25 }),
      trim: makeWatercolorMaterial({ lit: PAL.trim, rim: 0.5, lightRecv: 0.3 }),
      tunic: makeWatercolorMaterial({ lit: PAL.tunic, rim: 0.5, lightRecv: 0.2 }),
      skin: makeWatercolorMaterial({ lit: PAL.skin, rim: 0.45, wash: 0.04, lightRecv: 0.15 }),
      hair: makeWatercolorMaterial({ lit: v.hair, rim: 0.7, wash: 0.1, lightRecv: 0.2 }),
      boots: makeWatercolorMaterial({ lit: PAL.boots, rim: 0.3, lightRecv: 0.3 }),
      eye: makeWatercolorMaterial({ lit: PAL.eye, rim: 0, lightRecv: 0 }),
      glow: makeGlowMaterial(PAL.glowCore, PAL.glowHalo, 1.3),
    };
    const outline = (col, w) => makeOutlineMaterial(col, w);
    const withOutline = (mesh, col, w = 0.012) => {
      const o = new Mesh(mesh.geometry, outline(col, w));
      mesh.add(o);
      return mesh;
    };

    // legs + boots
    this.legs = [];
    for (const sx of [-1, 1]) {
      const leg = new Group();
      leg.position.set(sx * 0.085, 0.3, 0);
      const shin = new Mesh(new CylinderGeometry(0.045, 0.04, 0.22, 8).translate(0, -0.11, 0), m.boots);
      const boot = new Mesh(new CapsuleGeometry(0.055, 0.05, 4, 8), m.boots);
      boot.rotation.x = Math.PI / 2; boot.position.set(0, -0.25, 0.025);
      leg.add(shin, boot);
      body.add(leg);
      this.legs.push(leg);
    }
    // tunic
    const tunic = new Mesh(new CylinderGeometry(0.13, 0.2, 0.34, 14, 2).translate(0, 0.45, 0), m.tunic);
    body.add(tunic);

    // cape: lathe profile, open at the front
    const prof = [];
    const N = 10;
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      prof.push(new Vector2(0.14 + Math.pow(t, 1.15) * 0.24, 0.76 - t * 0.5));
    }
    const capeGeo = new LatheGeometry(prof, 28, 0.3, Math.PI * 2 - 0.6);
    // wavy hem
    const cp = capeGeo.attributes.position;
    for (let i = 0; i < cp.count; i++) {
      const y = cp.getY(i);
      if (y < 0.35) { const a = Math.atan2(cp.getX(i), cp.getZ(i)); cp.setY(i, y + Math.sin(a * 5) * 0.015); }
    }
    capeGeo.computeVertexNormals();
    this.cape = new Mesh(capeGeo, m.cape);
    this.cape.position.y = 0;
    const capePivot = new Group();
    capePivot.position.y = 0.74;
    this.cape.position.y = -0.74;
    capePivot.add(this.cape);
    body.add(capePivot);
    this.capePivot = capePivot;
    // gold trim band along the hem + back diamond
    const hem = new Mesh(new TorusGeometry(0.38, 0.016, 5, 40, Math.PI * 2 - 0.6), m.trim);
    hem.rotation.set(Math.PI / 2, 0, Math.PI / 2 + 0.3);
    hem.position.y = 0.26 - 0.74;
    this.cape.add(hem);
    const diamond = new Mesh(new ConeGeometry(0.05, 0.12, 4), m.trim);
    diamond.scale.z = 0.25; diamond.position.set(0, 0.47 - 0.74, -0.25); diamond.rotation.x = -0.45;
    capePivot.add(diamond);
    const diamond2 = diamond.clone(); diamond2.rotation.z = Math.PI; diamond2.position.y -= 0.1; diamond2.position.z -= 0.04;
    capePivot.add(diamond2);
    // hood collar + clasp
    const collar = new Mesh(new TorusGeometry(0.12, 0.05, 8, 18), m.cape);
    collar.rotation.x = Math.PI / 2; collar.position.y = 0.73;
    body.add(collar);
    const clasp = new Mesh(new SphereGeometry(0.03, 8, 6), m.trim);
    clasp.position.set(0, 0.71, 0.155);
    body.add(clasp);

    // arms (hands peek out under the cape)
    this.hands = [];
    for (const sx of [-1, 1]) {
      const h = new Mesh(new SphereGeometry(0.045, 8, 6), m.skin);
      h.position.set(sx * 0.27, 0.42, 0.06);
      body.add(h);
      this.hands.push(h);
    }

    // head
    const head = new Group();
    head.position.y = 0.95;
    body.add(head);
    this.head = head;
    const skull = withOutline(new Mesh(new SphereGeometry(0.24, 24, 16), m.skin), PAL.skin[1], 0.008);
    skull.scale.set(1.0, 0.95, 0.95);
    head.add(skull);
    for (const sx of [-1, 1]) {
      const e = new Mesh(new SphereGeometry(0.03, 10, 8), m.eye);
      e.scale.set(0.75, 1.15, 0.5);
      e.position.set(sx * 0.085, -0.02, 0.215);
      head.add(e);
    }
    // hair: fluffy clusters
    const hr = rng(v.fluffy ? 3 : 8);
    const hairGeo = displace(new IcosahedronGeometry(1, 2), 0.15, 2.4, v.fluffy ? 2 : 5);
    const hairGroup = new Group();
    const n = v.fluffy ? 22 : 24;
    for (let i = 0; i < n; i++) {
      // distribute over the top/back hemisphere, leave the face free
      const u = hr(), w = hr();
      const theta = u * Math.PI * 2;
      // from the top downwards; reaches lower at the back so the back of the head is covered
      const back = Math.cos(theta) < 0;
      const phi = Math.acos(Math.max(-1, 1 - w * (back ? 1.7 : 1.2)));
      let x = Math.sin(phi) * Math.sin(theta), y = Math.cos(phi), z = Math.sin(phi) * Math.cos(theta);
      if (z > 0.35 && y < 0.55) { z = 0.35; y = Math.max(y, 0.5); } // keep a fringe, not a mask
      const blob = new Mesh(hairGeo, m.hair);
      const s = (v.fluffy ? 0.1 : 0.095) + hr() * 0.05;
      blob.scale.setScalar(s);
      blob.position.set(x * 0.235, y * 0.235 + 0.02, z * 0.235 - 0.01);
      hairGroup.add(blob);
    }
    // fringe over the forehead
    for (let i = 0; i < 4; i++) {
      const blob = new Mesh(hairGeo, m.hair);
      blob.scale.set(0.085, 0.07, 0.06);
      blob.position.set(-0.13 + i * 0.087, 0.11 + (i % 2) * 0.02, 0.19);
      hairGroup.add(blob);
    }
    // the little sprout on top
    const sprout = new Mesh(new ConeGeometry(0.025, 0.14, 6).translate(0, 0.07, 0), m.hair);
    sprout.position.set(0.02, 0.3, 0.0); sprout.rotation.z = -0.5; sprout.rotation.x = -0.2;
    hairGroup.add(sprout);
    head.add(hairGroup);
    this.hair = hairGroup;

    // lantern in the right hand
    const lantern = new Group();
    lantern.position.set(0.36, 0.4, 0.12);
    const str = new Mesh(new CylinderGeometry(0.008, 0.008, 0.08, 4), m.boots); str.position.y = -0.04;
    const bulb = new Mesh(new SphereGeometry(0.075, 14, 10), m.glow); bulb.position.y = -0.14; bulb.scale.y = 1.15;
    const cap = new Mesh(new CylinderGeometry(0.035, 0.06, 0.04, 10), m.trim); cap.position.y = -0.07;
    const foot = new Mesh(new CylinderGeometry(0.06, 0.04, 0.03, 10), m.trim); foot.position.y = -0.23;
    lantern.add(str, bulb, cap, foot);
    body.add(lantern);
    this.lantern = lantern;
    this.bulb = bulb;

    body.scale.setScalar(S);

    // soft lavender blob shadow
    const sh = new Mesh(new PlaneGeometry(1, 1), makeSoftMaterial(PAL.shadowBlob, 0.45));
    sh.rotation.x = -Math.PI / 2;
    sh.scale.setScalar(1.1);
    sh.renderOrder = 1;
    this.shadow = sh;

    this.squash = 0;
    this.phase = 0;
  }

  /** speed01: 0..1 ground speed, air: in the air, glide: gliding, t: time. */
  animate(dt, t, speed01, air, glide) {
    this.phase += dt * (6 + speed01 * 6) * (air ? 0.3 : 1);
    const ph = this.phase;
    const walk = air ? 0 : speed01;
    const bob = Math.abs(Math.sin(ph)) * 0.05 * walk;
    const breathe = Math.sin(t * 2.2) * 0.015;
    this.squash *= Math.exp(-dt * 10);
    const sq = this.squash;
    this.body.position.y = bob;
    const S = this.S;
    this.body.scale.set(S * (1 + sq * 0.25), S * (1 + breathe - sq * 0.3), S * (1 + sq * 0.25));
    this.legs[0].rotation.x = Math.sin(ph) * 0.6 * walk + (air ? 0.4 : 0);
    this.legs[1].rotation.x = -Math.sin(ph) * 0.6 * walk + (air ? -0.3 : 0);
    // cape flutters back and flares with speed / glide
    const flare = 1 + walk * 0.12 + (glide ? 0.45 : air ? 0.15 : 0) + Math.sin(t * 7 + ph) * 0.02 * (walk + (glide ? 1 : 0));
    this.capePivot.scale.set(flare, 1, flare * (glide ? 1.1 : 1));
    this.capePivot.rotation.x = -(walk * 0.22 + (glide ? 0.5 : air ? 0.2 : 0));
    // arms out when gliding
    const out = glide ? 1 : 0;
    this.hands[0].position.set(-0.27 - out * 0.18, 0.42 + out * 0.18, 0.06);
    this.hands[1].position.set(0.34 + out * 0.12, 0.42 + out * 0.18, 0.1);
    this.lantern.position.set(0.36 + out * 0.12, 0.4 + out * 0.18, 0.12);
    this.lantern.rotation.z = Math.sin(ph) * 0.25 * walk + Math.sin(t * 1.7) * 0.05;
    this.lantern.rotation.x = -walk * 0.3;
    this.head.rotation.z = Math.sin(t * 1.1) * 0.03;
    this.head.position.y = 0.95 + Math.sin(ph * 2) * 0.01 * walk;
  }

  land(strength) { this.squash = Math.min(1, strength); }
}
