// Quick check of the island keepsakes: where they sit, pick each up, fill each stone, the bridge rises.
import { createServer } from 'vite';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
import { mkdirSync } from 'node:fs';
mkdirSync('captures/keepcheck', { recursive: true });
const server = await createServer({ server: { port: 5196, host: '127.0.0.1', hmr: false }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 852, height: 393 } });
const errors = [];
page.on('pageerror', (e) => { errors.push(e.message); console.log('PAGEERR', e.stack); });
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto('http://127.0.0.1:5196/?fast=6&dpr=0.5');
await page.waitForFunction(() => window.__game, null, { timeout: 90000 }).catch(() => { console.log('ERR', errors); process.exit(1); });
await page.waitForTimeout(1500);
const G = (fn, arg) => page.evaluate(fn, arg);
console.log(await G(() => window.__game.keepsakes.items.map((it) => `${it.key} ${it.pos.toArray().map((v) => v.toFixed(1))}`).join('\n')));
console.log(await G(() => window.__game.keepsakes.sets.map((s) => `stone ${s.id} ${s.pos.toArray().map((v) => v.toFixed(1))}`).join('\n')));
const ok = [];
for (const id of ['forest', 'lake', 'desert', 'hollow', 'peak', 'tower']) {
  if (id === 'lake') await G(() => { window.__game.lightAll(); });
  if (id === 'desert') await G(() => { window.__game.lakeAll(); });
  if (id === 'hollow') await G(() => { window.__game.desertAll(); });
  if (id === 'peak') await G(() => { window.__game.hollowAll(); });
  if (id === 'tower') { await G(() => { window.__game.peakAll(); }); await page.waitForFunction(() => window.__game.towerQuest.formed, null, { timeout: 120000 }).catch(() => {}); }
  const n = await G((id) => window.__game.keepsakes.items.filter((it) => it.set.id === id).length, id);
  for (let i = 0; i < n; i++) {
    const key = `${id}${i}`;
    const p = await G((key) => window.__game.keepsakes.items.find((it) => it.key === key).pos.toArray(), key);
    if (key === 'lake2') { await G((k) => { const g = window.__game; g.keepsakes.take(g.keepsakes.items.findIndex((it) => it.key === k)); }, key); continue; } // on the water: the boat test covers it
    const dx = key === 'desert0' ? -2.2 : key === 'tower0' ? -1.3 : 2.5; // the oasis: come from inside its ring wall; the resting cloud: from its middle
    await G(([x, y, z, dx]) => { const g = window.__game; g.teleport(x + dx, z, -Math.PI / 2, y + 0.5); g.B.pos.set(x + dx, g.world.floorAt(x + dx, z + 0.9, y + 0.5) ?? y, z + 0.9); g.B.vel.set(0, 0, 0); }, [...p, dx]);
    await page.waitForTimeout(500);
    const r = await G(([x, z]) => window.__game.goTo(x, z, { tol: 0.4, timeout: 10 }), [p[0], p[2]]);
    await page.waitForTimeout(400);
    const got = await G((key) => window.__game.keepsakes.items.find((it) => it.key === key).got, key);
    ok.push(`${got ? 'PASS' : 'FAIL'} pick up ${key} ${JSON.stringify(r)}`);
  }
  if (id === 'tower') { ok.push(`${await G(() => window.__game.keepsakes.all('tower') && window.__game.towerQuest.beaconGate()) ? 'PASS' : 'FAIL'} both locket halves let the beacon light`); continue; }
  const s = await G((id) => window.__game.keepsakes.set(id).pos.toArray(), id);
  await G(([x, y, z]) => { const g = window.__game; g.teleport(x + 1.6, z + 1.2, 0, y + 0.5); g.B.pos.set(x + 1.6, g.world.floorAt(x + 1.6, z + 2.2, y + 0.5) ?? y, z + 2.2); g.B.vel.set(0, 0, 0); }, s);
  await page.waitForTimeout(500);
  await G(() => window.__game.holdHands());
  await page.waitForFunction((id) => window.__game.keepsakes.placed(id), id, { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `captures/keepcheck/keep-${id}.png` });
  ok.push(`${await G((id) => window.__game.keepsakes.placed(id), id) ? 'PASS' : 'FAIL'} stone ${id} filled`);
  await G(() => window.__game.holdHands()); await page.waitForTimeout(300);
}
ok.push(`${await G(() => { const g = window.__game; return g.quest.rise >= 1 && g.desertQuest.opened && g.hollowQuest.opened && g.peakQuest.opened && g.towerQuest.opened; }) ? 'PASS' : 'FAIL'} every bridge rose once its quest and stone were done`);
// the new secrets: stand at each together
for (const id of ['heartstone', 'swing', 'boats', 'cairn', 'picnic', 'castles', 'owl', 'letterbox', 'snowmen', 'angels', 'bottle', 'telescope']) {
  const p = await G((id) => window.__game.moreSecrets.spots[id].toArray(), id);
  const at = id === 'boats' ? [p[0], p[1], p[2] - 4.5] : id === 'swing' ? p : ['angels', 'bottle', 'letterbox'].includes(id) ? [p[0] + 0.8, p[1], p[2] + 0.6] : [p[0] + 1.2, p[1], p[2] + 1.2];
  await G(([x, y, z]) => { const g = window.__game; if (g.hands.linked) g.holdHands(); g.teleport(x, z, 0, y + 0.5); g.B.pos.set(x + 0.4, g.world.floorAt(x + 0.4, z, y + 0.5) ?? y, z + 0.3); g.B.vel.set(0, 0, 0); }, at);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `captures/keepcheck/secret-${id}.png` });
  const f = await G((id) => window.__game.secrets.items.find((it) => it.id === id).found, id);
  ok.push(`${f ? 'PASS' : 'FAIL'} secret ${id}`);
}
console.log(ok.join('\n'));
console.log('errors:', errors.slice(0, 5));
await browser.close(); await server.close();
