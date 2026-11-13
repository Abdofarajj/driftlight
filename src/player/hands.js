// Holding hands: two actors link. If only one of them is moving, they lead and the other is pulled
// along beside them (walking, running, jumping and gliding together). If both move, they stay
// within arm's reach. Holding hands also shares and brightens the light.
import { Vector3, Mesh, PlaneGeometry } from 'three';
import { makeSoftMaterial } from '../look/material.js';
import { PAL } from '../look/palette.js';
import { RUN } from './actor.js';

const SPACING = 0.95;   // distance between the two travelers when holding hands
const LINK_RANGE = 2.6; // how close you must be to take hands
const BREAK = 3.6;

const localX = (h, out) => out.set(Math.cos(h), 0, -Math.sin(h)); // traveler's local +x in world space

export class Hands {
  constructor(a, b, scene) {
    this.a = a; this.b = b;
    this.linked = false;
    this.side = 1; // which local side of `a` the partner is on
    this.spark = new Mesh(new PlaneGeometry(0.7, 0.7), makeSoftMaterial(PAL.glowCore, 0.9, true));
    this.spark.visible = false;
    scene.add(this.spark);
    this._v = new Vector3(); this._w = new Vector3(); this._x = new Vector3();
  }

  toggle() {
    if (this.linked) { this.unlink(); return 'released'; }
    const { a, b } = this;
    const d = a.pos.distanceTo(b.pos);
    if (d > LINK_RANGE) return 'too-far';
    localX(a.heading, this._x);
    this.side = Math.sign(this._v.subVectors(b.pos, a.pos).dot(this._x)) || 1;
    this.linked = true;
    a.t.holdSide = this.side;
    b.t.holdSide = -this.side;
    return 'linked';
  }

  unlink() {
    this.linked = false;
    this.a.t.holdSide = 0; this.b.t.holdSide = 0;
  }

  moving(act) { return Math.hypot(act.intent.x, act.intent.z) > 0.1; }

  step(dt, world) {
    const { a, b } = this;
    if (!this.linked) { a.step(dt, world); b.step(dt, world); return; }
    const am = this.moving(a), bm = this.moving(b);
    if (am && !bm) this.lead(a, b, this.side, dt, world);
    else if (bm && !am) this.lead(b, a, -this.side, dt, world);
    else {
      // a jump by one carries the other along if they're just standing there
      if (a.intent.jump && a.grounded && !bm) b.intent.jump = true;
      if (b.intent.jump && b.grounded && !am) a.intent.jump = true;
      if (!bm) b.intent.jumpHeld = a.intent.jumpHeld;
      if (!am) a.intent.jumpHeld = b.intent.jumpHeld;
      a.step(dt, world); b.step(dt, world);
      // keep within arm's reach: split the correction
      const d = this._v.subVectors(b.pos, a.pos); d.y = 0;
      const len = d.length();
      if (len > SPACING * 1.25) {
        const k = (len - SPACING * 1.25) / len * 0.5;
        a.pos.addScaledVector(d, k); b.pos.addScaledVector(d, -k);
      }
      if (!am && !bm) { // idle together: turn to face the same way
        b.faceTowards(a.heading, dt, 4);
      }
    }
    if (a.pos.distanceTo(b.pos) > BREAK) this.unlink();
  }

  /** leader walks by its own intent; follower is pulled to its side. */
  lead(leader, follower, side, dt, world) {
    const jumpNow = leader.intent.jump && leader.grounded;
    leader.step(dt, world);
    localX(leader.heading, this._x);
    const tx = leader.pos.x + this._x.x * side * SPACING, tz = leader.pos.z + this._x.z * side * SPACING;
    const f = follower;
    const vx = (tx - f.pos.x) * 10, vz = (tz - f.pos.z) * 10;
    const sp = Math.hypot(vx, vz), max = RUN * 1.4;
    f.vel.x = sp > max ? vx / sp * max : vx;
    f.vel.z = sp > max ? vz / sp * max : vz;
    if (jumpNow && f.grounded) { f.vel.y = leader.vel.y; f.grounded = false; }
    f.faceTowards(leader.heading, dt, 10);
    f.integrate(dt, world, leader.glide || leader.intent.jumpHeld);
    if (!leader.grounded && !f.grounded) f.vel.y = Math.max(f.vel.y, leader.vel.y - 1); // fly together
  }

  /** after both travelers are animated: place the spark of light between the clasped hands */
  afterAnimate(t, camera) {
    this.spark.visible = this.linked;
    if (!this.linked) return;
    this.a.t.handWorld(this.side, this._v);
    this.b.t.handWorld(-this.side, this._w);
    this.spark.position.copy(this._v).lerp(this._w, 0.5);
    this.spark.scale.setScalar(0.8 + Math.sin(t * 4) * 0.12);
    this.spark.quaternion.copy(camera.quaternion);
  }
}
