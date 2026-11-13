# Bot playtest notes

`npm run playtest -- <name>` plays the real game headless (`?fast=6` physics), runs scripted objectives and writes
screenshots + `results.json` to `captures/<name>/`. Hooks live on `window.__game` (goTo, jump, holdHands, teleport, pos).

## 2026-11-13, round 1b (12/12 pass after fixes)
Objectives: spawn on ground; walk path to arch checkpoint; camera follows when turning east; fall off north edge
and respawn at last checkpoint; fence blocks; cross bridge to small-island checkpoint; bridge rails block falling off;
glide slows fall; hold hands + pull partner while running; jump together; let go; tree close-up.

Found and fixed:
- Cloud puffs rose to bridge height and swallowed the bridge and small island (camera inside a white wall).
- Partner did not jump with you while holding hands and standing still.
- Autopilot kept walking after respawn (bot-only, but respawn now cancels any auto-move).
- Small-island checkpoint sat inside the tree trunk; tree there had no collider.

Still open (seen in screenshots):
- Tree trunks can block the camera between you and the player (needs camera collision / fade).
- Small island is a flat disc; distant islands are plain.
- Hand-holding spark is subtle.

## 2026-11-13, round 2 (18/18 pass after fixes)
New objectives: light all 5 lanterns holding hands; bridge rises and leads to the shrine star; ride the west wind
to the meadow island; collect its star; ride the wind back; collect the east star.

Found and fixed:
- 5th lantern sat behind the arch pillar at the island edge; moved to an open spot, and the lighting range widened.
- Partner snagging on rocks broke the hand hold; she now slips past snags, only a real fall breaks it.
- Return wind dropped you into the clouds short of the island; stream now holds you on its centre line and lands further in.
- Wind ribbons flared white when they passed the camera; they fade near the camera now and are thinner.
- Camera could end up inside a tree canopy; it now moves in front of trees between you and it.

## 2026-11-13, round 2b (20/20 pass)
New objectives: tap an objectives row to expand it and tap again to close; at the end of the run every finished objective
has been removed from the panel. The hand-hold objective is checked to tick as soon as you link.

Found and fixed:
- On a real browser the first frame's timestamp can land a hair before the start time, so time went negative for one
  frame, the wind petals asked for a point before the start of their path, and the game loop stopped. The bot never saw
  it because it runs fixed time steps; a direct load of the single-file preview did. Frame time is now clamped at 0.

## 2026-11-13, round 3 online (`npm run nettest`, 9/9 pass)
Two browsers with a local PeerJS signalling server (the real game uses the free public one). Objectives: host makes an
invite link; guest opens it and both connect (guest plays her); each sees the other walk; hold hands on both screens;
host leads and the guest is pulled along on her own screen; light a lantern together (both count it); guest finds a
star (host counts it); guest closes the tab (host is told and keeps playing). Solo playtest still 20/20.

Found and fixed:
- Closing the tab left the partner standing there for ~30 s; the page now says goodbye on close, and a partner who goes
  silent for 12 s is shown as gone (and comes back if they resume, e.g. after switching apps on the phone).

## 2026-11-13, round 3 fix: holding hands online (`npm run nettest`, 11/11 at 100 ms and 200 ms lag)
Abdo found it live: holding hands, whoever stopped got dragged back to where the partner last stopped, and the
pulled partner's camera didn't follow. Cause: each screen pulled its own traveler towards a slightly old copy of the
other. Now whoever walks carries the pair (their updates say where they put the partner, the partner's screen plays it
back), and the hands state has a sequence number in every update. The bot test now runs in real time over simulated
lag with drawing paused (headless drawing is ~2 fps here), with walk-and-stop checks in both directions.

## 2026-11-13, round 4 secrets (`npm run playtest` 25/25, `npm run nettest` 13/13)
New bot checks: walk through the waterfall and find Roro Jr (card, counter, wave), the grotto walls hold and you can
walk back out, wake the light fox and it follows you, the fairy ring stays quiet alone and dances (and floats you about
a metre) when you bring your partner in by the hand, the sunflower garden turns to watch you, and every objective
clears at 4/4 secrets. Online: a secret found by the guest is counted by the host with the card, and the fairy ring
dances on both screens when you stand in it together.
Found and fixed on the way:
- The return wind lands on the west knoll, so the first fairy-ring spot blew dancers away as soon as they floated. The
  ring moved to a clearing east of the path, and dancers are exempt from wind anyway.
- Grotto rocks used their seed as a big Y rotation, which swung the long back wall forward over Roro. Small turns only now.
- From the normal camera you couldn't see Roro once inside (you stand in front of him). Finding him now gives a short
  camera moment in front of you, off to one side, while he waves; the waterfall thins while you're inside.
- The gold trim on both capes sat 0.74 m too low (under the ground). It only showed when floating in the fairy ring.
- Test servers now run with HMR off, so editing code mid-test no longer reloads the test pages.

## 2026-11-13, phone performance (`npm run playtest` 25/25, `npm run nettest` 13/13 on the second run)
Draws per frame at Abdo's landscape size (852×283 at 2x): 925 → 218; portrait (393×852 at 2x): 398 → 139.
Before/after captures of forest, portrait, bearers, close, grotto, Roro and garden: no pixel differs by more than
40/255, mean difference about 3/255 (a little less lantern light on far trees).
- Baked meshes first shaded slightly differently: the shaders turn normals by the plain model matrix, so baking now
  does the same (not the "correct" inverse transpose), and the leafy canopy pattern matches again.
- The first nettest run failed one check on jitter alone (partner jump 1.29 m against a 1.2 limit with 100 ms ± 60 ms
  fake lag; 0.96 on the rerun). Networking code did not change.
- Adaptive resolution checked with a fake slow phone (25 ms busy frames): 2x → 1.75 → 1.5 → 1.25 within ~8 s, then back
  up to 2x about every 9 s once frames were quick again.
