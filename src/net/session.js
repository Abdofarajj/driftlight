// Online play for two: one player hosts, the other joins by link (?room=CODE).
// Peer-to-peer WebRTC through PeerJS. The free public PeerJS broker only introduces the two browsers;
// after that the game data flows directly between them, or through a TURN relay when their networks
// won't allow a direct link (see ice.js).
// Phones are the hard part: sending the link means leaving the game for Messages, and the page sleeps
// meanwhile. So the host comes back under the same room code, and the guest keeps knocking for a while
// instead of giving up the first time nobody answers.
import { Peer } from 'peerjs';
import { iceConfig } from './ice.js';

const PREFIX = 'driftlight-v1-';
const KNOCKS = 100;     // a guest keeps knocking (every 3 s, plus the broker's few seconds to say nobody is there) for 10-15 minutes
const DIAL_MS = 20000;  // a link still not open after this long is stuck: drop it and dial again
const DEAD_MS = 20000;  // an open link with no word for this long is dead, even if the browser hasn't noticed
const BROKER_LOST = ['unavailable-id', 'network', 'server-error', 'socket-error', 'socket-closed', 'disconnected'];
const LETTERS = 'abcdefghjkmnpqrstuvwxyz23456789'; // no 0/o, 1/l/i
export const makeCode = () => Array.from({ length: 5 }, () => LETTERS[Math.floor(Math.random() * LETTERS.length)]).join('');
export const cleanCode = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 12);

export class NetSession {
  constructor(peerOpts = {}, lag = null) {
    this.peerOpts = peerOpts;
    this.lag = lag; // tests: { ms, jitter } simulated one-way internet delay on incoming messages
    this.lastDeliver = 0;
    this.peer = null;
    this.conn = null;
    this.role = null; // 'host' | 'guest'
    this.code = null;
    this.connected = false;
    this.handlers = {};
    this.knocks = 0;  // guest: tries since the last time you were connected
    this.lastIn = 0;  // when the partner last said anything
    this.left = false;
  }

  on(name, fn) { (this.handlers[name] ||= []).push(fn); return this; }
  emit(name, d) { for (const fn of this.handlers[name] || []) fn(d); }

  /** peer options with the STUN/relay servers, made fresh for each new peer because relay passwords expire */
  async opts() {
    if (this.peerOpts.config) return this.peerOpts; // tests bring their own
    try { return { ...this.peerOpts, config: await iceConfig() }; } catch { return this.peerOpts; }
  }

  /** open a room and wait for your partner. Resolves with the room code once the broker has it. */
  host(code = makeCode(), tries = 3) {
    this.role = 'host'; this.code = code; this.left = false;
    return new Promise((resolve, reject) => {
      let first = true;
      const start = async () => {
        const opts = await this.opts();
        if (this.left) return;
        if (this.peer && !this.peer.destroyed) this.peer.destroy();
        const peer = this.peer = new Peer(PREFIX + this.code, opts);
        let opened = false;
        peer.on('open', () => { opened = true; if (first) { first = false; resolve(this.code); } });
        // the newest link wins: it's your partner coming back (a reload, a dead link the browser hasn't noticed)
        peer.on('connection', (c) => { if (this.conn) this.drop(this.conn); this.attach(c); });
        peer.on('disconnected', () => { if (!peer.destroyed) this.wakeSoon(1500); });
        peer.on('error', (e) => {
          if (first && !opened && e.type === 'unavailable-id' && tries-- > 0) { peer.destroy(); this.code = makeCode(); start(); return; } // someone has that code
          if (first && !opened) { first = false; reject(e); return; }
          // already hosting and the broker lost us (the phone slept, you switched apps to send the link, the
          // network changed): come back under the same code, so the link you sent keeps working
          if (BROKER_LOST.includes(e.type)) { this.wakeSoon(3000); return; }
          this.emit('error', e);
        });
      };
      this.restart = start;
      start();
    });
  }

  /** join your partner's room. Resolves when the two of you are connected. */
  join(code) {
    this.role = 'guest'; this.code = code; this.left = false;
    return new Promise((resolve, reject) => {
      let done = false;
      this.on('open', () => { if (!done) { done = true; resolve(); } });
      const start = async () => {
        const opts = await this.opts();
        if (this.left) return;
        if (this.peer && !this.peer.destroyed) this.peer.destroy();
        const peer = this.peer = new Peer(opts);
        peer.on('open', () => this.dial());
        peer.on('disconnected', () => { if (!peer.destroyed) this.wakeSoon(1500); });
        peer.on('error', (e) => {
          // they aren't there right now (their phone slept, or they're still sending you the link): keep knocking
          if (e.type === 'peer-unavailable') { this.knock('waiting'); return; }
          if (!done) { done = true; reject(e); this.emit('error', e); } // say it once
          else if (!BROKER_LOST.includes(e.type)) this.emit('error', e);
          if (BROKER_LOST.includes(e.type)) this.wakeSoon(3000); // and quietly try the broker again
        });
      };
      this.restart = start;
      clearInterval(this.tick); this.tick = setInterval(() => this.check(), 2000);
      start();
    });
  }

  /** guest: the host didn't answer this time (gone for now, or the two networks didn't link): try again shortly */
  knock(why) {
    if (this.connected || this.left) return;
    clearTimeout(this.dialT);
    if (this.conn && !this.conn.open) this.drop(this.conn);
    if (this.knocks++ >= KNOCKS) { this.emit('gaveup'); return; }
    this.emit(why, this.knocks); // 'waiting' | 'trouble'
    this.wakeSoon(why === 'waiting' ? 3000 : 2000);
  }

  /** back from the background (or a blip): get back on the broker, and the guest dials again if apart */
  wake() {
    if (this.left || !this.role) return;
    const p = this.peer;
    if (p && !p.destroyed && p.disconnected) { try { p.reconnect(); } catch { this.wakeSoon(3000); } return; }
    if (!p || p.destroyed) {
      if (this.connected) return;
      if (this.role === 'guest' && this.knocks++ >= KNOCKS) { this.emit('gaveup'); return; }
      this.restart?.(); return;
    }
    if (this.role === 'guest' && !this.connected && p.open && !this.conn) this.dial();
  }

  wakeSoon(ms) { clearTimeout(this.wakeT); this.wakeT = setTimeout(() => this.wake(), ms); }

  /** guest: an open link that has gone quiet is dead (the host's phone slept): drop it and dial again */
  check() {
    if (this.left || this.role !== 'guest' || !this.connected || !this.conn) return;
    if (performance.now() - this.lastIn > DEAD_MS) { this.drop(this.conn); this.wakeSoon(500); }
  }

  dial() {
    const p = this.peer;
    if (this.left || !p || p.destroyed || !p.open) return;
    if (this.conn) this.drop(this.conn);
    const c = p.connect(PREFIX + this.code, { reliable: true, serialization: 'json' });
    this.attach(c);
    clearTimeout(this.dialT);
    this.dialT = setTimeout(() => { if (this.conn === c && !c.open) this.knock('trouble'); }, DIAL_MS);
  }

  attach(c) {
    this.conn = c;
    c.on('open', () => {
      if (this.conn !== c) { c.close(); return; }
      clearTimeout(this.dialT);
      this.connected = true; this.knocks = 0; this.lastIn = performance.now();
      this.emit('open');
    });
    c.on('data', (m) => {
      if (this.conn !== c) return;
      this.lastIn = performance.now();
      if (!this.lag) { this.emit('msg', m); return; }
      // in order, like the real channel, but late
      const at = Math.max(this.lastDeliver, performance.now() + this.lag.ms + Math.random() * this.lag.jitter);
      this.lastDeliver = at;
      setTimeout(() => this.emit('msg', m), at - performance.now());
    });
    c.on('close', () => {
      if (this.conn !== c) return;
      const was = this.connected;
      this.connected = false; this.conn = null;
      if (was) this.emit('close');
      // the guest keeps trying for a while in case the host's connection only blipped
      if (this.role === 'guest') this.wakeSoon(4000);
    });
    c.on('error', (e) => {
      if (this.role === 'guest' && this.conn === c && !c.open) { this.knock('trouble'); return; } // the networks didn't link this time
      this.emit('error', e);
    });
  }

  /** let go of a link without the guest's automatic redial (the caller decides what's next) */
  drop(c) {
    if (this.conn === c) {
      const was = this.connected;
      this.conn = null; this.connected = false;
      if (was) this.emit('close');
    }
    try { c.close(); } catch { /* already closed */ }
  }

  send(m) { if (this.conn && this.conn.open) { try { this.conn.send(m); } catch { /* channel closing */ } } }

  leave() {
    this.left = true;
    for (const t of [this.wakeT, this.dialT]) clearTimeout(t);
    clearInterval(this.tick);
    if (this.peer) this.peer.destroy();
    this.peer = null; this.conn = null; this.connected = false;
  }
}
