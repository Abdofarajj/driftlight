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
};
