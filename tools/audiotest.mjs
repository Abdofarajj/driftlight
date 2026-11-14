// Offline audio check: renders a scripted minute of the game's sound (music, footsteps, a pile-up of chimes)
// and reports clipping (static), NaNs (sound dying) and silent drop-outs. `node tools/audiotest.mjs`
import { createServer } from 'vite';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const server = await createServer({ server: { port: 5199, host: '127.0.0.1', hmr: false }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch();
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('page error', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.log('console', m.text()); });
await page.goto('http://127.0.0.1:5199/tools/audiotest.html');
await page.waitForFunction(() => window.audioReady, null, { timeout: 60000 });
// a busy minute: everything that chimes, some of it on top of each other (lighting a lantern while holding
// hands as a star and a checkpoint go off), the way it happens in play
const E = (t, name, opts) => ({ t, name, opts });
const events = [
  E(5, 'hands'), E(8, 'lantern'), E(11, 'star'), E(14, 'checkpoint'), E(17, 'secret'), E(20, 'fairy'), E(23, 'crystal'),
  E(26, 'heart'), E(30, 'complete'), E(34, 'fireflies'), E(38, 'brazier'), E(42, 'bigbell'), E(44.6, 'aurora'), E(50, 'cocoa'),
  E(53, 'musicbox'), E(58, 'hands'), E(58.1, 'lantern'), E(58.2, 'star'), E(58.3, 'checkpoint'), E(58.4, 'secret'),
  E(62, 'complete'), E(62.2, 'fairy'), E(62.4, 'aurora'), E(63, 'hands'), E(63.5, 'release'), E(64, 'hands'),
  ...Array.from({ length: 12 }, (_, i) => E(66 + i * 0.25, 'charge', { k: i / 12 })),
];
const r = await page.evaluate((a) => window.runAudio(a), { secs: Number(process.argv[process.argv.indexOf('--secs') + 1]) || 75, events: process.argv.includes('--steps-only') ? [] : events });
const loud = r.wins.filter((w) => w[2] > 0 || w[1] > 0.95);
console.log(`rendered ${r.secs}s in ${r.renderMs} ms (${(r.secs * 1000 / r.renderMs).toFixed(1)}x real time), nodes made ${r.nodes}`);
console.log(`peak ${r.peak}, clipped samples ${r.clip}, NaN samples ${r.nan}`);
if (loud.length) console.log('loud/clipping windows (s, peak, clipped):', JSON.stringify(loud.slice(0, 40)));
// silent drop-outs: after the music starts, a stretch of >0.5 s with nothing at all (the wind bed never stops)
const quiet = r.wins.filter((w) => w[0] > 3 && w[1] < 0.002);
console.log('silent windows after 3 s:', quiet.length, JSON.stringify(quiet.slice(0, 20)));
// cost: wall-clock seconds to render one second of sound here (on one thread). The real audio thread has
// to stay well under 1, on a phone too, or it underruns: crackles, then drop-outs
const worst = [...r.cost].sort((a, b) => b[1] - a[1]).slice(0, 8);
console.log('render cost (s per s of audio): median', [...r.cost].map((c) => c[1]).sort((a, b) => a - b)[r.cost.length >> 1], 'worst', JSON.stringify(worst));
if (process.argv.includes('--cost')) console.log(JSON.stringify(r.cost));
if (process.argv.includes('--levels')) console.log(JSON.stringify(r.wins.map((w) => w[1])));
await browser.close(); await server.close();
process.exit(r.nan || r.clip ? 1 : 0);
