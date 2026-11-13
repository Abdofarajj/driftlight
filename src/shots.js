// Fixed camera shots for the look loop (tools/capture.mjs). Each one mirrors a reference image.
// viewport: 'portrait' = iPhone 15 Pro 393x852 @3x, 'landscape' = 852x393 @3x.

function place(t, world, x, z, heading, opts = {}) {
  const y = world.floorAt(x, z) ?? 0;
  t.root.position.set(x, y + (opts.lift || 0), z);
  t.root.rotation.y = heading;
  t.animate(0.016, opts.t ?? 2, opts.speed ?? 0, !!opts.air, !!opts.glide);
}

function cam(camera, p, look, fov) {
  camera.position.set(...p);
  camera.lookAt(...look);
  if (fov && camera.fov !== fov) { camera.fov = fov; camera.updateProjectionMatrix(); }
}

export const SHOTS = {
  // ref: lantern-forest.png (high 3/4 gameplay view)
  forest: {
    viewport: 'landscape', ref: 'lantern-forest.png',
    apply({ me, friend, camera, world }) {
      place(me, world, 1.4, 7.0, Math.PI * 0.95);
      place(friend, world, 2.6, 7.2, Math.PI * 1.05, { t: 3.1 });
      cam(camera, [15, 11, 15], [0, 0.5, -1], 46);
    },
  },
  // ref: phone-portrait.png (behind the players, looking out over the path)
  portrait: {
    viewport: 'portrait', ref: 'phone-portrait.png', ui: true,
    apply({ me, friend, camera, world }) {
      place(me, world, -0.2, 7.2, Math.PI * 1.08);
      place(friend, world, 0.9, 7.1, Math.PI * 1.08, { t: 3.1 });
      cam(camera, [1.0, 3.2, 13.8], [-2.0, 2.4, -2], 62);
    },
  },
  // top-down map of the main island, for planning where things go (not compared to a reference)
  map: {
    viewport: 'landscape',
    apply({ me, friend, camera, world }) {
      place(me, world, 1.2, 11.5, Math.PI);
      place(friend, world, 0, 9.9, Math.PI);
      cam(camera, [0, 62, 0.01], [0, 0, 0], 50);
    },
  },
  // same framing with an objective expanded, to check the panel on the phone
  'portrait-open': {
    viewport: 'portrait', ref: 'phone-portrait.png', ui: true, open: 'lanterns',
    apply(o) { SHOTS.portrait.apply(o); },
  },
  // ref: lantern-bearers.png (low camera, cloud sea, beam on the horizon)
  bearers: {
    viewport: 'landscape', ref: 'lantern-bearers.png',
    apply({ me, friend, camera, world }) {
      place(me, world, -9.4, -15.2, Math.PI * 1.13, { speed: 1, t: 2.0 });
      place(friend, world, -8.0, -14.8, Math.PI * 1.13, { speed: 1, t: 2.45 });
      cam(camera, [-6.6, 2.3, -9.0], [-17, 3.2, -36], 52);
    },
  },
  // ref: traveler-turnaround.png (character read)
  close: {
    viewport: 'landscape', ref: 'traveler-turnaround.png',
    apply({ me, friend, camera, world }) {
      place(me, world, 0.4, 9.0, 0.35);
      place(friend, world, 1.8, 9.0, -0.35, { t: 3.1 });
      const y = world.floorAt(1.1, 9) ?? 0;
      cam(camera, [1.1, y + 1.5, 13.4], [1.1, y + 0.9, 9], 40);
    },
  },

  // ---- round 4 secrets (planning / review shots) ----
  // the waterfall at the south edge, from the forest side
  grotto: {
    viewport: 'landscape',
    apply({ me, friend, camera, world, secrets: S }) {
      const w = S.gToWorld, y = S.gBaseY, at = (lx, lz) => { const p = w(lx, lz); return [p.x, p.z]; };
      const face = Math.atan2(-(w(0, 0).x - w(0, 1).x), -(w(0, 0).z - w(0, 1).z)) + Math.PI; // towards the water
      place(me, world, ...at(-0.7, 4.7), face, { t: 2 });
      place(friend, world, ...at(0.55, 4.9), face, { t: 3.1 });
      const c = w(2.6, 9.5), l = w(0, 0.6);
      cam(camera, [c.x, y + 2.9, c.z], [l.x, y + 1.5, l.z], 46);
    },
  },
  // Roro Jr inside the grotto, compared with Abdo's photo of him
  roro: {
    viewport: 'portrait', ref: 'roro-jr.jpg',
    apply({ me, friend, camera, world, secrets: S }) {
      const w = S.gToWorld, y = S.gBaseY;
      place(me, world, 0, -40, 0); place(friend, world, 2, -40, 0); // out of the way
      const c = w(0.05, 1.35), l = w(0, -0.62);
      cam(camera, [c.x, y + 0.95, c.z], [l.x, y + 0.66, l.z], 62);
    },
  },
  // ...and waving, seen from the back of the pool, through the water
  'roro-wave': {
    viewport: 'landscape',
    apply({ me, friend, camera, world, secrets: S }) {
      const w = S.gToWorld, y = S.gBaseY, at = (lx, lz) => { const p = w(lx, lz); return [p.x, p.z]; };
      const face = Math.atan2(w(0, -1).x - w(0, 0).x, w(0, -1).z - w(0, 0).z);
      place(me, world, ...at(-1.0, 0.45), face + 0.5, { t: 2 });
      place(friend, world, ...at(1.0, 0.4), face - 0.5, { t: 3.1 });
      S.roroK = 1; S.waveT = 1;
      const c = w(0.2, 1.3), l = w(0, -0.6);
      cam(camera, [c.x, y + 1.45, c.z], [l.x, y + 0.7, l.z], 58);
    },
  },
  // the light fox asleep in the roots of the north-east tree
  fox: {
    viewport: 'landscape',
    apply({ me, friend, camera, world, secrets: S }) {
      const n = S.fox.nest;
      place(me, world, n.x + 3.4, n.z + 1.2, Math.PI * 1.35, { t: 2 });
      place(friend, world, n.x + 3.6, n.z + 0.1, Math.PI * 1.45, { t: 3.1 });
      cam(camera, [n.x + 1.2, n.y + 1.3, n.z + 2.6], [n.x, n.y + 0.15, n.z], 40);
    },
  },
  'fox-awake': {
    viewport: 'landscape',
    apply({ me, friend, camera, world, secrets: S }) {
      const f = S.fox; f.k = 1; f.state = 'follow'; f.heading = 0.9;
      place(me, world, f.nest.x + 1.6, f.nest.z + 1.4, Math.PI * 1.25, { t: 2 });
      place(friend, world, f.nest.x + 2.5, f.nest.z + 0.4, Math.PI * 1.4, { t: 3.1 });
      cam(camera, [f.nest.x + 1.0, f.nest.y + 1.3, f.nest.z + 4.2], [f.nest.x + 0.8, f.nest.y + 0.5, f.nest.z], 44);
    },
  },
  // the fairy ring, lit, with the two of you floating in it
  ring: {
    viewport: 'landscape',
    apply({ me, friend, camera, world, secrets: S }) {
      const c = S.ringCenter; S.ring.state = 'dance'; S.ring.t = 3.2; S.ring.burst = true;
      place(me, world, c.x - 0.45, c.z + 0.1, 0.6, { lift: 0.9, air: true, t: 2 });
      place(friend, world, c.x + 0.45, c.z - 0.1, -0.6 + Math.PI, { lift: 0.9, air: true, t: 3.1 });
      cam(camera, [c.x + 3.4, c.y + 2.6, c.z + 5.2], [c.x, c.y + 0.7, c.z], 46);
    },
  },
  // ---- round 6: Crystal Lake ----
  // from the shrine island: the crystal bridge leading over the clouds to the lake
  'lake-bridge': {
    viewport: 'landscape',
    apply({ me, friend, camera, world, lake: Q }) {
      Q.open(true);
      const b = world.lake.bridge.data, d = b.dir;
      const at = (k, side) => [b.from.x + d.x * k - d.z * side, b.from.z + d.z * k + d.x * side];
      const h = Math.atan2(d.x, d.z);
      place(me, world, ...at(1.5, -0.45), h, { speed: 1, t: 2 });
      place(friend, world, ...at(1.5, 0.5), h, { speed: 1, t: 2.4 });
      cam(camera, [b.from.x - d.x * 6 + d.z * 3, 5.2, b.from.z - d.z * 6 - d.x * 3], [b.to.x, 1.5, b.to.z], 50);
    },
  },
  // over the lake: one crystal awake (you're on its two lotus stones), the other two asleep
  lake: {
    viewport: 'landscape',
    apply({ me, friend, camera, world, lake: Q }) {
      Q.open(true); Q.light(0, true);
      const c = world.lake.lakeCenter, [s0, s1] = world.lake.pairs[0].stones;
      place(me, world, s1.pos.x, s1.pos.z, -Math.PI / 2 - 0.3, { t: 2 });
      place(friend, world, s0.pos.x, s0.pos.z, -Math.PI / 2 + 0.3, { t: 3.1 });
      cam(camera, [c.x + 20, 8, c.z + 4], [c.x + 2, 0.5, c.z - 2], 50);
    },
  },
  // the heart awake, the stepping stones up, the rowboat out on the water (phone, portrait)
  'lake-heart': {
    viewport: 'portrait',
    apply({ me, friend, camera, world, lake: Q }) {
      Q.open(true); [0, 1, 2].forEach((i) => Q.light(i, true));
      Q.boat.riding = true; Q.boat.t = Q.rideDur * 0.42; // out on the far side
      const L = world.lake, st = L.steps.map((s) => L.toWorld(s.x, s.z)), c = L.lakeCenter;
      const h = Math.atan2(c.x - st[0].x, c.z - st[0].z);
      place(me, world, st[1].x, st[1].z, h, { speed: 1, t: 2 });
      place(friend, world, st[0].x, st[0].z, h, { speed: 1, t: 2.4 });
      const back = { x: st[0].x - Math.sin(h) * 5.5, z: st[0].z - Math.cos(h) * 5.5 };
      cam(camera, [back.x, 4.6, back.z], [c.x, 2.4, c.z], 62);
    },
  },
  // the hidden sunflower garden on the meadow island
  garden: {
    viewport: 'landscape',
    apply({ me, friend, camera, world, secrets: S }) {
      const g = S.gardenCenter;
      place(me, world, g.x + 3.0, g.z + 0.6, -Math.PI / 2 - 0.2, { t: 2 });
      place(friend, world, g.x + 3.1, g.z - 0.6, -Math.PI / 2 + 0.2, { t: 3.1 });
      cam(camera, [g.x + 8.5, g.y + 2.6, g.z + 2.4], [g.x, g.y + 1.2, g.z], 46);
    },
  },
};
