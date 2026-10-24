# Last Ward

A first-person horror game that runs in the browser, by NIKO GAME COLLECTION.

You wake up on the floor of Ward 13 at St. Brigid's hospital. The power is out and something called The Patient is walking the halls. To get out, you find four fuses, bring four electrical panels back to life, restart the generator and reach the exit door, which stays mag-locked until the power is back. You can't fight. You can hide, crouch, run and stay out of its sight.

Current version: 0.9.6.1. The full patch history is in `HANDOVER.md`.

## How the game works

- **The Patient** hunts you by sight and sound. It sees further when your flashlight is on or you run, and less well when you crouch. Shine your flashlight on it and it knows where you are at once. Walking makes some noise and running makes a lot; crouching is silent. When it spots you it screams, then charges.
- **It moves around.** It starts in one corner of the map and patrols that area. If it goes 35 seconds without spotting you, it disappears and turns up at another corner.
- **You have two lives.** The first time it catches you, it picks you up and throws you across the room. You black out, get up injured (red at the edges of the screen, grunting now and then) and it vanishes somewhere else. The second time is the end.
- **Fuses, batteries and notes** are shuffled across the tables every run. Batteries recharge the flashlight, which starts switched off. Notes are left by people who were here before you, and reading one pauses the game.
- **Electrical panels** are spread across the ward, one in each quarter. Fit a fuse, hold to repair the panel, then throw its switch. While you repair, skill checks come up: a circle with a needle sweeping round it. Press Space while the needle is in the marked zone (the white slice at its start is a perfect hit). Miss and the panel blows, loud enough for The Patient to hear.
- **Bricks and bottles** lie in the halls. Pick one up and press Space to throw it: The Patient runs to the noise, so you can send it away from you. A bottle smashes on the first throw; a brick breaks in half and lasts one more. If you're close to where it lands, it will come for you instead.
- **Lockers** are spread around the ward. Step into one and you're hidden, as long as The Patient didn't see you get in. If it did, it will drag you out. When it loses you it checks the lockers nearby. Hold Space and W to ease the door open and peek.
- **Restarting the generator** needs all four panels live. It turns the lights back on, but The Patient hears it. It screams, then sprints to the generator room, so don't stay there.

## Difficulty

Picked each time you press Begin:

- **Easy:** night vision goggles instead of the flashlight (right click). Everything turns green and you can see The Patient from far away.
- **Normal:** the game as designed.
- **Hard:** the battery lasts 40% less and you have one life.

## Controls

| Action | Default |
|---|---|
| Move | W A S D |
| Look | Mouse |
| Run | Left Shift |
| Crouch (toggle) | Left Ctrl |
| Flashlight | Right click |
| Collect / interact | Left click |
| Skill check / throw | Space |
| Peek out of a locker | Hold Space + W |
| Look back (hold while running) | Q |
| Pause | Esc |

Everything except Look and Pause can be rebound in Settings. Full screen (F11) and headphones are recommended.

## Running it

You need Node.js 24 (the version is pinned in `game/.nvmrc`).

On Windows, double-click `START_GAME.bat`. The first time, it installs the dependencies, then it starts the game and opens it in your browser. Leave that window open while you play; saving a file reloads the game.

Or from a terminal:

```
cd game
npm install
npm run dev
```

The game runs at http://localhost:5173.

## Commands

Run these from `game/`:

| Command | What it does |
|---|---|
| `npm run dev` | Development server with live reload |
| `npm test` | Runs the rule tests |
| `npm run verify:quick` | Type check plus tests |
| `npm run verify` | Type check, tests and a production build. Run this before committing. |
| `npm run build` | Production build into `game/dist/` |
| `npm run preview` | Serves the production build locally |

## Project layout

```
LAST_WARD/
  START_GAME.bat     starts the game on Windows
  HANDOVER.md        current version, patch notes, known issues
  DEVELOPMENT.md     which file owns what
  ASSETS/            raw models, sounds and icons (source files, not shipped)
  game/
    public/          what the game loads at runtime: models, audio, UI images
    src/
      state/         game rules with no 3D or UI code: stamina, battery, objectives, timelines
      world/         the level grid, collision, pathfinding, line of sight, The Patient's AI
      world/content/ the level map and note texts
      engine/        three.js side: the Game class, level meshes, characters, camera, lights, effects
      audio/         sound playback (Web Audio)
      screens/       React screens: main menu, HUD, pause menu, settings, end screen
      ui/theme/      CSS, split into numbered files
    tests/           one test file per area, all run by run-all.ts
    tools/           scripts that convert raw assets into game-ready files
```

The rules in `state/` and `world/` are plain functions with no three.js, React or browser code. That keeps them testable: the tests run them directly and check the results. The `engine/` code only draws what the rules decide.

## Levels

A level is a text map in `game/src/world/content/`, one character per 3 m square:

```
#  wall           .  floor
P  player start   E  enemy start
F  fuse           B  battery        N  note
G  generator      X  exit door      L  ceiling lamp
^ v < >  stairs going up in that direction
o  the stairwell, on the floor above a flight of stairs
```

A level can have several floors: one map per floor, ground floor first, all the same size. A flight of stairs is a straight line of arrows on the lower floor, with walls on both sides and a wall past the top step (the landing upstairs sits over it). The floor above marks the same cells with `o`. The game checks these rules when the level loads and says what's wrong.

Note texts, the notes pinned to walls, the intro text and any changes to how The Patient behaves sit in the same file. The levels are played in the order listed in `levels.ts`; right now that's just the hospital. `tests/test-level.ts` checks that it's playable: every place can be reached, there are enough fuses, and there are no more than 8 lamps. `tests/test-floors.ts` checks the stairs on a small two-floor test map.

## Assets

Raw files go in `ASSETS/` and are converted into `game/public/` with the scripts in `game/tools/`:

- **Characters:** Mixamo FBX files go through `node tools/convert-character.mjs`, which produces one `.glb` per character with all animations merged.
- **Props:** Sketchfab models in `ASSETS/models/props/` and `ASSETS/models/electrical/` go through `node tools/prepare-props.mjs ../ASSETS/models public/models/props`. It cuts out the parts the game uses, scales them to metres and shrinks their textures. Where each prop stands is set in the level file. The locker has its own script, `node tools/prepare-locker.mjs ../ASSETS/models/locker/locker.glb public/models/props/locker.glb`, which also cuts its door free so it can swing.
- **Sound:** `python tools/prepare-audio.py ../ASSETS/audio public/audio` (needs Python with numpy and scipy, plus ffmpeg).
- **Control icons:** `tools/prepare-input-icons.ts` recolours the Kenney input prompts to match the game. The whole Kenney pack sits in `ASSETS/UI - inputs/`, but `.gitignore` only uploads its licence and the 89 icons the game uses.

The READMEs inside `ASSETS/` list the file names each script expects. Every asset made by someone else is credited on the in-game Credits screen (`game/src/state/credits.ts`).

## Debugging

The debug tools only work when the game runs from the dev server (`START_GAME.bat` or `npm run dev`). The public build made by `npm run build` has them switched off, so players can't open them.

Press F2 in game for the debug view: full lighting, The Patient's position and path, and an info panel. While it's open, F3 freezes The Patient.

When there's more than one level, the main menu shows a tester panel in the top-right corner (local runs only) to pick which level Begin starts on; `?level=N` in the address does the same.

Adding `?debug` to the address skips the credit screen and gives the browser console a `window.__lastWard` object with helpers for moving the player and The Patient.

## Publishing

The game is a static site, set up for Netlify in `game/netlify.toml`. Netlify runs `npm run build` and publishes `game/dist/`. The live site only changes after a fresh build.

## Built with

- Vite, React 18 and TypeScript
- three.js for the 3D world and post-processing
- Web Audio API for sound, including 3D positional audio

## Credits

- Game by NIKO GAME COLLECTION
- Character animations from Mixamo
- Input prompt icons by Kenney (www.kenney.nl), CC0
