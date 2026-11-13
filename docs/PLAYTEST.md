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
