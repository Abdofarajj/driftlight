import { WebGLRenderer, Scene, PerspectiveCamera, Vector3, Raycaster, ColorManagement, LinearSRGBColorSpace, NoToneMapping, Group } from 'three';
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
import { CrystalQuest } from './world/lakequest.js';
import { DesertQuest, SUN } from './world/desertquest.js';
import { HollowQuest } from './world/hollowquest.js';
import { PeakQuest } from './world/peakquest.js';
import { TowerQuest } from './world/towerquest.js';
import { buildWinds } from './world/wind.js';
import { Stars } from './world/stars.js';
import { GameAudio } from './audio.js';
import { pathMask, onIsland, groundHeight } from './world/forest.js';
import { Objectives } from './ui/objectives.js';
import { NetPlay } from './net/netplay.js';
import { cleanCode } from './net/session.js';
import { Invite } from './ui/invite.js';
import { WorldMap } from './ui/map.js';
import { Satchel } from './ui/satchel.js';
import { loadSave, writeSave, clearSave, progressOf } from './save.js';
import { Secrets } from './world/secrets.js';
import { Keepsakes } from './world/keepsakes.js';
import { MoreSecrets } from './world/moresecrets.js';
import { SECRET_HINTS } from './world/jokes.js';
import { mergeStatic, mergeSiblings, Instancer } from './look/merge.js';
import { bakeSunShadow } from './look/shadow.js';
import { PAL } from './look/palette.js';

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

// your journey is saved on this device (src/save.js); not in captures or test runs unless ?save
const SAVE_ON = !shot && (params.has('save') || !(params.has('fast') || params.has('peerhost')));
const saved = SAVE_ON && !params.get('room') ? loadSave() : null; // joining: you play in their world

// players: him = you (Abdo), her = your girlfriend. ?as=her swaps who you control (and a save remembers it).
const playAs = (params.get('as') ?? saved?.as) === 'her' ? 'her' : 'him';
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
const stars = new Stars(scene, [[-49, 3.9, -4], [53, 1.4, 10.5], [4, 2.3, -44.5], world.lake.starPos.toArray(), world.desert.starPos.toArray(), world.hollow.starPos.toArray(), world.peak.starPos.toArray(), world.tower.starPos.toArray()]);
const secrets = new Secrets(world, scene, events);
const lakeQuest = new CrystalQuest(world, events, secrets);
const desertQuest = new DesertQuest(world, events, secrets, lakeQuest);
const hollowQuest = new HollowQuest(world, events, secrets, desertQuest);
const peakQuest = new PeakQuest(world, events, secrets, hollowQuest);
const towerQuest = new TowerQuest(world, events, secrets, peakQuest);
const moreSecrets = new MoreSecrets(world, scene, secrets);
// keepsakes: three per island, placed together at a stone by the way on; each bridge waits for them too
const keepsakes = (() => {
  const L1 = world.lake, D1 = world.desert;
  // a little way back from a bridge's foot and off to its side, so it never stands in the way
  const back = (from, towards, k, side = 2.4) => { const d = new Vector3(towards.x - from.x, 0, towards.z - from.z).normalize(); return new Vector3(from.x + d.x * k - d.z * side, from.y, from.z + d.z * k + d.x * side); };
  const ride = L1.ride.getPoint(0.45).add(L1.center);
  const sh = D1.shelters[1];
  const H1 = world.hollow, P1 = world.peak, T1 = world.tower, rest = T1.stepAt(T1.restIndex), [, l1, l2, l3] = P1.levels;
  return new Keepsakes(world, scene, events, secrets.motes, {
    spots: {
      forest: [[-13.5, -13], [17.5, 12], [-46.5, -4]],                     // roots of the big north-west tree, the east fence, the meadow island
      lake: [[-38, -104], [-12, -80], [ride.x, ride.z]],                    // north shore reeds, east shore, out on the rowboat's drift
      desert: [[D1.oasisWorld.x + 2.4, D1.oasisWorld.z], [sh.x, sh.z, sh.y], [8, -122]], // the oasis, behind a pass shelter, the south-west dunes
      hollow: [[72.5, -139], [83, -166], [101, -152]],                     // by the crooked house, far south past a lamp, near the east bell
      peak: [[86, -92, P1.levels[0]], [104, -72.8, l1], [101, -88, l2]],    // west meadow, the first terrace (north), the second (south)
      tower: [[rest.x + 1.3, rest.z + 0.6], [45, -98.5, T1.levelY]],      // the big resting cloud, the Cloud Kingdom's north rim
    },
    floating: { lake2: L1.waterY + 0.3, tower0: rest.y + 0.05 },
    sockets: {
      forest: back(world.northBridge.data.from, new Vector3(0, 0, 0), 2.8),
      lake: back(D1.bridge.data.from, L1.center, 2.8),
      desert: back(D1.hollowEnd, D1.terrace, 2.8),
      hollow: back(P1.bridge.data.from, H1.heart, 2.8),
      peak: (() => { const v = back(T1.stepsFrom, P1.summit, 1.2, 1.8); v.y = l3; return v; })(),
    },
  });
})();
quest.gate = () => keepsakes.placed('forest');
desertQuest.gate = () => keepsakes.placed('lake');
hollowQuest.gate = () => keepsakes.placed('desert');
peakQuest.gate = () => keepsakes.placed('hollow');
towerQuest.gate = () => keepsakes.placed('peak');
towerQuest.beaconGate = () => keepsakes.all('tower');
towerQuest.onLit = (quiet) => keepsakes.place(keepsakes.set('tower'), quiet);
// fewer, bigger draws (phones pay for every separate one): bake the still pieces into one mesh per
// material and area, and draw the swinging lanterns instanced. ?nomerge turns it off to compare.
const baked = new Group(); scene.add(baked);
const instancer = new Instancer(baked);
if (!params.has('nomerge')) {
  mergeStatic([world.lake.root], baked, { cell: 64 }); // far from the forest and small: one piece per material is plenty
  mergeStatic([world.desert.root], baked, { cell: 64 });
  mergeStatic([world.hollow.root], baked, { cell: 64 });
  mergeStatic([world.peak.root], baked, { cell: 64 });
  mergeStatic([world.tower.root], baked, { cell: 64 });
  mergeStatic([world.root, secrets.grottoGroup, secrets.ringGroup, secrets.gardenGroup, moreSecrets.group], baked);
  instancer.add(world.swingParts);
  for (const model of [meT.root, friendT.root, secrets.roro, secrets.gardenGroup, world.lake.boat, world.desert.spirit.rays, ...world.hollow.shadows.map((c) => c.group), world.hollow.lonely.group, world.hollow.cloud, ...world.peak.braziers.map((Z) => Z.fire), world.peak.hearthFire, world.tower.beacon.flames]) mergeSiblings(model); // hair curls, eyes, stems + leaves
}
// soft sun shadows of the still world, baked once (?noshadow turns them off to compare)
const sunShadow = params.has('noshadow') ? null : bakeSunShadow(renderer, scene, [world.root, secrets.grottoGroup, secrets.ringGroup, secrets.gardenGroup, moreSecrets.group, baked]);
window.__shadowInfo = sunShadow && { casters: sunShadow.casters, texel: sunShadow.texel }; // tests
const hud = { stars: document.getElementById('stars'), secrets: document.getElementById('secrets'), secIcon: document.querySelector('.pill .sec') };

// ---- objectives (tap a row to see more; finished ones fade away) ----
const touchUI = matchMedia('(hover: none), (pointer: coarse)').matches;
const partner = playAs === 'him' ? 'her' : 'him', partnerHer = playAs === 'him' ? 'her' : 'his';
const objectives = new Objectives(document.getElementById('objectives'), { instant: !!shot, limit: document.getElementById('joy') });
// the satchel (bag button / B): keepsakes per island, stars, and the secrets you've found
const satchel = new Satchel({ keepsakes, secrets, stars,
  reached: (id) => ({ forest: true, lake: lakeQuest.opened || lakeQuest.awake, desert: desertQuest.opened, hollow: hollowQuest.opened, peak: peakQuest.opened, tower: towerQuest.opened })[id] });
const westIsle = world.isles.find((i) => i.x < -40);
const shrineIsle = world.isles.find((i) => i.z < -40);
const OBJ = {
  hands: { title: `Take ${partnerHer} hand`, detail: `Walk up beside ${partner} and ${touchUI ? 'tap the big hands button' : 'press E'}. Holding hands you move together, share your light, and can pull ${partner} along.` },
  lanterns: { title: 'Light the lanterns', progress: '0/5', detail: 'Five stone lanterns sleep in the forest. Hold hands and stand together beside one until its golden ring fills. Light all five to wake the shrine.' },
  wind: { title: 'Ride the warm wind', detail: `On the west edge of the forest a ring of drifting petals marks a warm current. Step in${touchUI ? '' : ' (hold Space to glide)'} and it carries you to the meadow island.` },
  stars: { title: 'Find the stars', progress: '0/8', detail: 'Eight stars are hidden: one past the east rope bridge, one on the meadow island, one waiting by the shrine, one in the middle of Crystal Lake, one behind the sun gate in the desert, one on a mossy boulder in Whispering Hollow, one on a frozen pillar on the Snowy Peak, and one over a little stair of cloud puffs in the Cloud Kingdom.' },
  secrets: { title: 'Find the secrets', progress: `0/${secrets.items.length}`, detail: SECRET_HINTS },
  shrine: { title: 'Visit the shrine', detail: 'A bridge of light now leads north from the forest. Cross it together to reach the shrine.' },
  lake: { title: 'Cross to Crystal Lake', detail: 'The shrine woke a crystal bridge. It leads west from the shrine island to Crystal Lake.' },
  heart: () => ({ title: 'Wake the crystal heart', progress: `${lakeQuest.count}/3`, detail: 'Three crystals sleep round the lake, each with two lotus stones in front of it. '
    + 'Stand on both stones at the same time, one of you on each, and the crystal sends its light to the heart in the middle.'
    + (online() ? '' : ` Playing on your own? Walk ${partner} by the hand onto one stone, let go, then step onto the other.`) }),
  desert: { title: 'Cross to the Sunset Desert', detail: 'The crystal heart raised a sandstone bridge from the north-east shore of Crystal Lake. It leads to the Sunset Desert.' },
  sun: () => ({ title: 'Guide the lost sun spirit', detail: 'A little sun sleeps in a stone bowl near the bridge. It only follows your shared light, so hold hands and it comes along. '
    + 'Bring it through the Windy Pass to the sundial on the far side. Sand gusts blow down the pass: wait behind a shelter wall together, and go on between gusts.'
    + (online() ? '' : ` Playing on your own? Walk ${partner} by the hand the whole way.`) }),
  hollow: { title: 'Cross to Whispering Hollow', detail: 'An old rope bridge now sways out from the sun terrace behind the gate. It leads into the dark.' },
  lamps: () => ({ title: 'Relight the lamps', progress: `${hollowQuest.count}/3`, detail: 'Three old lamp posts stand somewhere in the dark. Stand by each one together, holding hands, until it glows again. '
    + 'A lit lamp keeps the shy shadows away, and if a lantern goes out you wake by the last lamp you lit.' }),
  bells: () => ({ title: 'Ring both bells together', detail: 'Two old bells hang on opposite sides of the Hollow, and one won\'t ring alone. Stand on their stones at the same moment, one of you at each.'
    + (online() ? '' : ` Playing on your own? Walk ${partner} to one bell, let go, and hurry to the other before the shadows dim ${partnerHer} lantern.`) }),
  lonely: { title: 'Comfort the Lonely Shadow', detail: 'Something lonely has come to the stone ring in the middle of the Hollow. Stand there together, holding hands, and hold your light up while it comes closer.' },
  wayOn: { title: 'Follow the fireflies', detail: 'The fireflies drift off towards the far side of the Hollow, where the way on will open.' },
  peak: { title: 'Cross to the Snowy Peak', detail: 'A stone bridge now leads out of the far side of the Hollow, up to a snowy island with a mountain in the middle.' },
  braziers: () => ({ title: 'Light the braziers', progress: `${peakQuest.count}/3`, detail: 'Three cold braziers mark the way up the mountain. Stand by each one together, holding hands, until it burns. '
    + 'Up here the cold slowly dims a lantern on its own: holding hands keeps you both warm, and so does a lit brazier. If a lantern goes out you wake by the last brazier you lit. '
    + 'Some steps are too tall for one: hold hands and jump together. Together you jump higher.' }),
  bell: { title: 'Ring the aurora bell', detail: 'The bell hangs under a stone arch at the very top, too high for one of you to reach. Hold hands under it and jump together.' },
  clouds: { title: 'Look up', detail: 'The aurora spreads over the sky. Far to the west, high above the clouds, the cloud tower waits. Stay up on the summit: the way there opens soon.' },
  steps: { title: 'Climb the cloud steps', detail: `The aurora lifted a stair of clouds from the summit, rising west to the Cloud Kingdom. Jump from cloud to cloud${touchUI ? '' : ' (hold Space to glide)'}. Holding hands, you jump together. Halfway up, a big resting cloud has a waystone.` },
  keep: (id) => { const s = keepsakes.set(id); return { title: `Find the ${s.name.toLowerCase()}`, progress: `${keepsakes.count(id)}/${keepsakes.of(id)}`,
    detail: `${['', 'One', 'Two', 'Three'][keepsakes.of(id)]} ${s.many} are hidden on this island, and they shimmer and ${s.chime === 'hum' ? 'hum' : 'chime'} softly when you're close. ${s.hint} `
      + (s.noStone ? 'Light the beacon together and the two halves join into one locket.'
        : `Bring them to the keepsake stone ${s.where} and stand there together, holding hands, to place them. The way on only opens once they're in.`) }; },
  beacon: { title: 'Light the beacon', detail: 'Climb the tower together. Its ramp breaks in three places, where a bridge of light holds only while you hold hands. At the very top, stand by the beacon together, holding hands, until it catches.' },
};
for (const id of ['hands', 'lanterns', 'wind', 'stars', 'secrets']) objectives.add(id, OBJ[id]);
function addKeep(id) { if (!keepsakes.placed(id) && !objectives.has(`keep-${id}`)) objectives.add(`keep-${id}`, OBJ.keep(id)); }
addKeep('forest');
if (params.get('open')) objectives.setOpen(params.get('open')); // captures: show a row expanded
requestAnimationFrame(() => objectives.layout()); // again once the page has its real size

// ---- online: invite by link, or join with ?room=CODE ----
const She = partner === 'her' ? 'She' : 'He';
const peerOpts = {};
if (params.get('peerhost')) Object.assign(peerOpts, { host: params.get('peerhost'), port: Number(params.get('peerport')) || 9000, path: '/', secure: false });
if (params.get('ice') === 'none') peerOpts.config = { iceServers: [] }; // local tests
const online = () => !!net && net.online;
let warpToHost = false, joinedAt = 0; // joining: you appear beside your partner, wherever they are
const net = shot ? null : new NetPlay({
  A, B, hands, quest, lake: lakeQuest, desert: desertQuest, hollow: hollowQuest, peak: peakQuest, tower: towerQuest, stars, secrets, keepsakes, playAs, peerOpts,
  lag: params.get('lag') ? { ms: Number(params.get('lag')), jitter: Number(params.get('jitter')) || 0 } : null, // tests: fake internet delay
  on: {
    connected(back) {
      quest.remote = keepsakes.remote = lakeQuest.remote = desertQuest.remote = hollowQuest.remote = peakQuest.remote = towerQuest.remote = net.role === 'guest';
      if (net.role === 'guest' && !back) { warpToHost = true; joinedAt = performance.now(); }
      toast(back ? `${She}'s back ✦` : net.role === 'host' ? `${She} joined your world ✦` : `You're together ✦`);
      audio.play('checkpoint', { pos: A.pos });
      invite.refresh();
    },
    left(reason) { quest.remote = keepsakes.remote = lakeQuest.remote = desertQuest.remote = hollowQuest.remote = peakQuest.remote = towerQuest.remote = false; hollowQuest.lv[1] = 1; toast(reason === 'quiet' ? `${She} lost connection…` : `${She} left the game`); invite.refresh(); },
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

// ---- the world map (map button / Tab): the islands you've found, both of you, and the next goal ----
const D0 = world.desert, L0 = world.lake, H0 = world.hollow, K0 = world.peak;
const xz = (v) => [v.x, v.z];
const MAP_LOOKS = {
  forest: { edge: PAL.cliff[0], top: [PAL.grass[0], PAL.moss[1]], dots: [[-11, -5, 2.6, '#f4a9bf'], [11, -9, 2.4, '#f4a9bf'], [-14, 9, 2.2, '#e9b6d2'], [13, -19, 2.0, '#f4a9bf'], [7, 16, 1.9, '#e9b6d2'], [16, 0.5, 1.8, '#f4a9bf']] },
  isle: { edge: PAL.cliff[0], top: [PAL.grass[0], PAL.moss[1]] },
  shrine: { edge: PAL.cliff[0], top: [PAL.stone[0], PAL.grass[1]], dots: [[4, -51, 1.6, '#ffd98a']] },
  lake: { edge: PAL.cliff[0], top: [PAL.grass[0], PAL.moss[1]], water: [L0.lakeCenter.x, L0.lakeCenter.z, 10.5] },
  desert: { edge: PAL.cliff[0], top: [PAL.sand[0], PAL.sandstone[0]], dots: [[D0.dialPos.x, D0.dialPos.z, 2.6, '#ff9c50'], [D0.oasisWorld.x, D0.oasisWorld.z, 1.7, '#9fbf6a']] },
  hollow: { edge: PAL.bark[1], top: [PAL.moor[0], PAL.shy[0]], dots: H0.lamps.map((L) => [L.pos.x, L.pos.z, 1.3, '#ffd98a']) },
  tower: { edge: PAL.cloud[1], top: [PAL.cloudStone[0], PAL.cloud[0]], dots: [[45, -85, 6.4, '#f2dce4'], [45, -85, 1.6, '#ffd98a']] },
  peak: { edge: PAL.rockCold[1], top: [PAL.snow[0], PAL.rockCold[0]], dots: [[K0.mc.x, K0.mc.z, 7.5, '#d9d1ea'], [K0.mc.x, K0.mc.z, 4.2, '#f7f3fc'], ...K0.braziers.map((Z) => [Z.pos.x, Z.pos.z, 1.1, '#ff9c50']), [K0.cabinWorld.x, K0.cabinWorld.z, 1.6, '#d19f80']] },
};
/** the next keepsake to find on an island, or its stone once you have them all (null when placed) */
function keepGoal(id) {
  if (keepsakes.placed(id)) return null;
  const set = keepsakes.set(id), n = keepsakes.count(id);
  if (n >= keepsakes.of(id)) return set.stone ? { x: set.pos.x, z: set.pos.z, text: `Place the ${set.many} at the stone, holding hands` } : null;
  let best = null, bd = Infinity;
  for (const it of keepsakes.items) if (it.set === set && !it.got) { const d = it.pos.distanceTo(A.pos); if (d < bd) { bd = d; best = it; } }
  return { x: best.pos.x, z: best.pos.z, text: `Find the ${set.many} (${n}/${keepsakes.of(id)})` };
}
function nextGoal() {
  if (quest.count < quest.items.length) {
    let best = null, bd = Infinity;
    for (const it of quest.items) if (!it.lit) { const d = it.pos.distanceTo(A.pos); if (d < bd) { bd = d; best = it; } }
    return { x: best.pos.x, z: best.pos.z, text: 'Light the lanterns, holding hands' };
  }
  const kf = keepGoal('forest'); if (kf) return kf;
  const lakeOpen = lakeQuest.opened || lakeQuest.awake;
  if (!lakeOpen) return { x: shrineIsle.x, z: shrineIsle.z, text: 'Visit the shrine together' };
  if (!lakeQuest.awake) {
    const p = lakeQuest.pairs.find((q) => !q.lit);
    return { x: p.pos.x, z: p.pos.z, text: `Wake the crystals (${lakeQuest.count}/3)` };
  }
  const kl = keepGoal('lake'); if (kl) return kl;
  if (!desertQuest.opened) return { x: L0.lakeCenter.x, z: L0.lakeCenter.z, text: 'The heart is waking…' };
  const S = desertQuest.sun;
  if (!desertQuest.done) {
    if (S.state === SUN.FOLLOW) return { x: D0.dialPos.x, z: D0.dialPos.z, text: 'Bring the little sun to the sundial' };
    return { x: S.pos.x, z: S.pos.z, text: S.state === SUN.SLEEP ? 'Find the lost sun spirit' : 'The little sun is waiting for you' };
  }
  if (!stars.items[4].got && !hollowQuest.opened) return { x: D0.starPos.x, z: D0.starPos.z, text: 'Something shines past the sun gate' };
  const kd = keepGoal('desert'); if (kd) return kd;
  if (!world.hollow.onIsland(A.pos) && hollowQuest.count === 0) return { x: H0.arrive.x, z: H0.arrive.z, text: 'Cross the old rope bridge into the dark' };
  if (hollowQuest.count < 3) {
    let best = null, bd = Infinity;
    H0.lamps.forEach((L, i) => { if (hollowQuest.lamps[i].lit) return; const d = L.pos.distanceTo(A.pos); if (d < bd) { bd = d; best = L; } });
    return { x: best.pos.x, z: best.pos.z, text: `Relight the lamps together (${hollowQuest.count}/3)` };
  }
  if (!hollowQuest.rung) return { x: H0.heart.x, z: H0.heart.z, text: 'Ring both bells at the same moment' };
  if (!hollowQuest.done) return { x: H0.heart.x, z: H0.heart.z, text: 'Comfort the Lonely Shadow' };
  const kh = keepGoal('hollow'); if (kh) return kh;
  if (!peakQuest.opened || peakQuest.rise < 1) return { x: H0.exit.x, z: H0.exit.z, text: 'The way on opens soon…' };
  if (!K0.onIsland(A.pos) && peakQuest.count === 0) return { x: K0.arrive.x, z: K0.arrive.z, text: 'Cross the stone bridge to the Snowy Peak' };
  if (peakQuest.count < 3) { const Z = K0.braziers[peakQuest.braziers.findIndex((q) => !q.lit)]; return { x: Z.pos.x, z: Z.pos.z, text: `Light the braziers together (${peakQuest.count}/3)` }; }
  if (!peakQuest.rung) return { x: K0.summit.x, z: K0.summit.z, text: 'Ring the aurora bell together' };
  const T0 = world.tower;
  const kp = keepGoal('peak'); if (kp) return kp;
  if (!towerQuest.opened) return { x: K0.summit.x, z: K0.summit.z, text: 'The cloud tower waits. The way opens soon…' };
  if (!towerQuest.arrived && !T0.onIsland(A.pos)) return { x: T0.stepsTo.x, z: T0.stepsTo.z, text: 'Climb the cloud steps to the Cloud Kingdom' };
  const kt = !towerQuest.lit && keepGoal('tower'); if (kt) return kt;
  if (!towerQuest.lit) return { x: T0.center.x, z: T0.center.z, text: 'Climb the tower together and light the beacon' };
  return { x: T0.center.x, z: T0.center.z, text: 'Every island is lit. Keep exploring together ✦' };
}
const worldMap = new WorldMap({
  partnerName: partner,
  state: () => ({
    islands: [
      { id: 'forest', name: 'Lantern Forest', x: 0, z: 0, r: 24, known: true, look: MAP_LOOKS.forest },
      { id: 'east', name: '', x: 50, z: 8, r: 8, known: true, look: MAP_LOOKS.isle },
      { id: 'meadow', name: 'Meadow', x: -50, z: -7, r: 9, known: true, look: MAP_LOOKS.isle },
      { id: 'shrine', name: 'Shrine', x: shrineIsle.x, z: shrineIsle.z, r: 9.5, known: quest.done, next: !quest.done, look: MAP_LOOKS.shrine },
      { id: 'lake', name: 'Crystal Lake', x: L0.center.x, z: L0.center.z, r: 23, known: lakeQuest.opened || lakeQuest.awake, next: quest.done && !lakeQuest.opened && !lakeQuest.awake, look: MAP_LOOKS.lake },
      { id: 'desert', name: 'Sunset Desert', x: D0.center.x, z: D0.center.z, r: 26, labelLeft: true, known: desertQuest.opened, next: lakeQuest.awake && !desertQuest.opened, look: MAP_LOOKS.desert },
      { id: 'hollow', name: 'Whispering Hollow', x: H0.center.x, z: H0.center.z, r: 22, known: hollowQuest.opened, next: desertQuest.done && !hollowQuest.opened, look: MAP_LOOKS.hollow },
      { id: 'peak', name: 'Snowy Peak', x: K0.center.x, z: K0.center.z, r: 22, known: peakQuest.opened, next: hollowQuest.done && !peakQuest.opened, look: MAP_LOOKS.peak },
      { id: 'tower', name: 'Cloud Kingdom', x: 45, z: -85, r: 18, known: towerQuest.opened, next: peakQuest.rung && !towerQuest.opened, look: MAP_LOOKS.tower },
    ],
    links: [
      { a: [22.5, 6.8], b: [42, 8] },
      { a: [-18, -3], b: [-42, -7], kind: 'wind' },
      ...(quest.done ? [{ a: [2, -22.4], b: [3.5, -41] }] : []),
      ...(lakeQuest.opened || lakeQuest.awake ? [{ a: xz(L0.bridge.data.from), b: xz(L0.bridge.data.to) }] : []),
      ...(desertQuest.opened ? [{ a: xz(D0.bridge.data.from), b: xz(D0.bridge.data.to) }] : []),
      ...(hollowQuest.opened ? [{ a: xz(H0.bridge.data.from), b: xz(H0.bridge.data.to) }] : []),
      ...(peakQuest.opened ? [{ a: xz(K0.bridge.data.from), b: xz(K0.bridge.data.to) }] : []),
      ...(towerQuest.opened ? [{ a: xz(world.tower.stepsFrom), b: xz(world.tower.stepsTo), kind: 'clouds' }] : []),
    ],
    me: { x: A.pos.x, z: A.pos.z, kind: playAs },
    friend: { x: B.pos.x, z: B.pos.z, kind: partner, here: !online() || net.online },
    goal: nextGoal(),
  }),
});
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

let curDpr = dpr; // adaptive: drops a little when the frame rate sags (see adaptRes)
function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setPixelRatio(curDpr);
  renderer.setSize(w, h, false);
  post.setSize(Math.floor(w * curDpr), Math.floor(h * curDpr));
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
// ---- the title card: shown on every fresh visit (not in captures or bot runs) ----
if (!shot && !params.has('fast') && !params.has('peerhost') && !params.has('notitle')) {
  const tEl = document.getElementById('title');
  document.body.classList.add('titled');
  const play = document.getElementById('title-play'), together = document.getElementById('title-together');
  const tap = (el, fn) => {
    el.addEventListener('click', (e) => { e.stopPropagation(); e.preventDefault(); fn(); });
    el.addEventListener('touchend', (e) => { e.stopPropagation(); e.preventDefault(); fn(); });
  };
  if (room) {
    document.getElementById('title-sub').textContent = `${She}'s waiting for you`;
    play.textContent = 'Join'; together.hidden = true;
  }
  if (!net) together.hidden = true;
  if (saved) { // welcome back: carry on, or (two taps, so it can't happen by accident) start over
    document.getElementById('title-sub').textContent = 'Welcome back ✦ Your journey is right where you left it';
    play.textContent = 'Continue';
    const fresh = document.getElementById('title-new');
    fresh.hidden = false;
    tap(fresh, () => {
      if (!fresh.classList.contains('sure')) { fresh.classList.add('sure'); fresh.textContent = 'Tap again to start over'; return; }
      saving = false; clearSave(); location.reload();
    });
  }
  let gone = false;
  const go = (then) => {
    if (gone) return; gone = true;
    audio.start();
    tEl.style.display = 'grid'; tEl.classList.add('out'); // fade the card while the HUD comes in
    document.body.classList.remove('titled');
    setTimeout(() => { tEl.style.display = ''; }, 1150);
    if (then) setTimeout(then, 350);
  };
  tap(play, () => go());
  tap(together, () => go(() => invite.open()));
  for (const ev of ['touchstart', 'touchmove', 'mousedown']) tEl.addEventListener(ev, (e) => e.stopPropagation(), { passive: true });
  addEventListener('keydown', (e) => { if (!gone && (e.code === 'Enter' || e.code === 'Space')) { e.preventDefault(); go(); } });
}
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
  clearTimeout(toastTimer); toastTimer = setTimeout(() => toastEl.classList.remove('on'), Math.max(1800, msg.length * 55)); // long ones stay long enough to read
}

// ---- lights: the two player lanterns + the lanterns nearest to what you are looking at ----
// (no allocations per frame: phones stutter on garbage collection)
const tmp = new Vector3(), lightFocus = new Vector3(), camFwd = new Vector3();
const lightList = [];
// ---- Whispering Hollow's darkness: only lights show colour inside it (material.js uDark); while the
// camera is in there the haze closes in to a deep lavender fog and the sky turns to night ----
const HAZE0 = { haze: shared.uHaze.value.clone(), low: shared.uHazeLow.value.clone(), near: shared.uHazeNear.value, far: shared.uHazeFar.value };
let hollowK = 0;
function darkness() {
  const H = world.hollow, k = hollowQuest.darkness;
  shared.uDark.value.set(H.center.x, H.center.z, H.darkR, k);
  const c = H.darkAt(camera.position) * k;
  hollowK = H.darkAt(A.pos) * k;
  shared.uHaze.value.copy(HAZE0.haze).lerp(PAL.nightHaze, c * 0.95);
  shared.uHazeLow.value.copy(HAZE0.low).lerp(PAL.nightHaze, c * 0.95);
  shared.uHazeNear.value = HAZE0.near + (7 - HAZE0.near) * c;
  shared.uHazeFar.value = HAZE0.far + (46 - HAZE0.far) * c;
  // the Snowy Peak: a cold blue dusk over the snow, deepening to a starry night under the aurora once the bell rings
  const K = world.peak, kd = Math.hypot(camera.position.x - K.center.x, camera.position.z - K.center.z);
  const dawn = 1 - towerQuest.sun; // when the beacon is lit, the sun comes up over everything
  const pk = smooth(K.radius + 34, K.radius + 6, kd) * (0.22 + 0.5 * peakQuest.aur) * dawn;
  // the Cloud Kingdom: still under the aurora's night until the beacon is lit
  const T = world.tower, td = Math.hypot(camera.position.x - T.center.x, camera.position.z - T.center.z);
  const tw = smooth(T.radius + 50, T.radius + 8, td) * 0.6 * peakQuest.aur * dawn;
  shared.uNight.value = Math.max(c * 0.95, pk, tw);
  shared.uShadowK.value = sunShadow ? 1 - shared.uNight.value : 0; // no sun, no sun shadows
}

function updateLights(focus) {
  // bias the choice towards the view: a point a little ahead of the focus, along the camera
  camera.getWorldDirection(camFwd); camFwd.y = 0;
  if (camFwd.lengthSq() > 1e-6) camFwd.normalize();
  lightFocus.copy(focus).addScaledVector(camFwd, shot ? 9 : 5);
  if (lightList.length !== world.lights.length) {
    lightList.length = 0;
    for (const l of world.lights) lightList.push({ l, p: new Vector3(), d: 0 });
  }
  for (const e of lightList) {
    e.l.obj.getWorldPosition(e.p); if (e.l.offset) e.p.y += e.l.offset;
    e.d = e.l.str > 0 ? e.p.distanceToSquared(lightFocus) : 1e12;
  }
  lightList.sort((a, b) => a.d - b.d);
  const pos = shared.uLightPos.value, str = shared.uLightStr.value;
  let i = 0;
  const shareBoost = hands.linked ? 1.6 : 1; // holding hands = shared, brighter light
  for (const t of [meT, friendT]) { // in the Hollow a shadow clinging to you dims your lantern (hollowquest.js)
    const lv = 0.15 + 0.85 * hollowQuest.lv[i];
    t.bulb.getWorldPosition(pos[i]); str[i] = 0.6 * shareBoost * lv; t.glowMat.uniforms.uStr.value = 1.3 * (hands.linked ? 1.3 : 1) * (0.35 + 0.65 * lv); i++;
  }
  // the last few slots fade by distance, so a lantern swapping in or out as you walk never pops
  const slots = MAX_LIGHTS - 2, cut = lightList.length > slots ? Math.sqrt(lightList[slots].d) : Infinity;
  for (let k = 0; k < slots && k < lightList.length; k++) {
    const e = lightList[k];
    if (e.d >= 1e12) break;
    const fade = Math.min(1, Math.max(0, (cut - Math.sqrt(e.d)) / 6));
    pos[i].copy(e.p); str[i] = e.l.str * (k < slots - 4 ? 1 : fade); i++;
  }
  for (; i < MAX_LIGHTS; i++) str[i] = 0;
}

function placeShadow(t, p) {
  const f = world.floorAt(p.x, p.z, p.y);
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

const hollowHint = { bell: 0 };
function onEvent(name, d) {
  switch (name) {
    case 'hint': toast(d); break;
    case 'lantern':
      if (!d.quiet) { toast(`Lantern ${d.n} / ${d.of} lit ✦`); audio.play('lantern', { pos: d.pos }); }
      objectives.update('lanterns', { progress: `${d.n}/${d.of}` });
      break;
    case 'quest-complete':
      if (!d.quiet) { toast(keepsakes.placed('forest') ? 'All lanterns lit! The way north opens…' : 'All lanterns lit! Now the firefly jars, at the stone by the north bridge…'); audio.play('complete'); }
      objectives.complete('lanterns'); break;
    // ---- keepsakes ----
    case 'keepsake': {
      addKeep(d.set);
      objectives.update(`keep-${d.set}`, { progress: `${d.n}/${d.of}` });
      if (d.quiet) break;
      satchel.ping();
      audio.play('keepsake', { pos: d.pos });
      const One = d.one[0].toUpperCase() + d.one.slice(1);
      toast(d.n < d.of ? `${One} found (${d.n}/${d.of}) ✦` : d.set === 'tower' ? 'Both halves of the locket! Light the beacon together to join them ✦'
        : `All ${d.of} ${d.many}! Place them together at the stone ${d.where} ✦`);
      break;
    }
    case 'keepsake-placed': {
      objectives.complete(`keep-${d.set}`);
      if (d.quiet || d.set === 'tower') break; // the locket joins as the beacon lights: that moment has its own fanfare
      audio.play('socket', { pos: d.pos });
      secrets.motes.emit(d.pos.clone().setY(d.pos.y + 0.8), 40, { speed: 2.6, up: 3, life: 1.8, size: 0.22, spread: 0.5, grav: -0.3 });
      const qDone = { forest: quest.done, lake: lakeQuest.awake, desert: desertQuest.done, hollow: hollowQuest.done, peak: peakQuest.rung }[d.set];
      const what = { forest: 'Light the five lanterns', lake: 'Wake the crystal heart', desert: 'Bring the little sun home', hollow: 'Comfort the Lonely Shadow', peak: 'Ring the aurora bell' }[d.set];
      toast(qDone ? `The ${d.many} settle into the stone, and the way on wakes ✦` : `The ${d.many} settle into the stone ✦ ${what} to open the way on`);
      break;
    }
    case 'bridge-open': toast('A bridge of light leads to the shrine ✦'); objectives.add('shrine', OBJ.shrine); break;
    case 'secret':
      hud.secrets.textContent = `${d.n}/${d.of}`;
      objectives.update('secrets', { progress: `${d.n}/${d.of}` });
      if (d.n >= d.of) objectives.complete('secrets');
      if (!d.quiet) {
        satchel.ping();
        audio.play('secret', { pos: d.pos });
        discover(`Secret ${d.n} of ${d.of}`, d.title, d.line);
        hud.secIcon.classList.remove('found'); void hud.secIcon.getBoundingClientRect(); hud.secIcon.classList.add('found');
      }
      break;
    case 'sfx': audio.play(d.name, d); break;
    // ---- Crystal Lake ----
    case 'lake-bridge': toast('The shrine wakes, and a crystal bridge rises to the west ✦'); audio.play('complete'); break;
    case 'lake-open':
      addKeep('lake');
      if (!d.quiet) toast('A crystal bridge leads to Crystal Lake ✦');
      if (!world.lake.onIsland(A.pos) && !objectives.has('heart') && lakeQuest.count === 0) objectives.add('lake', OBJ.lake);
      break;
    case 'lake-crystal':
      if (!d.quiet) { toast(`Crystal ${d.n} / ${d.of} awake ✦`); audio.play('crystal', { pos: d.pos }); secrets.motes.emit(d.pos, 26, { speed: 2.4, up: 2.5, life: 1.6, size: 0.22, spread: 0.6 }); }
      addHeart();
      objectives.update('heart', { progress: `${d.n}/${d.of}` });
      break;
    case 'lake-heart':
      objectives.complete('lake'); objectives.complete('heart');
      if (!d.quiet && !keepsakes.placed('lake')) setTimeout(() => toast('Now the moon pearls, at the stone on the north-east shore…'), 3500);
      if (!d.quiet) { toast('The crystal heart wakes! ✦'); audio.play('heart', { pos: d.pos }); secrets.motes.emit(d.pos, 50, { speed: 3, up: 3, life: 2.2, size: 0.26, spread: 0.8, grav: -0.3 }); }
      break;
    case 'lake-steps': toast('Stepping stones lead to the heart ✦'); break;
    case 'lake-hint':
      if (d.kind === 'stone') toast(online() ? `Two lotus stones: ${partner} needs to stand on the other one` : `Walk ${partner} by the hand to the other lotus stone, let go, then come back`);
      else if (d.kind === 'boat') toast('The little boat waits for two…');
      break;
    case 'lake-boat': if (d.riding && !d.quiet) audio.play('splash', { pos: world.lake.boatWorld(), vol: 0.5 }); break;
    // ---- Sunset Desert ----
    case 'desert-bridge': toast('The heart\'s light reaches the north-east shore, and a sandstone bridge rises ✦'); audio.play('complete'); break;
    case 'desert-open':
      addKeep('desert');
      if (!d.quiet) toast('A sandstone bridge leads to the Sunset Desert ✦');
      if (!world.desert.onIsland(A.pos) && desertQuest.sun.state === SUN.SLEEP) objectives.add('desert', OBJ.desert);
      break;
    case 'sun-follow':
      addSun();
      if (d.quiet) break;
      if (d.first) { toast('The lost sun spirit wakes and follows your light ✦'); audio.play('sunwake', { pos: d.pos }); secrets.motes.emit(d.pos, 24, { speed: 2, up: 2, life: 1.4, size: 0.2, spread: 0.4 }); } else { toast('The little sun follows you again ✦'); audio.play('hands', { pos: d.pos }); }
      break;
    case 'sun-wait':
      if (d.quiet) break;
      toast(d.why === 'gust' ? 'The gust tore your hands apart! The little sun waits for you' : 'The little sun waits. It only follows while you hold hands');
      break;
    case 'sun-home': if (!d.quiet) toast('Home at last ✦'); break;
    case 'desert-sundial':
      objectives.complete('desert'); objectives.complete('sun');
      if (!d.quiet && !keepsakes.placed('desert')) setTimeout(() => toast('Now the sun-glass, at the stone on the sun terrace…'), 3500);
      if (!d.quiet) { toast('The sundial wakes, the wind settles and the sun gate opens ✦'); audio.play('sunhome', { pos: d.pos }); secrets.motes.emit(world.desert.sunHome, 50, { speed: 3, up: 3, life: 2.2, size: 0.26, spread: 0.8, grav: -0.3 }); }
      break;
    case 'desert-gate': toast('Something shines past the sun gate…'); break;
    case 'desert-gust':
      if (A.pos.distanceTo(d.pos) < 22) { if (d.phase === 'warn') audio.play('gustWarn', { pos: d.pos }); else if (d.phase === 'gust') audio.play('gust', { pos: d.pos }); }
      break;
    case 'desert-hint':
      if (d.kind === 'pass') toast('Sand gusts! Wait behind a wall together, then go between gusts');
      else if (d.kind === 'hands') toast(online() ? `Hold hands with ${partner}: the little sun only follows your shared light` : `Bring ${partner} by the hand: the little sun only follows your shared light`);
      break;
    // ---- Whispering Hollow ----
    case 'hollow-bridge': if (!d.quiet) { toast('Far off, an old rope bridge sways out of the fog…'); audio.play('creak', { pos: world.hollow.bridge.data.to }); } break;
    case 'hollow-open':
      addKeep('hollow');
      if (!world.hollow.onIsland(A.pos) && hollowQuest.count === 0) objectives.add('hollow', OBJ.hollow);
      break;
    case 'hollow-dark':
      objectives.complete('hollow');
      if (!objectives.has('lamps') && hollowQuest.count < 3) objectives.add('lamps', OBJ.lamps());
      toast(`It's dark in here. Your lanterns are the only light, and holding hands makes it bigger`);
      break;
    case 'lamp-lit': {
      const L = world.hollow.lamps[d.i];
      if (!objectives.has('lamps') && d.n < 3) { objectives.complete('hollow'); objectives.add('lamps', OBJ.lamps()); }
      objectives.update('lamps', { progress: `${d.n}/3` });
      // the last lamp you lit is where you wake if your lantern goes out
      if (L.checkpoint && checkpoint !== L.checkpoint) { L.checkpoint.activate(); checkpoint = L.checkpoint; }
      if (!d.quiet) { toast(`A lamp glows again (${d.n}/3) ✦`); audio.play('lamp', { pos: d.pos }); secrets.motes.emit(d.pos, 24, { speed: 2, up: 1.5, life: 1.6, size: 0.18, spread: 0.4, grav: -0.2 }); }
      if (d.n >= 3) { objectives.complete('lamps'); if (!hollowQuest.rung) objectives.add('bells', OBJ.bells()); }
      break;
    }
    case 'bell-step':
      if (!d.quiet) audio.play('bellHum', { pos: d.pos });
      if (performance.now() - (hollowHint.bell || -1e9) > 9000) { hollowHint.bell = performance.now(); toast(`This bell won't ring alone. Someone has to stand at the other one at the same moment`); }
      if (!objectives.has('bells') && !hollowQuest.rung) objectives.add('bells', OBJ.bells());
      break;
    case 'bells-rung':
      objectives.complete('bells');
      if (!d.quiet) { toast('Both bells ring out across the Hollow ✦'); for (const p of d.bells) audio.play('bell', { pos: p }); }
      break;
    case 'lonely-come':
      // after the bells have had their moment
      if (!d.quiet) setTimeout(() => { if (!hollowQuest.done) { toast('Something lonely stirs by the stone ring in the middle…'); audio.play('lonely', { pos: d.pos }); } }, 3500);
      if (!hollowQuest.done) objectives.add('lonely', OBJ.lonely);
      break;
    case 'hollow-done':
      objectives.complete('lonely'); objectives.complete('bells'); objectives.complete('lamps');
      if (!d.quiet) {
        toast(`It wasn't scary at all. It only wanted company ✦`);
        audio.play('fireflies', { pos: d.pos });
        secrets.motes.emit(d.pos.clone().setY(d.pos.y + 1.6), 80, { speed: 3.5, up: 2.5, life: 2.6, size: 0.2, spread: 1.2, grav: -0.25 });
        setTimeout(() => { toast(keepsakes.placed('hollow') ? 'The fireflies light the way on' : `The fireflies light the way on. It waits for the lullaby notes (${keepsakes.count('hollow')}/3)`); objectives.add('wayOn', OBJ.wayOn); }, 5200);
      } else objectives.add('wayOn', OBJ.wayOn);
      break;
    case 'lantern-dim':
      if (d.who === 'me') toast(`A shy shadow is dimming your lantern! Take ${partnerHer} hand or find a lit lamp`);
      else toast(`A shadow is dimming ${partnerHer} lantern! Go back and take ${partnerHer} hand`);
      audio.play('dim', { pos: d.who === 'me' ? A.pos : B.pos });
      break;
    case 'lantern-out': {
      audio.play('out', { pos: d.pos });
      // you wake by the last lamp (or brazier) you lit, or the waystone by the bridge, wherever you walked since
      const peak = d.zone === 'peak';
      const wake = peak
        ? (peakQuest.lastBrazier >= 0 ? world.peak.braziers[peakQuest.lastBrazier].checkpoint : world.peak.cairn)
        : (hollowQuest.lastLamp >= 0 ? world.hollow.lamps[hollowQuest.lastLamp].checkpoint : world.hollow.way);
      if (wake && checkpoint !== wake) { wake.activate(); checkpoint = wake; }
      const where = peak ? (peakQuest.count ? 'by the last brazier you lit' : 'back by the bridge') : (hollowQuest.count ? 'by the last lamp you lit' : 'back at the bridge');
      if (d.who === 'me') {
        toast(peak ? `The cold put your lantern out… you wake ${where}` : `Your lantern went out… you wake ${where}`);
        respawn();
      } else { // playing alone: your partner's lantern went out, and they wake by the last lamp
        if (hands.linked) hands.unlink();
        const p = checkpoint.pos;
        B.pos.set(p.x - 1.0, p.y + 0.1, p.z); B.vel.set(0, 0, 0);
        toast(`${She === 'She' ? 'Her' : 'His'} lantern went out… ${partner === 'her' ? 'she' : 'he'} waits ${where.replace('back ', '')}`);
      }
      break;
    }
    case 'music-box': audio.play('musicbox', { pos: d.pos }); break;
    // ---- Snowy Aurora Peak ----
    case 'peak-bridge': if (!d.quiet) { toast('Out past the fireflies, a stone bridge rises towards a snowy peak…'); audio.play('complete'); } break;
    case 'peak-open':
      addKeep('peak');
      objectives.complete('wayOn');
      if (!world.peak.onIsland(A.pos) && peakQuest.count === 0) objectives.add('peak', OBJ.peak);
      break;
    case 'peak-arrive':
      objectives.complete('peak'); objectives.complete('wayOn');
      if (!objectives.has('braziers') && peakQuest.count < 3) objectives.add('braziers', OBJ.braziers());
      toast(`Brr, it's freezing up here! Holding hands keeps you both warm`);
      break;
    case 'brazier-lit': {
      const Z = world.peak.braziers[d.i];
      if (!objectives.has('braziers') && d.n < 3) { objectives.complete('peak'); objectives.add('braziers', OBJ.braziers()); }
      objectives.update('braziers', { progress: `${d.n}/3` });
      if (Z.checkpoint && checkpoint !== Z.checkpoint) { Z.checkpoint.activate(); checkpoint = Z.checkpoint; } // you wake by the last brazier you lit
      if (!d.quiet) { toast(d.n < 3 ? `A brazier roars to life (${d.n}/3). Its warmth keeps the cold away ✦` : 'All three braziers burn, and the ice on the bell starts to melt ✦'); audio.play('brazier', { pos: d.pos }); secrets.motes.emit(d.pos, 30, { speed: 2.2, up: 2.4, life: 1.6, size: 0.2, spread: 0.4, grav: -0.4 }); }
      if (d.n >= 3) { objectives.complete('braziers'); if (!peakQuest.rung) objectives.add('bell', OBJ.bell); }
      break;
    }
    case 'peak-hint':
      if (d.kind === 'brazier') toast(online() ? `A brazier needs you both: stand by it with ${partner}, holding hands` : `Bring ${partner} by the hand and stand by the brazier together`);
      else if (d.kind === 'frost') toast(`Too tall to climb alone. Hold hands and jump together: together you jump higher`);
      else if (d.kind === 'frost-go') toast('Jump together! ✦');
      else if (d.kind === 'frozen') toast(`The bell is frozen solid. Light all three braziers first (${peakQuest.count}/3)`);
      else if (d.kind === 'high') toast(`Too high for one. Hold ${partnerHer} hand and jump together`);
      break;
    case 'peak-bell':
      objectives.complete('bell'); objectives.complete('braziers');
      if (!d.quiet) {
        toast('The aurora bell rings out over the sky ✦');
        audio.play('bigbell', { pos: d.pos });
        secrets.motes.emit(d.pos, 60, { speed: 3.2, up: 2.8, life: 2.4, size: 0.24, spread: 1.0, grav: -0.2 });
        setTimeout(() => { audio.play('aurora'); toast('Look up…'); }, 2600);
        setTimeout(() => { toast('The cold eases. Far to the west, the cloud tower waits'); objectives.add('clouds', OBJ.clouds); }, 8000);
        if (!keepsakes.placed('peak')) setTimeout(() => toast('The way up waits for the aurora feathers, at the stone by the bell…'), 11500);
      } else objectives.add('clouds', OBJ.clouds);
      break;
    case 'cold-dim':
      if (d.who === 'me') toast(`The cold is dimming your lantern! Take ${partnerHer} hand or warm up by a lit brazier`);
      else toast(`The cold is dimming ${partnerHer} lantern! Go back and take ${partnerHer} hand`);
      audio.play('cold', { pos: d.who === 'me' ? A.pos : B.pos });
      break;
    case 'cocoa': audio.play('cocoa', { pos: d.pos }); break;
    // ---- the Cloud Kingdom ----
    case 'tower-steps':
      addKeep('tower');
      objectives.complete('clouds');
      if (!towerQuest.arrived && !towerQuest.lit) objectives.add('steps', OBJ.steps);
      if (!d.quiet) { toast('The aurora lifts a stair of clouds from the summit ✦'); audio.play('cloudsteps', { pos: world.tower.stepsFrom }); }
      break;
    case 'tower-arrive':
      objectives.complete('steps'); objectives.complete('clouds');
      if (!towerQuest.lit) { objectives.add('beacon', OBJ.beacon); toast('The Cloud Kingdom. Climb the tower together ✦'); }
      break;
    case 'tower-hint':
      if (d.kind === 'bridge') toast(`A bridge of light… it only holds while you hold ${partnerHer} hand`);
      else if (d.kind === 'bridge-go') toast('The light holds for two ✦');
      else if (d.kind === 'locket') toast(`There's a little locket-shaped hollow in the beacon. ${keepsakes.count('tower') ? 'Half' : 'Both halves'} of the locket still missing…`);
      else if (d.kind === 'beacon') toast(online() ? `The beacon needs you both: stand by it with ${partner}, holding hands` : `Bring ${partner} by the hand and stand by the beacon together`);
      break;
    case 'tower-fall': {
      if (d.who === 'me') { toast('You slipped off the clouds… back to the last checkpoint'); respawn(); } else {
        if (hands.linked) hands.unlink();
        const p = checkpoint.pos;
        B.pos.set(p.x - 1.0, p.y + 0.1, p.z); B.vel.set(0, 0, 0);
        toast(`${She} slipped off the clouds and waits by the last checkpoint`);
      }
      break;
    }
    case 'tower-beacon':
      objectives.complete('beacon'); objectives.complete('steps');
      if (!d.quiet) {
        toast('The beacon is lit, and the two halves of the locket click together ✦');
        audio.play('beacon', { pos: d.pos });
        secrets.motes.emit(d.pos, 80, { speed: 3.6, up: 3.4, life: 2.8, size: 0.26, spread: 1.0, grav: -0.25 });
        setTimeout(() => audio.play('sunrise'), 1500);
        setTimeout(() => toast('The sun is rising, and every island is lighting up ✦'), 3500);
        setTimeout(() => showEnding(), 9000);
      }
      break;
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
// the closing card, after the beacon (both screens online: the guest hears about the beacon from the host)
const endingEl = document.getElementById('ending');
function showEnding() {
  document.getElementById('end-tally').textContent = `★ ${stars.count}/${stars.items.length} stars · ${secrets.count}/${secrets.items.length} secrets`;
  endingEl.classList.add('on'); document.body.classList.add('ending');
  audio.play('ending');
}
const endGo = (e) => { e.preventDefault(); e.stopPropagation(); endingEl.classList.remove('on'); document.body.classList.remove('ending'); };
document.getElementById('end-go').addEventListener('click', endGo);
document.getElementById('end-go').addEventListener('touchend', endGo);
function addSun() { if (!objectives.has('sun') && !desertQuest.done) { objectives.complete('desert'); objectives.add('sun', OBJ.sun()); } }
function addHeart() { if (!objectives.has('heart') && !lakeQuest.awake) { objectives.complete('lake'); objectives.add('heart', OBJ.heart()); } }
function onStar(st, n, quiet) {
  hud.stars.textContent = n;
  if (!quiet) { audio.play('star', { pos: st.pos }); toast(`Star found! ${n} / ${stars.items.length}`); }
  objectives.update('stars', { progress: `${n}/${stars.items.length}` });
  if (n >= stars.items.length) objectives.complete('stars');
}
stars.onCollect = onStar;
function surfaceAt(p) {
  const ls = world.tower.surface(p) || world.lake.surface(p) || world.desert.surface(p) || world.hollow.surface(p) || world.peak.surface(p);
  if (ls) return ls;
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
// the Snowy Peak's sounds: how much you're on it, how high you are, and how near the nearest fire burns
function peakSound() {
  const K = world.peak, on = K.onIsland(A.pos);
  let fireDist = K.inCabin(A.pos) ? A.pos.distanceTo(K.fireWorld) : 99;
  K.braziers.forEach((Z, i) => { if (peakQuest.braziers[i].lit) fireDist = Math.min(fireDist, A.pos.distanceTo(Z.pos)); });
  return { peak: on ? 1 : 0, peakHigh: on ? Math.max(0, Math.min(1, (A.pos.y - K.levels[0]) / (K.levels[3] - K.levels[0]))) : 0, inCabin: K.inCabin(A.pos), fireDist };
}
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
  if (botJumpWhen && A.grounded) { // tests: jump the moment you pass a line (exact, whatever the frame rate)
    const w = botJumpWhen;
    if ((A.pos.x - w.x) * w.dx + (A.pos.z - w.z) * w.dz >= w.at) { botJump = true; botJumpHeld = w.hold; botJumpWhen = null; }
  }
  if (input.consumeJump() || botJump) { A.intent.jump = true; botJump = false; }
  if (!online()) { B.intent.x = 0; B.intent.z = 0; B.intent.run = false; B.intent.jumpHeld = false; } // the stay-at-home partner idles

  if (input.consumeHands()) {
    const r = hands.toggle();
    if (r === 'too-far') toast('Get closer to hold hands');
    else if (online()) net.sendHands();
  }
  if (net && A.intent.jump && A.grounded) net.myJumps++;
  // on the Snowy Peak, together you jump higher (not by the cloud steps: there your jumps are all the same)
  A.boost = B.boost = hands.linked && world.peak.onIsland(A.pos) && !world.tower.overSteps(A.pos) ? PAIR_JUMP : 1;
  secrets.lift(A, dt); // the fairy ring floats whoever dances in it
  if (!online()) secrets.lift(B, dt);
  if (online()) {
    net.updateRemote(dt); // your partner's traveler, from the network
    if (warpToHost && net.buf.length) { warpToHost = false; warpBeside(net.buf[net.buf.length - 1].p); }
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
  lakeQuest.update(dt, t, A, B, onShrine);
  if (lakeQuest.boat.riding) { // drifting round the lake: sit still in the boat
    for (const act of online() ? [A] : [A, B]) {
      lakeQuest.seat(act === A ? playAs : partner, act.pos);
      act.vel.set(0, 0, 0); act.grounded = true; act.inWind = false;
      act.heading = world.lake.boatState.yaw;
    }
  }
  desertQuest.update(dt, t, A, B, hands.linked, online() ? [A] : [A, B], breakHands, camera);
  hollowQuest.update(dt, t, A, B, hands.linked, online() ? [A] : [A, B], camera);
  peakQuest.update(dt, t, A, B, hands.linked, online() ? [A] : [A, B], camera);
  towerQuest.update(dt, t, A, B, hands.linked, online() ? [A] : [A, B], camera);
  for (const act of online() ? [A] : [A, B]) water(act);
  const ch = Math.max(quest.items.reduce((m, it) => Math.max(m, it.lit ? 0 : it.charge), 0), lakeQuest.pairs.reduce((m, p) => Math.max(m, p.lit ? 0 : p.charge), 0), towerQuest.lit ? 0 : towerQuest.k);
  if (ch > 0.05 && Math.floor(ch * 6) !== Math.floor(lastCharge * 6)) audio.play('charge', { k: ch, pos: A.pos });
  lastCharge = ch;
  stars.update(dt, t, online() ? [A] : [A, B], camera, onStar);
  keepsakes.update(dt, t, [A, B], hands.linked, camera, online() ? [A] : [A, B]);
  moreSecrets.update(dt, t, [A, B]);
  secrets.update(dt, t, [A, B], camera); // either of you can find a secret; the fairy ring needs you both
  // place-based objectives: land on the meadow island / reach the shrine
  if (A.grounded) {
    const on = (i) => i && Math.hypot(A.pos.x - i.x, A.pos.z - i.z) < i.r - 0.5 && Math.abs(A.pos.y - i.y) < 0.5;
    if (objectives.has('wind') && on(westIsle)) objectives.complete('wind');
    if (objectives.has('shrine') && on(shrineIsle)) { objectives.complete('shrine'); toast('You reached the shrine together ✦'); }
    if (lakeQuest.opened && !lakeQuest.awake && world.lake.onIsland(A.pos)) addHeart(); // arrived at Crystal Lake
    if (desertQuest.opened && !desertQuest.done && world.desert.onIsland(A.pos)) addSun(); // arrived in the desert
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
    if (c.ready === false) continue; // a Hollow lamp only counts once it burns again
    if (A.pos.distanceTo(c.pos) < 1.7 && c !== checkpoint) {
      if (c.activate()) { toast('Checkpoint ✦'); stats.checkpoints++; audio.play('checkpoint', { pos: c.pos }); }
      checkpoint = c;
    }
  }
  if (A.pos.y < -18 || (!online() && B.pos.y < -30)) respawn();
  if (net) net.send(performance.now());
}
const carry = (act, dt) => net.applyCarry(act, dt); // your partner is walking you by the hand
const breakHands = () => { if (!hands.linked) return; hands.unlink(); if (online()) net.sendHands(); }; // a sand gust tore them apart
const onShrine = (act) => act.grounded && Math.hypot(act.pos.x - shrineIsle.x, act.pos.z - shrineIsle.z) < shrineIsle.r - 0.5 && Math.abs(act.pos.y - shrineIsle.y) < 0.5;
// deep water: walking can't take you in (actor.keepDry), but a jump or a slip can. Splash, and back to
// the last dry spot (a hand-held partner comes back to your side).
const safe = new Map([[A, A.pos.clone()], [B, B.pos.clone()]]);
function water(act) {
  const wy = world.waterAt(act.pos.x, act.pos.z);
  if (wy !== null && act.pos.y < wy - 0.6) {
    audio.play('splash', { pos: act.pos });
    secrets.motes.emit(tmp.copy(act.pos).setY(wy + 0.2), 16, { speed: 1.6, up: 2.4, life: 0.9, size: 0.18, spread: 0.4, grav: -4 });
    act.pos.copy(act !== A && hands.linked ? A.pos : safe.get(act)); act.vel.set(0, 0, 0);
    if (act === A) stats.splashes = (stats.splashes || 0) + 1;
    return;
  }
  if (act.grounded && !world.deep(act.pos.x, act.pos.z) && (wy === null || act.pos.y > wy - 0.25)) safe.get(act).copy(act.pos);
}
function smooth(a, b, x) { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); }
let botJump = false, botJumpHeld = false, botJumpWhen = null;
const PAIR_JUMP = 1.3;

// ---- loop ----
let last = performance.now();
let t = 0;
const camPos = new Vector3(), camLook = new Vector3();
const FAST = Number(params.get('fast')) || 0;
const SHOW_FPS = params.has('fps');
const ray = new Raycaster();

// ---- adaptive resolution: when the frame rate sags for a couple of seconds, draw fewer pixels
// (the soft watercolour look hides it well); try going back up after a long smooth stretch, and
// stop trying if going up made it sag again. Off for captures, ?fast bots and an explicit ?dpr.
const AUTO_RES = !shot && !FAST && !params.has('dpr');
const MIN_DPR = Math.min(dpr, 1.25);
const res = { n: 0, time: 0, slow: 0, good: 0, raisedAt: -1e9, noRaise: false, since: performance.now() };
function setDpr(v) { curDpr = Math.round(v * 100) / 100; resize(); }
function adaptRes(rawDt, now) {
  if (!AUTO_RES || document.hidden || now - res.since < 3000 || rawDt > 0.5) return; // skip loading hitches and tab switches
  res.n++; res.time += rawDt;
  if (res.time < 1) return;
  const fps = res.n / res.time; res.n = 0; res.time = 0;
  if (fps < 50) { res.slow++; res.good = 0; } else if (fps > 57) { res.good++; res.slow = 0; } else { res.slow = 0; res.good = 0; }
  if (res.slow >= 2 && curDpr > MIN_DPR) {
    if (now - res.raisedAt < 12000) res.noRaise = true; // the last step up was too much: stay here
    setDpr(Math.max(MIN_DPR, curDpr - 0.25)); res.slow = 0; res.since = now - 2000; // a second to settle
  } else if (res.good >= 8 && curDpr < dpr && !res.noRaise) {
    setDpr(Math.min(dpr, curDpr + 0.25)); res.good = 0; res.raisedAt = now; res.since = now - 2000;
  }
}

function frame(now) {
  adaptRes((now - last) / 1000, now);
  const dt = Math.max(0, Math.min(0.05, (now - last) / 1000)); // rAF time can be a hair before "last" on the first frame
  last = now;
  if (shot) {
    t = shot.time ?? 2.0;
    shot.apply({ me: meT, friend: friendT, camera, world, secrets, more: moreSecrets, keepsakes, lake: lakeQuest, desert: desertQuest, hollow: hollowQuest, peak: peakQuest, tower: towerQuest, ending: showEnding });
    moreSecrets.update(0, t, []); keepsakes.update(0, t, [], false, camera, []);
    secrets.update(0, t, [], camera); // still poses (shots can set e.g. secrets.roroK)
    lakeQuest.update(0, t, A, B, () => false);
    desertQuest.update(0, t, A, B, false, [], () => {}, camera);
    hollowQuest.update(0, t, A, B, hands.linked, [], camera);
    peakQuest.update(0, t, A, B, hands.linked, [], camera);
    towerQuest.update(0, t, A, B, hands.linked, [], camera);
  } else {
    // ?fast=N runs N fixed physics steps per rendered frame (used by the playtest bot on slow headless GPUs)
    const n = FAST || 1, sdt = FAST ? 1 / 30 : dt;
    for (let k = 0; k < n; k++) {
      t += sdt;
      step(sdt);
      hands.beforeAnimate();
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
    const gy = world.floorAt(want.x, want.z, target.y);
    if (gy !== null) want.y = Math.max(want.y, gy + 1.2); // (the floor at your height: not a turn of a ramp above you)
    // trees between you and the camera: pull the camera in front of them
    const toCam = new Vector3().subVectors(want, target);
    const full = toCam.length();
    ray.set(target, toCam.normalize()); ray.far = full;
    const hit = ray.intersectObjects(world.occluders, true).find((h) => !h.object.userData.lifted && (h.object.geometry.boundingSphere?.radius ?? 0) * h.object.scale.x > 0.6);
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
  darkness();
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
      hollow: hollowK, hollowCenter: world.hollow.center, inHouse: world.hollow.inHouse(A.pos),
      ...peakSound(), tower: world.tower.onIsland(A.pos) || world.tower.overSteps(A.pos) ? 1 : 0,
    });
  }
  updateLights(shot ? camera.position : A.pos);
  instancer.sync();
  if (SHOW_FPS) renderer.info.reset(); // count every pass of this frame (the ?fps readout shows draws)
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
  /** jump once you've gone `at` metres past (x, z) along (dx, dz); hold = keep the jump held after (to glide) */
  jumpWhen(x, z, dx, dz, at, hold = false) { botJumpWhen = { x, z, dx, dz, at, hold }; if (!hold) botJumpHeld = false; },
  jumpHold(on) { botJumpHeld = on; },
  holdHands() { input.handsPressed = true; },
  handsPending() { return input.handsPressed; },
  worldMap, keepsakes, moreSecrets, quest, lakeQuest, desertQuest, hollowQuest, peakQuest, towerQuest, stars, secrets, winds, audio, objectives, net, invite, playAs,
  camPos() { return camera.position.toArray().map((v) => +v.toFixed(2)); },
  frames() { return frames; },
  setRender(on) { renderOn = on; },
  redraw() { updateLights(shot ? camera.position : A.pos); instancer.sync(); post.render(scene, camera, t); }, // tests: draw one frame now
  scene, camera, renderer,
  res() { return { dpr: curDpr, ...res }; }, setDpr, // adaptive resolution (tests)
  lightAll() { quest.completeNow(); keepsakes.completeNow('forest'); },
  keepAll(id) { keepsakes.completeNow(id); },
  lakeAll() { lakeQuest.completeNow(); keepsakes.completeNow('lake'); },
  desertAll() { desertQuest.completeNow(); keepsakes.completeNow('desert'); },
  hollowAll() { hollowQuest.completeNow(); keepsakes.completeNow('hollow'); },
  peakAll() { peakQuest.completeNow(); keepsakes.completeNow('peak'); },
  towerAll() { keepsakes.completeNow('tower'); towerQuest.completeNow(); },
  ending() { return document.getElementById('ending').classList.contains('on'); },
  teleport(x, z, heading = Math.PI, y) { A.pos.set(x, world.floorAt(x, z, y) ?? 0, z); A.vel.set(0, 0, 0); A.heading = heading; cam.yaw = heading + Math.PI; camPos.set(0, 0, 0); },
  pos() { return { lanterns: quest.count, stars: stars.count, secrets: secrets.count, inWind: A.inWind, me: A.pos.toArray().map((v) => +v.toFixed(2)), friend: B.pos.toArray().map((v) => +v.toFixed(2)), linked: hands.linked, grounded: A.grounded, glide: A.glide, cp: this.checkpoint, yaw: +cam.yaw.toFixed(2), heading: +A.heading.toFixed(2) }; },
};

// ---- the saved journey: restore it now, then keep it up to date ----
function snapshot() {
  const ls = lakeQuest.state();
  return {
    v: 1, at: Date.now(), as: playAs, cp: world.checkpoints.indexOf(checkpoint),
    q: quest.state().l,
    lk: lakeQuest.opened || lakeQuest.count ? { o: 1, l: ls.l } : 0, // any lake progress means its bridge is up
    ds: desertQuest.done ? desertQuest.state() : desertQuest.opened ? { o: 1 } : 0,
    hw: hollowQuest.opened ? { o: 1, l: hollowQuest.state().l, r: hollowQuest.rung ? 1 : 0, ls: hollowQuest.done ? 2 : 0 } : 0,
    pk: peakQuest.opened ? peakQuest.state() : 0,
    tw: towerQuest.opened ? towerQuest.state() : 0,
    st: stars.mask(), sc: secrets.mask(), kp: keepsakes.mask(), kx: keepsakes.placedMask(),
  };
}
function restore(s) {
  for (const Q of [lakeQuest, desertQuest, hollowQuest, peakQuest, towerQuest]) Q.lastT ??= t;
  keepsakes.items.forEach((_, i) => { if (s.kp & (1 << i)) keepsakes.take(i, true); });
  keepsakes.applyPlaced(s.kx ?? 0, true);
  stars.items.forEach((_, i) => { if (s.st & (1 << i)) stars.take(i, true); });
  secrets.items.forEach((_, i) => { if (s.sc & (1 << i)) secrets.take(i, true); });
  if (s.q) { quest.applyState({ c: [], l: s.q }, true); objectives.complete('hands'); }
  if (quest.done && keepsakes.placed('forest')) { // the north bridge is already up
    quest.rise = 1; world.northBridge.setRise(1); world.shrine.userData.setGlow(1);
    if (!s.lk?.o) objectives.add('shrine', OBJ.shrine);
  }
  if (s.lk) lakeQuest.applyState({ o: s.lk.o, l: s.lk.l, c: [], br: -1 }, true);
  if (s.ds?.d) desertQuest.applyState(s.ds, true); else if (s.ds?.o) desertQuest.open(true);
  if (s.hw) hollowQuest.applyState(s.hw, true);
  if (s.pk) peakQuest.applyState(s.pk, true);
  if (s.tw) towerQuest.applyState(s.tw, true);
  const c = world.checkpoints[s.cp];
  if (c) {
    c.activate(); checkpoint = c;
    const p = c.pos;
    A.pos.set(p.x, p.y + 0.1, p.z); A.vel.set(0, 0, 0); A.heading = Math.PI; cam.yaw = 0;
    B.pos.set(p.x - 1.0, p.y + 0.1, p.z + 0.6); B.vel.set(0, 0, 0); B.heading = Math.PI;
  }
}
/** joining: stand beside your partner, wherever in the world they are */
function warpBeside(p) {
  if (!p || Math.hypot(A.pos.x - p[0], A.pos.z - p[2]) < 25) return;
  const y = world.floorAt(p[0] + 1, p[2], p[1] + 1);
  A.pos.set(p[0] + 1, (y ?? p[1]) + 0.1, p[2]); A.vel.set(0, 0, 0); camPos.set(0, 0, 0);
}
let saving = SAVE_ON, lastSaved = '';
function saveNow() {
  if (!saving) return false;
  if (room && (!joinedAt || performance.now() - joinedAt < 4000)) return false; // joining: wait for their world first
  const s = snapshot(), key = JSON.stringify({ ...s, at: 0 });
  if (key === lastSaved) return true;
  if (!s.q && !s.st && !s.sc && !s.kp && s.cp <= 0 && !loadSave()) return false; // nothing done yet: no Continue
  if (room && progressOf(s) < progressOf(loadSave())) return false; // never swap a longer journey for a shorter one
  lastSaved = key;
  return writeSave(s);
}
if (saved) { try { restore(saved); } catch (e) { console.error('save could not be restored', e); } }
if (SAVE_ON) {
  setInterval(saveNow, 4000);
  addEventListener('visibilitychange', () => { if (document.hidden) saveNow(); });
  addEventListener('pagehide', saveNow);
}
Object.assign(window.__game, { toast, saveNow, snapshot, restoreFrom: restore, loadSave, clearSave, stopSaving() { saving = false; } });

// tiny FPS readout with ?fps
if (SHOW_FPS) {
  renderer.info.autoReset = false;
  const el = document.createElement('div');
  // bottom middle, inside the safe area (a phone's rounded corners hide anything right in the corner)
  el.style.cssText = 'position:fixed;left:50%;transform:translateX(-50%);bottom:calc(env(safe-area-inset-bottom) + 10px);z-index:9;padding:3px 10px;border-radius:999px;background:rgba(110,70,90,.55);font:700 13px ui-monospace,Menlo,monospace;color:#fff7ea;pointer-events:none';
  document.body.appendChild(el);
  let n = 0, t0 = performance.now();
  setInterval(() => { const t1 = performance.now(); el.textContent = `${Math.round((frames - n) * 1000 / (t1 - t0))} fps · ${curDpr}x · ${renderer.domElement.width}×${renderer.domElement.height} · ${renderer.info.render.calls} draws`; n = frames; t0 = t1; }, 1000);
}
