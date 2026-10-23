# ASSETS — raw source files (not shipped)

Drop downloaded/raw files here. Claude converts them into `game/public/` (the only folder the game ships).
Never reference files in this folder from game code.

| Folder | What goes in it |
|---|---|
| `models/patient/` | The enemy: rigged character + its animations |
| `models/player_arms/` | First-person arms holding a flashlight + their animations |
| `models/props/`, `models/electrical/` | Sketchfab props (GLB). `node tools/prepare-props.mjs ../ASSETS/models public/models/props` (from `game/`); add a job to its `PLAN` and a credit to `src/state/credits.ts` for each new one |
| `audio/` | Sound effects, ambience, music (WAV/MP3/OGG) |
| `textures/` | Wall/floor/ceiling textures, decals (PNG/JPG) |
| `UI - inputs/` | Kenney Input Prompts (CC0). Only `Keyboard & Mouse/Vector` is used: `npx tsx tools/prepare-input-icons.ts "../ASSETS/UI - inputs/Keyboard & Mouse/Vector" public/ui/inputs` (from `game/`) |

Keep the original licence/credit info next to each file (a `CREDITS.txt` in the same folder), especially for Sketchfab downloads.
