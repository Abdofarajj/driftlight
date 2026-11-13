// Bot playtest: plays the real game in a headless browser, runs objectives, takes screenshots, writes notes.
// Usage: npm run playtest [-- outName]
import { createServer } from 'vite';
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
const { chromium } = createRequire(import.meta.url)('playwright');

const out = `captures/${process.argv[2] || 'playtest'}`;
mkdirSync(out, { recursive: true });
const server = await createServer({ server: { port: 5198, host: '127.0.0.1', hmr: false }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 852, height: 393 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto('http://127.0.0.1:5198/?fast=6&dpr=0.6');
await page.waitForFunction(() => window.__game, null, { timeout: 60000 });
await page.waitForTimeout(1500);

const G = (fn, arg) => page.evaluate(fn, arg);
const pos = () => G(() => window.__game.pos());
const goTo = (x, z, opts = {}) => G(([x, z, o]) => window.__game.goTo(x, z, o), [x, z, opts]);
const wait = (ms) => page.waitForTimeout(ms);
let shotN = 0;
const shot = async (name) => { const f = `${out}/${String(++shotN).padStart(2, '0')}-${name}.png`; await page.screenshot({ path: f }); return f; };
const results = [];
// --from-lake: skip straight to the Crystal Lake checks (set up as if the lantern quest and shrine were done)
// --from-desert: skip to the Sunset Desert checks (the crystal heart already awake)
// --from-hollow: skip to the Whispering Hollow checks (the little sun already home)
const FROM = ['hollow', 'desert', 'lake'].find((z) => process.argv.includes(`--from-${z}`)) ?? null;
let skipping = FROM;
async function objective(name, fn) {
  if (skipping === 'hollow') {
    if (!name.startsWith('the little sun home raises an old rope bridge')) return;
    skipping = null;
    await G(() => { window.__game.lightAll(); window.__game.lakeAll(); window.__game.desertAll(); });
    await page.waitForFunction(() => window.__game.hollowQuest.rise >= 1, null, { timeout: 180000 });
  } else if (skipping === 'desert') {
    if (!name.startsWith('the crystal heart raises a sandstone bridge')) return;
    skipping = null;
    await G(() => { window.__game.lightAll(); window.__game.lakeAll(); });
    await page.waitForFunction(() => window.__game.desertQuest.rise >= 1, null, { timeout: 180000 });
    const [x, z] = ringPt(lakeAng(DS.from[0], DS.from[2]));
    await G(([x, z]) => { const g = window.__game; g.teleport(x, z, Math.PI); g.B.pos.set(x + 0.9, g.world.floorAt(x + 0.9, z), z); g.B.vel.set(0, 0, 0); }, [x, z]);
    await wait(600); await G(() => window.__game.holdHands()); await wait(900);
  } else if (skipping === 'lake') {
    if (!name.startsWith('reaching the shrine')) return;
    skipping = null;
    await G(() => window.__game.lightAll());
    await page.waitForFunction(() => window.__game.quest.rise >= 1, null, { timeout: 120000 });
    await G(() => { const g = window.__game; g.teleport(4, -44.5, Math.PI); g.B.pos.set(5, 1.4, -44.5); g.B.vel.set(0, 0, 0); });
    await wait(600); await G(() => window.__game.holdHands()); await wait(900);
  } else if (skipping === 'end') return;
  if (FROM && name.startsWith('secret: walk through the waterfall')) { skipping = 'end'; return; }
  const t0 = Date.now();
  let r;
  try { r = await fn(); } catch (e) { r = { pass: false, note: 'crashed: ' + e.message }; }
  r.name = name; r.secs = ((Date.now() - t0) / 1000).toFixed(0);
  results.push(r);
  console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${name}  ${r.note || ''}`);
}

await objective('spawn on solid ground at the first checkpoint', async () => {
  const p = await pos(); await shot('spawn');
  return { pass: p.grounded && p.cp === 0, note: JSON.stringify(p) };
});

await objective('objectives panel: tap a row to see its details, tap again to close', async () => {
  const before = await G(() => window.__game.objectives.list().map((o) => o.id).join(','));
  // the page is busy with fast physics here, so give the CSS transitions time to settle
  const openNow = () => G(() => window.__game.objectives.open);
  const detailH = () => page.$eval('.obj[data-id="lanterns"] .d', (e) => e.getBoundingClientRect().height);
  const settle = async (want) => { for (let i = 0; i < 10; i++) { const h = await detailH(); if (want(h)) return h; await wait(500); } return detailH(); };
  await page.click('.obj[data-id="lanterns"]');
  await wait(1500);
  const o1 = await openNow(), h1 = await settle((h) => h > 20);
  await shot('objectives-expanded');
  await page.click('.obj[data-id="lanterns"]');
  await wait(1500);
  const o2 = await openNow(), h2 = await settle((h) => h < 2);
  return { pass: before === 'hands,lanterns,wind,stars,secrets' && o1 === 'lanterns' && h1 > 20 && o2 === null && h2 < 2, note: `rows=${before} open=${o1} (${h1.toFixed(0)}px) then ${o2} (${h2.toFixed(0)}px)` };
});

await objective('walk the path to the arch checkpoint', async () => {
  const legs = [[-1.5, 5], [-1.5, 0], [0.5, -5], [1.5, -10], [1.4, -13.5]];
  for (const [x, z] of legs) { const r = await goTo(x, z); if (!r.ok) return { pass: false, note: `stopped at leg ${x},${z}: ${JSON.stringify(r)}` }; }
  await wait(300); const p = await pos(); await shot('arch-checkpoint');
  return { pass: p.cp === 1, note: `checkpoint=${p.cp}` };
});

await objective('camera swings round to follow when you turn and walk east', async () => {
  await goTo(9, -13, { tol: 0.8 });
  await wait(1500);
  const p = await pos(); await shot('camera-follow-east');
  const d = Math.abs(Math.atan2(Math.sin(p.yaw - (p.heading + Math.PI)), Math.cos(p.yaw - (p.heading + Math.PI))));
  return { pass: d < 0.5, note: `yaw=${p.yaw} heading=${p.heading} diff=${d.toFixed(2)}` };
});

await objective('walk off the north edge and respawn at the arch checkpoint', async () => {
  await goTo(2, -19, { tol: 0.8 });
  await goTo(3, -32, { timeout: 8 });
  await wait(2500);
  const p = await pos(); const st = await G(() => window.__game.stats); await shot('after-fall');
  return { pass: st.respawns >= 1 && Math.abs(p.me[2] - -13.5) < 2, note: `respawns=${st.respawns} pos=${p.me}` };
});

await objective('fence blocks walking through it', async () => {
  await G(() => window.__game.teleport(11, 15, Math.PI));
  await wait(300);
  const r = await goTo(10.8, 8, { timeout: 6 });
  const p = await pos(); await shot('fence');
  return { pass: p.me[2] > 11.2, note: `goTo result=${r.reason}, ended z=${p.me[2]} (fence line ~11.5)` };
});

await objective('cross the bridge to the small island checkpoint', async () => {
  await G(() => window.__game.teleport(18, 6.8, Math.PI / 2));
  for (const [x, z] of [[23, 6.8], [32, 7.4], [42, 8], [46, 8.2]]) {
    const r = await goTo(x, z, { tol: 0.9 });
    if (!r.ok) { await shot('bridge-stuck'); return { pass: false, note: `stuck going to ${x},${z}: ${JSON.stringify(r)}` }; }
    if (x === 32) await shot('bridge-middle');
  }
  const p = await pos();
  return { pass: p.cp === 2, note: `checkpoint=${p.cp} pos=${p.me}` };
});

await objective('bridge rails stop you falling off the side', async () => {
  await G(() => window.__game.teleport(32, 7.3, Math.PI / 2));
  await wait(300);
  await goTo(32.5, 1, { timeout: 5 });
  const p = await pos(); const st = await G(() => window.__game.stats);
  return { pass: p.me[1] > -3 && Math.abs(p.me[2] - 7.4) < 1.3, note: `pos=${p.me} respawns=${st.respawns}` };
});

await objective('glide: holding jump slows the fall', async () => {
  await G(() => window.__game.teleport(47, 9, Math.PI / 2));
  await wait(300);
  await G(() => window.__game.jump(2500));
  let maxAir = 0, glided = false;
  for (let i = 0; i < 12; i++) { await wait(120); const p = await pos(); glided ||= p.glide; maxAir = Math.max(maxAir, p.me[1]); }
  await shot('glide');
  return { pass: glided, note: `glide seen=${glided}, peak y=${maxAir.toFixed(2)}` };
});

await objective('hold hands with her and pull her along', async () => {
  await G(() => window.__game.teleport(2.2, 9.5, Math.PI));
  await wait(300);
  const f0 = (await pos()).friend;
  await G(() => window.__game.holdHands());
  await wait(1500);
  let p = await pos();
  if (!p.linked) return { pass: false, note: `could not link, me=${p.me} friend=${p.friend}` };
  await shot('holding-hands');
  const handsRow = await G(() => window.__game.objectives.list().find((o) => o.id === 'hands'));
  if (handsRow && !handsRow.done) return { pass: false, note: 'hands objective not ticked after linking' };
  await goTo(-1.5, 0, { run: true });
  p = await pos(); await shot('pulled-along');
  const gap = Math.hypot(p.me[0] - p.friend[0], p.me[2] - p.friend[2]);
  const moved = Math.hypot(p.friend[0] - f0[0], p.friend[2] - f0[2]);
  return { pass: p.linked && gap < 1.6 && moved > 5, note: `friend moved ${moved.toFixed(1)}, gap=${gap.toFixed(2)}, linked=${p.linked}` };
});

await objective('jump together while holding hands', async () => {
  const y0 = (await pos()).friend[1];
  await G(() => window.__game.jump(0));
  let both = false;
  for (let i = 0; i < 8; i++) { await wait(150); const p = await pos(); if (!p.grounded && p.friend[1] > y0 + 0.4 && Math.abs(p.me[1] - p.friend[1]) < 0.6) both = true; }
  await shot('jump-together');
  return { pass: both, note: `both airborne together=${both}` };
});

await objective('let go of hands', async () => {
  await G(() => window.__game.holdHands()); await wait(1500);
  const p = await pos();
  return { pass: !p.linked, note: `linked=${p.linked}` };
});

await objective('trees: look at a tree up close (visual check)', async () => {
  await G(() => window.__game.teleport(-6, -1, -2.2));
  await wait(1200);
  await shot('tree-closeup');
  return { pass: true, note: 'see screenshot' };
});

await objective('lantern quest: light all 5 lanterns together, holding hands', async () => {
  await G(() => window.__game.teleport(1.2, 10.4, Math.PI));
  const fr = (await pos()).friend;
  await G(([x, z]) => window.__game.teleport(x + 1.0, z, Math.PI), [fr[0], fr[2]]);
  await wait(800);
  await G(() => window.__game.holdHands()); await wait(1500);
  if (!(await pos()).linked) return { pass: false, note: 'could not hold hands' };
  const L = [[-4.5, 7.5], [4.5, 1.5], [-4, -8], [5.5, -14], [-6.5, -13]];
  const log = [];
  for (const [x, z] of L) {
    const r = await goTo(x + 1.3, z + 0.9, { tol: 0.5 });
    let n0 = (await pos()).lanterns, n = n0;
    for (let k = 0; k < 12 && n === n0; k++) { await wait(700); n = (await pos()).lanterns; }
    const dbg = await G(() => { const g = window.__game; return `A=${g.A.pos.x.toFixed(1)},${g.A.pos.z.toFixed(1)} B=${g.B.pos.x.toFixed(1)},${g.B.pos.z.toFixed(1)} L=${g.hands.linked} ch=${g.quest.items.map((i) => i.charge.toFixed(1)).join('/')}`; });
    log.push(`${x},${z}:${r.reason}->${n} [${dbg}]`);
    if (n === 1) await shot('first-lantern-lit');
  }
  const p = await pos(); await shot('all-lanterns');
  return { pass: p.lanterns === 5, note: `lit=${p.lanterns} ${log.join(' ')}` };
});

await objective('bridge of light rises and leads to the shrine star', async () => {
  for (let k = 0; k < 40; k++) { const open = await G(() => window.__game.world.northBridge && window.__game.quest.rise >= 1); if (open) break; await wait(800); }
  await shot('bridge-risen');
  const legs = [[2, -21.5], [2.4, -26], [3.5, -41], [4, -44.5]];
  for (const [x, z] of legs) { const r = await goTo(x, z, { tol: 1.0, timeout: 40 }); if (!r.ok) { await shot('shrine-stuck'); return { pass: false, note: `stuck at ${x},${z}: ${JSON.stringify(r)} ${JSON.stringify(await pos())}` }; } }
  await wait(800);
  const p = await pos(); await shot('shrine');
  return { pass: p.stars >= 1 && p.me[2] < -40, note: `stars=${p.stars} pos=${p.me}` };
});

// ---- round 4: secrets ----
// card: the discovery card has shown this secret's title (it fades after a few seconds, which can pass quickly here)
const sec = () => G(() => { const S = window.__game.secrets; return { n: S.count, found: S.items.map((i) => i.found), card: document.getElementById('disc-t').textContent === 'Roro Jr', counter: document.getElementById('secrets').textContent }; });
const unlink = async () => { if ((await pos()).linked) { await G(() => window.__game.holdHands()); await wait(1200); } };
const friendTo = (x, z) => G(([x, z]) => { const g = window.__game; g.B.pos.set(x, g.world.floorAt(x, z), z); g.B.vel.set(0, 0, 0); }, [x, z]);

// ---- round 6: Crystal Lake ----
const lk = () => G(() => { const q = window.__game.lakeQuest; return { rise: q.rise, lit: q.pairs.map((p) => p.lit), count: q.count, awake: q.awake, steps: q.stepsDone, riding: q.boat.riding, needOff: q.boat.needOff }; });
const LK = await G(() => { const L = window.__game.world.lake; const a = (v) => v.toArray();
  return { from: a(L.bridge.data.from), to: a(L.bridge.data.to), cp: a(L.checkpoint.pos), c: a(L.lakeCenter), wy: L.waterY, stones: L.pairs.map((p) => p.stones.map((s) => a(s.pos))),
    steps: L.steps.map((s) => { const w = L.toWorld(s.x, s.z); return [w.x, w.z]; }), star: a(L.starPos), dock: [a(L.dock.shore), a(L.dock.end)] }; });
const lakeAng = (x, z) => Math.atan2(z - LK.c[2], x - LK.c[0]);
const ringPt = (th, r = 12.6) => [LK.c[0] + Math.cos(th) * r, LK.c[2] + Math.sin(th) * r];
/** walk round the lake shore (the lake is too deep to cross) to angle `th`, then to x,z */
async function shoreTo(th, x, z, tol = 0.4) {
  const p = (await pos()).me;
  let a = lakeAng(p[0], p[2]);
  let d = Math.atan2(Math.sin(th - a), Math.cos(th - a));
  const n = Math.ceil(Math.abs(d) / 0.4);
  for (let i = 1; i <= n; i++) { const [rx, rz] = ringPt(a + d * i / n); const r = await goTo(rx, rz, { tol: 0.9, timeout: 25 }); if (!r.ok) return r; }
  return x === undefined ? { ok: true } : goTo(x, z, { tol, timeout: 25 });
}
const dist2 = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);
async function fetchHer() {
  const p = await pos();
  if (!p.linked) {
    if (dist2(p.me, p.friend) > 2.0) { const th = lakeAng(p.friend[0], p.friend[2]); await shoreTo(th, p.friend[0] + 0.9, p.friend[2] + 0.4, 0.5); }
    await G(() => window.__game.holdHands()); await wait(900);
  }
  return (await pos()).linked;
}

await objective('reaching the shrine raises a crystal bridge; cross it to Crystal Lake', async () => {
  let q = await lk();
  for (let k = 0; k < 40 && q.rise < 1; k++) { await wait(800); q = await lk(); }
  await shot('crystal-bridge');
  const legs = [[-2.5, -47], [LK.from[0], LK.from[2]], [LK.to[0], LK.to[2]], [LK.cp[0], LK.cp[2]]];
  for (const [x, z] of legs) { const r = await goTo(x, z, { tol: 0.9, timeout: 40 }); if (!r.ok) { await shot('lake-bridge-stuck'); return { pass: false, note: `stuck going to ${x.toFixed(1)},${z.toFixed(1)}: ${JSON.stringify(r)}` }; } }
  await wait(600);
  const p = await pos(); await shot('lake-arrive');
  const rows = await G(() => window.__game.objectives.list().map((o) => o.id + (o.done ? '✓' : '')).join(','));
  return { pass: q.rise >= 1 && p.cp === 3 && /heart/.test(rows), note: `rise=${q.rise} checkpoint=${p.cp} objectives=${rows}` };
});

await objective('the lake is too deep to walk into (you can wade at the edge)', async () => {
  const r = await goTo(LK.c[0], LK.c[2], { timeout: 12 });
  const p = await pos(); const st = await G(() => window.__game.stats);
  const d = Math.hypot(p.me[0] - LK.c[0], p.me[2] - LK.c[2]);
  await shot('lake-shore');
  return { pass: !r.ok && d > 8.8 && d < 10.6 && p.me[1] > LK.wy - 0.45 && !st.splashes, note: `walk=${r.reason} stopped ${d.toFixed(2)} m from the middle, y=${p.me[1]} (water ${LK.wy.toFixed(2)}), splashes=${st.splashes || 0}` };
});

await objective('wake the three crystals: lead her onto one lotus stone, let go, stand on the other', async () => {
  const log = [];
  for (let i = 0; i < 3; i++) {
    const [s0, s1] = LK.stones[i];
    if (!(await fetchHer())) return { pass: false, note: `crystal ${i}: could not take her hand ${JSON.stringify(await pos())}` };
    let r = await shoreTo(lakeAng(s0[0], s0[2]), s0[0], s0[2], 0.25);
    await wait(500);
    const lit0 = (await lk()).lit[i];
    await unlink();
    r = await goTo(s1[0], s1[2], { tol: 0.25, timeout: 20 });
    let q = await lk();
    for (let k = 0; k < 10 && !q.lit[i]; k++) { await wait(500); q = await lk(); }
    const p = await pos();
    log.push(`#${i}: alone-on-one=${lit0} walk=${r.reason} her=${dist2(p.friend, s0).toFixed(2)}m from stone, lit=${q.lit[i]}`);
    if (i === 0) await shot('crystal-awake');
    if (!q.lit[i]) return { pass: false, note: log.join(' | ') };
  }
  let q = await lk();
  for (let k = 0; k < 20 && !q.steps; k++) { await wait(700); q = await lk(); }
  await shot('heart-awake');
  return { pass: q.count === 3 && q.awake && q.steps, note: `${log.join(' | ')} | heart awake=${q.awake} stones up=${q.steps}` };
});

await objective('cross the stepping stones hand in hand to the heart (she walks behind, stays dry) and take its star', async () => {
  const s0 = (await pos()).stars;
  if (!(await fetchHer())) return { pass: false, note: 'could not take her hand' };
  const [sx, sz] = ringPt(60 * Math.PI / 180, 11.2);
  let r = await shoreTo(60 * Math.PI / 180, sx, sz, 0.6);
  let minY = 99;
  for (const [x, z] of [...LK.steps, [LK.star[0], LK.star[2]]]) {
    r = await goTo(x, z, { tol: 0.45, timeout: 15 });
    const p = await pos(); minY = Math.min(minY, p.friend[1]);
    if (!r.ok) break;
  }
  await wait(800);
  const p = await pos(); const st = await G(() => window.__game.stats); await shot('heart-islet');
  return { pass: r.ok && p.stars === s0 + 1 && p.linked && minY > LK.wy - 0.3 && !st.splashes, note: `walk=${r.reason} stars ${s0} -> ${p.stars}, linked=${p.linked}, her lowest y=${minY.toFixed(2)} (water ${LK.wy.toFixed(2)})` };
});

await objective('fall into deep water: splash, and back on dry ground', async () => {
  await unlink();
  await G(([x, z]) => window.__game.teleport(x, z), [LK.c[0] - 5.5, LK.c[2] - 1.5]);
  await wait(1500);
  const p = await pos(); const st = await G(() => window.__game.stats);
  const dry = await G(() => { const g = window.__game, a = g.A.pos; return !g.world.deep(a.x, a.z) && a.y > g.world.lake.waterY - 0.3; });
  return { pass: st.splashes >= 1 && dry, note: `splashes=${st.splashes} now at ${p.me} dry=${dry}` };
});

await objective('secret: the rowboat drifts round the lake when you both sit in it', async () => {
  const sc0 = (await sec()).n;
  // back over the stepping stones with her, round the shore to the dock, down the dock and into the boat
  if (!(await fetchHer())) return { pass: false, note: 'could not take her hand' };
  for (const [x, z] of [...LK.steps].reverse()) await goTo(x, z, { tol: 0.45, timeout: 15 });
  const dockTh = lakeAng(LK.dock[0][0], LK.dock[0][2]);
  let r = await shoreTo(dockTh, LK.dock[0][0], LK.dock[0][2], 0.6);
  r = await goTo(LK.dock[1][0], LK.dock[1][2], { tol: 0.5, timeout: 15 });
  const boat = await G(() => window.__game.world.lake.boatWorld().toArray());
  r = await goTo(boat[0], boat[2], { tol: 0.35, timeout: 10 });
  let q = await lk();
  for (let k = 0; k < 10 && !q.riding; k++) { await wait(400); q = await lk(); }
  if (!q.riding) { await shot('boat-stuck'); return { pass: false, note: `boat did not cast off: walk=${r.reason} ${JSON.stringify(await pos())}` }; }
  await wait(4000); await shot('boat-ride');
  const mid = await pos(); const s1 = await sec();
  const moved = dist2(mid.me, boat) > 2;
  for (let k = 0; k < 220 && q.riding; k++) { await wait(800); q = await lk(); }
  await wait(600);
  r = await goTo(LK.dock[0][0], LK.dock[0][2], { tol: 0.6, timeout: 15 });
  const p = await pos();
  return { pass: s1.n === sc0 + 1 && moved && !q.riding && r.ok && p.me[1] > LK.wy, note: `secret ${sc0} -> ${s1.n}, carried ${dist2(mid.me, boat).toFixed(1)} m out, ride over=${!q.riding}, walked back up the dock=${r.reason}` };
});

// ---- round 7: Sunset Desert ----
const ds = () => G(() => { const q = window.__game.desertQuest; return { rise: q.rise, opened: q.opened, sun: q.sun.state, sunPos: q.sun.pos.toArray(), phase: q.phase, done: q.done, gate: q.gateK, tears: q.tears }; });
const DS = await G(() => { const D = window.__game.world.desert; const a = (v) => v.toArray();
  return { from: a(D.bridge.data.from), to: a(D.bridge.data.to), c: a(D.center), cps: D.checkpoints.map((c) => a(c.pos)), nest: a(D.nestPos), dial: a(D.dialPos), star: a(D.starPos),
    gate: a(D.gatePos), terrace: a(D.terrace), shelters: D.shelters.map(a), oasis: a(D.oasisWorld), arch: a(D.oasisArch) }; });
const dl = (x, z) => [DS.c[0] + x, DS.c[2] + z]; // desert local -> world
const toast = () => page.$eval('#toast', (e) => e.textContent);
const phaseIs = (ph) => page.waitForFunction((ph) => window.__game.desertQuest.phase === ph, ph, { timeout: 40000, polling: 'raf' });
const afterGust = async () => { await phaseIs('gust'); await phaseIs('calm'); };
async function legs(list, opts = {}) { for (const [x, z] of list) { const r = await goTo(x, z, { tol: 0.6, timeout: 25, ...opts }); if (!r.ok) return { ...r, leg: [+x.toFixed(1), +z.toFixed(1)] }; } return { ok: true }; }
async function fetchHerD() {
  const p = await pos();
  if (!p.linked) {
    if (dist2(p.me, p.friend) > 2.0) await goTo(p.friend[0] + 0.9, p.friend[2] + 0.4, { tol: 0.5, timeout: 25 });
    await G(() => window.__game.holdHands()); await wait(900);
  }
  return (await pos()).linked;
}
const local = (p) => [p[0] - DS.c[0], p[2] - DS.c[2]];

await objective('the crystal heart raises a sandstone bridge; cross it hand in hand to the Sunset Desert', async () => {
  let q = await ds();
  for (let k = 0; k < 40 && q.rise < 1; k++) { await wait(800); q = await ds(); }
  if (!(await fetchHer())) return { pass: false, note: 'could not take her hand' };
  let r = await shoreTo(lakeAng(DS.from[0], DS.from[2]));
  if (r.ok) r = await legs([[DS.from[0], DS.from[2]], [DS.to[0], DS.to[2]], [DS.cps[0][0], DS.cps[0][2]]], { tol: 0.9, timeout: 40 });
  await wait(600);
  const p = await pos(); await shot('desert-arrive');
  const rows = await G(() => window.__game.objectives.list().map((o) => o.id + (o.done ? '✓' : '')).join(','));
  return { pass: q.rise >= 1 && r.ok && p.cp === 4 && p.linked && /sun/.test(rows), note: `rise=${q.rise} walk=${JSON.stringify(r)} checkpoint=${p.cp} linked=${p.linked} objectives=${rows}` };
});

await objective('the little sun only follows your shared light (alone it sleeps on; let go and it waits)', async () => {
  await unlink();
  const nearNest = [DS.nest[0] + 1.5, DS.nest[2] - 1.0];
  await goTo(...nearNest, { tol: 0.5 });
  await wait(500);
  const alone = (await ds()).sun, hint = await toast();
  if (!(await fetchHerD())) return { pass: false, note: 'could not take her hand' };
  await goTo(...nearNest, { tol: 0.5 });
  await wait(800);
  const follow = (await ds()).sun; await shot('sun-follows');
  await unlink(); await wait(500);
  const waiting = (await ds()).sun;
  await G(() => window.__game.holdHands()); await wait(900);
  const again = (await ds()).sun;
  return { pass: alone === 0 && /little sun/.test(hint) && follow === 1 && waiting === 2 && again === 1, note: `alone=${alone} (hint "${hint}") hand in hand=${follow} let go=${waiting} hands again=${again}` };
});

await objective('out in the open in the Windy Pass, a gust pushes you back and tears your hands apart', async () => {
  const r0 = await legs([dl(-3, 9), dl(0, 7.4)]);
  await afterGust();
  const exposed = dl(1.9, 2.4);
  const r = await goTo(...exposed, { tol: 0.5 });
  const before = await pos();
  await phaseIs('gust'); await wait(900);
  const mid = await pos(), q = await ds(), msg = await toast(); await shot('gust-torn');
  await phaseIs('calm');
  const after = await pos();
  const pushed = local(after.me)[1] - local(before.me)[1];
  return { pass: r0.ok && r.ok && !mid.linked && q.sun === 2 && q.tears >= 1 && pushed > 2.5 && /gust/.test(msg), note: `linked during gust=${mid.linked} sun=${q.sun} tears=${q.tears} pushed back ${pushed.toFixed(1)} m "${msg}"` };
});

await objective('cross the Windy Pass between gusts, hand in hand behind the shelter walls, with the little sun', async () => {
  if (!(await fetchHerD())) return { pass: false, note: 'could not take her hand' };
  let r = await goTo(...dl(0, 7.2), { tol: 0.6 });
  const tears0 = (await ds()).tears, log = [];
  const S = DS.shelters;
  const sp = (await ds()).sunPos; // it waits where the gust tore your hands apart: pick it up on the way in
  const hops = [
    [[sp[0], sp[2] + 0.8], [S[0][0], S[0][2]]],
    [dl(1.9, 0.9), dl(1.9, -1.0), [S[1][0], S[1][2]]],
    [dl(-1.9, -3.0), dl(-1.9, -5.0), [S[2][0], S[2][2]]],
    [dl(1.9, -7.0), dl(1.9, -9.2), dl(0, -12.0), dl(-1.5, -14.2)],
  ];
  for (let i = 0; i < hops.length; i++) {
    await afterGust();
    r = await legs(hops[i]);
    const q = await ds(), p = await pos();
    log.push(`hop ${i}: ${r.ok ? 'ok' : JSON.stringify(r)} linked=${p.linked} sun=${q.sun}`);
    if (i === 1) await shot('pass-shelter');
    if (!r.ok || !p.linked) break;
  }
  r = await goTo(DS.cps[1][0], DS.cps[1][2], { tol: 0.9 });
  await wait(500);
  const q = await ds(), p = await pos();
  return { pass: r.ok && p.linked && q.sun === 1 && q.tears === tears0 && p.cp === 5 && local(p.me)[1] < -12.6, note: `${log.join(' | ')} | tears ${tears0} -> ${q.tears}, checkpoint=${p.cp}` };
});

await objective('bring the little sun to the sundial: the dial lights, the wind settles and the sun gate opens', async () => {
  const r = await goTo(DS.dial[0] - 2.1, DS.dial[2] + 0.8, { tol: 0.5 });
  let q = await ds();
  for (let k = 0; k < 20 && q.gate < 1; k++) { await wait(500); q = await ds(); }
  await shot('sundial-lit');
  const phases = new Set();
  for (let k = 0; k < 16; k++) { phases.add((await ds()).phase); await wait(400); }
  const rows = await G(() => window.__game.objectives.list().map((o) => o.id + (o.done ? '✓' : '')).join(','));
  return { pass: r.ok && q.sun === 3 && q.done && q.gate >= 1 && phases.size === 1 && phases.has('calm') && !rows.split(',').some((id) => id === 'sun' || id === 'desert'), note: `walk=${r.reason} sun=${q.sun} done=${q.done} gate=${q.gate.toFixed(2)} gust phases since=${[...phases]} objectives=${rows}` };
});

await objective('walk through the open sun gate and take the desert star', async () => {
  const s0 = (await pos()).stars;
  const r = await legs([dl(8, -11), dl(12.2, DS.gate[2] - DS.c[2]), dl(15.8, DS.gate[2] - DS.c[2]), [DS.star[0] - 0.4, DS.star[2]]]);
  await wait(800);
  const p = await pos(); await shot('desert-star');
  return { pass: r.ok && p.stars === s0 + 1, note: `walk=${JSON.stringify(r)} stars ${s0} -> ${p.stars}` };
});

await objective('secret: the hidden oasis behind a broken arch', async () => {
  const s0 = await sec();
  await unlink();
  const back = [dl(15.8, -6), dl(12.2, -6), dl(8, -11), dl(0, -12.8), dl(1.9, -9.2), dl(1.9, -7.0), dl(-1.9, -5.0), dl(-1.9, -3.0), dl(1.9, -1.0), dl(1.9, 0.9), dl(0, 6.8), dl(6, 7.2)];
  let r = await legs(back);
  if (r.ok) r = await legs([[DS.arch[0], DS.arch[2]], dl(12, 11.6)], { tol: 0.4 });
  await wait(900);
  const s1 = await sec(); await shot('oasis');
  return { pass: r.ok && s1.n === s0.n + 1 && s1.found[5] && s1.counter === `${s0.n + 1}/7`, note: `walk=${JSON.stringify(r)} secrets ${s0.n} -> ${s1.n} counter=${s1.counter}` };
});

await objective('the old city wall holds: no way north except through the pass', async () => {
  await legs([[DS.arch[0], DS.arch[2]], dl(9, 7.4)]);
  await goTo(...dl(9, -3), { tol: 0.5, timeout: 6 });
  const z = local((await pos()).me)[1];
  await legs([dl(-12, 7.2)]);
  await goTo(...dl(-12, -3), { tol: 0.5, timeout: 6 });
  const z2 = local((await pos()).me)[1];
  return { pass: z > 4.8 && z2 > 4.6, note: `stopped at local z=${z.toFixed(2)} (east) and ${z2.toFixed(2)} (west); the wall is at ~4.2` };
});

// ---- round 8: Whispering Hollow ----
const hq = () => G(() => { const q = window.__game.hollowQuest; return { rise: q.rise, opened: q.opened, lit: q.lamps.map((l) => l.lit), count: q.count, rung: q.rung, plates: q.plates.slice(), lonely: q.lonely.state, lk: q.lonely.k, done: q.done, lift: q.lift, lv: q.lv.slice(), dark: q.hinted.dark, box: q.boxPlaying, lastLamp: q.lastLamp }; });
const HW = await G(() => { const g = window.__game, H = g.world.hollow, D = g.world.desert, a = (v) => v.toArray();
  return { c: a(H.center), r: H.radius, end: a(D.hollowEnd), from: a(H.bridge.data.from), to: a(H.bridge.data.to), way: a(H.way.pos), lamps: H.lamps.map((L) => a(L.pos)), lampCps: H.lamps.map((L) => a(L.checkpoint.pos)),
    plates: H.bells.map((B) => a(B.plate)), heart: a(H.heart), exit: a(H.exit), door: a(H.houseDoor), inside: a(H.houseInside), ledge: a(H.ledge), ledgeTop: H.ledgeTop, step: a(H.ledgeStep), star: a(H.starPos),
    cpWay: g.world.checkpoints.indexOf(H.way), cpLamps: H.lamps.map((L) => g.world.checkpoints.indexOf(L.checkpoint)) }; });
const objIds = () => G(() => window.__game.objectives.list().filter((o) => !o.done).map((o) => o.id)); // finished rows fade out after a moment

// The Hollow's woods are twisty (trees, rocks, posts, the house), so the bot finds its way on a grid:
// A* over 0.35 m cells, keeping clear of every collider, then pulling the path straight where it can.
const NAV = await G(([cx, cz, R]) => {
  const w = window.__game.world, S = 0.35, half = R + 3, N = Math.ceil(half * 2 / S), x0 = cx - half, z0 = cz - half;
  const floor = new Array(N * N);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) floor[j * N + i] = w.floorAt(x0 + i * S, z0 + j * S) !== null;
  const cols = w.colliders.filter((c) => !c.off && (c.ax !== undefined ? Math.hypot(c.ax - cx, c.az - cz) < half + 2 : Math.hypot(c.x - cx, c.z - cz) < half + 2))
    .map((c) => (c.ax !== undefined ? { ax: c.ax, az: c.az, bx: c.bx, bz: c.bz, r: c.r } : { x: c.x, z: c.z, r: c.r }));
  return { S, N, x0, z0, floor, cols };
}, [HW.c[0], HW.c[2], HW.r]);
const navCell = (() => {
  const { S, N, x0, z0, floor, cols } = NAV, hard = new Uint8Array(N * N), soft = new Float32Array(N * N);
  const segD = (x, z, c) => { const abx = c.bx - c.ax, abz = c.bz - c.az, t = Math.max(0, Math.min(1, ((x - c.ax) * abx + (z - c.az) * abz) / (abx * abx + abz * abz))); return Math.hypot(x - c.ax - abx * t, z - c.az - abz * t); };
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const k = j * N + i, x = x0 + i * S, z = z0 + j * S;
    let edge = !floor[k];
    for (const [di, dj] of [[2, 0], [-2, 0], [0, 2], [0, -2]]) { const ii = i + di, jj = j + dj; if (ii < 0 || jj < 0 || ii >= N || jj >= N || !floor[jj * N + ii]) edge = true; }
    if (edge) { hard[k] = 1; continue; }
    for (const c of cols) {
      const d = (c.ax !== undefined ? segD(x, z, c) : Math.hypot(x - c.x, z - c.z)) - c.r;
      if (d < 0.4) { hard[k] = 1; break; }
      if (d < 1.0) soft[k] = Math.max(soft[k], (1.0 - d) * 4);
    }
  }
  return { hard, soft };
})();
function hollowPath(from, to) {
  const { S, N, x0, z0 } = NAV, { hard, soft } = navCell;
  const cell = (x, z) => [Math.round((x - x0) / S), Math.round((z - z0) / S)];
  const free = ([i, j]) => { // the nearest open cell
    let best = null, bd = 1e9;
    for (let dj = -8; dj <= 8; dj++) for (let di = -8; di <= 8; di++) { const ii = i + di, jj = j + dj; if (ii < 0 || jj < 0 || ii >= N || jj >= N || hard[jj * N + ii]) continue; const d = di * di + dj * dj; if (d < bd) { bd = d; best = [ii, jj]; } }
    return best;
  };
  const a = free(cell(from[0], from[2])), b = free(cell(to[0], to[2]));
  if (!a || !b) return [[to[0], to[2]]];
  const start = a[1] * N + a[0], goal = b[1] * N + b[0];
  const g = new Float32Array(N * N).fill(1e9), prev = new Int32Array(N * N).fill(-1), done = new Uint8Array(N * N);
  const open = [[0, start]]; g[start] = 0;
  const h = (k) => Math.hypot((k % N) - b[0], Math.floor(k / N) - b[1]);
  while (open.length) {
    let bi = 0; for (let q = 1; q < open.length; q++) if (open[q][0] < open[bi][0]) bi = q;
    const [, k] = open[bi]; open[bi] = open[open.length - 1]; open.pop();
    if (done[k]) continue; done[k] = 1;
    if (k === goal) break;
    const i = k % N, j = Math.floor(k / N);
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      if (!di && !dj) continue;
      const ii = i + di, jj = j + dj; if (ii < 0 || jj < 0 || ii >= N || jj >= N) continue;
      const n = jj * N + ii; if (hard[n] || done[n]) continue;
      const c = g[k] + Math.hypot(di, dj) * (1 + soft[n]);
      if (c < g[n]) { g[n] = c; prev[n] = k; open.push([c + h(n), n]); }
    }
  }
  if (prev[goal] === -1 && goal !== start) return [[to[0], to[2]]];
  const cells = []; for (let k = goal; k !== -1; k = prev[k]) cells.unshift(k);
  const P = (k) => [x0 + (k % N) * S, z0 + Math.floor(k / N) * S];
  const clear = (p, q) => { const d = Math.hypot(q[0] - p[0], q[1] - p[1]), n = Math.ceil(d / 0.12); for (let s = 0; s <= n; s++) { const x = p[0] + (q[0] - p[0]) * s / n, z = p[1] + (q[1] - p[1]) * s / n, [i, j] = cell(x, z); if (hard[j * N + i]) return false; } return true; };
  const pts = []; let cur = [from[0], from[2]], idx = 0;
  while (idx < cells.length - 1) { // pull the string: go as far along as you can see
    let far = idx + 1;
    for (let k = cells.length - 1; k > idx + 1; k--) if (clear(cur, P(cells[k]))) { far = k; break; }
    cur = P(cells[far]); pts.push(cur); idx = far;
  }
  pts.push([to[0], to[2]]);
  return pts;
}
async function hgo(to, opts = {}) {
  const p = await pos();
  const pts = hollowPath(p.me, to), last = pts.pop();
  const r = await legs(pts, { tol: 0.6, timeout: 25, ...opts, tol: 0.7 });
  if (!r.ok) return r;
  return legs([last], { tol: 0.6, timeout: 25, ...opts });
}
async function fetchHerH() {
  // she may have moved while you walked (if her lantern goes out alone in the dark she wakes by the last lamp)
  for (let k = 0; k < 3; k++) {
    const p = await pos();
    if (p.linked) return true;
    if (dist2(p.me, p.friend) > 2.0) await hgo([p.friend[0] + 0.9, 0, p.friend[2] + 0.3], { tol: 0.5 });
    await G(() => window.__game.holdHands()); await wait(900);
  }
  return (await pos()).linked;
}

await objective('the little sun home raises an old rope bridge; cross it hand in hand into the dark Hollow', async () => {
  let q = await hq();
  for (let k = 0; k < 40 && q.rise < 1; k++) { await wait(800); q = await hq(); }
  await unlink();
  // start on the sun terrace, a little back from the bridge's foot (the walk there is covered above)
  const e = HW.from, dx = HW.to[0] - e[0], dz = HW.to[2] - e[2], d = Math.hypot(dx, dz), ux = dx / d, uz = dz / d;
  await G(([x, z, h, fx, fz]) => { const g = window.__game; g.teleport(x, z, h); g.B.pos.set(fx, g.world.floorAt(fx, fz), fz); g.B.vel.set(0, 0, 0); },
    [e[0] - ux * 2.2, e[2] - uz * 2.2, Math.atan2(ux, uz), e[0] - ux * 2.2 - uz * 0.95, e[2] - uz * 2.2 + ux * 0.95]);
  await wait(600); await G(() => window.__game.holdHands()); await wait(900);
  const rows0 = await objIds();
  let r = await legs([[e[0], e[2]], [HW.to[0], HW.to[2]]], { tol: 0.9, timeout: 40 });
  if (r.ok) r = await hgo(HW.way, { tol: 0.9 });
  await wait(800);
  q = await hq(); const p = await pos(), rows = await objIds(); await shot('hollow-arrive');
  return { pass: q.rise >= 1 && rows0.includes('hollow') && r.ok && p.cp === HW.cpWay && p.linked && q.dark && rows.includes('lamps') && !rows.includes('hollow'), note: `rise=${q.rise} before=${rows0} walk=${JSON.stringify(r)} checkpoint=${p.cp} linked=${p.linked} dark hint=${q.dark} objectives=${rows}` };
});

await objective('hand in hand by an old lamp post, it glows again and becomes where you wake', async () => {
  const r = await hgo(HW.lampCps[0], { tol: 0.5 });
  let q = await hq();
  for (let k = 0; k < 15 && !q.lit[0]; k++) { await wait(400); q = await hq(); }
  await wait(400);
  const p = await pos(), msg = await toast(); await shot('lamp-lit');
  return { pass: r.ok && q.lit[0] && q.count === 1 && p.cp === HW.cpLamps[0] && /lamp glows/.test(msg), note: `walk=${JSON.stringify(r)} lit=${q.lit} checkpoint=${p.cp} "${msg}"` };
});

await objective('let go in the dark: the shy shadows creep in and dim your lantern until it goes out, and you wake by the lamp you lit', async () => {
  await unlink();
  await G(() => { const q = window.__game.hollowQuest; window.__lo = { minLv: 1, cling: 0, out: false, prev: 1, near: 99 };
    const tick = () => { const w = window.__lo, lv = q.lv[0], A = window.__game.A.pos;
      if (lv > w.prev + 0.5) w.out = true; w.prev = lv; w.minLv = Math.min(w.minLv, lv); w.cling = Math.max(w.cling, q.clinging[0]);
      for (const s of q.shadows) w.near = Math.min(w.near, Math.hypot(s.pos.x - A.x, s.pos.z - A.z));
      if (!w.out) requestAnimationFrame(tick); };
    tick(); });
  const r = await hgo(HW.heart, { tol: 0.8 }); // the middle of the Hollow, far from the lit lamp
  await page.waitForFunction(() => window.__lo.minLv < 0.6, null, { timeout: 120000 }).catch(() => {});
  await shot('lantern-dimming');
  const dimMsg = await toast();
  await page.waitForFunction(() => window.__lo.out, null, { timeout: 150000 }).catch(() => {});
  const outMsg = await toast();
  await wait(1500);
  const w = await G(() => window.__lo), p = await pos(), q = await hq();
  const fromLamp = dist2(p.me, HW.lampCps[0]);
  await shot('woke-by-lamp');
  return { pass: w.cling >= 1 && w.minLv < 0.1 && w.out && /dimming your lantern/.test(dimMsg) && /went out/.test(outMsg) && fromLamp < 1.5 && q.lv[0] > 0.9 && p.cp === HW.cpLamps[0],
    note: `walk=${JSON.stringify(r)} shadows came within ${w.near.toFixed(1)} m (${w.cling} clinging), lantern down to ${w.minLv.toFixed(2)}, out=${w.out} "${dimMsg}" / "${outMsg}", woke ${fromLamp.toFixed(1)} m from the lit lamp` };
});

await objective('hand in hand, relight the other two lamps (the shadows shy away from joined hands)', async () => {
  if (!(await fetchHerH())) return { pass: false, note: 'could not take her hand' };
  await G(() => { const q = window.__game.hollowQuest; window.__hh = { cling: 0, minLv: 1, stop: false };
    const tick = () => { const w = window.__hh; if (window.__game.hands.linked) { w.cling = Math.max(w.cling, q.clinging[0], q.clinging[1]); w.minLv = Math.min(w.minLv, q.lv[0], q.lv[1]); } if (!w.stop) requestAnimationFrame(tick); };
    tick(); });
  const log = [];
  for (const i of [1, 2]) {
    const r = await hgo(HW.lampCps[i], { tol: 0.5 });
    let q = await hq();
    for (let k = 0; k < 15 && !q.lit[i]; k++) { await wait(400); q = await hq(); }
    log.push(`lamp ${i}: ${r.ok ? 'ok' : JSON.stringify(r)} lit=${q.lit[i]}`);
    if (i === 1) await shot('second-lamp');
  }
  await wait(600);
  const w = await G(() => { window.__hh.stop = true; return window.__hh; });
  const q = await hq(), p = await pos(), rows = await objIds();
  return { pass: q.count === 3 && p.linked && w.cling === 0 && w.minLv > 0.95 && rows.includes('bells') && !rows.includes('lamps') && p.cp === HW.cpLamps[2],
    note: `${log.join(' | ')} | clinging while hand in hand=${w.cling}, lanterns never below ${w.minLv.toFixed(2)}, objectives=${rows}, checkpoint=${p.cp}` };
});

await objective('ring both bells at once: leave your partner on one bell stone and run to the other through the dark', async () => {
  const pl = HW.plates;
  let r = await hgo(pl[1], { tol: 0.4 });
  await wait(700);
  const hint = await toast();
  const alone = (await hq()).rung;
  await unlink();
  await friendTo(pl[1][0], pl[1][2]); // park her right on the stone (a player does it by walking her there and letting go)
  await wait(400);
  const r2 = await hgo(pl[0], { tol: 0.4, run: true });
  let q = await hq();
  for (let k = 0; k < 10 && !q.rung; k++) { await wait(400); q = await hq(); }
  const msg = await toast(); await shot('bells-rung');
  await wait(1200);
  const rows = await objIds();
  return { pass: r.ok && /won't ring alone/.test(hint) && !alone && r2.ok && q.rung && /Both bells/.test(msg) && rows.includes('lonely') && !rows.includes('bells'),
    note: `to the first bell=${JSON.stringify(r)} hint="${hint}" rang alone=${alone} | dash to the other=${JSON.stringify(r2)} rung=${q.rung} plates=${q.plates} "${msg}" objectives=${rows}` };
});

await objective('at the stone ring, hold your light up together while the Lonely Shadow circles in: it turns into fireflies and the dark lifts', async () => {
  const her = (await pos()).friend;
  if (!(await fetchHerH())) return { pass: false, note: `could not take her hand: ${JSON.stringify(await pos())} (she was at ${her})` };
  const r = await hgo(HW.heart, { tol: 0.6 });
  await page.waitForFunction(() => window.__game.hollowQuest.lonely.k > 0.5, null, { timeout: 60000 }).catch(() => {});
  await shot('lonely-circling');
  await page.waitForFunction(() => window.__game.hollowQuest.done, null, { timeout: 90000 }).catch(() => {});
  const msg = await toast();
  await page.waitForFunction(() => window.__game.hollowQuest.lift >= 1, null, { timeout: 60000 }).catch(() => {});
  await wait(6000);
  const q = await hq(), rows = await objIds();
  const gone = await G(() => window.__game.hollowQuest.shadows.every((s) => s.k < 0.05));
  const flies = await G(() => window.__game.world.hollow.flies.visible);
  await shot('hollow-dusk');
  return { pass: r.ok && q.done && q.lonely === 2 && q.lift >= 1 && /only wanted company/.test(msg) && gone && flies && rows.includes('wayOn') && !rows.includes('lonely'),
    note: `walk=${r.reason} done=${q.done} lonely=${q.lonely} lift=${q.lift.toFixed(2)} "${msg}" shadows gone=${gone} fireflies=${flies} objectives=${rows}` };
});

await objective('the star on the mossy boulder: hop up from the step stone', async () => {
  const s0 = (await pos()).stars;
  await unlink();
  let r = await hgo(HW.step, { tol: 0.5 });
  // walk at the boulder and jump just before it (the bot's own little hop)
  await G(([lx, lz, R]) => { const g = window.__game; window.__hop = { jumped: false, maxY: 0 };
    const tick = () => { const w = window.__hop, A = g.A.pos; w.maxY = Math.max(w.maxY, A.y);
      if (!w.jumped && Math.hypot(A.x - lx, A.z - lz) < R + 1.0 && g.pos().grounded) { w.jumped = true; g.jump(0); }
      if (performance.now() - w.t0 < 20000) requestAnimationFrame(tick); };
    window.__hop.t0 = performance.now(); tick(); }, [HW.ledge[0], HW.ledge[2], 1.25]);
  if (r.ok) r = await goTo(HW.ledge[0], HW.ledge[2], { tol: 0.4, timeout: 8 });
  await wait(1500);
  const p = await pos(), hop = await G(() => window.__hop); await shot('ledge-star');
  return { pass: r.ok && hop.jumped && p.stars === s0 + 1 && Math.abs(p.me[1] - HW.ledgeTop) < 0.15 && p.grounded,
    note: `walk=${JSON.stringify(r)} jumped=${hop.jumped} standing at y=${p.me[1]} (top ${HW.ledgeTop.toFixed(2)}) stars ${s0} -> ${p.stars}` };
});

await objective('secret: the crooked house\'s music box only plays when you\'re both inside', async () => {
  const s0 = await sec();
  let r = await legs([[HW.ledge[0] - 2.6, HW.ledge[2]]], { tol: 0.6 }); // hop down off the boulder
  if (!(await fetchHerH())) return { pass: false, note: 'could not take her hand' };
  r = await hgo(HW.door, { tol: 0.5 });
  await unlink();
  const r1 = await goTo(HW.inside[0], HW.inside[2], { tol: 0.35, timeout: 10 });
  await wait(2500);
  const alone = (await hq()).box;
  await goTo(HW.door[0], HW.door[2], { tol: 0.5, timeout: 10 });
  if (!(await fetchHerH())) return { pass: false, note: 'could not take her hand again' };
  const r2 = await goTo(HW.inside[0], HW.inside[2], { tol: 0.3, timeout: 10 });
  await wait(1500);
  const q = await hq(), s1 = await sec(), inside = await G(() => { const g = window.__game, H = g.world.hollow; return [H.inHouse(g.A.pos), H.inHouse(g.B.pos)]; });
  await shot('music-box');
  return { pass: r.ok && r1.ok && !alone && r2.ok && q.box && s1.found[6] && s1.n === s0.n + 1 && s1.counter === `${s0.n + 1}/7`,
    note: `to the door=${r.reason} in alone=${r1.reason} played alone=${alone} | in together=${r2.reason} inside=${inside} playing=${q.box} secrets ${s0.n} -> ${s1.n} counter=${s1.counter}` };
});

await objective('secret: walk through the waterfall and find Roro Jr', async () => {
  await unlink();
  const out = await G(() => window.__game.secrets.gToWorld(0, 4.6));
  const inside = await G(() => window.__game.secrets.gToWorld(0, 0.85)); // just behind the water, where Roro's cushion stops you
  await G(([x, z]) => window.__game.teleport(x, z, 0), [out.x, out.z]);
  await wait(800); await shot('grotto-outside');
  const s0 = await sec();
  const r = await goTo(inside.x, inside.z, { tol: 0.25, timeout: 12 });
  await wait(700);
  const s1 = await sec(); await shot('grotto-roro');
  const waving = await G(() => window.__game.secrets.waveT > 0);
  return { pass: !s0.found[0] && s1.found[0] && s1.card && s1.counter === `${s0.n + 1}/7` && waving, note: `walk=${r.reason} found=${s1.found[0]} card=${s1.card} counter=${s1.counter} waving=${waving}` };
});

await objective('Roro\'s grotto: walls hold, and you can walk back out', async () => {
  const back = await G(() => window.__game.secrets.gToWorld(0, -3.2)); // straight through the back wall: must stop
  await goTo(back.x, back.z, { tol: 0.5, timeout: 5 });
  const l = await G(() => { const S = window.__game.secrets, p = window.__game.A.pos; return S.gLocal(p); });
  const out = await G(() => window.__game.secrets.gToWorld(0.2, 5));
  const r = await goTo(out.x, out.z, { tol: 0.7, timeout: 12 });
  return { pass: l.z > -1.5 && r.ok, note: `deepest local z=${l.z.toFixed(2)} (back wall ~-1.2), walked out=${r.reason}` };
});

await objective('secret: the sleeping light fox wakes, yips and follows you', async () => {
  const n = await G(() => window.__game.secrets.fox.nest.toArray());
  await G(([x, z]) => window.__game.teleport(x + 5, z + 4, Math.PI), [n[0], n[2]]);
  await wait(800);
  const st0 = await G(() => window.__game.secrets.fox.state);
  await goTo(n[0] + 1.8, n[2] + 1.6, { tol: 0.6 });
  let st = st0;
  for (let k = 0; k < 12 && st !== 'follow'; k++) { await wait(400); st = await G(() => window.__game.secrets.fox.state); }
  await shot('fox-awake');
  const s1 = await sec();
  // walk off; it should trot along behind
  await goTo(n[0] - 4, n[2] + 7, { tol: 0.8 });
  await wait(1500);
  const d = await G(() => { const g = window.__game; return Math.hypot(g.A.pos.x - g.secrets.fox.pos.x, g.A.pos.z - g.secrets.fox.pos.z); });
  await shot('fox-following');
  return { pass: st0 === 'sleep' && st === 'follow' && s1.found[1] && d < 3.5, note: `state ${st0} -> ${st}, found=${s1.found[1]}, fox ${d.toFixed(1)}m behind after a walk` };
});

await objective('secret: the fairy ring only dances for two (hold hands and stand in it)', async () => {
  await unlink();
  const c = await G(() => window.__game.secrets.ringCenter.toArray());
  await friendTo(c[0] + 7, c[2] + 6);
  await G(([x, z]) => window.__game.teleport(x, z, 0), [c[0] + 0.2, c[2] + 0.2]);
  await wait(2500);
  const alone = await G(() => window.__game.secrets.ring.state);
  const hint = await page.$eval('#toast', (e) => e.textContent);
  // fetch your partner and bring them into the ring by the hand
  await G(([x, z]) => window.__game.teleport(x, z, 0), [c[0] + 6.2, c[2] + 6]);
  await wait(600);
  await G(() => window.__game.holdHands()); await wait(900);
  const linked = (await pos()).linked;
  // watch every frame: did the ring dance, and how high did it float you?
  await G(() => {
    const g = window.__game, S = g.secrets; window.__ring = { danced: false, maxLift: 0, ended: false };
    const tick = () => { const R = S.ring, w = window.__ring; if (R.state === 'dance') w.danced = true; else if (w.danced) w.ended = true;
      if (R.state === 'dance') w.maxLift = Math.max(w.maxLift, g.A.pos.y - (g.world.floorAt(g.A.pos.x, g.A.pos.z) ?? 0)); if (!w.ended) requestAnimationFrame(tick); };
    tick();
  });
  await goTo(c[0], c[2], { tol: 0.4, timeout: 12 });
  await page.waitForFunction(() => window.__game.secrets.ring.state === 'dance' && window.__game.secrets.ring.t > 3.6, null, { timeout: 30000, polling: 'raf' }).catch(() => {});
  await shot('fairy-ring');
  await page.waitForFunction(() => window.__ring.ended, null, { timeout: 40000 }).catch(() => {});
  await wait(800);
  const { danced, maxLift } = await G(() => window.__ring);
  const st = danced ? 'dance' : 'idle', found = await G(() => window.__game.secrets.items[2].found);
  const p = await pos();
  return { pass: alone === 'idle' && /two/.test(hint) && linked && st === 'dance' && found && maxLift > 0.6 && p.grounded, note: `alone=${alone} hint="${hint}" linked=${linked} danced=${st === 'dance'} found=${found} lifted ${maxLift.toFixed(2)}m, landed=${p.grounded}` };
});

await objective('let go, ride the warm wind west to the meadow island', async () => {
  if ((await pos()).linked) { await G(() => window.__game.holdHands()); await wait(1200); }
  await G(() => window.__game.teleport(-15.5, -3.2, -Math.PI / 2));
  await wait(600);
  await goTo(-18.5, -3.5, { tol: 0.6, timeout: 6 });
  let rode = false;
  for (let k = 0; k < 30; k++) { await wait(600); const p = await pos(); if (p.inWind) rode = true; if (k === 4) await shot('riding-wind'); if (rode && p.grounded) break; }
  const p = await pos(); await shot('west-isle');
  const onWest = Math.hypot(p.me[0] + 50, p.me[2] + 7) < 9 && p.me[1] > 2;
  return { pass: rode && onWest, note: `rode=${rode} landed=${p.me}` };
});

await objective('collect the meadow star', async () => {
  const s0 = (await pos()).stars;
  await goTo(-49, -4, { tol: 0.6 });
  await wait(1200);
  const p = await pos();
  return { pass: p.stars === s0 + 1, note: `stars ${s0} -> ${p.stars}` };
});

await objective('secret: the hidden sunflower garden turns to watch you', async () => {
  const g = await G(() => window.__game.secrets.gardenCenter.toArray());
  const yaw0 = await G(() => window.__game.secrets.flowers.map((f) => f.head.rotation.y));
  await goTo(g[0] + 1.5, g[2] + 1.4, { tol: 0.6, timeout: 10 });
  await wait(1500);
  const s1 = await sec(); await shot('sunflower-garden');
  // after finding it, every flower should face you
  const facing = await G(() => { const g = window.__game, p = g.A.pos; return g.secrets.flowers.filter((f) => { const want = Math.atan2(p.x - f.world.x, p.z - f.world.z); const d = Math.atan2(Math.sin(want - f.head.rotation.y), Math.cos(want - f.head.rotation.y)); return Math.abs(d) < 0.35; }).length; });
  const moved = await G((y0) => window.__game.secrets.flowers.some((f, i) => Math.abs(f.head.rotation.y - y0[i]) > 0.3), yaw0);
  return { pass: s1.found[3] && facing >= 11 && moved, note: `found=${s1.found[3]} ${facing}/13 flowers facing you, counter=${s1.counter}` };
});

await objective('ride the wind back to the main island', async () => {
  await goTo(-45, -11.5, { tol: 0.6, timeout: 10 });
  let rode = false;
  for (let k = 0; k < 30; k++) { await wait(600); const p = await pos(); if (p.inWind) rode = true; if (rode && p.grounded) break; }
  const p = await pos(); await shot('back-on-main');
  return { pass: rode && Math.hypot(p.me[0], p.me[2]) < 24 && p.me[1] > -3, note: `rode=${rode} landed=${p.me}` };
});

await objective('collect the star on the east island', async () => {
  const s0 = (await pos()).stars;
  await G(() => window.__game.teleport(47, 9, Math.PI / 2)); await wait(500);
  await goTo(53, 10.5, { tol: 0.6 });
  await wait(1200);
  const p = await pos();
  return { pass: p.stars === s0 + 1, note: `stars ${s0} -> ${p.stars}` };
});

await objective('objectives panel: every finished goal has been removed', async () => {
  await wait(2600);
  // "follow the fireflies" stays until the snowy peak is built (round 9)
  const left = (await G(() => window.__game.objectives.list())).filter((o) => o.id !== 'wayOn');
  const rows = await page.$$eval('.obj', (els) => els.length);
  const s = await sec();
  await shot('objectives-cleared');
  return { pass: left.length === 0 && rows <= 1 && s.counter === '7/7', note: `left=${JSON.stringify(left)} rows=${rows} secrets=${s.counter}` };
});

writeFileSync(`${out}/results.json`, JSON.stringify({ results, errors }, null, 2));
console.log('page errors:', errors.length ? errors : 'none');
await browser.close();
await server.close();
