# Player body (first person)

Mixamo character + animations. Converted with `game/tools/convert-character.mjs` into `game/public/models/player.glb`.

| File | Clip name in game |
|---|---|
| `player.fbx` | (the character) |
| `player_idle.fbx` | `idle` |
| `player_walk.fbx` | `walk` (In Place) |
| `player_run.fbx` | `run` (In Place) |
| `player_crouchWalk.fbx` | `crouch` (In Place) |

Re-convert after changing any of these:
node tools/convert-character.mjs ../ASSETS/models/player/player.fbx public/models/player.glb idle=../ASSETS/models/player/player_idle.fbx walk=../ASSETS/models/player/player_walk.fbx run=../ASSETS/models/player/player_run.fbx crouch=../ASSETS/models/player/player_crouchWalk.fbx
