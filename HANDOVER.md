# HANDOVER.md: where things stand

## Current version: 0.3 "Hands"

- **First-person body:** the Mixamo player model (sweater + jeans) stands just behind the camera with its head hidden. Its right arm holds a torch toward where you look; the beam now starts at the torch. Look down to see your legs. Idle, walk, run and crouch-walk play by gait, with speed matched to movement.
- Crouch eye height is now 1.25 m (was 1.0), to match the crouch-walk body.
- **F2 debug view:** full light (sun + sky), no fog, no grain or vignette. The Patient gets a colour-coded marker visible through walls (green patrol, yellow investigate, blue search, red chase) and its planned path drawn as a line. A panel shows FPS, your cell, its mode, alert level, distance and whether it can see you. **F3** (while in debug) freezes or unfreezes it. The rules don't change in debug, so it can still catch you.
- If `player.glb` fails to load, the old floating flashlight is used.

## 0.2 "It Has a Face"

- The Patient is now the rigged Mixamo Parasite, with 6 animations (idle, walk, run, search, scream, attack). Animation speed follows its real movement, so the feet don't slide.
- When it spots you, it stops and **screams for 1 s** before charging. That's your head start, and its scream animation plays.
- The jumpscare uses its attack animation, and the camera tracks its face.
- The model loads in the background. The old primitive figure stands in until it's ready, or if the file is missing.
- New tool: `game/tools/convert-character.mjs` (FBX → GLB).

## 0.1 "First Night"

A complete, playable vertical slice of one level.

- **Ward 13** (25×19 grid): 4 patient rooms, a generator room, 3 corridors and 6 ceiling lamps.
- **Loop:** find 3 fuses → start the generator → escape through the exit door (bottom-right).
- **The Patient** patrols, investigates footsteps, chases on sight, searches where it lost you, and drifts toward you a third of the time. It gets 7% faster per fuse. Starting the generator is loud enough to bring it from anywhere.
- **Player:** WASD, mouse look, Shift sprint (stamina), C crouch (silent, harder to see), F flashlight (battery drains; flickers below 20%), E interact.
- **Items:** 3 fuses, 3 batteries and 4 lore notes, each on a cabinet against a wall.
- **Presentation:** procedural hospital textures, wall graffiti, flickering lamps that come on after power, a flashlight with a lens cookie and lag, film grain, vignette, and fear-driven chromatic aberration.
- **Sound:** all synthesised. Room drone, distant clanks, the enemy's 3D breathing and footsteps, a heartbeat that speeds up with fear, chase strings, a stinger when it sees you, and a jumpscare scream.
- **Screens:** main menu (stats + best time), settings (sensitivity, volume, invert Y, grain), pause, death ("IT FOUND YOU") and escape.

## How to run
Double-click `START_GAME.bat`. The first run installs packages (needs Node.js; 24 is pinned). It opens http://localhost:5173.

## How to check
From `game/`: `npm run verify:quick` (typecheck + 88 rule tests) and `npm run verify` (adds the production build).

## How to publish
`npm run build` in `game/`, then deploy `game/dist` to Netlify (`netlify.toml` is ready).

## Verified vs unverified
- ✅ Typecheck, 88 rule tests and the production build pass.
- ✅ A headless browser test (software rendering, in Claude's cloud workspace) ran the full loop: menu → intro → all items → generator → exit, plus a caught → death screen run. Screenshots looked right.
- ⚠️ **Not verified:** real-GPU frame rate, how the audio actually sounds, mouse feel under pointer lock, and Pause → Resume (the headless test ran without pointer lock). Check these first.
- ⚠️ Difficulty is tuned on paper only. Expect to adjust `ENEMY` / `PLAYER` numbers after playing.

## Known limits / ideas for next
- Hiding spots (lockers, under beds) would give the player an answer to a chase besides running.
- Doors that open and close (and make noise).
- Real audio and texture assets to replace the synth and canvas versions.
- More levels, and a level-select or chapter flow.
- A small bundle-size warning from Vite (three.js is about 730 kB). Harmless for now.

## Open questions for you
- Keep the name "Last Ward" and the hospital setting?
- Should death restart the level, or add checkpoints after each fuse?
- Is a single scripted jumpscare at death enough, or do you want scripted scares mid-level (lights cutting out, a figure at the end of a hall)?

## Key code map
See `DEVELOPMENT.md`. Start with `game/src/engine/Game.ts` (wiring), `game/src/world/enemyAI.ts` (the monster) and `game/src/world/content/level01.ts` (the map).
