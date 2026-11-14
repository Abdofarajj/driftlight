// HUD check: the title card, the in-game HUD and the satchel on an iPhone-sized touch screen, portrait and
// landscape, plus a check that no two HUD controls overlap. Usage: node tools/hudcheck.mjs
import { createServer } from 'vite';
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
const { chromium } = createRequire(import.meta.url)('playwright');
const out = 'captures/hud';
mkdirSync(out, { recursive: true });
const server = await createServer({ server: { port: 5195, host: '127.0.0.1', hmr: false }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const VP = { portrait: { width: 393, height: 852 }, landscape: { width: 852, height: 393 } };
const IDS = ['joy', 'bjump', 'bhands', 'bset', 'btogether', 'bmap', 'bbag', 'objectives', 'pill'];
let bad = 0;
for (const [name, viewport] of Object.entries(VP)) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  page.on('pageerror', (e) => { bad++; console.error(`[${name}] page error:`, e.message); });
  await page.goto(`http://127.0.0.1:5195/?dpr=0.3${process.argv.includes('--room') ? '&room=ABCD' : ''}`);
  await page.waitForFunction(() => window.__game, null, { timeout: 120000 });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${out}/${name}-title.png`, timeout: 180000 });
  await page.tap('#title-play');
  await page.waitForTimeout(1600);
  // pretend a few things were found so the satchel has something in it
  await page.evaluate(() => { const g = window.__game; g.keepsakes.take(0); g.keepsakes.take(2); g.secrets.take(0); g.secrets.take(4); });
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${out}/${name}-hud.png`, timeout: 180000 });
  const boxes = await page.evaluate((ids) => ids.map((id) => {
    const el = document.getElementById(id); if (!el) return null;
    const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || r.width === 0) return null;
    return { id, x: r.left, y: r.top, w: r.width, h: r.height };
  }).filter(Boolean), IDS);
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const a = boxes[i], b = boxes[j];
    const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x), oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
    if (ox > 1 && oy > 1) { bad++; console.log(`OVERLAP ${name}: ${a.id} and ${b.id} (${ox.toFixed(0)}x${oy.toFixed(0)} px)`); }
  }
  for (const b of boxes) if (b.x < 0 || b.y < 0 || b.x + b.w > viewport.width + 0.5 || b.y + b.h > viewport.height + 0.5) { bad++; console.log(`OFFSCREEN ${name}: ${b.id}`, b); }
  // the longest toast: it wraps, stays on screen and keeps clear of the counters and the buttons
  await page.evaluate(() => window.__game.toast('All 3 pieces of sun-glass! Place them together at the stone on the sun terrace, by the old rope bridge ✦'));
  await page.waitForTimeout(700);
  const tb = await page.evaluate(() => { const r = document.getElementById('toast').getBoundingClientRect(), p = document.getElementById('pill').getBoundingClientRect(), b = document.getElementById('bset').getBoundingClientRect();
    return { x: r.left, y: r.top, w: r.width, h: r.height, pillR: p.right, pillB: p.bottom, btnL: b.left }; });
  const clear = tb.x >= 0 && tb.x + tb.w <= viewport.width && (name === 'portrait' ? tb.y >= tb.pillB : tb.x >= tb.pillR) && tb.x + tb.w <= tb.btnL;
  if (!clear) { bad++; console.log(`TOAST ${name}: overlaps or runs off`, tb); }
  await page.screenshot({ path: `${out}/${name}-toast.png`, timeout: 180000 });
  await page.evaluate(() => document.getElementById('toast').classList.remove('on'));
  await page.tap('#bbag');
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${out}/${name}-satchel.png`, timeout: 180000 });
  await page.tap('#satchel-x');
  await page.waitForTimeout(300);
  const closed = await page.evaluate(() => !document.getElementById('satchel').classList.contains('on'));
  if (!closed) { bad++; console.log(`FAIL ${name}: satchel didn't close`); }
  await page.tap('#bmap');
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${out}/${name}-map.png`, timeout: 180000 });
  console.log(`${name}: ${boxes.map((b) => b.id).join(', ')}`);
  await page.close();
}
await browser.close(); await server.close();
console.log(bad ? `PROBLEMS ${bad}` : 'HUD OK');
process.exit(bad ? 1 : 0);
