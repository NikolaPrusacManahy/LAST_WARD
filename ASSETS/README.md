# ASSETS — raw source files (not shipped)

Drop downloaded/raw files here. Claude converts them into `game/public/` (the only folder the game ships).
Never reference files in this folder from game code.

| Folder | What goes in it |
|---|---|
| `models/patient/` | The enemy: rigged character + its animations |
| `models/player_arms/` | First-person arms holding a flashlight + their animations |
| `audio/` | Sound effects, ambience, music (WAV/MP3/OGG) |
| `textures/` | Wall/floor/ceiling textures, decals (PNG/JPG) |

Keep the original licence/credit info next to each file (a `CREDITS.txt` in the same folder), especially for Sketchfab downloads.
