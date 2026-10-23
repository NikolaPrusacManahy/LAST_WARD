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
