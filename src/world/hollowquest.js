// Whispering Hollow quest (round 8): "Find the way out of the dark".
// The old rope bridge rises from the desert's sun terrace once the little sun is home. In the Hollow it's
// dark: your two lanterns are the only light, and holding hands makes one bigger circle (main.js
// updateLights). Shy shadows drift towards whoever is alone in the dark and cling to them, dimming their
// lantern; if it goes out you wake by the last lamp you lit. They shrink back from joined hands and keep
// out of a lit lamp's circle. Nothing chases you fast and nothing jumps out.
// 1. Relight the 3 lamp posts: stand by each together, holding hands. Each lit lamp is a checkpoint.
// 2. Ring the two bells on opposite sides at the same moment: one of you on each bell's stone.
// 3. Stand together at the heart holding hands while the Lonely Shadow circles in, until it turns into
//    fireflies. The dark lifts to a soft dusk and the fireflies light the way on.
// Secret: the crooked house's music box plays only when you both stand inside.
// Online the host keeps the score (bridge, lamps, bells, the Lonely Shadow) and moves the shy shadows;
// each of you dims and relights your own lantern from the shadows you see.
import { Vector3, Matrix4, Quaternion } from 'three';

const RISE = 5.0;        // seconds for the rope bridge to rise
const LAMP_R = 2.7;      // stand this near a lamp post, holding hands, to relight it
const LAMP_T = 1.3;      // seconds it takes
const POOL = 6.0;        // a lit lamp's safe circle: shadows keep out, lanterns recover
const PLATE_R = 1.1;     // standing on a bell's stone
const HEART_IN = 2.8;    // stand together this near the heart stone
const LONELY_T = 9.0;    // seconds of holding your light up for the Lonely Shadow to come all the way in
const DIM = 0.06;        // lantern lost per second for each shadow clinging to you (at most two count)
const RECOVER = 0.45;    // lantern regained per second while you're safe
const SEE = 13;          // shadows notice someone alone in the dark this far away
const CLING = 1.2;       // how close a clinging shadow hovers
const CREEP = 0.85;      // how fast they drift towards you (m/s): slower than walking
const SHY = 7.0;         // joined hands keep them this far away
const LIFT = 4.0;        // seconds for the dark to lift at the end
const flat = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

export class HollowQuest {
  constructor(world, events, secrets, desertQuest) {
    this.H = world.hollow; this.events = events; this.secrets = secrets; this.desertQuest = desertQuest;
    this.remote = false;   // guest: the host keeps the score and moves the shadows
    this.opened = false; this.rise = 0;
    this.lamps = this.H.lamps.map(() => ({ lit: false, k: 0 }));
    this.rung = false; this.ringT = -99; this.plates = [false, false]; this.plateT = [-99, -99];
    this.lonely = { state: 0, k: 0, ang: 0 }; // 0 waiting, 1 circling in, 2 turned to fireflies
    this.done = false; this.lift = 0;
    this.lv = [1, 1];      // lantern level: you, your partner (online: as they last told us)
    this.clinging = [0, 0];
    this.hinted = { dark: false, dim: -99, dimFriend: -99, bell: -99 };
    this.boxK = 0; this.boxPlaying = false; this.boxT = -99;
    this.flyT = 0;
    this.lastLamp = -1;  // where you wake if your lantern goes out
    this.shadows = this.H.shadowHomes.map((h, i) => ({ pos: h.clone().setY(h.y + 1.0), home: h.clone(), vel: new Vector3(), shy: 0, k: 1, ph: i * 1.7, net: null, look: new Vector3() }));
    this._v = new Vector3(); this._m = new Matrix4(); this._q = new Quaternion(); this._s = new Vector3(); this._p = new Vector3(); this.mid = new Vector3();
  }

  get count() { return this.lamps.filter((l) => l.lit).length; }
  /** how dark the Hollow is now: 1 = dark, lifting to a soft dusk once the Lonely Shadow is comforted */
  get darkness() { return 1 - 0.55 * this.lift; }

  /** a traveler alone in the dark, where the shadows can reach them */
  lonelyAt(act, linked) {
    if (linked || this.done || this.H.darkAt(act.pos) < 0.6 || !this.H.onIsland(act.pos)) return false;
    return !this.H.lamps.some((L, i) => this.lamps[i].lit && flat(act.pos, L.pos) < POOL);
  }

  update(dt, t, a, b, linked, own, camera) {
    const H = this.H;
    this.lastT = t;
    // ---- the old rope bridge rises once the little sun is home ----
    if (!this.opened && this.desertQuest.done && !this.remote) this.open(false);
    if (this.opened && this.rise < 1) {
      this.rise = Math.min(1, this.rise + dt / RISE);
      H.bridge.setRise(this.rise);
      if (this.rise >= 1) this.events.emit('hollow-open', { quiet: false });
    }
    if (!this.hinted.dark && this.opened && H.darkAt(a.pos) > 0.7 && H.onIsland(a.pos)) { this.hinted.dark = true; this.events.emit('hollow-dark', {}); }

    // ---- the lamps (host): stand by one together, holding hands ----
    const both = (p, r) => flat(a.pos, p) < r && flat(b.pos, p) < r && Math.abs(a.pos.y - p.y) < 1.5 && Math.abs(b.pos.y - p.y) < 1.5;
    this.lamps.forEach((L, i) => {
      if (L.lit) return;
      const charging = !this.remote && this.opened && linked && both(H.lamps[i].pos, LAMP_R);
      L.k = charging ? Math.min(1, L.k + dt / LAMP_T) : Math.max(0, L.k - dt * 0.8);
      if (L.k >= 1) this.lightLamp(i, false);
    });

    // ---- the bells (host): one of you on each stone at the same moment ----
    if (!this.remote && this.opened) {
      H.bells.forEach((B, i) => {
        const on = [a, b].some((act) => flat(act.pos, B.plate) < PLATE_R && Math.abs(act.pos.y - B.plate.y) < 1.2);
        if (on && !this.plates[i]) { this.plateT[i] = t; if (!this.rung) this.events.emit('bell-step', { i, pos: B.pos }); }
        this.plates[i] = on;
      });
      if (!this.rung && this.plates[0] && this.plates[1]) this.ring(false, t);
    }

    // ---- the Lonely Shadow (host): it comes once the lamps burn and the bells have rung ----
    const Lo = this.lonely;
    if (!this.remote && Lo.state === 0 && this.rung && this.count === this.lamps.length) { Lo.state = 1; this.events.emit('lonely-come', { quiet: false, pos: H.heart }); }
    if (!this.remote && Lo.state === 1) {
      const held = linked && both(H.heart, HEART_IN);
      Lo.k = held ? Math.min(1, Lo.k + dt / LONELY_T) : Math.max(0, Lo.k - dt * 0.12);
      if (Lo.k >= 1) this.finish(false);
    }
    if (this.done && this.lift < 1) this.lift = Math.min(1, this.lift + dt / LIFT);

    // ---- shy shadows (host / solo): drift towards whoever is alone in the dark ----
    this.mid.copy(a.pos).add(b.pos).multiplyScalar(0.5);
    if (!this.remote) this.moveShadows(dt, t, [a, b], linked);
    else for (const s of this.shadows) { if (this.done) s.k = Math.max(0, s.k - dt * 0.6); if (s.net) s.pos.lerp(s.net, Math.min(1, dt * 6)); }

    // ---- your own lantern (and, playing alone, your partner's) ----
    own.forEach((act) => {
      const i = act === a ? 0 : 1;
      let n = 0;
      if (this.lonelyAt(act, linked)) for (const s of this.shadows) if (s.k > 0.5 && this._v.subVectors(s.pos, act.pos).setY(0).length() < CLING + 0.35) n++;
      this.clinging[i] = n;
      if (n > 0) {
        this.lv[i] = Math.max(0, this.lv[i] - DIM * Math.min(2, n) * dt);
        const key = i === 0 ? 'dim' : 'dimFriend';
        if (t - this.hinted[key] > 14) { this.hinted[key] = t; this.events.emit('lantern-dim', { who: i === 0 ? 'me' : 'friend' }); }
        if (this.lv[i] <= 0) { this.lv[i] = 1; this.events.emit('lantern-out', { who: i === 0 ? 'me' : 'friend', pos: act.pos.clone() }); }
      } else this.lv[i] = Math.min(1, this.lv[i] + RECOVER * dt * (this.lonelyAt(act, linked) ? 0.25 : 1));
    });

    // ---- the music box: it plays when you both stand inside the crooked house ----
    const inA = H.inHouse(a.pos), inside = inA && H.inHouse(b.pos);
    for (const r of H.roofs) { r.visible = !inA; r.userData.lifted = inA; } // lift the roof off while you're in (and the camera ray ignores it)
    if (inside && !this.boxPlaying && t - this.boxT > 2) { this.boxPlaying = true; this.boxT = t; this.events.emit('music-box', { pos: H.houseWorld }); if (!this.secrets.items[6].found) this.secrets.take(6); }
    if (!inside && this.boxPlaying && t - this.boxT > 6) this.boxPlaying = false;
    this.boxK += ((this.boxPlaying ? 1 : 0) - this.boxK) * Math.min(1, dt * 3);

    this.animate(dt, t, camera);
  }

  moveShadows(dt, t, acts, linked) {
    const H = this.H;
    for (const s of this.shadows) {
      if (this.done) { s.k = Math.max(0, s.k - dt * 0.6); continue; }
      // the nearest traveler alone in the dark, if any
      let target = null, best = SEE;
      for (const act of acts) { if (!this.lonelyAt(act, linked)) continue; const d = flat(s.pos, act.pos); if (d < best) { best = d; target = act; } }
      const pairNear = linked && flat(s.pos, this.mid) < SHY && H.darkAt(this.mid) > 0.3;
      s.shy += ((pairNear ? 1 : 0) - s.shy) * Math.min(1, dt * 3);
      const v = this._v.set(0, 0, 0);
      if (pairNear) { // joined hands: back away into the dark
        v.subVectors(s.pos, this.mid).setY(0);
        if (v.lengthSq() < 1e-4) v.set(1, 0, 0);
        v.normalize().multiplyScalar(2.2);
      } else if (target) { // creep closer, then hover just beside them
        v.subVectors(target.pos, s.pos).setY(0);
        const d = v.length();
        if (d > CLING) v.multiplyScalar(Math.min(CREEP, (d - CLING) * 2) / d);
        else v.set(-v.z, 0, v.x).normalize().multiplyScalar(0.35); // a slow sideways circle
        s.look.copy(target.pos);
      } else { // nobody alone: wander back towards home
        v.subVectors(s.home, s.pos).setY(0);
        const d = v.length();
        v.multiplyScalar(d > 0.5 ? Math.min(0.6, d) / d : 0);
        v.x += Math.sin(t * 0.4 + s.ph) * 0.25; v.z += Math.cos(t * 0.33 + s.ph * 1.3) * 0.25;
      }
      s.vel.lerp(v, Math.min(1, dt * 2.5));
      s.pos.addScaledVector(s.vel, dt);
      // keep out of lit lamps' circles and off the edge
      H.lamps.forEach((L, i) => {
        if (!this.lamps[i].lit) return;
        const dx = s.pos.x - L.pos.x, dz = s.pos.z - L.pos.z, d = Math.hypot(dx, dz);
        if (d < POOL + 0.4 && d > 1e-3) { s.pos.x = L.pos.x + (dx / d) * (POOL + 0.4); s.pos.z = L.pos.z + (dz / d) * (POOL + 0.4); }
      });
      const cx = s.pos.x - H.center.x, cz = s.pos.z - H.center.z, cd = Math.hypot(cx, cz), lim = H.radius - 2.5;
      if (cd > lim) { s.pos.x = H.center.x + (cx / cd) * lim; s.pos.z = H.center.z + (cz / cd) * lim; }
      const fy = H.floor(s.pos.x, s.pos.z) ?? s.home.y;
      s.pos.y += (fy + 1.0 + Math.sin(t * 1.6 + s.ph) * 0.12 - s.pos.y) * Math.min(1, dt * 3);
    }
  }

  open(quiet) {
    if (this.opened) return;
    this.opened = true;
    if (quiet) { this.rise = 1; this.H.bridge.setRise(1); }
    this.events.emit('hollow-bridge', { quiet });
  }

  lightLamp(i, quiet) {
    const L = this.lamps[i];
    if (L.lit) return;
    L.lit = true; L.k = 1;
    this.H.lamps[i].lit = true; this.lastLamp = i;
    this.events.emit('lamp-lit', { i, n: this.count, quiet, pos: this.H.lamps[i].head });
  }

  ring(quiet, t = 0) {
    if (this.rung) return;
    this.rung = true; this.ringT = quiet ? -99 : t;
    this.events.emit('bells-rung', { quiet, pos: this.H.heart, bells: this.H.bells.map((B) => B.pos) });
  }

  /** the Lonely Shadow came all the way in: it turns into fireflies and the dark lifts */
  finish(quiet) {
    if (this.done) return;
    this.done = true; this.lonely.state = 2; this.lonely.k = 1; this.flyT = 0;
    if (quiet) { this.lift = 1; for (const s of this.shadows) s.k = 0; }
    this.events.emit('hollow-done', { quiet, pos: this.H.heart, exit: this.H.exit });
  }

  /** tests and shots: everything done at once */
  completeNow() {
    this.open(true);
    this.lamps.forEach((_, i) => this.lightLamp(i, true));
    this.ring(true);
    this.finish(true);
  }

  // ---- online: the host's view of the score ----
  state() {
    const sh = [];
    for (const s of this.shadows) sh.push(Math.round(s.pos.x * 10) / 10, Math.round(s.pos.z * 10) / 10);
    return { o: this.opened ? 1 : 0, l: this.lamps.reduce((m, L, i) => m | (L.lit ? 1 << i : 0), 0), r: this.rung ? 1 : 0, ls: this.lonely.state, lk: Math.round(this.lonely.k * 100) / 100, s: sh };
  }
  applyState(q, quiet) {
    if (!q) return;
    if (q.o && !this.opened) this.open(quiet);
    this.lamps.forEach((_, i) => { if (q.l & (1 << i)) this.lightLamp(i, quiet); });
    if (q.r && !this.rung) this.ring(quiet, this.lastT ?? 0);
    if (q.ls >= 1 && this.lonely.state === 0) { this.lonely.state = 1; this.events.emit('lonely-come', { quiet, pos: this.H.heart }); }
    if (typeof q.lk === 'number' && this.lonely.state === 1) this.lonely.k = q.lk;
    if (q.ls === 2) this.finish(quiet);
    if (Array.isArray(q.s)) this.shadows.forEach((s, i) => {
      if (q.s[i * 2] === undefined) return;
      s.net = s.net || new Vector3();
      s.net.set(q.s[i * 2], s.pos.y, q.s[i * 2 + 1]);
      if (quiet) s.pos.copy(s.net);
    });
  }

  // ---- how it all looks ----
  animate(dt, t, camera) {
    const H = this.H;
    // from far away (the forest, the lake) the little moving things are too small to see: skip their draws
    const near = camera.position.distanceTo(H.center) < 110;
    if (near !== this._near) {
      this._near = near;
      for (const o of [...H.lamps.map((V) => V.flame), ...H.bells.map((B) => B.swing), ...H.wisps.map((w) => w.m), H.heartRing, H.lid, H.dancer, H.fog, H.toads]) o.visible = near;
    }
    if (!near) {
      for (const o of [...H.lamps.map((V) => V.ring), ...H.bells.map((B) => B.ring), ...H.shadows.map((c) => c.group), H.lonely.group, H.flies]) o.visible = false;
      return;
    }
    this.lastT = t;
    H.cloud.rotation.y += dt * 0.006;
    // lamps: a dim ember until lit; a soft ring while you're relighting one
    this.lamps.forEach((L, i) => {
      const V = H.lamps[i];
      V.flameMat.uniforms.uStr.value = L.lit ? 1.25 + Math.sin(t * 7 + i) * 0.05 + Math.sin(t * 13 + i * 2) * 0.03 : 0.5 + L.k * 0.75;
      V.light.str = L.lit ? 1.0 : L.k * 0.5;
      // a dim glow reads as a dark smudge, so rings below ~0.45 are hidden instead
      V.ring.visible = !L.lit && this.opened;
      V.ringMat.uniforms.uStr.value = 0.5 + L.k * 0.8 + Math.sin(t * 2 + i) * 0.05;
    });
    // bells: a little sway when stood on, a big swing when they ring
    H.bells.forEach((B, i) => {
      const rt = t - this.ringT, st = t - this.plateT[i];
      const big = rt >= 0 && rt < 8 ? Math.sin(rt * 5.2) * 0.42 * Math.exp(-rt * 0.45) : 0;
      const small = !this.rung && st >= 0 && st < 3 ? Math.sin(st * 6) * 0.09 * Math.exp(-st * 1.2) : 0;
      B.swing.rotation.x = big + small;
      B.ring.visible = !this.rung;
      B.ringMat.uniforms.uStr.value = this.plates[i] ? 1.1 : 0.55 + Math.sin(t * 1.5 + i * 2) * 0.08;
    });
    H.heartRing.material.uniforms.uStr.value = this.done ? 0.9 : 0.5 + this.lonely.k * 0.9 + (this.lonely.state === 1 ? Math.sin(t * 3) * 0.1 : 0);
    // wisps bob between the trees
    for (const w of H.wisps) {
      w.m.position.set(w.home.x + Math.sin(t * 0.5 + w.ph) * 0.8, w.home.y + Math.sin(t * 0.9 + w.ph * 2) * 0.35, w.home.z + Math.cos(t * 0.43 + w.ph) * 0.8); // local
    }
    // the shy shadows: bob, lean, look at whoever they're after, shrink when you hold hands
    this.shadows.forEach((s, i) => {
      const c = H.shadows[i];
      c.group.visible = s.k > 0.01;
      c.group.position.copy(s.pos).sub(H.center);
      const sc = 0.9 * (1 - 0.4 * s.shy) * s.k * (1 + Math.sin(t * 2.1 + s.ph) * 0.04);
      c.group.scale.set(sc, sc * (1 + Math.sin(t * 2.1 + s.ph + 1) * 0.05), sc);
      const lx = (s.look.lengthSq() > 0 ? s.look.x : camera.position.x) - s.pos.x, lz = (s.look.lengthSq() > 0 ? s.look.z : camera.position.z) - s.pos.z;
      c.group.rotation.y = Math.atan2(lx, lz);
      c.group.rotation.z = -s.vel.x * 0.12; c.tail.rotation.z = Math.sin(t * 2.4 + s.ph) * 0.18;
      c.eyes.scale.y = Math.sin(t * 0.7 + s.ph * 3) > 0.985 ? 0.15 : 1; // a slow blink now and then
    });
    // the Lonely Shadow circles in as you hold your light up
    const Lo = this.lonely, lc = H.lonely;
    lc.group.visible = Lo.state === 1;
    if (Lo.state === 1) {
      Lo.ang += dt * (0.45 + Lo.k * 0.3);
      const r = 9 - 7.0 * Lo.k;
      lc.group.position.set(H.heart.x - H.center.x + Math.cos(Lo.ang) * r, H.heart.y + 1.6 + Math.sin(t * 1.3) * 0.2, H.heart.z - H.center.z + Math.sin(Lo.ang) * r);
      lc.group.rotation.y = Math.atan2(-Math.cos(Lo.ang), -Math.sin(Lo.ang)); // it keeps looking at the heart
      lc.group.scale.setScalar(2.3 * (1 - Lo.k * 0.35) * (1 + Math.sin(t * 1.7) * 0.03));
      lc.eyes.scale.y = Math.sin(t * 0.6) > 0.98 ? 0.15 : 1;
    }
    // fireflies: a swarm bursting from the heart, then a lazy trail to the way on
    H.flies.visible = this.done;
    if (this.done) {
      this.flyT += dt;
      const n = H.flies.count, from = H.heart, to = H.exit;
      for (let i = 0; i < n; i++) {
        const k = i / n, ph = i * 2.39;
        const trail = Math.min(1, Math.max(0, (this.flyT - 2.5 - k * 2) / 3)); // they drift out along the path one by one
        const along = (k * 1.15) % 1;
        const px = from.x + (to.x - from.x) * along * trail, pz = from.z + (to.z - from.z) * along * trail;
        const swarm = (1 - trail) * Math.min(1, this.flyT * 1.5) * (1.2 + (i % 5) * 0.5);
        this._p.set(px + Math.cos(t * 0.8 + ph) * (swarm + 0.5), from.y + 1.0 + Math.sin(t * 1.1 + ph) * 0.5 + (1 - trail) * Math.sin(ph) * 1.2, pz + Math.sin(t * 0.7 + ph * 1.3) * (swarm + 0.5)).sub(H.center);
        const s = 0.8 + 0.4 * Math.sin(t * 6 + ph * 3);
        this._m.compose(this._p, this._q.identity(), this._s.set(s, s, s));
        H.flies.setMatrixAt(i, this._m);
      }
      H.flies.instanceMatrix.needsUpdate = true;
    }
    // low fog: soft billboards drifting over the ground, thinning as the dark lifts
    const camYaw = Math.atan2(camera.position.x - H.center.x, camera.position.z - H.center.z);
    H.fog.material.uniforms.uOp.value = 0.3 * (1 - 0.6 * this.lift);
    H.fogs.forEach((f, i) => {
      const x = f.x + Math.sin(t * f.sp + f.ph) * 1.5, z = f.z + Math.cos(t * f.sp * 0.8 + f.ph) * 1.5;
      this._p.set(x, H.groundY(x + H.center.x, z + H.center.z) + f.y, z);
      this._q.setFromAxisAngle(this._s.set(0, 1, 0), camYaw);
      this._m.compose(this._p, this._q, this._s.set(f.s, f.s * 0.45, 1));
      H.fog.setMatrixAt(i, this._m);
    });
    H.fog.instanceMatrix.needsUpdate = true;
    // the music box: the lid opens and the little dancer turns
    H.lid.rotation.x = -0.25 - this.boxK * 0.95;
    H.dancer.rotation.y += dt * 3 * this.boxK;
    H.dancerMat.uniforms.uStr.value = 0.5 + this.boxK * 0.8;
  }
}
