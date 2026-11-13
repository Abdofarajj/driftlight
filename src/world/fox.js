// The little light fox: a fox made of soft light, asleep in the roots of a big tree. Walk close and it
// wakes, stretches, yips, and trots after you for a while before curling up in its nest again.
import { Group, Mesh, SphereGeometry, ConeGeometry, CylinderGeometry, Vector3 } from 'three';
import { makeGlowMaterial, makeWatercolorMaterial } from '../look/material.js';
import { PAL } from '../look/palette.js';
import { groundHeight, onIsland } from './forest.js';

const WAKE_R = 3.2, FOLLOW_GAP = 1.7, FOLLOW_SECS = 45, SPEED = 4.6;
const lerp = (a, b, k) => a + (b - a) * k;

function makeFoxModel() {
  const glow = makeGlowMaterial(PAL.foxCore, PAL.foxHalo, 0.95);
  const tip = makeGlowMaterial(PAL.glowCore, PAL.foxCore, 1.25);
  const dark = makeWatercolorMaterial({ lit: PAL.eye, rim: 0.1 });
  const root = new Group();
  const body = new Mesh(new SphereGeometry(0.22, 16, 12).scale(0.75, 0.68, 1.25), glow); root.add(body);
  const head = new Group(); root.add(head);
  head.add(new Mesh(new SphereGeometry(0.15, 16, 12).scale(1.05, 0.95, 1), glow));
  const snout = new Mesh(new ConeGeometry(0.075, 0.2, 10).rotateX(Math.PI / 2).translate(0, -0.03, 0.18), glow); head.add(snout);
  const nose = new Mesh(new SphereGeometry(0.022, 8, 6), dark); nose.position.set(0, -0.03, 0.28); head.add(nose);
  const ears = [-1, 1].map((s) => { const e = new Mesh(new ConeGeometry(0.06, 0.17, 8).translate(0, 0.085, 0), tip); e.position.set(s * 0.085, 0.1, -0.02); e.rotation.z = -s * 0.25; head.add(e); return e; });
  const eyes = [-1, 1].map((s) => { const e = new Mesh(new SphereGeometry(0.022, 8, 6), dark); e.position.set(s * 0.065, 0.03, 0.125); head.add(e); return e; });
  const tail = [0.13, 0.11, 0.085, 0.06].map((r, i) => { const t = new Mesh(new SphereGeometry(r, 12, 10), i === 3 ? tip : glow); root.add(t); return t; });
  const legs = [[-1, 1], [1, 1], [-1, -1], [1, -1]].map(([sx, sz]) => {
    const l = new Mesh(new CylinderGeometry(0.03, 0.025, 0.22, 6).translate(0, -0.11, 0), glow); l.position.set(sx * 0.08, 0.2, sz * 0.13); root.add(l); return l;
  });
  return { root, body, head, ears, eyes, tail, legs };
}

export class LightFox {
  /** nest: where it sleeps (x, z); facing: radians it curls towards */
  constructor(scene, x, z, facing, colliders, motes) {
    this.m = makeFoxModel();
    this.nest = new Vector3(x, groundHeight(x, z), z);
    this.pos = this.nest.clone();
    this.heading = facing;
    this.state = 'sleep'; // sleep | waking | follow | home | settle
    this.k = 0;            // 0 curled up .. 1 standing
    this.timer = 0;
    this.speed = 0;
    this.colliders = colliders;
    this.motes = motes;
    this.zzz = 0;
    this.woke = false;     // first wake = the discovery
    this.events = [];      // yips for the caller to play
    this.nestFacing = facing;
    scene.add(this.m.root);
  }

  update(dt, t, travelers) {
    const near = travelers.map((p) => ({ p, d: Math.hypot(p.x - this.pos.x, p.z - this.pos.z) })).sort((a, b) => a.d - b.d)[0];
    let want = null;
    switch (this.state) {
      case 'sleep':
        this.k = Math.max(0, this.k - dt * 1.5);
        if ((this.zzz -= dt) < 0) { this.zzz = 1.6; this.motes.emit(this.headWorld(), 1, { speed: 0.15, up: 0.5, life: 2.2, size: 0.12, spread: 0.05, grav: 0.05, drag: 0.5 }); }
        if (near && near.d < WAKE_R) { this.state = 'waking'; this.timer = 0; }
        break;
      case 'waking':
        this.timer += dt;
        this.k = Math.min(1, this.timer / 1.1);
        if (near) this.turnTo(Math.atan2(near.p.x - this.pos.x, near.p.z - this.pos.z), dt, 3);
        if (this.timer > 0.55 && !this.yipped) { this.yipped = true; this.events.push({ type: 'yip', first: !this.woke }); this.woke = true; this.motes.emit(this.headWorld(), 14, { speed: 1.4, up: 1.2, life: 1.1, size: 0.18 }); }
        if (this.timer > 1.3) { this.state = 'follow'; this.timer = 0; this.yipped = false; }
        break;
      case 'follow':
        this.timer += dt;
        if (!near || near.d > 25 || this.timer > FOLLOW_SECS) { this.state = 'home'; break; }
        if (near.d > FOLLOW_GAP) want = near.p;
        else this.turnTo(Math.atan2(near.p.x - this.pos.x, near.p.z - this.pos.z), dt, 4);
        if (Math.random() < dt * 0.25 && this.speed < 0.3) { this.hop = 0.45; this.events.push({ type: 'yip', first: false }); }
        break;
      case 'home':
        want = this.nest;
        if (Math.hypot(this.nest.x - this.pos.x, this.nest.z - this.pos.z) < 0.3) { this.state = 'settle'; this.timer = 0; }
        else if (near && near.d < 1.2 && this.timer > 0) { /* polite: wait while you stand in the way */ }
        break;
      case 'settle':
        this.timer += dt;
        this.turnTo(this.nestFacing ?? this.heading, dt, 2);
        this.k = Math.max(0, 1 - this.timer / 1.4);
        if (this.timer > 1.4) { this.state = 'sleep'; this.timer = 0; }
        if (near && near.d < WAKE_R * 0.6 && this.timer > 0.6) { this.state = 'waking'; this.timer = 0.6; }
        break;
      default: break;
    }
    // trot towards `want`, staying on the main island and out of rocks and trunks
    const wd = want ? Math.hypot(want.x - this.pos.x, want.z - this.pos.z) : 0;
    if (want && wd > 0.02) {
      const dx = want.x - this.pos.x, dz = want.z - this.pos.z, d = wd;
      const target = Math.min(SPEED, d * 2.2);
      this.speed = lerp(this.speed, target, Math.min(1, dt * 6));
      const nx = this.pos.x + (dx / d) * this.speed * dt, nz = this.pos.z + (dz / d) * this.speed * dt;
      if (onIsland(nx, nz)) { this.pos.x = nx; this.pos.z = nz; } else this.speed *= 0.5;
      this.turnTo(Math.atan2(dx, dz), dt, 8);
      if (this.speed > 1 && Math.random() < dt * 6) this.motes.emit(this.tailWorld(), 1, { speed: 0.2, up: 0.3, life: 0.9, size: 0.1, spread: 0.05 });
    } else this.speed = lerp(this.speed, 0, Math.min(1, dt * 8));
    this.pushOut();
    this.pos.y = groundHeight(this.pos.x, this.pos.z);
    this.hop = Math.max(0, (this.hop || 0) - dt);
    this.pose(t);
  }

  turnTo(h, dt, rate) { let d = h - this.heading; d = Math.atan2(Math.sin(d), Math.cos(d)); this.heading += d * Math.min(1, dt * rate); }

  pushOut() {
    const p = this.pos;
    for (const c of this.colliders) {
      if (c.off) continue;
      let cx, cz;
      if (c.ax !== undefined) {
        const abx = c.bx - c.ax, abz = c.bz - c.az;
        const t = Math.max(0, Math.min(1, ((p.x - c.ax) * abx + (p.z - c.az) * abz) / (abx * abx + abz * abz)));
        cx = c.ax + abx * t; cz = c.az + abz * t;
      } else { cx = c.x; cz = c.z; }
      const ex = p.x - cx, ez = p.z - cz, d = Math.hypot(ex, ez), r = c.r + 0.2;
      if (d < r && d > 1e-5) { p.x = cx + (ex / d) * r; p.z = cz + (ez / d) * r; }
    }
  }

  headWorld() { return this.m.head.getWorldPosition(new Vector3()); }
  tailWorld() { return this.m.tail[3].getWorldPosition(new Vector3()); }

  /** blend between curled up asleep (k = 0) and standing (k = 1), plus breathing, trotting and wagging */
  pose(t) {
    const { root, body, head, ears, eyes, tail, legs } = this.m, k = this.k;
    const trot = Math.min(1, this.speed / 2.5);
    const hop = this.hop > 0 ? Math.sin((0.45 - this.hop) / 0.45 * Math.PI) * 0.35 : 0;
    root.position.set(this.pos.x, this.pos.y + hop + Math.abs(Math.sin(t * 13)) * 0.05 * trot, this.pos.z);
    root.rotation.y = this.heading;
    const breathe = 1 + Math.sin(t * 1.7) * 0.05 * (1 - k);
    body.position.set(0, lerp(0.13, 0.3, k), 0);
    body.rotation.set(0, lerp(0.5, 0, k), 0);
    body.scale.set(1, breathe, 1);
    head.position.set(lerp(0.13, 0, k), lerp(0.14, 0.45, k), lerp(0.2, 0.27, k));
    head.rotation.set(lerp(0.35, -0.1 + Math.sin(t * 0.8) * 0.06, k), lerp(-0.6, 0, k), lerp(0.45, Math.sin(t * 1.1) * 0.1 * (1 - trot), k));
    eyes.forEach((e) => { e.scale.set(1, lerp(0.15, 1, Math.min(1, k * 1.6)), 1); });
    ears.forEach((e, i) => { e.rotation.x = lerp(0.7, -0.1 + (i ? Math.sin(t * 3) * 0.08 : 0), k); });
    const wag = Math.sin(t * (6 + trot * 4)) * 0.12 * k;
    // tail: wrapped round the front when asleep, up and back (and wagging) when standing
    const sleepTail = [[-0.2, 0.12, -0.18], [-0.27, 0.1, 0.05], [-0.18, 0.1, 0.25], [0.0, 0.1, 0.33]];
    const standTail = [[0, 0.36, -0.3], [wag, 0.45, -0.42], [wag * 1.6, 0.56, -0.5], [wag * 2.2, 0.66, -0.55]];
    tail.forEach((s, i) => s.position.set(lerp(sleepTail[i][0], standTail[i][0], k), lerp(sleepTail[i][1], standTail[i][1], k), lerp(sleepTail[i][2], standTail[i][2], k)));
    legs.forEach((l, i) => { l.scale.y = Math.max(0.01, k); l.position.y = lerp(0.13, 0.22, k); l.rotation.x = Math.sin(t * 13 + (i % 2 ? Math.PI : 0) + (i > 1 ? Math.PI : 0)) * 0.6 * trot; });
  }
}
