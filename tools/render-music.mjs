// Render a few generated piano pieces to WAV files: node tools/render-music.mjs outDir seed1 seed2 ...
import { createServer } from 'vite';
import { createRequire } from 'node:module';
import { writeFileSync, mkdirSync } from 'node:fs';
const { chromium } = createRequire(import.meta.url)('playwright');
const [out = 'captures/music', ...seeds] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const server = await createServer({ server: { port: 5195, host: '127.0.0.1' }, logLevel: 'error' });
await server.listen();
const b = await chromium.launch();
const page = await b.newPage();
page.on('pageerror', (e) => console.error(e.message));
await page.goto('http://127.0.0.1:5195/tools/render-music.html');
await page.waitForFunction(() => window.__ok);
for (const seed of (seeds.length ? seeds : ['1', '2', '3']).map(Number)) {
  const r = await page.evaluate((s) => window.__render(s), seed);
  const pcm = Buffer.from(r.pcm, 'base64');
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVE', 8); h.write('fmt ', 12);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(2, 22); h.writeUInt32LE(r.sr, 24); h.writeUInt32LE(r.sr * 4, 28); h.writeUInt16LE(4, 32); h.writeUInt16LE(16, 34);
  h.write('data', 36); h.writeUInt32LE(pcm.length, 40);
  writeFileSync(`${out}/piece-${seed}.wav`, Buffer.concat([h, pcm]));
  console.log(`piece ${seed}: ${r.secs.toFixed(0)}s, ${r.notes} notes, peak ${r.peak.toFixed(2)}, rms ${r.rms.toFixed(3)}`);
}
await b.close(); await server.close();
