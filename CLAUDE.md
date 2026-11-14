# DriftLight

Dreamy 2-player online co-op web game. Original world; capture the *feel* of Sky / Zelda / Astro Bot, never copy them.
Art director: Abdo. Targets: iPhone 15 Pro Safari (portrait + landscape) and Windows PC browsers.

## Stack
- Three.js + Vite, plain JS modules. `npm run dev`, `npm run build` (output `dist/`, hosted on GitHub Pages).
- Multiplayer: peer-to-peer WebRTC via PeerJS (free public broker). One player hosts, the other joins by link (`?room=CODE`). Code in `src/net/`.
  PeerJS's free TURN relay closed in 2024, so `src/net/ice.js` brings STUN + Abdo's free ExpressTURN relay (`OWN_TURN`; public Open Relay is gone); without one, players on different networks often can't connect. `npm run jointest` checks relay-only links and a host whose phone slept while sending the link; `netcheck.html` checks each step from a real phone.
- No imported 3D models in the MVP: everything is built from primitives in code through the shared look recipe.

## Look rules (full version: docs/LOOK.md — read it before touching visuals)
- Every mesh uses `makeWatercolorMaterial` / `makeGlowMaterial` from `src/look/`. Never add MeshStandardMaterial or ad-hoc colours; add colours to `src/look/palette.js`.
- Shadows are cool lavender, light is warm peach. Nothing black, nothing grey.
- Glows are the brightest thing on screen; everything else stays mid-value.
- Readability before looks: calm ground under players, big shapes, players highest contrast.
- Small procedural motion (sway, squash, breathe) instead of rigs.
- Phones: still meshes are baked together after the world is built (`src/look/merge.js`). Anything that moves,
  scales or toggles visibility must have `userData.dynamic = true` or it freezes. Check draws with `?fps`.

## Look loop (do this every round)
1. `npm run capture` renders fixed shots at iPhone 15 Pro resolution into `captures/<round>/` plus a side-by-side contact sheet with the references.
2. Compare with `docs/refs/`, list the biggest gaps, fix the top 2, capture again.
3. For choices, render a contact sheet for Abdo. Max 2 rounds per item, then ask him for a reference.

## Rounds
Each round has a "done when" in docs/ROUNDS.md. Keep rounds small.
