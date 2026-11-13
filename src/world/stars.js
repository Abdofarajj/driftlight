// Collectible stars (the counter in the top-left). One on each far island.
import { Group, Mesh, ConeGeometry, Vector3, PlaneGeometry } from 'three';
import { makeGlowMaterial, makeSoftMaterial } from '../look/material.js';
import { PAL } from '../look/palette.js';

export class Stars {
  constructor(scene, spots) {
    const geo = new ConeGeometry(0.22, 0.4, 4).translate(0, 0.2, 0);
    this.items = spots.map(([x, y, z]) => {
      const g = new Group();
      const mat = makeGlowMaterial(PAL.glowCore, PAL.glowHalo, 1.5);
      const a = new Mesh(geo, mat), b = new Mesh(geo, mat); b.rotation.z = Math.PI;
      const c = new Mesh(geo, mat), d = new Mesh(geo, mat);
      c.rotation.z = Math.PI / 2; d.rotation.z = -Math.PI / 2; c.scale.set(0.6, 0.6, 0.6); d.scale.set(0.6, 0.6, 0.6);
      const halo = new Mesh(new PlaneGeometry(1.6, 1.6), makeSoftMaterial(PAL.glowHalo, 0.55, true));
      const spin = new Group(); spin.add(a, b, c, d);
      g.add(spin, halo);
      g.position.set(x, y, z);
      scene.add(g);
      return { g, spin, halo, pos: new Vector3(x, y, z), got: false, pop: 0 };
    });
    this.count = 0;
  }

  update(dt, t, actors, camera, onCollect) {
    for (const s of this.items) {
      if (s.got) {
        if (s.pop < 1) { s.pop += dt * 2.5; s.g.scale.setScalar(Math.max(0.001, 1 + s.pop * 0.8) * (1 - s.pop)); s.g.position.y += dt * 2; }
        else s.g.visible = false;
        continue;
      }
      s.spin.rotation.y = t * 1.5;
      s.g.position.y = s.pos.y + Math.sin(t * 2 + s.pos.x) * 0.15;
      s.halo.quaternion.copy(camera.quaternion);
      for (const a of actors) {
        if (a.pos.distanceTo(s.pos) < 1.4) { s.got = true; this.count++; onCollect(s, this.count); break; }
      }
    }
  }
}
