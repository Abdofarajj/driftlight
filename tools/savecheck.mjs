// Save check: progress survives a reload. Plays a little, saves, reloads, and checks everything came back
// quietly (no fanfare, no closing card) at the right checkpoint; then "start a new journey" clears it.
// Usage: node tools/savecheck.mjs
import { createServer } from 'vite';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const server = await createServer({ server: { port: 5194, host: '127.0.0.1', hmr: false }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 852, height: 393 } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => { errors.push(e.message); console.error('page error:', e.stack || e.message); });
let fails = 0;
const check = (name, ok, note = '') => { if (!ok) fails++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  ${note}`); };
const G = (fn, arg) => page.evaluate(fn, arg);
const open = async (q = '') => {
  await page.goto(`http://127.0.0.1:5194/?fast=6&dpr=0.3&save=1${q}`);
  await page.waitForFunction(() => window.__game && window.__game.frames() > 3, null, { timeout: 180000 });
};
const toasts = () => G(() => document.getElementById('toast').textContent);

await open();
await G(() => { window.__game.stopSaving(); window.__game.clearSave(); });
await open();
check('a fresh start has no save', (await G(() => window.__game.loadSave())) === null);
await page.waitForTimeout(5000);
check('just looking around saves nothing (no Continue yet)', (await G(() => { window.__game.saveNow(); return window.__game.loadSave(); })) === null);

// part way: forest + lake done, the desert open, a star, two secrets, the lake checkpoint
await G(() => {
  const g = window.__game;
  g.lightAll(); g.lakeAll();
  g.stars.take(0, true); g.secrets.take(0, true); g.secrets.take(9, true);
});
await page.waitForFunction(() => window.__game.desertQuest.opened, null, { timeout: 180000 });
const lakeCp = await G(() => window.__game.world.checkpoints.indexOf(window.__game.world.lake.checkpoint));
await G((i) => { const g = window.__game, c = g.world.checkpoints[i]; g.teleport(c.pos.x, c.pos.z); }, lakeCp);
await page.waitForFunction((i) => window.__game.checkpoint === i, lakeCp, { timeout: 60000 }).catch(() => {});
const before = await G(() => { const g = window.__game; return { ok: g.saveNow(), s: g.snapshot(), cp: g.checkpoint }; });
check('saving works', before.ok && !!(await G(() => window.__game.loadSave())), JSON.stringify(before.s));

await open('&notitle');
const after = await G(() => {
  const g = window.__game;
  return { q: g.quest.done, rise: g.quest.rise, lake: g.lakeQuest.awake, desertOpen: g.desertQuest.opened, desertDone: g.desertQuest.done,
    kf: g.keepsakes.placed('forest'), kl: g.keepsakes.placed('lake'), kd: g.keepsakes.placed('desert'), stars: g.stars.count, secrets: g.secrets.count,
    cp: g.checkpoint, me: g.A.pos.toArray(), objs: g.objectives.list().filter((o) => !o.done).map((o) => o.id) };
});
check('after a reload the forest, the lake and their keepsakes are done', after.q && after.rise === 1 && after.lake && after.kf && after.kl, JSON.stringify(after));
check('the desert is open but not done', after.desertOpen && !after.desertDone && !after.kd);
check('the star and the secrets came back', after.stars === 1 && after.secrets === 2, `stars ${after.stars} secrets ${after.secrets}`);
check('you wake at the lake checkpoint', after.cp === before.cp && after.cp === lakeCp, `cp ${after.cp} (saved ${before.cp}) at ${after.me.map((v) => v.toFixed(1))}`);
check('objectives show only what is left', !after.objs.includes('lanterns') && !after.objs.includes('keep-forest') && !after.objs.includes('heart') && !after.objs.includes('shrine'), after.objs.join(','));
const t1 = await toasts();
check('no fanfare on the way back in', !/lit!|wakes|rises|settle/.test(t1), `toast: "${t1}"`);

// the whole journey, then a reload: no closing card again
await G(() => { const g = window.__game; g.desertAll(); g.hollowAll(); g.peakAll(); });
await page.waitForFunction(() => window.__game.towerQuest.opened, null, { timeout: 240000 });
await G(() => window.__game.towerAll());
await page.waitForFunction(() => window.__game.towerQuest.lit, null, { timeout: 60000 });
await G(() => window.__game.saveNow());
await open('&notitle');
await page.waitForTimeout(4000);
const end = await G(() => { const g = window.__game; return { lit: g.towerQuest.lit, ending: g.ending(), all: ['forest', 'lake', 'desert', 'hollow', 'peak', 'tower'].every((id) => g.keepsakes.placed(id)), hollow: g.hollowQuest.done, peak: g.peakQuest.rung }; });
check('a finished journey comes back finished, without the closing card', end.lit && !end.ending && end.all && end.hollow && end.peak, JSON.stringify(end));

// the title card offers Continue, and two taps on "start a new journey" clear it
await page.goto('http://127.0.0.1:5194/?dpr=0.3');
await page.waitForFunction(() => window.__game && window.__game.frames() > 2, null, { timeout: 180000 });
const label = await G(() => document.getElementById('title-play').textContent);
check('the title card says Continue', label === 'Continue', label);
await page.click('#title-new');
check('one tap only asks', !!(await G(() => window.__game.loadSave())));
await Promise.all([page.waitForNavigation({ timeout: 180000 }), page.click('#title-new')]);
await page.waitForFunction(() => window.__game && window.__game.frames() > 2, null, { timeout: 180000 });
const fresh = await G(() => ({ save: window.__game.loadSave(), done: window.__game.quest.done, label: document.getElementById('title-play').textContent }));
check('two taps start a new journey', !fresh.save && !fresh.done && fresh.label === 'Play', JSON.stringify(fresh));

check('no page errors', errors.length === 0, errors.join(' | '));
await browser.close(); await server.close();
console.log(fails ? `FAILED ${fails}` : 'ALL PASS');
process.exit(fails ? 1 : 0);
