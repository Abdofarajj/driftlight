// Movement for one traveler: walk, run, jump, glide, collide, fall. Shared by the local player,
// the partner (bot now, network in round 2) and the playtest bot.
import { Vector3 } from 'three';

export const WALK = 4.2, RUN = 7.2, GRAV = 24, JUMP = 8.4, GLIDE_FALL = 1.7;
const BODY_R = 0.32;

export class Actor {
  constructor(traveler, pos) {
    this.t = traveler;
    this.pos = pos.clone();
    this.vel = new Vector3();
    this.heading = Math.PI;
    this.grounded = true;
    this.glide = false;
    this.airTime = 0;
    this.speed01 = 0;
    this.inWind = false;
    this.predicted = false; // online partner placed by hand-holding on this screen (see Hands.stepOnline)
    this.jumpedNow = false; // online partner just hopped
    this.carried = false; // online: your partner is walking you by the hand (see Hands.stepOnline)
    this.intent = { x: 0, z: 0, run: false, jump: false, jumpHeld: false };
  }

  /** Move by intent (world-space direction, length <= 1). */
  step(dt, world) {
    const it = this.intent;
    const max = it.run ? RUN : WALK;
    if (this.inWind) { // the wind carries you; your input only nudges
      this.vel.x += it.x * max * 0.8 * dt; this.vel.z += it.z * max * 0.8 * dt;
    } else {
      const accel = this.grounded ? 14 : 5;
      this.vel.x += (it.x * max - this.vel.x) * Math.min(1, accel * dt);
      this.vel.z += (it.z * max - this.vel.z) * Math.min(1, accel * dt);
    }
    if (this.inWind && Math.hypot(this.vel.x, this.vel.z) > 1) this.faceTowards(Math.atan2(this.vel.x, this.vel.z), dt, 5);
    else if (Math.hypot(it.x, it.z) > 0.05) this.faceTowards(Math.atan2(it.x, it.z), dt);
    if (it.jump && this.grounded) { this.vel.y = JUMP; this.grounded = false; }
    it.jump = false;
    this.integrate(dt, world, it.jumpHeld);
  }

  faceTowards(target, dt, rate = 12) {
    let d = target - this.heading; d = Math.atan2(Math.sin(d), Math.cos(d));
    this.heading += d * Math.min(1, dt * rate);
  }

  integrate(dt, world, glideHeld, collide = true) {
    this.vel.y -= GRAV * dt;
    this.glide = !this.grounded && this.vel.y < 0 && glideHeld;
    if (this.glide) this.vel.y = Math.max(this.vel.y, -GLIDE_FALL);
    const p = this.pos;
    const px = p.x, pz = p.z;
    p.addScaledVector(this.vel, dt);
    if (collide) { this.collide(world); this.keepDry(world, px, pz); }
    const f = world.floorAt(p.x, p.z);
    if (f !== null && p.y <= f + 0.02 && this.vel.y <= 0 && p.y > f - 1.2) {
      if (!this.grounded) this.t.land(Math.min(1, -this.vel.y / 14));
      p.y = f; this.vel.y = 0; this.grounded = true;
    } else if (f === null || p.y > f + 0.25 || p.y < f - 1.2) {
      this.grounded = false;
    } else if (this.grounded) {
      p.y = f;
    }
    this.airTime = this.grounded ? 0 : this.airTime + dt;
    this.speed01 = Math.hypot(this.vel.x, this.vel.z) / WALK;
  }

  collide(world) {
    const p = this.pos;
    for (const c of world.colliders) {
      let cx, cz;
      if (c.off) continue;
      if (c.top !== undefined && p.y > c.top - 0.2) continue; // standing on (or jumping onto) a low rock
      if (c.ax !== undefined) { // segment (fences, bridge rails)
        const abx = c.bx - c.ax, abz = c.bz - c.az;
        const t = Math.max(0, Math.min(1, ((p.x - c.ax) * abx + (p.z - c.az) * abz) / (abx * abx + abz * abz)));
        cx = c.ax + abx * t; cz = c.az + abz * t;
      } else { cx = c.x; cz = c.z; }
      const ex = p.x - cx, ez = p.z - cz, d = Math.hypot(ex, ez), r = c.r + BODY_R;
      if (d < r && d > 1e-5) {
        p.x = cx + (ex / d) * r; p.z = cz + (ez / d) * r;
        // remove velocity into the obstacle so you slide along it
        const nx = ex / d, nz = ez / d, vn = this.vel.x * nx + this.vel.z * nz;
        if (vn < 0) { this.vel.x -= vn * nx; this.vel.z -= vn * nz; }
      }
    }
  }

  /** Deep water is a soft wall: you can wade in the shallows but not walk out of your depth. */
  keepDry(world, px, pz) {
    const p = this.pos;
    if (!world.deep || !world.deep(p.x, p.z) || world.deep(px, pz)) return; // already in: let them splash
    if (!world.deep(p.x, pz)) { p.z = pz; this.vel.z = 0; } // slide along the shore
    else if (!world.deep(px, p.z)) { p.x = px; this.vel.x = 0; } else { p.x = px; p.z = pz; this.vel.x = 0; this.vel.z = 0; }
  }

  /** Copy the actor onto its traveler model and animate it. */
  apply(dt, t) {
    this.t.root.position.copy(this.pos);
    this.t.root.rotation.y = this.heading;
    this.t.animate(dt, t, this.grounded ? this.speed01 : 0.4, !this.grounded, this.glide || this.inWind);
  }
}
