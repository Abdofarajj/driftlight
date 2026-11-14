// Dreamy solo piano, composed on the fly. Every piece is original: a slow, spacious little form
// (intro, A, A', B, A'', outro) over soft extended chords, with a short melody motif that comes back
// with variations. Pieces are separated by long quiet pauses so the world can breathe.
// Felt-piano voice: two oscillators (pure fundamental + a harmonic body that fades faster),
// a soft lowpass that closes as the note decays, and a tiny hammer thump.

const NOTE = (n) => 440 * Math.pow(2, (n - 69) / 12);

const Q = { // chord qualities as semitones above the root
  maj9: [0, 4, 7, 11, 14], m9: [0, 3, 7, 10, 14], add9: [0, 4, 7, 14], sus2: [0, 2, 7, 14],
  lyd: [0, 4, 7, 11, 18], six9: [0, 4, 7, 9, 14], m6: [0, 3, 7, 9], m11: [0, 3, 7, 10, 17],
};
// progressions: [root offset from key, quality]
const PROGS = [
  { mode: 'major', chords: [[0, 'maj9'], [9, 'm9'], [5, 'lyd'], [7, 'sus2']] },
  { mode: 'major', chords: [[5, 'maj9'], [0, 'add9'], [9, 'm11'], [7, 'add9']] },
  { mode: 'minor', chords: [[0, 'm9'], [8, 'maj9'], [3, 'maj9'], [10, 'six9']] },
  { mode: 'major', chords: [[0, 'maj9'], [4, 'm9'], [5, 'maj9'], [5, 'm6']] },
  { mode: 'major', chords: [[0, 'six9'], [2, 'm9'], [5, 'lyd'], [0, 'add9']] },
];
const SCALES = { major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10] };
const KEYS = [53, 50, 51, 48, 56, 55]; // F, D, Eb, C, Ab, G (left-hand register roots)

export class PianoMusic {
  constructor(ctx, dest) {
    this.ctx = ctx;
    this.out = ctx.createGain();
    this.out.gain.value = 1;
    // a gentle tone shelf so the piano stays soft and warm
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 4200; lp.Q.value = 0.3;
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 90; hp.Q.value = 0.5; // keep the low end from getting muddy
    this.out.connect(hp).connect(lp).connect(dest);
    // a harmonic table for the body of the tone
    const real = new Float32Array([0, 1, 0.42, 0.2, 0.11, 0.06, 0.035, 0.02]);
    this.body = ctx.createPeriodicWave(real, new Float32Array(real.length));
    this.queue = [];
    this.nextPieceAt = ctx.currentTime + 2.5; // first piece starts soon after you begin
    this.playing = false;
  }

  /** schedule notes that fall inside the lookahead window */
  update() {
    const now = this.ctx.currentTime;
    if (!this.queue.length && now >= this.nextPieceAt - 0.5) {
      const piece = compose(Math.random);
      this.queue = piece.events.map((e) => ({ ...e, t: e.t + this.nextPieceAt }));
      this.nextPieceAt += piece.length + 25 + Math.random() * 45; // quiet pause before the next one
    }
    while (this.queue.length && this.queue[0].t < now + 0.4) {
      const e = this.queue.shift();
      if (e.t > now - 0.05) this.note(e.midi, e.t, e.vel, e.dur);
    }
  }

  note(midi, t, vel, dur) {
    const ctx = this.ctx, f = NOTE(midi);
    const low = Math.max(0, Math.min(1, (72 - midi) / 36)); // low notes ring longer
    const tau = 0.9 + low * 1.3;
    const end = t + dur;
    const g = ctx.createGain();
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 0.2;
    lp.frequency.setValueAtTime(900 + vel * 2600, t);
    lp.frequency.setTargetAtTime(500 + vel * 600, t + 0.02, 0.6);
    const fund = ctx.createOscillator(); fund.frequency.value = f;
    const body = ctx.createOscillator(); body.setPeriodicWave(this.body); body.frequency.value = f * 1.0007;
    const gf = ctx.createGain(), gb = ctx.createGain();
    const a = vel * 0.16;
    gf.gain.setValueAtTime(0, t); gf.gain.linearRampToValueAtTime(a, t + 0.006); gf.gain.setTargetAtTime(0, t + 0.006, tau);
    gb.gain.setValueAtTime(0, t); gb.gain.linearRampToValueAtTime(a * 0.55, t + 0.004); gb.gain.setTargetAtTime(0, t + 0.004, tau * 0.35);
    // damper: notes are let go softly at their end
    g.gain.setValueAtTime(1, t); g.gain.setTargetAtTime(0, end, 0.35);
    fund.connect(gf).connect(lp); body.connect(gb).connect(lp); lp.connect(g).connect(this.out);
    const stop = end + 1.8;
    fund.start(t); body.start(t); fund.stop(stop); body.stop(stop);
    fund.onended = () => { for (const n of [fund, body, gf, gb, lp, g]) n.disconnect(); }; // unplug finished notes (see GameAudio.done)
  }
}

/** Build one piece: returns { events: [{t, midi, vel, dur}], length } */
export function compose(rnd) {
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const prog = pick(PROGS);
  const key = pick(KEYS);
  const scale = SCALES[prog.mode];
  const bpm = 56 + rnd() * 14;
  const beat = 60 / bpm;
  const meter = rnd() < 0.3 ? 3 : 4;
  const events = [];
  const human = () => (rnd() - 0.5) * 0.03;

  // all scale notes in the melody register
  const melodyNotes = [];
  for (let m = 64; m <= 86; m++) if (scale.includes(((m - key) % 12 + 12) % 12)) melodyNotes.push(m);
  const nearestIdx = (m) => melodyNotes.reduce((bi, n, i) => (Math.abs(n - m) < Math.abs(melodyNotes[bi] - m) ? i : bi), 0);

  // a motif: rhythm in beats + scale-step contour
  const makeMotif = () => {
    const rhythms = meter === 4
      ? [[1, 1, 2], [1.5, 0.5, 2], [0.5, 0.5, 1, 2], [2, 1, 1], [1, 0.5, 0.5, 2], [3, 1]]
      : [[1, 1, 1], [2, 1], [1.5, 0.5, 1], [1, 2]];
    const r = pick(rhythms);
    let step = 0;
    const steps = r.map((_, i) => { if (i > 0) step += pick([-2, -1, -1, 1, 1, 2, 0, 3, -3]); return step; });
    return { r, steps };
  };
  const A = makeMotif(), B = makeMotif();

  let t = 0;
  const lhPattern = pick(meter === 4
    ? [[[0, 0], [1, 2], [2, 1], [3, 3]], [[0, 0], [0.5, 2], [1, 1], [2, 3], [3, 1]], [[0, 0], [1, 1], [1.5, 2], [2.5, 3]]]
    : [[[0, 0], [1, 1], [2, 2]], [[0, 0], [0.5, 2], [1, 1], [2, 3]]]);

  const bar = (ci, opts = {}) => {
    const [ro, qn] = prog.chords[ci % prog.chords.length];
    const root = key + ro - (key + ro > 57 ? 12 : 0);
    const tones = Q[qn].map((s) => root + s);
    const len = meter * beat * (opts.rit ? 1.18 : 1);
    const k = len / meter;
    // left hand: spread, pedalled broken chord (bass, fifth/tenth, top colour)
    if (!opts.noLH) {
      const voice = [root - 12, tones[2], tones[1] + 12, tones[tones.length - 1]];
      for (const [b, vi] of lhPattern) {
        const m = voice[vi];
        events.push({ t: t + b * k + human(), midi: m, vel: (vi === 0 ? 0.36 : 0.3) * (opts.soft ?? 1) * (0.9 + rnd() * 0.2), dur: len - b * k + 0.4 });
      }
    }
    // right hand melody
    if (opts.motif) {
      const mo = opts.motif;
      const anchor = pick(tones.slice(1)) + 12 * (opts.high ? 2 : 1);
      let base = nearestIdx(anchor) + (opts.shift || 0);
      let bt = 0;
      mo.r.forEach((d, i) => {
        let idx = Math.max(0, Math.min(melodyNotes.length - 1, base + mo.steps[i] + (opts.vary && i === mo.r.length - 1 ? pick([-1, 1, 2]) : 0)));
        const last = i === mo.r.length - 1;
        events.push({ t: t + bt * k + human(), midi: melodyNotes[idx], vel: (last ? 0.52 : 0.62) * (0.9 + rnd() * 0.2), dur: d * k + (last ? 1.2 : 0.15) });
        // occasional soft grace note a third below on long notes
        if (d >= 2 && rnd() < 0.3) events.push({ t: t + bt * k + 0.5 * k, midi: melodyNotes[Math.max(0, idx - 2)], vel: 0.25, dur: k * 1.2 });
        bt += d;
      });
    }
    t += len;
  };

  // form
  bar(0, { soft: 0.8 }); bar(1, { soft: 0.85 });                       // intro
  for (let i = 0; i < 4; i++) bar(i, { motif: i % 2 === 0 ? A : null, rit: i === 3 }); // A: motif, then breathe
  for (let i = 0; i < 4; i++) bar(i, { motif: A, vary: i >= 2 });       // A'
  for (let i = 0; i < 4; i++) bar(i + 2, { motif: i % 2 ? null : B, high: true, rit: i === 3 }); // B
  for (let i = 0; i < 4; i++) bar(i, { motif: i < 3 ? A : null, vary: i === 1, soft: 0.9 }); // A''
  // outro: a rolled tonic chord left ringing
  const [ro, qn] = prog.chords[0];
  const root = key + ro - (key + ro > 57 ? 12 : 0);
  Q[qn].map((s) => root + s).concat([root - 12, root + 24]).sort((a, b) => a - b)
    .forEach((m, i) => events.push({ t: t + i * 0.09, midi: m, vel: 0.36, dur: 6 }));
  t += 7;
  events.sort((a, b) => a.t - b.t);
  return { events, length: t };
}
