// Glue between the network session and the game. Each player owns their own traveler: we send ours
// ~15 times a second and show the partner's a little in the past, smoothly interpolated between the
// updates we received. While holding hands, whoever walks carries the pair: their updates also say where
// they put you (`fp`...), and your screen plays that back for your own traveler (applyCarry).
// Hands state travels with a sequence number in every update, so the two screens can never disagree for
// long about whether you're holding hands. Lanterns are scored by the host; stars are collected by
// whoever touches them, and secrets by whoever finds them (both sides merge the found sets).
import { Vector3 } from 'three';
import { NetSession } from './session.js';
import { WALK } from '../player/actor.js';

const SEND_MS = 66;     // ~15 updates a second
const QUIET_MS = 12000; // no word from the partner this long: show them as gone (they come back if it resumes)
const DELAY_MS = 120;   // show the partner this far in the past so there are two updates to blend between
const r2 = (v) => Math.round(v * 100) / 100;
const v3 = (v) => [r2(v.x), r2(v.y), r2(v.z)];

export class NetPlay {
  /**
   * ctx: { A (you), B (partner), hands, quest, lake, desert, hollow, peak, tower, stars, secrets, playAs, peerOpts, lag,
   *        on: { connected(back), left(reason), hello(kind), hands(linked), error(e) } }
   */
  constructor(ctx) {
    Object.assign(this, ctx);
    this.session = new NetSession(ctx.peerOpts, ctx.lag);
    this.online = false; // partner connected right now
    this.buf = [];
    this.offsets = [];
    this.lastSend = 0;
    this.lastMsg = 0;
    this.myJumps = 0;
    this.lastJ = -1;
    this.first = true;
    this.hseq = 0; // hands state version: bumped on every change you make
    this.partnerKind = null;
    this.ip = { a: null, b: null, k: 0, ex: 0 }; // this frame's interpolation between two updates
    this._p = new Vector3(); this._v = new Vector3();
    this.session
      .on('open', () => this.onOpen())
      .on('close', () => this.onClose())
      .on('msg', (m) => this.onMsg(m))
      .on('error', (e) => this.on.error?.(e));
  }

  get role() { return this.session.role; }
  get code() { return this.session.code; }
  host() { return this.session.host(); }
  join(code) { return this.session.join(code); }

  onOpen(back = false) {
    this.online = true;
    this.buf.length = 0; this.offsets.length = 0; this.first = true; this.lastJ = -1;
    this.lastMsg = performance.now();
    if (!back) { // a fresh start: you were holding the stay-at-home partner's hand
      if (this.hands.linked) this.hands.unlink();
      this.hseq = 0;
    }
    this.session.send({ t: 'hello', kind: this.playAs, v: 1 });
    this.on.connected?.(back);
  }

  onClose() { this.markGone('left'); }

  /** you're closing the page: tell your partner straight away */
  bye() { this.session.send({ t: 'bye' }); this.session.leave(); }

  markGone(reason) {
    if (!this.online) return;
    this.online = false;
    if (this.hands.linked) this.hands.unlink();
    const B = this.B;
    B.predicted = false; B.jumpedNow = false;
    Object.assign(B.intent, { x: 0, z: 0, run: false, jump: false, jumpHeld: false });
    B.vel.set(0, Math.min(0, B.vel.y), 0);
    this.on.left?.(reason);
  }

  onMsg(m) {
    if (!m || typeof m !== 'object') return;
    this.lastMsg = performance.now();
    if (m.t === 'bye') { this.markGone('left'); return; }
    if (!this.online && this.session.connected) this.onOpen(true); // they were quiet for a while and are back
    if (m.t === 'hello') { this.partnerKind = m.kind; this.on.hello?.(m.kind); }
    else if (m.t === 's') this.receive(m);
    else if (m.t === 'hands') this.reconcileHands(m.linked, m.side, m.seq ?? 0);
  }

  /** take the partner's view of the hands if it's newer than ours (host wins a tie) */
  reconcileHands(linked, side, seq) {
    const newer = seq > this.hseq || (seq === this.hseq && this.role === 'guest' && !!linked !== this.hands.linked);
    if (!newer) return;
    this.hseq = seq;
    const was = this.hands.linked;
    if (linked) { if (!was || this.hands.side !== -side) this.hands.linkAs(-side); } else if (was) this.hands.unlink();
    if (was !== !!linked) this.on.hands?.(!!linked);
  }

  receive(m) {
    const now = performance.now();
    this.offsets.push(now - m.ts); if (this.offsets.length > 40) this.offsets.shift();
    this.buf.push(m); if (this.buf.length > 40) this.buf.shift();
    if (this.lastJ >= 0 && m.j > this.lastJ) this.B.jumpedNow = true; // the partner hopped
    this.lastJ = m.j;
    if (m.hs !== undefined) this.reconcileHands(!!m.hl, m.hd, m.hs);
    // stars: anything either of you collected
    for (let i = 0; i < this.stars.items.length; i++) if (m.st & (1 << i)) this.stars.take(i, this.first);
    // secrets too: found by one of you counts for both
    if (this.keepsakes && m.kp) for (let i = 0; i < this.keepsakes.items.length; i++) if (m.kp & (1 << i)) this.keepsakes.take(i, this.first);
    if (this.keepsakes && m.kx && this.role === 'guest') this.keepsakes.applyPlaced(m.kx, this.first);
    if (this.secrets && m.sc) for (let i = 0; i < this.secrets.items.length; i++) if (m.sc & (1 << i)) this.secrets.take(i, this.first);
    // lanterns: the host keeps the score
    if (m.q && this.role === 'guest') this.quest.applyState(m.q, this.first);
    if (m.lk && this.lake && this.role === 'guest') this.lake.applyState(m.lk, this.first); // Crystal Lake: the host keeps that score too
    if (m.ds && this.desert && this.role === 'guest') this.desert.applyState(m.ds, this.first); // and the Sunset Desert's
    if (m.hw && this.hollow && this.role === 'guest') this.hollow.applyState(m.hw, this.first); // and Whispering Hollow's (with its shy shadows)
    if (m.pk && this.peak && this.role === 'guest') this.peak.applyState(m.pk, this.first); // and the Snowy Peak's
    if (m.tw && this.tower && this.role === 'guest') this.tower.applyState(m.tw, this.first); // and the Cloud Kingdom's
    if (m.ll !== undefined && this.hollow) this.hollow.lv[1] = m.ll; // how bright your partner's lantern is
    this.first = false;
  }

  /** call after your own physics: sends your traveler when it's time */
  send(now) {
    if (this.online && now - this.lastMsg > QUIET_MS) this.markGone('quiet');
    if (!this.session.connected || now - this.lastSend < SEND_MS) return;
    this.lastSend = now;
    const { A, B, hands } = this, it = A.intent;
    const m = {
      t: 's', ts: now,
      p: v3(A.pos), v: v3(A.vel), h: Math.round(A.heading * 1000) / 1000,
      g: A.grounded ? 1 : 0, gl: A.glide ? 1 : 0, w: A.inWind ? 1 : 0,
      i: [r2(it.x), r2(it.z)], r: it.run ? 1 : 0, jh: it.jumpHeld ? 1 : 0, j: this.myJumps,
      hl: hands.linked ? 1 : 0, hd: hands.side, hs: this.hseq,
      st: this.stars.mask(), sc: this.secrets ? this.secrets.mask() : 0, kp: this.keepsakes ? this.keepsakes.mask() : 0,
      ll: this.hollow ? r2(this.hollow.lv[0]) : 1,
    };
    if (hands.carrying) { // you're walking them: say where they are on your screen
      Object.assign(m, { fp: v3(B.pos), fv: v3(B.vel), fh: Math.round(B.heading * 1000) / 1000, fg: B.grounded ? 1 : 0, fgl: B.glide ? 1 : 0 });
    }
    if (this.role === 'host') { if (this.keepsakes) m.kx = this.keepsakes.placedMask(); m.q = this.quest.state(); if (this.lake) m.lk = this.lake.state(); if (this.desert) m.ds = this.desert.state(); if (this.hollow) m.hw = this.hollow.state(); if (this.peak) m.pk = this.peak.state(); if (this.tower) m.tw = this.tower.state(); }
    this.session.send(m);
  }

  /** you changed the hands (took, let go, or a fall broke them): tell your partner now */
  sendHands() {
    this.hseq++;
    this.session.send({ t: 'hands', linked: this.hands.linked, side: this.hands.side, seq: this.hseq });
  }

  /** place the partner's traveler where they were DELAY_MS ago (unless you're carrying them) */
  updateRemote(dt) {
    const B = this.B, buf = this.buf;
    if (!buf.length) return;
    const off = Math.min(...this.offsets);
    const target = performance.now() - off - DELAY_MS; // in the partner's clock
    while (buf.length > 2 && buf[1].ts < target - 1000) buf.shift(); // drop old history
    const last = buf[buf.length - 1];
    let a = last, b = last;
    if (target <= buf[0].ts) { a = b = buf[0]; } else if (target < last.ts) {
      for (let i = 0; i < buf.length - 1; i++) if (buf[i + 1].ts >= target) { a = buf[i]; b = buf[i + 1]; break; }
    }
    const span = b.ts - a.ts;
    const k = span > 0 ? Math.max(0, Math.min(1, (target - a.ts) / span)) : 0;
    const ex = target > b.ts ? Math.min(0.25, (target - b.ts) / 1000) : 0; // ran out of updates: coast briefly
    Object.assign(this.ip, { a, b, k, ex });
    const s = k < 0.5 ? a : b;
    Object.assign(B.intent, { x: s.i[0], z: s.i[1], run: !!s.r, jumpHeld: !!s.jh });
    if (B.predicted) return; // you're carrying them: hands put them beside you on this screen
    this.place(B, dt, a, b, k, ex, 'p', 'v', 'h', 'g', 'gl');
    B.inWind = !!s.w;
  }

  /** while your partner walks you by the hand: put your traveler where their screen put it */
  applyCarry(A, dt) {
    let { a, b, k, ex } = this.ip;
    if (!a || !(a.fp || b.fp)) return false;
    if (!a.fp) { a = b; k = 0; } else if (!b.fp) { b = a; k = 0; ex = 0; }
    this.place(A, dt, a, b, k, ex, 'fp', 'fv', 'fh', 'fg', 'fgl');
    A.inWind = false;
    return true;
  }

  /** blend an actor to the state between updates a and b (field names say which traveler) */
  place(act, dt, a, b, k, ex, P, V, H, G, GL) {
    const p = this._p.set(a[P][0] + (b[P][0] - a[P][0]) * k, a[P][1] + (b[P][1] - a[P][1]) * k, a[P][2] + (b[P][2] - a[P][2]) * k);
    if (ex > 0) { p.x += b[V][0] * ex; p.z += b[V][2] * ex; if (!b[G]) p.y += b[V][1] * ex; }
    const wasGround = act.grounded;
    if (act.pos.distanceToSquared(p) > 9) act.pos.copy(p); else act.pos.lerp(p, Math.min(1, dt * 18));
    act.vel.set(a[V][0] + (b[V][0] - a[V][0]) * k, a[V][1] + (b[V][1] - a[V][1]) * k, a[V][2] + (b[V][2] - a[V][2]) * k);
    let dh = b[H] - a[H]; dh = Math.atan2(Math.sin(dh), Math.cos(dh));
    let d = a[H] + dh * k - act.heading; d = Math.atan2(Math.sin(d), Math.cos(d));
    act.heading += d * Math.min(1, dt * 20);
    const s = k < 0.5 ? a : b;
    act.grounded = !!s[G]; act.glide = !!s[GL];
    act.speed01 = Math.hypot(act.vel.x, act.vel.z) / WALK;
    act.airTime = act.grounded ? 0 : act.airTime + dt;
    if (!wasGround && act.grounded) act.t.land(0.5);
  }
}
