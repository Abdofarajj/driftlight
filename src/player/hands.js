// Holding hands: two actors link. If only one of them is moving, they lead and the other is pulled
// along beside them (walking, running, jumping and gliding together). If both move, they stay
// within arm's reach. Holding hands also shares and brightens the light.
import { Vector3, Mesh, PlaneGeometry } from 'three';
import { makeSoftMaterial } from '../look/material.js';
import { PAL } from '../look/palette.js';
import { RUN, JUMP } from './actor.js';

const SPACING = 0.95;   // distance between the two travelers when holding hands
const LINK_RANGE = 2.6; // how close you must be to take hands
const BREAK = 6; // only a real separation (a fall) breaks the hold

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

  /** the partner took your hand over the network; side = which of your sides they're on */
  linkAs(side) {
    this.linked = true;
    this.side = side || 1;
    this.a.t.holdSide = this.side;
    this.b.t.holdSide = -this.side;
  }

  unlink() {
    this.linked = false;
    this.carrying = false;
    this.b.predicted = false;
    this.a.t.holdSide = 0; this.b.t.holdSide = 0;
  }

  moving(act) { return Math.hypot(act.intent.x, act.intent.z) > 0.1; }

  step(dt, world) {
    const { a, b } = this;
    if (!this.linked) { a.step(dt, world); b.step(dt, world); return; }
    const am = this.moving(a), bm = this.moving(b);
    if (am !== bm) this.last = am ? a : b; // who walked last
    const L = this.last, O = L === a ? b : a;
    if (am && !bm) this.lead(a, b, this.side, dt, world);
    else if (bm && !am) this.lead(b, a, -this.side, dt, world);
    else if (!am && !bm && L && L.grounded && O.grounded && Math.abs(O.pos.y - L.pos.y) > 1.0) {
      const side = L === a ? this.side : -this.side;
      if (O.pos.y > L.pos.y) this.lead(L, O, side, dt, world); // you hopped down off a ledge and stopped below it: they come down after you
      else { L.step(dt, world); O.step(dt, world); this.pullUp(L, O, side, world, null, 2.2); } // you got up there and they didn't: pull them up
    } else {
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

  /**
   * Online version. `a` is you, `b` is your partner. While holding hands, whoever walks "carries" the
   * pair: their screen moves both travelers and sends where it put the other one, and the other screen
   * plays that back for its own traveler (`carry(a, dt)` returns true while it's doing so). Without
   * that, each screen would pull its traveler towards a slightly old copy of the other, and the two of
   * you would tug each other back whenever someone stopped.
   * Returns 'broke' if a fall pulled the hands apart.
   */
  stepOnline(dt, world, carry) {
    const { a, b } = this;
    const partnerJumped = b.jumpedNow; b.jumpedNow = false;
    a.carried = false;
    if (!this.linked) { this.carrying = false; b.predicted = false; a.step(dt, world); return null; }
    const am = this.moving(a), bm = this.moving(b);
    if (bm) this.carrying = false;     // they walk by themselves: their own screen moves them
    else if (am) this.carrying = true; // you walk: this screen moves them beside you until they walk again
    b.predicted = this.carrying;
    if (this.carrying) {
      if (partnerJumped) { b.intent.jump = true; if (!am && a.grounded) a.intent.jump = true; } // they hopped
      this.lead(a, b, this.side, dt, world);
    } else if (!am && carry && carry(a, dt)) {
      a.carried = true; // their screen is walking you: play back where it put you
      a.intent.jump = false; // a hop of yours reaches their screen as a jump and comes back in their updates
    } else if (bm && !am) {
      this.follow(b, a, -this.side, dt, world, partnerJumped); // until their first word about you arrives
    } else {
      if (partnerJumped && !am && a.grounded) a.intent.jump = true; // standing together: hop when they hop
      a.step(dt, world);
      if (am && bm) { // both walking: drift back within reach, gently
        const d = this._v.subVectors(b.pos, a.pos); d.y = 0;
        const len = d.length();
        if (len > SPACING * 1.25) a.pos.addScaledVector(d, (len - SPACING * 1.25) / len * Math.min(1, dt * 2));
      }
    }
    if (a.pos.distanceTo(b.pos) > BREAK) { this.unlink(); return 'broke'; }
    return null;
  }

  /** leader walks by its own intent; follower is pulled to its side. */
  lead(leader, follower, side, dt, world) {
    const jumpNow = leader.intent.jump && leader.grounded;
    leader.step(dt, world);
    this.follow(leader, follower, side, dt, world, jumpNow);
  }

  /** where the follower stands: beside the leader, or (no room there: a bridge's end, stepping stones, a dock, a
   *  ledge or a frost step) behind them, on their other side, or right behind them. [x, z, floor y or null] */
  spot(leader, side, world) {
    localX(leader.heading, this._x);
    let tx = leader.pos.x + this._x.x * side * SPACING, tz = leader.pos.z + this._x.z * side * SPACING;
    let ty = null;
    if (leader.grounded) {
      const lp = leader.pos, sh = Math.sin(leader.heading), ch = Math.cos(leader.heading);
      const room = (x, z) => { if (world.deep && world.deep(x, z)) return null; const fy = world.floorAt(x, z, lp.y); return fy !== null && Math.abs(fy - lp.y) < 0.8 ? fy : null; };
      const spots = [[tx, tz], [lp.x - sh * SPACING, lp.z - ch * SPACING], [lp.x - this._x.x * side * SPACING, lp.z - this._x.z * side * SPACING], [lp.x - sh * 0.45, lp.z - ch * 0.45]];
      for (const [x, z] of spots) { ty = room(x, z); if (ty !== null) { tx = x; tz = z; break; } }
      if (ty === null) { tx = spots[1][0]; tz = spots[1][1]; }
    }
    return [tx, tz, ty];
  }

  /** you climbed up somewhere and they didn't quite make it: pull them up by the hand (not as you step off it again) */
  pullUp(leader, f, side, world, at, reach = 1.6) {
    const [tx, tz, ty] = at || this.spot(leader, side, world);
    const dy = leader.pos.y - f.pos.y, lp = leader.pos, it = leader.intent;
    if (!leader.grounded || !f.grounded || ty === null || dy <= 1.0 || dy >= 3.2 || Math.hypot(tx - f.pos.x, tz - f.pos.z) >= reach) return;
    const ahead = world.floorAt(lp.x + it.x * 1.2, lp.z + it.z * 1.2, lp.y); // a step ahead of where you're heading
    if (ahead === null || ahead < lp.y - 1.0) return; // you're walking off the edge: they'll come down with you
    f.pos.set(tx, ty, tz); f.vel.set(0, 0, 0);
  }

  /** pull the follower to the leader's side (the leader has already moved this step) */
  follow(leader, follower, side, dt, world, jumpNow) {
    const at = this.spot(leader, side, world), [tx, tz] = at;
    const f = follower;
    const vx = (tx - f.pos.x) * 10, vz = (tz - f.pos.z) * 10;
    const sp = Math.hypot(vx, vz), max = RUN * 1.4;
    f.vel.x = sp > max ? vx / sp * max : vx;
    f.vel.z = sp > max ? vz / sp * max : vz;
    if ((jumpNow || f.intent.jump) && f.grounded) { f.vel.y = Math.max(leader.vel.y, JUMP * 0.97 * f.boost); f.grounded = false; }
    f.intent.jump = false;
    f.faceTowards(leader.heading, dt, 10);
    // if they snag on a rock or post, let them slip past it rather than tearing the hands apart
    const snagged = Math.hypot(tx - f.pos.x, tz - f.pos.z) > 1.4;
    f.integrate(dt, world, leader.glide || leader.intent.jumpHeld, !snagged);
    if (!leader.grounded && !f.grounded) f.vel.y = Math.max(f.vel.y, leader.vel.y - 1); // fly together
    this.pullUp(leader, f, side, world, at);
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
