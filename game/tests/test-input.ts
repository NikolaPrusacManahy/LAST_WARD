// Update 0.5 — rebindable controls, input icons, "Press [icon] to collect" prompts, controls card.
import { existsSync } from 'fs';
import { check, section } from './harness';
import { ACTIONS, DEFAULT_BINDINGS, codesFor, hydrateBindings, isBindable, rebind } from '../src/state/bindings';
import { allIconNames, glyphFor, sourceFileFor } from '../src/state/inputIcons';
import { CONTROLS_CARD_SECONDS, promptFor, samePrompt, tickControlsCard } from '../src/state/prompts';
import { createProgress } from '../src/state/objectives';
import { hydrateSave } from '../src/state/settings';
import type { LevelItem } from '../src/world/level';

section('Bindings (0.5)');
{
  const d = DEFAULT_BINDINGS;
  check('left click collects / interacts, right click is the flashlight', d.interact === 'Mouse0' && d.flashlight === 'Mouse2');
  check('WASD, Shift run, Ctrl crouch by default', d.forward === 'KeyW' && d.left === 'KeyA' && d.back === 'KeyS' && d.right === 'KeyD' && d.sprint === 'ShiftLeft' && d.crouch === 'ControlLeft');
  check('every action has a default', ACTIONS.every((a) => typeof d[a.id] === 'string'));
  const b = rebind(d, 'flashlight', 'KeyF');
  check('rebind a free key', b.flashlight === 'KeyF' && b.interact === 'Mouse0');
  const s = rebind(d, 'interact', 'Mouse2');
  check('rebinding onto a used key swaps the two', s.interact === 'Mouse2' && s.flashlight === 'Mouse0');
  check('Shift Left/Right clash counts as the same key', rebind(d, 'crouch', 'ShiftRight').sprint === 'ControlLeft');
  check('Esc / F2 / F3 / Win can never be bound', ['Escape', 'F2', 'F3', 'MetaLeft'].every((c) => !isBindable(c) && rebind(d, 'forward', c) === d));
  check('mouse side buttons can be bound', isBindable('Mouse3') && isBindable('Mouse4') && !isBindable('Mouse7'));
  check('either Shift / Ctrl works for the bound one', codesFor('ControlLeft').includes('ControlRight') && codesFor('KeyW').length === 1);
  check('hydrate: garbage → defaults', JSON.stringify(hydrateBindings('nope')) === JSON.stringify(d));
  check('hydrate: keeps valid custom keys', hydrateBindings({ ...d, flashlight: 'KeyF' }).flashlight === 'KeyF');
  check('hydrate: reserved / bad codes fall back per action', hydrateBindings({ ...d, flashlight: 'Escape', crouch: 42 }).flashlight === 'Mouse2');
  check('hydrate: duplicated keys → full reset', hydrateBindings({ ...d, back: 'KeyW' }).back === 'KeyS');
  const old = hydrateSave({ version: 1, settings: { sensitivity: 1.5 } });
  check('old saves without bindings get the defaults', old.settings.bindings.interact === 'Mouse0' && old.settings.sensitivity === 1.5);
  check('saved bindings survive a reload', hydrateSave(JSON.parse(JSON.stringify({ settings: { bindings: b } }))).settings.bindings.flashlight === 'KeyF');
}

section('Input icons (0.5)');
{
  check('left click → mouse_left icon', glyphFor('Mouse0').icon === 'mouse_left' && glyphFor('Mouse0').label === 'Left click');
  check('right click → mouse_right icon', glyphFor('Mouse2').icon === 'mouse_right');
  check('letters, digits, F-keys map to their icons', glyphFor('KeyW').icon === 'w' && glyphFor('Digit5').icon === '5' && glyphFor('F12').icon === 'f12');
  check('either Shift / Ctrl use the same icon', glyphFor('ShiftRight').icon === 'shift' && glyphFor('ControlLeft').icon === 'ctrl');
  check('keys without an icon get a text key cap', glyphFor('Numpad4').icon === null && glyphFor('Numpad4').label === 'Num 4');
  const dir = new URL('../public/ui/inputs/', import.meta.url);
  const missing = allIconNames().filter((n) => !existsSync(new URL(`${n}.svg`, dir)));
  check('every icon the game can show is in public/ui/inputs', missing.length === 0, missing.join(', '));
  check('every default binding has a real icon', ACTIONS.every((a) => glyphFor(DEFAULT_BINDINGS[a.id]).icon !== null));
  check('keys use the outline set, mice the filled set', sourceFileFor('w') === 'keyboard_w_outline.svg' && sourceFileFor('mouse_left') === 'mouse_left.svg');
}

section('Prompts (0.5)');
{
  const p = createProgress();
  const item = (kind: LevelItem['kind']): LevelItem => ({ id: `${kind}-0`, kind, cell: { col: 0, row: 0 } } as LevelItem);
  check('fuse: Press [icon] to collect', promptFor({ type: 'item', item: item('fuse') }, p, false)?.verb === 'collect');
  check('battery: to collect', promptFor({ type: 'item', item: item('battery') }, p, false)?.verb === 'collect');
  check('note: to read', promptFor({ type: 'item', item: item('note') }, p, false)?.verb === 'read');
  const gen = promptFor({ type: 'generator' }, p, false);
  check('generator without fuses: no key, says what it needs', gen?.verb === null && gen.info === 'Needs fuses (0/3)');
  check('generator with fuses: to interact', promptFor({ type: 'generator' }, { ...p, fuses: 3 }, false)?.verb === 'interact');
  check('exit without power: no key', promptFor({ type: 'exit' }, p, false)?.verb === null);
  check('exit with power: to interact', promptFor({ type: 'exit' }, { ...p, powered: true }, false)?.verb === 'interact');
  check('no prompt while a note is open', promptFor({ type: 'item', item: item('fuse') }, p, true) === null);
  check('no prompt with nothing in reach', promptFor(null, p, false) === null);
  check('same words compare equal (no HUD churn)', samePrompt({ title: 'Fuse', verb: 'collect' }, { title: 'Fuse', verb: 'collect' }));
}

section('Controls card (0.5)');
{
  check('shows for 10 s', CONTROLS_CARD_SECONDS === 10);
  let left = CONTROLS_CARD_SECONDS;
  for (let i = 0; i < 9 * 60; i++) left = tickControlsCard(left, 1 / 60, false);
  check('still up after 9 s', left > 0.9 && left < 1.1);
  for (let i = 0; i < 2 * 60; i++) left = tickControlsCard(left, 1 / 60, false);
  check('gone after 10 s', left === 0);
  check('Enter closes it right away', tickControlsCard(7, 1 / 60, true) === 0);
}
