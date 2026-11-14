// How the two browsers find a path to each other across the internet.
// STUN tells each browser its public address, which is enough on most home Wi-Fi. When the networks won't
// allow a direct link (phones on mobile data, many routers, two different countries), the game data goes
// through a TURN relay instead. PeerJS used to lend everyone a free relay but shut it down in 2024, and the
// public Open Relay we tried next no longer exists either (its address doesn't resolve), so we use our own.

export const STUN = { urls: ['stun:stun.l.google.com:19302', 'stun:stun.cloudflare.com:3478'] };

// Abdo's free ExpressTURN account (1 TB a month; the free plan serves port 3478 only). A browser game can't
// hide a TURN login, so this one is public: if it's ever abused, refresh the password in the ExpressTURN
// dashboard and paste the new one here. Check it works with netcheck.html.
export const OWN_TURN = {
  urls: ['turn:free.expressturn.com:3478?transport=udp', 'turn:free.expressturn.com:3478?transport=tcp'],
  username: '000000002110106662',
  credential: 'YeYrui45E5V9BsNJQNiTSTUun2Q=',
};

/** the relays to try, best first, each with a name for the connection check page */
export async function relays() {
  return OWN_TURN ? [{ name: 'ExpressTURN', ...OWN_TURN }] : [];
}

/** the RTCPeerConnection config for a new connection */
export async function iceConfig() {
  return { iceServers: [STUN, ...(await relays()).map(({ name, ...server }) => server)] };
}
