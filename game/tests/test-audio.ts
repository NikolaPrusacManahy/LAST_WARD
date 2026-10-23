// Update 0.4 — the prepared sound files exist, are listed in the manifest, and stay small.
import { existsSync, readFileSync, statSync } from 'fs';
import { check, section } from './harness';

section('Sound files');
const dir = new URL('../public/audio/', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('manifest.json', dir), 'utf8')) as Record<string, string[]>;
const expected = ['step_player', 'step_patient', 'heartbeat', 'ambience', 'enemy_breath', 'generator_hum', 'generator_start', 'door_open', 'enemy_scream', 'pickup', 'paper', 'flashlight_click'];
check('every sound the engine asks for is in the manifest', expected.every((k) => manifest[k]?.length));
check('every listed file exists', Object.values(manifest).flat().every((f) => existsSync(new URL(f, dir))));
check('footsteps have several variants', manifest.step_player.length >= 4 && manifest.step_patient.length >= 4);
const total = Object.values(manifest).flat().reduce((n, f) => n + statSync(new URL(f, dir)).size, 0);
check('all sound under 5 MB', total < 5 * 1024 * 1024, `${(total / 1048576).toFixed(1)} MB`);

import { ENEMY_STEP_GAIN, FLASHLIGHT_CLICK_GAIN, OCCLUDED_STEP_BOOST, PLAYER_STEP_GAIN, enemyMix, enemyStepGain } from '../src/audio/spatial';

section('Enemy sound in 3D');
check('enemy steps are half as loud', ENEMY_STEP_GAIN === 0.5);
check('player steps and flashlight click are half as loud', PLAYER_STEP_GAIN === 0.5 && FLASHLIGHT_CLICK_GAIN === 0.5);
check('close + in sight = bright and full', enemyMix(1, false).cutoff > 14000 && enemyMix(1, false).gain === 1);
check('far away = darker', enemyMix(20, false).cutoff < enemyMix(5, false).cutoff);
check('behind a wall = muffled and quieter', enemyMix(5, true).cutoff <= 750 && enemyMix(5, true).gain < 1);
check('steps through a wall are 1.5× louder than before', Math.abs(enemyStepGain(true, enemyMix(5, true)) - ENEMY_STEP_GAIN * enemyMix(5, true).gain * OCCLUDED_STEP_BOOST) < 1e-12 && OCCLUDED_STEP_BOOST === 1.5);
check('steps in the open unchanged', enemyStepGain(true, enemyMix(5, false)) === ENEMY_STEP_GAIN);
check('never brighter than open air', enemyMix(40, true).cutoff <= enemyMix(40, false).cutoff);

import { HOVER_GAP_MS, hoverAllowed } from '../src/audio/uiSounds';

section('Menu sounds');
check('first hover plays', hoverAllowed(-Infinity, 0));
check('rapid sweeps are thinned out', !hoverAllowed(1000, 1000 + HOVER_GAP_MS - 1) && hoverAllowed(1000, 1000 + HOVER_GAP_MS));
