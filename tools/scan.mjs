// Dev helper: ASCII map of a zone (free ground / blocked / water / void), for placing things.
// Usage: node tools/scan.mjs cx cz radius [step]
import { createServer } from 'vite';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const [cx, cz, R, step = 1.5] = process.argv.slice(2).map(Number);
const server = await createServer({ server: { port: 5197, host: '127.0.0.1', hmr: false }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 400, height: 300 } });
await page.goto('http://127.0.0.1:5197/?fast=6&dpr=0.4');
await page.waitForFunction(() => window.__game, null, { timeout: 90000 });
const out = await page.evaluate(([cx, cz, R, step]) => {
  const w = window.__game.world; const rows = [];
  for (let z = cz - R; z <= cz + R; z += step) {
    let s = '';
    for (let x = cx - R; x <= cx + R; x += step) {
      const f = w.floorAt(x, z);
      if (f == null) { s += ' '; continue; }
      if (w.deep && w.deep(x, z)) { s += '~'; continue; }
      const blocked = w.colliders.some((c) => c.r != null && Math.hypot(c.x - x, c.z - z) < c.r + 0.5);
      s += blocked ? '#' : (f > 6 ? '^' : '.');
    }
    rows.push(`${String(z.toFixed(1)).padStart(7)} ${s}`);
  }
  return `x from ${cx - R} step ${step}\n` + rows.join('\n');
}, [cx, cz, R, step]);
console.log(out);
await browser.close(); await server.close();
