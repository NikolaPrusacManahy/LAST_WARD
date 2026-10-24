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
| `player_caught/caught_SFX.mp3`, `thrown_sfx.mp3`, `floor_impact_sfx.mp3` | First catch: grabbed, your scream while thrown, hitting the floor (0.6) |
| `player_grunt.mp3` | Injured grunt every 15–25 s (0.6.1) |
| `player_running_breathing.mp3` | Your breathing while you sprint, looped at half volume (0.9.6.1) |
| `player_intro_wakingUp.mp3` | The wake-up at the start of a run: a gasp as your eyes open, then getting up (0.9.6.1; replaced the 1 s grunt) |

Optional (still synthesised): `ui_hover.mp3`, `ui_click.mp3` (menu sounds), `stinger`, chase music, distant clanks. Keep licence/credit info in `CREDITS.txt` here.
