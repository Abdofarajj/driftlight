// Bot playtest: plays the real game in a headless browser, runs objectives, takes screenshots, writes notes.
// Usage: npm run playtest [-- outName]
import { createServer } from 'vite';
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
const { chromium } = createRequire(import.meta.url)('playwright');

const out = `captures/${process.argv[2] || 'playtest'}`;
mkdirSync(out, { recursive: true });
const server = await createServer({ server: { port: 5198, host: '127.0.0.1' }, logLevel: 'error' });
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
async function objective(name, fn) {
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
  return { pass: before === 'hands,lanterns,wind,stars' && o1 === 'lanterns' && h1 > 20 && o2 === null && h2 < 2, note: `rows=${before} open=${o1} (${h1.toFixed(0)}px) then ${o2} (${h2.toFixed(0)}px)` };
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
  await shot('objectives-cleared');
  return { pass: left.length === 0 && rows === 0, note: `left=${JSON.stringify(left)} rows=${rows}` };
});

writeFileSync(`${out}/results.json`, JSON.stringify({ results, errors }, null, 2));
console.log('page errors:', errors.length ? errors : 'none');
await browser.close();
await server.close();
