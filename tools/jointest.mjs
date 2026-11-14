// Join test: the two cases that kept partners apart.
// 1. Different networks: the browsers may only reach each other through a TURN relay. Here they are forced
//    to (relay only, through a local TURN server), and must still connect and play.
// 2. A sleeping host: on a phone, sending the link means leaving the game, and the page sleeps and drops off
//    the broker. The guest who opens the link meanwhile must wait instead of giving up, and the two must find
//    each other once the host is back, under the same room code.
// Also: a guest who reloads finds the host again, and the game's ICE config carries our relay.
// Usage: node tools/jointest.mjs   (run it alone: timing checks flake when another headless browser is busy)
import { createServer } from 'vite';
import { createRequire } from 'node:module';
import { PeerServer } from 'peer';
import { iceConfig } from '../src/net/ice.js';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const Turn = require('node-turn');

let fails = 0;
const check = (name, ok, note = '') => { if (!ok) fails++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  ${note}`); };

const cfg = await iceConfig();
check('ICE config has STUN and a relay with its login', cfg.iceServers.some((s) => [].concat(s.urls).some((u) => u.startsWith('stun:'))) && cfg.iceServers.some((s) => [].concat(s.urls).some((u) => u.startsWith('turn')) && s.username && s.credential), JSON.stringify(cfg.iceServers.map((s) => s.urls)));

const signal = PeerServer({ port: 9001, host: '127.0.0.1', path: '/' });
const turn = new Turn({ listeningPort: 3479, listeningIps: ['127.0.0.1'], relayIps: ['127.0.0.1'], authMech: 'long-term', credentials: { drift: 'light' }, debugLevel: 'OFF' });
turn.start();
const server = await createServer({ server: { port: 5192, host: '127.0.0.1', hmr: false }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const errors = [];
async function open(url, label, setup) {
  const ctx = await browser.newContext({ viewport: { width: 640, height: 360 } });
  const page = await ctx.newPage();
  if (setup) await setup(page);
  page.on('pageerror', (e) => errors.push(`${label}: ${e.message}`));
  await page.goto(url);
  await page.waitForFunction(() => window.__game, null, { timeout: 90000 });
  await page.evaluate(() => {
    window.__game.setRender(false); // run in real time; nothing here needs pictures
    const t = document.getElementById('toast');
    window.__toasts = [];
    new MutationObserver(() => { const s = t.textContent; if (s && window.__toasts.at(-1) !== s) window.__toasts.push(s); }).observe(t, { childList: true, characterData: true, subtree: true });
  });
  return page;
}
const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
const until = async (fn, ms) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await fn()) return true; await sleep(300); } return false; };
const online = (p) => p.evaluate(() => window.__game.net.online);
const dist = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);

const base = 'http://127.0.0.1:5192/?dpr=0.4&peerhost=127.0.0.1&peerport=9001&turn=turn:127.0.0.1:3479&turnuser=drift&turnpass=light';
// the host's line to the broker goes through here, so the test can cut it like a sleeping phone does
let asleep = false;
const lines = [];
const host = await open(base, 'host', (page) => page.routeWebSocket(/:9001\//, (ws) => {
  if (asleep) { ws.close(); return; } // no network while the page sleeps
  lines.push({ ws, server: ws.connectToServer() });
}));
await host.click('#btogether');
await host.waitForFunction(() => !document.getElementById('sheet-link').hidden && document.getElementById('sheet-link').value, null, { timeout: 30000 });
const link = await host.$eval('#sheet-link', (e) => e.value);
const code = new URL(link).searchParams.get('room');
await host.click('#sheet-x');
check('the invite card tells you to come back after sending', /come back to this page/.test(await host.$eval('#sheet-msg', (e) => e.textContent)));

// the host switches to Messages to send the link: the phone drops the broker connection and the page sleeps
asleep = true;
for (const l of lines.splice(0)) { l.server.close(); l.ws.close(); }
const guest = await open(link.replace('?', '?dpr=0.4&'), 'guest');
const waited = await until(() => guest.evaluate(() => window.__toasts.some((s) => /Waiting for him/.test(s))), 30000);
await sleep(12000);
const g1 = await guest.evaluate(() => ({ online: window.__game.net.online, toasts: window.__toasts, knocks: window.__game.net.session.knocks }));
check('opening the link while the host sleeps: she waits instead of giving up', waited && !g1.online && g1.knocks >= 2 && !g1.toasts.some((s) => /ended|Couldn't reach/.test(s)), `knocks ${g1.knocks}, toasts: ${g1.toasts.join(' | ')}`);

// the host comes back to the game
asleep = false;
await host.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
const t0 = Date.now();
const met = await until(async () => (await online(host)) && (await online(guest)), 60000);
const sameCode = await host.evaluate(() => window.__game.net.code);
check('once the host is back, the two find each other on the same link', met && sameCode === code, `${((Date.now() - t0) / 1000).toFixed(1)} s, code ${sameCode} (link ${code})`);

// only a relay could link them here: make sure that's the path the data took
const kind = await guest.evaluate(async () => {
  const pc = window.__game.net.session.conn?.peerConnection;
  if (!pc) return 'no connection';
  const st = await pc.getStats();
  let pair = null;
  st.forEach((x) => { if (x.type === 'transport' && x.selectedCandidatePairId) pair = st.get(x.selectedCandidatePairId); });
  if (!pair) st.forEach((x) => { if (x.type === 'candidate-pair' && x.state === 'succeeded' && x.nominated) pair = x; });
  return pair ? st.get(pair.localCandidateId)?.candidateType : 'no pair';
});
check('the link runs through the TURN relay', kind === 'relay', kind);

await host.evaluate(() => window.__game.goTo(1.2, 4, { tol: 0.6 }));
await sleep(1200);
const me = (await host.evaluate(() => window.__game.pos())).me, seen = (await guest.evaluate(() => window.__game.pos())).friend;
check('through the relay, she sees him walk', dist(me, seen) < 1.0, `host at ${me}, guest sees ${seen}`);

// her phone reloads the page: the host may not have noticed the old link died, the new one still wins
await guest.reload();
await guest.waitForFunction(() => window.__game, null, { timeout: 90000 });
await guest.evaluate(() => window.__game.setRender(false));
const again = await until(async () => (await online(host)) && (await online(guest)), 45000);
check('after she reloads, the two are together again', again);

check('no page errors', errors.length === 0, errors.join(' | '));
await browser.close(); await server.close(); turn.stop(); signal.close?.();
console.log(fails ? `FAILED ${fails}` : 'ALL PASS');
process.exit(fails ? 1 : 0);
