# DriftLight world plan

The full plan, with a map, is the Claude doc "DriftLight world plan" (shared with Abdo). This is the short version
the code follows. World units are metres; +x is east, +z is south (the forest's spawn is at z = 11.5, the shrine
is north at z = -49). The sun sits low in the north-west.

| Zone | Centre (x, z) | Radius | Round | Opens with | Quest | Secret |
|---|---|---|---|---|---|---|
| Lantern Forest | 0, 0 | 24 | 1-4 | start | Light the 5 lanterns (hold hands at each) | Roro Jr, light fox, fairy ring, sunflower garden |
| Crystal Lake | -30, -88 | 23 | 6 | reaching the shrine (crystal bridge) | Wake the crystal heart (lotus stone pairs) | Rowboat for two |
| Sunset Desert Ruins | 25, -135 | 26 | 7 | the heart wakes | Guide the lost sun spirit (only follows while you hold hands) | Hidden oasis |
| Whispering Hollow (the dark island) | 85, -150 | 22 | 8 | desert | Relight 3 lamps, ring 2 bells together, comfort the Lonely Shadow | Crooked house with a music box |
| Snowy Aurora Peak | 100, -85 | 22 | 9 | hollow (stone bridge) | Cold dims lanterns unless you hold hands; jump higher together; 3 braziers; aurora bell | Cabin with two mugs of cocoa |
| Cloud Kingdom | 45, -85, high at y ≈ 35 | 18 | 10 (finale) | peak (cloud steps) | Light the beacon together | closing card |

Rules for every new island:
- One co-op quest that needs both players (or a hand-held partner who can be parked, for solo play).
- One star, one secret, one checkpoint just past the arrival bridge.
- Keep cloud tops out of its circle and its bridge corridor (`CLEAR` / `CORRIDORS` in `src/look/sky.js`).
- Bake it with its own `mergeStatic` call if it's far from the forest (see `main.js`), and check draws with `?fps`.
- The host keeps the quest score online and sends it with every update (see `lakequest.js` `state()` / `applyState()`).

## Decided with Abdo (2026-11-13)
- **Whispering Hollow mood:** quiet and spooky with a little tension: creaks, whispers, shy shadows that drift
  closer when you're apart and shrink back when you hold hands. Nothing chases you, no jump scares.
- **Closing card** at the top of the tower (draft, Abdo may change words): "Every bridge here only rose for two. /
  Through the dark, the cold and the long way round, you held on to each other. / Nobody reaches the top alone.
  You got here together." Abdo's brief: the two of you together, getting through hard things to reach the end,
  and it can't be done alone.
- **Sky on the journey** (Abdo left it to Claude): golden afternoon in the forest and lake, sunset in the desert,
  night in the Hollow and under the aurora, sunrise at the tower when the beacon is lit. Built in the look pass,
  which only starts when Abdo says so.
- **Order** (Abdo): the desert next (round 7), then Whispering Hollow (8), the snowy peak (9) and the cloud tower
  finale (10).
