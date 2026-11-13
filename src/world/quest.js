// "Light the forest": five stone lanterns only light when both travelers stand at one holding hands.
// When all five glow, the shrine wakes and a bridge of light rises from the arch to the shrine island.
import { Vector3, Mesh, TorusGeometry } from 'three';
import { makeGlowMaterial } from '../look/material.js';
import { PAL } from '../look/palette.js';

const NEED = 1.6;   // seconds of standing together to light one
const RANGE = 3.2; // generous: both of you just need to be gathered round it

export class LanternQuest {
  constructor(world, scene, events) {
    this.world = world;
    this.events = events; // { emit(name, data) }
    this.items = world.stoneLanterns.map((sl) => {
      const ring = new Mesh(new TorusGeometry(1.2, 0.04, 6, 48), makeGlowMaterial(PAL.glowCore, PAL.glowHalo, 0.0));
      ring.rotation.x = -Math.PI / 2;
      ring.position.copy(sl.position).add(new Vector3(0, 0.08, 0));
      ring.visible = false;
      scene.add(ring);
      return { sl, ring, charge: 0, lit: false, hinted: 0, pos: sl.position.clone() };
    });
    this.count = 0;
    this.done = false;
    this.rise = 0;
  }

  update(dt, t, a, b, linked) {
    for (const it of this.items) {
      const da = Math.hypot(a.pos.x - it.pos.x, a.pos.z - it.pos.z);
      const db = Math.hypot(b.pos.x - it.pos.x, b.pos.z - it.pos.z);
      const together = linked && da < RANGE && db < RANGE;
      if (!it.lit) {
        it.charge = together ? it.charge + dt / NEED : Math.max(0, it.charge - dt * 0.8);
        if (!linked && da < RANGE && t - it.hinted > 8) { it.hinted = t; this.events.emit('hint', 'Hold hands here to light it together'); }
        if (it.charge >= 1) {
          it.lit = true; this.count++;
          this.events.emit('lantern', { n: this.count, of: this.items.length, pos: it.pos });
          if (this.count === this.items.length) { this.done = true; this.events.emit('quest-complete', {}); }
        }
      }
      // visuals: a ring fills while charging; window glow + light pool when lit
      const k = it.lit ? 1 : it.charge;
      it.ring.visible = k > 0.01 && !it.lit;
      it.ring.material.uniforms.uStr.value = 0.4 + k * 1.2;
      it.ring.scale.setScalar(1.2 - k * 0.45 + Math.sin(t * 6) * 0.03);
      const ud = it.sl.userData;
      ud.glowMat.uniforms.uStr.value = it.lit ? 1.45 + Math.sin(t * 2 + it.pos.x) * 0.08 : 0.65 + it.charge * 0.7;
      ud.light.str = it.lit ? 1.9 : 0.8 + it.charge;
    }
    if (this.done && this.rise < 1) {
      this.rise = Math.min(1, this.rise + dt / 4.5);
      this.world.northBridge.setRise(this.rise);
      this.world.shrine.userData.setGlow(this.rise);
      if (this.rise >= 1) this.events.emit('bridge-open', {});
    }
  }

  /** debug: light everything at once */
  completeNow() { for (const it of this.items) it.charge = 1; }
}
