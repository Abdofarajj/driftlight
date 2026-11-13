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
