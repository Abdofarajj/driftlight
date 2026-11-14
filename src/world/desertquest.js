// "Guide the lost sun spirit" (round 7, Sunset Desert). When the crystal heart wakes, a sandstone bridge
// rises from Crystal Lake to the desert. A little sun spirit sleeps in a stone bowl near the bridge. It
// only follows your shared light, so it comes along while you hold hands and stops to wait whenever you
// let go. Bring it through the Windy Pass, where a sand gust blows down every few seconds: out in the
// open a gust pushes you back and tears your hands apart, so wait behind a shelter wall together and go
// between gusts. At the sundial on the far side it flies home, the dial lights and the sun gate opens
// onto the terrace with the island's star. The oasis behind a broken arch is secret 6.
// Online, the host keeps the score and sends it over (state/applyState), like lakequest.js; each screen
// pushes its own traveler in a gust, on a gust clock the host keeps in step.
import { Vector3, Matrix4, Quaternion } from 'three';

const CALM = 2.9, WARN = 1.3, GUST = 1.8; // seconds: a gust every 6 s, with a warning first
const PERIOD = CALM + WARN + GUST;
const PUSH = 4.6;     // how hard a gust pushes you back down the pass (m/s)
const TEAR = 0.25;    // seconds out in a gust before it tears your hands apart
const PICK = 3.2;     // how near your joined hands must come to the little sun
const HOME = 2.9;     // how near the middle of the sundial to bring it
const RISE = 4.5;     // seconds for the sandstone bridge to rise
const FLY = 2.2;      // seconds for the little sun to fly onto the sundial
const GATE = 3.2;     // seconds for the sun gate to sink
export const SUN = { SLEEP: 0, FOLLOW: 1, WAIT: 2, HOME: 3 };
const flat = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

export function gustPhase(g) {
  const k = ((g % PERIOD) + PERIOD) % PERIOD;
  return k < CALM ? 'calm' : k < CALM + WARN ? 'warn' : 'gust';
}

export class DesertQuest {
  constructor(world, events, secrets, lakeQuest) {
    this.world = world; this.D = world.desert; this.events = events; this.secrets = secrets; this.lake = lakeQuest;
    this.remote = false;
    this.opened = false; this.rise = 0;
    this.gate = () => true; // the lake's keepsakes must be placed too (keepsakes.js)
    this.sun = { state: SUN.SLEEP, pos: this.D.nestPos.clone(), from: new Vector3(), homeK: 0, hintT: -99, blink: 0, yaw: 0, netPos: null };
    this.done = false; this.gateK = 0; this.gateDone = false;
    this.g = 0; this.phase = 'calm';
    this.exposed = 0; this.gustBroke = -99; this.tears = 0; this.passHinted = false;
    this.mid = new Vector3(); this.target = new Vector3(); this._v = new Vector3();
  }

  get phaseNow() { return this.phase; }
  /** seconds until the next gust starts blowing (for the bot) */
  get untilGust() { const k = ((this.g % PERIOD) + PERIOD) % PERIOD; return k < CALM + WARN ? CALM + WARN - k : PERIOD - k + CALM + WARN; }

  /**
   * a, b: you and your partner. pushed: the travelers this screen moves (both when playing alone, only
   * you online). breakHands(): let go of each other (and tell your partner online).
   */
  update(dt, t, a, b, linked, pushed, breakHands, camera) {
    const D = this.D, S = this.sun;
    this.lastT = t;
    // ---- the sandstone bridge: rises once the crystal heart is awake and its stepping stones are up ----
    if (!this.opened && !this.remote && this.lake.awake && this.lake.stepsDone && this.gate()) this.open(false);
    if (this.opened && this.rise < 1) {
      this.rise = Math.min(1, this.rise + dt / RISE);
      D.bridge.setRise(this.rise);
      if (this.rise >= 1) this.events.emit('desert-open', { quiet: false });
    }

    // ---- sand gusts in the Windy Pass (they settle for good once the little sun is home) ----
    this.g += dt;
    const ph = this.done ? 'calm' : gustPhase(this.g);
    if (ph !== this.phase) { this.phase = ph; if (dt > 0) this.events.emit('desert-gust', { phase: ph, pos: D.passMid }); }
    let tearing = false;
    for (const act of pushed) {
      if (!D.inPass(act.pos)) continue;
      if (!this.passHinted && act === a && !this.done) { this.passHinted = true; this.events.emit('desert-hint', { kind: 'pass' }); }
      if (ph !== 'gust' || D.sheltered(act.pos)) continue;
      const k = Math.min(1, dt * 6);
      act.vel.x += (0 - act.vel.x) * k;
      act.vel.z += (PUSH - act.vel.z) * k;
      act.inWind = true; // the cape streams, and your own steps only nudge
      if (linked) tearing = true;
    }
    this.exposed = tearing ? this.exposed + dt : 0;
    if (this.exposed > TEAR) { this.exposed = 0; this.gustBroke = t; this.tears++; breakHands(); }

    // ---- the little sun ----
    this.mid.copy(a.pos).add(b.pos).multiplyScalar(0.5);
    if (!this.remote) {
      if (S.state === SUN.SLEEP || S.state === SUN.WAIT) {
        if (linked && this.opened && flat(this.mid, S.pos) < PICK) this.setSun(SUN.FOLLOW, { first: S.state === SUN.SLEEP });
        else if (!linked && flat(a.pos, S.pos) < 3.6 && t - S.hintT > 9) { S.hintT = t; this.events.emit('desert-hint', { kind: 'hands', first: S.state === SUN.SLEEP }); }
      } else if (S.state === SUN.FOLLOW) {
        if (!linked) { S.hintT = t; this.setSun(SUN.WAIT, { why: t - this.gustBroke < 1.5 || ph === 'gust' ? 'gust' : 'let-go' }); } // its own toast first: the hands hint waits
        else if (flat(this.mid, D.dialPos) < HOME && Math.abs(this.mid.y - D.dialPos.y) < 1.5) this.setSun(SUN.HOME);
      }
    }
    if (S.state === SUN.FOLLOW) { // float just behind and above your joined hands
      const hx = Math.sin(a.heading), hz = Math.cos(a.heading);
      this.target.set(this.mid.x - hx * 1.0, Math.max(a.pos.y, b.pos.y) + 1.85, this.mid.z - hz * 1.0);
      this._v.subVectors(this.target, S.pos);
      const d = this._v.length(), step = Math.min(d * (1 - Math.exp(-dt * 4)), 9 * dt);
      if (d > 1e-4) S.pos.addScaledVector(this._v, step / d);
    } else if (S.state === SUN.HOME) {
      if (S.homeK < 1) {
        S.homeK = Math.min(1, S.homeK + dt / FLY);
        const k = S.homeK * S.homeK * (3 - 2 * S.homeK);
        S.pos.lerpVectors(S.from, D.sunHome, k);
        S.pos.y += Math.sin(k * Math.PI) * 2.2; // up and over onto the dial
        if (S.homeK >= 1) this.finish(false);
      }
    } else if (S.netPos) { // online guest: where the host's little sun is waiting
      this._v.fromArray(S.netPos);
      S.pos.lerp(this._v, 1 - Math.exp(-dt * 5));
    }
    this.secretCheck(a, b);

    // ---- the sun gate ----
    if (this.done && this.gateK < 1) {
      this.gateK = Math.min(1, this.gateK + dt / GATE);
      D.setGate(this.gateK);
      if (this.gateK >= 1 && !this.gateDone) { this.gateDone = true; this.events.emit('desert-gate', {}); }
    }
    this.animate(dt, t, camera);
  }

  secretCheck(a, b) {
    const it = this.secrets && this.secrets.items[5];
    if (it && !it.found && (this.D.inOasis(a.pos) || this.D.inOasis(b.pos))) this.secrets.take(5);
  }

  animate(dt, t, camera) {
    const D = this.D, S = this.sun, sp = D.spirit;
    // the little sun: sleepy in its bowl, bright when it follows you, pulsing when it waits, radiant at home
    const bob = S.state === SUN.SLEEP ? Math.sin(t * 1.2) * 0.04 : Math.sin(t * 2.2) * 0.12;
    sp.group.position.set(S.pos.x - D.center.x, S.pos.y + bob, S.pos.z - D.center.z);
    const home = S.state === SUN.HOME ? S.homeK : 0;
    sp.group.scale.setScalar((S.state === SUN.SLEEP ? 0.85 : 1) + home * 0.3);
    const str = S.state === SUN.SLEEP ? 0.62 + Math.sin(t * 1.2) * 0.06 : S.state === SUN.WAIT ? 0.85 + Math.sin(t * 5) * 0.2 : S.state === SUN.FOLLOW ? 1.1 : 1.1 + home * 0.1;
    sp.mat.uniforms.uStr.value = str;
    sp.light.str = S.state === SUN.SLEEP ? 0.4 : S.state === SUN.HOME ? 0.7 + home * 0.5 : 0.7;
    sp.rays.rotation.z += dt * (S.state === SUN.SLEEP ? 0.15 : S.state === SUN.WAIT ? 2.2 : 0.8);
    sp.rays.scale.setScalar(S.state === SUN.SLEEP ? 0.8 : 1 + home * 0.25 + (S.state === SUN.WAIT ? Math.sin(t * 5) * 0.08 : 0));
    // eyes: closed while asleep, a blink now and then
    S.blink -= dt;
    if (S.blink < -3 - (Math.sin(t * 7.3) + 1)) S.blink = 0.14;
    const open = S.state === SUN.SLEEP ? 0.18 : S.blink > 0 ? 0.25 : 1.35;
    for (const e of sp.eyes) e.scale.y = open;
    sp.smile.visible = S.state !== SUN.WAIT; // a little worried while it waits for you
    // face the two of you (or the way back down the plaza, once it's home)
    const look = S.state === SUN.HOME ? Math.PI * 0.0 : Math.atan2(this.mid.x - S.pos.x, this.mid.z - S.pos.z);
    let dy = look - S.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    S.yaw += dy * Math.min(1, dt * 4);
    sp.group.rotation.y = S.yaw;

    // the sundial warms as the little sun nears it, and lights up once it's home
    const near = S.state === SUN.FOLLOW ? Math.max(0, 1 - flat(S.pos, D.dialPos) / 10) : 0;
    D.dialMat.uniforms.uStr.value = this.done ? 1.25 + Math.sin(t * 2) * 0.07 : 0.3 + near * 0.5 + home * 0.9;
    D.dialLight.str = this.done ? 1.4 : near * 0.6;
    D.gateSunMat.uniforms.uStr.value = this.done ? 1.2 : 0.35;
    D.gateLight.str = this.done ? 1.0 : 0.25;

    // dust in the pass: a few puffs lift at the far end as a gust gathers, then a stream rushes down
    const ph = this.phase;
    const k = ((this.g % PERIOD) + PERIOD) % PERIOD;
    const op = ph === 'warn' ? 0.12 + 0.25 * (k - CALM) / WARN : ph === 'gust' ? 0.62 * Math.min(1, (CALM + WARN + GUST - k) / 0.5) : 0;
    D.dust.visible = op > 0.01;
    if (D.dust.visible && camera) {
      D.dustMat.uniforms.uOp.value = op;
      const P = D.pass, len = P.zIn - P.zOut + 2;
      const o = this._o || (this._o = { m: new Matrix4(), q: new Quaternion(), s: new Vector3(), p: new Vector3() });
      o.q.copy(camera.quaternion);
      D.puffs.forEach((pf, i) => {
        let z;
        if (ph === 'warn') z = P.zOut - 1 + ((pf.k + (k - CALM) * 0.25 * pf.sp) % 1) * 3; // swirling at the top of the pass
        else z = P.zOut - 1 + ((pf.k + (k - CALM - WARN) * 0.85 * pf.sp) % 1) * len;
        o.p.set(pf.x, 3.0 + pf.y + Math.sin(t * 3 + i) * 0.1, z - D.center.z);
        o.s.set(pf.sx * (ph === 'gust' ? 1.4 : 0.8), pf.sy * (ph === 'gust' ? 1 : 0.8), 1);
        o.m.compose(o.p, o.q, o.s);
        D.dust.setMatrixAt(i, o.m);
      });
      D.dust.instanceMatrix.needsUpdate = true;
    }
  }

  open(quiet) {
    if (this.opened) return;
    this.opened = true;
    if (quiet) { this.rise = 1; this.D.bridge.setRise(1); this.events.emit('desert-open', { quiet: true }); } else this.events.emit('desert-bridge', {});
  }

  setSun(state, o = {}) {
    const S = this.sun, was = S.state;
    if (was === state) return;
    S.state = state;
    if (state === SUN.FOLLOW) { S.netPos = null; this.events.emit('sun-follow', { first: !!o.first || was === SUN.SLEEP, quiet: o.quiet, pos: S.pos }); }
    else if (state === SUN.WAIT) this.events.emit('sun-wait', { why: o.why || 'let-go', quiet: o.quiet, pos: S.pos });
    else if (state === SUN.HOME) { S.from.copy(S.pos); S.homeK = 0; S.netPos = null; this.events.emit('sun-home', { quiet: o.quiet, pos: S.pos }); }
  }

  /** the little sun is on the sundial: the dial lights, the gusts settle and the sun gate opens */
  finish(quiet) {
    if (this.done) return;
    const S = this.sun;
    if (S.state !== SUN.HOME) { S.state = SUN.HOME; S.netPos = null; }
    S.homeK = 1; S.pos.copy(this.D.sunHome);
    this.done = true;
    if (quiet) { this.gateK = 1; this.gateDone = true; this.D.setGate(1); }
    this.events.emit('desert-sundial', { quiet, pos: this.D.dialPos });
  }

  /** host -> guest */
  state() {
    const S = this.sun, r = (v) => Math.round(v * 100) / 100;
    return {
      o: this.opened ? 1 : 0,
      s: S.state,
      p: S.state === SUN.FOLLOW ? 0 : [r(S.pos.x), r(S.pos.y), r(S.pos.z)],
      g: Math.round(this.g * 10) / 10,
      d: this.done ? 1 : 0,
    };
  }

  applyState(q, quiet) {
    if (!q) return;
    if (q.o && !this.opened) this.open(quiet);
    if (typeof q.g === 'number' && Math.abs(this.g - q.g) > 0.35) this.g = q.g; // stay on the host's gust clock
    const S = this.sun;
    if (q.d) { if (!this.done) { if (Array.isArray(q.p)) S.pos.fromArray(q.p); if (quiet) this.finish(true); else if (S.state !== SUN.HOME) this.setSun(SUN.HOME); } return; }
    if (q.s !== S.state && S.state !== SUN.HOME) {
      if (q.s === SUN.HOME) this.setSun(SUN.HOME, { quiet });
      else this.setSun(q.s, { quiet, first: S.state === SUN.SLEEP && q.s === SUN.FOLLOW, why: 'host' });
    }
    if (Array.isArray(q.p) && (S.state === SUN.WAIT || S.state === SUN.SLEEP)) { S.netPos = q.p; if (quiet) S.pos.fromArray(q.p); }
  }

  /** debug: bring the little sun home at once */
  completeNow() { this.open(false); if (this.sun.state !== SUN.HOME) this.setSun(SUN.HOME); }
}
