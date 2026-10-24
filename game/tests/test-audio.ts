// Update 0.4 — the prepared sound files exist, are listed in the manifest, and stay small.
import { existsSync, readFileSync, statSync } from 'fs';
import { check, section } from './harness';

section('Sound files');
const dir = new URL('../public/audio/', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('manifest.json', dir), 'utf8')) as Record<string, string[]>;
const expected = ['step_player', 'step_patient', 'heartbeat', 'ambience', 'enemy_breath', 'generator_hum', 'generator_start', 'door_open', 'enemy_scream', 'pickup', 'paper', 'flashlight_click', 'caught', 'thrown', 'floor_impact', 'grunt', 'fuse_insert', 'repair_loop', 'skill_check_warning', 'skill_check_good', 'skill_check_great', 'panel_explode', 'breaker_switch', 'night_vision_on', 'locker_enter', 'locker_peek', 'brick_impact', 'bottle_break', 'run_breath', 'wake_up'];
check('every sound the engine asks for is in the manifest', expected.every((k) => manifest[k]?.length));
check('every listed file exists', Object.values(manifest).flat().every((f) => existsSync(new URL(f, dir))));
check('footsteps have several variants', manifest.step_player.length >= 4 && manifest.step_patient.length >= 4);
const total = Object.values(manifest).flat().reduce((n, f) => n + statSync(new URL(f, dir)).size, 0);
check('all sound under 5 MB', total < 5 * 1024 * 1024, `${(total / 1048576).toFixed(1)} MB`);
// 0.9.6.1 — mono files are 96 kb/s, so the size gives the length.
const wakeSeconds = (statSync(new URL('wake_up.mp3', dir)).size * 8) / 96000;
check('0.9.6.1: wake_up.mp3 is as long as WAKE_SOUND says', Math.abs(wakeSeconds - WAKE_SOUND.length) < 0.2, `${wakeSeconds.toFixed(2)} s`);

import { ENEMY_STEP_GAIN, FLASHLIGHT_CLICK_GAIN, NIGHT_VISION_SFX_GAIN, PANEL_SFX_GAIN, PLAYER_STEP_GAIN, RUN_BREATH_GAIN, SPOT_SCREAM_GAIN, enemyMix, enemyStepGain } from '../src/audio/spatial';
import { WAKE_SOUND } from '../src/state/wakeSequence';

section('Enemy sound in 3D');
check('enemy steps are half as loud', ENEMY_STEP_GAIN === 0.5);
check('flashlight click half as loud; player steps 0.3 (0.9.1: 40% down again)', PLAYER_STEP_GAIN === 0.3 && FLASHLIGHT_CLICK_GAIN === 0.5);
check('0.9.1: panel sounds 60% quieter, spotted scream 40% quieter', PANEL_SFX_GAIN === 0.4 && SPOT_SCREAM_GAIN === 0.6);
check('0.9.3: night vision deploy sound 80% quieter', NIGHT_VISION_SFX_GAIN === 0.2);
check('0.9.6.1: your breathing while you sprint at half volume', RUN_BREATH_GAIN === 0.5);
check('close + in sight = bright and full', enemyMix(1, false).cutoff > 14000 && enemyMix(1, false).gain === 1);
check('far away = darker', enemyMix(20, false).cutoff < enemyMix(5, false).cutoff);
check('behind a wall = muffled and quieter', enemyMix(5, true).cutoff <= 750 && enemyMix(5, true).gain < 1);
check('0.9.4: steps through a wall follow the wall loss (no more 1.5× boost)', Math.abs(enemyStepGain(true, enemyMix(5, true)) - ENEMY_STEP_GAIN * enemyMix(5, true).gain) < 1e-12);
check('steps in the open unchanged', enemyStepGain(true, enemyMix(5, false)) === ENEMY_STEP_GAIN);
check('never brighter than open air', enemyMix(40, true).cutoff <= enemyMix(40, false).cutoff);

import { HOVER_GAP_MS, hoverAllowed } from '../src/audio/uiSounds';

section('Menu sounds');
check('first hover plays', hoverAllowed(-Infinity, 0));
check('rapid sweeps are thinned out', !hoverAllowed(1000, 1000 + HOVER_GAP_MS - 1) && hoverAllowed(1000, 1000 + HOVER_GAP_MS));
