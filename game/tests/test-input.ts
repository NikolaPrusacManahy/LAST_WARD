// Update 0.5 — rebindable controls, input icons, "Press [icon] to collect" prompts, controls card.
import { existsSync, readFileSync } from 'fs';
import { check, section } from './harness';
import { ACTIONS, DEFAULT_BINDINGS, codesFor, hydrateBindings, isBindable, rebind } from '../src/state/bindings';
import { allIconNames, glyphFor, sourceFileFor } from '../src/state/inputIcons';
import { CONTROLS_CARD_SECONDS, promptFor, samePrompt, tickControlsCard } from '../src/state/prompts';
import { createProgress } from '../src/state/objectives';
import { hydrateSave } from '../src/state/settings';
import { debugFlag, devToolsEnabled, showCredits } from '../src/state/devTools';
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
  check('hydrate: keeps valid custom keys', hydrateBindings({ ...d, flashlight: 'KeyG' }).flashlight === 'KeyG');
  // Update 0.9.9 — Ping is on F: an old save (no ping in it) with the flashlight already moved to F keeps
  // that, and Ping gets a free key instead.
  const { ping: _p, mute: _m, ...before099 } = { ...d, flashlight: 'KeyF' };
  const migrated = hydrateBindings(before099);
  check('old save with the flashlight on F: kept; Ping moves to a free key', migrated.flashlight === 'KeyF' && migrated.ping !== 'KeyF' && migrated.interact === d.interact);
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
  // The repo's .gitignore drops the unused part of the Kenney pack; every source icon must be let through.
  const ignore = readFileSync(new URL('../../.gitignore', import.meta.url), 'utf8').split(/\r?\n/);
  const notKept = [...new Set(allIconNames().map(sourceFileFor))].filter((f) => !ignore.includes(`!ASSETS/UI - inputs/Keyboard & Mouse/Vector/${f}`));
  check('.gitignore keeps every source icon the game uses (and the licence)', notKept.length === 0 && ignore.includes('!ASSETS/UI - inputs/License.txt'), notKept.join(', '));
}

section('Prompts (0.5)');
{
  const p = createProgress();
  const item = (kind: LevelItem['kind']): LevelItem => ({ id: `${kind}-0`, kind, cell: { col: 0, row: 0 } } as LevelItem);
  check('0.9.8: a fuse on a table: Press [icon] to pick up', promptFor({ type: 'loose', id: 1, kind: 'fuse' }, p, false)?.verb === 'pick up');
  check('0.9.8: a battery too', promptFor({ type: 'loose', id: 2, kind: 'battery' }, p, false)?.title === 'Battery');
  check('note: to read', promptFor({ type: 'item', item: item('note') }, p, false)?.verb === 'read');
  const gen = promptFor({ type: 'generator' }, p, false);
  check('generator before the panels: no key, says what it needs (0.9)', gen?.verb === null && gen.info === 'Dead. Restore the panels (0/4).');
  const live = { ...p, panels: p.panels.map((x) => ({ ...x, fuse: true, fixed: true, on: true })) };
  check('generator with all panels live: to start', promptFor({ type: 'generator' }, live, false)?.verb === 'start');
  check('exit without power: no key', promptFor({ type: 'exit' }, p, false)?.verb === null);
  check('exit with power: to interact', promptFor({ type: 'exit' }, { ...p, powered: true }, false)?.verb === 'interact');
  check('no prompt while a note is open', promptFor({ type: 'item', item: item('note') }, p, true) === null);
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

section('Look back (0.5.4)');
{
  const { LOOK_BACK, createLookBack, stepLookBack, lookBackTimeScale, lookBackYaw, hideBodyWhileLookingBack } = await import('../src/state/lookBack');
  check('Q by default, rebindable like the rest', DEFAULT_BINDINGS.lookBack === 'KeyQ' && ACTIONS.some((a) => a.id === 'lookBack'));
  const run = (s: ReturnType<typeof createLookBack>, sec: number, held: boolean, running: boolean) => {
    for (let i = 0; i < Math.round(sec * 60); i++) s = stepLookBack(s, 1 / 60, held, running);
    return s;
  };
  let s = run(createLookBack(), 0.3, true, true);
  check('holding Q while running turns the camera fully round', Math.abs(lookBackYaw(s) - Math.PI) < 1e-9);
  check('…hides your own body so it does not block the view', hideBodyWhileLookingBack(s));
  check('…and the first moment is slow motion', lookBackTimeScale(stepLookBack(createLookBack(), 1 / 60, true, true)) === LOOK_BACK.slowScale);
  check('slow motion lasts about half a second', LOOK_BACK.slowSeconds === 0.5 && lookBackTimeScale(run(createLookBack(), 0.55, true, true)) === 1);
  check('slow-mo eases back to full speed (no snap)', (() => { const x = run(createLookBack(), 0.42, true, true); const k = lookBackTimeScale(x); return k > LOOK_BACK.slowScale && k < 1; })());
  s = run(s, 0.3, false, true);
  check('letting go swings back to the front', lookBackYaw(s) === 0 && !hideBodyWhileLookingBack(s));
  check('does nothing while walking or standing', lookBackYaw(run(createLookBack(), 0.5, true, false)) === 0);
  check('stopping the run (out of breath) ends it', lookBackYaw(run(run(createLookBack(), 0.3, true, true), 0.3, true, false)) === 0);
  // Spam guard: a second look straight away turns the camera but doesn't slow time again.
  let spam = run(createLookBack(), 0.3, true, true);
  spam = run(spam, 0.3, false, true);
  spam = stepLookBack(spam, 1 / 60, true, true);
  check('slow motion has a 3 s cooldown (camera still turns)', lookBackTimeScale(spam) === 1 && spam.active && LOOK_BACK.cooldown === 3);
  check('…and works again after the cooldown', lookBackTimeScale(stepLookBack(run(spam, 3.1, false, true), 1 / 60, true, true)) === LOOK_BACK.slowScale);
  check('letting go mid slow-mo returns to full speed at once', lookBackTimeScale(stepLookBack(stepLookBack(createLookBack(), 1 / 60, true, true), 1 / 60, false, true)) === 1);
  // Old saves: a player who already put something on Q keeps it; Look back gets a free key.
  const old = { ...DEFAULT_BINDINGS, flashlight: 'KeyQ' } as Record<string, string>;
  delete old.lookBack;
  const h = hydrateBindings(old);
  check('old save with Q taken: keeps their Q, Look back gets a free key', h.flashlight === 'KeyQ' && h.lookBack !== 'KeyQ' && isBindable(h.lookBack));
  const old2 = { ...DEFAULT_BINDINGS } as Record<string, string>;
  delete old2.lookBack;
  check('old save without Look back gets Q', hydrateBindings(old2).lookBack === 'KeyQ');
}

section('Debug tools sealed in the public build (0.6.5)');
{
  check('F2 / F3 work in dev, not in the public build', devToolsEnabled(true) && !devToolsEnabled(false));
  check('?debug is ignored in the public build', debugFlag(true, '?debug') && !debugFlag(false, '?debug') && !debugFlag(true, ''));
  check('the credit screen always shows in the public build', showCredits(false, '?debug') && showCredits(false, ''));
  check('in dev, ?debug skips it and ?debug&credits shows it', !showCredits(true, '?debug') && showCredits(true, '?debug&credits') && showCredits(true, ''));
}
