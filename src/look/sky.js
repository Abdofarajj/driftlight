// Sky dome, low sun, distant light beam, cloud sea, distant floating islands.
import {
  Mesh, SphereGeometry, ShaderMaterial, BackSide, Group, IcosahedronGeometry, CylinderGeometry,
  InstancedMesh, Object3D, Vector3, PlaneGeometry, AdditiveBlending, CanvasTexture, Sprite, SpriteMaterial,
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
      },
      vertexShader: /* glsl */ `varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position.z = gl_Position.w; }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uTop, uMid, uHor, uSun, uLow, uSunDir; varying vec3 vD;
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
      const near = Math.min(Math.hypot(px, pz) - 30, Math.hypot(px - 50, pz - 8) - 14, Math.abs(pz - 7.5) - 9 + (px < 18 || px > 60 ? 99 : 0));
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
    uniforms: { uA: { value: PAL.cloud[0] }, uB: { value: PAL.hazeLow }, uTime: shared.uTime },
    vertexShader: /* glsl */ `varying vec3 vW; void main(){ vec4 w = modelMatrix*vec4(position,1.0); vW=w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }`,
    fragmentShader: /* glsl */ `uniform vec3 uA, uB; uniform float uTime; varying vec3 vW;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
      float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y); }
      void main(){ vec2 p = vW.xz*0.02 + uTime*0.003; float k = n(p)*0.6 + n(p*2.7)*0.4;
        gl_FragColor = vec4(mix(uB, uA, smoothstep(0.3, 0.8, k)*0.7), 1.0); }`,
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
    [70, 6, -120, 16], [-110, 14, -90, 20], [130, -2, -40, 12], [-60, 22, -200, 26], [40, 30, -260, 30], [160, 10, -170, 18], [-170, -4, 20, 14],
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
  const g = new Group();
  const items = [];
  for (let i = 0; i < count; i++) {
    const s = new Sprite(new SpriteMaterial({ map: tex, blending: AdditiveBlending, depthWrite: false, transparent: true }));
    const a = r() * Math.PI * 2, d = Math.sqrt(r()) * radius;
    s.userData = { x: Math.cos(a) * d, z: Math.sin(a) * d, y: 0.4 + r() * 6, ph: r() * 10, sp: 0.2 + r() * 0.5, sz: 0.08 + r() * 0.16 };
    g.add(s);
    items.push(s);
  }
  g.userData.update = (t) => {
    for (const s of items) {
      const u = s.userData;
      const y = ((u.y + t * u.sp * 0.4) % 7);
      s.position.set(u.x + Math.sin(t * 0.5 + u.ph) * 0.6, y, u.z + Math.cos(t * 0.4 + u.ph) * 0.6);
      const tw = 0.6 + 0.4 * Math.sin(t * 2.5 + u.ph * 3);
      s.scale.setScalar(u.sz * (0.7 + tw * 0.6));
      s.material.opacity = tw * Math.min(1, y) * Math.min(1, (7 - y));
    }
  };
  return g;
}
