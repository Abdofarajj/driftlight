// A small caped traveler built from primitives, with cheap procedural animation.
// Two characters: 'him' (blue cape, short dark curls) and 'her' (red cape, long light hair, flower clip).
import { Group, Mesh, SphereGeometry, CylinderGeometry, CapsuleGeometry, LatheGeometry, TorusGeometry, ConeGeometry, PlaneGeometry, Vector2, Vector3, IcosahedronGeometry, Color } from 'three';
import { PAL } from '../look/palette.js';
import { makeWatercolorMaterial, makeGlowMaterial, makeOutlineMaterial, makeSoftMaterial } from '../look/material.js';
import { displace } from '../world/shapes.js';
import { rng } from '../world/rng.js';

const VARIANTS = {
  him: { cape: PAL.capeBlue, hair: PAL.hairDark, scale: 1.45, capeTop: 0.16, capeFlare: 0.24, capeLen: 0.5, tunicFlare: 0.2 },
  her: { cape: PAL.capeRed, hair: PAL.hairLight, scale: 1.36, capeTop: 0.13, capeFlare: 0.22, capeLen: 0.52, tunicFlare: 0.25 },
};

export class Traveler {
  constructor(kind = 'him') {
    const v = VARIANTS[kind];
    this.kind = kind;
    const S = v.scale; // readability: bigger models first
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
      blush: makeSoftMaterial(new Color('#f48a8a'), 0.55),
      petal: makeWatercolorMaterial({ lit: [PAL.flowers[0], PAL.canopy[1]], rim: 0.4 }),
      glow: makeGlowMaterial(PAL.glowCore, PAL.glowHalo, 1.3),
    };
    const withOutline = (mesh, col, w = 0.012) => { mesh.add(new Mesh(mesh.geometry, makeOutlineMaterial(col, w))); return mesh; };

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
    // tunic (hers flares a little like a dress)
    body.add(new Mesh(new CylinderGeometry(0.13, v.tunicFlare, 0.34, 14, 2).translate(0, 0.45, 0), m.tunic));

    // cape: lathe profile, open at the front
    const prof = [];
    for (let i = 0; i <= 10; i++) {
      const t = i / 10;
      prof.push(new Vector2(v.capeTop + Math.pow(t, 1.15) * v.capeFlare, 0.76 - t * v.capeLen));
    }
    const capeGeo = new LatheGeometry(prof, 28, 0.3, Math.PI * 2 - 0.6);
    const cp = capeGeo.attributes.position;
    for (let i = 0; i < cp.count; i++) { // wavy hem
      const y = cp.getY(i);
      if (y < 0.35) { const a = Math.atan2(cp.getX(i), cp.getZ(i)); cp.setY(i, y + Math.sin(a * 5) * 0.015); }
    }
    capeGeo.computeVertexNormals();
    const capePivot = new Group();
    capePivot.position.y = 0.74;
    const cape = new Mesh(capeGeo, m.cape);
    cape.position.y = -0.74;
    capePivot.add(cape);
    body.add(capePivot);
    this.capePivot = capePivot;
    const hemR = v.capeTop + v.capeFlare;
    const hem = new Mesh(new TorusGeometry(hemR, 0.016, 5, 40, Math.PI * 2 - 0.6), m.trim);
    hem.rotation.set(Math.PI / 2, 0, Math.PI / 2 + 0.3);
    hem.position.y = 0.76 - v.capeLen - 0.74;
    cape.add(hem);
    const diamond = new Mesh(new ConeGeometry(0.05, 0.12, 4), m.trim);
    diamond.scale.z = 0.25; diamond.position.set(0, 0.47 - 0.74, -0.25); diamond.rotation.x = -0.45;
    capePivot.add(diamond);
    const diamond2 = diamond.clone(); diamond2.rotation.z = Math.PI; diamond2.position.y -= 0.1; diamond2.position.z -= 0.04;
    capePivot.add(diamond2);
    const collar = new Mesh(new TorusGeometry(0.12, 0.05, 8, 18), m.cape);
    collar.rotation.x = Math.PI / 2; collar.position.y = 0.73;
    body.add(collar);
    const clasp = new Mesh(new SphereGeometry(0.03, 8, 6), m.trim);
    clasp.position.set(0, 0.71, 0.155);
    body.add(clasp);

    // arms: shoulder pivots so a hand can reach out to hold the other traveler's hand
    this.arms = [];
    this.hands = [];
    for (const sx of [-1, 1]) {
      const arm = new Group();
      arm.position.set(sx * 0.15, 0.66, 0.02);
      const sleeve = new Mesh(new CapsuleGeometry(0.04, 0.2, 4, 8).translate(0, -0.12, 0), m.cape);
      const hand = new Mesh(new SphereGeometry(0.045, 8, 6), m.skin);
      hand.position.y = -0.27;
      arm.add(sleeve, hand);
      arm.rotation.z = sx * 0.35;
      body.add(arm);
      this.arms.push(arm);
      this.hands.push(hand);
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
      if (kind === 'her') {
        const lash = new Mesh(new ConeGeometry(0.008, 0.035, 4), m.eye);
        lash.position.set(sx * 0.115, 0.005, 0.205); lash.rotation.z = -sx * 1.1;
        head.add(lash);
      }
      const blush = new Mesh(new PlaneGeometry(0.075, 0.045), m.blush);
      blush.position.set(sx * 0.135, -0.075, 0.2); blush.rotation.y = sx * 0.55;
      head.add(blush);
    }

    // hair
    const hairGroup = new Group();
    const hr = rng(kind === 'her' ? 3 : 8);
    const hairGeo = displace(new IcosahedronGeometry(1, 2), 0.15, 2.4, kind === 'her' ? 2 : 5);
    const blob = (x, y, z, sx, sy = sx, sz = sx) => {
      const b = new Mesh(hairGeo, m.hair);
      b.scale.set(sx, sy, sz); b.position.set(x, y, z);
      hairGroup.add(b);
      return b;
    };
    const n = kind === 'her' ? 20 : 24;
    for (let i = 0; i < n; i++) {
      const theta = hr() * Math.PI * 2, w = hr();
      const back = Math.cos(theta) < 0;
      const phi = Math.acos(Math.max(-1, 1 - w * (back ? 1.75 : 1.2)));
      let x = Math.sin(phi) * Math.sin(theta), y = Math.cos(phi), z = Math.sin(phi) * Math.cos(theta);
      if (z > 0.35 && y < 0.55) { z = 0.35; y = Math.max(y, 0.5); } // fringe, not a mask
      blob(x * 0.235, y * 0.235 + 0.02, z * 0.235 - 0.01, 0.095 + hr() * 0.05);
    }
    for (let i = 0; i < 4; i++) blob(-0.13 + i * 0.087, 0.11 + (i % 2) * 0.02, 0.19, 0.085, 0.07, 0.06);
    if (kind === 'her') {
      // long hair falling down the back to the shoulders, and two locks framing the face
      // smooth (not curly) long hair down the back, ending in a soft wave at the shoulders
      const longGeo = new SphereGeometry(1, 20, 14);
      const long = (x, y, z, sx, sy, sz) => { const b = new Mesh(longGeo, m.hair); b.scale.set(sx, sy, sz); b.position.set(x, y, z); hairGroup.add(b); };
      long(0, -0.1, -0.12, 0.22, 0.3, 0.13);
      long(0, -0.33, -0.15, 0.17, 0.1, 0.09);
      for (const sx of [-1, 1]) long(sx * 0.2, -0.1, 0.04, 0.055, 0.17, 0.06); // locks framing the face
      // flower clip above the left ear
      const clip = new Group();
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        const p = new Mesh(new SphereGeometry(0.03, 8, 6), m.petal);
        p.position.set(Math.cos(a) * 0.035, Math.sin(a) * 0.035, 0);
        p.scale.z = 0.5;
        clip.add(p);
      }
      const ctr = new Mesh(new SphereGeometry(0.02, 8, 6), m.trim);
      clip.add(ctr);
      clip.position.set(-0.2, 0.12, 0.1); clip.rotation.y = -0.9;
      hairGroup.add(clip);
    } else {
      const sprout = new Mesh(new ConeGeometry(0.025, 0.14, 6).translate(0, 0.07, 0), m.hair);
      sprout.position.set(0.02, 0.3, 0.0); sprout.rotation.z = -0.5; sprout.rotation.x = -0.2;
      hairGroup.add(sprout);
    }
    head.add(hairGroup);

    // lantern, held in the outer hand (switches sides when holding hands)
    const lantern = new Group();
    const str = new Mesh(new CylinderGeometry(0.008, 0.008, 0.08, 4), m.boots); str.position.y = -0.04;
    const bulb = new Mesh(new SphereGeometry(0.075, 14, 10), m.glow); bulb.position.y = -0.14; bulb.scale.y = 1.15;
    const cap = new Mesh(new CylinderGeometry(0.035, 0.06, 0.04, 10), m.trim); cap.position.y = -0.07;
    const foot = new Mesh(new CylinderGeometry(0.06, 0.04, 0.03, 10), m.trim); foot.position.y = -0.23;
    lantern.add(str, bulb, cap, foot);
    body.add(lantern);
    this.lantern = lantern;
    this.bulb = bulb;
    this.glowMat = m.glow;

    body.scale.setScalar(S);

    const sh = new Mesh(new PlaneGeometry(1, 1), makeSoftMaterial(PAL.shadowBlob, 0.45));
    sh.rotation.x = -Math.PI / 2;
    sh.scale.setScalar(1.1);
    sh.renderOrder = 1;
    this.shadow = sh;

    this.squash = 0;
    this.phase = 0;
    this.holdSide = 0;   // -1: holding with left hand, +1: right hand, 0: not holding
    this.holdAmt = 0;    // eased 0..1
    this.lanternSide = 1;
  }

  /**
   * speed01: 0..1 walk, up to ~1.6 when running. air: in the air. glide: gliding. t: time.
   */
  animate(dt, t, speed01, air, glide) {
    const run = Math.min(1, Math.max(0, speed01 - 1) / 0.7); // 0 walking .. 1 full run
    this.phase += dt * (6 + Math.min(speed01, 1) * 6 + run * 5) * (air ? 0.3 : 1);
    const ph = this.phase;
    const walk = air ? 0 : Math.min(1, speed01);
    const bob = Math.abs(Math.sin(ph)) * (0.05 + run * 0.04) * walk;
    const breathe = Math.sin(t * 2.2) * 0.015;
    this.squash *= Math.exp(-dt * 10);
    const sq = this.squash;
    const S = this.S;
    this.body.position.y = bob;
    this.body.scale.set(S * (1 + sq * 0.25), S * (1 + breathe - sq * 0.3), S * (1 + sq * 0.25));
    this.body.rotation.x = run * 0.12 * walk + (glide ? 0.25 : 0); // lean into a run / glide
    const swing = 0.6 + run * 0.35;
    this.legs[0].rotation.x = Math.sin(ph) * swing * walk + (air ? 0.4 : 0);
    this.legs[1].rotation.x = -Math.sin(ph) * swing * walk + (air ? -0.3 : 0);

    // cape trails BEHIND the direction of travel (character faces +z, so positive x-rotation sends the hem back)
    const flare = 1 + walk * (0.1 + run * 0.12) + (glide ? 0.5 : air ? 0.15 : 0) + Math.sin(t * 8 + ph) * 0.025 * (walk + (glide ? 1 : 0));
    this.capePivot.scale.set(flare, 1, flare * (glide ? 1.15 : 1));
    this.capePivot.rotation.x = walk * (0.18 + run * 0.3) + (glide ? 0.75 : air ? 0.2 : 0) + Math.sin(t * 9 + ph) * 0.04 * (glide ? 1 : walk);

    // arms: swing when walking, spread when gliding, reach out when holding hands
    this.holdAmt += ((this.holdSide !== 0 ? 1 : 0) - this.holdAmt) * Math.min(1, dt * 10);
    const targetLs = this.holdSide !== 0 ? -this.holdSide : this.lanternSide;
    this.lanternSide = targetLs;
    for (let i = 0; i < 2; i++) {
      const sx = i === 0 ? -1 : 1;
      const arm = this.arms[i];
      const holding = this.holdSide === sx ? this.holdAmt : 0;
      let rz = sx * 0.35, rx = -Math.sin(ph) * sx * 0.5 * walk;
      if (glide) { rz = sx * 1.35; rx = 0; }
      rz = rz + (sx * 1.15 - rz) * holding;
      rx = rx * (1 - holding) - 0.25 * holding;
      arm.rotation.set(rx, 0, rz);
    }
    // lantern hangs from the outer hand
    const li = this.lanternSide < 0 ? 0 : 1;
    this.hands[li].getWorldPosition(_v);
    this.body.worldToLocal(_v);
    this.lantern.position.copy(_v).add(_off.set(0, -0.02, 0.02));
    this.lantern.rotation.z = Math.sin(ph) * 0.25 * walk + Math.sin(t * 1.7) * 0.05;
    this.lantern.rotation.x = -walk * 0.3;
    this.head.rotation.z = Math.sin(t * 1.1) * 0.03;
    this.head.position.y = 0.95 + Math.sin(ph * 2) * 0.01 * walk;
  }

  /** World position of the hand on the given side (-1 left, +1 right). */
  handWorld(side, out) { return this.hands[side < 0 ? 0 : 1].getWorldPosition(out); }

  land(strength) { this.squash = Math.min(1, strength); }
}
const _v = new Vector3();
const _off = new Vector3();
