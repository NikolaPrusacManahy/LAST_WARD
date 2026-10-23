# HANDOVER.md: where things stand

## Current version: 0.6

- **Two lives.** The first time The Patient catches you, you survive injured; the second time it's the old jumpscare and death. F2 shows `lives`.
- **Caught sequence** (`state/caughtSequence.ts` timeline, `engine/caughtScene.ts` camera, `world/throwLanding.ts`), seconds after the catch:
  - 0.0 grab: its `grab` clip; your camera rides up to its raised hands and stares at its face, thrashing. `caught` sound.
  - 2.0 its `throw` clip starts.
  - 3.5 (throw + 1.5 s, we don't wait for the whole throw) you're thrown behind it, opposite the way it faces, up to 3 m (closer or at an angle if walls are in the way, never into a wall). Your scream (`thrown`). From here the camera is your body's eyes while your `thrown` clip flips you through the air.
  - 4.5 (throw + 2.5 s) the floor: `floor_impact` sound, a jolt, a red flash; the injured red stays from now on.
  - 4.9 it vanishes to the farthest corner you can't see.
  - 5.5 a dazed blink while the pose switches from on-your-back to face-down, then your `getUp` clip (5 s, still through your eyes).
  - 10.5 control returns, camera eases back to normal first person (0.45 s). Pausing mid-sequence resumes the sequence.
- **Injured mode:** blood-red edges pulsing slowly, injured idle / walk / run clips for your body, a grunt every 5–7 s (first one 1.5 s after getting up). Speeds are unchanged.
- **New assets:** `patient.glb` + `grab`, `throw` (1.7 MB); `player.glb` + `thrown`, `getUp`, `injuredIdle`, `injuredWalk`, `injuredRun` (3.5 MB); sounds `caught`, `thrown`, `floor_impact`, `grunt` (from `ASSETS/audio/player_caught/` + `player_grunt.mp3`).
- `?debug` exposes `debugCatch()` (get caught right now).

## 0.5.4

- **Look back (Q, rebindable):** hold it while running and the camera swings 180° (0.18 s) to look over your shoulder; you keep running the way you were going and the flashlight turns with your view. Your own body hides while you look back. Letting go, or running out of breath, swings you back. Does nothing while walking or standing. `state/lookBack.ts` (tested).
- **Slow motion:** the start of each look back slows the world to 0.4× for 0.5 s (eases back to full speed); camera and flashlight stay real-time. 3 s cooldown so it can't be spammed: a second look back inside 3 s still turns the camera, just without the slow-mo. Old saves get Q for Look back, or a free key if they already used Q.
- **The Patient's corners:** it starts each run in one of the map's four corners (never the one by your start), and patrols its own corner area (within 6 tiles) instead of drifting toward you. If it hasn't spotted you for 60 s (any sighting resets the clock, chasing never teleports), it vanishes and turns up at another corner, but only when you can't see it, and never closer than 14 m to you. Noise still pulls it anywhere. F2 shows "new corner in Ns". `cornerCells`, `spawnAtCorner`, `ENEMY.teleportAfter` in `world/enemyAI.ts`.
- **Random tables:** every run, the 3 fuses, 3 batteries and 4 notes swap places across the 10 cabinets, and which note text is where changes too (`world/itemShuffle.ts`). Same cabinets, so everything stays reachable.
- Settings rows are a touch shorter so the extra Controls row still fits 1280×720.

## 0.5.3

- **Strafe animations:** walking sideways (A or D on its own) plays your new `player_strafe_left` / `player_strafe_right` clips; forward, back and diagonals keep the walk. Running and crouching keep their own clips. Strafe plays at the same half pace as the walk. Chosen from your velocity in your own frame (`strafeSide`, `localVelocity` in `engine/playerAnim.ts`, tested). `player.glb` reconverted with clips `idle walk run crouch strafeLeft strafeRight` (3.0 MB). Checked from the clip data that strafeLeft steps to the character's left and strafeRight to its right.
- **W+A / W+D:** the body (not the camera) turns up to 45° toward the move, eased, so the legs walk along the diagonal instead of straight ahead (`bodyTurnFor`). Forward diagonals only; S+A / S+D, strafing and standing don't turn it.
- Not used yet: `player_getting_thrown.fbx` is in `ASSETS/models/player` (no request for it).

## 0.5.2

- **Fix: The Patient got stuck on doorway corners mid-chase.** It charged straight at you whenever it could *see* you, but sight is a thin line and its body is wide, so past a corner it wedged and stopped. Now it only charges straight when its whole body fits along the line (`clearLine` in `world/collision.ts`); otherwise it takes the grid path. A test runs 150 random chases; all reach you.
- **Fix: The Patient's shoulders went into walls.** Its collision size is now 0.55 m (`ENEMY.bodyRadius`, was 0.35), and anywhere it walks to (a noise you made against a wall, say) is pulled in until its body fits. Two minutes of simulated hunting with you hugging walls: never inside a wall.
- **Fix: your own body showed inside walls.** Looking down pushes the body back so the chest stays out of view; with your back to a wall that put it in the wall. It now only goes back as far as there's room (`freeBehind`, `limitBodyBack`).
- **Menu ambience:** the ward ambience plays under the credit screen and main menu (fades in over 2.5 s, out over 0.8 s when a run starts, follows the volume setting). Browsers block sound until the first click or key press, so it starts on that first click (the credit screen click counts). `audio/menuAmbience.ts`, `state/menuAudio.ts`.

## 0.5.1

- **Credit screen on boot:** black screen with "[F11] Play in full screen for a better experience", "[headphones] Headphones recommended", then "Developed by NIKO GAME COLLECTION". Holds 3 s, fades out over 1 s and reveals the main menu (already loaded behind it). Clicking anywhere cuts the fade to 0.5 s. Once per page load; `?debug` skips it, `?debug&credits` shows it. Timing in `state/creditIntro.ts` (tested), screen in `screens/CreditIntro.tsx`, styles in `theme-07-credit.css`. The headphones mark is drawn in code (the Kenney pack has none).

## 0.5

- **New controls:** left click collects / interacts, right click toggles the flashlight. WASD, Shift run and Ctrl crouch are unchanged. Arrow keys no longer move you unless you bind them.
- **Key bindings in Settings:** settings now has two columns, general on the left and Controls on the right. Each action shows its key or mouse icon; click it, then press a key or mouse button to rebind (mouse side buttons work too). Binding a key that another action already uses swaps the two, so nothing is left unbound. Esc cancels. "Reset controls" restores the defaults. Esc, F2, F3 and the Windows key can't be bound. Saved with the other settings (`Settings.bindings`, `state/bindings.ts`); old saves get the defaults.
- **Input icons:** Kenney's Input Prompts pack (CC0, `ASSETS/UI - inputs`), keyboard keys from the outline set and mice from the filled set, recoloured bone / blood by `tools/prepare-input-icons.ts` into `public/ui/inputs/` (89 icons). Keys without an icon (numpad digits) get a drawn key cap.
- **Prompts:** looking at something reachable shows its name and "Press [icon] to collect" (fuse, battery), "to read" (note) or "to interact" (generator with all fuses, powered exit). The icon is whatever interact is bound to. Locked things show what they need instead ("Needs fuses (1/3)", "Mag-lock. No power."). The note says "Press [icon] to put it down".
- **Controls card:** the bottom-of-screen key tips on the intro card are gone. When a run starts, a Controls box shows in the middle of the screen on the right for 10 s (a red line counts down) or until you press Enter. It hides while a note is open and pauses with the game.
- Fix: a frame stamped before the game was built gave a negative frame time, which could stall the HUD at the start. Frame time is now clamped at 0 (game and menu scene).

## 0.4.4

- **The ward is easier to see without the flashlight.** The fill light is a lighter grey-blue and stronger (0.6 before the generator, 0.9 after), fog is a bit thinner, and the soft glow around you is brighter. You can make out corridor walls and floor tiles with the flashlight off; it's still dark. All levels live in `state/lightLevels.ts` (`LIGHT`).
- **Flashlight 1.3× stronger** (`LIGHT.flashlight` = 34 × 1.3).
- **The Patient sees you 1.3× further:** 20.8 m with the flashlight on (was 16), 10.4 m with it off (was 8). Crouching still cuts that by 30%. The flashlight is still the bigger giveaway.

## 0.4.3

- **Main menu:** The Patient stands on the right under one failing tube light, staring at you (`engine/menuScene.ts`, `screens/MenuScene.tsx`), using its own `stare` clip (`Patient_menu_stare.fbx`, merged into `patient.glb`). The loop (`state/menuScare.ts`): lit 5–9 s → the tube stutters out → dark, it's gone → its face fills the screen under a crazy cold strobe for 1–1.6 s → dark, gone again → the tube stutters back on and it's standing there again. What's on screen only changes while the light is off. A faint buzz plays on each flicker and a harsher, longer one on the face scare (once audio is unlocked). The menu text is unchanged and stays clickable throughout.
- **Player run animation** plays at half speed (`RUN_ANIM_SLOWDOWN`).
- **Enemy footsteps heard through a wall are 1.5× louder** (`OCCLUDED_STEP_BOOST`). Steps in the open and the breathing are unchanged.

## 0.4.2

- Your own footsteps and the flashlight click are half as loud (`PLAYER_STEP_GAIN`, `FLASHLIGHT_CLICK_GAIN` in `audio/spatial.ts`).
- **Crouch is now Ctrl and toggles** (press to crouch, press again to stand). Sprinting while moving stands you up. Ctrl+S/D/A and similar no longer reach the browser while playing. Browsers never let a page block Ctrl+W, so mid-run the game asks "Leave site?" before the tab closes.
- **HUD:** breath is now a white line just under the crosshair. It's hidden while rested, shrinks from both ends toward a dot as you sprint, grows back as you recover, and pulses when you're out of breath. The battery bar (bottom-left) is now warm amber, thicker and glowing, and turns red and pulses below 20%. Maths in `state/hudLayout.ts`.
- New player run animation (your replacement `player_run.fbx`), converted into `public/models/player.glb`.
- Fixed: crouching put the camera inside the body's collar. The crouch (and run) animations lean the head forward of the feet, so the body is now placed from where its animated head actually is: the head always sits just behind the camera (`bodyRootFor` / `bodyBackOffset` in `engine/playerAnim.ts`).

## 0.4.1 "Real Sound" + FOV

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
- **Player:** WASD, mouse look, Shift sprint (stamina), Ctrl crouch toggle (silent, harder to see), right click flashlight (battery drains; flickers below 20%), left click collect / interact. All rebindable in Settings (0.5).
- **Items:** 3 fuses, 3 batteries and 4 lore notes, each on a cabinet against a wall.
- **Presentation:** procedural hospital textures, wall graffiti, flickering lamps that come on after power, a flashlight with a lens cookie and lag, film grain, vignette, and fear-driven chromatic aberration.
- **Sound:** all synthesised. Room drone, distant clanks, the enemy's 3D breathing and footsteps, a heartbeat that speeds up with fear, chase strings, a stinger when it sees you, and a jumpscare scream.
- **Screens:** main menu (stats + best time), settings (sensitivity, volume, invert Y, grain), pause, death ("IT FOUND YOU") and escape.

## How to run
Double-click `START_GAME.bat`. The first run installs packages (needs Node.js; 24 is pinned). It opens http://localhost:5173.

## How to check
From `game/`: `npm run verify:quick` (typecheck + 133 rule tests) and `npm run verify` (adds the production build).

## How to publish
`npm run build` in `game/`, then deploy `game/dist` to Netlify (`netlify.toml` is ready).

## Verified vs unverified
- ✅ Typecheck, 133 rule tests and the production build pass.
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
