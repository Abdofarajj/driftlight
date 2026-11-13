// Sound as a system, all synthesized with Web Audio (no audio files):
// - music: original dreamy solo piano pieces with quiet pauses between them (src/music.js)
// - ambience: wind bed, birdsong over the forest, airy hum near the cloud edge, wind-current whoosh
// - ambience: also the waterfall by the grotto, louder as you get close
// - one-shots: footsteps by surface, jump, land, hands, lantern, checkpoint, star, quest complete,
//   and for the secrets: discovery harp, fox yip, fairy-ring notes and a fairy shimmer
// iOS only allows audio after a tap, so start() is called from the first touch / key.
import { Vector3 } from 'three';
import { PianoMusic } from './music.js';

const NOTE = (n) => 440 * Math.pow(2, (n - 69) / 12); // midi -> Hz
const MUSIC_VOL = 0.75;

export class GameAudio {
  constructor() {
    this.ctx = null;
    this.musicOn = true; // the mute button only silences the music; sound effects always play
    try { this.musicOn = localStorage.getItem('driftlight-music') !== '0'; } catch { /* storage blocked */ }
    this.listener = { pos: new Vector3(), right: new Vector3(1, 0, 0) };
    this.nextBar = 0; this.bar = 0; this.nextNote = 0;
    this.lastBird = 0;
    this.winds = [];
  }

  start() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC();
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    this.master.gain.linearRampToValueAtTime(0.9, ctx.currentTime + 2.0); // fade in
    const comp = ctx.createDynamicsCompressor();
    this.master.connect(comp).connect(ctx.destination);
    // reverb: generated impulse response (soft, 2.8s)
    this.reverb = ctx.createConvolver();
    const len = ctx.sampleRate * 2.8, ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3); }
    this.reverb.buffer = ir;
    const wet = ctx.createGain(); wet.gain.value = 0.45;
    this.reverb.connect(wet).connect(this.master);
    this.music = ctx.createGain(); this.music.gain.value = this.musicOn ? MUSIC_VOL : 0;
    const musicWet = ctx.createGain(); musicWet.gain.value = 1.4; // piano sits in a big soft room
    this.music.connect(this.master); this.music.connect(musicWet).connect(this.reverb);
    this.piano = new PianoMusic(ctx, this.music);
    this.sfx = ctx.createGain(); this.sfx.gain.value = 0.9;
    this.sfx.connect(this.master); this.sfx.connect(this.reverb);
    this.amb = ctx.createGain(); this.amb.gain.value = 0.8;
    this.amb.connect(this.master);
    // shared noise buffer
    const nb = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const nd = nb.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    this.noise = nb;
    // wind bed + airy layer + one whoosh per wind current
    this.windBed = this.loopNoise(380, 0.6, 0.035, this.amb);
    this.air = this.loopNoise(2400, 0.8, 0.0, this.amb);
    this.windWhoosh = this.winds.map(() => this.loopNoise(650, 0.9, 0.0, this.amb));
    this.water = this.loopNoise(1100, 0.45, 0.0, this.amb);   // waterfall hiss
    this.waterLow = this.loopNoise(260, 0.6, 0.0, this.amb);  // and its soft rumble
  }

  setMusic(on) {
    this.musicOn = on;
    try { localStorage.setItem('driftlight-music', on ? '1' : '0'); } catch { /* ignore */ }
    if (this.ctx) { const g = this.music.gain; g.cancelScheduledValues(this.ctx.currentTime); g.setTargetAtTime(on ? MUSIC_VOL : 0, this.ctx.currentTime, 0.3); }
  }

  loopNoise(freq, q, gain, dest) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource(); src.buffer = this.noise; src.loop = true;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain(); g.gain.value = gain;
    src.connect(f).connect(g).connect(dest); src.start();
    return { f, g };
  }

  // ---------- positional helpers ----------
  spatial(pos) {
    if (!pos) return { gain: 1, pan: 0 };
    const d = pos.distanceTo(this.listener.pos);
    const rel = new Vector3().subVectors(pos, this.listener.pos);
    const pan = Math.max(-1, Math.min(1, rel.dot(this.listener.right) / (d + 2)));
    return { gain: 1 / (1 + Math.max(0, d - 1.5) * 0.15), pan };
  }
  out(pos, dest = this.sfx) {
    const ctx = this.ctx;
    const { gain, pan } = this.spatial(pos);
    const g = ctx.createGain(); g.gain.value = gain;
    if (ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = pan; g.connect(p).connect(dest); } else g.connect(dest);
    return g;
  }

  // ---------- voices ----------
  tone(freq, t, dur, vol, type = 'sine', dest = this.sfx, attack = 0.005) {
    const ctx = this.ctx;
    const o = ctx.createOscillator(); o.type = type; o.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(dest); o.start(t); o.stop(t + dur + 0.05);
  }
  bell(freq, t, vol, dest = this.sfx, dur = 2.2) {
    this.tone(freq, t, dur, vol, 'sine', dest);
    this.tone(freq * 2.76, t, dur * 0.4, vol * 0.35, 'sine', dest);
    this.tone(freq * 5.4, t, dur * 0.15, vol * 0.12, 'sine', dest);
  }
  burst(t, dur, vol, type, freq, q, dest, sweepTo) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource(); src.buffer = this.noise;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + Math.min(0.02, dur / 3)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(dest);
    src.start(t, Math.random() * 1.5); src.stop(t + dur + 0.05);
  }

  /** one-shot sound effects */
  play(name, opts = {}) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + 0.01;
    const dest = this.out(opts.pos);
    const v = opts.vol ?? 1;
    switch (name) {
      case 'step': {
        const s = opts.surface;
        const p = 0.9 + Math.random() * 0.2;
        if (s === 'wood') { // hollow plank knock
          this.tone(140 * p, t, 0.16, 0.26 * v, 'sine', dest);
          this.tone(310 * p, t, 0.07, 0.08 * v, 'triangle', dest);
          this.burst(t, 0.07, 0.14 * v, 'bandpass', 900 * p, 1.5, dest);
        } else if (s === 'water') { // wading: a soft slosh and a little bubble
          this.burst(t, 0.22, 0.16 * v, 'lowpass', 900 * p, 0.8, dest, 400);
          this.burst(t + 0.03, 0.12, 0.06 * v, 'bandpass', 2400 * p, 2, dest, 1400);
          this.tone(320 * p, t + 0.02, 0.06, 0.02 * v, 'sine', dest);
        } else if (s === 'sand') { // soft sand: a hushed shuffle with a little grit
          this.burst(t, 0.16, 0.16 * v, 'bandpass', 2200 * p, 0.5, dest, 1100);
          this.burst(t + 0.02, 0.07, 0.05 * v, 'highpass', 5200 * p, 0.6, dest);
          this.tone(80 * p, t, 0.07, 0.05 * v, 'sine', dest);
        } else if (s === 'path') { // dirt crunch: two quick gritty bursts
          this.burst(t, 0.08, 0.2 * v, 'bandpass', 1500 * p, 0.9, dest);
          this.burst(t + 0.025, 0.06, 0.12 * v, 'highpass', 3200 * p, 0.7, dest);
          this.tone(95 * p, t, 0.08, 0.08 * v, 'sine', dest);
        } else { // soft grass swish + body
          this.burst(t, 0.13, 0.2 * v, 'bandpass', 1300 * p, 0.6, dest, 2600);
          this.tone(85 * p, t, 0.09, 0.09 * v, 'sine', dest);
        }
        break;
      }
      case 'jump': this.burst(t, 0.3, 0.07 * v, 'bandpass', 350, 1.5, dest, 1600); break;
      case 'land': this.tone(90, t, 0.16, 0.12 * v, 'sine', dest); this.burst(t, 0.1, 0.05 * v, 'lowpass', 600, 0.7, dest); break;
      case 'glide': this.burst(t, 0.8, 0.05 * v, 'bandpass', 500, 0.8, dest, 1200); break;
      case 'hands': this.bell(NOTE(86), t, 0.07, dest); this.bell(NOTE(93), t + 0.12, 0.06, dest); this.swell(0.25, 3); break;
      case 'release': this.bell(NOTE(81), t, 0.04, dest, 1.2); break;
      case 'charge': this.tone(NOTE(74 + Math.floor((opts.k ?? 0) * 12)), t, 0.25, 0.025, 'triangle', dest); break;
      case 'lantern': [74, 78, 81, 86].forEach((n, i) => this.bell(NOTE(n), t + i * 0.09, 0.07, dest, 3)); this.swell(0.3, 4); break;
      case 'checkpoint': [69, 74, 78, 81].forEach((n, i) => this.bell(NOTE(n + 12), t + i * 0.07, 0.05, dest, 1.6)); break;
      case 'star': [81, 86, 90, 93, 98].forEach((n, i) => this.bell(NOTE(n), t + i * 0.05, 0.05, dest, 1.4)); break;
      case 'updraft': this.burst(t, 1.4, 0.12, 'bandpass', 300, 0.7, dest, 2200); break;
      case 'complete':
        [62, 66, 69, 74, 78, 81, 86, 90].forEach((n, i) => this.bell(NOTE(n), t + i * 0.11, 0.07, this.sfx, 3.5));
        [38, 50, 57].forEach((n) => this.tone(NOTE(n), t, 5, 0.06, 'triangle', this.sfx, 1.2));
        this.swell(0.5, 8);
        break;
      case 'secret': { // a harp run up, a bell on top, and the music swells
        [62, 66, 69, 73, 76, 81, 85, 88].forEach((n, i) => {
          this.tone(NOTE(n), t + i * 0.075, 1.9, 0.055, 'triangle', this.sfx, 0.004);
          this.tone(NOTE(n + 12), t + i * 0.075, 0.8, 0.018, 'sine', this.sfx, 0.004);
        });
        this.bell(NOTE(93), t + 0.7, 0.06, this.sfx, 3.5);
        this.burst(t + 0.55, 1.4, 0.02, 'highpass', 5000, 0.7, this.sfx, 9000);
        this.swell(0.45, 6);
        break;
      }
      case 'crystal': { // a crystal wakes: glassy bells climbing, with a soft shimmer
        [76, 83, 88, 95].forEach((n, i) => { this.bell(NOTE(n), t + i * 0.08, 0.06, dest, 3.2); this.tone(NOTE(n + 19), t + i * 0.08, 0.5, 0.012, 'sine', dest); });
        this.burst(t + 0.2, 1.6, 0.018, 'highpass', 6500, 0.6, dest, 10000);
        this.swell(0.3, 4);
        break;
      }
      case 'heart': { // the heart wakes: a slow bright chord over a low hum, and the music swells
        [57, 64, 69, 73, 76, 81, 85, 88].forEach((n, i) => this.bell(NOTE(n), t + i * 0.13, 0.065, this.sfx, 4.5));
        [33, 45, 52].forEach((n) => this.tone(NOTE(n), t, 6, 0.06, 'triangle', this.sfx, 1.5));
        this.burst(t + 0.8, 2.5, 0.02, 'highpass', 6000, 0.6, this.sfx, 11000);
        this.swell(0.6, 9);
        break;
      }
      case 'gustWarn': // a gust gathering at the top of the pass: a low rising hiss
        this.burst(t, 1.4, 0.05, 'bandpass', 260, 0.6, dest, 900);
        break;
      case 'gust': { // the gust: a rushing hiss that sweeps down, with a hollow whistle over it
        this.burst(t, 1.9, 0.16, 'bandpass', 1400, 0.5, dest, 500);
        this.burst(t + 0.05, 1.6, 0.05, 'highpass', 4200, 0.7, dest, 2600);
        this.tone(NOTE(79), t + 0.1, 1.3, 0.012, 'sine', dest, 0.3);
        break;
      }
      case 'sunwake': { // the little sun wakes: a warm yawn of bells rising, then a bright chirp
        [67, 71, 74, 79, 83].forEach((n, i) => this.bell(NOTE(n), t + i * 0.1, 0.055, dest, 2.6));
        this.tone(NOTE(91), t + 0.62, 0.25, 0.03, 'triangle', dest);
        this.swell(0.3, 4);
        break;
      }
      case 'sunhome': { // home on the sundial: a slow golden chord, a shimmer, and the music swells
        [55, 62, 67, 71, 74, 79, 83, 86].forEach((n, i) => this.bell(NOTE(n), t + i * 0.12, 0.065, this.sfx, 4.5));
        [31, 43, 50].forEach((n) => this.tone(NOTE(n), t, 6, 0.06, 'triangle', this.sfx, 1.5));
        this.burst(t + 0.7, 2.5, 0.02, 'highpass', 6000, 0.6, this.sfx, 11000);
        this.swell(0.6, 9);
        break;
      }
      case 'splash': { // into the lake
        this.burst(t, 0.5, 0.22 * v, 'lowpass', 1600, 0.7, dest, 300);
        this.burst(t + 0.05, 0.35, 0.08 * v, 'bandpass', 3000, 1.2, dest, 900);
        this.tone(180, t, 0.25, 0.05 * v, 'sine', dest);
        break;
      }
      case 'yip': { // the fox: two quick rising chirps
        const p = 0.92 + Math.random() * 0.16;
        for (const [dt0, f0, f1, g0] of [[0, 820, 1500, 0.05], [0.11, 980, 1750, 0.04]]) {
          const o = this.ctx.createOscillator(), g = this.ctx.createGain(), s = t + dt0;
          o.type = 'triangle';
          o.frequency.setValueAtTime(f0 * p, s); o.frequency.exponentialRampToValueAtTime(f1 * p, s + 0.07); o.frequency.exponentialRampToValueAtTime(f0 * 1.1 * p, s + 0.12);
          g.gain.setValueAtTime(0.0001, s); g.gain.exponentialRampToValueAtTime(g0 * v, s + 0.015); g.gain.exponentialRampToValueAtTime(0.0001, s + 0.13);
          o.connect(g).connect(dest); o.start(s); o.stop(s + 0.15);
        }
        break;
      }
      case 'ring': { // one note per mushroom as the fairy ring lights up, climbing a pentatonic scale
        const n = [69, 71, 74, 76, 78, 81, 83, 86, 88][Math.min(8, opts.k ?? 0)];
        this.bell(NOTE(n), t, 0.06, dest, 2.4);
        this.tone(NOTE(n - 12), t, 1.2, 0.03, 'triangle', dest);
        break;
      }
      case 'fairy': { // a shimmer of tiny high bells
        for (let i = 0; i < 14; i++) this.bell(NOTE(88 + [0, 2, 4, 7, 9, 12, 14][Math.floor(Math.random() * 7)]), t + i * 0.06 + Math.random() * 0.03, 0.03, dest, 1.4);
        this.burst(t, 1.6, 0.025, 'highpass', 6000, 0.6, dest, 11000);
        this.swell(0.3, 5);
        break;
      }
      case 'bird': {
        const base = 2600 + Math.random() * 1400, n = 2 + Math.floor(Math.random() * 3);
        for (let i = 0; i < n; i++) {
          const o = this.ctx.createOscillator(), g = this.ctx.createGain(), s = t + i * 0.13;
          o.frequency.setValueAtTime(base, s); o.frequency.exponentialRampToValueAtTime(base * (1.2 + Math.random() * 0.3), s + 0.08);
          g.gain.setValueAtTime(0.0001, s); g.gain.exponentialRampToValueAtTime(0.018, s + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, s + 0.1);
          o.connect(g).connect(dest); o.start(s); o.stop(s + 0.12);
        }
        break;
      }
      default: break;
    }
  }

  swell(amount, secs) {
    if (!this.ctx) return;
    const g = this.music.gain, t = this.ctx.currentTime;
    g.cancelScheduledValues(t); g.setValueAtTime(g.value, t);
    if (!this.musicOn) return;
    g.linearRampToValueAtTime(MUSIC_VOL * (1 + amount), t + 0.6);
    g.linearRampToValueAtTime(MUSIC_VOL, t + secs);
  }

  /** called every frame */
  update(dt, s) {
    if (!this.ctx) return;
    const ctx = this.ctx, now = ctx.currentTime;
    this.listener.pos.copy(s.playerPos); // third-person: you hear from where your traveler stands
    this.listener.right.copy(s.camRight);
    this.piano.update();
    // ambience
    const k = 1 - Math.exp(-dt * 2);
    const edge = Math.max(0, Math.min(1, (s.distFromCenter - 14) / 12));
    this.windBed.g.gain.value += ((0.03 + Math.sin(now * 0.23) * 0.012 + edge * 0.02) - this.windBed.g.gain.value) * k;
    this.air.g.gain.value += ((edge * 0.025 + (s.airborne ? 0.02 : 0)) - this.air.g.gain.value) * k;
    this.windWhoosh.forEach((w, i) => {
      const d = s.windDist[i] ?? 99;
      const target = s.inWind === i ? 0.16 : 0.05 / (1 + d * 0.25);
      w.g.gain.value += (target - w.g.gain.value) * k;
      w.f.frequency.value = 500 + Math.sin(now * 0.7 + i) * 150 + (s.inWind === i ? 300 : 0);
    });
    const wd = s.waterDist ?? 99; // the grotto waterfall
    this.water.g.gain.value += (0.11 / (1 + Math.max(0, wd - 2) * 0.35) ** 2 - this.water.g.gain.value) * k;
    this.waterLow.g.gain.value += (0.08 / (1 + Math.max(0, wd - 2) * 0.3) ** 2 - this.waterLow.g.gain.value) * k;
    if (s.onMain && now - this.lastBird > 4 + Math.random() * 6) {
      this.lastBird = now;
      const a = Math.random() * Math.PI * 2;
      this.play('bird', { pos: new Vector3(s.playerPos.x + Math.cos(a) * 9, s.playerPos.y + 5, s.playerPos.z + Math.sin(a) * 9) });
    }
  }
}
