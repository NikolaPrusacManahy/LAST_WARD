# HANDOVER.md: where things stand

## Current version: 0.9.8

- **Three item slots** (`state/inventory.ts`, the slot bar `screens/SlotBar.tsx` + `ItemIcon.tsx`, `theme-13-slots.css`). Everything you carry goes in a slot: bricks, bottles, fuses, batteries and the new med kit. Picking something up puts it in the slot your hand is on if that's free (so you're holding it), else the first free one; with all three full you can't pick anything up ("Your slots are full. Drop something first."). Keys 1, 2, 3 (and the numpad's) choose the slot in your hand; an empty slot means empty hands, and pressing the key of the slot you're holding puts it away (dashed in the bar), so with all three full you can still use your hands. 1–3 aren't rebindable (they're reserved, so nothing else can take them).
- **Left click uses what's in your hand:** a brick or bottle is thrown (it was Space); a battery goes in your light (+45%, used up; "Your light is full." at 100%); a fuse goes into the panel you're looking at, if it needs one (fuses are fitted from your hand now, not from your pocket); the med kit, held for 5 s with a blood-red bar, heals you. With empty hands, left click picks things up and uses panels, notes, lockers, the generator and the exit as before. The crosshair prompt says what left click will do with what you're holding.
- **Space drops what's in your hand** on the floor a step in front of you (at your feet against a wall). Left click with empty hands picks it up again. A dropped fuse doesn't count as found twice. Caught by The Patient, what's in your hand drops where you stood; the rest stays in your slots. Space is still the skill check: it's one action, "Skill check / drop" (you repair with empty hands, so they never clash).
- **Med kit** ("Medkit_low" by 3dmodelsst, CC BY 4.0; converted by `tools/prepare-props.mjs`, its one-bone rig dropped, 19 × 23 × 8 cm, 407 KB). One in Ward 13: a new item table at (16, 1) (map letter `M`), shuffled with the others. Held for 5 s while injured: you're no longer injured (no red edges, limp or grunts) and your second life is back. Not hurt, or on Hard (one life, so never injured): "You're not hurt." It's drawn at 65% in your hand. The credits link is a Sketchfab search until the model page link is filled in.
- **Fuses, batteries and the med kit lie on the tables** as things to pick up (like a brick on the floor), still glowing so you can spot them. Notes are the only things left that you "read" on a table. The objective line counts the fuses in your slots.
- **No shadows from things you carry:** a brick or bottle in your hand, with the flashlight on, threw a shadow across the screen. Nothing you carry casts one now.
- **The Patient no longer searches after losing you.** When it loses you in a chase, it goes to where it last knew you were and then straight back to its patrol. It used to search round there and check the nearest locker, which was always the one you'd just got away into. (It still searches, and checks lockers, where it heard a noise and found nothing.)
- **Your walk animation is back to half speed** (0.9.7 matched it to the ground; the quick steps looked off).
- **It doesn't notice you from behind** (`ENEMY.sideHalf`). Your flashlight on its back used to give you away at once from up to 30 m, and anyone within 3 m was noticed at any angle; that made the flashlight useless. Now your beam on it and the close-up 3 m sense only count in front of it and at its sides (90° round from where it faces), never behind. Its normal sight (the 130° cone in front) is unchanged, and it still hears your footsteps from behind.
- **Fixed: it got stuck going left and right where it lost you, until it saw you again.** Chasing the spot where it lost sight of you, it re-plans every 0.4 s, and a re-plan inside that spot's cell always sent it back to the cell's middle first. A spot near the cell's edge (in front of a locker, by a wall) was more than 0.4 s from the middle, so it never got there. Reproduced on the map: 494 of 620 such spots stuck before. Now, in the spot's cell, it walks straight to it (`goTo`), and as a safety net it gives up 10 s after losing sight of you wherever it is (`ENEMY.giveUpSeconds`). After: none stuck, all there within 2 s; and from a few cells away, 28 of 134 chases that went round in circles before, none after.
- **3 more item tables** (15 in all): one more med kit and two more batteries (map letters at (19, 3), (21, 9), (8, 13)), shuffled with the rest. Two med kits on 15 tables: about a 37% chance one is on the first three tables you check (it was 25%: one on 12).
- **The notes are short logs, up to date:** the old maintenance note still said three fuses; the victim's story is cut down to a few lines; they now hint at the four panels, the ceiling, the med kits and its blind back.
- **Fixed: the breath line came in late.** It measured your stamina against 4.5 s, but a full sprint has been 5.5 s since before 0.9.6, so the line stayed hidden for your first second of running and filled up early. It uses the real sprint length now (`staminaShare` in `state/hudLayout.ts`) and shows as soon as you start running.
- Checked in the browser: picking a fuse off a table, keys 1–3 (empty hands, put away, back), dropping it with Space and picking it up, the slot bar with a fuse, a brick and a med kit, the med kit healing after 5 s, the brick thrown with left click. New checks in `tests/test-slots.ts`.

## 0.9.7

- **The Patient crawls on the ceiling** ("search by crawling", `CRAWL` and `stepCrawl` in `world/enemyAI.ts`). Now and then while it patrols a corridor, it screams, crouches and jumps, turns over in the air and ends up upside down on the ceiling. That takes 2.6 s on the spot, which is your warning. It's never less than 60 s into a run, then 40–70 s after the last time; once it's allowed, it happens after about 12 s of corridor patrol on average. Up there it crawls along the corridors only, never into a room, at 8.6 m/s (twice its run), for 15–20 s. Then it drops down (the jump played backwards, 1.6 s) and patrols again.
- **It plans its whole route the moment it's up** (`planCrawlRoute`): for all the crawling time it has, always on along the corridors to the nearest stretch it hasn't crawled yet (a random way at a fork). So in 15–20 s it sweeps 45–55 different corridor cells, about half the ward's halls, without doubling back, and every corridor if it had the time. Before, it picked random spots and wandered back and forth. F2 draws the route.
- **Hide in a room, and keep quiet.** It can't catch you from the ceiling. If it sees you (in its view, right under it, or your beam on it) or hears your footsteps, it screams, drops and chases you. The drop is your head start; it doesn't scream again once it lands. Crouching makes no noise, so crouching in a room it passes is safe, unless it sees you through the doorway.
- **Anything else you do up there gives you away:** a panel blowing on a missed skill check, a switch, repair work, something you threw. It keeps crawling along the corridors to the corridor cell nearest the sound (the hall outside the room's door), drops there, and runs to the sound whether it sees you or not. Something you threw still works as a lure.
- **No teleport** while it's going up, crawling or coming down; a teleport it's owed happens once it's down. **If the generator comes on** while it's up there, it drops first, then does the usual: vanish to a far corner, scream, sprint for the generator.
- **Corridors** are marked in `level01.ts` (`corridors`): the ring round the ward, the middle hall and the four short halls between them. Doorways aren't corridor. `findPath` takes an optional mask of cells to walk only (the corridors, for crawling).
- **Animations:** `Patient_crawl.fbx` → `crawl` (a 0.67 s loop, played 2.4× fast) and `Patient_jump_to_changeMode.fbx` → `jumpUp` (3.2 s; the game uses it up to its top at 1.58 s). Both were added to `patient.glb` with the converter's new `--add` mode, which keeps the model, textures and other clips as they are (+96 KB). It turns over about its middle, 1.1 m up, so it stays inside the 3 m corridor while it flips (turning about its feet swung its whole body into the wall). It rolls about its forward axis. On the ceiling its hands and feet touch it, and its hips hang down to about 2.5 m, roughly 0.7 m over your eyes (`crawlPose` in `engine/enemyAnim.ts`). Checked in the browser: the poses through the jump, on the ceiling and during the drop, and a full live crawl (up 2.5 s, crawling 15.7 s, down 1.6 s).
- **Sound:** it screams as it goes up. While it crawls, its footsteps play quicker and lighter (60%) from the ceiling, so you hear it scuttling overhead, and its breathing comes from up there too. A thud when it lands. F2 shows it purple.
- New checks in `tests/test-crawl.ts`: the corridors, when it goes up, its route, crawling only the corridors at 8.6 m/s, coming down after 15–20 s, finding you, noises, the generator, the poses, and the clips in `patient.glb`.
- **Fixed: it threw you backwards.** It turned to you and threw you 180° from that, back over its shoulder, and in a room it could throw you at a wall a step away, so you clipped into it. Now (`throwPlan` in `world/throwLanding.ts`) it turns, with you in its hands, to the way it throws, and throws you forward from its hands. In a corridor: straight down the middle of the hall, toward the end closest to where it was looking. In a room: the way closest to where it was looking with at least 2 m of room. Checked in the browser: caught in the top hall you fly 10 m straight down its middle; caught with your back to the spawn room's wall, it turns and throws you 5.4 m along the room.
- **Fixed: your feet slid when you walked.** The walk played at half the speed that matches your feet to the ground (asked for in 0.4.1, when it looked rushed), so your feet covered under half the ground you moved over. It's matched again (`WALK_ANIM_SLOWDOWN` = 1), and so are strafing and the injured walk. The catch: the clip's step is short (0.8 m) for your 3 m/s walk, so your legs step quicker than before (about 3.75 steps a second). A Mixamo walk with a longer stride would look calmer with no sliding. The run still plays at half speed (its feet slide a bit too); say if it should be matched.
- **Fixed: your hands slid on the floor getting up** (waking up, and after a throw). The converter pinned every clip's hips in place, but in your get-up the hips travel about 0.6 m back over your feet, so pinning them dragged the body forward under the hands. The get-up now keeps that movement (`--keep-root=getUp`, `player.glb` rebuilt for that one clip, +146 KB), and when it ends you're where your eyes are: you get up about 0.7 m from where you lay, with no camera jump (checked: the biggest frame-to-frame move at the hand-over was 4 cm).

## 0.9.6.2

Escaping The Patient was too hard. Each fuse made it 7% faster in every mode, which was tuned for three fuses: with all four, its chase (5.5 m/s) was faster than your sprint (5.4) and its patrol (3.84) faster than your walk (3.0).

- **Fuses only speed up the chase, by 4% each** (`ENEMY.ragePerFuse` 0.07 → 0.04, `enemySpeed` in `world/enemyAI.ts`). With all four its chase tops out at 4.99 m/s, still under your sprint. Patrol, search and investigating stay at their base speeds whatever you've found.
- **Its walk is back to before 0.9.6:** patrol 1.5 m/s (was 3.0, as fast as you walk), searching 2.1 (was 3.0), going to check a noise 2.6 (was 3.2). Outside a chase it's always slower than you walk. The chase (4.3) and its rushes are unchanged, and its walk animation plays at its own pace again.
- **Crouching is silent (checked, unchanged):** crouch-walking makes no noise at all, so it can't hear you anywhere, through a wall or not. It can still see you (crouching cuts how far by 30%), and repairing a panel still makes noise. Walking is heard 12 m away in the open and about 7 m through a wall, which is how it heard you in the next room. Tests now check this directly.
- **Adrenaline:** while it's chasing you (from its scream on), sprinting drains stamina 40% slower (`PLAYER.adrenalineDrain` 0.6), so a full sprint lasts ~9.2 s instead of 5.5 s. Out of a chase nothing changes. Game sets `status.chased` each frame.
- **What that does to a chase**, from its scream to the end of a full sprint: you get 14.4 m away with no fuses (was 10.4) and 8.8 m with all four (was 4.9, and shrinking).
- **Side effect:** its rush to the generator when the power comes on (and to a blown panel or something you threw) is plain chase speed now, not chase + the fuses. The generator run takes 16.6–18.9 s instead of 13.2–15.0 s, so you have about 3.5 s more to leave the room. To get the old timing back, give `rush` the rage in `enemySpeed`.

## 0.9.6.1

- **You breathe hard while you run** (`ASSETS/audio/player_running_breathing.mp3` → `run_breath`, a 1.8 s loop). It fades in as you start sprinting and out when you stop, run out of breath, hide, pause or get caught. It plays at half the recording's volume (`RUN_BREATH_GAIN` = 0.5 in `audio/spatial.ts`).
- **New wake-up sound:** the intro scene plays `player_intro_wakingUp.mp3` (→ `wake_up`, 6.9 s) instead of the 1 s grunt as you got up. It starts on the click: its gasp (0.83 s in) comes as your eyelids crack open (0.9 s), then you stir and push yourself up, and it's over before you can move (8.3 s). Esc stops it; resuming picks it up where the scene is (`WAKE_SOUND` in `state/wakeSequence.ts`).
- Both are converted at the loudness they were recorded at (`tools/prepare-audio.py`), so "half volume" is half of the file as it was made, and the wake-up sounds just like the file.
- **Leftover files deleted:** `state/panelRepair.ts`, `world/content/level02.ts` and `tests/test-mansion.ts` (none of them was used), and the stray `story/Horror-Game` folder (a partial copy of 0.6.5, everything in it is in the 0.7 commit; it went to the Recycle Bin).

## 0.9.6

- **Things to throw** (`state/throwables.ts`, `engine/throwablesView.ts`): nine bricks and glass bottles lie against the walls of the halls. Look at one and left click to pick it up (one at a time); it floats in front of you. Space throws it where you look: it flies off with a little lift, gravity pulls it down, and the first thing it hits (floor, wall; the ceiling bounces it back down) is where it lands. A bottle smashes and is gone; a brick thuds down and can be picked up again. Models: Brick Libra (Nikitos & 3130) and Beer Bottle (gelmi.com.br), both CC BY 4.0; sounds from `ASSETS/audio/throwable/`.
- **A brick lasts two throws.** The first landing breaks it in half: it lies there half its length ("Half a brick" when you look at it) and can be thrown once more; the second landing finishes it off and it's gone. Bottles still smash on the first throw.
- **A brick landing is louder:** noise radius 12 → 20 m. The Patient hears twice as far, so in the open it comes from up to 40 m away (it was 24), and through walls from up to 24 m (it was about 14). Checked in the tests on the real map: a brick landing at one end of the top corridor is heard 38 m down it, and one in the corridor below the generator room is heard 18 m away through two walls, which the old brick wasn't. The bottle stays at 16 m.
- **The landing lures The Patient:** it sprints to the spot. If you're within 5 m of it when it gets there, it screams and chases you; otherwise it searches round there.
- **It checks lockers:** when it loses you (or finds nothing at a noise), it walks to the nearest locker within 9 m, opens it (door swings, locker sound), looks for a second and shuts it. If you're in it, you're caught (put outside it first, as before). It won't check the same locker again for 25 s.
- **It walks twice as fast:** patrol 1.5 → 3.0 m/s (as fast as you walk). Searching 3.0 and going to look at a noise 3.2, still a walk; the chase is unchanged (4.3). Its walk animation plays faster to match (the run clip now starts at 4 m/s).
- **It hears twice as far** (every noise radius ×2: walking 12 m, running 30 m).
- **Your flashlight on its body gives you away at once,** whichever way it faces (within 30 m, nothing in the way). The night vision goggles don't count.
- **No teleporting in the middle of a task.** Its tasks are checking a locker and running to something you threw. If its 35 s teleport clock runs out during one, it finishes the task first, then teleports.
- **Fixed: stuck running.** If it teleported while sprinting to a noise, it kept its sprint flag and ran everywhere for the rest of the game. A teleport now clears it, and the sprint is switched off whenever it isn't on its way somewhere.
- **Version on the main menu**, bottom right: "v0.9.6" with "Game in development" under it (`state/version.ts`; `package.json` now carries the same version, a test checks they match). Bump both with each update.
- **Fixed: stuck in a table after being thrown.** The throw only stopped at walls, so landing next to an item table put you inside it, and you couldn't move out of the overlap. Furniture (tables, lockers, every solid prop) now stops the throw too, and if anything ever leaves you inside furniture you're moved to the nearest open floor (`world/collision.ts` `nearestFree`).
- **Real tables under the items:** the grey boxes the fuses, batteries and notes sat on are now the hospital room's table, bare and shrunk to a small side table (`item_table`, from "Horror Hospital Room"). The boxes stay as stand-ins until it loads.
- **Six more lockers (13 in all):** four in the corridors (top corridor, middle corridor, east corridor, bottom corridor) and two in the generator room.
- **The generator room is furnished:** pipes and boxes on the east and west walls too, a supply shelf, a work table, more drums and a radiator, all against the walls with the middle clear. A test checks no two pieces of furniture (or an item table) stand in each other.
- **Fixed: walking backwards.** Its turning blended the old and new facing, which cancel out when the new way is straight behind it: after a teleport or a U-turn it could walk backwards down a corridor. It now turns by angle and always turns round.

## 0.9.5.1

- **Peeking leans you out.** As the locker door creaks open, your head follows it: forward past the door's edge and sideways into the gap (the door hinges on your left, so you lean right), with a tilt of the head. At the full 60° you're looking down the room, not at the inside of the door. Some of the glow round your eyes comes back while your head is out. It still doesn't give you away (`state/hiding.ts` `peekLean`).

## 0.9.5

- **Lockers to hide in** (`state/hiding.ts`; seven in Ward 13, at least one in every quarter). Look at one and left click to step in: the door swings open, you turn round, it shuts. Inside it's nearly black: the flashlight / goggles go off (and come back on when you get out). You crouch down in there (eyes at crouch height, well under the roof), and stand back up as you were when you get out.
  - **Peek:** hold Space and W together and the door creaks open slowly, up to 60°, then stops. Let go and it swings shut.
  - **Get out:** left click.
  - **Seen or not:** if The Patient could see you while you got in, it knows: it comes to the locker door and grabs you. You're put outside the locker first, then the usual catch (thrown on your first life, dead on your last). If it couldn't see you, you're invisible in there and it can't catch you, even standing right outside; peeking doesn't give you away.
- Locker model: "Dirty Locker (256x256 Retro)" by xylvnking (CC BY 4.0). It came with the door welded to the body; `tools/prepare-locker.mjs` cuts the door off, hangs it on a hinge node (`LockerDoor`) and scales it to 2 m. Credits link is a Sketchfab search until the model page link is filled in (`state/credits.ts`).
- Sounds from `ASSETS/audio/locker/`: getting in / out (`locker_enter`), the door creaking open to peek (`locker_peek`).

## 0.9.4

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
From `game/`: `npm run verify:quick` (typecheck + rule tests, 672 at 0.9.8) and `npm run verify` (adds the production build). Run `verify` before every commit.

## How to publish
`npm run build` in `game/`, then deploy `game/dist` to Netlify (`netlify.toml` is ready). The public build has the debug tools (F2, F3, `?debug`, `?level=N`, the tester level picker) switched off.

## Working on this project
- **Quality, not quantity:** level 1 (Ward 13) only. Level 2 was removed in 0.7.2; the floors / stairs engine is kept and tested for later.
- **Commits:** one line, nothing else (no co-author or tool lines), e.g. `0.9.6: throwable bricks and bottles, The Patient checks lockers, faster and sharper hunter`. Fixes asked for "in the same patch" go into that version's commit and notes, not a new number. Nikola commits in GitHub Desktop.
- **Each update:** bump the version in `game/src/state/version.ts` **and** `game/package.json` (a test checks they match), add a section at the top of this file, keep `DEVELOPMENT.md` and `README.md` current, add tests for the new rules.
- **No `CLAUDE.md`** in this project (removed from the repo and its history on purpose). Conventions live here.
- **Assets:** raw files in `ASSETS/` (not shipped), converted by the scripts in `game/tools/` into `game/public/`. Every outside asset needs a line in `game/src/state/credits.ts`.

## Verified vs unverified
- ✅ Typecheck, 672 rule tests and the production build pass (0.9.8).
- ✅ Headless browser checks (software rendering, ~1–2 fps) of each feature as it was added: panels and skill checks, banner, difficulty picker and night vision, lockers and peeking, throwing, locker checks, the furnished generator room.
- ⚠️ **Not verified by playing:** real-GPU frame rate, how it sounds (volumes, the hearing model; 0.9.6.1: the running breath's level and loop seam, the wake-up sound against the scene), mouse feel, timing of skill checks, chases after throws, how escapable a chase feels after 0.9.6.2 (the next knob if it's still too hard: `ENEMY.windupSeconds`, its scream, 1.0 → 1.5 s), the ceiling crawl in play (how often, how the flip looks at full speed, its scuttle sound). Tuned on paper; adjust `ENEMY` / `PLAYER` / `THROW` / `SKILL` after playing.

## Known limits / ideas for next
- The ceiling crawl's scuttle is its footstep sample, sped up and quieter; a recorded crawl sound would be better (drop it in `ASSETS/audio/` and say).
- Panel repair animation: the first-person hands working on the panel (a Mixamo clip for the player rig, played while you hold repair, plus camera framing on the panel).
- Level 0: the apartment prologue before you're taken (waiting on the apartment model).
- Brightness calibration screen on first launch (the game is very dark).
- Lamps and your flashlight flicker when The Patient is near.
- Hospital signs on the walls ("Generator", "Exit", arrows).
- Best time per difficulty (Easy currently counts towards the same best time).
- Doors that open and close (and make noise).
- The bottle's smash (16 m) is quieter than a brick's thud (20 m); raise it to match if wanted.
- Credits: the locker's and the med kit's links are Sketchfab searches until the model page links are filled in; sound effects aren't credited (their sources aren't recorded).
- Getting caught on a flight of stairs plays the throw at floor height; sounds from other floors are only treated as far away (no multi-floor level in the game right now).
- Vite warns about bundle size (three.js ~730 kB). Harmless.

## Key code map
See `DEVELOPMENT.md`. Start with `game/src/engine/Game.ts` (wiring), `game/src/world/enemyAI.ts` (the monster) and `game/src/world/content/level01.ts` (the map and every prop in it).
