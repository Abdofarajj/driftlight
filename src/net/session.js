// Online play for two: one player hosts, the other joins by link (?room=CODE).
// Peer-to-peer WebRTC through PeerJS. The free public PeerJS broker only introduces the two browsers;
// after that the game data flows directly between them (or through PeerJS's public TURN relay if a
// network blocks direct connections).
import { Peer } from 'peerjs';

const PREFIX = 'driftlight-v1-';
const LETTERS = 'abcdefghjkmnpqrstuvwxyz23456789'; // no 0/o, 1/l/i
export const makeCode = () => Array.from({ length: 5 }, () => LETTERS[Math.floor(Math.random() * LETTERS.length)]).join('');
export const cleanCode = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 12);

export class NetSession {
  constructor(peerOpts = {}) {
    this.peerOpts = peerOpts;
    this.peer = null;
    this.conn = null;
    this.role = null; // 'host' | 'guest'
    this.code = null;
    this.connected = false;
    this.handlers = {};
    this.redials = 0;
  }

  on(name, fn) { (this.handlers[name] ||= []).push(fn); return this; }
  emit(name, d) { for (const fn of this.handlers[name] || []) fn(d); }

  /** open a room and wait for your partner. Resolves with the room code once the broker has it. */
  host(code = makeCode(), tries = 3) {
    this.role = 'host'; this.code = code;
    return new Promise((resolve, reject) => {
      const peer = this.peer = new Peer(PREFIX + code, this.peerOpts);
      let opened = false;
      peer.on('open', () => { opened = true; resolve(code); });
      peer.on('connection', (c) => {
        if (this.conn && this.conn.open) { c.on('open', () => c.close()); return; } // two players only
        this.attach(c);
      });
      peer.on('disconnected', () => { if (!peer.destroyed) setTimeout(() => { try { peer.reconnect(); } catch { /* retry later */ } }, 1500); });
      peer.on('error', (e) => {
        if (!opened && e.type === 'unavailable-id' && tries > 0) { peer.destroy(); this.host(makeCode(), tries - 1).then(resolve, reject); return; }
        if (!opened) reject(e);
        this.emit('error', e);
      });
    });
  }

  /** join your partner's room. Resolves when the two of you are connected. */
  join(code) {
    this.role = 'guest'; this.code = code;
    return new Promise((resolve, reject) => {
      const peer = this.peer = new Peer(this.peerOpts);
      let done = false;
      this.on('open', () => { if (!done) { done = true; resolve(); } });
      peer.on('open', () => this.dial());
      peer.on('disconnected', () => { if (!peer.destroyed) setTimeout(() => { try { peer.reconnect(); } catch { /* ignore */ } }, 1500); });
      peer.on('error', (e) => {
        if (!done) { done = true; reject(e); }
        this.emit('error', e);
      });
    });
  }

  dial() {
    const c = this.peer.connect(PREFIX + this.code, { reliable: true, serialization: 'json' });
    this.attach(c);
  }

  attach(c) {
    this.conn = c;
    c.on('open', () => { this.connected = true; this.redials = 0; this.emit('open'); });
    c.on('data', (m) => this.emit('msg', m));
    c.on('close', () => {
      if (this.conn !== c) return;
      const was = this.connected;
      this.connected = false; this.conn = null;
      if (was) this.emit('close');
      // the guest keeps trying for a while in case the host's connection only blipped
      if (this.role === 'guest' && this.redials < 15 && this.peer && !this.peer.destroyed) {
        this.redials++;
        setTimeout(() => { if (!this.connected && this.peer.open) this.dial(); }, 4000);
      }
    });
    c.on('error', (e) => this.emit('error', e));
  }

  send(m) { if (this.conn && this.conn.open) { try { this.conn.send(m); } catch { /* channel closing */ } } }

  leave() { this.redials = 99; if (this.peer) this.peer.destroy(); this.peer = null; this.conn = null; this.connected = false; }
}
