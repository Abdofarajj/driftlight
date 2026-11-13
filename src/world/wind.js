// Warm wind currents: step into the glowing updraft ring and the wind lifts you and carries you
// along a ribbon of light to another island. Visuals: flowing dash ribbons spiralling round the
// stream, drifting petals, and a swirl of light above each updraft ring.
import {
  Group, Mesh, TubeGeometry, CatmullRomCurve3, Vector3, ShaderMaterial, AdditiveBlending, InstancedMesh,
  PlaneGeometry, Object3D, TorusGeometry, Color, DoubleSide,
} from 'three';
import { shared, makeWatercolorMaterial, makeGlowMaterial } from '../look/material.js';
import { PAL } from '../look/palette.js';
import { rng } from './rng.js';

const STREAM_R = 4.2;   // how close to the stream you must be to be carried
const SPEED = 9.5;

function ribbonMaterial(color, speed, dashes) {
  return new ShaderMaterial({
    transparent: true, depthWrite: false, blending: AdditiveBlending, side: DoubleSide,
    uniforms: { uTime: shared.uTime, uCol: { value: color }, uSpeed: { value: speed }, uDash: { value: dashes } },
    vertexShader: /* glsl */ `varying vec2 vUv; varying float vD; void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(position,1.0); vD = -mv.z; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: /* glsl */ `uniform vec3 uCol; uniform float uTime, uSpeed, uDash; varying vec2 vUv; varying float vD;
      void main(){
        float x = fract(vUv.x * uDash - uTime * uSpeed);
        float dash = smoothstep(0.0, 0.25, x) * smoothstep(0.75, 0.35, x);
        float ends = smoothstep(0.0, 0.06, vUv.x) * smoothstep(1.0, 0.92, vUv.x);
        float near = smoothstep(1.0, 6.0, vD); // never flare up right in front of the camera
        gl_FragColor = vec4(uCol * dash * ends * near * 0.45, 1.0);
      }`,
  });
}

export class WindCurrent {
  constructor(points, seed = 1) {
    this.curve = new CatmullRomCurve3(points);
    this.samples = this.curve.getSpacedPoints(80);
    this.tangents = this.samples.map((_, i) => this.curve.getTangentAt(i / 80));
    this.start = points[0].clone();
    this.group = new Group();
    this.length = this.curve.getLength();
    const r = rng(seed);
    const warm = new Color('#ffd79a'), pink = new Color('#ffc2c8');

    // a soft core stream + 5 dashed ribbons twisting round it
    const helix = (offset, radius, turns) => {
      const pts = [];
      const N = 120;
      for (let i = 0; i <= N; i++) {
        const t = i / N;
        const p = this.curve.getPointAt(t);
        const T = this.curve.getTangentAt(t);
        const side = new Vector3(-T.z, 0, T.x).normalize();
        const up = new Vector3().crossVectors(side, T).normalize();
        const a = offset + t * turns * Math.PI * 2;
        const rad = radius * (0.4 + 0.6 * Math.sin(Math.PI * Math.min(1, t * 1.5)));
        pts.push(p.clone().addScaledVector(side, Math.cos(a) * rad).addScaledVector(up, Math.sin(a) * rad));
      }
      return new CatmullRomCurve3(pts);
    };
    for (let i = 0; i < 5; i++) {
      const c = helix((i / 5) * Math.PI * 2, 0.9 + r() * 0.7, 3 + r() * 2);
      const m = new Mesh(new TubeGeometry(c, 160, 0.025 + r() * 0.015, 4), ribbonMaterial(i % 2 ? warm : pink, 0.35 + r() * 0.25, 10 + Math.floor(r() * 8)));
      this.group.add(m);
    }

    // petals riding the wind
    const petalMat = makeWatercolorMaterial({ lit: [new Color('#ffd1dc'), new Color('#e7a3b8')], rim: 0.3, side: DoubleSide, tint: true });
    this.petals = new InstancedMesh(new PlaneGeometry(0.16, 0.11), petalMat, 46);
    this.petalData = Array.from({ length: 46 }, () => ({ u: r(), sp: 0.05 + r() * 0.05, a: r() * 6.28, rad: 0.3 + r() * 1.6, spin: r() * 6 }));
    const tints = [new Color('#ffffff'), new Color('#fff1c4'), new Color('#f6c8ff')];
    this.petalData.forEach((_, i) => this.petals.setColorAt(i, tints[i % 3]));
    this.petals.frustumCulled = false;
    this.group.add(this.petals);

    // updraft ring at the start
    const ringMat = makeGlowMaterial(PAL.glowCore, PAL.glowHalo, 0.9);
    const ring = new Mesh(new TorusGeometry(1.5, 0.06, 6, 48), ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.copy(this.start).setY(this.start.y + 0.08);
    this.group.add(ring);
    this.ring = ring;
    const swirl = [];
    for (let i = 0; i < 3; i++) {
      const pts = [];
      for (let k = 0; k <= 40; k++) {
        const t = k / 40, a = (i / 3) * Math.PI * 2 + t * Math.PI * 3;
        pts.push(new Vector3(this.start.x + Math.cos(a) * 1.3 * (1 - t * 0.4), this.start.y + t * 4, this.start.z + Math.sin(a) * 1.3 * (1 - t * 0.4)));
      }
      const m = new Mesh(new TubeGeometry(new CatmullRomCurve3(pts), 60, 0.04, 4), ribbonMaterial(warm, 0.6, 3));
      m.material.uniforms.uCol.value = new Color('#ffcf8a').multiplyScalar(0.8);
      this.group.add(m); swirl.push(m);
    }
    this._o = new Object3D();
    this._v = new Vector3();
  }

  update(t) {
    const o = this._o;
    this.petalData.forEach((d, i) => {
      const u = (d.u + t * d.sp) % 1;
      const p = this.curve.getPointAt(u);
      const a = d.a + t * 1.4;
      o.position.set(p.x + Math.cos(a) * d.rad, p.y + Math.sin(a) * d.rad * 0.7, p.z + Math.sin(a * 1.3) * d.rad);
      o.rotation.set(t * 2 + d.spin, t * 1.3 + d.spin, 0);
      const fade = Math.min(1, u * 8, (1 - u) * 8);
      o.scale.setScalar(fade);
      o.updateMatrix();
      this.petals.setMatrixAt(i, o.matrix);
    });
    this.petals.instanceMatrix.needsUpdate = true;
    this.ring.scale.setScalar(1 + Math.sin(t * 3) * 0.05);
  }

  /** nearest point on the stream: {i, d, p} */
  nearest(pos) {
    let best = 1e9, bi = 0;
    for (let i = 0; i < this.samples.length; i++) {
      const d = this.samples[i].distanceToSquared(pos);
      if (d < best) { best = d; bi = i; }
    }
    return { i: bi, d: Math.sqrt(best), p: this.samples[bi] };
  }

  /** Push an actor along the stream. Returns true while carrying it. */
  apply(act, dt) {
    const s = this.start;
    // updraft: standing in the ring launches you up into the stream
    if (Math.hypot(act.pos.x - s.x, act.pos.z - s.z) < 1.5 && Math.abs(act.pos.y - s.y) < 1.2 && act.vel.y < 6) {
      act.vel.y = 11; act.grounded = false;
      return true;
    }
    if (act.grounded) return false;
    const n = this.nearest(act.pos);
    const last = this.samples.length - 1;
    if (n.d > STREAM_R || n.i >= last - 1) return false;
    const T = this.tangents[Math.min(n.i + 2, last)];
    const k = 1 - Math.exp(-dt * 5);
    // flow along the stream and gently back toward its centre line
    const pull = 1.8;
    act.vel.x += (T.x * SPEED + (n.p.x - act.pos.x) * pull - act.vel.x) * k;
    act.vel.z += (T.z * SPEED + (n.p.z - act.pos.z) * pull - act.vel.z) * k;
    const ahead = this.samples[Math.min(n.i + 3, last)];
    const wantVy = (ahead.y + 0.3 - act.pos.y) * 3.5 + T.y * SPEED;
    act.vel.y += (wantVy - act.vel.y) * k;
    return true;
  }
}

export function buildWinds(world) {
  const gh = world.floorAt;
  const a = new Vector3(-18.5, gh(-18.5, -3.5), -3.5);
  const b = new Vector3(-45, 3.0, -11.5);
  const winds = [
    // main island west edge -> west meadow island
    new WindCurrent([a, new Vector3(-24, a.y + 5, -4), new Vector3(-33, a.y + 7.5, -5.5), new Vector3(-41, 6.5, -6.5), new Vector3(-49, 4.4, -6.5)], 3),
    // west meadow island -> back to the main island, landing by the north-west trees
    new WindCurrent([b, new Vector3(-38, b.y + 5, -13), new Vector3(-28, b.y + 6.5, -12), new Vector3(-18, 5.5, -10), new Vector3(-12, gh(-12, -9.5) + 2.5, -9.5), new Vector3(-7.5, gh(-7.5, -9.5) + 1.0, -9.5)], 5),
  ];
  return winds;
}
