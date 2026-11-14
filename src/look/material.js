// The one shared watercolour shader. Every mesh in the game uses these two factories.
import { ShaderMaterial, Vector3, Vector4, Color, DoubleSide, AdditiveBlending, Matrix4 } from 'three';
import { PAL } from './palette.js';

// the two travelers' lanterns + the 14 lanterns nearest the view (main.js updateLights).
// Every pixel loops over all of them, so this is one of the biggest costs on a phone.
export const MAX_LIGHTS = 16;

// Uniforms shared by every material (same object references, so updating once updates all).
export const shared = {
  uTime: { value: 0 },
  uSunDir: { value: new Vector3(-0.45, 0.72, -0.52).normalize() }, // low sun, behind the island
  uRim: { value: PAL.rim.clone() },
  uHaze: { value: PAL.haze.clone() },
  uHazeLow: { value: PAL.hazeLow.clone() },
  uHazeNear: { value: 28 },
  uHazeFar: { value: 140 },
  uLightPos: { value: Array.from({ length: MAX_LIGHTS }, () => new Vector3(0, -999, 0)) },
  uLightStr: { value: new Float32Array(MAX_LIGHTS) },
  uGlow: { value: PAL.glowHalo.clone() },
  // Whispering Hollow: a dark patch of world (x, z, radius, strength 0..1). Inside it only lights show
  // colour: each light keeps a pool around it whose size grows with its strength (main.js updateLights).
  uDark: { value: new Vector4(0, 0, 0, 0) },
  uNightCol: { value: PAL.night.clone() },
  uNight: { value: 0 }, // the sky and the cloud sea darken while the camera is in the dark
  // soft sun shadows, baked once from the still world (src/look/shadow.js); uShadowK 0 = off (night, or not baked)
  uShadowMap: { value: null },
  uShadowMat: { value: new Matrix4() },
  uShadowTexel: { value: 1 / 2048 },
  uShadowBias: { value: 0.001 },
  uShadowOffset: { value: 0.17 },
  uShadowK: { value: 0 },
};

const NOISE = /* glsl */ `
  float hash3(vec3 p){ p = fract(p*0.3183099 + 0.1); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
  float vnoise(vec3 x){
    vec3 i = floor(x); vec3 f = fract(x); f = f*f*(3.0-2.0*f);
    return mix(mix(mix(hash3(i+vec3(0,0,0)),hash3(i+vec3(1,0,0)),f.x),
                   mix(hash3(i+vec3(0,1,0)),hash3(i+vec3(1,1,0)),f.x),f.y),
               mix(mix(hash3(i+vec3(0,0,1)),hash3(i+vec3(1,0,1)),f.x),
                   mix(hash3(i+vec3(0,1,1)),hash3(i+vec3(1,1,1)),f.x),f.y),f.z);
  }
  float fbm(vec3 p){ float a=0.5, s=0.0; for(int i=0;i<3;i++){ s+=a*vnoise(p); p*=2.03; a*=0.5; } return s; }
`;

const VERT = /* glsl */ `
  uniform float uTime;
  uniform float uSway;
  attribute float aMix;
  #ifdef USE_SWAYH
    attribute float aSwayH; // baked (merged) meshes: the original local height, see merge.js
  #endif
  varying vec3 vWorld;
  varying vec3 vNormal;
  varying float vMix;
  varying vec3 vTint;
  void main(){
    vec4 local = vec4(position, 1.0);
    vec3 n = normal;
    mat4 m = modelMatrix;
    #ifdef USE_INSTANCING
      m = modelMatrix * instanceMatrix;
    #endif
    vec4 world = m * local;
    if (uSway > 0.0) {
      #ifdef USE_SWAYH
        float h = max(aSwayH, 0.0);
      #else
        float h = max(position.y, 0.0);
      #endif
      float ph = world.x*0.21 + world.z*0.17;
      world.x += sin(uTime*0.9 + ph) * uSway * h;
      world.z += cos(uTime*0.7 + ph*1.3) * uSway * h * 0.6;
    }
    vWorld = world.xyz;
    vNormal = normalize(mat3(m) * n);
    #ifdef USE_MIX
      vMix = aMix;
    #else
      vMix = 0.0;
    #endif
    vTint = vec3(1.0);
    #ifdef USE_INSTANCING_COLOR
      vTint = instanceColor;
    #endif
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const FRAG = /* glsl */ `
  uniform vec3 uLit; uniform vec3 uShade;
  uniform vec3 uLit2; uniform vec3 uShade2;
  uniform vec3 uSunDir; uniform vec3 uRim; uniform float uRimStr;
  uniform vec3 uHaze; uniform vec3 uHazeLow; uniform float uHazeNear; uniform float uHazeFar;
  uniform vec3 uLightPos[${MAX_LIGHTS}]; uniform float uLightStr[${MAX_LIGHTS}]; uniform vec3 uGlow;
  uniform vec4 uDark; uniform vec3 uNightCol;
  uniform sampler2DShadow uShadowMap; uniform mat4 uShadowMat; uniform float uShadowTexel, uShadowBias, uShadowOffset, uShadowK;
  uniform float uWash; uniform float uLightRecv; uniform float uDarkRecv; uniform float uTintMode; uniform float uBreak;
  varying vec3 vWorld; varying vec3 vNormal; varying float vMix; varying vec3 vTint;
  ${NOISE}
  // 0 = in sunlight, 1 = in the shade of something between here and the sun. Soft, blotchy edges (a few taps on
  // a ring that turns with world position), like a painted shadow rather than a crisp one.
  float sunShadow(vec3 p, vec3 n, float ndl, float wash){
    // off the surface along its normal, more where the sun grazes it (no speckled self-shadowing)
    vec3 q = (uShadowMat * vec4(p + n * uShadowOffset * (1.0 + 1.5 * (1.0 - clamp(ndl, 0.0, 1.0))), 1.0)).xyz;
    if (q.x <= 0.0 || q.x >= 1.0 || q.y <= 0.0 || q.y >= 1.0 || q.z >= 1.0) return 0.0;
    float a = wash * 12.0;
    float r = uShadowTexel * (1.6 + wash * 2.0);
    float z = q.z - uShadowBias, lit = texture(uShadowMap, vec3(q.xy, z));
    for (int i = 0; i < 4; i++) {
      float t = a + float(i) * 1.5708;
      lit += texture(uShadowMap, vec3(q.xy + vec2(cos(t), sin(t)) * r, z));
    }
    return 1.0 - lit / 5.0;
  }

  void main(){
    vec3 n = normalize(vNormal);
    if (!gl_FrontFacing) n = -n;
    vec3 V = normalize(cameraPosition - vWorld);
    vec3 lit = mix(uLit, uLit2, vMix);
    vec3 shade = mix(uShade, uShade2, vMix);
    if (uTintMode > 0.5) { lit *= vTint; shade = mix(shade, shade*vTint, 0.5); }

    // soft 3-band wrap light
    float ndl = dot(n, uSunDir);
    float w = clamp((ndl + 0.6) / 1.6, 0.0, 1.0);
    float wash = fbm(vWorld*0.55);
    w += (wash - 0.5) * 0.18;                // brush irregularity in the terminator
    // leafy / scalloped breakup (canopies): high-frequency cells shift the bands
    if (uBreak > 0.0) { float leaf = vnoise(vWorld*3.2) * 0.6 + vnoise(vWorld*7.0) * 0.4; w += (leaf - 0.5) * uBreak; }
    // sun shadows: whatever is shaded by a canopy, a wall or a rock drops into the shade bands
    float sh = uShadowK > 0.0 && ndl > -0.2 ? sunShadow(vWorld, n, ndl, wash) * uShadowK : 0.0;
    w = mix(w, min(w, 0.3), sh * 0.85);
    float band = smoothstep(0.2, 0.36, w)*0.55 + smoothstep(0.5, 0.66, w)*0.45;
    vec3 col = mix(shade, lit, band);
    col = mix(col, col * vec3(0.88, 0.84, 1.02), sh * 0.6); // shadows lean cool lavender

    // sky fill from above (lavender), bounce from below (warm)
    col += vec3(0.06,0.04,0.09) * clamp(n.y,0.0,1.0) * (1.0-band);
    // pigment wash variation
    col *= 1.0 + (fbm(vWorld*1.7 + 3.1) - 0.5) * uWash;

    // warm rim from the low back sun
    float fres = pow(1.0 - clamp(dot(n, V), 0.0, 1.0), 3.0);
    float back = clamp(dot(-V, uSunDir) * 0.6 + 0.55, 0.0, 1.0);
    col += uRim * fres * back * uRimStr * (1.0 - sh * 0.8);

    // lantern light pools
    float L = 0.0, pool = 0.0, dk = 0.0;
    if (uDark.w > 0.0) dk = uDark.w * (1.0 - smoothstep(uDark.z - 5.0, uDark.z + 5.0, length(vWorld.xz - uDark.xy))) * smoothstep(15.0, 9.0, vWorld.y) * uDarkRecv;
    for (int i = 0; i < ${MAX_LIGHTS}; i++) {
      if (uLightStr[i] <= 0.0) continue; // same for every pixel: a cheap skip
      vec3 d = uLightPos[i] - vWorld;
      float dd = dot(d, d);
      float facing = clamp(dot(n, normalize(d)) * 0.6 + 0.5, 0.0, 1.0);
      L += uLightStr[i] * facing * 0.32 / (1.0 + dd * 0.35);
      if (dk > 0.0) { float rr = 1.3 + uLightStr[i] * 5.2; pool = max(pool, smoothstep(rr, rr * 0.4, sqrt(dd) + (wash - 0.5) * 1.4)); }
    }
    col += uGlow * min(L, 0.55) * uLightRecv;
    // in the dark, colour only lives inside the light pools; outside them it sinks to deep lavender-indigo
    if (dk > 0.0) col = mix(col, col * vec3(0.22, 0.21, 0.36) + uNightCol * 0.34, dk * (1.0 - pool));

    // aerial haze: distance + below-island depth
    float dist = length(cameraPosition - vWorld);
    float f = smoothstep(uHazeNear, uHazeFar, dist);
    float low = smoothstep(-4.0, -26.0, vWorld.y);
    col = mix(col, uHazeLow, low * 0.75);
    col = mix(col, mix(uHaze, uHazeLow, low), f * 0.88);
    gl_FragColor = vec4(col, 1.0);
  }
`;

/**
 * @param {{lit: Color[] | Color, shade?: Color, lit2?: Color[], sway?: number, rim?: number,
 *   wash?: number, lightRecv?: number, tint?: boolean, mix?: boolean, side?: number}} o
 */
export function makeWatercolorMaterial(o) {
  const pair = Array.isArray(o.lit) ? o.lit : [o.lit, o.shade];
  const pair2 = o.lit2 || pair;
  const m = new ShaderMaterial({
    uniforms: {
      ...shared,
      uLit: { value: pair[0] }, uShade: { value: pair[1] },
      uLit2: { value: pair2[0] }, uShade2: { value: pair2[1] },
      uSway: { value: o.sway ?? 0 },
      uRimStr: { value: o.rim ?? 0.35 },
      uWash: { value: o.wash ?? 0.12 },
      uBreak: { value: o.breakup ?? 0 },
      uLightRecv: { value: o.lightRecv ?? 1 },
      uDarkRecv: { value: o.darkRecv ?? 1 }, // how much the Hollow's darkness takes (shadow creatures keep their colour)
      uTintMode: { value: o.tint ? 1 : 0 },
    },
    defines: o.mix ? { USE_MIX: '' } : {},
    vertexShader: VERT,
    fragmentShader: FRAG,
    side: o.side ?? 0,
  });
  m.userData.kind = 'watercolor'; // merge.js only bakes these
  return m;
}

const GLOW_VERT = /* glsl */ `
  uniform float uTime; uniform float uSway;
  varying vec3 vN; varying vec3 vW;
  void main(){
    mat4 m = modelMatrix;
    #ifdef USE_INSTANCING
      m = modelMatrix * instanceMatrix;
    #endif
    vec4 w = m * vec4(position,1.0);
    vW = w.xyz; vN = normalize(mat3(m)*normal);
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;
const GLOW_FRAG = /* glsl */ `
  uniform vec3 uCore; uniform vec3 uHalo; uniform float uStr;
  varying vec3 vN; varying vec3 vW;
  void main(){
    vec3 V = normalize(cameraPosition - vW);
    float f = clamp(dot(normalize(vN), V), 0.0, 1.0);
    vec3 c = mix(uHalo, uCore, smoothstep(0.1, 0.8, f));
    gl_FragColor = vec4(c * uStr, 1.0);
  }
`;

/** Emissive material for lanterns, stars, bridge ropes. Values > 0.85 feed the bloom. */
export function makeGlowMaterial(core = PAL.glowCore, halo = PAL.glowHalo, strength = 1.15) {
  const m = new ShaderMaterial({
    uniforms: { ...shared, uCore: { value: core.clone() }, uHalo: { value: halo.clone() }, uStr: { value: strength }, uSway: { value: 0 } },
    vertexShader: GLOW_VERT,
    fragmentShader: GLOW_FRAG,
  });
  m.userData.kind = 'glow';
  return m;
}

/** Thin coloured outline (inverted hull). Shadow colour, never black. */
export function makeOutlineMaterial(color, width = 0.02) {
  return new ShaderMaterial({
    uniforms: { uCol: { value: color.clone() }, uW: { value: width } },
    vertexShader: /* glsl */ `
      uniform float uW;
      void main(){
        vec4 w = modelMatrix * vec4(position + normal * uW, 1.0);
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */ `uniform vec3 uCol; void main(){ gl_FragColor = vec4(uCol,1.0); }`,
    side: 1, // BackSide
  });
}

/** Soft round sprite material for sparkles / blob shadows. */
export function makeSoftMaterial(color, opacity = 1, additive = false) {
  return new ShaderMaterial({
    uniforms: { uCol: { value: color.clone() }, uOp: { value: opacity } },
    vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; vec4 p = vec4(position,1.0);
      #ifdef USE_INSTANCING
        p = instanceMatrix * p;
      #endif
      gl_Position = projectionMatrix * modelViewMatrix * p; }`,
    fragmentShader: /* glsl */ `uniform vec3 uCol; uniform float uOp; varying vec2 vUv;
      void main(){ float d = length(vUv-0.5)*2.0; float a = smoothstep(1.0, 0.0, d); a*=a; gl_FragColor = vec4(uCol, a*uOp); }`,
    transparent: true,
    depthWrite: false,
    blending: additive ? AdditiveBlending : 1,
  });
}

/**
 * Water: soft lavender-white with drifting streaks, transparent. mode 0 = a falling sheet (uv.y up,
 * foam at the bottom, bright lip at the top), mode 1 = a still round pool (planar uv, soft round edge).
 */
export function makeWaterMaterial({ mode = 0, flow = 1.2, opacity = 0.62 } = {}) {
  return new ShaderMaterial({
    uniforms: { uTime: shared.uTime, uLit: { value: PAL.water[0].clone() }, uShade: { value: PAL.water[1].clone() }, uFlow: { value: flow }, uOp: { value: opacity }, uMode: { value: mode } },
    vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: /* glsl */ `uniform float uTime; uniform vec3 uLit; uniform vec3 uShade; uniform float uFlow; uniform float uOp; uniform float uMode; varying vec2 vUv;
      float h(float n){ return fract(sin(n) * 43758.5453); }
      float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        float a = h(i.x + i.y * 57.0), b = h(i.x + 1.0 + i.y * 57.0), c = h(i.x + (i.y + 1.0) * 57.0), d = h(i.x + 1.0 + (i.y + 1.0) * 57.0);
        return mix(mix(a, b, f.x), mix(c, d, f.x), f.y); }
      void main(){
        float s, edge, foam = 0.0;
        if (uMode < 0.5) {
          vec2 p = vec2(vUv.x * 16.0, vUv.y * 2.5 + uTime * uFlow);
          s = vn(p) * 0.65 + vn(p * vec2(2.3, 1.7) + 7.0) * 0.35;
          edge = smoothstep(0.0, 0.14, vUv.x) * smoothstep(1.0, 0.86, vUv.x);
          foam = max(smoothstep(0.14, 0.0, vUv.y), smoothstep(0.9, 1.0, vUv.y) * 0.7);
        } else {
          vec2 q = vUv - 0.5;
          float r = length(q) * 2.0;
          s = vn(vec2(r * 9.0 - uTime * uFlow, atan(q.y, q.x) * 3.0)) * 0.5 + vn(vUv * 11.0 + uTime * 0.2) * 0.5;
          edge = smoothstep(1.0, 0.8, r);
          foam = smoothstep(0.7, 0.95, r) * edge * 0.6;
        }
        vec3 c = mix(uShade, uLit, 0.4 + s * 0.6);
        c = mix(c, vec3(1.0, 0.98, 0.95), foam * 0.75);
        float a = max(uOp * (0.55 + s * 0.45), foam * 0.85) * edge;
        gl_FragColor = vec4(c, a);
      }`,
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
  });
}

export { Color, DoubleSide };
