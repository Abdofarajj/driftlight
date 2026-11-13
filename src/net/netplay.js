// Glue between the network session and the game. Each player owns their own traveler: we send ours
// ~15 times a second and show the partner's a little in the past, smoothly interpolated between the
// updates we received. Hands, lanterns and stars are shared: hands by small messages, lanterns scored
// by the host, stars collected by whoever touches them (both sides merge the collected set).
import { Vector3 } from 'three';
import { NetSession } from './session.js';
import { WALK } from '../player/actor.js';

const SEND_MS = 66;   // ~15 updates a second
const QUIET_MS = 12000; // no word from the partner this long: show them as gone (they come back if it resumes)
const DELAY_MS = 120; // show the partner this far in the past so there are two updates to blend between
const r2 = (v) => Math.round(v * 100) / 100;

export class NetPlay {
  /**
   * ctx: { A (you), B (partner), hands, quest, stars, playAs, peerOpts,
   *        on: { connected(), left(), hello(kind), hands(linked), error(e), starTaken(i, quiet), quiet } }
   */
  constructor(ctx) {
    Object.assign(this, ctx);
    this.session = new NetSession(ctx.peerOpts);
    this.online = false; // partner connected right now
    this.buf = [];
    this.offsets = [];
    this.lastSend = 0;
    this.lastMsg = 0;
    this.myJumps = 0;
    this.lastJ = -1;
    this.first = true;
    this.partnerKind = null;
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
    if (this.hands.linked) this.hands.unlink(); // you were holding the stay-at-home partner's hand
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
    else if (m.t === 'hands') {
      if (m.linked) this.hands.linkAs(-m.side); else this.hands.unlink();
      this.on.hands?.(m.linked);
    }
  }

  receive(m) {
    const now = performance.now();
    this.offsets.push(now - m.ts); if (this.offsets.length > 40) this.offsets.shift();
    this.buf.push(m); if (this.buf.length > 40) this.buf.shift();
    if (this.lastJ >= 0 && m.j > this.lastJ) this.B.jumpedNow = true; // the partner hopped
    this.lastJ = m.j;
    // stars: anything either of you collected
    for (let i = 0; i < this.stars.items.length; i++) if (m.st & (1 << i)) this.stars.take(i, this.first);
    // lanterns: the host keeps the score
    if (m.q && this.role === 'guest') this.quest.applyState(m.q, this.first);
    this.first = false;
  }

  /** call after your own physics: sends your traveler when it's time */
  send(now) {
    if (this.online && now - this.lastMsg > QUIET_MS) this.markGone('quiet');
    if (!this.session.connected || now - this.lastSend < SEND_MS) return;
    this.lastSend = now;
    const A = this.A, it = A.intent;
    const m = {
      t: 's', ts: now,
      p: [r2(A.pos.x), r2(A.pos.y), r2(A.pos.z)], v: [r2(A.vel.x), r2(A.vel.y), r2(A.vel.z)], h: Math.round(A.heading * 1000) / 1000,
      g: A.grounded ? 1 : 0, gl: A.glide ? 1 : 0, w: A.inWind ? 1 : 0,
      i: [r2(it.x), r2(it.z)], r: it.run ? 1 : 0, jh: it.jumpHeld ? 1 : 0, j: this.myJumps,
      st: this.stars.mask(),
    };
    if (this.role === 'host') m.q = this.quest.state();
    this.session.send(m);
  }

  sendHands() { this.session.send({ t: 'hands', linked: this.hands.linked, side: this.hands.side }); }

  /** place the partner's traveler where they were DELAY_MS ago (unless hands prediction is moving them) */
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
    const p = this._p.set(a.p[0] + (b.p[0] - a.p[0]) * k, a.p[1] + (b.p[1] - a.p[1]) * k, a.p[2] + (b.p[2] - a.p[2]) * k);
    if (target > b.ts) { // ran out of updates: carry on along their velocity for a moment
      const ex = Math.min(0.25, (target - b.ts) / 1000);
      p.x += b.v[0] * ex; p.z += b.v[2] * ex; if (!b.g) p.y += b.v[1] * ex;
    }
    const s = k < 0.5 ? a : b;
    Object.assign(B.intent, { x: s.i[0], z: s.i[1], run: !!s.r, jumpHeld: !!s.jh });
    if (B.predicted) return; // hands are pulling them beside you on this screen
    const wasGround = B.grounded;
    if (B.pos.distanceToSquared(p) > 9) B.pos.copy(p); else B.pos.lerp(p, Math.min(1, dt * 18));
    B.vel.set(a.v[0] + (b.v[0] - a.v[0]) * k, a.v[1] + (b.v[1] - a.v[1]) * k, a.v[2] + (b.v[2] - a.v[2]) * k);
    let dh = b.h - a.h; dh = Math.atan2(Math.sin(dh), Math.cos(dh));
    const h = a.h + dh * k;
    let d = h - B.heading; d = Math.atan2(Math.sin(d), Math.cos(d));
    B.heading += d * Math.min(1, dt * 20);
    B.grounded = !!s.g; B.glide = !!s.gl; B.inWind = !!s.w;
    B.speed01 = Math.hypot(B.vel.x, B.vel.z) / WALK;
    if (!wasGround && B.grounded) B.t.land(0.5);
  }
}
