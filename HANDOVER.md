# HANDOVER.md: where things stand

## Current version: 0.9.4

- **The Patient's sounds behind walls are now the right loudness** (`world/soundPath.ts`, `audio/spatial.ts` `enemyHearing`). Before, a wall only took off 45% and footsteps got a 1.5× boost back through it, so two walls away it sounded nearly as close as in the open. Now its steps and breathing take the louder of two ways to you:
  - straight through the walls: each wall keeps only 30% (about −10 dB) and turns it into a dull thud;
  - round through the halls: the longer walking distance, minus 45% for every right angle it bends, a bit clearer, and it seems to come from the corner you can see (you hear it coming down the corridor).
- Examples: in the generator room with one wall between you, about 2.8× quieter than before; two walls away, about 5–6× quieter, and fainter than it would be 18 m down an open corridor. In the open nothing changes.

## 0.9.3

- **The flashlight reaches 1.5× further** (`state/lightLevels.ts`, `FLASHLIGHT_BEAM` / `flashlightFog`). The beam's cut-off goes from 32 to 48 m, and its falloff is gentler: the same brightness at arm's length, and a wall 1.5× as far gets what one at 15 m used to. The ward's fog (its darkness) also thins by 1.5× while the beam is on, easing in and out with it; without that, the fog would still hide anything past ~20 m however brightly lit. The Patient standing 21 m down a hall is now visible in the beam; before, it wasn't.
- Trade-off to keep in mind: with the flashlight on it already sees you from about 21 m, so you now see it at roughly the same range.
- **Difficulty picker** after Begin (`state/difficulty.ts`, `screens/DifficultyPanel.tsx`); the last pick is saved and Try again keeps it.
  - **Easy:** right click is night vision goggles instead of the flashlight. On: the ward turns phosphor green and bright, the fog nearly lifts (something 30 m away is still clearly there), with a goggle edge and its own noise. They use the battery like the flashlight, but give off no light, so The Patient can't spot you by them. Their deploy sound (`ASSETS/audio/night_vision/deploy.mp3` → `night_vision_on`) plays 80% quieter. The battery bar reads NV and the controls card says Night vision.
  - **Normal:** unchanged.
  - **Hard:** the battery drains 1/0.6 times as fast (lasts 40% less, pickups too) and one life: the first catch kills you.

## 0.9.2

- **Three volume sliders** in Settings: Master volume, Sound effects, Background. Background is the in-game ambience and tension layer and the main-menu ambience; everything else (including menu clicks) is a sound effect. Each plays at master × its own slider. Old saves keep their volume as the master; the other two start at 100%.

## 0.9.1

- **Panel switches fixed:** they were mounted backwards (face to the wall, lever in the wall, text mirrored); the model's face is its -z. The lever never moved either (three.js drops the '.' from `Switch.001` on load); now it sits down at OFF and swings up to ON.
- **The switch is its own target:** look at the box to fit the fuse and repair, look at the switch to throw it ("Power switch"). Whatever you aim at wins over whatever is closer.
- **The Patient and panel sounds:** a panel blowing on a missed skill check is heard anywhere on the map and it runs there at chase speed. Throwing a switch makes a clack it hears within 14 m, and it walks over to look.
- **Volume:** the electrical panel sounds are 60% quieter; your footsteps and its scream when it spots you are 40% quieter.
- You start with the flashlight off.
- **Injured:** much heavier head bob and a limp (the bad leg dips deeper and rolls further), so you feel the difference after the first catch.

## 0.9

- **Four electrical panels, four fuses.** The panels are spread over Ward 13, one per quarter of the map (top-left, top-right, bottom-left, bottom-right; none in the generator room). Each one: fit a fuse (press), repair it (hold), throw its switch (press). Any order. When all four are live, start the generator: the lights come on, The Patient screams and runs for the generator (as before), then the exit.
- **Skill checks** (`state/skillCheck.ts`, replaces `panelRepair.ts`), Dead by Daylight style: about 14 s of holding per panel. Every 2.6 to 4.6 s of work a warning ticks, and 0.8 s later a circle appears with a needle sweeping round it once (1.15 s). Press Space (rebindable: "Skill check") while the needle is in the light zone; the small white slice at its start is a perfect hit (+5%). Miss, press too early or let it go round: the panel blows (bang The Patient hears from 22 m, -12%, dead for 1.4 s). Letting go of the panel calls the check off. Work goes on during the check.
- **Objective banner:** every new objective is announced big at the top of the screen for 5 s ("New objective", or "Objective updated" when a panel comes on). The corner line now has a second line with fuses held / fitted.
- **Running is riskier:** The Patient sees 1.3 times further while you sprint.
- **Brick only in the generator room:** every wall of the generator room is lined with the bare brick (`brick_wall`, stretched to each 3 m wall). Everywhere else stays tiled, behind the panels too. The electrical wall behind the generator keeps only its pipes and boxes.
- The brick and the electrical models rendered almost black (fully metallic after the material conversion). `tools/prepare-props.mjs` now has a `metal` option per model, set for the brick, the panels and the switch.
- New sounds from `ASSETS/audio/electric_panel_logic`: fuse insert, repair loop, skill check warning / good / great, panel explosion, breaker switch.
- The generator room no longer has a breaker panel or switch.

## 0.8.1

- The same brick as the electrical wall now covers the wall behind the breaker panel and the power switch (new prop `brick_wall`: the bare brick panel from "Simple electrical environment", same scale).

## 0.8

- **Real props in Ward 13** (Sketchfab models in `ASSETS/models/props` + `electrical`, converted by `tools/prepare-props.mjs` into `public/models/props/`, 18 files, ~9 MB). Placement is data in `level01.ts` (`props`: cell + the wall it backs onto), rules in `world/props.ts`, drawing in `engine/propsView.ts` (loads in the background).
  - The room you wake up in: hospital bed, privacy screen, bedside cabinets (flowers / drawing / medicine), side table, medicine shelf, radiator, a portrait and a child's drawing (all from "Horror Hospital Room").
  - Generator room: the real generator, the brick electrical wall behind it, the breaker box (its door opens) and the ON/OFF switch, barrels.
  - Halls: radiators, a barrel; the washroom off the bottom-left corridor has a toilet. Every ceiling lamp is now a fluorescent fixture (glows with the lamp's flicker).
  - Props you can't walk through block you (round collision shapes along them); they all stand against walls, off the cell centres The Patient walks through (tested).
- **New power chain:** 3 fuses → put them in the generator (it runs, the breaker trips) → **repair the breaker panel** → throw the **power switch** → lights on, The Patient screams and runs for the generator (as before) → exit.
- **Breaker panel minigame** (`state/panelRepair.ts`): hold left-click at the panel; about 12 s of work. Every 2 to 4 s it starts to spark: "LET GO" flashes above the crosshair and you have 0.7 s to let go. Hold on and it shorts out: a loud bang The Patient hears from 22 m, you lose 18% and the panel is dead for 1.2 s. Working on it makes a little noise too. The panel door swings open while you work.
- **Credits** button under Settings on the main menu: the studio, then every asset with title, author, licence and source link (`state/credits.ts`; CC BY needs all four). Sounds aren't listed yet: their sources aren't recorded anywhere.
- New sounds (synthesised): spark crackle, short-circuit bang, relay clunk, switch thunk.
- Not used: the hospital room's own walls, floor, door and window (it's a cut-away display room with two walls missing).

## 0.7.2

- **Level 2 removed** (Ashgrove House, the mansion): the focus is making level 1 as good as it can be, quality over quantity. Its map, notes and tests are gone; escaping the hospital ends the run again, as before 0.7.
- Kept for later (no level uses them now): the engine's support for several floors and stairs, The Patient walking stairs, per-level intro text and AI tuning, and loading the next level after an exit. `tests/test-floors.ts` checks the stairs on a tiny two-floor test map so it stays working. The tester level picker only appears when there's more than one level.
- Ideas on the table: Level 0 (an apartment prologue before the capture, waiting on the model file) and an electrical-panel repair step / minigame for level 1 ("Simple electrical environment" from Sketchfab, free licence, GLB 1k, waiting on the download in `ASSETS/models/electrical/`).

## 0.7.1

- **Tester level picker:** when the game runs locally (`START_GAME.bat`), the main menu has a small "TESTER · START LEVEL" panel in the top-right corner: pick 1 (the hospital) or 2 (Ashgrove House), press Begin, and you wake up on that level. The pick is remembered in that browser. The public build (`npm run build`) never shows it and always starts at level 1 (`state/devTools.ts` `chooseStartLevel`, tested; the panel is `screens/TesterLevelPicker.tsx`, styles `theme-08-tester.css`). `?level=2` still works too.

## 0.7

- **Level 2, Ashgrove House:** escaping the hospital now wakes you up (same wake-up intro, its own text: "04:02 AM / You wake up on the floor of a dark entrance hall...") in a three-floor mansion. Same goal: three fuses, the generator (in the attic this time), then the front door. Lives, injury, battery and the run clock carry over; fuses and power start again. Escaping the mansion ends the run as before.
- **Layout** (`world/content/level02.ts`): ground floor = kitchen with the servants' stair in its corner, dining room, parlour, long hallway, library (shelf aisles), entrance hall with the grand staircase and the front door, drawing room. First floor = servants' room, master bedroom, nursery, hallway with the two attic stairs, bedrooms, the gallery over the entrance hall. Attic = generator room, storerooms, old nursery, trunk room. Four flights: grand stair and servants' stair (ground → first), two attic stairs (first → attic). New notes tie it to the hospital (Edwin, "came home from St. Brigid's").
- **How floors work:** each floor is its own map in the level file (stairs `^ v < >`, stairwell `o` above them). In the rules, the floors sit one above the other in a single grid with solid rows between them, so collision, sight, items and paths work per floor unchanged. Walking into the top of a flight (or its stairwell from upstairs) moves you to the same spot on the other floor (a "portal"). Your height rises smoothly along the steps, and the engine draws every floor where it really is and moves the house so your floor sits under you. No climbing animation yet (as asked).
- **The Patient on three floors:** its paths go through the stairs (it walks up and down the flights), it has four spawn / teleport corners per floor (12), and in the mansion it keeps tracking you much longer: it keeps following where you went for 5 s after losing sight (was 1.2), searches 16 s (was 7) over 5 tiles (was 3). Per-level tuning lives in the level file (`ai`). Fixed: re-planning its route every 0.4 s used to walk it back to the middle of the step it was on, so it could get stuck on the top step.
- **Rendering:** floor and ceiling are now one tile per cell (holes over the stairs), steps are drawn as blocks, railings round stairwells. Only the lamps on your floor light up (point lights shine through floors otherwise). The mansion still uses the hospital textures and fixtures, placeholders until new art is ported.
- **Dev only:** `?level=2` starts in the mansion; `debugTeleport(col, row, yaw, floor)`, `debugNextLevel()`.
- Known gaps: getting caught on a flight of stairs plays the throw at floor height. Sounds from other floors are just treated as far away (it doesn't hear you through floors).

## 0.6.5

- **Debug tools sealed for the public build:** the F2 debug view, F3 freeze, the `?debug` flag (no pointer lock, `window.__lastWard` / `__lastWardMenu` helpers) and skipping the credit screen now only work from the dev server (`START_GAME.bat` / `npm run dev`). A `npm run build` (what Netlify publishes) has them all off: F2 does nothing and `?debug` is ignored. Decided by Vite's `import.meta.env.DEV` through `state/devTools.ts` (tested). Nothing changes when you play locally.

## 0.6.4

- **Patrols:** it teleports to another corner after **35 s** without spotting you (was 60). It patrols a wider area (12 tiles round its corner, was 6) and every patrol leg is at least 12 cells of path, so legs average ~18 cells (was ~8): no more pacing back and forth in one spot, and more chances to walk into you by surprise. It still stops and looks round between legs for 1 to 3.5 s.
- **Reading pauses the game:** opening a note stops everything (The Patient, you, timers, stamina, grunts) until you put it down with the collect / interact button, Enter or Esc. The 14 s auto-close is gone. New phase `'reading'` (world time 0).
- **Generator on:** The Patient vanishes to a random corner (one at least 14 m from the generator), screams, then **sprints** (chase speed, run clip) to the generator. Noises don't distract it on the way, but if it sees you it chases you. It takes about 14 to 16 s to get there, your window to leave the room. After that it searches round the generator. Before this, the "noise from the generator" aimed at the machine itself (a solid cell), so no path reached it and it just wandered somewhere random.
- **The scream:** when the power comes on you always hear it scream, wherever it is: the recording, muffled as if through the walls (`audio.powerScream()`), with the old stinger 1.2 s later.

## 0.6.3

- **Waking up:** after "Click to begin" the same intro text (03:14 AM…) stays on black and fades over 0.9 s while your eyes are shut. Then the eyelids open (1.4 s, heavy, same curve as after a throw) onto the floor: you're lying face down where you spawn, the get-up clip held on its first pose, cheek to the tiles. 1 s of lying there, then you get up (the get-up clip, 5 s) with the grunt cut to 1 s, and the run starts: "Find a way out." + the controls card. Control returns ~8.3 s after the click. The Patient is frozen during this. The flashlight and the glow around you are dim on the floor (full strength point-blank turned the frame white) and come up as you stand. Esc pauses it like a running game. `state/wakeSequence.ts` (timeline), `engine/wakeScene.ts` (camera = your body's eyes), phase `'waking'`.
- **Note on the wall:** straight ahead as you step out of the spawn room (wall cell 3,6, facing the corridor): a torn page, "It can hear you...". New `wallNotes` in level files (wall cell + face + text, checked by `parseLevel`), drawn by `wallNoteTexture()`.
- **The victim's note:** the table note with the "it hears everything, walk slowly" advice is now a previous victim's story: thrown five metres down the corridor, his leg broken against the wall, left shaking. Still shuffled onto a random table like the others.

## 0.6.2

- **Studio intro:** the credit screen is now two cards. First your studio GIF (`studio_gif.gif` at the project root → `public/ui/studio.gif`): "DEVELOPED BY / NIKO GAME COLLECTION" types itself out (done at 1.6 s), holds, and fades (4.0 s in all). Then the full-screen [F11] and headphones tips fade in, hold 3 s and fade into the main menu. Black stays solid between the cards. A click fades whichever card is up within 0.5 s.
- The GIF was cropped to the text (420×64, shown at up to 720 px wide), set to **play once** (the original loops forever and would restart before the fade), 61 KB. Its background is exactly the game's black, so it sits seamlessly. The studio card's clock starts when the GIF has loaded (fallback 1.5 s); one stalled frame counts at most 0.25 s.
- `logo.png` (a still version of the same title) is not used yet.

## 0.6.1

- **Really thrown:** you fly straight out behind The Patient (180° from where it looks) until your body hits a wall, which stops you (capped at 10 m down a long corridor). Same 1.0 s flight, so longer throws are faster. If your head would end up in the wall, the body slides back off it. `world/throwLanding.ts`.
- **Blacking out:** after the wall your eyelids drift shut over ~1.2 s, fluttering like you're fighting it (top and bottom lids in a curve, centre closes last, warm-dark edge). Shut for ~0.8 s, while it vanishes (now 1.5 s after the impact) and while your pose switches to face-down. The get-up opens them, heavy at first. Lying time is now 2.0 s (was 1.0), so control returns at 11.5 s. `eyelids()` in `state/caughtSequence.ts`, lids drawn in `engine/postfx.ts`. Replaces the 0.6 dazed blink.
- **Grunts:** one as the get-up starts, then every 15–25 s (was 5–7).
- **Its throw clip plays 1.5× slower**, so it's still throwing while you fly; the slam at the end of the clip is never reached before it vanishes. You still leave its hands 1.5 s into the throw.

## 0.6

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
