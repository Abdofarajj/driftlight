// Cloud Kingdom quest (round 10, the finale): "Light the beacon".
// About ten seconds after the aurora bell rings, the aurora lifts a stair of cloud steps from the summit of the
// Snowy Peak, one cloud after another, rising west to the Cloud Kingdom. Jump from cloud to cloud; a big resting
// cloud halfway has a waystone. Slip off and fall a long way, and you wake by the last checkpoint.
// On the island the tower's ramp winds up round it, broken in three places. A bridge of light spans each gap, but it
// only holds while you hold hands. At the top, stand by the beacon together, holding hands, and it lights: its beam
// rises, the sun comes up, every island sends up a beam of light, and the closing card appears (main.js).
// Secret: the lookout bench on the rim, found when you both stand at it. Star 8 waits over three little cloud puffs.
// Online the host keeps the score (the cloud steps, the beacon); the bridges of light follow your joined hands,
// which both screens already share.

const OPEN_DELAY = 12;   // seconds after the aurora bell before the cloud steps start to form
const FORM_EACH = 0.4;   // a new cloud every this many seconds
const FORM_T = 0.9;      // seconds for one cloud to form
const BRIDGE_UP = 1.8, BRIDGE_DOWN = 0.9; // the bridges of light: how fast they light while you hold hands, and fade
const BEACON_R = 2.6;    // stand this near the beacon, together, holding hands...
const BEACON_T = 3.0;    // ...for this long
const SUN_DELAY = 1.5, SUN_T = 9; // the sunrise: starts a moment after the beacon catches, takes this long
const FALL = 6;          // falling this far off the cloud steps (or the island) takes you back to the last checkpoint
const flat = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const clamp01 = (x) => Math.max(0, Math.min(1, x));

export class TowerQuest {
  constructor(world, events, secrets, peakQuest) {
    this.T = world.tower; this.events = events; this.secrets = secrets; this.peakQuest = peakQuest;
    this.remote = false;     // guest: the host keeps the score
    this.opened = false; this.wait = 0; this.formT = 0;
    this.bridge = 0; this.bridgeOn = false;
    this.arrived = false;
    this.k = 0; this.lit = false; this.litT = -99; this.sun = 0;
    this.lastT = 0;
    this.groundY = [0, 0]; this.fromCloud = [false, false];
    this.hinted = { bridge: -99, bridgeGo: false, beacon: -99 };
    this.benchIn = false;
  }

  /** every cloud step has formed */
  get formed() { return this.opened && this.T.stepK[this.T.steps.length - 1] >= 1; }

  update(dt, t, a, b, linked, own, camera) {
    const T = this.T;
    this.lastT = t;
    T.setTime(t);
    // ---- the cloud steps form one after another, a little after the aurora bell (the host decides when) ----
    if (!this.opened && this.peakQuest.rung && !this.remote) { this.wait += dt; if (this.wait >= OPEN_DELAY) this.open(false); }
    if (this.opened && this.formT < 60) {
      this.formT += dt;
      for (let i = 0; i < T.steps.length; i++) {
        const k = clamp01((this.formT - i * FORM_EACH) / FORM_T);
        if (k > 0 && T.stepK[i] === 0 && this.formT < 30) this.events.emit('sfx', { name: 'cloudstep', pos: T.stepAt(i), k: i / (T.steps.length - 1) });
        T.stepK[i] = k;
      }
    }
    if (!this.arrived && this.opened && a.grounded && T.onIsland(a.pos)) { this.arrived = true; this.events.emit('tower-arrive', {}); }

    // ---- a long fall off the cloud steps or the island's rim: you wake by the last checkpoint ----
    own.forEach((act) => {
      const i = act === a ? 0 : 1;
      if (act.grounded) { this.groundY[i] = act.pos.y; this.fromCloud[i] = this.opened && (T.onCloud(act.pos) || T.onIsland(act.pos)); return; }
      if (this.fromCloud[i] && act.pos.y < this.groundY[i] - FALL && !T.onIsland(act.pos)) {
        this.groundY[i] = act.pos.y; this.fromCloud[i] = false;
        this.events.emit('tower-fall', { who: i === 0 ? 'me' : 'friend' });
      }
    });

    // ---- the bridges of light: they hold while you hold hands ----
    this.bridge = linked ? Math.min(1, this.bridge + dt * BRIDGE_UP) : Math.max(0, this.bridge - dt * BRIDGE_DOWN);
    const on = this.bridge > 0.35;
    if (on !== this.bridgeOn) {
      this.bridgeOn = on;
      T.setBridge(on);
      if (T.onTower(a.pos)) this.events.emit('sfx', { name: on ? 'lightbridge' : 'lightfade', pos: a.pos });
    }
    const gap = a.grounded ? T.nearGap(a.pos, 0.07) : -1;
    if (gap >= 0 && !linked && t - this.hinted.bridge > 14) { this.hinted.bridge = t; this.events.emit('tower-hint', { kind: 'bridge' }); }
    if (gap >= 0 && linked && !this.hinted.bridgeGo) { this.hinted.bridgeGo = true; this.events.emit('tower-hint', { kind: 'bridge-go' }); }

    // ---- the beacon (host): stand by it together, holding hands ----
    if (!this.lit) {
      const charging = !this.remote && linked && T.atTop(a.pos, BEACON_R) && T.atTop(b.pos, BEACON_R);
      this.k = charging ? Math.min(1, this.k + dt / BEACON_T) : Math.max(0, this.k - dt * 0.8);
      if (this.k >= 1) this.light(false, t);
      if (!linked && T.atTop(a.pos, BEACON_R) && t - this.hinted.beacon > 12) { this.hinted.beacon = t; this.events.emit('tower-hint', { kind: 'beacon' }); }
    }
    if (this.lit) this.sun = clamp01((t - this.litT - SUN_DELAY) / SUN_T);
    this.peakQuest.dawn = this.sun; // the aurora fades as the sun comes up

    // ---- the lookout bench (the secret): both of you at it ----
    const atBench = (act) => flat(act.pos, T.lookout) < 1.5 && Math.abs(act.pos.y - T.levelY) < 1;
    const both = atBench(a) && atBench(b);
    if (both && !this.benchIn) { this.benchIn = true; if (!this.secrets.items[8].found) this.secrets.take(8); }
    if (!both) this.benchIn = false;

    this.animate(dt, t, camera);
  }

  open(quiet) {
    if (this.opened) return;
    this.opened = true;
    if (quiet) { this.formT = 60; this.T.stepK.fill(1); }
    this.events.emit('tower-steps', { quiet });
  }

  light(quiet, t = this.lastT) {
    if (this.lit) return;
    this.lit = true; this.k = 1; this.litT = quiet ? t - 999 : t;
    if (quiet) this.sun = 1;
    this.events.emit('tower-beacon', { quiet, pos: this.T.beacon.head });
  }

  /** tests and shots: everything done at once */
  completeNow() { this.open(true); this.light(true); }

  // ---- online: the host's view of the score ----
  state() { return { o: this.opened ? 1 : 0, l: this.lit ? 1 : 0 }; }
  applyState(q, quiet) {
    if (!q) return;
    if (q.o && !this.opened) this.open(quiet);
    if (q.l && !this.lit) this.light(quiet, this.lastT);
  }

  // ---- how it all looks ----
  animate(dt, t, camera) {
    const T = this.T;
    if (this.opened && camera.position.distanceTo(T.center) < 170) T.animateSteps();
    // the waystone on the resting cloud shows once its cloud has formed
    T.rest.obj.visible = T.stepK[T.restIndex] >= 0.9;
    // the bridges of light: bright while you hold hands, a dotted line of sparks when you don't
    const bk = this.bridge * this.bridge * (3 - 2 * this.bridge);
    T.bridgeMat.uniforms.uK.value = bk;
    for (const l of T.bridgeLights) l.str = 0.6 * bk;
    // the beacon: a sleeping spark that brightens while you light it; lit, a big golden fire and a beam
    const B = T.beacon, lt = t - this.litT;
    B.spark.visible = !this.lit;
    B.ring.visible = !this.lit && this.opened;
    B.flames.visible = this.lit;
    if (!this.lit) {
      B.sparkMat.uniforms.uStr.value = 0.6 + Math.sin(t * 2.2) * 0.15 + this.k * 1.2;
      B.spark.scale.setScalar(1 + this.k * 0.8 + Math.sin(t * 2.2) * 0.05);
      B.ringMat.uniforms.uStr.value = 0.8 + this.k * 0.9 + Math.sin(t * 2) * 0.06;
      B.light.str = 0.25 + this.k * 0.6;
    } else {
      const pop = 1 + Math.max(0, 0.5 * Math.exp(-Math.max(0, lt) * 2));
      B.flames.scale.set(pop, pop * (1 + Math.sin(t * 9) * 0.08 + Math.sin(t * 15.3) * 0.05), pop);
      B.flames.rotation.y = t * 0.8;
      B.flameMat.uniforms.uStr.value = 1.5 + Math.sin(t * 7) * 0.06;
      B.light.str = 1.4;
    }
    // the tower's windows warm up once it's lit
    T.windowMat.uniforms.uStr.value = this.lit ? 0.7 + 0.6 * clamp01(lt / 3) : 0.7;
    // the beams of light: the beacon's first, then one from every island, one after another; after a while the
    // islands' beams settle to a soft glow
    T.beams.visible = this.lit;
    if (this.lit) {
      T.beamK[0] = clamp01((lt - 0.3) / 1.2);
      for (let i = 1; i < T.beamCount; i++) T.beamK[i] = clamp01((lt - 2.5 - (i - 1) * 0.6) / 1.5) * (1 - 0.7 * clamp01((lt - 40) / 12));
    }
  }
}
