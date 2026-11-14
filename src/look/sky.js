// Sky dome, low sun, distant light beam, cloud sea, distant floating islands.
import {
  Mesh, SphereGeometry, ShaderMaterial, BackSide, Group, IcosahedronGeometry, CylinderGeometry,
  InstancedMesh, Object3D, Vector3, PlaneGeometry, AdditiveBlending, CanvasTexture, InstancedBufferGeometry, InstancedBufferAttribute,
} from 'three';
import { PAL } from './palette.js';
import { shared, makeWatercolorMaterial } from './material.js';
import { rng } from '../world/rng.js';
import { displace } from '../world/shapes.js';

export function makeSky() {
  const g = new Group();
  const sunDir = shared.uSunDir.value;
  const dome = new Mesh(
    new SphereGeometry(900, 32, 16),
    new ShaderMaterial({
      side: BackSide,
      depthWrite: false,
      uniforms: {
        uTop: { value: PAL.skyTop }, uMid: { value: PAL.skyMid }, uHor: { value: PAL.skyHorizon },
        uSun: { value: PAL.sun }, uLow: { value: PAL.hazeLow }, uSunDir: shared.uSunDir,
        uNight: shared.uNight, uNightSky: { value: PAL.nightSky }, uNightHaze: { value: PAL.nightHaze },
      },
      vertexShader: /* glsl */ `varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position.z = gl_Position.w; }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uTop, uMid, uHor, uSun, uLow, uSunDir; uniform float uNight; uniform vec3 uNightSky, uNightHaze; varying vec3 vD;
        float h(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,37.719)))*43758.5453); }
        float n3(vec3 x){ vec3 i=floor(x), f=fract(x); f=f*f*(3.0-2.0*f);
          return mix(mix(mix(h(i),h(i+vec3(1,0,0)),f.x),mix(h(i+vec3(0,1,0)),h(i+vec3(1,1,0)),f.x),f.y),
                     mix(mix(h(i+vec3(0,0,1)),h(i+vec3(1,0,1)),f.x),mix(h(i+vec3(0,1,1)),h(i+vec3(1,1,1)),f.x),f.y),f.z); }
        void main(){
          vec3 d = normalize(vD);
          float y = d.y;
          vec3 c = mix(uHor, uMid, smoothstep(0.0, 0.18, y));
          c = mix(c, uTop, smoothstep(0.15, 0.65, y));
          c = mix(c, uLow, smoothstep(0.0, -0.25, y));
          // painted cloud streaks in the sky
          float s = n3(vec3(d.x*4.0, d.y*14.0, d.z*4.0)) * 0.6 + n3(vec3(d.x*9.0, d.y*30.0, d.z*9.0)) * 0.4;
          float band = smoothstep(0.05, 0.22, y) * smoothstep(0.55, 0.25, y);
          c = mix(c, mix(uMid, uHor, 0.5) * 1.04, smoothstep(0.55, 0.8, s) * band * 0.55);
          // sun glow
          float sd = max(dot(d, normalize(uSunDir * vec3(1.0, 0.25, 1.0))), 0.0);
          c += uSun * (pow(sd, 600.0) * 0.9 + pow(sd, 30.0) * 0.18 + pow(sd, 4.0) * 0.08);
          if (uNight > 0.0) { // under the Hollow's storm cloud: a deep lavender night with a few faint stars
            vec3 nc = mix(uNightHaze, uNightSky, smoothstep(-0.1, 0.5, y));
            float st = step(0.985, h(floor(d * 260.0))) * smoothstep(0.12, 0.4, y) * (0.5 + 0.5 * h(floor(d * 90.0)));
            nc += vec3(0.75, 0.78, 1.0) * st * 0.5;
            c = mix(c, nc, uNight);
          }
          gl_FragColor = vec4(c, 1.0);
        }`,
    }),
  );
  dome.frustumCulled = false;
  dome.renderOrder = -10;
  g.add(dome);

  // Distant light beam on a far peak: the destination, visible from everywhere.
  const beamPos = new Vector3(-150, 0, -330);
  const peak = new Mesh(displace(new CylinderGeometry(4, 70, 110, 24, 8), 7, 0.035, 3), makeWatercolorMaterial({ lit: PAL.cliff, rim: 0.5 }));
  peak.position.copy(beamPos).setY(-25);
  g.add(peak);
  const beam = new Mesh(
    new PlaneGeometry(3.5, 600),
    new ShaderMaterial({
      transparent: true, depthWrite: false, blending: AdditiveBlending,
      uniforms: { uC: { value: PAL.glowCore }, uTime: shared.uTime },
      vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv=uv;
        vec4 mv = modelViewMatrix * vec4(0.0, position.y, 0.0, 1.0); mv.x += position.x; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: /* glsl */ `uniform vec3 uC; uniform float uTime; varying vec2 vUv;
        void main(){ float x = abs(vUv.x - 0.5) * 2.0; float a = pow(1.0 - x, 3.0) * smoothstep(1.0, 0.1, vUv.y) * smoothstep(0.0, 0.02, vUv.y);
          a *= 0.85 + 0.15 * sin(uTime * 2.0 + vUv.y * 30.0); gl_FragColor = vec4(uC * a * 0.9, 1.0); }`,
    }),
  );
  beam.position.copy(beamPos).setY(30 + 300);
  g.add(beam);

  g.add(makeCloudSea());
  g.add(makeDistantIslands());
  return g;
}

// the play space: islands (x, z, radius) and bridge corridors (ax, az, bx, bz, half width) that cloud tops stay out of
// (a 4th number k also keeps big puffs' bodies out: their size times k counts as extra distance)
const CLEAR = [[0, 0, 30], [50, 8, 14], [4, -49, 13], [-50, -7, 13], [-30, -88, 28], [25, -135, 31, 1], [85, -150, 27], [100, -85, 27], [45, -85, 21]];
const CORRIDORS = [[18, 7.5, 60, 7.5, 9], [2, -22, 4, -41, 7], [-1.3, -55, -16.7, -72.7, 8], [-18, -3, -42, -7, 8], [-15, -100, 8, -120, 8], [47.9, -140.7, 66.5, -145.4, 8], [89, -132.8, 96.1, -102, 8]];
function clearance(x, z, s = 0) {
  let d = Infinity;
  for (const [cx, cz, r, k = 0] of CLEAR) d = Math.min(d, Math.hypot(x - cx, z - cz) - r - k * s);
  for (const [ax, az, bx, bz, w] of CORRIDORS) {
    const abx = bx - ax, abz = bz - az, t = Math.max(0, Math.min(1, ((x - ax) * abx + (z - az) * abz) / (abx * abx + abz * abz)));
    d = Math.min(d, Math.hypot(x - ax - abx * t, z - az - abz * t) - w);
  }
  return d;
}

/** Puffy 3D clouds made of displaced spheres (instanced), plus a flat soft layer far below. */
function makeCloudSea() {
  const g = new Group();
  const r = rng(7);
  const geo = displace(new IcosahedronGeometry(1, 3), 0.12, 1.4, 2);
  const mat = makeWatercolorMaterial({ lit: PAL.cloud, rim: 0.55, wash: 0.05, lightRecv: 0.2 });
  const puffs = [];
  // A ring of cloud banks around and below the islands
  for (let i = 0; i < 70; i++) {
    const a = r() * Math.PI * 2;
    const d = 34 + r() * 160;
    const cx = Math.cos(a) * d, cz = Math.sin(a) * d;
    const cy = -10 - r() * 10 + Math.min(d / 40, 3);
    const n = 3 + Math.floor(r() * 5);
    const big = 4 + r() * 10 + d * 0.04;
    for (let k = 0; k < n; k++) {
      const s = big * (0.5 + r() * 0.6);
      const px = cx + (r() - 0.5) * big * 2.2, pz = cz + (r() - 0.5) * big * 1.6;
      let py = cy + r() * big * 0.5;
      // keep the play space clear: no cloud tops near the islands or the bridge corridor
      const near = clearance(px, pz, s);
      if (near < 12) py = Math.min(py, -6 - s * 0.6 - Math.max(0, 12 - near) * 0.4);
      puffs.push([px, py, pz, s, s * (0.7 + r() * 0.2), s]);
    }
  }
  const im = new InstancedMesh(geo, mat, puffs.length);
  const o = new Object3D();
  puffs.forEach((p, i) => { o.position.set(p[0], p[1], p[2]); o.scale.set(p[3], p[4], p[5]); o.updateMatrix(); im.setMatrixAt(i, o.matrix); });
  im.frustumCulled = false;
  g.add(im);

  // soft flat floor of cloud far below, so there is never "nothing" under the islands
  const floor = new Mesh(new PlaneGeometry(2400, 2400), new ShaderMaterial({
    uniforms: { uA: { value: PAL.cloud[0] }, uB: { value: PAL.hazeLow }, uTime: shared.uTime, uNight: shared.uNight, uN: { value: PAL.nightHaze } },
    vertexShader: /* glsl */ `varying vec3 vW; void main(){ vec4 w = modelMatrix*vec4(position,1.0); vW=w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }`,
    fragmentShader: /* glsl */ `uniform vec3 uA, uB, uN; uniform float uTime, uNight; varying vec3 vW;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
      float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y); }
      void main(){ vec2 p = vW.xz*0.02 + uTime*0.003; float k = n(p)*0.6 + n(p*2.7)*0.4;
        gl_FragColor = vec4(mix(mix(uB, uA, smoothstep(0.3, 0.8, k)*0.7), uN * (0.9 + k * 0.25), uNight), 1.0); }`,
  }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -22;
  g.add(floor);
  return g;
}

function makeDistantIslands() {
  const g = new Group();
  const r = rng(21);
  const top = makeWatercolorMaterial({ lit: PAL.grass, rim: 0.5 });
  const under = makeWatercolorMaterial({ lit: PAL.cliff, rim: 0.4 });
  const tree = makeWatercolorMaterial({ lit: PAL.canopy, rim: 0.5 });
  const spots = [
    [-75, 2, -215, 16], [-110, 14, -90, 20], [130, -2, -40, 12], [-95, 8, -265, 24], [70, 12, -330, 26], [160, 10, -170, 18], [-170, -4, 20, 14],
  ];
  for (const [x, y, z, s] of spots) {
    const isl = new Group();
    const cap = new Mesh(displace(new CylinderGeometry(s, s * 0.92, s * 0.25, 20, 2), s * 0.06, 0.15, 1), top);
    const cone = new Mesh(displace(new CylinderGeometry(s * 0.92, s * 0.1, s * 1.4, 20, 6), s * 0.12, 0.12, 2), under);
    cone.position.y = -s * 0.8;
    isl.add(cap, cone);
    for (let i = 0; i < 3; i++) {
      const t = new Mesh(new IcosahedronGeometry(s * (0.18 + r() * 0.12), 1), tree);
      t.position.set((r() - 0.5) * s, s * 0.35, (r() - 0.5) * s);
      t.scale.y = 0.8;
      isl.add(t);
    }
    isl.position.set(x, y, z);
    g.add(isl);
  }
  return g;
}

/** Floating sparkles / fireflies: one Points object. */
export function makeSparkles(count = 140, radius = 26) {
  const r = rng(99);
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d');
  const grd = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,248,220,1)'); grd.addColorStop(0.25, 'rgba(255,214,140,0.7)'); grd.addColorStop(1, 'rgba(255,180,94,0)');
  x.fillStyle = grd; x.fillRect(0, 0, 64, 64);
  const tex = new CanvasTexture(c);
  // one instanced draw for all of them (they used to be 140 separate sprites): drift, rise and
  // twinkle are worked out on the GPU from each mote's own numbers
  const quad = new PlaneGeometry(1, 1);
  const geo = new InstancedBufferGeometry();
  geo.index = quad.index;
  geo.setAttribute('position', quad.attributes.position);
  geo.setAttribute('uv', quad.attributes.uv);
  const a = new Float32Array(count * 4), b = new Float32Array(count * 2);
  for (let i = 0; i < count; i++) {
    const ang = r() * Math.PI * 2, d = Math.sqrt(r()) * radius;
    const y = 0.4 + r() * 6, ph = r() * 10, sp = 0.2 + r() * 0.5, sz = 0.08 + r() * 0.16;
    a.set([Math.cos(ang) * d, Math.sin(ang) * d, y, ph], i * 4); b.set([sp, sz], i * 2);
  }
  geo.setAttribute('aA', new InstancedBufferAttribute(a, 4));
  geo.setAttribute('aB', new InstancedBufferAttribute(b, 2));
  geo.instanceCount = count;
  const mat = new ShaderMaterial({
    uniforms: { uTime: shared.uTime, map: { value: tex } },
    vertexShader: /* glsl */ `
      attribute vec4 aA; attribute vec2 aB; uniform float uTime;
      varying vec2 vUv; varying float vOp;
      void main(){
        float t = uTime;
        float y = mod(aA.z + t * aB.x * 0.4, 7.0);
        vec3 c = vec3(aA.x + sin(t * 0.5 + aA.w) * 0.6, y, aA.y + cos(t * 0.4 + aA.w) * 0.6);
        float tw = 0.6 + 0.4 * sin(t * 2.5 + aA.w * 3.0);
        vOp = tw * min(1.0, y) * min(1.0, 7.0 - y);
        vec4 mv = modelViewMatrix * vec4(c, 1.0);
        mv.xy += position.xy * aB.y * (0.7 + tw * 0.6);
        vUv = uv;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `uniform sampler2D map; varying vec2 vUv; varying float vOp;
      void main(){ vec4 tx = texture2D(map, vUv); gl_FragColor = vec4(tx.rgb, tx.a * vOp); }`,
    blending: AdditiveBlending, depthWrite: false, transparent: true,
  });
  const g = new Group();
  const m = new Mesh(geo, mat);
  m.frustumCulled = false;
  g.add(m);
  g.userData.update = () => {}; // all on the GPU now
  return g;
}
