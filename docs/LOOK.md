# DriftLight look doc

The target is the reference images in `docs/refs/` (made by Abdo with the shared style prefix). Primary refs:
- `lantern-forest.png`: gameplay camera (high 3/4), the zone layout, palette.
- `lantern-bearers.png`: **the 3D feel target**. Low camera behind the players, big soft cloud sea, rounded
  green hills, floating ruin islands with waterfalls, a distant light beam as a goal. Grass here is greener and
  calmer than in the forest art; we blend the two.
- `phone-portrait.png`: phone framing and UI (joystick bottom-left, hold-hands button bottom-right, stars top-left).
- `traveler-turnaround.png`: the two travelers.
Secondary: `lantern-shrine.png` (quest shrine), `props.png` (stone lantern, mushroom ring, light fox, cave),
`world-vista.png`, `other-zones.png` (later zones).

Abdo also shared a screenshot from an existing game (not stored in the repo) as a guide for *feel only*:
what we take from it is the readable 3D (big simple shapes, smooth gradients instead of texture detail),
the endless soft cloud sea, players framed small against a huge sky, and a bright beam on the horizon as a
destination. We do not take its characters, capes, landmarks or UI.

Abdo is art director: he decides, we show options.

## The feeling in one line
A hand-painted watercolour storybook at golden hour: warm light from behind, lavender in every shadow,
nothing black, nothing harsh, two tiny lights walking through a big soft world.

## What the references actually do (read from the images)
1. **Two-temperature light.** Light side is warm peach/butter, shadow side is cool lavender/mauve. No grey,
   no black. Darkest values in the whole frame are a plum brown (`#5a3d4a`), never below ~20% brightness.
2. **Backlit golden hour.** Sun is low, behind/side of camera view. Silhouettes get a warm rim of light.
3. **Glow sources are the brightest thing.** Lanterns, the bridge rails, the stars and the players' lights
   are near white-yellow and bloom softly. Everything else stays mid-value so glows read.
4. **Big shapes, small details.** Huge rounded tree canopies (clustered blobs), chunky stone blocks,
   a clear dirt path leading the eye to the players. Grass/flowers are texture, not geometry.
5. **Atmosphere.** Distance fades into peach/lavender haze, clouds are under and around the islands,
   floating islands in the distance read as flat lavender silhouettes.
6. **Paper.** Visible paper grain and slightly soft, bleeding edges. Gentle vignette.

## Palette (game uses only these; all in `src/look/palette.js`)
| Role | Lit | Shadow |
|---|---|---|
| Sky top / horizon | `#c7a3cf` lavender | `#ffd6a5` butter peach |
| Clouds | `#fbe3d6` | `#c9a6c4` |
| Canopy (pink) | `#f2a7b8` | `#9a6a96` |
| Trunk / wood | `#b07a62` | `#6e4d5a` |
| Grass | `#c2c875` sunlit sage | `#6a8c6c` cool green |
| Path / dirt | `#f0c393` | `#b58a7a` |
| Stone | `#e2c7b4` | `#8f7a8f` |
| Cliff underside | `#c79a86` | `#7a6283` |
| Lantern glow | `#fff2c4` core | `#ffb35c` halo |
| Red traveler cape | `#e5674a` + trim `#f4c76a` | `#a8443e` |
| Blue traveler cape | `#4f93ad` + trim `#f4c76a` | `#2f5f7e` |
| Tunic / skin | `#f6e6cc` / `#fcd9bd` | `#c9a39a` |
| Hair light / dark | `#f5ead6` / `#6e4636` | `#c9b3a8` / `#4a2f30` |
| Mushroom cap / spots | `#e3604a` / `#fff3dc` | `#a54050` |
| Flowers | `#f6a3bb` `#bba3e6` `#fff4d6` | |

## Style recipe (one recipe for every asset)
Every object goes through the same path, so nothing drifts:

1. **Geometry:** low-poly but rounded. Canopies = 5 to 9 overlapping noise-displaced icospheres.
   Rocks = displaced, flattened boxes. Characters = simple primitives (capsule body, cone cape,
   sphere head 40% of height). Flat-shaded is forbidden; always smooth normals.
2. **Material:** every mesh uses `makeWatercolorMaterial({ lit, shade })` from `src/look/material.js`.
   No `MeshStandardMaterial`, no textures from elsewhere. The shader does:
   - soft 3-band light (wrap lighting, bands blended with 0.15 smoothing, never hard cel lines),
   - shadow colour = the palette's shadow colour (cool), not a darker lit colour,
   - warm rim light from the sun direction (`#ffd08a`, strength 0.35),
   - world-space paper/pigment noise that varies the colour ±6% (the "wash"),
   - distance haze to the sky colour.
3. **Glow:** emissive objects use `makeGlowMaterial(color)`; bloom picks up only values above 0.85.
4. **Post (one pass, `src/look/post.js`):** half-res bloom, warm grade toward peach, lift blacks to plum,
   paper grain, edge vignette. Post is always on in captures.
5. **Outlines:** thin, coloured (shadow colour, never black), inverted hull, only on characters and props
   near the camera. Off on terrain.
6. **Image-generation prompts** (for new reference art) always end with the shared style suffix:
   "Hand-painted watercolour storybook illustration, soft pastel palette (peach, lavender, mint, butter
   yellow, sky blue), golden hour light, gentle bloom and floating sparkles, soft paper texture, visible
   brush edges, simple readable shapes, cozy and peaceful mood, no harsh outlines, no text."

## Proportions
- Traveler: 1.0 unit tall. Head ~0.42 of height (chibi). Cape covers shoulders to knees, flares wide.
  Lantern in one hand at hip height, glows. Red traveler: light fluffy hair. Blue traveler: dark brown curly hair.
- World scale: path ~2.5 travelers wide, stone blocks ~0.8 traveler, tree trunks ~1.2 wide,
  canopies 6 to 10 wide, lanterns ~0.25 tall hanging at 2 to 3 units.
- Camera: high 3/4 view behind the players, ~35° down, players at lower third of the screen.

## Readability rules (before looks)
1. Players must be the highest-contrast thing on screen besides glows: warm saturated capes on calm,
   desaturated ground.
2. Ground is calm: no busy textures under the players. Detail lives at the edges of the frame.
3. Interactive things glow; decoration doesn't (or glows much less).
4. Test at phone size first (iPhone 15 Pro portrait, 393×852 CSS px). If it doesn't read there, it doesn't ship.
5. Bigger models before more effects.

## Motion
Cheap procedural motion everywhere: canopies sway, lanterns swing, players breathe/squash on land,
cape flutters with speed, sparkles drift up. No skeletal rigs in the MVP.

## Decision log
- 2026-11-13: Stack = Three.js + Vite, custom shared watercolour shader, no imported models for MVP.
- 2026-11-13: Palette and recipe above taken from Abdo's references.
- 2026-11-13: Added `lantern-bearers.png` as the 3D feel target; grass nudged greener to match it. Cloud sea and a distant light beam become part of every vista.
- 2026-11-13: Music direction (Abdo): dreamy, sparse solo piano in the spirit of calm sandbox-game piano scores. Always composed by our own generator (src/music.js), never a recreation of any existing track. Long quiet pauses between pieces. The music button mutes only music; sound effects always stay on.
- 2026-11-13: HUD: objectives live in a glass panel under the star counter. Tap a row to expand its details; finished objectives tick, glow, then fade out and are removed. The lantern count lives in its row (no separate lantern pill).
- 2026-11-13: Personal secrets (round 4). Roro Jr is built from primitives to match Abdo's photo (`docs/refs/roro-jr.jpg`): soft peach-pink fur, pale muzzle and paw pads, dark round nose and eyes, ω stitched smile, burgundy bow with cream dots, edging and knot. Keep those details if he is ever remodelled. He takes less lantern light (`lightRecv` 0.35) so his pink never washes out to cream. Sunflowers are the other inside joke; new colours (water, crystal, fox, fairy, sunflower, Roro) are in `palette.js`.
- 2026-11-13: HUD on phones (Abdo): the joystick stays where it is and the objectives panel never reaches down over it. On short screens (phone in landscape) the panel shows the rows that fit plus a "+N more" chip that pages through the rest, and an opened row is shown on its own. `?fps` shows a frame-rate readout at the bottom middle (phone corners are rounded, so nothing goes right in a corner).
- 2026-11-13: Phone performance (Abdo saw 40-60 fps on iPhone 15 Pro). The look stays exactly the same; only how it is drawn changed. After the world is built, `src/look/merge.js` bakes every still piece that shares a material into one mesh per 20 m area, merges the still pieces inside moving models (hair curls, eyes, stems and leaves), and draws the 40 hanging lanterns as one instanced mesh. Sparkles are one instanced draw worked out on the GPU. Landscape went from 925 draws per frame to 218, portrait from 398 to 139. Each pixel is lit by the 2 travelers' lanterns plus the 14 lanterns nearest the view (was 24 in all), and the farthest few fade in and out so nothing pops. If the frame rate stays under 50 for 2 seconds the game renders fewer pixels (2x down to 1.25x in steps of 0.25) and steps back up after a smooth stretch. Rule for new things: anything that moves, scales or switches on and off must be marked `userData.dynamic = true`, or it gets baked and freezes. `?nomerge` turns the baking off to compare.
- 2026-11-13: Crystal Lake (round 6). New palette entries: `crystalStone` (pale lilac stone for the crystal bridge and crystal bases), `lotus` (carved lotus petals) and `lily` (lily pads). Crystals and the heart use the existing `crystalCore`/`crystalHalo` glow; asleep they glow softly (0.7), awake about 0.95-1.1 (big glowing surfaces bloom to plain white above that). Lake water is the round-pool water material: pale lavender, foam at the shore, sand visible under the shallows. Cloud tops now stay out of every island and bridge corridor (`CLEAR` / `CORRIDORS` in `sky.js`); add each new island there.
- 2026-11-13: Sunset Desert (round 7). New palette entries: `sand` (warm peach dunes, lavender-mauve in shade), `paving`, `sandstone` (ruins, walls, the bridge, the cliffs), `cactus`, `palm`, `dust` (gust puffs) and the little sun's `sunCore`/`sunHalo` glow. Ruined walls are rows of long low blocks with shorter, uneven blocks on top (never an even picket of same-size blocks), 1.8-2.9 m high so you can see over them from the camera. Calm patches behind the pass's shelter walls are a soft shade on the sand so you can see where to wait. Two distant islands moved farther away and lower, so they no longer loom over the desert like big upside-down cones. World map (`src/ui/map.js`): painted on warm paper with soft cloud washes, wobbly hand-drawn island outlines in each island's own colours, orange bridge lines, a pink dashed wind line, a dashed outline with a question mark for the next island, a pulsing warm glow on your next goal, and the two of you as dots in your cape colours.
- 2026-11-13: Whispering Hollow (round 8). Darkness is a gameplay rule, so it was built now (not in the look pass): every watercolour surface near the Hollow sinks to a deep blue-violet night (`uDark` in `material.js`: the colour times 0.22/0.21/0.36 plus 0.34 of `PAL.night`), except inside light pools around lanterns and lamps (radius 1.3 + 5.2 x strength), so the two lanterns read as warm circles in the dark. Things above 9-15 m (the storm cloud) and the shy shadows (`darkRecv` 0.3) are kept out of it so they stay dusky indigo, never black. The sky dome and cloud sea turn to night while you're inside (`uNight`), with faint stars. A glow below about 0.45 strength reads as a black smudge, so dim glows (unlit lamp rings, bell rings) are hidden instead of turned down. New palette entries: `moor` (the ground), `mossPath`, `bark`, `roof`, `brass` (bells), `shy` (the shadows), `night`, `nightSky`, `nightHaze`, and glows `wispCore`/`wispHalo` (cold blue) and `flyCore`/`flyHalo` (fireflies).
- 2026-11-13: Snowy Aurora Peak (round 9). Snow is a soft white (`PAL.snow` #f2edf8, not pure white) so the glows still read as the brightest thing, lavender in shade. The terraces are lavender rock (`rockCold`) with snow only on their lips (`aMix`: 0 = rock, 1 = snow), rugged with two noise layers and a few ledges, so the mountain reads as rock and snow rather than a stacked cake. Ice (the frost step, the frozen waterfall, the star pillar) is faceted: six-sided columns with flat normals (`iceColumn()` in `peak.js`), pale blue `ice`. Fires are `emberCore`/`emberHalo`. The aurora is the one non-watercolour material: additive curtains in the sky (`auroraA/B/C`, mint, lilac, pale blue) with soft vertical rays, like the sky dome (no lantern light, no haze). Near the peak the sky turns to a cold dusk (`uNight` 0.22) and to a starry night under the aurora once the bell rings (0.72). Hint rings at the jumps use `glowCore` with a mint halo at strength 1.0 (dimmer ones read as dark rings).
- 2026-11-14: Cloud Kingdom (round 10). New palette entries: `cloudStone` (the tower and island, blush white, lavender in shade) and `cloudPave` (the warm golden path and ramp stripe). Cloud steps and puffs are the shared puffy cloud look (a flat-topped slab with puffs round it), slowly bobbing. The bridges of light are additive like the aurora: a shimmering golden floor and rail while you hold hands; apart they show only a dotted line of soft sparks along the edges (an earlier dashed version read as floating brown blocks from below). The beacon's beam and the islands' beams are camera-facing additive strips. Under the aurora the island is night; when the beacon is lit the sky turns to sunrise over 9 s (`dawn` lifts `uNight`, the aurora fades to 15%), and after ~40 s the islands' beams settle to a soft glow. The closing card is lavender glass (cream text on `rgba(146,104,158)` to `rgba(176,112,142)` at 58%) so the words read over the bright sunrise; the HUD steps back while it shows.
- 2026-11-14: Travelers (Abdo: "their upper torso seems invisible", the held hands looked wrong). The cape now hangs open at the front (`CAPE_GAP` 2.0 rad in `traveler.js`) and covers the back and sides, so from the front you see a rounded chest, a gold belt and cream sleeves with hands; from behind (the usual play view) the cape still reads as the whole silhouette. The cape's collar wraps the back of the neck, with the gold clasp on the chest. Holding hands, each holding arm aims at one shared point between the two of you (`Traveler.holdPoint`: a little in front, low when you stand close, up to shoulder height when further apart) and stretches its sleeve slightly to meet it, so the hands always clasp in the middle. The spark between the hands is smaller (0.42 m).
- 2026-11-14: Shader rule (Abdo saw big black blocks once the beacon's beams were lit, on Windows): never `pow()` a value that can dip below zero, clamp it first. At a quad's edge an interpolated 0..1 value can land a hair outside, `pow` of a negative number is NaN, and the bloom blurs one NaN pixel into large black shapes. The bloom's bright pass now also drops NaN/Inf pixels and clamps to 16.
- 2026-11-14 (look round 1): Soft sun shadows. The still world's depth is rendered once from the sun into a 2048 map over all the islands (`src/look/shadow.js`, about 11.5 cm per texel); each watercolour pixel takes 5 hardware-filtered lookups on a ring that turns with the paper wash, so edges are soft and slightly blotchy. Shaded surfaces drop into their shade bands and lean lavender (x 0.88/0.84/1.02), and lose most of their rim light. Moving or toggling things (`userData.dynamic`), instanced grass and flowers and the travelers don't cast; the travelers keep their blob shadows. Shadows fade with the night (`uShadowK = 1 - uNight`). `?noshadow` turns them off to compare.
- 2026-11-14 (look round 2): Still water is its own look (`makeWaterMaterial` mode 1): `PAL.pool` mint-sky `#9fd6e6` in the shallows to periwinkle `#6f7cc6` in the middle (never dark), the sky's horizon/top colours mirrored by a fresnel term, sun glints only within ~12-40 m of the camera, foam ring at the shore. Lotus lights on the lake use `lotusCore`/`lotusHalo`. Hanging paper lanterns are oval (lathe), 0.6 m tall, `paperCore` `#ffe2a8` / `paperHalo` `#ff9548` at strength 1.35 so they read warm amber, not white.
- 2026-11-14: Cape (Abdo picked it from a contact sheet): the poncho from the character sheet, `buildPoncho` in `traveler.js`. Rounded shoulders, tied at the neck with a gold clasp, a V at the front that widens to the hem (so the tunic, belt and hands show), gold trim along the front edges and hem, a gold diamond outline on the back with a row of small diamonds above the hem, a soft hood bunched at the back of the neck. It ends at the hands (hem y 0.40), so the lantern always shows. This replaces the open-front cape from earlier the same day.
- 2026-11-14 (look round 3): Trees and island edges. Canopy blobs get "billow" bumps (`leafy()` in `forest.js`: rounded swells with creases between) so outlines are scalloped like leaf clumps; canopy shade is `#c98aa8`. Trunks are thicker (base 1.1 x scale) with five twisting bark ridges, in a lighter warm `trunk` (`#d2a185`, shade `#94708a`). Every grassy island now has an edge (`buildEdge()` next to `buildCliff()`): a turf lip that starts under the ground, rolls over the rim and hangs down in round-bottomed tongues about 2 m wide (each its own length), and vines with small plump leaves (`PAL.vine`) trailing from the longer tongues down the wall. The Hollow's lip and trailing moss are `moor`/`hollowMoss`; the Peak gets a snow lip and no vines. Cliffs are stacked rock layers (`cliffR()`): each 2.4 m layer bulges out at its top and tucks in toward its base, so every layer ends in a small overhanging ledge with a line of shade, plus blocky sideways facets (the cloud island stays smooth). Cliffs were wound inside-out before this round (we were seeing the inside of the far wall); new hand-built strips must face outward.
- 2026-11-14 (look round 4): Hair, Abdo's pick from a contact sheet: the tousled shag (`shagHair()` in `traveler.js`, `?hair=curls|shag|bob` to compare). A cap plus three rings of soft locks (`lockGeo`: a blunt tapered lock, fuller in the middle, flicking out at the tip), pointed bangs, one curl sticking up; hers falls longer at the back and keeps the flower clip. Landmarks next to `other-zones.png`. Cloud Kingdom: blue-violet `banner`s with a gold diamond (`bannerGeos()` in `shapes.js`, shared) down the ramp's outer wall, four golden pinnacles on the crown, five little turrets (stone drum, gold band, glowing arched window, golden cone roof) round the island, and two pale `ribbon`s circling above the top (they ripple with the material's sway; kept above the climb so they never cross it). Snowy Peak: a jagged snowy massif rises past the south-east rim, straight behind the mountain as you arrive (`mountainGeo()`: ridges, ribs and crags, a leaning summit, snow above a ragged line and on flat slopes; `massif` rock a step darker than `rockCold` so the snow reads through the haze; left out of the shadow map); pines have five drooping tiers with snow on each (`pineTier()`). Desert: a tall arch of wedge stones over the arrival path, three ruined arches on the dunes (one broken), a square watchtower with arched windows and a broken crown, and `bannerRed` banners with a gold diamond on the gate, the arches, the tower and the city wall.
