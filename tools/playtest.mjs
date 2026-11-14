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
const shot = async (name) => { const f = `${out}/${String(++shotN).padStart(2, '0')}-${name}.png`; await page.screenshot({ path: f, timeout: 120000 }); return f; };
const results = [];
// --from-lake: skip straight to the Crystal Lake checks (set up as if the lantern quest and shrine were done)
// --from-desert: skip to the Sunset Desert checks (the crystal heart already awake)
// --from-hollow: skip to the Whispering Hollow checks (the little sun already home)
// --from-peak: skip to the Snowy Aurora Peak checks (the Lonely Shadow already comforted)
// --from-tower: skip to the Cloud Kingdom checks (the aurora bell already rung)
const FROM = ['tower', 'peak', 'hollow', 'desert', 'lake'].find((z) => process.argv.includes(`--from-${z}`)) ?? null;
let skipping = FROM;
async function objective(name, fn) {
  if (skipping === 'tower') {
    if (!name.startsWith('the aurora lifts a stair of cloud steps')) return;
    skipping = null;
    await G(() => { const g = window.__game; g.lightAll(); g.lakeAll(); g.desertAll(); g.hollowAll(); g.peakAll(); });
  } else if (skipping === 'peak') {
    if (!name.startsWith('the fireflies raise a stone bridge')) return;
    skipping = null;
    await G(() => { const g = window.__game; g.lightAll(); g.lakeAll(); g.desertAll(); g.hollowAll(); });
    await page.waitForFunction(() => window.__game.peakQuest.rise >= 1, null, { timeout: 180000 });
  } else if (skipping === 'hollow') {
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
  return { pass: before === 'hands,lanterns,wind,stars,secrets,keep-forest' && o1 === 'lanterns' && h1 > 20 && o2 === null && h2 < 2, note: `rows=${before} open=${o1} (${h1.toFixed(0)}px) then ${o2} (${h2.toFixed(0)}px)` };
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

// ---- keepsakes (2026-11-14): each island's three, placed together at its stone, open the way on ----
const ks = (id) => G((id) => { const K = window.__game.keepsakes; return { n: K.count(id), of: K.of(id), placed: K.placed(id), stone: K.set(id).pos.toArray(),
  left: K.items.filter((it) => it.set.id === id && !it.got).map((it) => [it.key, ...it.pos.toArray()]) }; }, id);
const stoneWhy = (id) => G((id) => { const g = window.__game, s = g.keepsakes.set(id), d = (p) => Math.hypot(p.x - s.pos.x, p.z - s.pos.z).toFixed(1);
  return `linked=${g.hands.linked} me ${d(g.A.pos)} m / her ${d(g.B.pos)} m from the stone, charge=${s.charge.toFixed(2)}`; }, id);
/** walk hand in hand to the stone and wait for the keepsakes to settle in */
async function fillStone(id, via = []) {
  const k = await ks(id);
  for (const [x, z] of via) await goTo(x, z, { tol: 0.8, timeout: 30 });
  const r = await goTo(k.stone[0] + 1.6, k.stone[2] + 0.6, { tol: 0.6, timeout: 30 });
  if (!(await pos()).linked) { await G(() => window.__game.holdHands()); await wait(900); }
  // wait on the game, not the clock: on a slow headless GPU a few seconds of play can take a minute
  await page.waitForFunction((id) => window.__game.keepsakes.placed(id), id, { timeout: 90000 }).catch(() => {});
  await shot(`stone-${id}`);
  return { r, k: { ...(await ks(id)), why: await stoneWhy(id) } };
}

await objective('keepsakes: the bridge waits for the firefly jars; gather all three and place them at the stone together', async () => {
  await wait(2500);
  const shut = await G(() => window.__game.quest.done && window.__game.quest.rise === 0);
  const log = [];
  for (const [x, z] of [[-6.5, -11], [-13.5, -13], [-4, -6], [8, 2], [17.5, 12]]) { const r = await goTo(x, z, { tol: 0.6, timeout: 30 }); log.push(r.reason); }
  // the third rode the warm wind to the meadow island (the wind ride itself is covered by its own check): hop there and back
  await G(() => { const g = window.__game; g.teleport(-45, -4, -Math.PI / 2); g.B.pos.set(-45, g.world.floorAt(-45, -3.2), -3.2); g.B.vel.set(0, 0, 0); });
  await wait(600); const r3 = await goTo(-46.5, -4, { tol: 0.4, timeout: 10 }); log.push(r3.reason);
  await wait(800); await shot('meadow-jar');
  await G(() => { const g = window.__game; g.teleport(2, -12, Math.PI); g.B.pos.set(3, g.world.floorAt(3, -12), -12); g.B.vel.set(0, 0, 0); });
  await wait(600); await G(() => window.__game.holdHands()); await wait(900);
  const { k } = await fillStone('forest');
  return { pass: shut && k.n === 3 && k.placed, note: `bridge waited=${shut} jars=${k.n}/${k.of} placed=${k.placed} (${k.why}) left=${JSON.stringify(k.left)} walks=${log.join(',')}` };
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
const sec = () => G(() => { const S = window.__game.secrets; return { n: S.count, total: S.items.length, found: S.items.map((i) => i.found), card: document.getElementById('disc-t').textContent === 'Roro Jr', counter: document.getElementById('secrets').textContent }; });
/** press "hold hands" once and wait until the game has taken the press (frames can be slow on a headless GPU:
 *  pressing again before then could undo it) */
const pressHands = async () => {
  await G(() => window.__game.holdHands());
  await page.waitForFunction(() => !window.__game.handsPending(), null, { timeout: 20000 }).catch(() => {});
  await wait(300);
};
const unlink = async () => { if ((await pos()).linked) await pressHands(); };
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
  for (let k = 0; k < 40 && !q.steps; k++) { await wait(700); q = await lk(); } // slow machines: the stones take a while
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

await objective('keepsakes: the rowboat brought back a moon pearl; find the other two on the shore and place all three at the stone together', async () => {
  const k0 = await ks('lake');
  const shut = await G(() => window.__game.lakeQuest.awake && !window.__game.desertQuest.opened);
  const boatPearl = !k0.left.some((l) => l[0] === 'lake2');
  if (!(await fetchHer())) return { pass: false, note: 'could not take her hand' };
  const log = [];
  for (const [key, x, , z] of k0.left) { if (key === 'lake2') continue; let r = await shoreTo(lakeAng(x, z)); if (r.ok) r = await goTo(x, z, { tol: 0.4, timeout: 20 }); log.push(`${key}:${r.reason ?? 'ok'}`); await wait(500); }
  const st = (await ks('lake')).stone;
  await shoreTo(lakeAng(st[0], st[2]));
  const { k } = await fillStone('lake');
  return { pass: shut && boatPearl && k.n === 3 && k.placed, note: `bridge waited=${shut} pearl from the boat=${boatPearl} pearls=${k.n}/${k.of} placed=${k.placed} (${k.why}) left=${JSON.stringify(k.left)} walks=${log.join(',')}` };
});

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
  await phaseIs('gust');
  // game time, not real time: a quarter second out in the gust tears your hands apart (frames can be slow here)
  await page.waitForFunction(() => window.__game.desertQuest.tears >= 1 || window.__game.desertQuest.phase !== 'gust', null, { timeout: 30000 }).catch(() => {});
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
  return { pass: r.ok && s1.n === s0.n + 1 && s1.found[5] && s1.counter === `${s0.n + 1}/${s1.total}`, note: `walk=${JSON.stringify(r)} secrets ${s0.n} -> ${s1.n} counter=${s1.counter}` };
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

await objective('keepsakes: gather the three pieces of sun-glass and place them at the stone on the sun terrace together', async () => {
  const k0 = await ks('desert');
  const shut = await G(() => window.__game.desertQuest.done && !window.__game.hollowQuest.opened);
  const log = [];
  // the walks between the desert's corners are covered above: start a few metres from each piece and walk the rest
  for (const [key, x, y, z] of k0.left) {
    const dx = key === 'desert0' ? -2.2 : 2.5;
    await G(([x, y, z]) => { const g = window.__game; if (g.hands.linked) g.holdHands(); g.teleport(x, z, -Math.PI / 2, y + 0.5); }, [x + dx, y, z]);
    await wait(700); const r = await goTo(x, z, { tol: 0.4, timeout: 12 }); log.push(`${key}:${r.reason}`); await wait(500);
  }
  const st = (await ks('desert')).stone;
  await G(([x, y, z]) => { const g = window.__game; g.teleport(x + 1.6, z + 2.2, 0, y + 0.5); g.B.pos.set(x + 2.4, g.world.floorAt(x + 2.4, z + 2.4, y + 0.5) ?? y, z + 2.4); g.B.vel.set(0, 0, 0); }, st);
  await wait(800); if (!(await pos()).linked) { await G(() => window.__game.holdHands()); await wait(900); }
  const { k } = await fillStone('desert');
  return { pass: shut && k.n === 3 && k.placed, note: `bridge waited=${shut} sun-glass=${k.n}/${k.of} placed=${k.placed} (${k.why}) left=${JSON.stringify(k.left)} walks=${log.join(',')}` };
});

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
  await G(() => { const q = window.__game.hollowQuest; window.__lo = { minLv: 1, cling: 0, out: false, prev: 1, near: 99, dimMsg: '' };
    const tick = () => { const w = window.__lo, lv = q.lv[0], A = window.__game.A.pos;
      const tt = document.querySelector('#toast').textContent; if (/dimming your lantern/.test(tt)) w.dimMsg = tt; // it can be replaced before the bot looks
      if (lv > w.prev + 0.5) w.out = true; w.prev = lv; w.minLv = Math.min(w.minLv, lv); w.cling = Math.max(w.cling, q.clinging[0]);
      for (const s of q.shadows) w.near = Math.min(w.near, Math.hypot(s.pos.x - A.x, s.pos.z - A.z));
      if (!w.out) requestAnimationFrame(tick); };
    tick(); });
  const r = await hgo(HW.heart, { tol: 0.8 }); // the middle of the Hollow, far from the lit lamp
  await page.waitForFunction(() => window.__lo.minLv < 0.6, null, { timeout: 120000 }).catch(() => {});
  await shot('lantern-dimming');
  await page.waitForFunction(() => window.__lo.out, null, { timeout: 150000 }).catch(() => {});
  const outMsg = await toast();
  await wait(1500);
  const w = await G(() => window.__lo), p = await pos(), q = await hq(), dimMsg = w.dimMsg;
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
  return { pass: r.ok && r1.ok && !alone && r2.ok && q.box && s1.found[6] && s1.n === s0.n + 1 && s1.counter === `${s0.n + 1}/${s1.total}`,
    note: `to the door=${r.reason} in alone=${r1.reason} played alone=${alone} | in together=${r2.reason} inside=${inside} playing=${q.box} secrets ${s0.n} -> ${s1.n} counter=${s1.counter}` };
});

// ---------------- Snowy Aurora Peak (round 9) ----------------
const pq = () => G(() => { const q = window.__game.peakQuest; return { opened: q.opened, rise: q.rise, lit: q.braziers.map((b) => b.lit), count: q.count, rung: q.rung, aur: q.aur, melt: q.melt, lv: q.lv.slice(), cold: q.cold.slice(), climbed: q.climbed, last: q.lastBrazier, heart: q.heartK, arrived: q.arrived, aurora: window.__game.world.peak.aurora.group.visible }; });
const KW = await G(() => { const g = window.__game, K = g.world.peak, a = (v) => v.toArray();
  const ring = (k, th, f = 0.5) => a(K.ringAt(k, th, f));
  const th = (v) => Math.atan2(v.z - K.mc.z, v.x - K.mc.x);
  const s1 = K.step.pos, sp = K.pillar.pos, s1th = th(s1), spth = th(sp);
  const mcR = (v) => Math.hypot(v.x - K.mc.x, v.z - K.mc.z);
  const at = (r, t, y = 0) => [K.mc.x + Math.cos(t) * r, y, K.mc.z + Math.sin(t) * r];
  return { c: a(K.center), r: K.radius, from: a(K.bridge.data.from), to: a(K.bridge.data.to), cairn: a(K.cairn.pos), mc: a(K.mc), levels: K.levels,
    braziers: K.braziers.map((Z) => a(Z.pos)), brazierCps: K.braziers.map((Z) => a(Z.checkpoint.pos)),
    cpCairn: g.world.checkpoints.indexOf(K.cairn), cpBraz: K.braziers.map((Z) => g.world.checkpoints.indexOf(Z.checkpoint)),
    step: a(s1), stepR: K.step.r, stepTop: K.step.top, pillar: a(sp), pillarR: K.pillar.r, pillarTop: K.pillar.top, star: a(K.starPos),
    bell: a(K.bell.pos), rimY: K.bellRimY, rampC: [a(K.ramps[1].at(0.02)), a(K.ramps[1].at(0.97))],
    door: a(K.cabinDoor), inside: a(K.cabinInside), cold: a(K.cabinDoor.clone().lerp(K.cairn.pos, 0.45)),
    // the frost step: its foot on the first terrace (towards the brazier), its outer side, and where you land above it
    s1foot: at(mcR(s1), s1th - 2.2 / mcR(s1)), s1out: at(K.tierR(1, s1th) + 1.55, s1th), t2land: ring(2, s1th + 0.02, 0.45),
    t2drop: ring(2, 0.92, 0.85), t1below: ring(1, 0.85, 0.45), pillarFoot: at(mcR(sp), spth - 1.6 / mcR(sp)) }; });

// The peak has levels (meadow, two terraces, the summit), so its grid also keeps each cell's height and only steps between
// cells that are within half a metre of each other (ramps yes, cliffs no). Colliders with a `top` only count for cells below it.
const PNAV = await G(([cx, cz, R]) => {
  const w = window.__game.world, S = 0.35, half = R + 3, N = Math.ceil(half * 2 / S), x0 = cx - half, z0 = cz - half;
  const h = new Array(N * N);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) h[j * N + i] = w.floorAt(x0 + i * S, z0 + j * S);
  const cols = w.colliders.filter((c) => !c.off && (c.ax !== undefined ? Math.hypot(c.ax - cx, c.az - cz) < half + 2 : Math.hypot(c.x - cx, c.z - cz) < half + 2))
    .map((c) => (c.ax !== undefined ? { ax: c.ax, az: c.az, bx: c.bx, bz: c.bz, r: c.r, top: c.top } : { x: c.x, z: c.z, r: c.r, top: c.top }));
  return { S, N, x0, z0, h, cols };
}, [KW.c[0], KW.c[2], KW.r]);
const pnavCell = (() => {
  const { S, N, x0, z0, h, cols } = PNAV, hard = new Uint8Array(N * N), soft = new Float32Array(N * N);
  const segD = (x, z, c) => { const abx = c.bx - c.ax, abz = c.bz - c.az, t = Math.max(0, Math.min(1, ((x - c.ax) * abx + (z - c.az) * abz) / (abx * abx + abz * abz))); return Math.hypot(x - c.ax - abx * t, z - c.az - abz * t); };
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const k = j * N + i, x = x0 + i * S, z = z0 + j * S;
    if (h[k] === null) { hard[k] = 1; continue; }
    let edge = false;
    for (const [di, dj] of [[2, 0], [-2, 0], [0, 2], [0, -2]]) { const ii = i + di, jj = j + dj; if (ii < 0 || jj < 0 || ii >= N || jj >= N || h[jj * N + ii] === null) edge = true; }
    if (edge) { hard[k] = 1; continue; }
    for (const c of cols) {
      if (c.top !== undefined && h[k] > c.top - 0.2) continue;
      const d = (c.ax !== undefined ? segD(x, z, c) : Math.hypot(x - c.x, z - c.z)) - c.r;
      if (d < 0.4) { hard[k] = 1; break; }
      if (d < 1.0) soft[k] = Math.max(soft[k], (1.0 - d) * 4);
    }
    // keep away from drops: a cell beside a lower neighbour is costly
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1], [2, 0], [-2, 0], [0, 2], [0, -2]]) { const n = (j + dj) * N + i + di; if (h[n] !== null && h[k] - h[n] > 0.6) soft[k] = Math.max(soft[k], 3); }
  }
  return { hard, soft };
})();
function peakPath(from, to) {
  const { S, N, x0, z0, h } = PNAV, { hard, soft } = pnavCell;
  const cell = (x, z) => [Math.round((x - x0) / S), Math.round((z - z0) / S)];
  const free = ([i, j], y) => { // the nearest open cell at about this height
    let best = null, bd = 1e9;
    for (let dj = -8; dj <= 8; dj++) for (let di = -8; di <= 8; di++) { const ii = i + di, jj = j + dj; if (ii < 0 || jj < 0 || ii >= N || jj >= N || hard[jj * N + ii] || Math.abs(h[jj * N + ii] - y) > 0.8) continue; const d = di * di + dj * dj; if (d < bd) { bd = d; best = [ii, jj]; } }
    return best;
  };
  const toY = to[1] || (h[cell(to[0], to[2])[1] * N + cell(to[0], to[2])[0]] ?? from[1]);
  const a = free(cell(from[0], from[2]), from[1]), b = free(cell(to[0], to[2]), toY);
  if (!a || !b) return [[to[0], to[2]]];
  const start = a[1] * N + a[0], goal = b[1] * N + b[0];
  const g = new Float32Array(N * N).fill(1e9), prev = new Int32Array(N * N).fill(-1), done = new Uint8Array(N * N);
  const open = [[0, start]]; g[start] = 0;
  const hh = (k) => Math.hypot((k % N) - b[0], Math.floor(k / N) - b[1]);
  while (open.length) {
    let bi = 0; for (let q = 1; q < open.length; q++) if (open[q][0] < open[bi][0]) bi = q;
    const [, k] = open[bi]; open[bi] = open[open.length - 1]; open.pop();
    if (done[k]) continue; done[k] = 1;
    if (k === goal) break;
    const i = k % N, j = Math.floor(k / N);
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      if (!di && !dj) continue;
      const ii = i + di, jj = j + dj; if (ii < 0 || jj < 0 || ii >= N || jj >= N) continue;
      const n = jj * N + ii; if (hard[n] || done[n] || Math.abs(h[n] - h[k]) > 0.5) continue;
      const c = g[k] + Math.hypot(di, dj) * (1 + soft[n]);
      if (c < g[n]) { g[n] = c; prev[n] = k; open.push([c + hh(n), n]); }
    }
  }
  if (prev[goal] === -1 && goal !== start) return null;
  const cells = []; for (let k = goal; k !== -1; k = prev[k]) cells.unshift(k);
  const P = (k) => [x0 + (k % N) * S, z0 + Math.floor(k / N) * S];
  const clear = (p, q) => { const d = Math.hypot(q[0] - p[0], q[1] - p[1]), n = Math.ceil(d / 0.12); let ly = null;
    for (let s = 0; s <= n; s++) { const x = p[0] + (q[0] - p[0]) * s / n, z = p[1] + (q[1] - p[1]) * s / n, [i, j] = cell(x, z), k = j * N + i; if (hard[k] || soft[k] >= 3) return false; if (ly !== null && Math.abs(h[k] - ly) > 0.5) return false; ly = h[k]; } return true; };
  const pts = []; let cur = [from[0], from[2]], idx = 0;
  while (idx < cells.length - 1) {
    let far = idx + 1;
    for (let k = cells.length - 1; k > idx + 1; k--) if (clear(cur, P(cells[k]))) { far = k; break; }
    cur = P(cells[far]); pts.push(cur); idx = far;
  }
  pts.push([to[0], to[2]]);
  return pts;
}
async function pgo(to, opts = {}) {
  const p = await pos();
  const pts = peakPath(p.me, to);
  if (!pts) return { ok: false, reason: 'no path', from: p.me, to };
  const last = pts.pop();
  const r = await legs(pts, { tol: 0.6, timeout: 25, ...opts, tol: 0.45 }); // tight: cutting a corner on a ramp can miss the top
  if (!r.ok) return r;
  return legs([last], { tol: 0.6, timeout: 25, ...opts });
}
let fetchLog = [];
async function fetchHerP() {
  fetchLog = [];
  for (let k = 0; k < 3; k++) {
    const p = await pos();
    if (p.linked) return true;
    let r = null;
    if (dist2(p.me, p.friend) > 2.0) r = await pgo(p.friend, { tol: 1.4 }); // she may be tucked against a wall: just get close
    await pressHands();
    const p2 = await pos();
    fetchLog.push(`me ${p2.me.map((v) => v.toFixed(1))} her ${p2.friend.map((v) => v.toFixed(1))} walk=${r ? r.reason || 'ok' : '-'} linked=${p2.linked} "${await toast()}"`);
  }
  return (await pos()).linked;
}
/** jump on the spot and wait until you're back on the ground (in game time: frames can be slow here) */
async function jumpAndLand() {
  await G(() => { const g = window.__game, w = window.__air = { up: false, down: false };
    const tick = () => { if (!g.A.grounded) w.up = true; else if (w.up) w.down = true; if (!w.down) requestAnimationFrame(tick); }; tick(); });
  await G(() => window.__game.jump(0));
  await page.waitForFunction(() => window.__air.down, null, { timeout: 30000 }).catch(() => {});
}
/** walk at a spot and jump right away (holding hands, you both jump: higher on the peak). Returns the highest point reached. */
async function hopTo(to, opts = {}) {
  await G(() => { const g = window.__game; window.__hop = { maxA: g.A.pos.y, maxB: g.B.pos.y, stop: false, up: false, down: false };
    const tick = () => { const w = window.__hop; w.maxA = Math.max(w.maxA, g.A.pos.y); w.maxB = Math.max(w.maxB, g.B.pos.y);
      if (!g.A.grounded) w.up = true; else if (w.up) w.down = true;
      if (!w.stop) requestAnimationFrame(tick); }; tick(); });
  await G(() => window.__game.jump(0));
  const r = await goTo(to[0], to[2], { tol: 0.35, timeout: 8, ...opts });
  await page.waitForFunction(() => window.__hop.down, null, { timeout: 20000 }).catch(() => {}); // back on the ground (game time)
  await wait(400);
  const hop = await G(() => { window.__hop.stop = true; return window.__hop; });
  return { r, ...hop };
}

/** keepsakes on the far islands: the walks between their corners are covered by the zone checks, so start a few
 *  metres from each one with her by the hand, and walk the rest together; then the same at the stone */
async function gatherNear(id, y0) {
  const k0 = await ks(id), log = [];
  for (const [key, x, y, z] of k0.left) {
    await G(([x, y, z]) => { const g = window.__game; if (g.hands.linked) g.holdHands(); }, [x, y, z]); await wait(400);
    await G(([x, y, z]) => { const g = window.__game; g.teleport(x + 2.4, z, -Math.PI / 2, y + 0.5); g.B.pos.set(x + 2.4, g.world.floorAt(x + 2.4, z + 0.9, y + 0.5) ?? y, z + 0.9); g.B.vel.set(0, 0, 0); }, [x, y, z]);
    await wait(700); await G(() => window.__game.holdHands()); await wait(900);
    const r = await goTo(x, z, { tol: 0.4, timeout: 12 }); log.push(`${key}:${r.reason}`); await wait(600);
  }
  const st = (await ks(id)).stone;
  await G(() => { const g = window.__game; if (g.hands.linked) g.holdHands(); }); await wait(400);
  await G(([x, y, z]) => { const g = window.__game; g.teleport(x + 1.6, z + 1.6, 0, y + 0.5); g.B.pos.set(x + 2.3, g.world.floorAt(x + 2.3, z + 2.2, y + 0.5) ?? y, z + 2.2); g.B.vel.set(0, 0, 0); }, st);
  await wait(800); await G(() => window.__game.holdHands()); await wait(900);
  await page.waitForFunction((id) => window.__game.keepsakes.placed(id), id, { timeout: 90000 }).catch(() => {});
  await shot(`stone-${id}`);
  return { k: { ...(await ks(id)), why: await stoneWhy(id) }, log };
}

await objective('keepsakes: follow the humming to the three lullaby notes, and place them at the stone by the way on together', async () => {
  const shut = await G(() => window.__game.hollowQuest.done && !window.__game.peakQuest.opened);
  const { k, log } = await gatherNear('hollow');
  for (let i = 0; i < 20 && !(await G(() => window.__game.peakQuest.opened)); i++) await wait(600);
  const opened = await G(() => window.__game.peakQuest.opened);
  return { pass: shut && k.n === 3 && k.placed && opened, note: `bridge waited=${shut} notes=${k.n}/${k.of} placed=${k.placed} (${k.why}) bridge opens after=${opened} walks=${log.join(',')}` };
});

await objective('the fireflies raise a stone bridge; cross it hand in hand to the Snowy Peak', async () => {
  let q = await pq();
  for (let k = 0; k < 40 && q.rise < 1; k++) { await wait(800); q = await pq(); }
  await unlink();
  const e = KW.from, dx = KW.to[0] - e[0], dz = KW.to[2] - e[2], d = Math.hypot(dx, dz), ux = dx / d, uz = dz / d;
  await G(([x, z, h, fx, fz]) => { const g = window.__game; g.teleport(x, z, h); g.B.pos.set(fx, g.world.floorAt(fx, fz), fz); g.B.vel.set(0, 0, 0); },
    [e[0] - ux * 1.6, e[2] - uz * 1.6, Math.atan2(ux, uz), e[0] - ux * 1.6 - uz * 0.95, e[2] - uz * 1.6 + ux * 0.95]);
  await wait(600); await G(() => window.__game.holdHands()); await wait(900);
  const rows0 = await objIds();
  let r = await legs([[e[0], e[2]], [KW.to[0], KW.to[2]]], { tol: 0.9, timeout: 40 });
  await shot('peak-bridge');
  if (r.ok) r = await pgo(KW.cairn, { tol: 0.9 });
  await wait(800);
  q = await pq(); const p = await pos(), rows = await objIds(), msg = await toast(); await shot('peak-arrive');
  return { pass: q.rise >= 1 && rows0.includes('peak') && r.ok && p.cp === KW.cpCairn && p.linked && q.arrived && rows.includes('braziers') && !rows.includes('peak') && !rows.includes('wayOn'),
    note: `rise=${q.rise} before=${rows0} walk=${JSON.stringify(r)} checkpoint=${p.cp} linked=${p.linked} arrived=${q.arrived} "${msg}" objectives=${rows}` };
});

await objective('hand in hand by the meadow brazier, it roars to life and becomes where you wake', async () => {
  const r = await pgo(KW.brazierCps[0], { tol: 0.5 });
  let q = await pq();
  for (let k = 0; k < 15 && !q.lit[0]; k++) { await wait(400); q = await pq(); }
  await wait(400);
  const p = await pos(), msg = await toast(); await shot('brazier-lit');
  return { pass: r.ok && q.lit[0] && q.count === 1 && p.cp === KW.cpBraz[0] && /roars to life/.test(msg), note: `walk=${JSON.stringify(r)} lit=${q.lit} checkpoint=${p.cp} "${msg}"` };
});

await objective('let go out in the cold: your lantern dims until it goes out, and you wake by the brazier', async () => {
  await unlink();
  await G(() => { const q = window.__game.peakQuest; window.__lo = { minLv: 1, out: false, prev: 1, coldF: 0, stop: false, dimMsg: '' };
    const tick = () => { const w = window.__lo, lv = q.lv[0];
      const tt = document.querySelector('#toast').textContent; if (/cold is dimming your lantern/.test(tt)) w.dimMsg = tt;
      if (lv > w.prev + 0.5) w.out = true; w.prev = lv; w.minLv = Math.min(w.minLv, lv); w.coldF = Math.max(w.coldF, q.cold[1]);
      if (!w.out) requestAnimationFrame(tick); };
    tick(); });
  const r = await pgo(KW.cold, { tol: 0.8 }); // out on the meadow, away from the brazier's warmth
  await page.waitForFunction(() => window.__lo.minLv < 0.6, null, { timeout: 150000 }).catch(() => {});
  await shot('lantern-cold');
  await page.waitForFunction(() => window.__lo.out, null, { timeout: 200000 }).catch(() => {});
  const outMsg = await toast();
  await wait(1500);
  const w = await G(() => window.__lo), p = await pos(), q = await pq(), dimMsg = w.dimMsg;
  const fromB = dist2(p.me, KW.brazierCps[0]);
  return { pass: w.minLv < 0.1 && w.out && /cold is dimming your lantern/.test(dimMsg) && /cold put your lantern out/.test(outMsg) && fromB < 1.5 && q.lv[0] > 0.9 && p.cp === KW.cpBraz[0] && w.coldF === 0,
    note: `walk=${JSON.stringify(r)} lantern down to ${w.minLv.toFixed(2)}, out=${w.out} "${dimMsg}" / "${outMsg}", woke ${fromB.toFixed(1)} m from the brazier, her cold (warm by the fire)=${w.coldF}` };
});

await objective('hand in hand up the ramp to the first terrace, and light the second brazier', async () => {
  if (!(await fetchHerP())) return { pass: false, note: 'could not take her hand' };
  await G(() => { const q = window.__game.peakQuest; window.__hh = { cold: 0, minLv: 1, stop: false };
    const tick = () => { const w = window.__hh; if (window.__game.hands.linked) { w.cold = Math.max(w.cold, q.cold[0], q.cold[1]); w.minLv = Math.min(w.minLv, q.lv[0], q.lv[1]); } if (!w.stop) requestAnimationFrame(tick); }; tick(); });
  const r = await pgo(KW.brazierCps[1], { tol: 0.5 });
  await shot('terrace-one');
  let q = await pq();
  for (let k = 0; k < 15 && !q.lit[1]; k++) { await wait(400); q = await pq(); }
  await wait(500);
  const w = await G(() => { window.__hh.stop = true; return window.__hh; });
  const p = await pos(), msg = await toast();
  return { pass: r.ok && q.lit[1] && p.cp === KW.cpBraz[1] && Math.abs(p.me[1] - KW.levels[1]) < 0.2 && w.cold === 0 && p.linked,
    note: `walk=${JSON.stringify(r)} lit=${q.lit} checkpoint=${p.cp} at y=${p.me[1]} (terrace ${KW.levels[1]}) cold while hand in hand=${w.cold} lanterns never below ${w.minLv.toFixed(2)} "${msg}"` };
});

await objective('the frost step is too tall alone; holding hands you jump up it together, and on up to the upper terrace', async () => {
  // alone first
  let r = await pgo(KW.s1foot, { tol: 0.4 });
  await unlink();
  const solo = await hopTo(KW.step);
  const hint = await toast();
  const p0 = await pos();
  // back to her, and together
  if (!(await fetchHerP())) return { pass: false, note: 'could not take her hand' };
  const r2 = await pgo(KW.s1foot, { tol: 0.4 });
  const duo = await hopTo(KW.step, { tol: 0.4 });
  const p1 = await pos(); await shot('frost-step-together');
  const onStep = (v) => Math.abs(v[1] - KW.stepTop) < 0.15;
  // and from the step's outer side, up again onto the upper terrace
  let r3 = await goTo(KW.s1out[0], KW.s1out[2], { tol: 0.35, timeout: 6 });
  const up = await hopTo(KW.t2land, { tol: 0.6 });
  const p2 = await pos(), q = await pq(); await shot('upper-terrace');
  const onT2 = (v) => Math.abs(v[1] - KW.levels[2]) < 0.2;
  return { pass: r.ok && solo.maxA < KW.stepTop - 0.3 && /Too tall to climb alone/.test(hint) && r2.ok && onStep(p1.me) && onStep(p1.friend) && p1.linked && onT2(p2.me) && onT2(p2.friend) && p2.linked && q.climbed,
    note: `alone: walk=${r.reason} hop top ${solo.maxA.toFixed(2)} (step ${KW.stepTop}) stood at y=${p0.me[1]} "${hint}" | together: walk=${r2.reason} hop=${duo.r.reason} top ${duo.maxA.toFixed(2)}/${duo.maxB.toFixed(2)} me y=${p1.me[1]} her y=${p1.friend[1]} | up again: ${r3.reason}/${up.r.reason} me y=${p2.me[1]} her y=${p2.friend[1]} linked=${p2.linked}` };
});

await objective('light the third brazier on the upper terrace, and the bell\'s ice melts', async () => {
  const r = await pgo(KW.brazierCps[2], { tol: 0.5 });
  let q = await pq();
  for (let k = 0; k < 15 && !q.lit[2]; k++) { await wait(400); q = await pq(); }
  const msg = await toast();
  await page.waitForFunction(() => window.__game.peakQuest.melt >= 1, null, { timeout: 60000 }).catch(() => {}); // game time: slower than real time here
  q = await pq(); const p = await pos(), rows = await objIds(); await shot('three-braziers');
  return { pass: r.ok && q.count === 3 && /bell starts to melt/.test(msg) && q.melt >= 1 && p.cp === KW.cpBraz[2] && rows.includes('bell') && !rows.includes('braziers'),
    note: `walk=${JSON.stringify(r)} lit=${q.lit} "${msg}" melt=${q.melt.toFixed(2)} checkpoint=${p.cp} objectives=${rows}` };
});

await objective('up the summit ramp: the bell is too high alone, but a jump together rings it and the aurora spreads', async () => {
  let r = await pgo(KW.rampC[0], { tol: 0.6 });
  if (r.ok) r = await pgo(KW.bell, { tol: 0.35 });
  await unlink();
  await jumpAndLand();
  await page.waitForFunction(() => /Too high for one/.test(document.querySelector('#toast').textContent), null, { timeout: 15000 }).catch(() => {});
  const hint = await toast(), alone = (await pq()).rung;
  if (!(await fetchHerP())) return { pass: false, note: 'could not take her hand' };
  const r2 = await pgo(KW.bell, { tol: 0.3 });
  await jumpAndLand();
  await page.waitForFunction(() => window.__game.peakQuest.rung, null, { timeout: 15000 }).catch(() => {});
  let q = await pq();
  const msg = await toast();
  await page.waitForFunction(() => window.__game.peakQuest.aur >= 1, null, { timeout: 60000 }).catch(() => {});
  await wait(9000); // "look up", then the next goal
  q = await pq(); const rows = await objIds();
  await shot('aurora');
  return { pass: r.ok && !alone && /Too high for one/.test(hint) && r2.ok && q.rung && /aurora bell rings out|Look up/.test(msg) && q.aur >= 1 && q.aurora && rows.includes('clouds') && !rows.includes('bell'),
    note: `up=${JSON.stringify(r)} alone rang=${alone} "${hint}" | together: walk=${r2.reason} rung=${q.rung} "${msg}" aurora=${q.aur.toFixed(2)} visible=${q.aurora} objectives=${rows}` };
});

await objective('the star on the frozen pillar: down off the upper terrace, then jump up together', async () => {
  const s0 = (await pos()).stars;
  let r = await pgo(KW.rampC[0], { tol: 0.6 });
  if (r.ok) r = await pgo(KW.t2drop, { tol: 0.5 });
  if (r.ok) r = await goTo(KW.t1below[0], KW.t1below[2], { tol: 0.6, timeout: 8 }); // step off the edge, down to the first terrace
  await wait(800);
  const pDown = await pos();
  if (r.ok) r = await pgo(KW.pillarFoot, { tol: 0.35 });
  const hop = await hopTo(KW.pillar, { tol: 0.4 });
  const p = await pos(); await shot('pillar-star');
  return { pass: r.ok && Math.abs(pDown.me[1] - KW.levels[1]) < 0.3 && p.stars === s0 + 1 && Math.abs(p.me[1] - KW.pillarTop) < 0.15,
    note: `walk=${JSON.stringify(r)} dropped to y=${pDown.me[1]} (her ${pDown.friend[1]}) hop=${hop.r.reason} top ${hop.maxA.toFixed(2)} stood at y=${p.me[1]} (her ${p.friend[1]}, pillar ${KW.pillarTop.toFixed(2)}) stars ${s0} -> ${p.stars} linked=${p.linked}` };
});

await objective('secret: the log cabin\'s two mugs of cocoa, found when you both step inside', async () => {
  const s0 = await sec();
  const tr = []; const at = async (label) => { const p = await pos(); tr.push(`${label}: me ${p.me.map((v) => v.toFixed(1))} her ${p.friend.map((v) => v.toFixed(1))} linked=${p.linked}`); };
  await at('on the pillar');
  let r = await legs([[KW.pillarFoot[0], KW.pillarFoot[2]]], { tol: 0.6, timeout: 8 }); // hop down off the pillar
  await page.waitForFunction(() => { const g = window.__game; return g.A.grounded && g.B.grounded && Math.abs(g.A.pos.y - g.B.pos.y) < 0.3; }, null, { timeout: 20000 }).catch(() => {});
  await at(`hopped down (${r.reason})`);
  if (!(await pos()).linked && !(await fetchHerP())) return { pass: false, note: `could not take her hand: ${tr.join(' | ')}` };
  if (r.ok) r = await pgo(KW.door, { tol: 0.5 });
  await at(`at the door (${r.reason})`);
  await unlink();
  const r1 = await goTo(KW.inside[0], KW.inside[2], { tol: 0.35, timeout: 10 });
  await wait(1500);
  const alone = (await sec()).found[7];
  await goTo(KW.door[0], KW.door[2], { tol: 0.5, timeout: 10 });
  if (!(await fetchHerP())) return { pass: false, note: `could not take her hand again: ${tr.join(' | ')} || ${fetchLog.join(' | ')}` };
  const r2 = await goTo(KW.inside[0], KW.inside[2], { tol: 0.3, timeout: 10 });
  await wait(2500);
  const q = await pq(), s1 = await sec(), inside = await G(() => { const g = window.__game, K = g.world.peak; return [K.inCabin(g.A.pos), K.inCabin(g.B.pos)]; });
  const card = await page.$eval('#disc-t', (e) => e.textContent);
  await shot('cocoa');
  return { pass: r.ok && r1.ok && !alone && r2.ok && s1.found[7] && s1.n === s0.n + 1 && s1.counter === `${s0.n + 1}/${s1.total}` && /cocoa/.test(card) && q.heart > 0.5,
    note: `to the door=${r.reason} in alone=${r1.reason} found alone=${alone} | in together=${r2.reason} inside=${inside} heart=${q.heart.toFixed(2)} secrets ${s0.n} -> ${s1.n} counter=${s1.counter} "${card}"` };
});

// ---- round 10: the Cloud Kingdom ----
const tq = () => G(() => { const q = window.__game.towerQuest; return { opened: q.opened, formed: q.formed, arrived: q.arrived, bridge: q.bridge, bridgeOn: q.bridgeOn, k: q.k, lit: q.lit, sun: q.sun }; });
const TW = await G(() => { const g = window.__game, T = g.world.tower, a = (v) => v.toArray();
  return { steps: T.steps.map((S) => ({ p: [S.x, S.top, S.z], ax: S.ax, az: S.az, hd: S.hd, hw: S.hw })), rest: T.restIndex, from: a(T.stepsFrom), arrive: a(T.arrive),
    cpRest: g.world.checkpoints.indexOf(T.rest), cpWay: g.world.checkpoints.indexOf(T.way), restPos: a(T.rest.pos), way: a(T.way.pos), entry: a(T.entry), gaps: T.gaps, ftop: T.ftop, top: T.top, yt: T.levelY,
    lookout: a(T.lookout), bench: a(T.bench), puffs: T.puffs.map(a), star: a(T.starPos), center: a(T.center) }; });
const rampAt = (f, dr = 0) => G(([f, dr]) => window.__game.world.tower.rampAt(f, dr).toArray(), [f, dr]);
const rampF = () => G(() => window.__game.world.tower.rampF(window.__game.A.pos));
/** waypoints along the ramp from turn f0 to f1 (every 0.04 turns) */
const rampPts = (f0, f1, dr = 0) => G(([f0, f1, dr]) => { const T = window.__game.world.tower, out = [], n = Math.max(1, Math.ceil(Math.abs(f1 - f0) / 0.04));
  for (let i = 1; i <= n; i++) { const p = T.rampAt(f0 + (f1 - f0) * i / n, dr); out.push([p.x, p.z]); } return out; }, [f0, f1, dr]);
const bothDown = () => page.waitForFunction(() => { const g = window.__game; return g.A.grounded && (!g.hands.linked || g.B.grounded); }, null, { timeout: 20000 }).catch(() => {});
/** a hop to a cloud: walk at it and jump the moment you're J metres short of its middle (so you land near it) */
async function cloudHop(to, J = 2.4) {
  const p = await pos();
  const dx = to[0] - p.me[0], dz = to[2] - p.me[2], d = Math.hypot(dx, dz);
  await G(([x, z, dx, dz, at]) => window.__game.jumpWhen(x, z, dx, dz, at), [to[0], to[2], dx / d, dz / d, -J]);
  const r = await goTo(to[0], to[2], { tol: 0.5, timeout: 10 });
  await bothDown(); await wait(300);
  return { r, q: await pos() };
}
/** hop up the cloud steps from step i0 to i1 (inclusive); stops at the first miss */
async function climbSteps(i0, i1, log) {
  for (let i = i0; i <= i1; i++) {
    // take off about a metre past the middle of the cloud you're on (a big cloud: further, but short of its edge)
    const S = TW.steps[i], prev = TW.steps[i - 1];
    const J = prev ? dist2(prev.p, S.p) - Math.min(1.0, prev.hd - 0.35) : 2.4;
    const { r, q } = await cloudHop(S.p, J);
    const ok = Math.abs(q.me[1] - S.p[1]) < 0.2 && dist2(q.me, S.p) < S.hd + 0.2;
    log.push(`${i}:${ok ? 'ok' : `MISS (${r.reason}) at ${q.me.map((v) => v.toFixed(1))}`}${q.linked && Math.abs(q.friend[1] - S.p[1]) > 0.2 ? ` her y=${q.friend[1]}` : ''}`);
    if (!ok) return false;
  }
  return true;
}
async function fetchHerT() {
  for (let k = 0; k < 3; k++) {
    const p = await pos();
    if (p.linked) return true;
    if (dist2(p.me, p.friend) > 1.6) await goTo(p.friend[0], p.friend[2], { tol: 1.1, timeout: 20 });
    await pressHands();
  }
  return (await pos()).linked;
}

await objective('keepsakes: the three aurora feathers, placed together at the stone on the summit', async () => {
  const shut = await G(() => window.__game.peakQuest.rung && !window.__game.towerQuest.opened);
  const { k, log } = await gatherNear('peak');
  return { pass: shut && k.n === 3 && k.placed, note: `steps waited=${shut} feathers=${k.n}/${k.of} placed=${k.placed} (${k.why}) walks=${log.join(',')}` };
});

await objective('the aurora lifts a stair of cloud steps from the summit', async () => {
  let q = await tq();
  if (!q.formed) { await G(() => window.__game.setRender(false)); await page.waitForFunction(() => window.__game.towerQuest.formed, null, { timeout: 240000 }).catch(() => {}); await G(() => window.__game.setRender(true)); }
  q = await tq();
  const msg = await toast(), rows = await objIds();
  // the two of you on the summit, a little back from its edge, facing the first cloud
  const s0 = TW.steps[0].p, dx = s0[0] - TW.from[0], dz = s0[2] - TW.from[2], d = Math.hypot(dx, dz), ux = dx / d, uz = dz / d;
  await unlink();
  await G(([x, z, h, fx, fz, y]) => { const g = window.__game; g.teleport(x, z, h, y); g.B.pos.set(fx, g.world.floorAt(fx, fz, y), fz); g.B.vel.set(0, 0, 0); },
    [TW.from[0] - ux * 1.6, TW.from[2] - uz * 1.6, Math.atan2(ux, uz), TW.from[0] - ux * 1.6 + uz * 0.9, TW.from[2] - uz * 1.6 - ux * 0.9, TW.from[1]]);
  await wait(600); await pressHands(); await wait(600);
  const p = await pos(); await shot('cloud-steps');
  return { pass: q.opened && q.formed && rows.includes('steps') && !rows.includes('clouds') && p.linked && Math.abs(p.me[1] - TW.from[1]) < 0.2,
    note: `formed=${q.formed} "${msg}" objectives=${rows} on the summit at y=${p.me[1]} linked=${p.linked}` };
});

await objective('hand in hand, hop from cloud to cloud up to the big resting cloud, where you wake now', async () => {
  // alone, a cloud is too high to just walk onto: you have to jump
  const s0 = TW.steps[0].p;
  const log = [];
  const ok = await climbSteps(0, TW.rest, log);
  await wait(800);
  const p = await pos(); await shot('resting-cloud');
  return { pass: ok && p.cp === TW.cpRest && p.linked, note: `hops ${log.join(' ')} checkpoint=${p.cp} (rest ${TW.cpRest}) linked=${p.linked}` };
});

await objective('slip off the side of a cloud and you wake by the resting cloud\'s waystone', async () => {
  await unlink();
  const S = TW.steps[TW.rest], nx = S.az, nz = -S.ax; // away from the waystone's side
  await G(() => { window.__fall = { minY: 1e9 }; const tick = () => { const g = window.__game; window.__fall.minY = Math.min(window.__fall.minY, g.A.pos.y); if (!window.__fall.stop) requestAnimationFrame(tick); }; tick(); });
  await goTo(S.p[0] + nx * 6, S.p[2] + nz * 6, { tol: 0.5, timeout: 8 });
  await page.waitForFunction(() => /slipped off the clouds/.test(document.querySelector('#toast').textContent), null, { timeout: 30000 }).catch(() => {});
  const msg = await toast();
  await wait(1500); await bothDown();
  const f = await G(() => { window.__fall.stop = true; return window.__fall; });
  const p = await pos(), st = await G(() => window.__game.stats);
  return { pass: /slipped off the clouds/.test(msg) && f.minY < S.p[1] - 5.5 && dist2(p.me, TW.restPos) < 2.2 && Math.abs(p.me[1] - S.p[1]) < 0.3 && p.cp === TW.cpRest,
    note: `"${msg}" fell to y=${f.minY.toFixed(1)} woke at ${p.me} (waystone ${TW.restPos.map((v) => v.toFixed(1))}) checkpoint=${p.cp} respawns=${st.respawns}` };
});

await objective('hop on up the clouds together to the Cloud Kingdom; its waystone becomes where you wake', async () => {
  if (!(await fetchHerT())) return { pass: false, note: 'could not take her hand' };
  // back to the middle of the resting cloud, then on up
  await goTo(TW.steps[TW.rest].p[0], TW.steps[TW.rest].p[2], { tol: 0.4, timeout: 8 });
  const log = [];
  const ok = await climbSteps(TW.rest + 1, TW.steps.length - 1, log);
  // and the last hop, up onto the island
  const L = TW.steps[TW.steps.length - 1].p, dx = TW.arrive[0] - L[0], dz = TW.arrive[2] - L[2], d = Math.hypot(dx, dz);
  const land = [L[0] + dx / d * 3.6, TW.yt, L[2] + dz / d * 3.6];
  const hop = ok ? await cloudHop(land, 2.7) : null;
  await wait(1200);
  const q = await tq(), rows = await objIds(), msg = await toast(); await shot('cloud-kingdom');
  const r = await goTo(TW.way[0], TW.way[2], { tol: 0.6, timeout: 15 });
  await wait(800);
  const p = await pos();
  return { pass: ok && hop && Math.abs(hop.q.me[1] - TW.yt) < 0.2 && q.arrived && rows.includes('beacon') && !rows.includes('steps') && /Cloud Kingdom/.test(msg) && r.ok && p.cp === TW.cpWay,
    note: `hops ${log.join(' ')} island: ${hop ? `${hop.r.reason} y=${hop.q.me[1]}` : '-'} arrived=${q.arrived} "${msg}" objectives=${rows} waystone=${r.reason} checkpoint=${p.cp} (way ${TW.cpWay})` };
});

await objective('keepsakes: half a locket on the resting cloud, the other half on the north rim', async () => {
  const k0 = await ks('tower');
  const onCloud = !k0.left.some((l) => l[0] === 'tower0');
  const r1 = await legs([[56, -96], [45, -98.5]], { tol: 0.4, timeout: 20 });
  await wait(800); await shot('locket-half');
  const k = await ks('tower'), rows = await objIds();
  const r2 = await legs([[56, -96], [TW.way[0], TW.way[2]]], { tol: 0.6, timeout: 20 });
  return { pass: onCloud && k.n === 2 && !k.placed && r1.ok && r2.ok && rows.includes('keep-tower'), note: `half on the resting cloud picked up on the way=${onCloud} halves=${k.n}/${k.of} rim walk=${JSON.stringify(r1)} back=${r2.ok} objectives=${rows}` };
});

await objective('alone, the ramp\'s first break has no bridge: you drop to the turn below', async () => {
  await unlink();
  let r = await goTo(TW.entry[0], TW.entry[2], { tol: 0.6, timeout: 15 });
  if (r.ok) r = await legs(await rampPts(0.02, TW.gaps[0][0] - 0.02), { tol: 0.5, timeout: 10 });
  await wait(1500);
  const hint = await toast(), p0 = await pos(), q0 = await tq();
  await shot('gap-alone');
  const g1 = await rampAt(TW.gaps[0][0] + 0.08);
  await goTo(g1[0], g1[2], { tol: 0.5, timeout: 6 });
  await wait(1500); await bothDown();
  const p = await pos();
  return { pass: r.ok && /only holds while you hold/.test(hint) && !q0.bridgeOn && p0.me[1] > TW.yt + 6 && p.me[1] < p0.me[1] - 4 && p.grounded,
    note: `up the ramp=${r.reason || 'ok'} "${hint}" bridge on=${q0.bridgeOn} at the gap y=${p0.me[1]} then landed at y=${p.me[1]}` };
});

await objective('hand in hand the bridges of light hold: up the ramp to the top of the tower', async () => {
  // back down to her at the foot of the tower
  let r = await legs(await rampPts(await rampF(), 0.03), { tol: 0.5, timeout: 10 });
  if (!(await fetchHerT())) return { pass: false, note: `could not take her hand (down the ramp: ${r.reason || 'ok'})` };
  await G(() => { const g = window.__game, T = g.world.tower; window.__climb = { maxY: -1e9, drop: 0, gapOn: true, inGap: 0, stop: false };
    const tick = () => { const w = window.__climb, y = g.A.pos.y; w.maxY = Math.max(w.maxY, y); w.drop = Math.max(w.drop, w.maxY - y);
      const f = T.rampF(g.A.pos); if (T.gaps.some(([a, b]) => f > a + 0.01 && f < b - 0.01)) { w.inGap++; if (!g.towerQuest.bridgeOn) w.gapOn = false; }
      if (!w.stop) requestAnimationFrame(tick); }; tick(); });
  r = await goTo(TW.entry[0], TW.entry[2], { tol: 0.6, timeout: 15 });
  const pts = await rampPts(0.02, TW.ftop - 0.03);
  let shotDone = false;
  for (let i = 0; i < pts.length && r.ok; i++) {
    r = await goTo(pts[i][0], pts[i][1], { tol: 0.5, timeout: 10 });
    if (!shotDone && (await rampF()) > TW.gaps[0][0] + 0.1) { await shot('bridge-of-light'); shotDone = true; }
  }
  if (r.ok) r = await legs([await rampAt(TW.ftop - 0.07, -2.1)].map((v) => [v[0], v[2]]), { tol: 0.4, timeout: 10 }); // in over the top, short of the beacon
  await wait(800);
  const w = await G(() => { window.__climb.stop = true; return window.__climb; });
  const p = await pos(); await shot('tower-top');
  return { pass: r.ok && p.linked && Math.abs(p.me[1] - TW.top) < 0.1 && Math.abs(p.friend[1] - TW.top) < 0.3 && w.drop < 1.5 && w.gapOn && w.inGap > 0,
    note: `walk=${JSON.stringify(r)} top: me y=${p.me[1]} her y=${p.friend[1]} (top ${TW.top}) linked=${p.linked} biggest drop on the way ${w.drop.toFixed(2)} m, frames in a gap ${w.inGap}, bridge held=${w.gapOn}` };
});

await objective('the beacon won\'t light alone; holding hands beside it, it lights: sunrise, every island\'s beam, and the closing card', async () => {
  // alone by the beacon (she waits a few steps back)
  await unlink();
  const bc = await rampAt(TW.ftop - 0.07, -3.7);
  await goTo(bc[0], bc[2], { tol: 0.3, timeout: 10 });
  await wait(2500);
  const alone = await tq(), hint = await toast();
  // back for her hand, and to the beacon together
  if (!(await fetchHerT())) return { pass: false, note: 'could not take her hand' };
  await goTo(bc[0], bc[2], { tol: 0.3, timeout: 10 });
  await page.waitForFunction(() => window.__game.towerQuest.lit, null, { timeout: 60000 }).catch(() => {});
  const lit = await tq(), msg = await toast(), rows = await objIds(), locket = (await ks('tower')).placed;
  await G(() => window.__game.setRender(false));
  await page.waitForFunction(() => window.__game.towerQuest.sun >= 1 && window.__game.ending(), null, { timeout: 240000 }).catch(() => {});
  await G(() => window.__game.setRender(true)); await wait(2500);
  const q = await tq(), card = await G(() => ({ on: window.__game.ending(), last: document.querySelector('#ending p.last').textContent, tally: document.getElementById('end-tally').textContent,
    beams: window.__game.world.tower.beams.visible, beamK: window.__game.world.tower.beamK.slice(0, 3).map((v) => +v.toFixed(2)), hudHidden: document.body.classList.contains('ending') }));
  await shot('the-ending');
  await page.click('#end-go'); await wait(2000);
  const closed = !(await G(() => window.__game.ending()));
  await shot('sunrise-after');
  return { pass: alone.k === 0 && !alone.lit && /beacon/.test(hint) && lit.lit && locket && /beacon is lit|sun is rising/.test(msg) && !rows.includes('beacon') && q.sun >= 1 && card.on && /Nobody reaches the top alone/.test(card.last) && /secrets/.test(card.tally) && card.beams && card.beamK[0] > 0.9 && card.hudHidden && closed,
    note: `alone: charge=${alone.k} "${hint}" | together: lit=${lit.lit} locket joined=${locket} "${msg}" objectives=${rows} sun=${q.sun.toFixed(2)} card=${card.on} "${card.tally}" beams=${card.beams} ${card.beamK} hud hidden=${card.hudHidden} closed=${closed}` };
});

await objective('star 8: down the tower together, then hop up the three cloud puffs', async () => {
  const s0 = (await pos()).stars;
  // out of the top and back down the ramp, hand in hand (the bridges hold)
  let r = await legs([await rampAt(TW.ftop - 0.07, -2.6), await rampAt(TW.ftop - 0.05)].map((v) => [v[0], v[2]]), { tol: 0.5, timeout: 10 });
  if (r.ok) r = await legs(await rampPts(TW.ftop - 0.05, 0.03), { tol: 0.5, timeout: 10 });
  const down = await pos();
  // round the paved ring at the tower's foot to the puffs, still hand in hand
  const P = TW.puffs, ux = P[1][0] - P[0][0], uz = P[1][2] - P[0][2], d = Math.hypot(ux, uz);
  const C = TW.center, ang = (v) => Math.atan2(v[2] - C[2], v[0] - C[0]), a0 = ang(down.me);
  let a1 = ang(P[0]); while (a1 < a0) a1 += Math.PI * 2;
  if (a1 - a0 > Math.PI) a1 -= Math.PI * 2; // the short way round
  const ring = []; for (let k = 1; k <= 6; k++) { const a = a0 + (a1 - a0) * k / 6; ring.push([C[0] + Math.cos(a) * 8.6, C[2] + Math.sin(a) * 8.6]); }
  if (r.ok) r = await legs(ring, { tol: 0.8, timeout: 15 });
  if (r.ok) r = await goTo(P[0][0] - ux / d * 1.4, P[0][2] - uz / d * 1.4, { tol: 0.3, timeout: 20 });
  await unlink();
  // up the puffs, one hop at a time
  const tops = [];
  for (const q of P) { const h = await hopTo(q, { tol: 0.3 }); await bothDown(); tops.push((await pos()).me[1]); }
  await wait(1200);
  const p = await pos(); await shot('cloud-puff-star');
  return { pass: r.ok && Math.abs(down.me[1] - TW.yt) < 0.4 && tops.every((y, i) => Math.abs(y - P[i][1]) < 0.15) && p.stars === s0 + 1,
    note: `down=${JSON.stringify(r)} at y=${down.me[1]} linked=${down.linked} puffs stood at ${tops.map((v) => v.toFixed(2))} (tops ${P.map((v) => v[1])}) stars ${s0} -> ${p.stars}` };
});

await objective('secret: the lookout bench on the rim, found when you both stand at it', async () => {
  const s0 = await sec();
  const B = TW.bench, L = TW.lookout, ux = L[0] - B[0], uz = L[2] - B[2], d = Math.hypot(ux, uz), u = [ux / d, uz / d], n = [-u[1], u[0]];
  const way = [[B[0] - u[0] * 1.4 + n[0] * 1.9, B[2] - u[1] * 1.4 + n[1] * 1.9], [B[0] + u[0] * 0.6 + n[0] * 1.9, B[2] + u[1] * 0.6 + n[1] * 1.9], [L[0], L[2]]];
  let r = await legs(way, { tol: 0.4, timeout: 20 });
  await wait(2000);
  const alone = (await sec()).found[8];
  if (!(await fetchHerT())) return { pass: false, note: 'could not take her hand' };
  const r2 = await legs(way, { tol: 0.35, timeout: 20 });
  await wait(2500);
  const s1 = await sec(), card = await page.$eval('#disc-t', (e) => e.textContent), p = await pos();
  await shot('lookout');
  return { pass: r.ok && !alone && r2.ok && s1.found[8] && s1.counter === `${s0.n + 1}/${s1.total}` && /view from the top/i.test(card),
    note: `alone=${r.reason || 'ok'} found=${alone} | together=${r2.reason || 'ok'} linked=${p.linked} found=${s1.found[8]} counter=${s1.counter} "${card}"` };
});

await objective('the map shows the Cloud Kingdom and the cloud steps', async () => {
  const m = await G(() => { const g = window.__game, st = g.worldMap.state(); return { known: st.islands.find((i) => i.id === 'tower')?.known, clouds: st.links.some((l) => l.kind === 'clouds') }; });
  await G(() => window.__game.worldMap.open()); await wait(1500);
  const cap = await page.$eval('#map-cap', (e) => e.textContent);
  await shot('map-cloud-kingdom');
  await G(() => window.__game.worldMap.close()); await wait(600);
  return { pass: m.known && m.clouds && /every island is lit/i.test(cap), note: `known=${m.known} cloud link=${m.clouds} caption "${cap}"` };
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
  return { pass: !s0.found[0] && s1.found[0] && s1.card && s1.counter === `${s0.n + 1}/${s1.total}` && waving, note: `walk=${r.reason} found=${s1.found[0]} card=${s1.card} counter=${s1.counter} waving=${waving}` };
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
  const left = await G(() => window.__game.objectives.list());
  const rows = await page.$$eval('.obj', (els) => els.length);
  const s = await sec();
  await shot('objectives-cleared');
  return { pass: left.length === 0 && rows <= 1 && s.counter === `${s.total}/${s.total}`, note: `left=${JSON.stringify(left)} rows=${rows} secrets=${s.counter}` };
});

writeFileSync(`${out}/results.json`, JSON.stringify({ results, errors }, null, 2));
console.log('page errors:', errors.length ? errors : 'none');
await browser.close();
await server.close();
