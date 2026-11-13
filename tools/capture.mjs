// Look loop: render every fixed shot at iPhone 15 Pro resolution and build a contact sheet vs the references.
// Usage: npm run capture [-- roundName] [-- --only forest,portrait]
import { createServer } from 'vite';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { SHOTS } from '../src/shots.js';

// Playwright: use a local install if present, else the machine's global one.
const { chromium } = createRequire(import.meta.url)('playwright');

const args = process.argv.slice(2);
const onlyIdx = args.indexOf('--only');
const only = onlyIdx >= 0 ? args[onlyIdx + 1].split(',') : null;
const round = args.find((a, i) => !a.startsWith('--') && (onlyIdx < 0 || i !== onlyIdx + 1)) || new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
const outDir = `captures/${round}`;
mkdirSync(outDir, { recursive: true });

const VIEWPORTS = { portrait: { width: 393, height: 852 }, landscape: { width: 852, height: 393 } };

const server = await createServer({ server: { port: 5199, host: '127.0.0.1' }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const done = [];
for (const [name, s] of Object.entries(SHOTS)) {
  if (only && !only.includes(name)) continue;
  const page = await browser.newPage({ viewport: VIEWPORTS[s.viewport], deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  page.on('pageerror', (e) => console.error(`[${name}] page error:`, e.message));
  page.on('console', (m) => { if (m.type() === 'error') console.error(`[${name}]`, m.text()); });
  const t0 = Date.now();
  await page.goto(`http://127.0.0.1:5199/?shot=${name}${s.ui ? '&ui=1' : ''}${s.open ? `&open=${s.open}` : ''}`);
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 180000 });
  const file = `${outDir}/${name}.png`;
  await page.screenshot({ path: file, timeout: 120000 });
  console.log(`${name}: ${file} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  done.push([name, file, s.ref]);
  await page.close();
}
await browser.close();
await server.close();

execFileSync('python3', ['tools/contact_sheet.py', outDir, ...done.flatMap(([n, f, r]) => [n, f, `docs/refs/${r}`])], { stdio: 'inherit' });
