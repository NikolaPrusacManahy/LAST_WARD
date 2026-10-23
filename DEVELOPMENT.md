# DEVELOPMENT.md: module map and contracts

Who owns what, and how the pieces talk. Keep this current when you add or move a module.

## Frame flow

```
App.tsx ── screen state (menu / game) + overlays (pause / settings / end) + save
  └─ GameView.tsx ── creates one Game per run (keyed by runId), renders <Hud>
       └─ engine/Game.ts (façade, owns the rAF loop)
            each frame while playing:
            1. PlayerController.look/step   → uses world/collision + state/playerRules
            2. interact (E)                 → world/interact.findTarget + state/objectives
            3. stepEnemy                    → world/enemyAI (pure) → events: spotted / lost / heard / caught
            4. EnemyView.update             → animation only
            5. AudioEngine                  → footsteps, enemy breath/steps, heartbeat, stingers
            6. Lighting.update + PostFx     → lamps flicker, fear-driven screen FX
            7. hudStore.set (10×/s)         → React HUD re-renders via useSyncExternalStore
```

## Modules

| Module | Owns | Pure? |
|---|---|---|
| `world/level.ts` | Level type, ASCII legend + parser, `TILE`, cell ↔ world maths, `itemPos` (cabinet placement) | yes |
| `world/pathfinding.ts` | A* (8-way, no corner cutting), flood-fill `reachable` | yes |
| `world/lineOfSight.ts` | Grid line-of-sight | yes |
| `world/enemyAI.ts` | The Patient's brain: `ENEMY` tuning, `createEnemy`, `stepEnemy`, `visibility`, `heardNoise` | yes |
| `world/collision.ts` | Circle-vs-grid `moveWithCollision` (wall sliding, round prop blockers), `overlapsWall`, `clearLine` (can a body travel a → b, 0.5.2), `freeBehind` (room behind the camera for the body, 0.5.2) | yes |
| `world/interact.ts` | What's in reach and in front of the player | yes |
| `world/rng.ts` | Seeded RNG | yes |
| `world/content/level01.ts` | Ward 13 map + notes | data |
| `state/playerRules.ts` | `PLAYER` tuning: speeds, stamina, battery, noise radii, fear curve | yes |
| `state/objectives.ts` | Fuses → generator → exit chain, objective text | yes |
| `state/settings.ts` | Save shape, defaults, `hydrateSave` (incl. `bindings` since 0.5), best time | yes (+ localStorage I/O) |
| `engine/Game.ts` | Renderer, scene, phases (`intro / playing / paused / dying / escaping / over`), wiring | no |
| `engine/playerController.ts` | Camera, head bob, footsteps, flashlight rig | no |
| `engine/buildLevel.ts` | Walls (instanced), floor, ceiling, lamps, cabinets, items, generator, exit door | no |
| `engine/enemyView.ts` | `EnemyView` contract (`update`, `pose` for fixed poses like the menu, `lunge`) + the primitive fallback figure (shown until the GLB loads, or if it fails) | no |
| `engine/enemyModel.ts` | Rigged Patient (`public/models/patient.glb`): GLTFLoader + AnimationMixer, crossfades, jumpscare attack clip | no |
| `engine/playerBody.ts` | First-person body (`public/models/player.glb`): placed behind the camera, head hidden, arms shrink away while sprinting | no |
| `state/cameraBob.ts` | `BOB` amplitudes per gait (dip, sway, roll, nod, FOV) + `bobOffset` | yes |
| `engine/playerAnim.ts` | Player clip per gait (+ strafe left / right from local velocity, 0.5.3) + playback speed, body placement | yes |
| `engine/debugView.ts` | F2 view: sun/sky lights, enemy marker through walls, path line | no |
| `state/debugInfo.ts` | F2 panel text | yes |
| `engine/enemyAnim.ts` | Which clip to play for an AI mode/speed, and playback speed so feet match the ground | yes |
| `engine/lighting.ts` | Lamp flicker before power, steady after; item spin | no |
| `state/lightLevels.ts` | Every light level (flashlight, fill, fog, eye glow) + `atmosphereFor(powered, debug)` | yes |
| `engine/postfx.ts` | Grain, vignette, chromatic aberration, red / white / black fades | no |
| `engine/textures.ts` | Procedural canvas textures (walls, floor, ceiling, notes, signs, flashlight cookie) | no |
| `engine/input.ts` | Keys by `code`, mouse buttons as `Mouse0..4`, mouse deltas under pointer lock; `action(a)` / `actionPressed(a)` read `Settings.bindings` | no |
| `state/bindings.ts` | Actions, `DEFAULT_BINDINGS` (left click interact, right click flashlight), `rebind` (clash = swap), reserved keys, `hydrateBindings` | yes |
| `state/inputIcons.ts` | Code → Kenney icon name + label (`glyphFor`), the icon list `tools/prepare-input-icons.ts` ships | yes |
| `state/prompts.ts` | Crosshair prompt words (`promptFor`: collect / read / interact / what's missing) + controls-card timer | yes |
| `audio/menuAmbience.ts` + `state/menuAudio.ts` | Ambience under the credit screen + main menu (own AudioContext, starts on the first gesture) | no / yes |
| `state/lookBack.ts` | Look back on the run: 180° camera swing, slow-mo burst + cooldown, body hide (0.5.4) | yes |
| `world/itemShuffle.ts` | Shuffles fuses / batteries / notes across the item cabinets each run (0.5.4) | yes |
| `state/creditIntro.ts` + `screens/CreditIntro.tsx` | Boot credit screen: 3 s hold, 1 s fade, click → 0.5 s fade (real time, not frame-capped) | yes / no |
| `screens/InputIcon.tsx`, `ControlsCard.tsx`, `KeyBindings.tsx` | Icon (or text key cap), the 10 s controls box, the rebind list in Settings | no |
| `engine/hudStore.ts` | External store between the engine and React | no |
| `state/menuScare.ts` | Main-menu loop: lit (stare) → stutter out → dark (gone) → face strobe → dark (gone) → stutter in; pose swaps only in the dark | yes |
| `engine/menuScene.ts` + `screens/MenuScene.tsx` | Main-menu 3D backdrop: Patient model (`EnemyView.pose`, `stare` clip), tube light, face-shot camera + strobe; disposed when leaving the menu | no |
| `audio/spatial.ts` | `enemyMix(distance, occluded)`: low-pass cutoff + gain for enemy sounds; `ENEMY_STEP_GAIN` | yes |
| `audio/uiSounds.ts` + `hooks/useUiSounds.ts` | Menu hover/click sounds (own AudioContext, document-level listener on `.lw-menu-btn`) | no (throttle `hoverAllowed` is tested) |
| `audio/audio.ts` | Sound engine: loads `public/audio/manifest.json` samples, plays them (3D via PannerNode for enemy/generator), synth fallback per sound; synth tension, stinger, clanks | no |

## Contracts

- **Coordinates:** world `x` = map column direction, world `z` = map row direction (down the ASCII map). 1 cell = `TILE` = 3 m. three.js uses the same x/z, with y up.
- **Yaw:** `forward = (-sin yaw, -cos yaw)`. `yaw = 0` looks up the map (−z), `yaw = π` looks down it (+z).
- **Enemy:** `stepEnemy(level, enemy, { dt, player, noise, fuses }, rng)` mutates `enemy` and returns events. Noise is one-shot per frame (a footstep, or the generator starting with radius 999).
- **Game → React:** only through `GameCallbacks` (`onEnd`, `onPause`) and the HUD store. React → Game only through `GameHandle` (`resume`, `setSettings`) and `begin()` from the intro click.
- **Pointer lock:** losing lock while playing = pause. Death and escape release it on purpose and never trigger pause.
- **Saves:** a new saved field needs a default in `defaultSave()` **and** a line in `hydrateSave()`, or it is wiped on load.

## Tuning cheat sheet

| What | Where | Now |
|---|---|---|
| Walk / sprint / crouch speed | `PLAYER.speed` | 3.0 / 5.4 / 1.6 m/s |
| Sprint time | `PLAYER.staminaMax` | 4.5 s |
| Flashlight battery | `PLAYER.batteryDrainPerSec` | ~90 s per full battery, +45% per pickup |
| Footstep noise radius | `PLAYER.noise` | walk 6 m, sprint 15 m, crouch silent |
| Enemy speed | `ENEMY.speed` | patrol 1.5, investigate 2.6, chase 4.3 m/s (+7% per fuse) |
| Enemy sight | `ENEMY.viewDistLight / Dark` | 20.8 m with your flashlight on, 10.4 m off (×0.7 crouched), 130° cone (0.4.4: ×1.3) |
| Lose it | `ENEMY.memorySeconds`, `searchSeconds` | tracks you 1.2 s after losing sight, searches 7 s |
| Scream head start | `ENEMY.windupSeconds` | screams in place 1.0 s after spotting you, then charges |
| Corner teleport | `ENEMY.teleportAfter`, `teleportMinDist`, `homeRadiusTiles` | 60 s without spotting you → another corner, ≥ 14 m from you and out of sight; patrols within 6 tiles of its corner |
| Look back | `LOOK_BACK` (state/lookBack.ts) | 0.18 s swing, 0.4× time for 0.5 s, 3 s cooldown |
| Ward brightness | `LIGHT` (state/lightLevels.ts) | flashlight 44.2 (34 × 1.3), fill light 0.6 dark / 0.9 powered, fog 0.065 / 0.05, eye glow 1.1 |

## Character models

- Pipeline: Mixamo FBX in `ASSETS/models/<name>/` → `node tools/convert-character.mjs` (see its header) → `public/models/<name>.glb` with named clips, root motion stripped, 1024 px WebP textures. Patient: 15.7 MB of FBX → 1.3 MB GLB.
- three.js strips `:` from node names, so Mixamo bones are `mixamorigHips`, `mixamorigHead`, …
- Player clips: `idle walk run crouch` (bones `mixamorig9…`). Authored speeds: walk 1.6, run ≈3.2, crouch 1.25 m/s.
- Patient clips: `idle walk run search scream attack stare` (`stare` is menu-only). AI → clip mapping lives in `enemyAnim.ts` (tested). Authored ground speeds: walk 1.47 m/s, run ≈2.6 m/s.
