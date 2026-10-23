# Last Ward

A first-person horror game that runs in the browser, by NIKO GAME COLLECTION.

You wake up on the floor of Ward 13 at St. Brigid's hospital. The power is out and something called The Patient is walking the halls. To get out, you find three fuses, restart the generator and reach the exit door, which stays mag-locked until the power is back. You can't fight. You can hide, crouch, run and stay out of its sight.

Current version: 0.6.4. The full patch history is in `HANDOVER.md`.

## How the game works

- **The Patient** hunts you by sight and sound. It sees further when your flashlight is on and less well when you crouch. Walking makes some noise and running makes a lot; crouching is silent. When it spots you it screams, then charges.
- **It moves around.** It starts in one corner of the map and patrols that area. If it goes 35 seconds without spotting you, it disappears and turns up at another corner.
- **You have two lives.** The first time it catches you, it picks you up and throws you across the room. You black out, get up injured (red at the edges of the screen, grunting now and then) and it vanishes somewhere else. The second time is the end.
- **Fuses, batteries and notes** are shuffled across the tables every run. Batteries recharge the flashlight. Notes are left by people who were here before you, and reading one pauses the game.
- **Restarting the generator** turns the lights back on, but The Patient hears it. It screams, then sprints to the generator room, so don't stay there.

## Controls

| Action | Default |
|---|---|
| Move | W A S D |
| Look | Mouse |
| Run | Left Shift |
| Crouch (toggle) | Left Ctrl |
| Flashlight | Right click |
| Collect / interact | Left click |
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
Horror-Game/
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
```

Note texts and the notes pinned to walls sit in the same file. `tests/test-level.ts` checks that every level is playable: every place can be reached, there are enough fuses, and there are no more than 8 lamps.

## Assets

Raw files go in `ASSETS/` and are converted into `game/public/` with the scripts in `game/tools/`:

- **Characters:** Mixamo FBX files go through `node tools/convert-character.mjs`, which produces one `.glb` per character with all animations merged.
- **Sound:** `python tools/prepare-audio.py ../ASSETS/audio public/audio` (needs Python with numpy and scipy, plus ffmpeg).
- **Control icons:** `tools/prepare-input-icons.ts` recolours the Kenney input prompts to match the game. The whole Kenney pack sits in `ASSETS/UI - inputs/`, but `.gitignore` only uploads its licence and the 89 icons the game uses.

The READMEs inside `ASSETS/` list the file names each script expects.

## Debugging

Press F2 in game for the debug view: full lighting, The Patient's position and path, and an info panel. While it's open, F3 freezes The Patient.

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
