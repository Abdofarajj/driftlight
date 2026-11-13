# Rounds toward the MVP

MVP = Lantern Forest, 2 players online, 1 co-op quest, 3 hidden secrets, playable from a link on iPhone 15 Pro and Windows PC.

## Round 1: look foundation (done)
Build: floating Lantern Forest island (path, pink lantern trees, stones, mushrooms, glowing bridge), sky + clouds,
shared watercolour shader + post, one traveler you can walk/jump with touch joystick or WASD, follow camera, capture script.
**Done when:** the capture contact sheet sits next to the references and reads as "the same world" at a glance,
Abdo can open the preview on his iPhone and walk around smoothly.

## Round 2: quest + wind + audio (done 2026-11-13, pulled forward at Abdo's request)
Lantern quest with the shrine bridge, two warm wind currents to a west meadow island, 3 stars, synthesized audio.

## Round 2b: Abdo's notes (done 2026-11-13)
New dreamy piano music, louder footsteps, music-only mute, objectives panel (tap to expand, finished ones fade away).

## Round 3: together online (built 2026-11-13, waiting on Abdo's real-device test)
Second traveler, host/join by link (`?room=CODE&as=her`), positions + animation synced, hold hands (button / key) with shared light.
Lanterns are scored by the host; stars by whoever touches them; hands by small messages. `npm run nettest` plays it with two bots.
**Done when:** Abdo on iPhone and PC sees both travelers move in real time and can hold hands.

## Round 4: secrets (done)
4 hidden secrets, each with a soft discovery moment (glowing card, harp chime, sparkle burst) and a
secrets counter next to the stars (0/4). Found secrets are shared online like stars. Code: `src/world/secrets.js`.
- **Roro Jr** (Abdo's pink teddy, `docs/refs/roro-jr.jpg`) sits in a grotto behind a waterfall at the
  south edge, between crystals and two sunflowers, and waves when you come in.
- **The light fox** sleeps in the roots of the north-east tree; it wakes, yips and trots after you, then goes home.
- **The fairy ring** in a clearing east of the path only dances for two: stand in it together and it lights up and floats you.
- **The sunflower garden** hides on the meadow island; once found, every sunflower turns to watch you.
Inside-joke text lives in `src/world/jokes.js` so more can be added any time.
**Done when:** all 4 are findable solo or together and each has a reaction (bot playtest + nettest check them).

## Round 5: polish on device
Performance pass on iPhone, UI matching the portrait reference, title screen + invite flow.
- **Performance (built 2026-11-13):** Abdo measured 40-60 fps in landscape (2x, 1704×566). Draws per frame
  925 → 218 (landscape) and 398 → 139 (portrait) by baking still pieces together (`src/look/merge.js`),
  lantern lights per pixel 24 → 16, no garbage made per frame by the light picker, and the resolution
  steps down by itself when the frame rate sags. **Done when:** Abdo's `?fps` readout stays near 60.
  The title screen, invite flow and HUD restyle were parked at Abdo's request ("let's focus on gameplay"):
  the HUD work is on branch `parked/hud-restyle`.

## The world plan (rounds 6-10, from 2026-11-13)
Abdo's goal is gameplay: more islands, zones and quests. The plan, with a map, is in `docs/WORLD.md`.
Each zone is its own island linked by a bridge that its quest opens, and each has one co-op quest, a star and a secret.

## Round 6: Crystal Lake (built 2026-11-13)
Code: `src/world/lake.js` (the island) and `src/world/lakequest.js` (the quest, the rowboat, online sync).
- Reaching the shrine raises a **crystal bridge** west to Crystal Lake, a round island with a lake in the middle,
  a sandy beach, crystal shards, pink lantern trees and a checkpoint just past the bridge.
- **Wake the crystal heart:** three crystals sleep on the shore, each with two lotus stones about 6 m apart in front
  of it. Stand on both at once (one of you on each, so you have to let go of each other) and the crystal shoots its
  light to the heart on the islet. With all three the heart wakes and stepping stones rise out of the lake.
  Playing alone: walk your partner by the hand onto one stone, let go, step onto the other.
- **Water:** you can wade at the edge but deep water is a soft wall. A slip or jump into it is a splash and you're
  back on the last dry spot. Holding hands on a narrow path (stepping stones, the dock), your partner walks behind you.
- **Star 4** waits by the heart. **Secret 5, the rowboat for two:** sit in it together at the dock and it drifts
  round the lake and back (about 30 s).
- Online: the host keeps the score (bridge, crystals, boat ride) and sends it with every update, like the lanterns.
**Done when:** the bot can cross, wake all three crystals with its idle partner, cross the stones hand in hand,
take the star and ride the boat (`npm run playtest`), and a crystal woken online shows on both screens (`npm run nettest`).
