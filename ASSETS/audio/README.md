# Audio (raw)

Raw sounds. `game/tools/prepare-audio.py` turns them into `game/public/audio/` (run from `game/`):

    python tools/prepare-audio.py ../ASSETS/audio public/audio

| File | Used for |
|---|---|
| `footSteps_player.mp3` | A take of several steps; cut into single steps |
| `footSteps_patient.mp3` | Same, for The Patient (3D) |
| `enemy_breath.mp3` | Loop following The Patient (3D) |
| `enemy_scream.mp3` | When it spots you (3D) + jumpscare |
| `heartbeat.mp3` | One lub-dub is cut out and played at fear-driven speed |
| `ambience.mp3` | Background loop |
| `generator_start.mp3`, `generator_hum.mp3` | Generator (hum loops, 3D) |
| `door_open.mp3`, `pickup.mp3`, `paper.mp3`, `flashlight_click.mp3` | One-shots |

Optional (still synthesised): `stinger`, chase music, distant clanks. Keep licence/credit info in `CREDITS.txt` here.
