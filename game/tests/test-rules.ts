import { check, section } from './harness';
import { PLAYER, addBattery, chooseGait, createPlayerStatus, fearLevel, flickerAmount, tickStatus, toggleFlashlight } from '../src/state/playerRules';
import { FUSES_NEEDED, createProgress, objectiveText, activateGenerator, tryExit } from '../src/state/objectives';
import { DEFAULT_SETTINGS, defaultSave, formatTime, hydrateSave, recordEscape } from '../src/state/settings';
import { findTarget } from '../src/world/interact';
import { LEVEL_01 } from '../src/world/content/level01';
import { cellCenter, itemPos, parseLevel } from '../src/world/level';

section('Stamina');
{
  const s = createPlayerStatus();
  for (let t = 0; t < PLAYER.staminaMax + 0.1; t += 0.05) tickStatus(s, 'sprint', 0.05);
  check('sprinting drains to empty', s.stamina === 0 && s.exhausted);
  check('exhausted → cannot sprint', chooseGait(true, true, false, s) === 'walk');
  for (let t = 0; t < 4; t += 0.05) tickStatus(s, 'walk', 0.05);
  check('recovers after rest', !s.exhausted && s.stamina > PLAYER.staminaUnlock);
  check('crouch beats sprint', chooseGait(true, true, true, s) === 'crouch');
  check('idle when not moving', chooseGait(false, true, false, s) === 'idle');
}

section('Battery');
{
  const s = createPlayerStatus();
  for (let t = 0; t < 200; t += 0.1) tickStatus(s, 'idle', 0.1);
  check('drains and switches off', s.battery === 0 && !s.flashlightOn);
  check('cannot turn on when empty', !toggleFlashlight(s) && !s.flashlightOn);
  addBattery(s);
  check('battery pickup adds charge', s.battery === PLAYER.batteryPickup);
  addBattery(s);
  addBattery(s);
  check('battery caps at max', s.battery === PLAYER.batteryMax);
  check('no flicker when healthy', flickerAmount(80) === 0);
  check('flicker when low', flickerAmount(5) > 0.5);
}

section('Fear');
check('far + calm = 0', fearLevel(30, false) === 0);
check('chasing raises fear', fearLevel(30, true) > 0.3);
check('caps at 1', fearLevel(0, true) === 1);

section('Objectives');
{
  const p = createProgress();
  check('generator refuses without fuses', activateGenerator(p) === 'need-fuses');
  check('exit locked without power', tryExit(p) === 'locked');
  p.fuses = FUSES_NEEDED;
  check('objective text updates', objectiveText(p).includes('generator'));
  check('generator powers up', activateGenerator(p) === 'powered' && p.powered);
  check('exit opens with power', tryExit(p) === 'escaped' && p.escaped);
}

section('Saves');
{
  check('garbage → defaults', JSON.stringify(hydrateSave('nope')) === JSON.stringify(defaultSave()));
  const h = hydrateSave({ settings: { sensitivity: 99, volume: -1 }, escapes: 2 });
  check('clamps settings', h.settings.sensitivity === 3 && h.settings.volume === 0);
  check('fills missing fields', h.settings.grain === DEFAULT_SETTINGS.grain && h.bestTime === null && h.escapes === 2);
  const r = recordEscape(recordEscape(defaultSave(), 300), 200);
  check('best time keeps the fastest', r.bestTime === 200 && r.escapes === 2);
  check('formats time', formatTime(125.7) === '2:05');
  check('FOV defaults to 72', defaultSave().settings.fov === 72 && hydrateSave({ settings: {} }).settings.fov === 72);
  check('FOV clamps to 60–100', hydrateSave({ settings: { fov: 20 } }).settings.fov === 60 && hydrateSave({ settings: { fov: 140 } }).settings.fov === 100);
  check('FOV keeps a valid value', hydrateSave({ settings: { fov: 90 } }).settings.fov === 90);
}

section('Interaction');
{
  const level = parseLevel(LEVEL_01);
  const fuse = level.items.find((i) => i.kind === 'fuse')!;
  const c = itemPos(level, fuse.cell);
  // Stand 1.5 m out from the cabinet, looking at it.
  const at = { x: c.x + c.face.x * 1.5, z: c.z + c.face.z * 1.5 };
  const look = { x: -c.face.x, z: -c.face.z };
  const t = findTarget(level, at, look, []);
  check('targets item in front', t?.type === 'item' && t.item.id === fuse.id);
  check('ignores item behind', findTarget(level, at, c.face, []) === null);
  check('ignores collected item', findTarget(level, at, look, [fuse.id]) === null);
  const ex = cellCenter(level.exit);
  const te = findTarget(level, { x: ex.x - 3 + 0.4, z: ex.z }, { x: 1, z: 0 }, []);
  check('exit reachable from next tile', te?.type === 'exit');
}
