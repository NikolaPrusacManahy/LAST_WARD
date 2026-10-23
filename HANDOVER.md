# HANDOVER.md: where things stand

## Current version: 0.4.1 "Real Sound" + FOV

- **Field of view setting** (Settings → Field of view, 60–100°, default 72). It's vertical FOV, the same measure the game always used; sprinting still widens it by about 7° on top. Saved with your other settings; old saves get 72.
- **Player walk animation** plays at half speed (`WALK_ANIM_SLOWDOWN` in `engine/playerAnim.ts`). Run and crouch are unchanged.
- **Enemy sound is properly 3D:** each new sound now starts exactly at The Patient's position. Before, it glided in from the map corner, which smeared the footstep attack and made it sound centred. Its steps and breathing also get darker with distance and muffled (plus quieter) when a wall is between you (`audio/spatial.ts`).
- **Enemy footsteps are half as loud** (`ENEMY_STEP_GAIN = 0.5`).
- **Menu sounds:** a typewriter-style tick on hover and a key strike on click for every menu button (main menu, settings, pause, end screens, intro card). They're synthesised; drop `ui_hover.mp3` / `ui_click.mp3` in `ASSETS/audio` to use recordings. Hovers stay silent until the first click or key press (a browser rule).

## 0.4 "Real Sound"

- Your recorded sounds replace the synth versions: player and Patient footsteps (cut into 6 single-step variants each, random pick + slight pitch change per step), Patient breathing loop (3D), its scream (3D, when it spots you, and in your face on the jumpscare), heartbeat (one beat played at fear-driven speed), hospital ambience loop, generator start + hum loop (3D), door, pickup, paper and flashlight click.
- Still synthesised: the chase tension strings, the stinger, distant clanks, the "denied" buzz and a grit layer under the jumpscare scream.
- Any missing sound file falls back to its synth version automatically.
- `game/tools/prepare-audio.py` rebuilds `public/audio/` from `ASSETS/audio/` (slicing, loop crossfades, loudness matching, mono for 3D sounds). 3.2 MB total.

## 0.3.1 "Hands" (fixes)

- Torch model removed. The light comes from just beside the camera again, as you asked.
- The arms shrink away while sprinting, so the pumping hands never swing into view; they come back when you slow down.
- **Camera bob** (`state/cameraBob.ts`): a gentle dip and sway when walking. Sprinting is heavy, Outlast-style: a hard dip on every footstep, side-to-side sway, roll and a nod, plus about 7° wider FOV. Idle has slight breathing. Changes between gaits blend smoothly.

## 0.3 "Hands"

- **First-person body:** the Mixamo player model (sweater + jeans) stands just behind the camera with its head hidden. Look down to see your legs. Idle, walk, run and crouch-walk play by gait, with speed matched to movement.
- Crouch eye height is now 1.25 m (was 1.0), to match the crouch-walk body.
- **F2 debug view:** full light (sun + sky), no fog, no grain or vignette. The Patient gets a colour-coded marker visible through walls (green patrol, yellow investigate, blue search, red chase) and its planned path drawn as a line. A panel shows FPS, your cell, its mode, alert level, distance and whether it can see you. **F3** (while in debug) freezes or unfreezes it. The rules don't change in debug, so it can still catch you.

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
From `game/`: `npm run verify:quick` (typecheck + 112 rule tests) and `npm run verify` (adds the production build).

## How to publish
`npm run build` in `game/`, then deploy `game/dist` to Netlify (`netlify.toml` is ready).

## Verified vs unverified
- ✅ Typecheck, 112 rule tests and the production build pass.
- ✅ A headless browser test (software rendering, in Claude's cloud workspace) ran the full loop: menu → intro → all items → generator → exit, plus a caught → death screen run. Screenshots looked right.
- ⚠️ **Not verified:** real-GPU frame rate, how the audio actually sounds, mouse feel under pointer lock, and Pause → Resume (the headless test ran without pointer lock). Check these first.
- ⚠️ Difficulty is tuned on paper only. Expect to adjust `ENEMY` / `PLAYER` numbers after playing.

## Known limits / ideas for next
- Hiding spots (lockers, under beds) would give the player an answer to a chase besides running.
- Doors that open and close (and make noise).
- Real texture assets to replace the canvas ones. Optional extra sounds: stinger, chase music, distant clanks.
- More levels, and a level-select or chapter flow.
- A small bundle-size warning from Vite (three.js is about 730 kB). Harmless for now.

## Open questions for you
- Keep the name "Last Ward" and the hospital setting?
- Should death restart the level, or add checkpoints after each fuse?
- Is a single scripted jumpscare at death enough, or do you want scripted scares mid-level (lights cutting out, a figure at the end of a hall)?

## Key code map
See `DEVELOPMENT.md`. Start with `game/src/engine/Game.ts` (wiring), `game/src/world/enemyAI.ts` (the monster) and `game/src/world/content/level01.ts` (the map).
