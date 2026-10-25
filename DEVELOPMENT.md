# DEVELOPMENT.md: module map and contracts

Who owns what, and how the pieces talk. Keep this current when you add or move a module.

## Frame flow

```
App.tsx ── screen state (menu / game) + overlays (pause / settings / end) + save
  └─ GameView.tsx ── creates one Game per run (keyed by runId), renders <Hud>
       └─ engine/Game.ts (façade, owns the rAF loop)
            each frame while playing:
            1. PlayerController.look/step   → uses world/collision + state/playerRules
                                              (in a locker: Game.stepHiding → state/hiding instead)
            2. interact (left click)        → world/interact.findTarget + state/objectives / hiding / throwables
               throw (Space), flights       → state/throwables (landing = a noise with `lure`)
               panel repair                 → state/skillCheck (Game.workPanel)
            3. stepEnemy                    → world/enemyAI (pure) → events: spotted / lost / heard / caught /
                                              teleported / lockerOpen / lockerClose / foundYou
            4. EnemyView.update             → animation only
            5. AudioEngine                  → footsteps, your breath while sprinting, enemy breath/steps, heartbeat, stingers
            6. Lighting.update + PostFx     → lamps flicker, fear-driven screen FX
            7. hudStore.set (10×/s)         → React HUD re-renders via useSyncExternalStore
```

## Modules

| Module | Owns | Pure? |
|---|---|---|
| `world/level.ts` | Level type, ASCII legend + parser, `TILE`, cell ↔ world maths, `itemPos` (where an item's table stands). 0.9: `brickRooms`; 0.9.6: `throwables` spawns; 0.9.7: `corridors` → `level.corridor`, `isCorridor`. 0.7: floors stacked in one logic grid (gap rows between), stairs + portals, `crossPortal`, `stairRise`, `floorOffset` | yes |
| `world/pathfinding.ts` | A* (8-way, no corner cutting), flood-fill `reachable`; both go through stair portals (0.7); `findPath(…, only)` walks only the cells in a mask (the corridors, 0.9.7) | yes |
| `world/lineOfSight.ts` | Grid line-of-sight (`level.opaque`: stairwells are see-through, 0.7) | yes |
| `world/enemyAI.ts` | The Patient's brain: `ENEMY` tuning, `createEnemy`, `stepEnemy`, `visibility`, `heardNoise`; corners / teleports, long patrol legs, `summonToGenerator` (0.6.4). 0.9.6: `litByBeam` (your beam on it = spotted), lures from throws, locker checks (`check`), `onTask` (no teleport mid-task), `turnToward` by angle. 0.9.6.2: `enemySpeed` (the fuses only speed up the chase). 0.9.7: the ceiling crawl (`CRAWL`, `stepCrawl`, mode `crawl` with `e.crawl` up / on / down, `planCrawlRoute`, `nearestCorridorCell`, `dropFromCeiling`). 0.9.8: losing you in a chase → straight back to patrol (no search, no locker check). 0.9.9: never checks lockers at all; losing sight of you mid-chase it goes where it last saw you plus a short guess the way you were going (`heading`, `guessAhead`), no longer where you really are; for `deafAfterLost` seconds after it loses you, footsteps don't count (`e.deaf`); chasing you it sees you anywhere in its line of sight on your floor (`chaseSees`) | yes |
| `world/collision.ts` | Circle-vs-grid `moveWithCollision` (wall sliding, round prop blockers), `overlapsWall`, `clearLine` (can a body travel a → b, 0.5.2), `freeBehind` (room behind the camera for the body, 0.5.2), `nearestFree` (out of any overlap, 0.9.6) | yes |
| `world/interact.ts` | What's in reach and in front of the player (0.9: also the four electrical panels; 0.9.1: their switches, and what you aim at wins over what's closer; 0.9.8: `loose` = anything to carry, `item` = notes only) | yes |
| `world/props.ts` | Real props: sizes, which way each faces, `placeProp` (cell + wall it backs onto), collision circles, `findProp` (0.8); `panelSpots` / `panelSwitches` (panel i and its switch, level order) and `brickLining` (brick on every wall of `brickRooms`) (0.9); `lockerSpots`, `propFront` (0.9.5), `ITEM_TABLE_SCALE` (0.9.6) | yes |
| `world/soundPath.ts` | How The Patient's sound reaches you: walls through, the way round (length, bends), the corner it comes from (0.9.4) | yes |
| `world/rng.ts` | Seeded RNG | yes |
| `world/content/level01.ts` | Ward 13 map, notes, wall notes, every prop (panels, lockers, furniture), the brick room, bricks and bottles, the corridors (0.9.7) | data |
| `world/content/levels.ts` | Play order of the levels (0.7) | data |
| `state/playerRules.ts` | `PLAYER` tuning: speeds, stamina, battery, noise radii, fear curve; adrenaline while chased (`status.chased`, 0.9.6.2) | yes |
| `state/objectives.ts` | Fuses → four panels (fit, repair, switch on) → generator → exit (0.9), objective text + detail line | yes |
| `state/skillCheck.ts` + `screens/SkillCheck.tsx` | Panel repair with Dead by Daylight skill checks: timing, judging, misses (0.9). The circle is drawn from the same clock it's judged on | yes / no |
| `state/credits.ts` | Credits for every outside asset; which credit each prop comes under (0.8) | yes |
| `state/throwables.ts` + `engine/throwablesView.ts` | Bricks and bottles: spawns, held position, throw arc, landing, noise (0.9.6). 0.9.8: everything you carry (`CarryKind`: + fuse, battery, medkit; `spawnTableItems` puts them on the tables), drawn on a table / the floor / in your hand, no shadows | yes / no |
| `state/inventory.ts` | 0.9.8: your three slots: `store` (the slot your hand is on if free, else the first free), `selectSlot` (same key again = put away), `inHand`, `remove`, `dropSpot`, `MEDKIT_SECONDS` | yes |
| `screens/SlotBar.tsx` + `ItemIcon.tsx` | 0.9.8: the slot bar (bottom centre) and the drawn item icons; styles in `theme-13-slots.css` | no |
| `state/hiding.ts` | Lockers: getting in / out, peeking (Space + W, 60° max), seen-getting-in = exposed, look limits (0.9.5) | yes |
| `state/difficulty.ts` + `screens/DifficultyPanel.tsx` | Easy / Normal / Hard rules (lives, battery drain, night vision) and the picker after Begin (0.9.3) | yes / no |
| `state/coop.ts` | 0.9.9: co-op rules: room codes (`makeRoomCode`, `normalizeCode`, `isValidCode`), `cleanName`, the room JSON (`parseRoom`), `hostStep` (start / stop the countdown, start the run), `countdownLeft`, `lobbyHint`, `spawnSpot` (side by side in the spawn room) | yes |
| `net/store.ts` | 0.9.9: the database interface co-op talks to, shaped like the Realtime Database (paths, JSON, null deletes, `claim`, `watch`, remove-on-disconnect, server clock) | types |
| `net/memoryStore.ts` | 0.9.9: `MemoryHub`, the stand-in database: in memory for the tests, in localStorage for `?coop=local` (tabs of one browser, dev build only) | no (tested) |
| `net/firebaseStore.ts` + `firebaseConfig.ts` | 0.9.9: Firebase Realtime Database + anonymous sign-in (per tab); `net/backend.ts` picks it or the stand-in and loads Firebase only when Co-op is opened | no |
| `net/room.ts` | 0.9.9: `CoopClient`, one player's side of a room: create, join, ready, difficulty, leave, the host's `tick`, `startInfo`; React reads it with `subscribe` / `getSnapshot`. Connects up to `CONNECT_TRIES` times, and is only connected while in a room (or making / joining one) | no (tested on the stand-in) |
| `state/coopRun.ts` | 0.9.9: a co-op run: `LiveState` (what each player sends) + `encodeLive` / `decodeLive`, smoothing (`Track`, `addToTrack`, `sampleTrack`, `VIEW_DELAY`; the delay grows with late updates: `targetDelay`, `easeDelay`, `stepTrack`, `VIEW_DELAY_MAX`), `louder` (which noise counts), `catchOutcome` (thrown / down / dead), `DOWN` (one minute, crawl, 5 s revive), getting someone up (`KNEEL`, `reviveBack`, `kneelAt`: where you kneel and the way you face; `reviveFree`: whether you can start), `runOver`, `watchable` / `nextWatch`, `HARD_CRAWL_BOOST`, voice (`voiceNoiseRadius`, `voiceDistanceGain`, `hears`), rejoining (`ResumeState`, `encodeResume` / `decodeResume`), the mimic (`MIMIC`, `nextMimic`, `mimicNow`, `mimicWho`; `MIMIC_SOLO_TEST` for the test build) | yes |
| `state/hitSequence.ts` + `engine/hitScene.ts` | 0.9.9: caught on your last life: its blow (`HIT.contactClip`, measured in its attack clip) and your flight (`hitFly`), timeline, cues, eyes, black; filmed from your eyes then your body's | yes / no |
| `world/enemyTargets.ts` | 0.9.9: one Patient, up to three of you: `pickTarget` (who it hunts this frame), `catchable` (who it catches), `catchesYou` (off the host, your own catch, by The Patient on your screen), `NOBODY`, `nearestPos` | yes |
| `net/runSync.ts` | 0.9.9: a run's database paths (`rooms/{code}/run`): live states, items (`takeItem` transaction), panels (`claimPanel`), lockers, power, revives, The Patient (host only), clean-up after someone leaves (their unfinished revive too), each player's saved state for rejoining (`sv`, `saveResume` / `loadResume`), pings (`pg`) | no (tested on the stand-in) |
| `net/rejoin.ts` | 0.9.9: the run this tab is in (sessionStorage: survives a reload), so the main menu can offer Rejoin the run | no |
| `world/ping.ts` + `engine/pingView.ts` | 0.9.9: pings (F): `pingRay` (where your view hits), `snapPing` (the thing you meant), `inCrosshair` (The Patient), `pingText`, `PING`; the markers (through walls, fixed size on screen, fading) | yes / no |
| `audio/voiceClips.ts` | 0.9.9: the mimic: keeps each speaker's short lines (0.7–4 s, the last five) from their voice or your mic, in memory; `pick` one to play (`mimic` in `audio/audio.ts` makes it wrong) | no |
| `net/voice.ts` | 0.9.9: proximity chat over WebRTC (`VoiceChat`, a mesh; the handshake under `rooms/{code}/rtc`), `getMic` (opens and keeps it: Ready), `askMic` / `askMicOnce` (the main menu: asks, lets go; the browser remembers), `micIfAllowed` (a run: never a prompt) | no (the mic rules tested with a stand-in browser) |
| `engine/coopRuntime.ts` | 0.9.9: a co-op run beside the Game: teammates (smoothed, drawn, heard, bodies to bump into), the host's Patient (targets, noise queue, catches, holding, events to everyone) and everyone else's copy of it, voice nodes and the mic meter, revives (`revivingWho`: who a teammate is getting up), the team list (`CoopSide` is what the Game does) | no |
| `engine/teammateView.ts` | 0.9.9: a teammate's body (player.glb with its head), clips from their gait, name tag (talking mark), their flashlight (`createTeamLight`: made at the start, never added mid-run), the revive marker over a downed one (through walls, fixed size on screen), on one knee at their side while getting someone up (clip `revive`) | no |
| `screens/CoopPanel.tsx` | 0.9.9: Co-op from the main menu: name, Create room / Join with code, the lobby (two columns: who's in left, the host's choices right, so it fits the screen), the countdown, the voice options (chat, it hears you, the mimic) and the privacy note; styles in `theme-14-coop.css` | no |
| `ui/uiScale.ts` | 0.9.9: how big the menu panels are drawn (`--lw-ui`, CSS `zoom` on `.lw-panel`): up to 2×, as big as fits the window; every panel is laid out to fit `PANEL_BOX` (900 × 540) at 1×, so none scrolls. Inside a panel vw / vh are zoomed too: divide them by `var(--lw-ui)` | yes |
| `screens/SettingsPanel.tsx` | 0.9.9: Settings in three tabs beside the title, each page the same height (Video: Graphics High / Low, field of view, grain; Audio: the volumes; Controls: mouse, the keys in two columns); styles in `theme-16-settings.css`. `GRAPHICS` / `pixelRatioFor` in `state/settings.ts` | no |
| `state/version.ts` | The version on the main menu (keep `package.json` the same; tested) | yes |
| `state/settings.ts` | Save shape, defaults, `hydrateSave` (incl. `bindings` since 0.5), best time; `mixVolumes` master × SFX / BGM (0.9.2) | yes (+ localStorage I/O) |
| `engine/Game.ts` | Renderer, scene, phases (`intro / playing / paused / dying / escaping / over`; 0.9.9: `down`, `spectating`), wiring; 0.9.9: a co-op run (`coop`) takes the room's difficulty and seed and wakes you on your slot's spot; the co-op block (`startCoop` … `endCoop`: your live state, the shared world in and out, catches, down / crawl / revive, watching, the end) and `coopFrame` every frame; solo's enemy step is `soloEnemy`, its drawing and sounds `enemyEffects` (both modes) | no |
| `engine/playerController.ts` | Camera, head bob, footsteps, flashlight rig | no |
| `engine/propsView.ts` | Loads and places the prop models, swaps in the fluorescent fixtures and the real generator, panel doors, switch levers, sparks light (0.8–0.9), locker doors (0.9.5), the item tables (0.9.6) | no |
| `engine/buildLevel.ts` | Walls (instanced), floor, ceiling, lamps, items (+ grey stand-in cabinets until the tables load), stand-in generator, exit door; 0.7: every floor at its real height, steps, stairwell railings | no |
| `engine/enemyView.ts` | `EnemyView` contract (`update`, `pose` for fixed poses like the menu, `lunge`) + the primitive fallback figure (shown until the GLB loads, or if it fails) | no |
| `engine/enemyModel.ts` | Rigged Patient (`public/models/patient.glb`): GLTFLoader + AnimationMixer, crossfades, jumpscare attack clip; 0.9.7: turns over about its middle (`spin`) onto the ceiling, the jump clip set to the AI's time | no |
| `engine/playerBody.ts` | First-person body (`public/models/player.glb`): placed behind the camera, head hidden, arms shrink away while sprinting; `cinematic` plays a clip where a scene says (the throw, the get-up, 0.9.9: kneeling to get a teammate up) | no |
| `state/cameraBob.ts` | `BOB` amplitudes per gait (dip, sway, roll, nod, FOV) + `bobOffset`; 0.9.1: `INJURED` heavier bob and limp | yes |
| `engine/playerAnim.ts` | Player clip per gait (+ strafe left / right from local velocity, 0.5.3) + playback speed, body placement; 0.9.7: the walk matches your feet to the ground again (the run is still half speed); 0.9.9: `PLAY_ONCE` (the clips that play once and hold) | yes |
| `engine/debugView.ts` | F2 view: sun/sky lights, enemy marker through walls, path line | no |
| `state/debugInfo.ts` | F2 panel text | yes |
| `engine/enemyAnim.ts` | Which clip to play for an AI mode/speed (runs above 4.0 m/s in any mode; 3.4 before 0.9.6), and playback speed so feet match the ground (clamped at 2.2×); 0.9.7: `crawlPose` (how high, how far turned over, which clip at what time) | yes |
| `engine/lighting.ts` | Lamp flicker before power, steady after; item spin; only your floor's lamps light up (0.7) | no |
| `state/lightLevels.ts` | Every light level (flashlight, fill, fog, eye glow) + `atmosphereFor(powered, debug, nightVision)`; 0.9.3: `FLASHLIGHT_BEAM` (1.5× reach), `flashlightFog`, `NIGHT_VISION`, `blendAtmosphere` | yes |
| `engine/postfx.ts` | Grain, vignette, chromatic aberration, red / white / black fades, night vision green (0.9.3) | no |
| `engine/textures.ts` | Procedural canvas textures (walls, floor, ceiling, notes, wall notes, signs, flashlight cookie) | no |
| `engine/input.ts` | Keys by `code`, mouse buttons as `Mouse0..4`, mouse deltas under pointer lock; `action(a)` / `actionPressed(a)` read `Settings.bindings` | no |
| `state/bindings.ts` | Actions, `DEFAULT_BINDINGS` (left click interact, right click flashlight), `rebind` (clash = swap), reserved keys (0.9.8: + 1–3, the slot keys), `hydrateBindings`; Space = "Skill check / drop" (one action: they never clash) | yes |
| `state/inputIcons.ts` | Code → Kenney icon name + label (`glyphFor`), the icon list `tools/prepare-input-icons.ts` ships | yes |
| `state/prompts.ts` | Crosshair prompt words (`promptFor`: collect / read / fit a fuse / repair / switch on / start / hide / pick up / what's missing) + controls-card timer; 0.9.8: with something in your hand (`Hand`) it says what left click does with it (throw it / load it / fit the fuse / hold to patch yourself up) | yes |
| `audio/menuAmbience.ts` + `state/menuAudio.ts` | Ambience under the credit screen + main menu (own AudioContext, starts on the first gesture) | no / yes |
| `state/caughtSequence.ts` | Lives (2; Hard gives 1, see `state/difficulty.ts`), caught timeline + cues, flight curve, thrown clip timing, dazed blink, injured tint, grunt delay (0.6) | yes |
| `world/throwLanding.ts` | Where you land: up to 10 m, never through a wall or (0.9.6) into furniture. 0.9.7: `throwPlan`, forward the way it turns to (down the middle of a corridor; in a room the way nearest its view with ≥ 2 m of room), not behind it | yes |
| `engine/caughtScene.ts` | Films the caught sequence: camera in its hands, then your body's eyes (`PlayerBody.cinematic` / `eyes`) | no |
| `state/wakeSequence.ts` | Start-of-run wake-up timeline: intro text fade, eyelids, 1 s wait, get-up, dim torch (0.6.3); `WAKE_SOUND`, the wake-up recording that plays over it all (0.9.6.1) | yes |
| `engine/wakeScene.ts` | Films the wake-up from your body's eyes (get-up clip held, then played) | no |
| `state/lookBack.ts` | Look back on the run: 180° camera swing, body hide (0.5.4; 0.9.9: no more slow motion) | yes |
| `world/itemShuffle.ts` | Shuffles fuses / batteries / notes across the item cabinets each run (0.5.4) | yes |
| `state/creditIntro.ts` + `screens/CreditIntro.tsx` | Boot credit cards: studio GIF (3.2 s + 0.8 s fade), then the tips (3 s + 1 s fade); click → 0.5 s fade of the current card | yes / no |
| `screens/CreditsPanel.tsx` | Credits screen from the main menu (0.8; 0.9.9: a grid of three columns, each title links to its source) | no |
| `screens/InputIcon.tsx`, `ControlsCard.tsx`, `KeyBindings.tsx` | Icon (or text key cap), the 10 s controls box, the rebind list in Settings | no |
| `engine/hudStore.ts` | External store between the engine and React | no |
| `state/menuScare.ts` | Main-menu loop: lit (stare) → stutter out → dark (gone) → face strobe → dark (gone) → stutter in; pose swaps only in the dark | yes |
| `engine/menuScene.ts` + `screens/MenuScene.tsx` | Main-menu 3D backdrop: Patient model (`EnemyView.pose`, `stare` clip), tube light, face-shot camera + strobe; disposed when leaving the menu | no |
| `audio/spatial.ts` | `enemyHearing` (0.9.4: loudness / muffling through walls or round corners, from `world/soundPath.ts`), `falloff`, and every volume constant (steps, scream, panel, goggles, running breath) | yes |
| `audio/uiSounds.ts` + `hooks/useUiSounds.ts` | Menu hover/click sounds (own AudioContext, document-level listener on `.lw-menu-btn` and, 0.9.9, everything else you pick in a menu: difficulty cards, switches, tabs, lobby options, key buttons; greyed out = silent) | no (throttle `hoverAllowed` is tested) |
| `audio/audio.ts` | Sound engine: loads `public/audio/manifest.json` samples, plays them (3D via PannerNode for enemy/generator), synth fallback per sound; synth tension, stinger, clanks | no |

## Contracts

- **Coordinates:** world `x` = map column direction, world `z` = map row direction (down the ASCII map). 1 cell = `TILE` = 3 m. three.js uses the same x/z, with y up.
- **Yaw:** `forward = (-sin yaw, -cos yaw)`. `yaw = 0` looks up the map (−z), `yaw = π` looks down it (+z).
- **Enemy:** `stepEnemy(level, enemy, { dt, player, noise, fuses, lockers, playerLocker }, rng)` mutates `enemy` and returns events. Noise is one-shot per frame: `{ pos, radius, run?, lure?, step? }` (`run`: a panel blowing, heard anywhere; `lure`: a thrown thing; `step`: your footsteps, 0.9.7). On the ceiling (`e.crawl`) it never catches you; events `crawlUp` / `landed` (0.9.7). It hears `radius × ENEMY.hearingMul` (2). `player.hidden` = in a locker it didn't see you get into.
- **Game → React:** only through `GameCallbacks` (`onEnd`, `onPause`) and the HUD store. React → Game only through `GameHandle` (`resume`, `setSettings`) and `begin()` from the intro click.
- **Pointer lock:** losing lock while playing = pause. Death and escape release it on purpose and never trigger pause.
- **Co-op rooms (0.9.9):** `rooms/{code}` = `{ host, created, status: 'lobby' | 'starting' | 'playing', startAt (server ms, 0 = none), difficulty: 'normal' | 'hard', seed, slots: { s0, s1, s2 } (uids; s-keys because number keys come back from Firebase as arrays), players: { [uid]: { name, ready, slot } } }`. Only the host writes `status`, `startAt` and `difficulty` (and only the host's `CoopClient.tick` runs `hostStep`); a player writes only their own `players/{uid}` and claims a slot with a transaction. The rules in `game/firebase/database.rules.json` enforce this; change them with the shape. The host's whole room and each player's entry + slot are removed on disconnect.
- **Co-op run (0.9.9):** under `rooms/{code}/run`: `p/{uid}` live state (`encodeLive`, ten times a second, removed on disconnect), `it/{id}` items someone moved (`{ s, x, y, z, w, th, by?, f?, vx?… }`), `pn/{i}` panels (`{ fu, fx, on, by, r, bg }`), `lk/{i}` = uid in the locker, `pw` = `{ by, x, z }` (the generator), `rv/{uid}` = `{ by, d? }` (a revive), `e` The Patient (host only; `ev` = its last events, numbered). `rooms/{code}/rtc/{to}/{from}` = the voice handshake. The host's Patient: `CoopRuntime.stepHost`; nobody else ever calls `stepEnemy` in co-op. Anything that changes the shared world goes through `RunSync` and comes back through `CoopSide` (your own changes are applied at once and their echo is a no-op).
- **Saves:** a new saved field needs a default in `defaultSave()` **and** a line in `hydrateSave()`, or it is wiped on load.

## Tuning cheat sheet

| What | Where | Now |
|---|---|---|
| Walk / sprint / crouch speed | `PLAYER.speed` | 3.0 / 5.4 / 1.6 m/s |
| Sprint time | `PLAYER.staminaMax`, `adrenalineDrain` | 5.5 s; ~9.2 s while it chases you (drain × 0.6, 0.9.6.2) |
| Flashlight battery | `PLAYER.batteryDrainPerSec` | ~90 s per full battery, +45% per pickup (Hard: drains 1/0.6× as fast) |
| Footstep noise radius | `PLAYER.noise` | walk 6 m, sprint 15 m, crouch silent (it hears ×2: 12 / 30 m) |
| Enemy speed | `ENEMY.speed`, `ragePerFuse` | patrol 1.5, search 2.1, investigate 2.6, chase 4.3 m/s (0.9.6.2: walks back from 3.0 / 3.0 / 3.2); +4% per fuse found, chase only (4.99 with all four, `enemySpeed`) |
| Enemy sight | `ENEMY.viewDistLight / Dark` | 20.8 m with your flashlight on, 10.4 m off (×0.7 crouched, ×1.3 running), 130° cone; your beam on its body = spotted at once (30 m); 0.9.8: beam and the 3 m close sense only in front / at its sides (`sideHalf` 90°), never behind |
| Lose it | `ENEMY.memorySeconds`, `searchSeconds` | tracks you 1.2 s after losing sight, then (0.9.8) straight back to its patrol (and gives up the chase 10 s after losing sight at most, `giveUpSeconds`); after a noise where it finds nothing it searches 7 s (0.9.9: it no longer checks lockers) |
| Med kit | `MEDKIT_SECONDS` (state/inventory.ts) | hold use 5 s: not injured, lives back to the difficulty's full count |
| Scream head start | `ENEMY.windupSeconds` | screams in place 1.0 s after spotting you, then charges |
| Corner teleport | `ENEMY.teleportAfter`, `teleportMinDist`, `homeRadiusTiles` | 35 s without spotting you → another corner, ≥ 14 m from you and out of sight (never mid-task); patrols within 12 tiles of its corner |
| Ceiling crawl | `CRAWL`, `ENEMY.speed.crawl` | from a corridor patrol, never in the first 60 s, then 40–70 s apart (8% a second); 2.6 s up, 15–20 s at 8.6 m/s along a route planned up front, 1.6 s down |
| Throws | `THROW` (state/throwables.ts) | 11 m/s + lift; brick noise 20 m (2 throws), bottle 16 m (1 throw); lure: you within 5 m of the landing → chase |
| Panel repair | `SKILL` (state/skillCheck.ts) | 14 s of holding, checks every 2.6–4.6 s, miss = −12%, bang heard everywhere |
| Look back | `LOOK_BACK` (state/lookBack.ts) | 0.18 s swing (0.9.9: no slow motion) |
| Ward brightness | `LIGHT` (state/lightLevels.ts) | flashlight 44.2 (34 × 1.3), reach 48 m; fill 0.6 dark / 0.9 powered, fog 0.065 / 0.05 (÷1.5 with the beam on), eye glow 1.1 |

## Character models

- Pipeline: Mixamo FBX in `ASSETS/models/<name>/` → `node tools/convert-character.mjs` (see its header) → `public/models/<name>.glb` with named clips, root motion stripped, 1024 px WebP textures. Patient: 15.7 MB of FBX → 1.3 MB GLB.
- three.js strips `:` from node names, so Mixamo bones are `mixamorigHips`, `mixamorigHead`, …
- Player clips: `idle walk run crouch` (bones `mixamorig9…`). 0.9.7: `getUp` keeps its sideways hip movement (`--keep-root=getUp`), so the hands stay planted; the game follows where it ends up. Authored speeds: walk 1.6, run ≈3.2, crouch 1.25 m/s.
- Patient clips: `idle walk run search scream attack stare grab throw crawl jumpUp` (`stare` is menu-only; `crawl` / `jumpUp` added with `--add` in 0.9.7). AI → clip mapping lives in `enemyAnim.ts` (tested). Authored ground speeds: walk 1.47 m/s, run ≈2.6 m/s.
