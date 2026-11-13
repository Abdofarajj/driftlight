// One post pass for the whole game: half/quarter-res bloom, warm grade, plum black lift,
// watercolour edge darkening, paper grain, vignette. Always on (also in captures).
import {
  WebGLRenderTarget, ShaderMaterial, Mesh, PlaneGeometry, OrthographicCamera, Scene,
  HalfFloatType, LinearFilter, Vector2,
} from 'three';
import { PAL } from './palette.js';

const QUAD_VERT = /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

export class Post {
  constructor(renderer) {
    this.r = renderer;
    this.cam = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.quad = new Mesh(new PlaneGeometry(2, 2));
    this.scene = new Scene();
    this.scene.add(this.quad);
    const opts = { type: HalfFloatType, minFilter: LinearFilter, magFilter: LinearFilter };
    this.main = new WebGLRenderTarget(1, 1, { ...opts, samples: 4 });
    this.b1 = new WebGLRenderTarget(1, 1, opts);
    this.b2 = new WebGLRenderTarget(1, 1, opts);
    this.b3 = new WebGLRenderTarget(1, 1, opts);
    this.b4 = new WebGLRenderTarget(1, 1, opts);

    this.bright = new ShaderMaterial({
      uniforms: { tSrc: { value: null }, uThr: { value: 0.9 } },
      vertexShader: QUAD_VERT,
      fragmentShader: /* glsl */ `uniform sampler2D tSrc; uniform float uThr; varying vec2 vUv;
        void main(){ vec3 c = texture2D(tSrc, vUv).rgb; float l = max(c.r, max(c.g, c.b));
          float k = smoothstep(uThr, uThr + 0.35, l); gl_FragColor = vec4(c * k, 1.0); }`,
    });
    this.blur = new ShaderMaterial({
      uniforms: { tSrc: { value: null }, uDir: { value: new Vector2() } },
      vertexShader: QUAD_VERT,
      fragmentShader: /* glsl */ `uniform sampler2D tSrc; uniform vec2 uDir; varying vec2 vUv;
        void main(){
          vec3 s = texture2D(tSrc, vUv).rgb * 0.227;
          s += texture2D(tSrc, vUv + uDir*1.38).rgb * 0.316; s += texture2D(tSrc, vUv - uDir*1.38).rgb * 0.316;
          s += texture2D(tSrc, vUv + uDir*3.23).rgb * 0.070; s += texture2D(tSrc, vUv - uDir*3.23).rgb * 0.070;
          gl_FragColor = vec4(s, 1.0); }`,
    });
    this.final = new ShaderMaterial({
      uniforms: {
        tSrc: { value: null }, tB1: { value: null }, tB2: { value: null },
        uRes: { value: new Vector2() }, uPlum: { value: PAL.plum.clone() },
        uVig: { value: PAL.hazeLow.clone() }, uBloom: { value: 0.5 }, uTime: { value: 0 },
      },
      vertexShader: QUAD_VERT,
      fragmentShader: /* glsl */ `
        uniform sampler2D tSrc, tB1, tB2; uniform vec2 uRes; uniform vec3 uPlum, uVig; uniform float uBloom, uTime;
        varying vec2 vUv;
        float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float n2(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
          return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
        float lum(vec3 c){ return dot(c, vec3(0.3,0.55,0.15)); }
        void main(){
          vec2 px = 1.0 / uRes;
          // slight paper-fibre wobble of the sample position = soft painted edges
          float sc = uRes.y / 900.0;
          vec2 wob = (vec2(n2(vUv*uRes/(7.0*sc)), n2(vUv*uRes/(7.0*sc)+19.0)) - 0.5) * px * 1.6 * sc;
          vec3 c = texture2D(tSrc, vUv + wob).rgb;
          // watercolour pigment pooling: darken where luminance changes (cheap edge)
          float l0 = lum(c);
          float e = abs(l0 - lum(texture2D(tSrc, vUv + vec2(px.x*1.5*sc,0.0)).rgb))
                  + abs(l0 - lum(texture2D(tSrc, vUv + vec2(0.0,px.y*1.5*sc)).rgb));
          c *= 1.0 - clamp(e * 0.9, 0.0, 0.16);
          // bloom
          vec3 b = texture2D(tB1, vUv).rgb * 0.6 + texture2D(tB2, vUv).rgb * 0.9;
          c += b * uBloom;
          // grade: soft shoulder, lift darks to plum, warm the mids
          c = c / (1.0 + max(c - 1.0, 0.0));
          c = mix(uPlum, vec3(1.0), c) * 0.18 + c * 0.82;
          c *= vec3(1.03, 1.0, 0.97);
          // paper grain (fine) + paper fibres (larger blotches)
          float g = h(floor(vUv * uRes / max(sc,1.0))) - 0.5;
          float f = n2(vUv * uRes / (90.0*sc)) - 0.5;
          c *= 1.0 + g * 0.045 + f * 0.06;
          // vignette toward lavender haze
          vec2 q = vUv - 0.5; float v = smoothstep(0.35, 0.85, length(q * vec2(1.0, 1.1)));
          c = mix(c, c * uVig * 1.1, v * 0.55);
          gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
        }`,
    });
  }

  setSize(w, h) {
    this.main.setSize(w, h);
    this.b1.setSize(Math.max(1, w >> 2), Math.max(1, h >> 2));
    this.b2.setSize(Math.max(1, w >> 2), Math.max(1, h >> 2));
    this.b3.setSize(Math.max(1, w >> 3), Math.max(1, h >> 3));
    this.b4.setSize(Math.max(1, w >> 3), Math.max(1, h >> 3));
    this.final.uniforms.uRes.value.set(w, h);
  }

  pass(mat, target) {
    this.quad.material = mat;
    this.r.setRenderTarget(target);
    this.r.render(this.scene, this.cam);
  }

  blurInto(src, tmp, w, h) {
    this.blur.uniforms.tSrc.value = src.texture;
    this.blur.uniforms.uDir.value.set(1 / w, 0);
    this.pass(this.blur, tmp);
    this.blur.uniforms.tSrc.value = tmp.texture;
    this.blur.uniforms.uDir.value.set(0, 1 / h);
    this.pass(this.blur, src);
  }

  render(scene, camera, time) {
    const r = this.r;
    r.setRenderTarget(this.main);
    r.render(scene, camera);
    this.bright.uniforms.tSrc.value = this.main.texture;
    this.pass(this.bright, this.b1);
    this.blurInto(this.b1, this.b2, this.b1.width, this.b1.height);
    // second, wider level
    this.blur.uniforms.tSrc.value = this.b1.texture;
    this.blur.uniforms.uDir.value.set(0, 0);
    this.pass(this.blur, this.b3);
    this.blurInto(this.b3, this.b4, this.b3.width, this.b3.height);
    this.blurInto(this.b3, this.b4, this.b3.width / 2, this.b3.height / 2);
    const f = this.final.uniforms;
    f.tSrc.value = this.main.texture; f.tB1.value = this.b1.texture; f.tB2.value = this.b3.texture; f.uTime.value = time;
    this.pass(this.final, null);
  }
}
