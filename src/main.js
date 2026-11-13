import { WebGLRenderer, Scene, PerspectiveCamera, Vector3, Raycaster, ColorManagement, LinearSRGBColorSpace, NoToneMapping } from 'three';
import { Post } from './look/post.js';
import { shared, MAX_LIGHTS } from './look/material.js';
import { makeSky, makeSparkles } from './look/sky.js';
import { buildLanternForest } from './world/forest.js';
import { Traveler } from './player/traveler.js';
import { Input } from './input.js';
import { SHOTS } from './shots.js';
import { Actor } from './player/actor.js';
import { Hands } from './player/hands.js';
import { LanternQuest } from './world/quest.js';
import { buildWinds } from './world/wind.js';
import { Stars } from './world/stars.js';
import { GameAudio } from './audio.js';
import { pathMask, onIsland, groundHeight } from './world/forest.js';
import { Objectives } from './ui/objectives.js';
import { NetPlay } from './net/netplay.js';
import { cleanCode } from './net/session.js';
import { Invite } from './ui/invite.js';
import { Secrets } from './world/secrets.js';
import { SECRET_HINTS } from './world/jokes.js';

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
let baseFov = 46;

scene.add(makeSky());
const world = buildLanternForest();
scene.add(world.root);
const sparkles = makeSparkles();
scene.add(sparkles);

// players: him = you (Abdo), her = your girlfriend. ?as=her swaps who you control.
const playAs = params.get('as') === 'her' ? 'her' : 'him';
const meT = new Traveler(playAs);
const friendT = new Traveler(playAs === 'him' ? 'her' : 'him');
const me = meT, friend = friendT; // shots.js names
scene.add(meT.root, meT.shadow, friendT.root, friendT.shadow);

const spawn = world.spawn.clone(); spawn.y = world.floorAt(spawn.x, spawn.z);
const A = new Actor(meT, spawn);
const B = new Actor(friendT, new Vector3(spawn.x - 1.2, 0, spawn.z - 1.6));
B.pos.y = world.floorAt(B.pos.x, B.pos.z);
const room = shot ? '' : cleanCode(params.get('room'));
if (room) { const p = A.pos.clone(); A.pos.copy(B.pos); B.pos.copy(p); } // joining: stand beside where the host starts
const hands = new Hands(A, B, scene);
const cam = { yaw: 0, pitch: 0.36, dist: 9, manualT: 10 };
const audio = new GameAudio();
const events = { emit(name, data) { onEvent(name, data); } };
const quest = new LanternQuest(world, scene, events);
const winds = buildWinds(world);
winds.forEach((w) => scene.add(w.group));
audio.winds = winds;
const stars = new Stars(scene, [[-49, 3.9, -4], [53, 1.4, 10.5], [4, 2.3, -44.5]]);
const secrets = new Secrets(world, scene, events);
const hud = { stars: document.getElementById('stars'), secrets: document.getElementById('secrets'), secIcon: document.querySelector('.pill .sec') };

// ---- objectives (tap a row to see more; finished ones fade away) ----
const touchUI = matchMedia('(hover: none), (pointer: coarse)').matches;
const partner = playAs === 'him' ? 'her' : 'him', partnerHer = playAs === 'him' ? 'her' : 'his';
const objectives = new Objectives(document.getElementById('objectives'), { instant: !!shot, limit: document.getElementById('joy') });
const westIsle = world.isles.find((i) => i.x < -40);
const shrineIsle = world.isles.find((i) => i.z < -40);
const OBJ = {
  hands: { title: `Take ${partnerHer} hand`, detail: `Walk up beside ${partner} and ${touchUI ? 'tap the big hands button' : 'press E'}. Holding hands you move together, share your light, and can pull ${partner} along.` },
  lanterns: { title: 'Light the lanterns', progress: '0/5', detail: 'Five stone lanterns sleep in the forest. Hold hands and stand together beside one until its golden ring fills. Light all five to wake the shrine.' },
  wind: { title: 'Ride the warm wind', detail: `On the west edge of the forest a ring of drifting petals marks a warm current. Step in${touchUI ? '' : ' (hold Space to glide)'} and it carries you to the meadow island.` },
  stars: { title: 'Find the stars', progress: '0/3', detail: 'Three stars are hidden: one past the east rope bridge, one on the meadow island, and one waiting by the shrine.' },
  secrets: { title: 'Find the secrets', progress: '0/4', detail: SECRET_HINTS },
  shrine: { title: 'Visit the shrine', detail: 'A bridge of light now leads north from the forest. Cross it together to reach the shrine.' },
};
for (const id of ['hands', 'lanterns', 'wind', 'stars', 'secrets']) objectives.add(id, OBJ[id]);
if (params.get('open')) objectives.setOpen(params.get('open')); // captures: show a row expanded
requestAnimationFrame(() => objectives.layout()); // again once the page has its real size

// ---- online: invite by link, or join with ?room=CODE ----
const She = partner === 'her' ? 'She' : 'He';
const peerOpts = {};
if (params.get('peerhost')) Object.assign(peerOpts, { host: params.get('peerhost'), port: Number(params.get('peerport')) || 9000, path: '/', secure: false });
if (params.get('ice') === 'none') peerOpts.config = { iceServers: [] }; // local tests
const online = () => !!net && net.online;
const net = shot ? null : new NetPlay({
  A, B, hands, quest, stars, secrets, playAs, peerOpts,
  lag: params.get('lag') ? { ms: Number(params.get('lag')), jitter: Number(params.get('jitter')) || 0 } : null, // tests: fake internet delay
  on: {
    connected(back) {
      quest.remote = net.role === 'guest';
      toast(back ? `${She}'s back ✦` : net.role === 'host' ? `${She} joined your world ✦` : `You're together ✦`);
      audio.play('checkpoint', { pos: A.pos });
      invite.refresh();
    },
    left(reason) { quest.remote = false; toast(reason === 'quiet' ? `${She} lost connection…` : `${She} left the game`); invite.refresh(); },
    hello(kind) {
      // the invite link says who you are; if both of you picked the same traveler, take the other one
      if (net.role === 'guest' && kind === playAs) { const u = new URL(location.href); u.searchParams.set('as', kind === 'him' ? 'her' : 'him'); location.replace(u); }
    },
    hands(linked) { toast(linked ? `${She} took your hand ✦` : `${She} let go`); },
    error(e) {
      const why = e && e.type;
      if (why === 'peer-unavailable') toast(net.role === 'guest' ? 'That game has ended. Ask for a new invite link' : `${She} lost connection`);
      else if (['network', 'server-error', 'socket-error', 'socket-closed', 'browser-incompatible'].includes(why)) toast('Can\'t reach the online service right now');
      invite.refresh(why);
    },
  },
});
const linkFor = (code) => {
  const u = new URL(location.origin + location.pathname);
  u.searchParams.set('room', code);
  u.searchParams.set('as', partner);
  for (const k of ['peerhost', 'peerport', 'ice', 'lag', 'jitter']) if (params.get(k)) u.searchParams.set(k, params.get(k)); // local tests
  return u.toString();
};
const invite = new Invite({ net, partner, partnerHer, linkFor, toast: (m) => toast(m) });
if (net) {
  addEventListener('pagehide', () => net.bye()); // closing the tab: tell your partner now
  addEventListener('pageshow', (e) => { if (e.persisted) location.reload(); }); // back from the page cache: start fresh
}
if (room && net) {
  setTimeout(() => toast(`Joining ${partnerHer} world…`), 0); // toast() is set up further down
  net.join(room).catch(() => {});
}
let checkpoint = world.checkpoints[0];
checkpoint.active = true;

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  post.setSize(Math.floor(w * dpr), Math.floor(h * dpr));
  camera.aspect = w / h;
  // portrait phones: wider vertical FOV and a bit further back so the world still reads
  const portrait = h > w;
  camera.fov = baseFov = portrait ? 62 : 46;
  cam.dist = portrait ? 8.5 : 9.5;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

const input = shot ? null : new Input(canvas);
if (!shot) {
  const startAudio = () => audio.start();
  for (const ev of ['pointerdown', 'touchend', 'keydown']) addEventListener(ev, startAudio, { capture: true });
  const sb = document.getElementById('bset');
  const paint = () => sb.classList.toggle('muted', !audio.musicOn);
  paint();
  const toggle = (e) => { e.stopPropagation(); e.preventDefault(); audio.start(); audio.setMusic(!audio.musicOn); paint(); toast(audio.musicOn ? 'Music on' : 'Music off (sound effects stay on)'); };
  sb.addEventListener('click', toggle);
  sb.addEventListener('touchend', toggle);
  addEventListener('keydown', (e) => { if (e.code === 'KeyM') toggle(e); });
}
const toastEl = document.getElementById('toast');
let toastTimer = 0;
function toast(msg) {
  toastEl.textContent = msg; toastEl.classList.add('on');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => toastEl.classList.remove('on'), 1800);
}

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
  const shareBoost = hands.linked ? 1.6 : 1; // holding hands = shared, brighter light
  for (const t of [meT, friendT]) { t.bulb.getWorldPosition(pos[i]); str[i] = 0.6 * shareBoost; t.glowMat.uniforms.uStr.value = 1.3 * (hands.linked ? 1.3 : 1); i++; }
  for (const l of L) { if (i >= MAX_LIGHTS) break; pos[i].copy(l.p); str[i] = l.s; i++; }
  for (; i < MAX_LIGHTS; i++) str[i] = 0;
}

function placeShadow(t, p) {
  const f = world.floorAt(p.x, p.z);
  if (f === null || p.y < f - 1) { t.shadow.visible = false; return; }
  t.shadow.visible = true;
  t.shadow.position.set(p.x, f + 0.03, p.z);
  const h = Math.max(0, p.y - f);
  t.shadow.scale.setScalar(1.1 / (1 + h * 0.3));
}

// ---- autopilot (used by the playtest bot via window.__game.goTo) ----
let auto = null;
function autopilotIntent(dt) {
  if (!auto) return null;
  const dx = auto.x - A.pos.x, dz = auto.z - A.pos.z, d = Math.hypot(dx, dz);
  auto.t += dt;
  if (d < (auto.tol ?? 0.7)) { const r = auto.resolve; auto = null; r({ ok: true, reason: 'arrived' }); return { x: 0, z: 0 }; }
  if (auto.t - auto.lastT > 1.5) {
    if (auto.lastD - d < 0.3) { const r = auto.resolve; auto = null; r({ ok: false, reason: 'stuck', at: [A.pos.x, A.pos.y, A.pos.z] }); return { x: 0, z: 0 }; }
    auto.lastD = d; auto.lastT = auto.t;
  }
  if (auto.t > (auto.timeout ?? 25)) { const r = auto.resolve; auto = null; r({ ok: false, reason: 'timeout' }); return { x: 0, z: 0 }; }
  return { x: dx / d, z: dz / d, run: auto.run };
}

// ---- one game step ----
function respawn() {
  const fade = document.getElementById('fade');
  if (respawning) return;
  respawning = true;
  fade.classList.add('on');
  setTimeout(() => {
    if (auto) { const r = auto.resolve; auto = null; r({ ok: false, reason: 'respawned' }); }
    const p = checkpoint.pos;
    A.pos.set(p.x, p.y + 0.1, p.z); A.vel.set(0, 0, 0); A.heading = Math.PI;
    if (!online() && (hands.linked || B.pos.y < -18)) { B.pos.set(p.x - 1.0, p.y + 0.1, p.z); B.vel.set(0, 0, 0); B.heading = Math.PI; }
    cam.yaw = 0;
    fade.classList.remove('on');
    respawning = false;
    stats.respawns++;
  }, 380);
}
let respawning = false;
const stats = { respawns: 0, checkpoints: 1 };

function onEvent(name, d) {
  switch (name) {
    case 'hint': toast(d); break;
    case 'lantern':
      if (!d.quiet) { toast(`Lantern ${d.n} / ${d.of} lit ✦`); audio.play('lantern', { pos: d.pos }); }
      objectives.update('lanterns', { progress: `${d.n}/${d.of}` });
      break;
    case 'quest-complete': if (!d.quiet) { toast('All lanterns lit! The way north opens…'); audio.play('complete'); } objectives.complete('lanterns'); break;
    case 'bridge-open': toast('A bridge of light leads to the shrine ✦'); objectives.add('shrine', OBJ.shrine); break;
    case 'secret':
      hud.secrets.textContent = `${d.n}/${d.of}`;
      objectives.update('secrets', { progress: `${d.n}/${d.of}` });
      if (d.n >= d.of) objectives.complete('secrets');
      if (!d.quiet) {
        audio.play('secret', { pos: d.pos });
        discover(`Secret ${d.n} of ${d.of}`, d.title, d.line);
        hud.secIcon.classList.remove('found'); void hud.secIcon.getBoundingClientRect(); hud.secIcon.classList.add('found');
      }
      break;
    case 'sfx': audio.play(d.name, d); break;
    default: break;
  }
}
// the soft discovery moment: a glowing card for a few seconds (sparkles and a chime come from the world)
const discEl = document.getElementById('discover');
let discTimer = 0;
function discover(kicker, title, line) {
  document.getElementById('disc-k').textContent = kicker;
  document.getElementById('disc-t').textContent = title;
  document.getElementById('disc-l').textContent = line;
  discEl.classList.add('on'); document.body.classList.add('discovering'); // the HUD steps back while the card shows
  clearTimeout(discTimer); discTimer = setTimeout(() => { discEl.classList.remove('on'); document.body.classList.remove('discovering'); }, 5200);
}
function onStar(st, n, quiet) {
  hud.stars.textContent = n;
  if (!quiet) { audio.play('star', { pos: st.pos }); toast(`Star found! ${n} / ${stars.items.length}`); }
  objectives.update('stars', { progress: `${n}/${stars.items.length}` });
  if (n >= stars.items.length) objectives.complete('stars');
}
stars.onCollect = onStar;
function surfaceAt(p) {
  if (onIsland(p.x, p.z) && Math.abs(groundHeight(p.x, p.z) - p.y) < 0.2) return pathMask(p.x, p.z) > 0.5 ? 'path' : 'grass';
  if (world.isles.some((i) => Math.hypot(p.x - i.x, p.z - i.z) < i.r && Math.abs(i.y - p.y) < 0.2)) return 'grass';
  return 'wood';
}
const stepPh = new Map();
function footsteps(act, vol) {
  const k = Math.floor(act.t.phase / Math.PI);
  if (stepPh.get(act) !== k) {
    stepPh.set(act, k);
    if (act.grounded && act.speed01 > 0.2) audio.play('step', { surface: surfaceAt(act.pos), pos: act.pos, vol });
  }
}
const prevGround = new Map();
function landSounds(act) {
  const was = prevGround.get(act);
  if (was === false && act.grounded) audio.play('land', { pos: act.pos, vol: 0.8 });
  if (was === true && !act.grounded && act.vel.y > 3) audio.play('jump', { pos: act.pos });
  prevGround.set(act, act.grounded);
}
let wasLinked = false, wasGlide = false, lastCharge = 0;
let windState = { inWind: -1, windDist: [] };

function step(dt) {
  input.update();
  const [dx, dy] = input.consumeCam();
  if (dx || dy) cam.manualT = 0; else cam.manualT += dt;
  cam.yaw -= dx * 0.005;
  cam.pitch = Math.max(0.12, Math.min(0.9, cam.pitch + dy * 0.003));

  // intent in world space, relative to the camera
  const fwdX = -Math.sin(cam.yaw), fwdZ = -Math.cos(cam.yaw);
  const ap = autopilotIntent(dt);
  let ix, iz, run;
  if (ap) { ix = ap.x; iz = ap.z; run = !!ap.run; } else {
    ix = fwdX * input.move.y - fwdZ * input.move.x;
    iz = fwdZ * input.move.y + fwdX * input.move.x;
    run = input.run;
  }
  Object.assign(A.intent, { x: ix, z: iz, run, jumpHeld: input.jumpHeld || botJumpHeld });
  if (input.consumeJump() || botJump) { A.intent.jump = true; botJump = false; }
  if (!online()) { B.intent.x = 0; B.intent.z = 0; B.intent.run = false; B.intent.jumpHeld = false; } // the stay-at-home partner idles

  if (input.consumeHands()) {
    const r = hands.toggle();
    if (r === 'too-far') toast('Get closer to hold hands');
    else if (online()) net.sendHands();
  }
  if (net && A.intent.jump && A.grounded) net.myJumps++;
  secrets.lift(A, dt); // the fairy ring floats whoever dances in it
  if (!online()) secrets.lift(B, dt);
  if (online()) {
    net.updateRemote(dt); // your partner's traveler, from the network
    if (hands.stepOnline(dt, world, carry) === 'broke') net.sendHands();
  } else hands.step(dt, world);
  if (hands.linked !== wasLinked) {
    audio.play(hands.linked ? 'hands' : 'release', { pos: A.pos }); wasLinked = hands.linked;
    document.getElementById('bhands').classList.toggle('on', hands.linked);
  }
  if (hands.linked) objectives.complete('hands');

  // wind currents carry anyone inside them
  windState = { inWind: -1, windDist: [] };
  for (const act of online() ? [A] : [A, B]) {
    if (act.carried) continue; // your partner's screen is moving you (and their wind) right now
    if (secrets.dancing(act)) { act.inWind = false; continue; } // the return wind passes over the fairy ring: don't blow dancers away
    const was = act.inWind;
    act.inWind = false;
    winds.forEach((w, i) => {
      if (w.apply(act, dt)) { act.inWind = true; if (act === A) windState.inWind = i; }
    });
    if (act === A && act.inWind && !was) audio.play('updraft', { pos: act.pos });
  }
  winds.forEach((w, i) => { windState.windDist[i] = w.nearest(A.pos).d; });
  if (A.glide && !wasGlide) audio.play('glide', { pos: A.pos });
  wasGlide = A.glide;

  quest.update(dt, t, A, B, hands.linked);
  const ch = quest.items.reduce((m, it) => Math.max(m, it.lit ? 0 : it.charge), 0);
  if (ch > 0.05 && Math.floor(ch * 6) !== Math.floor(lastCharge * 6)) audio.play('charge', { k: ch, pos: A.pos });
  lastCharge = ch;
  stars.update(dt, t, online() ? [A] : [A, B], camera, onStar);
  secrets.update(dt, t, [A, B], camera); // either of you can find a secret; the fairy ring needs you both
  // place-based objectives: land on the meadow island / reach the shrine
  if (A.grounded) {
    const on = (i) => i && Math.hypot(A.pos.x - i.x, A.pos.z - i.z) < i.r - 0.5 && Math.abs(A.pos.y - i.y) < 0.5;
    if (objectives.has('wind') && on(westIsle)) objectives.complete('wind');
    if (objectives.has('shrine') && on(shrineIsle)) { objectives.complete('shrine'); toast('You reached the shrine together ✦'); }
  }

  // camera: drifts behind the direction you walk, unless you moved it by hand recently
  if (cam.manualT > 0.7 && A.speed01 > 0.15) {
    const target = A.heading + Math.PI;
    const d = Math.atan2(Math.sin(target - cam.yaw), Math.cos(target - cam.yaw));
    const toward = 1 - smooth(1.9, 2.8, Math.abs(d)); // walking at the camera: don't swing round
    const rate = 1.6 * Math.min(1, A.speed01) * toward;
    cam.yaw += d * Math.min(1, rate * dt);
  }

  // checkpoints
  for (const c of world.checkpoints) {
    if (A.pos.distanceTo(c.pos) < 1.7 && c !== checkpoint) {
      if (c.activate()) { toast('Checkpoint ✦'); stats.checkpoints++; audio.play('checkpoint', { pos: c.pos }); }
      checkpoint = c;
    }
  }
  if (A.pos.y < -18 || (!online() && B.pos.y < -30)) respawn();
  if (net) net.send(performance.now());
}
const carry = (act, dt) => net.applyCarry(act, dt); // your partner is walking you by the hand
function smooth(a, b, x) { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); }
let botJump = false, botJumpHeld = false;

// ---- loop ----
let last = performance.now();
let t = 0;
const camPos = new Vector3(), camLook = new Vector3();
const FAST = Number(params.get('fast')) || 0;
const ray = new Raycaster();
function frame(now) {
  const dt = Math.max(0, Math.min(0.05, (now - last) / 1000)); // rAF time can be a hair before "last" on the first frame
  last = now;
  if (shot) {
    t = shot.time ?? 2.0;
    shot.apply({ me: meT, friend: friendT, camera, world, secrets });
    secrets.update(0, t, [], camera); // still poses (shots can set e.g. secrets.roroK)
  } else {
    // ?fast=N runs N fixed physics steps per rendered frame (used by the playtest bot on slow headless GPUs)
    const n = FAST || 1, sdt = FAST ? 1 / 30 : dt;
    for (let k = 0; k < n; k++) {
      t += sdt;
      step(sdt);
      A.apply(sdt, t);
      B.apply(sdt, t + 1.3);
    }
    hands.afterAnimate(t, camera);

    const target = new Vector3(A.pos.x, A.pos.y + 1.1, A.pos.z);
    const cd = cam.dist;
    const want = new Vector3(
      target.x + Math.sin(cam.yaw) * Math.cos(cam.pitch) * cd,
      target.y + Math.sin(cam.pitch) * cd,
      target.z + Math.cos(cam.yaw) * Math.cos(cam.pitch) * cd,
    );
    // never let the camera dip into the ground
    const gy = world.floorAt(want.x, want.z);
    if (gy !== null) want.y = Math.max(want.y, gy + 1.2);
    // trees between you and the camera: pull the camera in front of them
    const toCam = new Vector3().subVectors(want, target);
    const full = toCam.length();
    ray.set(target, toCam.normalize()); ray.far = full;
    const hit = ray.intersectObjects(world.occluders, true).find((h) => (h.object.geometry.boundingSphere?.radius ?? 0) * h.object.scale.x > 0.6);
    if (hit) want.copy(target).addScaledVector(toCam, Math.max(1.6, hit.distance - 0.6));
    // finding Roro: for a few seconds the camera steps in front of you to watch him wave
    const gc = secrets.grottoCam();
    camIn += ((gc ? 1 : 0) - camIn) * Math.min(1, (FAST ? FAST / 30 : dt) * 2.2);
    if (gc) lastGc = gc;
    if (camIn > 0.001 && lastGc) { want.lerp(lastGc.pos, camIn); target.lerp(tmp.copy(lastGc.look).setY(lastGc.look.y - 0.6), camIn); }
    const fov = baseFov + (camera.aspect < 1 ? 9 : 0) * camIn; // portrait: a little wider to fit him in
    if (Math.abs(camera.fov - fov) > 0.01) { camera.fov = fov; camera.updateProjectionMatrix(); }
    if (camPos.lengthSq() === 0) { camPos.copy(want); camLook.copy(target); }
    const cdt = FAST ? FAST / 30 : dt;
    camPos.lerp(want, 1 - Math.exp(-cdt * 6));
    camLook.lerp(target, 1 - Math.exp(-cdt * 10));
    camera.position.copy(camPos);
    camera.lookAt(camLook.x, camLook.y + 0.6, camLook.z);
  }
  placeShadow(meT, meT.root.position);
  placeShadow(friendT, friendT.root.position);
  shared.uTime.value = t;
  world.update(t, dt);
  winds.forEach((w) => w.update(t));
  sparkles.userData.update(t);
  if (!shot) {
    footsteps(A, 1); footsteps(B, 0.7); landSounds(A); landSounds(B);
    camera.updateMatrixWorld();
    audio.update(dt, {
      camPos: camera.position, camRight: new Vector3().setFromMatrixColumn(camera.matrixWorld, 0),
      playerPos: A.pos, distFromCenter: Math.hypot(A.pos.x, A.pos.z), airborne: !A.grounded,
      onMain: Math.hypot(A.pos.x, A.pos.z) < 26, ...windState, waterDist: A.pos.distanceTo(secrets.waterPos),
    });
  }
  updateLights(shot ? camera.position : A.pos);
  if (renderOn) post.render(scene, camera, t);
  frames++;
  if (shot && frames === 3) { window.__ready = true; return; } // freeze: captures need a still frame
  requestAnimationFrame(frame);
}
let frames = 0, camIn = 0, lastGc = null;
let renderOn = true; // tests can pause drawing so physics + network run in real time on a slow headless GPU
requestAnimationFrame(frame);

// Debug / playtest hooks (used by tools/playtest.mjs).
window.__game = {
  A, B, hands, cam, stats, world,
  get checkpoint() { return world.checkpoints.indexOf(checkpoint); },
  goTo(x, z, opts = {}) { return new Promise((resolve) => { auto = { x, z, t: 0, lastT: 0, lastD: 1e9, resolve, ...opts }; }); },
  jump(hold = 0) { botJump = true; botJumpHeld = hold > 0; if (hold > 0) setTimeout(() => (botJumpHeld = false), hold); },
  holdHands() { input.handsPressed = true; },
  quest, stars, secrets, winds, audio, objectives, net, invite, playAs,
  camPos() { return camera.position.toArray().map((v) => +v.toFixed(2)); },
  frames() { return frames; },
  setRender(on) { renderOn = on; },
  redraw() { updateLights(shot ? camera.position : A.pos); post.render(scene, camera, t); }, // tests: draw one frame now
  scene, camera, renderer,
  lightAll() { quest.completeNow(); },
  teleport(x, z, heading = Math.PI) { A.pos.set(x, world.floorAt(x, z) ?? 0, z); A.vel.set(0, 0, 0); A.heading = heading; cam.yaw = heading + Math.PI; camPos.set(0, 0, 0); },
  pos() { return { lanterns: quest.count, stars: stars.count, secrets: secrets.count, inWind: A.inWind, me: A.pos.toArray().map((v) => +v.toFixed(2)), friend: B.pos.toArray().map((v) => +v.toFixed(2)), linked: hands.linked, grounded: A.grounded, glide: A.glide, cp: this.checkpoint, yaw: +cam.yaw.toFixed(2), heading: +A.heading.toFixed(2) }; },
};

// tiny FPS readout with ?fps
if (params.has('fps')) {
  const el = document.createElement('div');
  // bottom middle, inside the safe area (a phone's rounded corners hide anything right in the corner)
  el.style.cssText = 'position:fixed;left:50%;transform:translateX(-50%);bottom:calc(env(safe-area-inset-bottom) + 10px);z-index:9;padding:3px 10px;border-radius:999px;background:rgba(110,70,90,.55);font:700 13px ui-monospace,Menlo,monospace;color:#fff7ea;pointer-events:none';
  document.body.appendChild(el);
  let n = 0, t0 = performance.now();
  setInterval(() => { const t1 = performance.now(); el.textContent = `${Math.round((frames - n) * 1000 / (t1 - t0))} fps · ${dpr}x · ${renderer.domElement.width}×${renderer.domElement.height}`; n = frames; t0 = t1; }, 1000);
}
