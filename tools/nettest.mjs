// Two-player bot test: opens the game twice (host + guest) with a local PeerJS signalling server,
// connects them through the real invite flow, and checks movement sync, hand-holding, a shared lantern,
// a shared star, and leaving. Runs over a simulated internet connection (default 100 ms each way + up to 60 ms
// jitter) in real time. Usage: node tools/nettest.mjs [outName] [lagMs] [jitterMs]
import { createServer } from 'vite';
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { PeerServer } from 'peer';
const { chromium } = createRequire(import.meta.url)('playwright');

const out = `captures/${process.argv[2] || 'nettest'}`;
mkdirSync(out, { recursive: true });
const signal = PeerServer({ port: 9000, host: '127.0.0.1', path: '/' });
const server = await createServer({ server: { port: 5197, host: '127.0.0.1', hmr: false }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const errors = [];
async function open(url, label) {
  const ctx = await browser.newContext({ viewport: { width: 640, height: 360 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${label}: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`${label}: ${m.text()}`); });
  await page.goto(url);
  await page.waitForFunction(() => window.__game, null, { timeout: 60000 });
  // headless drawing manages ~2 fps here; pause it so the games run in real time like on a phone,
  // and draw only for screenshots
  await page.evaluate(() => window.__game.setRender(false));
  return page;
}
async function picture(page, path) {
  await page.evaluate(() => window.__game.setRender(true));
  const f0 = await page.evaluate(() => window.__game.frames());
  await page.waitForFunction((f) => window.__game.frames() >= f + 2, f0, { timeout: 20000 });
  await page.screenshot({ path });
  await page.evaluate(() => window.__game.setRender(false));
}
const LAG = Number(process.argv[3] ?? 100), JIT = Number(process.argv[4] ?? 60);
const base = `http://127.0.0.1:5197/?dpr=0.4&peerhost=127.0.0.1&peerport=9000&ice=none&lag=${LAG}&jitter=${JIT}`;
const host = await open(base, 'host');
const H = (fn, arg) => host.evaluate(fn, arg);
const wait = (ms) => host.waitForTimeout(ms);
const results = [];
async function objective(name, fn) {
  let r;
  try { r = await fn(); } catch (e) { r = { pass: false, note: 'crashed: ' + e.message.split('\n')[0] }; }
  r.name = name; results.push(r);
  console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${name}  ${r.note || ''}`);
  return r.pass;
}
let guest, Gp;
const both = async (name) => { await picture(host, `${out}/${name}-host.png`); if (guest) await picture(guest, `${out}/${name}-guest.png`); };
const dist = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);
const until = async (fn, ms = 15000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await fn()) return true; await wait(300); } return false; };

await objective('host opens the invite card and gets a link', async () => {
  await host.click('#btogether');
  await host.waitForFunction(() => !document.getElementById('sheet-link').hidden && document.getElementById('sheet-link').value, null, { timeout: 20000 });
  const link = await host.$eval('#sheet-link', (e) => e.value);
  await host.screenshot({ path: `${out}/01-invite-card.png` });
  await host.click('#sheet-x');
  Gp = link;
  return { pass: /room=[a-z0-9]{5}/.test(link) && /as=her/.test(link), note: link };
});

await objective('guest opens the link and both connect', async () => {
  guest = await open(Gp.replace('?', '?dpr=0.4&'), 'guest');
  const ok = await until(async () => (await H(() => window.__game.net.online)) && (await guest.evaluate(() => window.__game.net.online)), 25000);
  const kinds = await guest.evaluate(() => window.__game.playAs);
  await wait(1500);
  await both('02-connected');
  return { pass: ok && kinds === 'her', note: `connected=${ok} guest plays=${kinds}` };
});

await objective('host walks: the guest sees him arrive', async () => {
  await H(() => window.__game.goTo(1.2, 4, { tol: 0.6 }));
  await wait(800);
  const me = (await H(() => window.__game.pos())).me;
  const seen = (await guest.evaluate(() => window.__game.pos())).friend;
  await both('03-host-walked');
  return { pass: dist(me, seen) < 1.0, note: `host at ${me}, guest sees ${seen}` };
});

await objective('guest walks: the host sees her arrive', async () => {
  await guest.evaluate(() => window.__game.goTo(-1.0, 4.2, { tol: 0.6 }));
  await wait(800);
  const me = (await guest.evaluate(() => window.__game.pos())).me;
  const seen = (await H(() => window.__game.pos())).friend;
  return { pass: dist(me, seen) < 1.0, note: `guest at ${me}, host sees ${seen}` };
});

await objective('hold hands: both screens show it', async () => {
  await H(() => window.__game.holdHands());
  const ok = await until(async () => (await H(() => window.__game.hands.linked)) && (await guest.evaluate(() => window.__game.hands.linked)), 8000);
  await both('04-holding-hands');
  return { pass: ok, note: `linked on both=${ok}` };
});

await objective('host leads: the guest is pulled along on her own screen', async () => {
  const g0 = (await guest.evaluate(() => window.__game.pos())).me;
  await H(() => window.__game.goTo(-2.5, 9.0, { tol: 0.6 }));
  await wait(1500);
  const h = await H(() => window.__game.pos()), g = await guest.evaluate(() => window.__game.pos());
  const moved = dist(g.me, g0);
  const gap = dist(g.me, g.friend);
  const agree = dist(h.friend, g.me);
  await both('05-pulled-along');
  return { pass: g.linked && moved > 3 && gap < 1.8 && agree < 1.5, note: `guest moved ${moved.toFixed(1)}, gap on her screen ${gap.toFixed(2)}, host vs guest view of her ${agree.toFixed(2)}` };
});

// Walk with the keyboard while holding hands, then stop. Watch both screens every 100 ms.
async function walkTogether(leaderPage, followerPage, key, ms) {
  const L = (fn) => leaderPage.evaluate(fn), F = (fn) => followerPage.evaluate(fn);
  const snap = async () => {
    const [l, f] = await Promise.all([L(() => ({ ...window.__game.pos(), cam: window.__game.camPos() })), F(() => ({ ...window.__game.pos(), cam: window.__game.camPos() }))]);
    return { l, f };
  };
  const fr0 = await L(() => window.__game.frames());
  const trace = [];
  const t0 = Date.now();
  let releasedAt = -1;
  await leaderPage.keyboard.down(key);
  while (Date.now() - t0 < ms + 3000) {
    if (releasedAt < 0 && Date.now() - t0 >= ms) { await leaderPage.keyboard.up(key); releasedAt = trace.length; }
    trace.push(await snap());
    await leaderPage.waitForTimeout(80);
  }
  if (releasedAt < 0) { await leaderPage.keyboard.up(key); releasedAt = trace.length - 1; }
  const fps = ((await L(() => window.__game.frames())) - fr0) / ((Date.now() - t0) / 1000);
  const first = trace[0], rel = trace[releasedAt], last = trace[trace.length - 1];
  // walking direction of the leader on their own screen
  const dx = rel.l.me[0] - first.l.me[0], dz = rel.l.me[2] - first.l.me[2], walked = Math.hypot(dx, dz) || 1;
  const ux = dx / walked, uz = dz / walked;
  const along = (p) => p[0] * ux + p[2] * uz;
  // after letting go of the key the leader may slide forward a touch, never get dragged back
  let back = 0; const relAlong = along(rel.l.me);
  for (let i = releasedAt; i < trace.length; i++) back = Math.max(back, relAlong - along(trace[i].l.me));
  // the partner on the leader's screen should glide, never jump around
  let snapL = 0, snapF = 0;
  for (let i = 1; i < trace.length; i++) {
    snapL = Math.max(snapL, dist(trace[i].l.friend, trace[i - 1].l.friend));
    snapF = Math.max(snapF, dist(trace[i].f.me, trace[i - 1].f.me));
  }
  const fMoved = dist(last.f.me, first.f.me), camMoved = dist(last.f.cam, first.f.cam);
  const agreeLeader = dist(last.l.me, last.f.friend), agreeFollower = dist(last.l.friend, last.f.me);
  const gap = dist(last.l.me, last.l.friend);
  const linked = last.l.linked && last.f.linked;
  const pass = linked && walked > 3 && back < 0.4 && snapL < 1.2 && snapF < 1.2 && fMoved > walked * 0.7 && camMoved > walked * 0.6 && agreeLeader < 0.6 && agreeFollower < 0.6 && gap < 1.6;
  return { pass, note: `${fps.toFixed(0)} fps; walked ${walked.toFixed(1)}; leader dragged back ${back.toFixed(2)}; biggest partner jump: leader screen ${snapL.toFixed(2)}, follower screen ${snapF.toFixed(2)}; follower moved ${fMoved.toFixed(1)} cam ${camMoved.toFixed(1)}; screens disagree by ${agreeLeader.toFixed(2)}/${agreeFollower.toFixed(2)}; gap ${gap.toFixed(2)}; linked ${linked}` };
}

await objective('holding hands over the internet: he walks, she is pulled along, he stops, nobody snaps back', async () => {
  await H(() => window.__game.teleport(1.2, 6, Math.PI));
  await guest.evaluate(() => window.__game.teleport(0.2, 6, Math.PI));
  await wait(1500);
  if (!(await H(() => window.__game.hands.linked))) { await H(() => window.__game.holdHands()); await wait(1500); }
  const r = await walkTogether(host, guest, 'KeyW', 2200);
  await both('05b-walk-stop');
  return r;
});

await objective('holding hands over the internet: she walks, he is pulled along, she stops, nobody snaps back', async () => {
  await wait(800);
  const r = await walkTogether(guest, host, 'KeyS', 2200);
  await both('05c-walk-stop-her');
  return r;
});

await objective('light a lantern together: both screens count it', async () => {
  await H(() => window.__game.goTo(-3.2, 8.4, { tol: 0.5 }));
  const ok = await until(async () => (await H(() => window.__game.quest.count)) >= 1 && (await guest.evaluate(() => window.__game.quest.count)) >= 1, 15000);
  const hc = await H(() => window.__game.quest.count), gc = await guest.evaluate(() => window.__game.quest.count);
  await both('06-lantern');
  return { pass: ok, note: `host lanterns=${hc}, guest lanterns=${gc}` };
});

await objective('guest finds a star: the host counts it too', async () => {
  await H(() => window.__game.holdHands());
  await until(async () => !(await guest.evaluate(() => window.__game.hands.linked)), 5000);
  await guest.evaluate(() => window.__game.teleport(47, 9, Math.PI / 2));
  await guest.waitForTimeout(500);
  await guest.evaluate(() => window.__game.goTo(53, 10.5, { tol: 0.6 }));
  const ok = await until(async () => (await H(() => window.__game.stars.count)) === 1, 10000);
  const gs = await guest.evaluate(() => window.__game.stars.count);
  return { pass: ok && gs === 1, note: `host stars=${await H(() => window.__game.stars.count)} guest stars=${gs}` };
});

await objective('guest finds Roro Jr behind the waterfall: the host counts the secret and sees the card', async () => {
  const out = await guest.evaluate(() => window.__game.secrets.gToWorld(0, 4.2));
  const inside = await guest.evaluate(() => window.__game.secrets.gToWorld(0, -0.15));
  await guest.evaluate(([x, z]) => window.__game.teleport(x, z, 0), [out.x, out.z]);
  await guest.waitForTimeout(500);
  await guest.evaluate(([x, z]) => window.__game.goTo(x, z, { tol: 0.5, timeout: 12 }), [inside.x, inside.z]);
  const ok = await until(async () => (await H(() => window.__game.secrets.count)) === 1, 15000);
  const card = await host.$eval('#disc-t', (e) => e.textContent);
  const gs = await guest.evaluate(() => window.__game.secrets.count);
  return { pass: ok && gs === 1 && card === 'Roro Jr', note: `host secrets=${await H(() => window.__game.secrets.count)} guest secrets=${gs} host card="${card}"` };
});

await objective('fairy ring online: stand in it together and it dances on both screens', async () => {
  const c = await H(() => window.__game.secrets.ringCenter.toArray());
  await H(([x, z]) => window.__game.teleport(x - 0.5, z, 0), [c[0], c[2]]);
  await guest.evaluate(([x, z]) => window.__game.teleport(x + 0.5, z, 0), [c[0], c[2]]);
  const ok = await until(async () => (await H(() => window.__game.secrets.ring.state)) === 'dance' && (await guest.evaluate(() => window.__game.secrets.ring.state)) === 'dance', 15000);
  const n = [await H(() => window.__game.secrets.count), await guest.evaluate(() => window.__game.secrets.count)];
  await until(async () => (await H(() => window.__game.secrets.ring.t)) > 3.6, 8000);
  await both('08-fairy-ring');
  return { pass: ok && n[0] === 2 && n[1] === 2, note: `danced on both=${ok}, secrets host/guest=${n.join('/')}` };
});

await objective('Crystal Lake online: one of you on each lotus stone wakes the crystal on both screens', async () => {
  const st = await H(() => window.__game.world.lake.pairs[2].stones.map((s) => s.pos.toArray()));
  await H(([x, z]) => window.__game.teleport(x, z, 0), [st[0][0], st[0][2]]);
  await guest.evaluate(([x, z]) => window.__game.teleport(x, z, 0), [st[1][0], st[1][2]]);
  const ok = await until(async () => (await H(() => window.__game.lakeQuest.pairs[2].lit)) && (await guest.evaluate(() => window.__game.lakeQuest.pairs[2].lit)), 15000);
  const n = [await H(() => window.__game.lakeQuest.count), await guest.evaluate(() => window.__game.lakeQuest.count)];
  await until(async () => (await guest.evaluate(() => window.__game.lakeQuest.pairs[2].beamK)) >= 1, 4000);
  await both('09-crystal');
  return { pass: ok && n[0] === 1 && n[1] === 1, note: `lit on both=${ok}, crystals host/guest=${n.join('/')}` };
});

await objective('rowboat online: sit in it together, it drifts on both screens and brings you back', async () => {
  const b = await H(() => { const L = window.__game.world.lake, s = L.boatState, w = L.boatWorld(); return [w.x, w.z, Math.sin(s.yaw), Math.cos(s.yaw)]; });
  await H(([x, z]) => window.__game.teleport(x, z, 0), [b[0] + b[2] * 0.6, b[1] + b[3] * 0.6]);
  await guest.evaluate(([x, z]) => window.__game.teleport(x, z, 0), [b[0] - b[2] * 0.6, b[1] - b[3] * 0.6]);
  const ok = await until(async () => (await H(() => window.__game.lakeQuest.boat.riding)) && (await guest.evaluate(() => window.__game.lakeQuest.boat.riding)), 15000);
  await wait(5000);
  const mid = await guest.evaluate(() => { const g = window.__game, q = g.lakeQuest; return { u: q.boat.u, me: g.A.pos.toArray(), inBoat: g.world.lake.inBoat(g.A.pos, 0.3) }; });
  const hu = await H(() => window.__game.lakeQuest.boat.u);
  await both('10-rowboat');
  const back = await until(async () => !(await H(() => window.__game.lakeQuest.boat.riding)) && !(await guest.evaluate(() => window.__game.lakeQuest.boat.riding)), 60000);
  const n = [await H(() => window.__game.secrets.count), await guest.evaluate(() => window.__game.secrets.count)];
  return { pass: ok && mid.inBoat && Math.abs(mid.u - hu) < 0.08 && back && n[0] === 3 && n[1] === 3, note: `riding on both=${ok}, guest still in the boat mid-ride=${mid.inBoat}, ride position host/guest=${hu.toFixed(2)}/${mid.u.toFixed(2)}, back at the dock=${back}, secrets host/guest=${n.join('/')}` };
});

// ---- round 7: Sunset Desert ----
const DSN = await H(() => { const D = window.__game.world.desert, a = (v) => v.toArray(); return { c: a(D.center), nest: a(D.nestPos), dial: a(D.dialPos) }; });
const dlw = (x, z) => [DSN.c[0] + x, DSN.c[2] + z]; // desert local -> world
const onBoth = async (fn) => (await H(fn)) && (await guest.evaluate(fn));
const letGo = async () => { if (await H(() => window.__game.hands.linked)) { await H(() => window.__game.holdHands()); await until(async () => !(await onBoth(() => window.__game.hands.linked)), 5000); } };
const guestPhase = (ph) => guest.waitForFunction((ph) => window.__game.desertQuest.phase === ph, ph, { timeout: 15000, polling: 100 });

await objective('Sunset Desert online: the bridge rises on both screens and the little sun follows your joined hands', async () => {
  await letGo();
  await H(() => window.__game.lakeAll());
  const risen = await until(() => onBoth(() => window.__game.desertQuest.rise >= 1), 30000);
  const n = DSN.nest;
  await H(([x, z]) => window.__game.teleport(x, z, Math.PI), [n[0] + 1.5, n[2] - 1.0]);
  await guest.evaluate(([x, z]) => window.__game.teleport(x, z, Math.PI), [n[0] + 2.3, n[2] - 0.6]);
  await wait(1500);
  const alone = await guest.evaluate(() => window.__game.desertQuest.sun.state);
  await H(() => window.__game.holdHands());
  const linked = await until(() => onBoth(() => window.__game.hands.linked), 8000);
  const follows = await until(() => onBoth(() => window.__game.desertQuest.sun.state === 1), 8000);
  await H(([x, z]) => window.__game.goTo(x, z, { tol: 0.6 }), dlw(-3, 9));
  await wait(1500);
  const sp = [await H(() => window.__game.desertQuest.sun.pos.toArray()), await guest.evaluate(() => window.__game.desertQuest.sun.pos.toArray())];
  const g = await guest.evaluate(() => window.__game.pos());
  await both('11-desert-sun');
  return { pass: risen && alone === 0 && linked && follows && dist(sp[0], sp[1]) < 1.5 && dist(g.me, sp[1]) < 3.5, note: `bridge up on both=${risen}, sun before hands=${alone}, linked=${linked}, follows on both=${follows}, sun host vs guest ${dist(sp[0], sp[1]).toFixed(2)} m, guest to sun ${dist(g.me, sp[1]).toFixed(1)} m` };
});

await objective('Windy Pass online: both screens blow the same gusts, and a gust pushes the guest back down the pass', async () => {
  await letGo();
  let drift = 0;
  for (let i = 0; i < 6; i++) {
    const a = await H(() => window.__game.desertQuest.g), b = await guest.evaluate(() => window.__game.desertQuest.g);
    drift = Math.max(drift, Math.abs(a - b)); await wait(350);
  }
  await guestPhase('calm');
  await guest.evaluate(([x, z]) => window.__game.teleport(x, z, Math.PI), dlw(1.9, 2.4));
  const z0 = (await guest.evaluate(() => window.__game.pos())).me[2];
  await guestPhase('gust'); await wait(700);
  const mid = await guest.evaluate(() => window.__game.pos().inWind);
  await guestPhase('calm'); await wait(600);
  const z1 = (await guest.evaluate(() => window.__game.pos())).me[2], seen = (await H(() => window.__game.pos())).friend[2];
  return { pass: drift < 0.6 && mid && z1 - z0 > 2.5 && Math.abs(seen - z1) < 1.5, note: `gust clocks apart by at most ${drift.toFixed(2)} s, guest in the wind=${mid}, pushed back ${(z1 - z0).toFixed(1)} m, host sees her ${Math.abs(seen - z1).toFixed(2)} m off` };
});

await objective('sundial online: bring the little sun home together and the sun gate opens on both screens', async () => {
  const d = DSN.dial, st = dlw(-4.5, -13.6);
  // meet just past the pass and bring the little sun along (the host keeps it)
  await H(([x, z]) => { const g = window.__game; g.teleport(x, z, Math.PI); g.desertQuest.sun.pos.set(x, g.A.pos.y + 1.6, z); }, st);
  await guest.evaluate(([x, z]) => window.__game.teleport(x, z, Math.PI), [st[0] + 0.8, st[1] + 0.3]);
  await wait(1500);
  await H(() => window.__game.holdHands());
  const follows = await until(() => onBoth(() => window.__game.hands.linked && window.__game.desertQuest.sun.state === 1), 8000);
  const walk = await H(([x, z]) => window.__game.goTo(x, z, { tol: 0.5 }), [d[0] - 2.1, d[2] + 0.8]);
  const home = await until(() => onBoth(() => { const q = window.__game.desertQuest; return q.done && q.sun.state === 3 && q.gateK >= 1; }), 15000);
  const ph = [await H(() => window.__game.desertQuest.phase), await guest.evaluate(() => window.__game.desertQuest.phase)];
  await both('12-sundial');
  return { pass: follows && walk.ok && home && ph.every((p) => p === 'calm'), note: `follows=${follows} walk=${walk.reason} home, dial lit and gate open on both=${home}, wind host/guest=${ph.join('/')}` };
});

await objective('guest leaves: the host is told and keeps playing', async () => {
  await guest.close({ runBeforeUnload: true }); guest = null; // like closing the tab
  const ok = await until(async () => !(await H(() => window.__game.net.online)), 20000);
  await H(() => window.__game.goTo(1.2, 6, { tol: 0.6 }));
  const toast = await host.$eval('#toast', (e) => e.textContent);
  await picture(host, `${out}/07-after-leave.png`);
  return { pass: ok, note: `host online=${!ok} last toast="${toast}"` };
});

writeFileSync(`${out}/results.json`, JSON.stringify({ results, errors }, null, 2));
console.log('page errors:', errors.length ? errors : 'none');
await browser.close();
await server.close();
signal.close?.();
process.exit(0);
