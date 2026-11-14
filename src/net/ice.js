// How the two browsers find a path to each other across the internet.
// STUN tells each browser its public address, which is enough on most home Wi-Fi. When the networks won't
// allow a direct link (phones on mobile data, many routers, two different countries), the game data goes
// through a TURN relay instead. PeerJS used to lend everyone a free relay but shut it down in 2024, so
// without one of our own, two players on different networks often never connect.

export const STUN = { urls: ['stun:stun.l.google.com:19302', 'stun:stun.cloudflare.com:3478'] };

// Our own relay account, tried first when filled in: { urls: ['turn:…:3478', …], username: '…', credential: '…' }.
// A free plan is plenty for the two of us: a game sends some tens of MB an hour when it has to go through a relay.
export const OWN_TURN = null;

// Open Relay (metered.ca): a free public relay that needs no account. It takes passwords that expire, made
// from a secret the service publishes for this kind of use.
const OPEN_RELAY = { host: 'staticauth.openrelay.metered.ca', secret: 'openrelayprojectsecret' };

async function hmacBase64(secret, text) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(text)));
  return btoa(String.fromCharCode(...sig));
}

/** time-limited Open Relay login (the TURN "REST API" scheme: user = expiry:name, password = HMAC of user) */
export async function openRelay(now = Date.now()) {
  const username = `${Math.floor(now / 1000) + 2 * 86400}:driftlight`;
  const credential = await hmacBase64(OPEN_RELAY.secret, username);
  const h = OPEN_RELAY.host;
  return { urls: [`turn:${h}:80`, `turn:${h}:80?transport=tcp`, `turn:${h}:443`, `turns:${h}:443?transport=tcp`], username, credential };
}

/** the relays to try, best first, each with a name for the connection check page */
export async function relays() {
  const list = [];
  if (OWN_TURN) list.push({ name: 'our relay', ...OWN_TURN });
  try { if (globalThis.crypto?.subtle) list.push({ name: 'Open Relay', ...(await openRelay()) }); } catch { /* no relay: direct links only */ }
  return list;
}

/** the RTCPeerConnection config for a new connection */
export async function iceConfig() {
  return { iceServers: [STUN, ...(await relays()).map(({ name, ...server }) => server)] };
}
