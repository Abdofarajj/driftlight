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
    return { l, f, ts: Date.now() };
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
  // (beyond what walking covers between two samples: on a slow machine the samples can be 0.3 s apart)
  let snapL = 0, snapF = 0, gapMs = 0;
  for (let i = 1; i < trace.length; i++) {
    const allow = 4.2 * (trace[i].ts - trace[i - 1].ts) / 1000; gapMs = Math.max(gapMs, trace[i].ts - trace[i - 1].ts);
    snapL = Math.max(snapL, dist(trace[i].l.friend, trace[i - 1].l.friend) - allow);
    snapF = Math.max(snapF, dist(trace[i].f.me, trace[i - 1].f.me) - allow);
  }
  const fMoved = dist(last.f.me, first.f.me), camMoved = dist(last.f.cam, first.f.cam);
  const agreeLeader = dist(last.l.me, last.f.friend), agreeFollower = dist(last.l.friend, last.f.me);
  const gap = dist(last.l.me, last.l.friend);
  const linked = last.l.linked && last.f.linked;
  const pass = linked && walked > 3 && back < 0.4 && snapL < 0.8 && snapF < 0.8 && fMoved > walked * 0.7 && camMoved > walked * 0.6 && agreeLeader < 0.6 && agreeFollower < 0.6 && gap < 1.6;
  return { pass, note: `${fps.toFixed(0)} fps; walked ${walked.toFixed(1)}; leader dragged back ${back.toFixed(2)}; biggest partner jump beyond walking: leader screen ${snapL.toFixed(2)}, follower screen ${snapF.toFixed(2)} (samples up to ${gapMs} ms apart); follower moved ${fMoved.toFixed(1)} cam ${camMoved.toFixed(1)}; screens disagree by ${agreeLeader.toFixed(2)}/${agreeFollower.toFixed(2)}; gap ${gap.toFixed(2)}; linked ${linked}` };
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
  return { pass: ok && mid.inBoat && Math.abs(mid.u - hu) < 0.08 && back && n[0] >= 3 && n[0] === n[1], note: `riding on both=${ok}, guest still in the boat mid-ride=${mid.inBoat}, ride position host/guest=${hu.toFixed(2)}/${mid.u.toFixed(2)}, back at the dock=${back}, secrets host/guest=${n.join('/')}` };
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

// ---- keepsakes (2026-11-14) ----
await objective('keepsakes online: the guest picks up the sun-glass and the host counts it; placed at the stone together, it fills on both screens', async () => {
  await letGo();
  const items = await H(() => window.__game.keepsakes.items.filter((it) => it.set.id === 'desert').map((it) => it.pos.toArray()));
  for (const p of items) { await guest.evaluate(([x, y, z]) => window.__game.teleport(x + 0.6, z, Math.PI, y + 0.5), p); await wait(1200); }
  const counted = await until(() => onBoth(() => window.__game.keepsakes.count('desert') === 3), 10000);
  const st = await H(() => window.__game.keepsakes.set('desert').pos.toArray());
  await H(([x, y, z]) => window.__game.teleport(x + 1.4, z + 1.0, Math.PI, y + 0.5), st);
  await guest.evaluate(([x, y, z]) => window.__game.teleport(x + 2.2, z + 1.2, Math.PI, y + 0.5), st);
  await wait(1500);
  await H(() => window.__game.holdHands());
  await until(() => onBoth(() => window.__game.hands.linked), 6000);
  const placed = await until(() => onBoth(() => window.__game.keepsakes.placed('desert')), 15000);
  await both('12b-keepsakes');
  return { pass: counted && placed, note: `guest's pickups counted on both=${counted}, stone filled on both=${placed}` };
});

// ---- round 8: Whispering Hollow ----
const HWN = await H(() => { const H = window.__game.world.hollow, a = (v) => v.toArray(); return { lampCps: H.lamps.map((L) => a(L.checkpoint.pos)), plates: H.bells.map((B) => a(B.plate)), heart: a(H.heart) }; });
const shadowGap = async () => {
  const a = await H(() => window.__game.hollowQuest.shadows.map((s) => [s.pos.x, s.pos.z]));
  const b = await guest.evaluate(() => window.__game.hollowQuest.shadows.map((s) => [s.pos.x, s.pos.z]));
  return Math.max(...a.map((p, i) => Math.hypot(p[0] - b[i][0], p[1] - b[i][1])));
};

await objective('Whispering Hollow online: the rope bridge rises on both screens, and a lamp you relight together glows on both', async () => {
  await letGo();
  const risen = await until(() => onBoth(() => window.__game.hollowQuest.rise >= 1), 30000);
  const L = HWN.lampCps[0];
  await H(([x, z]) => window.__game.teleport(x, z, Math.PI), [L[0], L[2]]);
  await guest.evaluate(([x, z]) => window.__game.teleport(x, z, Math.PI), [L[0] + 0.9, L[2] + 0.2]);
  await wait(1500);
  await H(() => window.__game.holdHands());
  const linked = await until(() => onBoth(() => window.__game.hands.linked), 8000);
  const lit = await until(() => onBoth(() => window.__game.hollowQuest.lamps[0].lit), 12000);
  const n = [await H(() => window.__game.hollowQuest.count), await guest.evaluate(() => window.__game.hollowQuest.count)];
  const cp = await guest.evaluate(() => window.__game.checkpoint === window.__game.world.checkpoints.indexOf(window.__game.world.hollow.lamps[0].checkpoint));
  await both('13-hollow-lamp');
  return { pass: risen && linked && lit && n[0] === 1 && n[1] === 1 && cp, note: `bridge up on both=${risen}, linked=${linked}, lit on both=${lit}, lamps host/guest=${n.join('/')}, guest wakes by it=${cp}` };
});

await objective('bells online: one of you on each bell stone rings both bells on both screens, and the shy shadows move the same on both', async () => {
  await letGo();
  const P = HWN.plates;
  await H(([x, z]) => window.__game.teleport(x, z, 0), [P[0][0], P[0][2]]);
  await guest.evaluate(([x, z]) => window.__game.teleport(x, z, 0), [P[1][0], P[1][2]]);
  const rung = await until(() => onBoth(() => window.__game.hollowQuest.rung), 12000);
  await wait(4000); // alone in the dark, the shadows drift towards you both
  const gap = await shadowGap();
  // each of you dims your own lantern; the other screen shows it from what you send
  const lv = [await guest.evaluate(() => window.__game.hollowQuest.lv[0]), await H(() => window.__game.hollowQuest.lv[1])];
  await both('14-hollow-bells');
  return { pass: rung && gap < 1.5 && Math.abs(lv[0] - lv[1]) < 0.15, note: `rung on both=${rung}, shadows host vs guest at most ${gap.toFixed(2)} m apart, her lantern ${lv[0].toFixed(2)} on her screen / ${lv[1].toFixed(2)} on his` };
});

await objective('Lonely Shadow online: hold your light up together at the stone ring and the dark lifts on both screens', async () => {
  await H(() => { const q = window.__game.hollowQuest; q.lightLamp(1, true); q.lightLamp(2, true); });
  const come = await until(() => onBoth(() => window.__game.hollowQuest.lonely.state === 1), 8000);
  const c = HWN.heart;
  await H(([x, z]) => window.__game.teleport(x, z, Math.PI), [c[0] - 0.45, c[2] + 0.5]);
  await guest.evaluate(([x, z]) => window.__game.teleport(x, z, Math.PI), [c[0] + 0.45, c[2] + 0.5]);
  await wait(1500);
  await H(() => window.__game.holdHands());
  const linked = await until(() => onBoth(() => window.__game.hands.linked), 8000);
  await wait(5000);
  const k = [await H(() => window.__game.hollowQuest.lonely.k), await guest.evaluate(() => window.__game.hollowQuest.lonely.k)];
  const done = await until(() => onBoth(() => window.__game.hollowQuest.done), 20000);
  const lifted = await until(() => onBoth(() => window.__game.hollowQuest.lift >= 1 && window.__game.hollowQuest.shadows.every((s) => s.k < 0.05)), 12000);
  await both('15-hollow-dusk');
  return { pass: come && linked && Math.abs(k[0] - k[1]) < 0.2 && done && lifted, note: `Lonely Shadow came on both=${come}, linked=${linked}, its progress host/guest=${k.map((v) => v.toFixed(2)).join('/')}, done on both=${done}, dark lifted and shadows gone on both=${lifted}` };
});

// ---- round 9: the Snowy Aurora Peak ----
const KWN = await H(() => { const K = window.__game.world.peak, a = (v) => v.toArray(); return { cps: K.braziers.map((Z) => a(Z.checkpoint.pos)), bell: a(K.bell.pos), door: a(K.cabinDoor), levels: K.levels }; });

await objective('Snowy Peak online: the stone bridge rises on both screens, a brazier you light together burns on both, and each of you feels your own cold', async () => {
  await letGo();
  await H(() => window.__game.keepAll('hollow')); // the keepsakes online are covered in the desert
  const risen = await until(() => onBoth(() => window.__game.peakQuest.rise >= 1), 40000);
  const C = KWN.cps[0];
  await H(([x, z]) => window.__game.teleport(x, z, Math.PI), [C[0], C[2]]);
  await guest.evaluate(([x, z]) => window.__game.teleport(x, z, Math.PI), [C[0] + 0.9, C[2] + 0.2]);
  await wait(1500);
  await H(() => window.__game.holdHands());
  const linked = await until(() => onBoth(() => window.__game.hands.linked), 8000);
  const lit = await until(() => onBoth(() => window.__game.peakQuest.braziers[0].lit), 12000);
  const cp = await guest.evaluate(() => window.__game.checkpoint === window.__game.world.checkpoints.indexOf(window.__game.world.peak.braziers[0].checkpoint));
  await both('16-peak-brazier');
  // let go, and she walks off into the cold: her lantern dims on her screen, and his screen shows the same
  await letGo();
  const d = KWN.door;
  await guest.evaluate(([x, z]) => window.__game.teleport(x, z, Math.PI), [d[0], d[2]]);
  await wait(7000);
  const lv = [await guest.evaluate(() => window.__game.peakQuest.lv[0]), await H(() => window.__game.peakQuest.lv[1]), await H(() => window.__game.peakQuest.lv[0])];
  return { pass: risen && linked && lit && cp && lv[0] < 0.95 && Math.abs(lv[0] - lv[1]) < 0.15 && lv[2] > 0.95,
    note: `bridge up on both=${risen}, linked=${linked}, lit on both=${lit}, guest wakes by it=${cp}, her lantern in the cold ${lv[0].toFixed(2)} on her screen / ${lv[1].toFixed(2)} on his, his by the fire ${lv[2].toFixed(2)}` };
});

await objective('the aurora bell online: holding hands you both jump higher, and the bell rings with the aurora on both screens', async () => {
  await H(() => { const q = window.__game.peakQuest; q.lightBrazier(1, true); q.lightBrazier(2, true); });
  const ready = await until(() => onBoth(() => window.__game.peakQuest.count === 3), 8000);
  const b = KWN.bell;
  await H(([x, z]) => window.__game.teleport(x, z, Math.PI), [b[0] - 0.45, b[2]]);
  await guest.evaluate(([x, z]) => window.__game.teleport(x, z, Math.PI), [b[0] + 0.45, b[2]]);
  await wait(1500);
  await H(() => window.__game.holdHands());
  const linked = await until(() => onBoth(() => window.__game.hands.linked), 8000);
  await guest.evaluate(() => { const g = window.__game; window.__top = g.A.pos.y; const tick = () => { window.__top = Math.max(window.__top, g.A.pos.y); requestAnimationFrame(tick); }; tick(); });
  await H(() => window.__game.jump(0));
  const rung = await until(() => onBoth(() => window.__game.peakQuest.rung), 10000);
  const top = await guest.evaluate(() => window.__top - window.__game.world.peak.levels[3]);
  const aurora = await until(() => onBoth(() => window.__game.peakQuest.aur > 0.5 && window.__game.world.peak.aurora.group.visible), 20000);
  await both('17-peak-aurora');
  return { pass: ready && linked && rung && top > 2.0 && aurora, note: `braziers on both=${ready}, linked=${linked}, rung on both=${rung}, she jumped ${top.toFixed(2)} m on her screen (alone it's 1.47), aurora on both=${aurora}` };
});

// ---- round 10: the Cloud Kingdom ----
await objective('Cloud Kingdom online: the cloud steps form on both screens, and hand in hand a bridge of light holds you both', async () => {
  await letGo();
  await H(() => window.__game.keepAll('peak'));
  const formed = await until(() => onBoth(() => window.__game.towerQuest.formed), 45000);
  const g0 = await H(() => window.__game.world.tower.gaps[0][0]);
  const at = (f, dr) => H(([f, dr]) => window.__game.world.tower.rampAt(f, dr).toArray(), [f, dr]);
  const a = await at(g0 - 0.03, -0.45), b = await at(g0 - 0.03, 0.45), h = await H(([f]) => { const T = window.__game.world.tower, p = T.rampAt(f), q = T.rampAt(f + 0.02); return Math.atan2(q.x - p.x, q.z - p.z); }, [g0]);
  await H(([x, z, h, y]) => window.__game.teleport(x, z, h, y), [a[0], a[2], h, a[1]]);
  await guest.evaluate(([x, z, h, y]) => window.__game.teleport(x, z, h, y), [b[0], b[2], h, b[1]]);
  await wait(1500);
  const off = await onBoth(() => !window.__game.towerQuest.bridgeOn);
  await H(() => window.__game.holdHands());
  const linked = await until(() => onBoth(() => window.__game.hands.linked), 8000);
  const on = await until(() => onBoth(() => window.__game.towerQuest.bridgeOn), 6000);
  const c = await at(g0 + 0.12, 0);
  await H(([x, z]) => window.__game.goTo(x, z, { tol: 0.6, timeout: 15 }), [c[0], c[2]]);
  await wait(1200);
  const yH = (await H(() => window.__game.pos())).me[1], yG = (await guest.evaluate(() => window.__game.pos())).me[1];
  await both('18-tower-bridge');
  return { pass: formed && off && linked && on && Math.abs(yH - c[1]) < 0.4 && Math.abs(yG - c[1]) < 0.6,
    note: `steps formed on both=${formed}, bridge off apart=${off}, linked=${linked}, bridge on for both=${on}, out on the bridge: his y=${yH.toFixed(2)} hers=${yG.toFixed(2)} (bridge ${c[1].toFixed(2)})` };
});

await objective('the beacon online: lit together, the sun rises and the closing card shows on both screens', async () => {
  const T = await H(() => { const T = window.__game.world.tower; return { top: T.top, ftop: T.ftop }; });
  const at = (f, dr) => H(([f, dr]) => window.__game.world.tower.rampAt(f, dr).toArray(), [f, dr]);
  const a = await at(T.ftop - 0.07, -3.7), b = await at(T.ftop - 0.03, -3.9);
  await letGo();
  for (let i = 0; i < 2; i++) await H((i) => { const K = window.__game.keepsakes; K.take(K.items.findIndex((it) => it.key === `tower${i}`)); }, i); // both halves of the locket
  await H(([x, z, y]) => window.__game.teleport(x, z, Math.PI, y), [a[0], a[2], T.top]);
  await guest.evaluate(([x, z, y]) => window.__game.teleport(x, z, Math.PI, y), [b[0], b[2], T.top]);
  await wait(1500);
  await H(() => window.__game.holdHands());
  const linked = await until(() => onBoth(() => window.__game.hands.linked), 8000);
  const lit = await until(() => onBoth(() => window.__game.towerQuest.lit), 15000);
  const sun = await until(() => onBoth(() => window.__game.towerQuest.sun > 0.5), 20000);
  const card = await until(() => onBoth(() => window.__game.ending()), 15000);
  await both('19-tower-ending');
  return { pass: linked && lit && sun && card, note: `linked=${linked}, beacon lit on both=${lit}, sunrise on both=${sun}, closing card on both=${card}` };
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
