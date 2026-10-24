import { check, section } from './harness';
import { PLAYER, nextCrouch, addBattery, chooseGait, createPlayerStatus, fearLevel, flickerAmount, tickStatus, toggleFlashlight } from '../src/state/playerRules';
import { FUSES_NEEDED, createProgress, objectiveText, startGenerator, tryExit } from '../src/state/objectives';
import { DEFAULT_SETTINGS, defaultSave, formatTime, hydrateSave, mixVolumes, recordEscape } from '../src/state/settings';
import { findTarget } from '../src/world/interact';
import { guardLeave } from '../src/state/session';
import { LEVEL_01 } from '../src/world/content/level01';
import { cellCenter, itemPos, parseLevel } from '../src/world/level';
import { ENEMY, enemySpeed } from '../src/world/enemyAI';

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
  // Update 0.9.6.2 — adrenaline: while it chases you, your sprint lasts longer.
  const sprintFor = (chased: boolean) => {
    const a = createPlayerStatus();
    a.chased = chased;
    let t = 0;
    while (!a.exhausted && t < 30) {
      tickStatus(a, 'sprint', 0.05);
      t += 0.05;
    }
    return t;
  };
  check('0.9.6.2: a full sprint lasts 5.5 s', Math.abs(sprintFor(false) - 5.5) < 0.06, sprintFor(false).toFixed(2));
  check('0.9.6.2: while it chases you it drains 40% slower (~9.2 s)', PLAYER.adrenalineDrain === 0.6 && Math.abs(sprintFor(true) - 5.5 / 0.6) < 0.06, sprintFor(true).toFixed(2));
  // Its scream is your head start, then you pull away for the rest of the sprint (it was ~5 m before 0.9.6.2).
  const chase = enemySpeed({ mode: 'chase', rush: false, rage: FUSES_NEEDED * ENEMY.ragePerFuse });
  const lead = PLAYER.speed.sprint * ENEMY.windupSeconds + (PLAYER.speed.sprint - chase) * (sprintFor(true) - ENEMY.windupSeconds);
  check('0.9.6.2: every fuse found, a full sprint from its scream still puts 8 m between you', lead >= 8, `${lead.toFixed(1)} m`);
}

section('Battery');
{
  const s = createPlayerStatus();
  check('0.9.1: you start with the flashlight off, battery full', !s.flashlightOn && s.battery === PLAYER.batteryMax);
  toggleFlashlight(s);
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

section('Crouch toggle (Ctrl)');
{
  check('press crouches', nextCrouch(false, true, false, false) === true);
  check('stays crouched without pressing', nextCrouch(true, false, false, true) === true);
  check('press again stands up', nextCrouch(true, true, false, false) === false);
  check('sprinting while moving stands you up', nextCrouch(true, false, true, true) === false);
  check('holding Shift while still keeps the crouch', nextCrouch(true, false, true, false) === true);
  check('leaving mid-run asks first', guardLeave('playing') && guardLeave('paused') && !guardLeave('intro') && !guardLeave('over'));
}

section('Fear');
check('far + calm = 0', fearLevel(30, false) === 0);
check('chasing raises fear', fearLevel(30, true) > 0.3);
check('caps at 1', fearLevel(0, true) === 1);

section('Objectives');
{
  const p = createProgress();
  check('generator refuses before the panels are live (0.9)', startGenerator(p) === 'panels');
  check('exit locked without power', tryExit(p) === 'locked');
  p.fuses = FUSES_NEEDED;
  p.panels.forEach((x) => Object.assign(x, { fuse: true, fixed: true, on: true }));
  check('objective text updates', objectiveText(p).includes('generator'));
  check('generator powers up', startGenerator(p) === 'powered' && p.powered);
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
  // Update 0.9.2 — three volume sliders.
  const old = hydrateSave({ settings: { volume: 0.5 } });
  check('old saves keep their volume as master, SFX and BGM start full', old.settings.volume === 0.5 && old.settings.sfxVolume === 1 && old.settings.bgmVolume === 1);
  const bad = hydrateSave({ settings: { sfxVolume: 4, bgmVolume: 'loud' } });
  check('SFX / BGM clamped, junk falls back', bad.settings.sfxVolume === 1 && bad.settings.bgmVolume === DEFAULT_SETTINGS.bgmVolume);
  const mix = mixVolumes({ volume: 0.5, sfxVolume: 0.4, bgmVolume: 0 });
  check('menu sounds follow master × their slider', Math.abs(mix.uiSfx - 0.2) < 1e-9 && mix.menuBgm === 0 && mix.master === 0.5);
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

import { BREATH_LINE_MAX_PX, BREATH_LINE_MIN_PX, breathLineVisible, breathLineWidth } from '../src/state/hudLayout';

section('HUD meters');
check('breath line full width when rested', breathLineWidth(1) === BREATH_LINE_MAX_PX);
check('breath line shrinks to a dot when empty', breathLineWidth(0) === BREATH_LINE_MIN_PX);
check('breath line hidden when full, shown once used', !breathLineVisible(1) && breathLineVisible(0.9));
