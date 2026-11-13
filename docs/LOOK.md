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
