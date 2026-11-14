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

## Round 7: Sunset Desert Ruins + world map (built 2026-11-13)
Code: `src/world/desert.js` (the island), `src/world/desertquest.js` (the quest, gusts, online sync), `src/ui/map.js`.
- **World map:** the round map button under the together button (or Tab) opens a painted map of the islands you've
  found, the bridges and the wind current, both of you on it, and your next goal glowing with a "Next: ..." line.
  The next island you haven't reached shows as a dashed outline with a question mark. Tap, Tab or Esc closes it.
- Waking the crystal heart raises a **sandstone bridge** from Crystal Lake's north-east shore to the Sunset Desert:
  a round sand island with a ruined city wall across it, a checkpoint just past the bridge and one past the pass.
- **Guide the lost sun spirit:** a little sun sleeps in a nest by the bridge. It only follows your shared light, so
  it wakes and floats behind your joined hands while you hold hands, and waits where you let go.
- **The Windy Pass:** the only way through the city wall. A sand gust blows down it every 6 s (dust lifts first as
  a warning). Out in the open a gust pushes you back, and if you're holding hands it tears them apart and the sun
  waits. Three shelter walls stick out from alternate sides, with a calm shaded patch behind each that fits two:
  wait there together, then go between gusts.
- **The sundial:** bring the sun to the sundial on the plaza and it flies home, the hour lines light, the gusts stop
  for good and the **sun gate** on the east terrace sinks. **Star 5** waits behind the gate on the terrace.
- **Secret 6, the hidden oasis:** a ring of ruined wall in the south-east with a pool and palms, entered through a
  broken arch on its north side.
- Online: the host keeps the score (bridge, sun, gust clock, sundial) and sends it with every update; each of you is
  pushed by the gusts on your own screen, on the host's gust clock.
**Done when:** the bot brings the sun to the sundial with its idle partner (`npm run playtest`) and the sun follows,
the gusts agree and the gate opens on both screens online (`npm run nettest`).

## Round 8: Whispering Hollow (built 2026-11-13)
Code: `src/world/hollow.js` (the island), `src/world/hollowquest.js` (the quest, the shy shadows, online sync).
- With the little sun home, an **old rope bridge** sways out from the desert's sun terrace (behind the sun gate) to a
  dark island under its own storm cloud: twisted bare trees, cold blue wisps, glowing toadstools, low fog, creaks and
  whispers, and the music drops quieter in there. A waystone checkpoint stands just past the bridge.
- **In the dark your two lanterns are the only light.** Holding hands makes one bigger circle. **Shy shadows** drift
  towards whoever is alone in the dark (slower than walking, nothing jumps out), cling to them and dim their lantern.
  Joined hands make them back away, and they keep out of a lit lamp's circle. If a lantern goes out you wake by the
  last lamp you lit (or the waystone).
- **Relight the 3 lamp posts:** stand by each together, holding hands. Each lit lamp becomes a checkpoint.
- **Ring the 2 bells together:** they hang on opposite sides of the Hollow and one won't ring alone, so one of you
  waits on one bell's stone in the dark while the other runs to the other.
- **The Lonely Shadow:** with the lamps lit and the bells rung it comes to the stone ring in the middle. Stand there
  together holding hands while it circles in; it turns into fireflies, the dark lifts to a soft dusk and the
  fireflies drift off to the way on (the snowy peak, round 9).
- **Star 6** sits on a mossy boulder in the south-east: hop up from the step stone.
- **Secret 7, the crooked house** (south-west): its music box plays a little tune only when you're both inside. The roof lifts
  off while you're in so the camera can see you.
- Online: the host keeps the score (bridge, lamps, bells, the Lonely Shadow) and moves the shy shadows; each of you
  dims and relights your own lantern and sends its level, so the other screen shows it.
**Done when:** both bots get out of the dark solo (`playtest -- name --from-hollow`) and online (`npm run nettest`),
and a lantern going out sends you back to the last lit lamp.

## Round 9: Snowy Aurora Peak (built 2026-11-13)
Code: `src/world/peak.js` (the island), `src/world/peakquest.js` (the quest, the cold, online sync).
- A few seconds after the Lonely Shadow turns into fireflies, a **stone bridge** rises from the Hollow's far side to a
  snowy island with a terraced mountain in the middle: the meadow, two terraces and the summit, with a stone arch and
  the frozen aurora bell on top. Snow falls round you, the wind gets colder the higher you climb, and the sky turns to
  a cold dusk. A waystone checkpoint stands just past the bridge.
- **The cold:** on your own your lantern slowly dims (faster the higher you are). Holding hands keeps you both warm,
  and so does a lit brazier's circle or the cabin. If it goes out you wake by the last brazier you lit.
- **Jump together:** on the peak, holding hands, you both jump higher (2.5 m instead of 1.5 m). The frost steps
  between the terraces, the bell and the star pillar all need it.
- **Light the 3 braziers** (meadow, first terrace, upper terrace): stand by each together, holding hands. Each is a
  checkpoint. A ramp climbs to the first terrace; a block of ice (the frost step) and a frozen waterfall lead up to
  the upper terrace; a second ramp winds round to the summit.
- **Ring the aurora bell:** it stays frozen until all three braziers burn, then its ice melts. It hangs too high for
  one: jump together under it. It rings, the aurora spreads across a starry sky and the cold eases. Next goal:
  "Look up", the cloud tower far to the west (round 10).
- **Star 7** on a frozen pillar on the first terrace (jump up together). **Secret 8, the log cabin** on the meadow:
  two mugs of cocoa (one red, one blue) by the fire, found when you both step inside; their steam makes a heart.
- Online: the host keeps the score (bridge, braziers, bell); each of you loses and regains your own warmth and sends
  your lantern level.
**Done when:** both bots reach the top and ring the bell solo (`playtest -- name --from-peak`) and online
(`npm run nettest`), and the cold putting a lantern out sends you back to the last lit brazier.

## Round 10: the Cloud Kingdom, the finale (built 2026-11-14)
Code: `src/world/tower.js` (the island, the cloud steps, the tower), `src/world/towerquest.js` (the quest, online sync).
- About ten seconds after the aurora bell rings, the aurora lifts a **stair of 11 cloud steps** from the summit, one
  cloud after another, bowing gently north as it rises west to the Cloud Kingdom (island top y = 28). Each cloud is
  a jump up (1.2 m): you can't walk onto one, and a walking jump or a running jump from its middle both land. The 6th
  is a big resting cloud with a waystone. Slip off and fall 6 m and you wake by the last checkpoint. Holding hands you
  jump together (no peak boost on the clouds).
- **The tower:** a round core with a ramp winding 2.5 times round it to the top (y = 43.6), broken in three places.
  Over each gap a **bridge of light** only holds while you hold hands (a dotted line of sparks shows where it'll be).
  Let go on one and you drop to the turn below.
- **Light the beacon:** stand by it at the top together, holding hands, for 3 seconds. Its beam rises, the sun comes
  up over the cloud sea (the aurora fades), every island sends up a beam of light one after another, and the
  **closing card** appears (the HUD steps back; "Keep exploring" closes it).
- **Star 8** over three little cloud puffs, each a hop higher. **Secret 9, the lookout bench** on the rim, looking
  back towards the Lantern Forest: found when you both stand at it ("The view from the top").
- Online: the host keeps the score (the steps, the beacon); the bridges of light follow your joined hands, which both
  screens already share.
**Done when:** the full journey can be played start to finish: the bot climbs the clouds, the tower and lights the
beacon solo (`playtest -- name --from-tower`) and online (`npm run nettest`).

