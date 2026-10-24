// Update 0.9.8 — three item slots, using what's in your hand, dropping it, the med kit; and The Patient no
// longer searching (and checking your locker) after it loses you.
import { existsSync } from 'fs';
import { check, section } from './harness';
import { LEVEL_01 } from '../src/world/content/level01';
import { cellCenter, dist, floorCells, itemPos, parseLevel } from '../src/world/level';
import { lockerSpots, propFront } from '../src/world/props';
import { ENEMY, EnemyEvent, LockerSpot, createEnemy, litByBeam, stepEnemy, visibility } from '../src/world/enemyAI';
import { overlapsWall } from '../src/world/collision';
import { createRng } from '../src/world/rng';
import { findTarget } from '../src/world/interact';
import { MEDKIT_SECONDS, SLOTS, createInventory, dropSpot, inHand, isFull, remove, selectSlot, store } from '../src/state/inventory';
import { TABLE_TOP, spawnTableItems, throwableTitle } from '../src/state/throwables';
import { EMPTY_HANDS, promptFor } from '../src/state/prompts';
import { createProgress } from '../src/state/objectives';
import { ACTIONS, isBindable } from '../src/state/bindings';
import { CREDITS } from '../src/state/credits';

const level = parseLevel(LEVEL_01);
const at = (col: number, row: number) => cellCenter({ col, row });

section('Three slots (0.9.8)');
{
  let inv = createInventory();
  check('three empty slots, your hand on slot 1, empty hands', SLOTS === 3 && inv.slots.length === 3 && inv.selected === 0 && inHand(inv) === null);
  let r = store(inv, 10);
  inv = r.inv;
  check('picking something up: into slot 1, and it\'s in your hand', r.slot === 0 && inHand(inv) === 10);
  inv = selectSlot(inv, 1);
  check('key 2: an empty slot, so empty hands (the brick stays in slot 1)', inHand(inv) === null && inv.slots[0] === 10);
  r = store(inv, 11);
  inv = r.inv;
  check('picking up again: into slot 2, where your hand is', r.slot === 1 && inHand(inv) === 11);
  inv = selectSlot(inv, 0);
  check('key 1: the first one back in your hand', inHand(inv) === 10);
  inv = selectSlot(inv, 0);
  check('key 1 again: put away (empty hands, still in its slot)', inHand(inv) === null && inv.stowed && inv.slots[0] === 10);
  r = store(inv, 12);
  inv = r.inv;
  check('put away and picking up: into the free slot, your hands stay empty', r.slot === 2 && inHand(inv) === null);
  check('three things: full', isFull(inv) && store(inv, 13).slot === -1);
  inv = selectSlot(inv, 0);
  check('…and with all three full you can still put one away to use your hands', inHand(inv) === 10 && inHand(selectSlot(inv, 0)) === null);
  inv = remove(inv, 10);
  check('thrown / used / dropped: its slot empties, your hand stays on it (empty hands)', inv.slots[0] === null && inHand(inv) === null && inv.selected === 0);
}

section('Dropping (0.9.8)');
{
  const open = at(12, 5); // the top hall
  const p = dropSpot(level, open, { x: 1, z: 0 });
  check('in the open: on the floor a step in front of you', Math.abs(p.x - open.x - 0.7) < 1e-9 && Math.abs(p.z - open.z) < 1e-9);
  const wall = { x: open.x, z: 15.2 }; // right against the hall's north wall
  const q = dropSpot(level, wall, { x: 0, z: -1 });
  check('facing a wall right there: at your feet', q.x === wall.x && q.z === wall.z);
}

section('What lies on the tables (0.9.8)');
{
  const items = spawnTableItems(level, 1000);
  const count = (k: string) => items.filter((x) => x.kind === k).length;
  check('four fuses, five batteries and two med kits lie on the tables (notes stay notes)', count('fuse') === 4 && count('battery') === 5 && count('medkit') === 2 && items.length === 11);
  check('15 item tables in all (3 more in 0.9.8)', level.items.length === 15);
  const spots = level.items.filter((i) => i.kind !== 'note').map((i) => itemPos(level, i.cell));
  check('each on its table top', items.every((x, k) => x.pos.y === TABLE_TOP && Math.abs(x.pos.x - spots[k].x) < 1e-9 && Math.abs(x.pos.z - spots[k].z) < 1e-9));
  check('numbered after the bricks and bottles', items.every((x) => x.id >= 1000));
  check('two med kits in Ward 13, so you\'re likelier to find one early', level.items.filter((i) => i.kind === 'medkit').length === 2);
  const fuse = items.find((x) => x.kind === 'fuse')!;
  const t = itemPos(level, level.items.find((i) => i.kind === 'fuse')!.cell);
  const look = findTarget(level, { x: t.x + t.face.x * 1.5, z: t.z + t.face.z * 1.5 }, { x: -t.face.x, z: -t.face.z }, [], [{ id: fuse.id, kind: 'fuse', pos: fuse.pos }]);
  check('looking at a fuse on a table: something to pick up', look?.type === 'loose' && look.kind === 'fuse' && promptFor(look, createProgress(), false)?.verb === 'pick up');
  check('…not a table item any more (only notes are)', findTarget(level, { x: t.x + t.face.x * 1.5, z: t.z + t.face.z * 1.5 }, { x: -t.face.x, z: -t.face.z }, [])?.type !== 'item');
  check('the med kit is called a med kit', throwableTitle({ kind: 'medkit', throws: 0 }) === 'Med kit');
}

section('Using what\'s in your hand (0.9.8)');
{
  const p = createProgress();
  const hand = (kind: 'brick' | 'bottle' | 'fuse' | 'battery' | 'medkit', extra = {}) => ({ ...EMPTY_HANDS, kind, ...extra });
  check('a brick: Press [left click] to throw it (left click now, not Space)', promptFor(null, p, false, hand('brick'))?.verb === 'throw it');
  check('a battery: to load it', promptFor(null, p, false, hand('battery'))?.verb === 'load it');
  check('…your light already full: says so', promptFor(null, p, false, hand('battery', { batteryFull: true }))?.info === 'Your light is full.');
  const med = promptFor(null, p, false, hand('medkit', { injured: true }));
  check('a med kit, injured: Hold [left click] to patch yourself up', med?.verb === 'patch yourself up' && med.hold === true);
  check('…for 5 seconds', MEDKIT_SECONDS === 5);
  check('…not hurt: nothing to patch', promptFor(null, p, false, hand('medkit'))?.info === 'You\'re not hurt.');
  check('a fuse, looking at a panel that needs one: to fit the fuse', promptFor({ type: 'panel', index: 0 }, p, false, hand('fuse'))?.verb === 'fit the fuse');
  check('…looking anywhere else: fit it in a panel', promptFor({ type: 'locker', index: 0 }, p, false, hand('fuse'))?.info === 'Fit it in an electrical panel.');
  check('with something in your hand, left click uses it, not the locker in front of you', promptFor({ type: 'locker', index: 0 }, p, false, hand('brick'))?.verb === 'throw it');
  check('empty hands: interact as before', promptFor({ type: 'locker', index: 0 }, p, false)?.verb === 'hide');
}

section('Keys and credits (0.9.8)');
{
  check('1, 2 and 3 pick your slot: nothing else can be bound to them', ['Digit1', 'Digit2', 'Digit3', 'Numpad1', 'Numpad2', 'Numpad3'].every((k) => !isBindable(k)));
  check('Space: skill check and drop', ACTIONS.find((a) => a.id === 'skillCheck')?.label === 'Skill check / drop');
  check('the med kit model is converted', existsSync(new URL('../public/models/props/medkit.glb', import.meta.url)));
  check('…and credited (CC BY: title, author, licence, link)', CREDITS.some((c) => c.id === 'medkit' && c.author === '3dmodelsst' && !!c.source));
}

section('No more going back and forth where it lost you (0.9.8)');
{
  // Where it lost you is near the edge of a cell (in front of a locker, by a wall), and it comes in
  // from the far side of that cell. It used to re-plan every 0.4 s back to the cell's middle and never
  // get there (494 of these 620 cases), going left and right until it saw you again.
  const away = { pos: { x: -100, z: -100 }, flashlightOn: false, crouching: true };
  let tries = 0;
  let stuck = 0;
  let slowest = 0;
  for (const c of floorCells(level)) {
    for (const [dx, dz] of [[1.2, 0], [-1.2, 0], [0, 1.2], [0, -1.2]]) {
      const mid = cellCenter(c);
      const last = { x: mid.x + dx, z: mid.z + dz };
      const start = { x: mid.x - dx * 0.9, z: mid.z - dz * 0.9 };
      if (overlapsWall(level, last, 0.3) || overlapsWall(level, start, 0.55)) continue;
      const e = createEnemy(level);
      Object.assign(e, { pos: start, mode: 'chase', alert: 1, sinceSeen: 5, lastKnown: last, crawlCooldown: 1e9 });
      const rng = createRng(1);
      let t = 0;
      let lost = false;
      for (let i = 0; i < 15 * 60 && !lost; i++) {
        lost = stepEnemy(level, e, { dt: 1 / 60, player: away, noise: null, fuses: 0 }, rng).includes('lost');
        t += 1 / 60;
      }
      tries++;
      if (!lost) stuck++;
      slowest = Math.max(slowest, t);
    }
  }
  check(`it gets there and gives up the chase every time (${tries} spots by walls and lockers)`, stuck === 0 && slowest < 2, `${stuck} stuck, slowest ${slowest.toFixed(1)} s`);
  // And a safety net: 10 s after losing sight of you, it gives up wherever it is.
  const far = createEnemy(level);
  Object.assign(far, { pos: at(1, 5), mode: 'chase', alert: 1, sinceSeen: 1.3, lastKnown: at(23, 17), crawlCooldown: 1e9 });
  let gaveUp = -1;
  for (let i = 0; i < 20 * 60 && gaveUp < 0; i++) if (stepEnemy(level, far, { dt: 1 / 60, player: away, noise: null, fuses: 0 }, createRng(2)).includes('lost')) gaveUp = i / 60;
  check('a long way to go: it gives up 10 s after losing sight of you at most', gaveUp > 0 && gaveUp <= ENEMY.giveUpSeconds + 0.1, `${gaveUp.toFixed(1)} s`);
}

section('From behind, it doesn\'t notice you (0.9.8)');
{
  const e = createEnemy(level);
  e.pos = at(12, 5);
  e.dir = { x: 1, z: 0 };
  const behind = (d: number) => ({ pos: { x: e.pos.x - d, z: e.pos.z }, flashlightOn: true, crouching: false, running: true, facing: { x: 1, z: 0 }, beam: true });
  check('right behind it with your light on its back: nothing (any distance)', [1, 2.5, 6, 15].every((d) => visibility(level, e, behind(d)) === 0 && !litByBeam(level, e, behind(d))));
  const beside = { ...behind(0), pos: { x: e.pos.x, z: e.pos.z - 1.2 }, facing: { x: 0, z: 1 } }; // (the hall is 3 m wide)
  check('close at its side: it notices', visibility(level, e, beside) > 0 && litByBeam(level, e, beside));
  const ahead = { ...behind(0), pos: { x: e.pos.x + 12, z: e.pos.z }, facing: { x: -1, z: 0 } };
  check('in front of it: it sees you, and your beam on it gives you away', visibility(level, e, ahead) > 0 && litByBeam(level, e, ahead));
}

section('It loses you: back to its patrol (0.9.8)');
{
  // You run, it chases; you dive into a locker it didn't see you get into. It goes to where it last
  // knew you were, then patrols again. It used to search there and check the nearest locker: yours.
  const lockers: LockerSpot[] = lockerSpots(level).map((l) => {
    const f = propFront(l);
    return { center: { x: l.x, z: l.z }, stand: { x: l.x + f.x * 0.95, z: l.z + f.z * 0.95 } };
  });
  const yours = 0;
  const l = lockers[yours];
  const e = createEnemy(level);
  e.pos = { x: l.stand.x + 7, z: l.stand.z };
  e.mode = 'chase';
  e.alert = 1;
  e.sinceSeen = 0;
  e.lastKnown = { ...l.stand };
  const rng = createRng(5);
  const hidden = { pos: l.stand, flashlightOn: false, crouching: true, hidden: true };
  const events: EnemyEvent[] = [];
  let patrolAt = -1;
  let lostAt: { x: number; z: number } | null = null;
  for (let i = 0; i < 25 * 60; i++) {
    const ev = stepEnemy(level, e, { dt: 1 / 60, player: hidden, noise: null, fuses: 0, lockers, playerLocker: yours }, rng);
    if (ev.includes('lost')) lostAt = { ...e.pos };
    events.push(...ev);
    if (patrolAt < 0 && (e.mode as string) === 'patrol') patrolAt = i / 60;
  }
  check('it gets to where it lost you (right by your locker)…', !!lostAt && dist(lostAt, l.stand) < 1.5);
  check('…then goes back to its patrol (no search)', patrolAt >= 0 && !events.includes('lockerOpen'), `patrol after ${patrolAt.toFixed(1)} s`);
  check('…and never opens your locker', !events.includes('foundYou'));
}
