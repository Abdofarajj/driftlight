// Fixed camera shots for the look loop (tools/capture.mjs). Each one mirrors a reference image.
// viewport: 'portrait' = iPhone 15 Pro 393x852 @3x, 'landscape' = 852x393 @3x.

function place(t, world, x, z, heading, opts = {}) {
  const y = (opts.y !== undefined ? world.floorAt(x, z, opts.y) : world.floorAt(x, z)) ?? 0; // opts.y: on overlapping floors, the one at this height
  t.root.position.set(x, y + (opts.lift || 0), z);
  t.root.rotation.y = heading;
  t.animate(0.016, opts.t ?? 2, opts.speed ?? 0, !!opts.air, !!opts.glide);
}

/** the two of them holding hands (side: which side of `me` the friend is on); takes effect from the next frame */
function hold(me, friend, side) {
  me.holdSide = side; friend.holdSide = -side;
  for (const t of [me, friend]) {
    t.holdAmt = 1; t.holdAim = true;
    me.constructor.holdPoint(me.root.position, me.root.rotation.y, friend.root.position, friend.root.rotation.y, t.holdAt);
  }
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
  // ref: lantern-forest.png again, from outside the rim: the island's edge (turf lip, vines, rock) and the bridge
  edge: {
    viewport: 'landscape', ref: 'lantern-forest.png',
    apply({ me, friend, camera, world }) {
      place(me, world, 14.5, 7.2, Math.PI * 0.55);
      place(friend, world, 14.8, 8.4, Math.PI * 0.55, { t: 3.1 });
      cam(camera, [31, 12, 26], [12, -2.5, 6], 46);
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

  // holding hands, from the front and from behind (the usual play view)
  hands: {
    viewport: 'landscape',
    apply({ me, friend, camera, world }) {
      place(me, world, 0.62, 9.0, 0.12);
      place(friend, world, 1.58, 9.0, -0.12, { t: 3.1 });
      hold(me, friend, 1);
      const y = world.floorAt(1.1, 9) ?? 0;
      cam(camera, [1.1, y + 1.3, 12.2], [1.1, y + 0.85, 9], 34);
    },
  },
  'hands-back': {
    viewport: 'portrait',
    apply({ me, friend, camera, world }) {
      place(me, world, 0.62, 9.0, Math.PI, { speed: 0.8 });
      place(friend, world, 1.58, 9.0, Math.PI, { t: 3.1, speed: 0.8 });
      hold(me, friend, -1);
      const y = world.floorAt(1.1, 9) ?? 0;
      cam(camera, [2.6, y + 2.5, 15.2], [1.1, y + 0.6, 9], 34);
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
  // the Sunset Desert from above the bridge: the spirit's nest, the city wall and the Windy Pass, the plaza beyond
  desert: {
    viewport: 'landscape',
    apply({ me, friend, camera, world, desert: Q }) {
      Q.open(true);
      const D = world.desert, c = D.center, a = D.arrive, n = D.nestPos;
      const h = Math.atan2(n.x - a.x, n.z - a.z);
      place(me, world, n.x - 2.2, n.z + 1.6, h + 0.5, { t: 2 });
      place(friend, world, n.x - 2.6, n.z + 2.6, h + 0.3, { t: 3.1 });
      cam(camera, [c.x - 24, 17, c.z + 25], [c.x - 1, 2.5, c.z - 3], 50);
    },
  },
  // in the Windy Pass as a gust blows: sheltering behind a wall, the little sun above your joined hands
  'desert-pass': {
    viewport: 'landscape',
    apply({ me, friend, camera, world, desert: Q }) {
      Q.open(true);
      const D = world.desert, s = D.shelters[0];
      Q.g = 2.9 + 1.3 + 0.7; // mid-gust
      Q.sun.state = 1; Q.sun.pos.set(s.x - 0.2, s.y + 2.0, s.z + 0.9); Q.sun.yaw = Math.PI;
      place(me, world, s.x + 0.45, s.z, Math.PI, { t: 2 });
      place(friend, world, s.x - 0.5, s.z, Math.PI, { t: 2.6 });
      hold(me, friend, -1);
      cam(camera, [s.x + 2.4, s.y + 4.6, s.z + 10], [s.x - 0.2, s.y + 0.8, s.z - 4], 50);
    },
  },
  // the little sun home on the sundial, the dial lit and the sun gate open (phone, portrait)
  'desert-dial': {
    viewport: 'portrait',
    apply({ me, friend, camera, world, desert: Q }) {
      Q.open(true); Q.finish(true);
      const D = world.desert, p = D.dialPos;
      place(me, world, p.x - 2.6, p.z - 1.3, 0.75, { t: 2 });
      place(friend, world, p.x - 1.7, p.z - 2.0, 0.75, { t: 3.1 });
      hold(me, friend, 1);
      cam(camera, [p.x - 6.5, p.y + 3.2, p.z - 6.0], [p.x + 3.5, p.y + 1.4, p.z + 4.5], 62);
    },
  },
  // the hidden oasis, through the broken arch
  oasis: {
    viewport: 'landscape',
    apply({ me, friend, camera, world }) {
      const D = world.desert, o = D.oasisWorld, a = D.oasisArch;
      place(me, world, o.x + 0.45, o.z + 2.5, Math.PI + 0.25, { t: 2 }); // on the far side of the pool, facing you
      place(friend, world, o.x - 0.45, o.z + 2.6, Math.PI - 0.25, { t: 3.1 });
      cam(camera, [a.x + 1.0, a.y + 8.0, a.z - 5.5], [o.x - 0.3, o.y, o.z + 0.2], 50); // high over the arch: the pool shows
    },
  },
  // Whispering Hollow from the desert end of the old rope bridge: a dark island under its storm cloud
  hollow: {
    viewport: 'landscape',
    apply({ me, friend, camera, world, desert: D, hollow: Q }) {
      D.completeNow(); Q.open(true);
      const H = world.hollow, b = H.bridge.data, a = b.from, c = H.center;
      const h = Math.atan2(b.to.x - a.x, b.to.z - a.z);
      place(me, world, a.x + Math.sin(h) * 2.5 + 0.5, a.z + Math.cos(h) * 2.5, h, { t: 2 });
      place(friend, world, a.x + Math.sin(h) * 2.2 - 0.4, a.z + Math.cos(h) * 2.2 + 0.4, h, { t: 3.1 });
      hold(me, friend, 1);
      cam(camera, [a.x - Math.sin(h) * 6, a.y + 5.5, a.z - Math.cos(h) * 6], [c.x, c.y + 3, c.z], 50);
    },
  },
  // in the dark, hand in hand: your light is all there is, and shy shadows wait at its edge
  'hollow-dark': {
    viewport: 'landscape',
    apply({ me, friend, camera, world, desert: D, hollow: Q }) {
      D.completeNow(); Q.open(true);
      const H = world.hollow, L = H.lamps[0].pos, hrt = H.heart;
      const h = Math.atan2(hrt.x - L.x, hrt.z - L.z);
      const px = L.x + Math.sin(h) * 3.2, pz = L.z + Math.cos(h) * 3.2;
      place(me, world, px + Math.cos(h) * 0.45, pz - Math.sin(h) * 0.45, h, { t: 2 });
      place(friend, world, px - Math.cos(h) * 0.45, pz + Math.sin(h) * 0.45, h, { t: 3.1 });
      hold(me, friend, 1);
      [[2.4, -4.5], [-2.6, -5.5], [4.6, -2.0]].forEach(([sx, sz], i) => {
        const s = Q.shadows[i]; s.pos.set(px + Math.sin(h) * sz + Math.cos(h) * sx, (world.floorAt(px, pz) ?? 2) + 1.0, pz + Math.cos(h) * sz - Math.sin(h) * sx); s.look.set(px, 0, pz);
      });
      // from the heart side, looking back past you at the cold lamp, with the shy shadows behind you
      cam(camera, [px + Math.sin(h) * 6.5, (world.floorAt(px, pz) ?? 2) + 3.6, pz + Math.cos(h) * 6.5], [px - Math.sin(h) * 3, (world.floorAt(px, pz) ?? 2) + 1.0, pz - Math.cos(h) * 3], 50);
    },
  },
  // a lamp relit: a warm circle in the dark (phone, portrait)
  'hollow-lamp': {
    viewport: 'portrait',
    apply({ me, friend, camera, world, desert: D, hollow: Q }) {
      D.completeNow(); Q.open(true); Q.lightLamp(2, true);
      const H = world.hollow, L = H.lamps[2].pos, hrt = H.heart;
      const h = Math.atan2(L.x - hrt.x, L.z - hrt.z);
      const px = L.x - Math.sin(h) * 1.8, pz = L.z - Math.cos(h) * 1.8;
      place(me, world, px + Math.cos(h) * 0.45, pz - Math.sin(h) * 0.45, h, { t: 2 });
      place(friend, world, px - Math.cos(h) * 0.45, pz + Math.sin(h) * 0.45, h, { t: 3.1 });
      hold(me, friend, 1);
      const y = world.floorAt(px, pz) ?? 2;
      cam(camera, [px - Math.sin(h) * 6, y + 4, pz - Math.cos(h) * 6], [L.x, y + 1.2, L.z], 62);
    },
  },
  // ringing the bells: one of you on each stone, far apart in the dark
  'hollow-bells': {
    viewport: 'landscape',
    apply({ me, friend, camera, world, desert: D, hollow: Q }) {
      D.completeNow(); Q.open(true); [0, 1, 2].forEach((i) => Q.lightLamp(i, true));
      const H = world.hollow, B = H.bells[1];
      const toC = Math.atan2(H.heart.x - B.plate.x, H.heart.z - B.plate.z);
      place(me, world, B.plate.x, B.plate.z, toC + Math.PI, { t: 2 });
      place(friend, world, H.bells[0].plate.x, H.bells[0].plate.z, 0, { t: 3.1 });
      Q.plates = [true, true]; Q.ringT = 0.6; Q.rung = true;
      // high over the heart: the two of you far apart, one on each bell's stone, both bells swinging
      const c = H.heart;
      cam(camera, [c.x - 1.5, c.y + 17, c.z + 13], [c.x, c.y, c.z - 0.5], 56);
    },
  },
  // the Lonely Shadow circling in while you hold your light up at the heart
  'hollow-lonely': {
    viewport: 'landscape',
    apply({ me, friend, camera, world, desert: D, hollow: Q }) {
      D.completeNow(); Q.open(true); [0, 1, 2].forEach((i) => Q.lightLamp(i, true)); Q.ring(true);
      Q.lonely.state = 1; Q.lonely.k = 0.55; Q.lonely.ang = 2.2;
      const H = world.hollow, c = H.heart;
      place(me, world, c.x + 0.45, c.z + 0.6, Math.PI * 0.8, { t: 2 });
      place(friend, world, c.x - 0.45, c.z + 0.6, Math.PI * 0.8, { t: 3.1 });
      hold(me, friend, -1);
      cam(camera, [c.x + 3.2, c.y + 6.8, c.z + 7.2], [c.x - 0.6, c.y + 0.8, c.z - 1.2], 54);
    },
  },
  // after: the dark lifts to a soft dusk and the fireflies drift off to the way on
  'hollow-done': {
    viewport: 'landscape',
    apply({ me, friend, camera, world, desert: D, hollow: Q }) {
      D.completeNow(); Q.completeNow(); Q.flyT = 5.5;
      const H = world.hollow, c = H.heart, e = H.exit;
      const h = Math.atan2(e.x - c.x, e.z - c.z);
      place(me, world, c.x + Math.cos(h) * 0.45, c.z - Math.sin(h) * 0.45, h, { t: 2 });
      place(friend, world, c.x - Math.cos(h) * 0.45, c.z + Math.sin(h) * 0.45, h, { t: 3.1 });
      hold(me, friend, 1);
      cam(camera, [c.x - Math.sin(h) * 7, c.y + 5, c.z - Math.cos(h) * 7], [c.x + Math.sin(h) * 8, c.y + 1, c.z + Math.cos(h) * 8], 52);
    },
  },
  // the crooked house: the music box plays for the two of you
  musicbox: {
    viewport: 'landscape',
    apply({ me, friend, camera, world, desert: D, hollow: Q }) {
      D.completeNow(); Q.open(true);
      const H = world.hollow, i = H.houseInside, d = H.houseDoor;
      const h = Math.atan2(i.x - d.x, i.z - d.z);
      place(me, world, i.x + Math.cos(h) * 0.5, i.z - Math.sin(h) * 0.5, h, { t: 2 });
      place(friend, world, i.x - Math.cos(h) * 0.5, i.z + Math.sin(h) * 0.5, h, { t: 3.1 });
      Q.boxK = 1;
      // from inside, by the back corner: the two of you round the music box, the door behind you
      const c0 = H.houseAt(-1.45, 1.35, 2.05), c1 = H.houseAt(0.15, 0.1, 0.85);
      cam(camera, c0.toArray(), c1.toArray(), 72);
    },
  },
  // the Snowy Aurora Peak from the Hollow end of the stone bridge: a snowy island with a terraced mountain
  peak: {
    viewport: 'landscape',
    apply({ me, friend, camera, world, desert: D, hollow: HQ, peak: Q }) {
      D.completeNow(); HQ.completeNow(); Q.open(true);
      const K = world.peak, b = K.bridge.data, a = b.from, c = K.mc;
      const h = Math.atan2(b.to.x - a.x, b.to.z - a.z);
      place(me, world, a.x + Math.sin(h) * 3.0 + Math.cos(h) * 0.45, a.z + Math.cos(h) * 3.0 - Math.sin(h) * 0.45, h, { t: 2 });
      place(friend, world, a.x + Math.sin(h) * 3.0 - Math.cos(h) * 0.45, a.z + Math.cos(h) * 3.0 + Math.sin(h) * 0.45, h, { t: 3.1 });
      hold(me, friend, 1);
      cam(camera, [a.x - Math.sin(h) * 5, a.y + 4.5, a.z - Math.cos(h) * 5], [c.x, 7.5, c.z], 50);
    },
  },
  // a brazier lit on the first terrace, the frost step ahead (phone, portrait)
  'peak-brazier': {
    viewport: 'portrait',
    apply({ me, friend, camera, world, desert: D, hollow: HQ, peak: Q }) {
      D.completeNow(); HQ.completeNow(); Q.open(true); Q.lightBrazier(0, true); Q.lightBrazier(1, true);
      const K = world.peak, Z = K.braziers[1], cp = Z.checkpoint.pos, st = K.step.pos;
      const h = Math.atan2(st.x - cp.x, st.z - cp.z);
      place(me, world, cp.x + Math.cos(h) * 0.45, cp.z - Math.sin(h) * 0.45, h, { t: 2 });
      place(friend, world, cp.x - Math.cos(h) * 0.45, cp.z + Math.sin(h) * 0.45, h, { t: 3.1 });
      hold(me, friend, 1);
      // from behind the lit brazier, out over the edge of the terrace: the fire, the two of you, the frost step ahead
      const out = Math.atan2(Z.pos.x - K.mc.x, Z.pos.z - K.mc.z);
      cam(camera, [Z.pos.x - Math.sin(h) * 3.2 + Math.sin(out) * 3.0, cp.y + 3.6, Z.pos.z - Math.cos(h) * 3.2 + Math.cos(out) * 3.0], [st.x, cp.y + 1.0, st.z], 62);
    },
  },
  // jumping together onto the frost step: too tall for one, easy for two
  'peak-frost': {
    viewport: 'landscape',
    apply({ me, friend, camera, world, desert: D, hollow: HQ, peak: Q }) {
      D.completeNow(); HQ.completeNow(); Q.open(true); Q.lightBrazier(0, true); Q.lightBrazier(1, true);
      const K = world.peak, st = K.step.pos, Z = K.braziers[1].pos;
      const h = Math.atan2(st.x - Z.x, st.z - Z.z);
      const px = st.x - Math.sin(h) * 2.1, pz = st.z - Math.cos(h) * 2.1;
      place(me, world, px + Math.cos(h) * 0.45, pz - Math.sin(h) * 0.45, h, { t: 2, lift: 1.7, air: true });
      place(friend, world, px - Math.cos(h) * 0.45, pz + Math.sin(h) * 0.45, h, { t: 3.1, lift: 1.6, air: true });
      hold(me, friend, 1);
      const out = Math.atan2(st.x - K.mc.x, st.z - K.mc.z);
      cam(camera, [px - Math.sin(h) * 4.5 + Math.sin(out) * 3.2, st.y + 1.6, pz - Math.cos(h) * 4.5 + Math.cos(out) * 3.2], [st.x, st.y + 0.4, st.z], 54);
    },
  },
  // the aurora bell rung at the top: the bell swings and the aurora spreads over a starry sky
  'peak-bell': {
    viewport: 'landscape',
    apply({ me, friend, camera, world, desert: D, hollow: HQ, peak: Q }) {
      D.completeNow(); HQ.completeNow(); Q.completeNow(); Q.ringT = 1.2;
      const K = world.peak, c = K.summit;
      place(me, world, c.x + 0.45, c.z + 0.2, Math.PI, { t: 2, lift: 1.0, air: true });
      place(friend, world, c.x - 0.45, c.z + 0.2, Math.PI, { t: 3.1, lift: 0.95, air: true });
      hold(me, friend, -1);
      cam(camera, [c.x + 1.2, c.y + 1.6, c.z + 5.2], [c.x - 0.6, c.y + 5.5, c.z - 8], 62);
    },
  },
  // the log cabin: two mugs of cocoa by the fire, and their steam makes a heart
  cocoa: {
    viewport: 'landscape',
    apply({ me, friend, camera, world, desert: D, hollow: HQ, peak: Q }) {
      D.completeNow(); HQ.completeNow(); Q.open(true);
      const K = world.peak, a = K.cabinAt(0, 0), f = K.cabinAt(0, 1);
      const h = Math.atan2(f.x - a.x, f.z - a.z); // facing the hearth
      const p1 = K.cabinAt(-0.75, -0.45), p2 = K.cabinAt(0.75, -0.45);
      place(me, world, p1.x, p1.z, h, { t: 2 });
      place(friend, world, p2.x, p2.z, h, { t: 3.1 });
      Q.shotInside = true; Q.heartK = 1;
      // from the corner by the hearth: your faces, the little table, the mugs and their steam
      cam(camera, K.cabinAt(-1.75, 1.3, 2.0).toArray(), K.cabinAt(0.25, -0.35, 0.75).toArray(), 72);
    },
  },
  // ---- the Cloud Kingdom (round 10) ----
  // from the summit of the Snowy Peak: a stair of clouds rises west to the cloud tower, under the aurora
  'tower-steps': {
    viewport: 'landscape',
    apply({ me, friend, camera, world, desert: D, hollow: HQ, peak: Q, tower: TQ }) {
      D.completeNow(); HQ.completeNow(); Q.completeNow(); TQ.open(true);
      const T = world.tower, s0 = T.stepsFrom, s1 = T.stepAt(1), h = Math.atan2(s1.x - s0.x, s1.z - s0.z);
      const bx = s0.x - Math.sin(h) * 1.0, bz = s0.z - Math.cos(h) * 1.0;
      place(me, world, bx + Math.cos(h) * 0.45, bz - Math.sin(h) * 0.45, h, { t: 2, y: s0.y });
      place(friend, world, bx - Math.cos(h) * 0.45, bz + Math.sin(h) * 0.45, h, { t: 3.1, y: s0.y });
      hold(me, friend, -1);
      // from behind you on the summit, a little to the south of the bell's arch: the clouds climbing away to the tower
      const sx = Math.cos(h), sz = -Math.sin(h), mid = T.stepAt(3); // (sx, sz): sideways, away from the arch
      cam(camera, [bx - Math.sin(h) * 4 + sx * 1.5, s0.y + 2.6, bz - Math.cos(h) * 4 + sz * 1.5], [mid.x, mid.y - 1.2, mid.z], 60);
    },
  },
  // jumping across the last cloud steps: the island and its tower ahead (phone, portrait)
  tower: {
    viewport: 'portrait',
    apply({ me, friend, camera, world, desert: D, hollow: HQ, peak: Q, tower: TQ }) {
      D.completeNow(); HQ.completeNow(); Q.completeNow(); TQ.open(true);
      const T = world.tower, n = T.steps.length, a = T.stepAt(n - 3), b = T.stepAt(n - 2), h = Math.atan2(b.x - a.x, b.z - a.z);
      place(me, world, a.x + Math.cos(h) * 0.45 + Math.sin(h) * 0.6, a.z - Math.sin(h) * 0.45 + Math.cos(h) * 0.6, h, { t: 2, y: a.y + 0.7, lift: 0.7, air: true, glide: true });
      place(friend, world, a.x - Math.cos(h) * 0.45 + Math.sin(h) * 0.6, a.z + Math.sin(h) * 0.45 + Math.cos(h) * 0.6, h, { t: 3.1, y: a.y + 0.7, lift: 0.65, air: true, glide: true });
      hold(me, friend, -1);
      cam(camera, [a.x - Math.sin(h) * 5.2, a.y + 2.8, a.z - Math.cos(h) * 5.2], [T.center.x, a.y + 6.5, T.center.z], 66);
    },
  },
  // up the tower's ramp, holding hands: the bridge of light across the first gap holds for two
  'tower-bridge': {
    viewport: 'landscape',
    apply({ me, friend, camera, world, desert: D, hollow: HQ, peak: Q, tower: TQ }) {
      D.completeNow(); HQ.completeNow(); Q.completeNow(); TQ.open(true); TQ.bridge = 1;
      const T = world.tower, f = (T.gaps[0][0] + T.gaps[0][1]) / 2, p = T.rampAt(f), q = T.rampAt(f + 0.02), h = Math.atan2(q.x - p.x, q.z - p.z);
      const a = T.rampAt(f, -0.45), b = T.rampAt(f, 0.45);
      place(me, world, a.x, a.z, h, { t: 2, y: a.y, speed: 0.6 });
      place(friend, world, b.x, b.z, h, { t: 3.1, y: b.y, speed: 0.6 });
      hold(me, friend, 1);
      // from out in the air beside the tower: the two of you crossing the gap on the light
      const out = T.rampAt(f - 0.06, 9);
      cam(camera, [out.x, p.y + 4.5, out.z], [p.x, p.y + 0.6, p.z], 50);
    },
  },
  // the beacon lit at the top of the tower: the sun comes up, and every island sends up a beam of light
  'tower-beacon': {
    viewport: 'landscape',
    apply({ me, friend, camera, world, desert: D, hollow: HQ, peak: Q, tower: TQ }) {
      D.completeNow(); HQ.completeNow(); Q.completeNow(); TQ.completeNow(); TQ.litT = -14;
      const T = world.tower, c = T.beacon.pos, h = Math.atan2(c.x - (c.x + 1), c.z - (c.z + 2.2));
      place(me, world, c.x + 1.0 + Math.cos(h) * 0.45, c.z + 1.9 - Math.sin(h) * 0.45, h, { t: 2, y: c.y });
      place(friend, world, c.x + 1.0 - Math.cos(h) * 0.45, c.z + 1.9 + Math.sin(h) * 0.45, h, { t: 3.1, y: c.y });
      hold(me, friend, 1);
      cam(camera, [c.x + 5.5, c.y + 3.2, c.z + 8.5], [c.x - 1.5, c.y + 4.5, c.z - 3], 58);
    },
  },
  // the lookout bench (secret 9): the two of you looking back over everywhere you've been
  lookout: {
    viewport: 'landscape',
    apply({ me, friend, camera, world, desert: D, hollow: HQ, peak: Q, tower: TQ }) {
      D.completeNow(); HQ.completeNow(); Q.completeNow(); TQ.completeNow(); TQ.litT = -30;
      const T = world.tower, L = T.lookout, B = T.bench, h = Math.atan2(L.x - B.x, L.z - B.z);
      place(me, world, L.x + Math.cos(h) * 0.45, L.z - Math.sin(h) * 0.45, h, { t: 2 });
      place(friend, world, L.x - Math.cos(h) * 0.45, L.z + Math.sin(h) * 0.45, h, { t: 3.1 });
      hold(me, friend, 1);
      cam(camera, [B.x - Math.sin(h) * 3.2, B.y + 2.4, B.z - Math.cos(h) * 3.2], [L.x + Math.sin(h) * 30, L.y - 10, L.z + Math.cos(h) * 30], 54);
    },
  },
  // the closing card over the sunrise (with the HUD)
  ending: {
    viewport: 'portrait', ui: true,
    apply({ me, friend, camera, world, desert: D, hollow: HQ, peak: Q, tower: TQ, ending }) {
      D.completeNow(); HQ.completeNow(); Q.completeNow(); TQ.completeNow(); TQ.litT = -14;
      const T = world.tower, c = T.beacon.pos;
      place(me, world, c.x + 1.2, c.z + 1.6, Math.PI * 0.8, { t: 2, y: c.y });
      place(friend, world, c.x + 2.0, c.z + 1.1, Math.PI * 0.8, { t: 3.1, y: c.y });
      cam(camera, [c.x + 7, c.y + 4, c.z + 7.5], [c.x, c.y + 4, c.z], 66);
      ending();
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
