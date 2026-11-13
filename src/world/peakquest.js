// Snowy Aurora Peak quest (round 9): "Ring the aurora bell".
// A stone bridge rises from the Hollow's far side a few seconds after the Lonely Shadow turns into fireflies.
// It's cold up here: a traveler on their own slowly loses their lantern to the cold (faster the higher you
// climb). Holding hands keeps you both warm, and so does a lit brazier's circle or the cabin. If a lantern
// goes out you wake by the last brazier you lit.
// 1. Light the 3 braziers up the mountain: stand by each together, holding hands. Each is a checkpoint.
// 2. Climb: the frost steps between the terraces are too tall for one; holding hands you jump higher
//    together (main.js sets Actor.boost on the peak).
// 3. With all three burning the bell's ice melts. It hangs too high for one: jump together under it.
//    The bell rings, the aurora spreads over the sky and the cold eases.
// Secret: the log cabin's two mugs of cocoa, found when you both step inside (their steam makes a heart).
// Online the host keeps the score (bridge, braziers, bell); each of you loses and regains your own warmth.
import { Vector3, Matrix4, Quaternion } from 'three';

const OPEN_DELAY = 4.0;  // seconds after the fireflies before the bridge starts to rise
const RISE = 5.0;        // seconds for the stone bridge to rise
const BRAZ_R = 2.6;      // stand this near a brazier, holding hands, to light it
const BRAZ_T = 1.5;      // seconds it takes
const WARM_R = 5.5;      // a lit brazier's warm circle
const COLD = [0.022, 0.04, 0.055, 0.07]; // lantern lost per second alone, by level: meadow, terrace, upper terrace, summit
const WARM = 0.35;       // lantern regained per second while warm
const BELL_R = 1.1;      // under the bell
const HEAD = 1.3;        // a traveler's head above their feet
const AUR_T = 7.0;       // seconds for the aurora to spread
const flat = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

export class PeakQuest {
  constructor(world, events, secrets, hollowQuest) {
    this.P = world.peak; this.events = events; this.secrets = secrets; this.hollowQuest = hollowQuest;
    this.remote = false;   // guest: the host keeps the score
    this.opened = false; this.wait = 0; this.rise = 0;
    this.braziers = this.P.braziers.map(() => ({ lit: false, k: 0, litT: -99 }));
    this.lastBrazier = -1;   // where you wake if the cold puts your lantern out
    this.rung = false; this.ringT = -99; this.aur = 0; this.melt = 0;
    this.lv = hollowQuest.lv;  // lantern levels are shared with the Hollow (you, your partner)
    this.cold = [0, 0];        // how cold each of you is right now (0 = warm)
    this.arrived = false;
    this.climbed = false;      // someone has stood on the frost step: its hint ring goes
    this.hinted = { cold: -99, coldFriend: -99, frost: -99, frostGo: false, bell: -99, brazier: -99 };
    this.cabinIn = false; this.cocoaT = -99; this.heartK = 0;
    this.lastT = 0;
    this._m = new Matrix4(); this._q = new Quaternion(); this._s = new Vector3(); this._p = new Vector3(); this._r = new Vector3(); this._u = new Vector3();
    // the mugs and the chimney top, for the steam (peak-local: the island's group only moves, never turns)
    const P = this.P;
    P.root.updateWorldMatrix(true, true);
    this.mugAt = P.mugs.map((m) => m.getWorldPosition(new Vector3()).sub(P.center));
    const ch = P.roofs[P.roofs.length - 1];
    this.chimneyAt = ch.getWorldPosition(new Vector3()).sub(P.center).setY(ch.getWorldPosition(new Vector3()).y + 0.9);
    this.tableAt = this.mugAt[0].clone().lerp(this.mugAt[1], 0.5);
    this.puffs = Array.from({ length: P.steam.count }, (_, i) => ({ ph: (i * 0.618) % 1, src: i < 8 ? i % 2 : 2 }));
  }

  get count() { return this.braziers.filter((b) => b.lit).length; }
  /** all three braziers burn: the bell's ice melts */
  get ready() { return this.count === this.braziers.length; }

  /** how fast a traveler is losing their lantern to the cold right now (0 = warm) */
  coldAt(act, linked) {
    const P = this.P;
    if (linked || this.rung || !P.onIsland(act.pos) || P.inCabin(act.pos)) return 0;
    for (let i = 0; i < P.braziers.length; i++) {
      const B = P.braziers[i];
      if (this.braziers[i].lit && flat(act.pos, B.pos) < WARM_R && Math.abs(act.pos.y - B.pos.y) < 3) return 0;
    }
    return COLD[P.level(act.pos)];
  }

  update(dt, t, a, b, linked, own, camera) {
    const P = this.P;
    this.lastT = t;
    // ---- the stone bridge rises a little after the Hollow's fireflies ----
    if (!this.opened && this.hollowQuest.done && !this.remote) { this.wait += dt; if (this.wait >= OPEN_DELAY) this.open(false); }
    if (this.opened && this.rise < 1) {
      this.rise = Math.min(1, this.rise + dt / RISE);
      P.bridge.setRise(this.rise);
      if (this.rise >= 1) this.events.emit('peak-open', { quiet: false });
    }
    if (!this.arrived && this.opened && P.onIsland(a.pos) && a.grounded && flat(a.pos, P.arrive) > 1.5) { this.arrived = true; this.events.emit('peak-arrive', {}); }

    // ---- the braziers (host): stand by one together, holding hands ----
    const both = (p, r) => flat(a.pos, p) < r && flat(b.pos, p) < r && Math.abs(a.pos.y - p.y) < 1.5 && Math.abs(b.pos.y - p.y) < 1.5;
    this.braziers.forEach((Z, i) => {
      if (Z.lit) return;
      const charging = !this.remote && this.opened && linked && both(P.braziers[i].pos, BRAZ_R);
      Z.k = charging ? Math.min(1, Z.k + dt / BRAZ_T) : Math.max(0, Z.k - dt * 0.8);
      if (Z.k >= 1) this.lightBrazier(i, false, t);
      // on your own by a cold brazier: say what it needs
      if (!linked && flat(a.pos, P.braziers[i].pos) < BRAZ_R && Math.abs(a.pos.y - P.braziers[i].pos.y) < 1.5 && t - this.hinted.brazier > 12) {
        this.hinted.brazier = t; this.events.emit('peak-hint', { kind: 'brazier' });
      }
    });

    // ---- the frost step: too tall for one ----
    const S = P.step;
    if (P.level(a.pos) === 1 && flat(a.pos, S.pos) < S.r + 1.4 && a.pos.y < S.top - 0.5) {
      if (!linked && t - this.hinted.frost > 14) { this.hinted.frost = t; this.events.emit('peak-hint', { kind: 'frost' }); }
      if (linked && !this.hinted.frostGo) { this.hinted.frostGo = true; this.events.emit('peak-hint', { kind: 'frost-go' }); }
    }
    if (!this.climbed && [a, b].some((act) => flat(act.pos, S.pos) < S.r && act.pos.y > S.top - 0.3)) this.climbed = true;

    // ---- the aurora bell: frozen until the braziers burn; a jump together under it rings it ----
    if (this.ready) this.melt = Math.min(1, this.melt + dt / 2.5);
    if (!this.rung) {
      const under = [a, b].filter((act) => flat(act.pos, P.bell.pos) < BELL_R + 0.6 && act.pos.y > P.levels[3] - 0.5);
      if (!this.remote && this.ready && linked && under.some((act) => flat(act.pos, P.bell.pos) < BELL_R && act.pos.y + HEAD >= P.bellRimY)) this.ring(false, t);
      // trying on your own (or before the ice melts): say why it doesn't ring
      if (under.includes(a) && !a.grounded && a.vel.y < 0 && t - this.hinted.bell > 9) {
        this.hinted.bell = t;
        this.events.emit('peak-hint', { kind: !this.ready ? 'frozen' : 'high' });
      }
    }
    if (this.rung) this.aur = Math.min(1, this.aur + dt / AUR_T);

    // ---- the cold: your own lantern (and, playing alone, your partner's) ----
    own.forEach((act) => {
      const i = act === a ? 0 : 1;
      const c = this.coldAt(act, linked);
      this.cold[i] = c;
      if (c > 0) {
        this.lv[i] = Math.max(0, this.lv[i] - c * dt);
        const key = i === 0 ? 'cold' : 'coldFriend';
        if (this.lv[i] < 0.8 && t - this.hinted[key] > 16) { this.hinted[key] = t; this.events.emit('cold-dim', { who: i === 0 ? 'me' : 'friend' }); }
        if (this.lv[i] <= 0) { this.lv[i] = 1; this.events.emit('lantern-out', { who: i === 0 ? 'me' : 'friend', pos: act.pos.clone(), zone: 'peak' }); }
      } else if (!this.hollowQuest.H.onIsland(act.pos)) this.lv[i] = Math.min(1, this.lv[i] + WARM * dt); // (in the Hollow, its shadows own your lantern)
    });

    // ---- the cabin: lift the roof off while you're in; two mugs of cocoa when you're both inside ----
    const inA = this.shotInside || P.inCabin(a.pos), inside = inA && P.inCabin(b.pos);
    for (const r of P.roofs) { r.visible = !inA; r.userData.lifted = inA; }
    if (inside && !this.cabinIn) {
      this.cabinIn = true;
      if (t - this.cocoaT > 6) { this.cocoaT = t; this.events.emit('cocoa', { pos: P.cabinWorld }); }
      if (!this.secrets.items[7].found) this.secrets.take(7);
    }
    if (!inside) this.cabinIn = false;
    this.heartK += ((inside ? 1 : 0) - this.heartK) * Math.min(1, dt * 1.5);

    this.animate(dt, t, camera);
  }

  open(quiet) {
    if (this.opened) return;
    this.opened = true;
    if (quiet) { this.rise = 1; this.P.bridge.setRise(1); }
    this.events.emit('peak-bridge', { quiet });
    if (quiet) this.events.emit('peak-open', { quiet });
  }

  lightBrazier(i, quiet, t = this.lastT) {
    const Z = this.braziers[i];
    if (Z.lit) return;
    Z.lit = true; Z.k = 1; Z.litT = quiet ? -99 : t;
    this.P.braziers[i].lit = true; this.lastBrazier = i;
    this.events.emit('brazier-lit', { i, n: this.count, quiet, pos: this.P.braziers[i].head });
  }

  ring(quiet, t = 0) {
    if (this.rung) return;
    this.rung = true; this.ringT = quiet ? -99 : t;
    if (quiet) { this.aur = 1; this.melt = 1; }
    this.events.emit('peak-bell', { quiet, pos: this.P.bell.pos.clone().setY(this.P.bellRimY) });
  }

  /** tests and shots: everything done at once */
  completeNow() {
    this.open(true);
    this.braziers.forEach((_, i) => this.lightBrazier(i, true));
    this.ring(true);
  }

  // ---- online: the host's view of the score ----
  state() {
    return { o: this.opened ? 1 : 0, b: this.braziers.reduce((m, Z, i) => m | (Z.lit ? 1 << i : 0), 0), r: this.rung ? 1 : 0 };
  }
  applyState(q, quiet) {
    if (!q) return;
    if (q.o && !this.opened) this.open(quiet);
    this.braziers.forEach((_, i) => { if (q.b & (1 << i)) this.lightBrazier(i, quiet); });
    if (q.r && !this.rung) this.ring(quiet, this.lastT);
  }

  // ---- how it all looks ----
  animate(dt, t, camera) {
    const P = this.P;
    // falling snow round the camera while it's over the peak
    const cd = Math.hypot(camera.position.x - P.center.x, camera.position.z - P.center.z);
    P.flakes.visible = cd < P.radius + 12;
    if (P.flakes.visible) this.snow(t, camera);
    // from far away the little moving things are too small to see: skip their draws
    const near = camera.position.distanceTo(P.center) < 110;
    P.aurora.setK(this.aur);
    if (!near) {
      for (const Z of P.braziers) { Z.fire.visible = false; Z.ring.visible = false; }
      P.steam.visible = false; P.stepHint.visible = false; P.hearthFire.visible = false; P.bell.ring.visible = false;
      return;
    }
    P.steam.visible = true; P.hearthFire.visible = true;
    // braziers: a cold bowl of snow; while you light one a small flame grows; lit, a big flickering fire
    this.braziers.forEach((Z, i) => {
      const V = P.braziers[i];
      const on = Z.lit || Z.k > 0.05;
      V.fire.visible = on;
      V.ash.visible = !Z.lit;
      if (on) {
        const pop = Z.lit ? 1 + Math.max(0, 0.35 * Math.exp(-(t - Z.litT) * 2.5)) : 0.35 + Z.k * 0.55;
        V.fire.scale.set(pop, pop * (1 + Math.sin(t * 9 + i) * 0.08 + Math.sin(t * 15.3 + i * 2) * 0.05), pop);
        V.fire.rotation.y = t * 0.9 + i;
      }
      V.fireMat.uniforms.uStr.value = Z.lit ? 1.3 + Math.sin(t * 7 + i) * 0.06 + Math.sin(t * 13 + i * 2) * 0.04 : 0.7 + Z.k * 0.6;
      V.light.str = Z.lit ? 1.05 : Z.k * 0.5;
      // the ring at its foot: while it's cold (a dim glow reads as a smudge, so it's hidden, not dimmed)
      V.ring.visible = !Z.lit && this.opened;
      V.ringMat.uniforms.uStr.value = 0.55 + Z.k * 0.8 + Math.sin(t * 2 + i) * 0.05;
    });
    // the frost step's hint ring, until someone has climbed it
    P.stepHint.visible = this.opened && !this.climbed;
    if (P.stepHint.visible) P.stepHint.material.uniforms.uStr.value = 1.0 + Math.sin(t * 2.2) * 0.1;
    // the bell: its ice melts once all three braziers burn; it swings big when it rings
    const B = P.bell;
    B.ice.visible = this.melt < 0.999;
    if (B.ice.visible) { const s = 1 + this.melt * 0.06; B.ice.scale.set(s, 1 - this.melt * 0.9, s); B.ice.position.y = -this.melt * 0.05; }
    const rt = t - this.ringT;
    B.swing.rotation.x = rt >= 0 && rt < 10 ? Math.sin(rt * 4.2) * 0.5 * Math.exp(-rt * 0.35) : (this.rung ? Math.sin(t * 0.6) * 0.03 : 0);
    B.ring.visible = this.ready && !this.rung;
    B.ringMat.uniforms.uStr.value = 1.0 + Math.sin(t * 2.4) * 0.1;
    B.light.str = this.rung ? 0.9 : this.ready ? 0.5 : 0;
    // the cabin: the hearth flickers, the mugs steam, the chimney smokes. Both inside: the steam makes a heart
    P.hearthFire.scale.y = 1 + Math.sin(t * 8) * 0.1 + Math.sin(t * 13.7) * 0.06;
    this.steamPuffs(t, camera);
  }

  /** soft snowflakes falling round the camera (they stay put in the world while the camera moves) */
  snow(t, camera) {
    const P = this.P, c = camera.position;
    this._q.copy(camera.quaternion);
    const wrap = (v, c0, span) => c0 + ((((v - c0) % span) + span * 1.5) % span) - span / 2;
    P.flakeData.forEach((f, i) => {
      const x = wrap(P.center.x + f.x * 2 + Math.sin(t * 0.6 + f.ph) * 0.7 + t * 0.3, c.x, 28);
      const z = wrap(P.center.z + f.z * 2 + Math.cos(t * 0.5 + f.ph * 1.3) * 0.7, c.z, 28);
      const y = wrap(f.y * 2 - t * f.sp, c.y, 14);
      this._m.compose(this._p.set(x, y, z), this._q, this._s.set(1, 1, 1));
      P.flakes.setMatrixAt(i, this._m);
    });
    P.flakes.instanceMatrix.needsUpdate = true;
  }

  steamPuffs(t, camera) {
    const P = this.P, n = P.steam.count;
    this._q.copy(camera.quaternion);
    this._r.setFromMatrixColumn(camera.matrixWorld, 0); this._u.setFromMatrixColumn(camera.matrixWorld, 1);
    const hk = this.heartK, roof = P.roofs[0].visible;
    for (let i = 0; i < n; i++) {
      const pf = this.puffs[i];
      const age = (t * (pf.src === 2 ? 0.22 : 0.35) + pf.ph) % 1;
      let s;
      if (pf.src < 2) { // mug steam: little wisps rising, gathering into a heart when you're both inside
        const m = this.mugAt[pf.src];
        this._p.set(m.x + Math.sin(t * 1.3 + i) * 0.04 * (1 + age * 2), m.y + 0.12 + age * 0.55, m.z + Math.cos(t * 1.1 + i) * 0.04);
        s = (0.12 + age * 0.3) * Math.sin(age * Math.PI);
        if (hk > 0.01) {
          const a = (i / 8) * Math.PI * 2 + t * 0.4;
          const hx = 16 * Math.sin(a) ** 3, hy = 13 * Math.cos(a) - 5 * Math.cos(2 * a) - 2 * Math.cos(3 * a) - Math.cos(4 * a);
          const k = 0.024;
          this._s.copy(this.tableAt).setY(this.tableAt.y + 0.85).addScaledVector(this._r, hx * k).addScaledVector(this._u, hy * k);
          this._p.lerp(this._s, hk);
          s += (0.55 - s) * hk;
        }
        if (roof && hk < 0.01) s *= 0.6; // from outside you barely see them
      } else { // chimney smoke: slow, big, drifting downwind
        const c = this.chimneyAt;
        this._p.set(c.x + age * 1.4 + Math.sin(t * 0.7 + i) * 0.15, c.y + age * 3.2, c.z - age * 0.6);
        s = (0.5 + age * 1.6) * Math.sin(Math.min(1, age * 1.4) * Math.PI * 0.5) * (1 - age * 0.6);
      }
      this._m.compose(this._p, this._q, this._s.set(s, s, s));
      P.steam.setMatrixAt(i, this._m);
    }
    P.steam.instanceMatrix.needsUpdate = true;
  }
}
