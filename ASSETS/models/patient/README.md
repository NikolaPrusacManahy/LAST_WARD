# The Patient (enemy)

Put the rigged enemy here. Mixamo FBX or GLB both work.

Suggested names (one file per animation is fine):

| File | Used when |
|---|---|
| `patient.fbx` | The character itself (with skin) |
| `patient_idle.fbx` | Standing still / idle between patrol points |
| `patient_walk.fbx` | Patrol (slow shamble) |
| `patient_walk_fast.fbx` | Investigating a noise (optional, else walk is sped up) |
| `patient_run.fbx` | Chasing you |
| `patient_search.fbx` | Looking around after losing you (optional) |
| `patient_scream.fbx` | Spotting you (optional) |
| `patient_attack.fbx` | The jumpscare when it catches you |
| `Patient_menu_stare.fbx` | Main menu only: standing, staring at the player (clip `stare`) |
| `Patient_grab.fbx` | First catch: grabs and lifts you (clip `grab`, 0.6) |
| `Patient_throw.fbx` | First catch: throws you behind it (clip `throw`, 0.6) |
| `Patient_crawl.fbx` | Crawling upside down on the corridor ceilings (clip `crawl`, 0.9.7) |
| `Patient_jump_to_changeMode.fbx` | Jumping up onto the ceiling, and backwards to drop down (clip `jumpUp`, 0.9.7) |

Mixamo tips: tick **In Place** for walk/run; download extra animations **Without Skin**; 30 fps is fine.

## 0.9.9: a new model

`Patient_Model.fbx` is now Nikola's new Mixamo character ("Ch30", 1.77 m). The animations are still the ones made on the old model (Mixamo "Parasite"): the converter fits them to the new body (it scales their hip movement by the new hips' height over the old: ×0.875; the poses are joint rotations, which fit any Mixamo body). In the game it's scaled 1.32×, about 2.33 m, as tall as the old one (`SCALE` in `game/src/engine/enemyModel.ts`).

Re-convert everything (from `game/`):
node tools/convert-character.mjs ../ASSETS/models/patient/Patient_Model.fbx public/models/patient.glb idle=../ASSETS/models/patient/Patient_idle.fbx walk=../ASSETS/models/patient/Patient_walking.fbx run=../ASSETS/models/patient/Patient_Running.fbx search=../ASSETS/models/patient/Patient_Search.fbx scream=../ASSETS/models/patient/Patient_scream.fbx attack=../ASSETS/models/patient/Patient_attack.fbx stare=../ASSETS/models/patient/Patient_menu_stare.fbx grab=../ASSETS/models/patient/Patient_grab.fbx throw=../ASSETS/models/patient/Patient_throw.fbx crawl=../ASSETS/models/patient/Patient_crawl.fbx jumpUp=../ASSETS/models/patient/Patient_jump_to_changeMode.fbx

A model of another height: change `SCALE` so it stands about 2.3 m. Animations re-downloaded on the new model fit best (no foot sliding); the old ones work as they are.
