# Player body (first person)

Mixamo character + animations. Converted with `game/tools/convert-character.mjs` into `game/public/models/player.glb`.

| File | Clip name in game |
|---|---|
| `player.fbx` | (the character) |
| `player_idle.fbx` | `idle` |
| `player_walk.fbx` | `walk` (In Place) |
| `player_run.fbx` | `run` (In Place) |
| `player_crouchWalk.fbx` | `crouch` (In Place) |
| `player_strafe_left.fbx` | `strafeLeft` (In Place, 0.5.3) |
| `player_strafe_right.fbx` | `strafeRight` (In Place, 0.5.3) |
| `player_getting_thrown.fbx` | `thrown` (0.6, caught sequence; flip 2.4 → 3.4 s) |
| `player_getting_up.fbx` | `getUp` (0.6, standing by ~5 s; 0.9.7: keeps its hip movement, `--keep-root=getUp`, so the hands stay planted) |
| `../player_injured/injured_idle.fbx`, `injured_walk.fbx`, `injured_run.fbx` | `injuredIdle`, `injuredWalk`, `injuredRun` (0.6) |

Re-convert after changing any of these (0.9.7: keep `--keep-root=getUp`; one clip alone: `--keep-root=getUp --add public/models/player.glb public/models/player.glb getUp=…`):
node tools/convert-character.mjs --keep-root=getUp ../ASSETS/models/player/player.fbx public/models/player.glb idle=../ASSETS/models/player/player_idle.fbx walk=../ASSETS/models/player/player_walk.fbx run=../ASSETS/models/player/player_run.fbx crouch=../ASSETS/models/player/player_crouchWalk.fbx strafeLeft=../ASSETS/models/player/player_strafe_left.fbx strafeRight=../ASSETS/models/player/player_strafe_right.fbx thrown=../ASSETS/models/player/player_getting_thrown.fbx getUp=../ASSETS/models/player/player_getting_up.fbx injuredIdle=../ASSETS/models/player_injured/injured_idle.fbx injuredWalk=../ASSETS/models/player_injured/injured_walk.fbx injuredRun=../ASSETS/models/player_injured/injured_run.fbx
