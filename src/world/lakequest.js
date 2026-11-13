// "Wake the crystal heart" (round 6, Crystal Lake). Reaching the shrine raises a crystal bridge to the
// lake. Three crystals sleep on its shore, each with two lotus stones in front, about 6 m apart: a crystal
// wakes when both stones are stood on at the same time (one of you on each, so you have to let go of
// each other). Its light shoots to the heart on the islet; with all three, the heart wakes and stepping
// stones rise out of the lake. The rowboat at the dock is a secret: it drifts round the lake when you
// both sit in it. Online, the host keeps the score and sends it over (state/applyState), like quest.js.

const NEED = 1.2;        // seconds both stones must be stood on
const ON = 1.25;         // how near a lotus stone's middle counts (generous: a hand-held partner beside you is on it too)
const RISE = 4.5;        // seconds for the crystal bridge to rise
const STEPS = 4.0;       // seconds for the stepping stones to rise
const RIDE_SPEED = 1.0;  // the rowboat's drift, metres a second
const BOARD = 1.0;       // seconds you must both be aboard before it casts off
const flat = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const ease = (k) => k * k * (3 - 2 * k);

export class CrystalQuest {
  constructor(world, events, secrets) {
    this.world = world; this.L = world.lake; this.events = events; this.secrets = secrets;
    this.remote = false;    // online guest: the host decides, we only show it
    this.opened = false; this.rise = 0;
    this.pairs = this.L.pairs.map((p) => ({ ...p, charge: 0, lit: false, beamK: 0, hintT: -99, occ: [0, 0] }));
    this.count = 0;
    this.awake = false; this.heartK = 0; this.stepsK = 0; this.stepsAt = 0; this.stepsDone = false;
    this.rideLen = this.L.ride.getLength();
    this.boat = { riding: false, t: 0, u: 0, board: 0, needOff: false, hintT: -99 };
  }

  get rideDur() { return this.rideLen / RIDE_SPEED; }

  update(dt, t, a, b, onShrine) {
    const L = this.L;
    this.lastT = t;
    // ---- the crystal bridge: rises once either of you reaches the shrine ----
    if (!this.opened && !this.remote && this.world.northBridge.data.enabled && (onShrine(a) || onShrine(b))) this.open(false);
    if (this.opened && this.rise < 1) {
      this.rise = Math.min(1, this.rise + dt / RISE);
      L.bridge.setRise(this.rise);
      if (this.rise >= 1) this.events.emit('lake-open', { quiet: false });
    }

    // ---- lotus stones and crystals ----
    const on = (act, s) => flat(act.pos, s.pos) < ON && Math.abs(act.pos.y - s.pos.y) < 0.8;
    this.pairs.forEach((p, i) => {
      const [s0, s1] = p.stones;
      const a0 = on(a, s0), a1 = on(a, s1), b0 = on(b, s0), b1 = on(b, s1);
      p.occ[0] = a0 || b0 ? 1 : 0; p.occ[1] = a1 || b1 ? 1 : 0;
      const both = (a0 && b1) || (a1 && b0);
      if (!p.lit) {
        if (!this.remote) {
          p.charge = both ? p.charge + dt / NEED : Math.max(0, p.charge - dt * 1.5);
          if (p.charge >= 1) this.light(i, false);
        }
        // standing on one stone with nobody on the other: say what it needs (every so often)
        if ((a0 || a1) && !(p.occ[0] && p.occ[1]) && t - p.hintT > 9) { p.hintT = t; this.events.emit('lake-hint', { kind: 'stone' }); }
      }
      // visuals: the middle of a stone glows while stood on; the empty one of a half-filled pair pulses
      const half = !p.lit && (p.occ[0] || p.occ[1]);
      p.stones.forEach((s, j) => {
        const u = s.glowMat.uniforms.uStr;
        const target = p.lit ? 1.45 : 0.6 + p.occ[j] * 0.7 + p.charge * 0.4 + (half && !p.occ[j] ? 0.3 + Math.sin(t * 5) * 0.25 : 0);
        u.value += (target - u.value) * (dt > 0 ? Math.min(1, dt * 8) : 1);
        s.ring.visible = half || p.charge > 0.01;
        s.ring.scale.setScalar(half && !p.occ[j] ? 1 + Math.sin(t * 5) * 0.08 : 1 - p.charge * 0.25);
      });
      p.mat.uniforms.uStr.value = p.lit ? 0.95 + Math.sin(t * 1.7 + i) * 0.06 : 0.7 + p.charge * 0.3;
      p.light.str = p.lit ? 1.3 : 0.25 + p.charge * 0.8;
      if (p.lit && p.beamK < 1) p.beamK = Math.min(1, p.beamK + dt / 0.9);
      p.beam.visible = p.beamK > 0.001;
      p.beam.scale.y = p.beam.userData.len * ease(p.beamK);
      p.beam.scale.x = p.beam.scale.z = 1 + Math.sin(t * 6 + i) * 0.15;
    });

    // ---- the heart: brighter with each crystal, awake with all three ----
    const want = this.count / 3 * 0.55 + (this.awake ? 0.45 : 0);
    this.heartK += (want - this.heartK) * Math.min(1, dt * 1.5);
    L.heartMat.uniforms.uStr.value = 0.8 + this.heartK * 0.3 + (this.awake ? Math.sin(t * 2) * 0.06 : 0);
    L.heartLight.str = 0.35 + this.heartK * 1.7;
    L.heart.rotation.y += dt * (0.15 + this.heartK * 0.7);
    L.heart.position.y = L.heartY + (Math.sin(t * 1.2) * 0.06 + 0.45) * this.heartK; // asleep it rests on the plinth; awake it floats
    if (this.awake && !this.stepsDone && t >= this.stepsAt) {
      this.stepsK = Math.min(1, this.stepsK + dt / STEPS);
      L.setSteps(this.stepsK);
      if (this.stepsK >= 1) { this.stepsDone = true; this.events.emit('lake-steps', {}); }
    }

    // ---- the rowboat for two ----
    const B = this.boat;
    if (!B.riding) {
      const inA = L.inBoat(a.pos, 0.15), inB = L.inBoat(b.pos, 0.15);
      if (!inA && !inB) B.needOff = false; // after a ride, step off before it will go again
      if (!this.remote && !B.needOff && inA && inB) {
        B.board += dt;
        if (B.board >= BOARD) this.startRide(false);
      } else B.board = 0;
      if (inA && !inB && !B.needOff && t - B.hintT > 10) { B.hintT = t; this.events.emit('lake-hint', { kind: 'boat' }); }
      if (!B.riding) L.placeBoat(0, t);
    }
    if (B.riding) {
      B.t += dt;
      const k = Math.min(1, B.t / this.rideDur);
      B.u = ease(k);
      L.placeBoat(B.u, t);
      if (k >= 1 && !this.remote) this.endRide();
    }
  }

  open(quiet) {
    if (this.opened) return;
    this.opened = true;
    if (quiet) { this.rise = 1; this.L.bridge.setRise(1); this.events.emit('lake-open', { quiet: true }); } else this.events.emit('lake-bridge', {});
  }

  light(i, quiet) {
    const p = this.pairs[i];
    if (p.lit) return;
    p.lit = true; p.charge = 1; this.count++;
    if (quiet) p.beamK = 1;
    this.events.emit('lake-crystal', { n: this.count, of: this.pairs.length, pos: p.pos, quiet });
    if (this.count === this.pairs.length) this.wake(quiet);
  }

  wake(quiet) {
    if (this.awake) return;
    this.awake = true;
    this.stepsAt = 0;
    if (quiet) { this.heartK = 1; this.stepsK = 1; this.stepsDone = true; this.L.setSteps(1); } else this.stepsAt = (this.lastT ?? 0) + 1.5; // a breath after the heart wakes
    this.events.emit('lake-heart', { quiet, pos: this.L.heartWorld });
  }

  startRide(quiet) {
    const B = this.boat;
    B.riding = true; B.t = 0; B.board = 0;
    const p = this.L.boatWorld();
    if (this.secrets) { this.secrets.items[4].pos.copy(p).setY(this.L.boatDeck + 0.8); this.secrets.take(4, quiet); }
    this.events.emit('lake-boat', { riding: true, quiet });
  }

  endRide() {
    const B = this.boat;
    B.riding = false; B.t = 0; B.u = 0; B.needOff = true;
    this.L.placeBoat(0);
    this.events.emit('lake-boat', { riding: false });
  }

  /** where a traveler sits in the boat: him at the front, her at the back */
  seat(kind, out) {
    const s = this.L.boatState, off = this.L.boatSeats[kind === 'him' ? 0 : 1];
    const w = this.L.toWorld(s.x + Math.sin(s.yaw) * off, s.z + Math.cos(s.yaw) * off);
    return out.set(w.x, this.L.boatDeck, w.z);
  }

  /** host -> guest */
  state() {
    return {
      o: this.opened ? 1 : 0,
      c: this.pairs.map((p) => Math.round(p.charge * 100) / 100),
      l: this.pairs.reduce((m, p, i) => m | (p.lit ? 1 << i : 0), 0),
      br: this.boat.riding ? Math.round(this.boat.t * 10) / 10 : -1,
    };
  }

  applyState(q, quiet) {
    if (q.o && !this.opened) this.open(quiet);
    this.pairs.forEach((p, i) => {
      if (p.lit) return;
      if (q.l & (1 << i)) this.light(i, quiet); else p.charge = q.c?.[i] ?? 0;
    });
    const B = this.boat;
    if (q.br >= 0) {
      if (!B.riding) this.startRide(quiet || q.br > 3); // joined mid-ride: no fanfare
      if (Math.abs(B.t - q.br) > 0.6) B.t = q.br; // stay in step with the host's boat
    } else if (B.riding) this.endRide();
  }

  /** debug: wake all three crystals */
  completeNow() { this.pairs.forEach((p, i) => this.light(i, false)); }
}
