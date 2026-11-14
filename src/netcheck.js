// Connection check page (netcheck.html): runs each step two players need to find each other, from this
// phone's network, and says in plain words which one fails. Shows no addresses.
import { Peer } from 'peerjs';
import { STUN, relays } from './net/ice.js';

const params = new URLSearchParams(location.search);
const rowsEl = document.getElementById('rows');
const verdictEl = document.getElementById('verdict');
const timeout = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const within = (p, ms) => Promise.race([p, timeout(ms).then(() => { throw new Error('no answer'); })]);

function row(title) {
  const li = document.createElement('li');
  li.className = 'wait';
  li.innerHTML = '<span class="i">…</span><span class="t"></span><span class="n"></span>';
  li.querySelector('.t').textContent = title;
  rowsEl.append(li);
  return (state, note = '') => {
    li.className = state;
    li.querySelector('.i').textContent = state === 'ok' ? '✓' : state === 'bad' ? '✗' : '…';
    li.querySelector('.n').textContent = note;
    return state === 'ok';
  };
}

/** the online service that introduces the two players (the PeerJS broker) */
async function broker() {
  const host = params.get('peerhost'); // tests: a local broker
  const peer = host ? new Peer({ host, port: Number(params.get('peerport')) || 9000, path: '/', secure: false }) : new Peer();
  try {
    await within(new Promise((resolve, reject) => { peer.on('open', resolve); peer.on('error', (e) => reject(new Error(e.type))); }), 12000);
  } finally { peer.destroy(); }
}

/** which kinds of address this network hands out with the given servers (host, srflx = STUN worked, relay) */
async function gather(config, ms) {
  const pc = new RTCPeerConnection(config);
  const types = new Set(), errors = new Set();
  pc.onicecandidateerror = (e) => { if (e.errorCode) errors.add(`${e.errorCode}${e.errorText ? ' ' + e.errorText : ''}`); };
  const done = new Promise((resolve) => {
    pc.onicecandidate = (e) => {
      if (!e.candidate) { resolve(); return; }
      const t = e.candidate.type || / typ (\w+)/.exec(e.candidate.candidate)?.[1];
      if (t) types.add(t);
    };
    pc.onicegatheringstatechange = () => { if (pc.iceGatheringState === 'complete') resolve(); };
  });
  pc.createDataChannel('check');
  await pc.setLocalDescription(await pc.createOffer());
  await Promise.race([done, timeout(ms)]);
  pc.close();
  return { types, errors: [...errors] };
}

/** a test call to yourself, both ends forced through the relay: does a message actually come through? */
async function relayCall(iceServers) {
  const config = { iceServers, iceTransportPolicy: 'relay' };
  const a = new RTCPeerConnection(config), b = new RTCPeerConnection(config);
  a.onicecandidate = (e) => { if (e.candidate) b.addIceCandidate(e.candidate).catch(() => {}); };
  b.onicecandidate = (e) => { if (e.candidate) a.addIceCandidate(e.candidate).catch(() => {}); };
  const ch = a.createDataChannel('check');
  const heard = new Promise((resolve) => { b.ondatachannel = (e) => { e.channel.onmessage = (m) => resolve(m.data); }; });
  ch.onopen = () => ch.send('hello');
  try {
    await a.setLocalDescription(await a.createOffer());
    await b.setRemoteDescription(a.localDescription);
    await b.setLocalDescription(await b.createAnswer());
    await a.setRemoteDescription(b.localDescription);
    return (await within(heard, 15000)) === 'hello';
  } finally { a.close(); b.close(); }
}

const label = (url) => {
  const m = /^(turns?):([^:?]+):(\d+)(?:\?transport=(\w+))?/.exec(url);
  if (!m) return url;
  return `${m[1] === 'turns' ? 'secure ' : ''}${(m[4] || 'udp').toUpperCase()} port ${m[3]}`;
};

async function run() {
  rowsEl.textContent = '';
  verdictEl.textContent = 'Checking… this takes about 20 seconds.';
  const inApp = /FBAN|FBAV|Instagram|Line\/|Snapchat|WhatsApp|Messenger|TikTok/i.test(navigator.userAgent);
  const say = [];

  const rBroker = row('Online service that introduces you');
  const rStun = row('Direct path (works on most Wi-Fi)');
  const list = await relays();
  if (params.get('turn')) list.unshift({ name: 'test relay', urls: [params.get('turn')], username: params.get('turnuser') || '', credential: params.get('turnpass') || '' }); // tests
  const relayRows = [];
  for (const r of list) for (const url of r.urls) relayRows.push({ r, url, set: row(`Relay: ${r.name}, ${label(url)}`) });
  const rCall = list.length ? row('Relay carries a message (test call to yourself)') : null;

  const brokerOk = broker().then(() => rBroker('ok', 'reachable'), (e) => rBroker('bad', `can't reach it (${e.message})`));
  const stunOk = gather({ iceServers: [STUN] }, 7000).then(({ types }) =>
    types.has('srflx') ? rStun('ok', 'this network shows its public address') : rStun('bad', types.size ? 'no public address found (strict network)' : 'no network addresses at all'));
  const relayOks = relayRows.map(({ r, url, set }) =>
    gather({ iceServers: [{ urls: url, username: r.username, credential: r.credential }], iceTransportPolicy: 'relay' }, 10000).then(({ types, errors }) =>
      types.has('relay') ? set('ok', 'answered') : set('bad', errors.length ? `refused: ${errors.join(', ')}` : 'no answer')));
  const callOk = rCall ? relayCall(list.map(({ name, ...server }) => server)).then((ok) => rCall(ok ? 'ok' : 'bad', ok ? 'came through' : 'nothing came through'), (e) => rCall('bad', e.message)) : Promise.resolve(false);

  const [b, s, rs, c] = await Promise.all([brokerOk, stunOk, Promise.all(relayOks), callOk]);
  const anyRelay = rs.some(Boolean);
  if (!b) say.push('This phone can\'t reach the online service that introduces the two of you. Try the other network (Wi-Fi or mobile data).');
  if (!anyRelay) say.push('No relay answers from this network, so the two of you can only connect if a direct path happens to work. That needs a different relay.');
  else if (!c) say.push('A relay answers but a test message didn\'t come through it.');
  if (!s && !anyRelay) say.push('Very little gets out from this network.');
  if (inApp) say.push('You\'re in an app\'s built-in browser: open the link in Safari or Chrome instead.');
  verdictEl.textContent = say.length ? say.join(' ') : 'Everything works from this phone ✦ If you two still can\'t connect, send me screenshots of this page from both phones.';
}

document.getElementById('foot').textContent = `Version ${__BUILD__}`;
document.getElementById('again').addEventListener('click', run);
run();
