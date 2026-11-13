import { WebGLRenderer, Scene, PerspectiveCamera, Vector3, ColorManagement, LinearSRGBColorSpace, NoToneMapping } from 'three';
import { Post } from './look/post.js';
import { shared, MAX_LIGHTS } from './look/material.js';
import { makeSky, makeSparkles } from './look/sky.js';
import { buildLanternForest } from './world/forest.js';
import { Traveler } from './player/traveler.js';
import { Input } from './input.js';
import { SHOTS } from './shots.js';

ColorManagement.enabled = false; // palette colours are used as-is

const params = new URLSearchParams(location.search);
const shotName = params.get('shot');
const shot = shotName ? SHOTS[shotName] : null;
if (shot) document.body.classList.add('shot');
if (shot && params.get('ui') === '1') document.body.classList.add('showui');

const canvas = document.getElementById('c');
const renderer = new WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.outputColorSpace = LinearSRGBColorSpace;
renderer.toneMapping = NoToneMapping;
const dpr = Math.min(devicePixelRatio, Number(params.get('dpr')) || (shot ? 3 : 2));
renderer.setPixelRatio(dpr);

const scene = new Scene();
const camera = new PerspectiveCamera(50, 1, 0.1, 2000);
const post = new Post(renderer);

scene.add(makeSky());
const world = buildLanternForest();
scene.add(world.root);
const sparkles = makeSparkles();
scene.add(sparkles);

// players: red = you, blue = friend (idle until round 2 online)
const me = new Traveler('red');
const friend = new Traveler('blue');
scene.add(me.root, me.shadow, friend.root, friend.shadow);

const state = {
  pos: world.spawn.clone(), vel: new Vector3(), heading: Math.PI, grounded: true, glide: false,
  camYaw: 0, camPitch: 0.36, camDist: 9,
};
state.pos.y = world.floorAt(state.pos.x, state.pos.z);
const friendPos = new Vector3(state.pos.x - 1.3, 0, state.pos.z + 0.2);
friendPos.y = world.floorAt(friendPos.x, friendPos.z);

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  post.setSize(Math.floor(w * dpr), Math.floor(h * dpr));
  camera.aspect = w / h;
  // portrait phones: wider vertical FOV and a bit further back so the world still reads
  const portrait = h > w;
  camera.fov = portrait ? 62 : 46;
  state.camDist = portrait ? 8.5 : 9.5;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

const input = shot ? null : new Input(canvas);

// ---- lights: nearest lanterns + the two player lanterns ----
const tmp = new Vector3();
function updateLights(focus) {
  const L = world.lights.map((l) => {
    l.obj.getWorldPosition(tmp);
    const p = tmp.clone(); if (l.offset) p.y += l.offset;
    return { p, s: l.str, d: p.distanceToSquared(focus) };
  }).sort((a, b) => a.d - b.d);
  const pos = shared.uLightPos.value, str = shared.uLightStr.value;
  let i = 0;
  for (const t of [me, friend]) { t.bulb.getWorldPosition(pos[i]); str[i] = 0.6; i++; }
  for (const l of L) { if (i >= MAX_LIGHTS) break; pos[i].copy(l.p); str[i] = l.s; i++; }
  for (; i < MAX_LIGHTS; i++) str[i] = 0;
}

function placeShadow(t, p) {
  const f = world.floorAt(p.x, p.z);
  if (f === null) { t.shadow.visible = false; return; }
  t.shadow.visible = true;
  t.shadow.position.set(p.x, f + 0.03, p.z);
  const h = Math.max(0, p.y - f);
  t.shadow.scale.setScalar(0.9 / (1 + h * 0.3));
}

// ---- movement ----
const GRAV = 24, JUMP = 8.2, SPEED = 4.6;
function step(dt) {
  input.update();
  const [dx, dy] = input.consumeCam();
  state.camYaw -= dx * 0.005;
  state.camPitch = Math.max(0.12, Math.min(0.9, state.camPitch + dy * 0.003));

  const fwd = new Vector3(-Math.sin(state.camYaw), 0, -Math.cos(state.camYaw));
  const right = new Vector3(-fwd.z, 0, fwd.x);
  const want = new Vector3().addScaledVector(right, input.move.x).addScaledVector(fwd, input.move.y);
  const mag = want.length();
  const accel = state.grounded ? 14 : 5;
  state.vel.x += (want.x * SPEED - state.vel.x) * Math.min(1, accel * dt);
  state.vel.z += (want.z * SPEED - state.vel.z) * Math.min(1, accel * dt);
  if (mag > 0.05) {
    const target = Math.atan2(want.x, want.z);
    let d = target - state.heading; d = Math.atan2(Math.sin(d), Math.cos(d));
    state.heading += d * Math.min(1, dt * 12);
  }
  if (input.consumeJump() && state.grounded) { state.vel.y = JUMP; state.grounded = false; }
  state.vel.y -= GRAV * dt;
  state.glide = !state.grounded && state.vel.y < 0 && input.jumpHeld;
  if (state.glide) state.vel.y = Math.max(state.vel.y, -1.8);

  const p = state.pos;
  p.addScaledVector(state.vel, dt);
  for (const c of world.colliders) {
    const ex = p.x - c.x, ez = p.z - c.z, d = Math.hypot(ex, ez), r = c.r + 0.3;
    if (d < r && d > 1e-4) { p.x = c.x + (ex / d) * r; p.z = c.z + (ez / d) * r; }
  }
  const f = world.floorAt(p.x, p.z);
  if (f !== null && p.y <= f + 0.02 && state.vel.y <= 0) {
    if (!state.grounded) me.land(Math.min(1, -state.vel.y / 14));
    p.y = f; state.vel.y = 0; state.grounded = true;
  } else if (f === null || p.y > f + 0.25) {
    state.grounded = false;
  } else if (state.grounded) {
    p.y = f;
  }
  if (p.y < -40) { p.copy(world.spawn); p.y = world.floorAt(p.x, p.z) + 3; state.vel.set(0, 0, 0); }
  return Math.min(1, Math.hypot(state.vel.x, state.vel.z) / SPEED);
}

// ---- loop ----
let last = performance.now();
let t = 0;
const camPos = new Vector3(), camLook = new Vector3();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (shot) {
    t = shot.time ?? 2.0;
    shot.apply({ me, friend, camera, world });
  } else {
    t += dt;
    const sp = step(dt);
    me.root.position.copy(state.pos);
    me.root.rotation.y = state.heading;
    me.animate(dt, t, sp, !state.grounded, state.glide);
    // friend idles and turns toward you
    friend.root.position.copy(friendPos);
    friend.root.rotation.y = Math.atan2(state.pos.x - friendPos.x, state.pos.z - friendPos.z) * 0.5 + Math.PI * 0.5;
    friend.animate(dt, t + 1.3, 0, false, false);

    const target = new Vector3(state.pos.x, state.pos.y + 1.1, state.pos.z);
    const cd = state.camDist;
    const want = new Vector3(
      target.x + Math.sin(state.camYaw) * Math.cos(state.camPitch) * cd,
      target.y + Math.sin(state.camPitch) * cd,
      target.z + Math.cos(state.camYaw) * Math.cos(state.camPitch) * cd,
    );
    if (camPos.lengthSq() === 0) { camPos.copy(want); camLook.copy(target); }
    camPos.lerp(want, 1 - Math.exp(-dt * 6));
    camLook.lerp(target, 1 - Math.exp(-dt * 10));
    camera.position.copy(camPos);
    camera.lookAt(camLook.x, camLook.y + 0.6, camLook.z);
  }
  placeShadow(me, me.root.position);
  placeShadow(friend, friend.root.position);
  shared.uTime.value = t;
  world.update(t);
  sparkles.userData.update(t);
  sparkles.position.set(0, 0, 0);
  updateLights(shot ? camera.position : state.pos);
  post.render(scene, camera, t);
  frames++;
  if (shot && frames === 3) { window.__ready = true; return; } // freeze: captures need a still frame
  requestAnimationFrame(frame);
}
let frames = 0;
requestAnimationFrame(frame);

// tiny FPS readout with ?fps
if (params.has('fps')) {
  const el = document.createElement('div');
  el.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:9;font:12px monospace;color:#fff;text-shadow:0 0 3px #000';
  document.body.appendChild(el);
  let n = 0, t0 = performance.now();
  setInterval(() => { const t1 = performance.now(); el.textContent = `${Math.round((frames - n) * 1000 / (t1 - t0))} fps @${dpr}x`; n = frames; t0 = t1; }, 1000);
}
