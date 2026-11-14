// A small caped traveler built from primitives, with cheap procedural animation.
// Two characters: 'him' (blue cape, short dark curls) and 'her' (red cape, long light hair, flower clip).
import { Group, Mesh, SphereGeometry, LatheGeometry, Vector2, CylinderGeometry, CapsuleGeometry, TorusGeometry, ConeGeometry, PlaneGeometry, TubeGeometry, CatmullRomCurve3, BufferGeometry, Float32BufferAttribute, Vector3, IcosahedronGeometry, Color, Quaternion, Euler } from 'three';
import { PAL } from '../look/palette.js';
import { makeWatercolorMaterial, makeGlowMaterial, makeOutlineMaterial, makeSoftMaterial } from '../look/material.js';
import { displace } from '../world/shapes.js';
import { rng } from '../world/rng.js';

const VARIANTS = {
  him: { cape: PAL.capeBlue, hair: PAL.hairDark, scale: 1.45, tunicFlare: 0.2 },
  her: { cape: PAL.capeRed, hair: PAL.hairLight, scale: 1.36, tunicFlare: 0.25 },
};

const HAIR_STYLES = ['curls', 'shag', 'bob'];
const HAIR_DEFAULT = 'shag'; // Abdo picked the tousled shag (2026-11-14)
const HAIR_PARAM = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('hair') : null;

/** A tapered lock of hair hanging down from its root (y 0 to -len), flattened front to back, its tip curling out
 *  toward +z by `flick` (a fraction of its length) and lifting a little. */
function lockGeo(len, w, flick) {
  const g = new CylinderGeometry(w, w * 0.28, len, 7, 5); // a soft blunt tip, not a spike
  g.translate(0, -len / 2, 0);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i), t = Math.min(1, Math.max(0, -y / len));
    const bulge = 1 + 0.25 * Math.sin(t * Math.PI); // fuller in the middle, like a soft lock
    p.setXYZ(i, p.getX(i) * bulge, y + flick * len * 0.35 * t * t * t, p.getZ(i) * 0.7 * bulge + flick * len * t * t);
  }
  g.computeVertexNormals();
  return g;
}

const ARM_LEN = 0.27; // shoulder to the middle of the hand (model units, before the traveler's scale)

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
    // upper body: a rounded chest and shoulders under the head, and a belt, so the traveler isn't just a head on a cape
    const chest = new Mesh(new SphereGeometry(1, 16, 12), m.tunic);
    chest.scale.set(0.158, 0.14, 0.125); chest.position.y = 0.63;
    body.add(chest);
    const beltR = 0.13 + (0.1 / 0.34) * (v.tunicFlare - 0.13) + 0.006;
    const belt = new Mesh(new TorusGeometry(beltR, 0.02, 6, 28), m.trim);
    belt.rotation.x = Math.PI / 2; belt.position.y = 0.52;
    body.add(belt);

    const capePivot = new Group();
    capePivot.position.y = 0.74;
    body.add(capePivot);
    this.capePivot = capePivot;
    this.buildPoncho(v, m, capePivot, body); // Abdo picked the character-sheet poncho (2026-11-14)

    // arms: shoulder pivots so a hand can reach out to hold the other traveler's hand
    this.arms = [];
    this.hands = [];
    for (const sx of [-1, 1]) {
      const arm = new Group();
      arm.position.set(sx * 0.16, 0.665, 0.03);
      const sleeve = new Mesh(new CapsuleGeometry(0.042, 0.17, 4, 8).translate(0, -0.11, 0), m.tunic);
      const hand = new Mesh(new SphereGeometry(0.05, 10, 8), m.skin);
      hand.position.y = -ARM_LEN;
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

    // hair (look round 4: three styles to pick from, ?hair=curls|shag|bob)
    const hairGroup = new Group();
    const style = HAIR_STYLES.includes(HAIR_PARAM) ? HAIR_PARAM : HAIR_DEFAULT;
    if (style === 'curls') this.curlyHair(kind, m, hairGroup);
    else if (style === 'shag') this.shagHair(kind, m, hairGroup);
    else this.bobHair(kind, m, hairGroup);
    if (kind === 'her') {
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
      clip.position.set(-0.21, 0.13, 0.1); clip.rotation.y = -0.9;
      if (style !== 'curls') clip.position.set(-0.235, 0.12, 0.08);
      hairGroup.add(clip);
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
    this.holdAt = new Vector3(); // where the clasped hands meet (world), set by Hands each frame while holding
    this.holdAim = false;
    this.lanternSide = 1;
  }

  /**
   * The cape as on the character sheet (docs/refs/traveler-turnaround.png): a poncho over rounded shoulders,
   * tied at the neck with a gold clasp and opening at the front in a V that shows the tunic, gold trim along its
   * edges, a gold diamond on the back and a soft hood bunched at the back of the neck. It ends at the hands, so
   * they (and the lantern) show below it.
   */
  buildPoncho(v, m, pivot, body) {
    const yTop = 0.775, rTop = 0.125, rSh = 0.245, yHem = 0.4, rHem = v === VARIANTS.her ? 0.375 : 0.365;
    const radius = (y) => {
      const sh = Math.sin(Math.min(1, Math.max(0, (yTop - y) / 0.1)) * Math.PI / 2);
      return rTop + (rSh - rTop) * sh + (rHem - rSh) * Math.pow(Math.min(1, Math.max(0, (0.68 - y) / (0.68 - yHem))), 1.3);
    };
    const gap = (y) => 0.3 + 1.3 * Math.pow((yTop - y) / (yTop - yHem), 0.85); // the V at the front, radians (wide at the hem: the hands show)
    const ROWS = 16, COLS = 44, pos = [], idx = [];
    const at = (y, u, out) => { // u 0..1 around from the left front edge, over the back, to the right one
      const g = gap(y), phi = g / 2 + u * (Math.PI * 2 - g), r = radius(y);
      const wave = y < yHem + 0.01 ? Math.sin(phi * 6) * 0.012 : 0;
      return out.set(r * Math.sin(phi), y + wave, r * Math.cos(phi));
    };
    const p = new Vector3();
    for (let i = 0; i <= ROWS; i++) {
      const y = yTop - (yTop - yHem) * (i / ROWS);
      for (let j = 0; j <= COLS; j++) { at(y, j / COLS, p); pos.push(p.x, p.y - 0.74, p.z); }
    }
    for (let i = 0; i < ROWS; i++) for (let j = 0; j < COLS; j++) {
      const a = i * (COLS + 1) + j, b = a + COLS + 1;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
    const geo = new BufferGeometry();
    geo.setAttribute('position', new Float32BufferAttribute(pos, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    pivot.add(new Mesh(geo, m.cape));
    // gold trim: down the left front edge, round the hem behind, up the right front edge
    const pts = [];
    for (let i = 0; i <= 12; i++) pts.push(at(yTop - (yTop - yHem) * (i / 12), 0, new Vector3()));
    for (let j = 1; j < 40; j++) pts.push(at(yHem, j / 40, new Vector3()));
    for (let i = 12; i >= 0; i--) pts.push(at(yTop - (yTop - yHem) * (i / 12), 1, new Vector3()));
    for (const q of pts) q.y -= 0.74;
    pivot.add(new Mesh(new TubeGeometry(new CatmullRomCurve3(pts), 220, 0.013, 5, false), m.trim));
    // a gold diamond on the back (an outline of four bars and a dot), and a band of small diamonds near the hem
    const yd = 0.56, rd = radius(yd) + 0.008;
    const dia = new Group(), corners = [[0, 0.06], [0.042, 0], [0, -0.06], [-0.042, 0]];
    for (let k = 0; k < 4; k++) {
      const [x0, y0] = corners[k], [x1, y1] = corners[(k + 1) % 4];
      const bar = new Mesh(new CapsuleGeometry(0.009, Math.hypot(x1 - x0, y1 - y0), 2, 4), m.trim);
      bar.position.set((x0 + x1) / 2, (y0 + y1) / 2, 0);
      bar.rotation.z = Math.atan2(y1 - y0, x1 - x0) - Math.PI / 2;
      dia.add(bar);
    }
    const dot = new Mesh(new SphereGeometry(0.014, 6, 4), m.trim); dia.add(dot);
    dia.position.set(0, yd - 0.74, -rd); dia.rotation.set(0.45, Math.PI, 0); // lies on the flaring back
    pivot.add(dia);
    for (let k = -3; k <= 3; k++) {
      if (k === 0) continue;
      const phi = Math.PI + k * 0.42, yb = yHem + 0.05, rb = radius(yb) + 0.004;
      const d = new Mesh(new SphereGeometry(0.016, 4, 2), m.trim);
      d.scale.set(1, 1.4, 0.4);
      d.position.set(rb * Math.sin(phi), yb - 0.74, rb * Math.cos(phi)); d.rotation.y = phi;
      pivot.add(d);
    }
    // the hood, bunched softly at the back of the neck, and the clasp at the front
    const hood = new Mesh(new TorusGeometry(0.13, 0.05, 8, 20, Math.PI * 1.25), m.cape);
    hood.rotation.set(Math.PI / 2, 0, Math.PI / 2 + Math.PI * 0.375); hood.position.y = 0.765;
    body.add(hood);
    const hoodBack = new Mesh(new SphereGeometry(1, 14, 10), m.cape);
    hoodBack.scale.set(0.15, 0.085, 0.07); hoodBack.position.set(0, 0.76, -0.15); hoodBack.rotation.x = 0.35;
    body.add(hoodBack);
    const clasp = new Mesh(new ConeGeometry(0.03, 0.06, 4), m.trim);
    clasp.scale.z = 0.5; clasp.position.set(0, 0.745, 0.125);
    const clasp2 = clasp.clone(); clasp2.rotation.z = Math.PI; clasp2.position.y -= 0.05;
    body.add(clasp, clasp2);
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
    // (the poncho wraps all round, so gliding it billows out behind rather than flipping up)
    const flare = 1 + walk * (0.06 + run * 0.08) + (glide ? 0.14 : air ? 0.08 : 0) + Math.sin(t * 8 + ph) * 0.025 * (walk + (glide ? 1 : 0));
    this.capePivot.scale.set(flare, 1, flare * (glide ? 1.4 : 1 + run * 0.12));
    this.capePivot.rotation.x = walk * (0.12 + run * 0.2) + (glide ? 0.38 : air ? 0.14 : 0) + Math.sin(t * 9 + ph) * 0.04 * (glide ? 1 : walk);

    // arms: swing when walking, spread when gliding, reach out when holding hands
    this.holdAmt += ((this.holdSide !== 0 ? 1 : 0) - this.holdAmt) * Math.min(1, dt * 10);
    const targetLs = this.holdSide !== 0 ? -this.holdSide : this.lanternSide;
    this.lanternSide = targetLs;
    // the holding hand reaches for the point between you where the two hands meet (in this body's space)
    if (this.holdSide !== 0 && this.holdAim) { this.body.updateWorldMatrix(true, false); _t.copy(this.holdAt); this.body.worldToLocal(_t); }
    for (let i = 0; i < 2; i++) {
      const sx = i === 0 ? -1 : 1;
      const arm = this.arms[i];
      const holding = this.holdSide === sx ? this.holdAmt : 0;
      let rz = sx * 0.35, rx = -Math.sin(ph) * sx * 0.5 * walk;
      if (glide) { rz = sx * 1.35; rx = 0; }
      _q.setFromEuler(_e.set(rx, 0, rz));
      let stretch = 1;
      if (holding > 0.001) {
        if (this.holdAim) {
          _d.subVectors(_t, arm.position);
          const len = _d.length();
          stretch = Math.min(1.3, Math.max(0.85, len / ARM_LEN));
          _qh.setFromUnitVectors(_down, _d.multiplyScalar(1 / Math.max(len, 1e-4)));
        } else _qh.setFromEuler(_e.set(-0.2, 0, sx * 0.8));
        _q.slerp(_qh, holding);
      }
      arm.quaternion.copy(_q);
      arm.scale.y = 1 + (stretch - 1) * holding;
      this.hands[i].scale.y = 1 / arm.scale.y; // stretch the sleeve, not the hand
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

  /** The original hair: a cap of round curls; hers falls smooth down the back. */
  curlyHair(kind, m, hairGroup) {
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
    } else {
      const sprout = new Mesh(new ConeGeometry(0.025, 0.14, 6).translate(0, 0.07, 0), m.hair);
      sprout.position.set(0.02, 0.3, 0.0); sprout.rotation.z = -0.5; sprout.rotation.x = -0.2;
      hairGroup.add(sprout);
    }
  }

  /** Tousled shag like the character sheet: a cap, a ring of tapered locks that flick out at the tips, a shorter
   *  layer on top for volume, pointed bangs and one curl sticking up. Hers is longer at the back. */
  shagHair(kind, m, hairGroup) {
    const r = rng(kind === 'her' ? 13 : 17);
    const her = kind === 'her';
    const cap = new Mesh(displace(new SphereGeometry(0.272, 28, 18, 0, Math.PI * 2, 0, 1.5), 0.018, 5, her ? 4 : 9), m.hair);
    cap.scale.set(1.06, 1.0, 1.04); cap.position.set(0, 0.02, -0.015);
    hairGroup.add(cap);
    const lock = (theta, y0, rad, len, w, splay, flick, twist = 0) => {
      const mesh = new Mesh(lockGeo(len, w, flick), m.hair);
      mesh.rotation.order = 'YXZ';
      mesh.position.set(Math.sin(theta) * rad, y0, Math.cos(theta) * rad);
      mesh.rotation.set(-splay, theta, twist);
      hairGroup.add(mesh);
    };
    const ring = (n, from, y0, rad, len0, lenBack, w, splay, flick) => {
      for (let i = 0; i < n; i++) {
        const th = from + (i / (n - 1)) * (Math.PI * 2 - from * 2) + (r() - 0.5) * 0.15;
        const back = (1 - Math.cos(th)) / 2;
        lock(th, y0 + r() * 0.03, rad, len0 + back * lenBack + r() * 0.05, w * (0.9 + r() * 0.25), splay + r() * 0.15, flick + r() * 0.25, (r() - 0.5) * 0.45);
      }
    };
    // three rings of soft, thick locks from the nape up to the crown, each flicking out at the tip
    ring(16, 1.0, 0.07, 0.2, 0.22, her ? 0.2 : 0.07, 0.12, 0.28, 0.35);
    ring(14, 0.85, 0.17, 0.19, 0.2, her ? 0.1 : 0.04, 0.12, 0.5, 0.45);
    ring(10, 0.6, 0.26, 0.13, 0.15, 0, 0.11, 0.72, 0.45);
    // bangs: thick, pointed and uneven, parting a little
    const nb = 7;
    for (let i = 0; i < nb; i++) {
      const th = -0.7 + (i / (nb - 1)) * 1.4;
      lock(th + (r() - 0.5) * 0.08, 0.17 + r() * 0.02, 0.2, 0.12 + r() * 0.05, 0.085, 0.35, 0.25, (i - (nb - 1) / 2) * 0.13);
    }
    // the one curl sticking up
    const ah = new Mesh(lockGeo(0.17, 0.035, 0.8), m.hair);
    ah.position.set(0.01, 0.27, -0.03); ah.rotation.set(Math.PI * 0.8, 0.3, 0);
    hairGroup.add(ah);
  }

  /** Soft bob: one smooth rounded shape with a scalloped hem and a scalloped fringe, open at the face, one curl on
   *  top. Reads cleanly from far away. Hers is longer at the back. */
  bobHair(kind, m, hairGroup) {
    const her = kind === 'her';
    const open = 0.72; // half-angle of the opening for the face
    // profile from the inner tuck up over the crown (bottom to top, so the faces point outward)
    const prof = [[0.215, -0.11], [0.265, -0.175], [0.315, -0.16], [0.305, -0.08], [0.298, 0.02], [0.28, 0.14], [0.225, 0.24], [0.13, 0.3], [0.001, 0.31]]
      .map(([x, y]) => new Vector2(x, y));
    const shell = new LatheGeometry(prof, 40, open, Math.PI * 2 - open * 2);
    const p = shell.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      if (y > -0.05) continue;
      const phi = Math.atan2(x, z), back = (1 - Math.cos(phi)) / 2;
      const lobe = Math.pow(Math.abs(Math.sin(phi * 4.5)), 0.7);
      const k = Math.min(1, (-0.05 - y) / 0.1);
      p.setY(i, y - k * (0.035 * lobe + back * (her ? 0.16 : 0.04)));
    }
    shell.computeVertexNormals();
    hairGroup.add(new Mesh(shell, m.hair));
    // fringe across the forehead, scalloped into 4 rounded points
    const fprof = [[0.235, 0.04], [0.265, 0.03], [0.278, 0.09], [0.268, 0.17], [0.215, 0.26]].map(([x, y]) => new Vector2(x, y));
    const fr = new LatheGeometry(fprof, 20, -open - 0.05, open * 2 + 0.1);
    const q = fr.attributes.position;
    for (let i = 0; i < q.count; i++) {
      const y = q.getY(i);
      if (y > 0.08) continue;
      const phi = Math.atan2(q.getX(i), q.getZ(i));
      const u = (phi + open + 0.05) / (open * 2 + 0.1);
      q.setY(i, y - 0.035 * Math.pow(Math.abs(Math.sin(u * 4 * Math.PI)), 0.7));
    }
    fr.computeVertexNormals();
    hairGroup.add(new Mesh(fr, m.hair));
    const ah = new Mesh(lockGeo(0.16, 0.03, 0.8), m.hair);
    ah.position.set(0.01, 0.295, -0.03); ah.rotation.set(Math.PI * 0.8, 0.3, 0);
    hairGroup.add(ah);
  }

  /**
   * Where two travelers' clasped hands meet: between them, a little in front, at a height that keeps both arms
   * comfortably reaching (lower when you stand close, up to shoulder height when you're further apart).
   * pa/pb: their feet (world), ha/hb: their headings.
   */
  static holdPoint(pa, ha, pb, hb, out) {
    out.addVectors(pa, pb).multiplyScalar(0.5);
    const half = Math.hypot(pa.x - pb.x, pa.z - pb.z) / 2;
    const h = Math.max(0, half - 0.22), reach = 0.38; // shoulder offset and arm length, in metres
    out.y += 0.93 - Math.sqrt(Math.max(0, reach * reach - h * h)) * 0.95;
    const fx = Math.sin(ha) + Math.sin(hb), fz = Math.cos(ha) + Math.cos(hb), fl = Math.hypot(fx, fz);
    if (fl > 0.1) { out.x += (fx / fl) * 0.07; out.z += (fz / fl) * 0.07; }
    return out;
  }

  /** World position of the hand on the given side (-1 left, +1 right). */
  handWorld(side, out) { return this.hands[side < 0 ? 0 : 1].getWorldPosition(out); }

  land(strength) { this.squash = Math.min(1, strength); }
}
const _v = new Vector3();
const _off = new Vector3();
const _t = new Vector3(), _d = new Vector3(), _down = new Vector3(0, -1, 0);
const _q = new Quaternion(), _qh = new Quaternion(), _e = new Euler();
