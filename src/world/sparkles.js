// A small pool of soft glowing motes for discovery bursts, sleepy "z" puffs, petal glints and trails.
import { InstancedMesh, PlaneGeometry, Object3D, Vector3 } from 'three';
import { makeSoftMaterial } from '../look/material.js';
import { PAL } from '../look/palette.js';

export class Motes {
  constructor(scene, n = 160, color = PAL.glowCore) {
    this.mesh = new InstancedMesh(new PlaneGeometry(1, 1), makeSoftMaterial(color, 0.95, true), n);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 3;
    this.p = Array.from({ length: n }, () => ({ age: 1, life: 0, pos: new Vector3(), vel: new Vector3(), size: 0, drag: 1, grav: 0 }));
    this.next = 0;
    this._o = new Object3D();
    for (let i = 0; i < n; i++) { this._o.scale.setScalar(0); this._o.updateMatrix(); this.mesh.setMatrixAt(i, this._o.matrix); }
    scene.add(this.mesh);
  }

  /** count motes from pos: outward speed, upward lift, lifetime (s), size (m), spread of the start point */
  emit(pos, count, { speed = 2, up = 1.5, life = 1.2, size = 0.22, spread = 0.3, grav = -0.6, drag = 1.5 } = {}) {
    for (let k = 0; k < count; k++) {
      const m = this.p[this.next]; this.next = (this.next + 1) % this.p.length;
      const a = Math.random() * Math.PI * 2, e = Math.random() * 2 - 1;
      const dir = new Vector3(Math.cos(a) * Math.sqrt(1 - e * e), e, Math.sin(a) * Math.sqrt(1 - e * e));
      m.pos.copy(pos).addScaledVector(dir, spread * Math.random());
      m.vel.copy(dir).multiplyScalar(speed * (0.4 + Math.random() * 0.6)); m.vel.y += up * (0.6 + Math.random() * 0.6);
      m.age = 0; m.life = life * (0.7 + Math.random() * 0.6); m.size = size * (0.6 + Math.random() * 0.7); m.drag = drag; m.grav = grav;
    }
  }

  update(dt, camera) {
    const o = this._o;
    o.quaternion.copy(camera.quaternion);
    this.p.forEach((m, i) => {
      if (m.age >= m.life) { if (m.size) { m.size = 0; o.position.set(0, -999, 0); o.scale.setScalar(0); o.updateMatrix(); this.mesh.setMatrixAt(i, o.matrix); } return; }
      m.age += dt;
      m.vel.multiplyScalar(Math.exp(-m.drag * dt)); m.vel.y += m.grav * dt;
      m.pos.addScaledVector(m.vel, dt);
      const k = m.age / m.life;
      o.position.copy(m.pos);
      o.scale.setScalar(m.size * Math.sin(Math.min(1, k) * Math.PI) * (0.85 + 0.15 * Math.sin(m.age * 20 + i)));
      o.updateMatrix();
      this.mesh.setMatrixAt(i, o.matrix);
    });
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
