// Update 0.9.5 — lockers: get in, peek, get out; seen going in = caught, unseen = invisible.
import { check, section } from './harness';
import { LEVEL_01 } from '../src/world/content/level01';
import { cellCenter, dist, isSolid, itemPos, parseLevel, worldToCell } from '../src/world/level';
import { lockerSpots, placedProps, propBlockers, propFront } from '../src/world/props';
import { findTarget } from '../src/world/interact';
import { promptFor } from '../src/state/prompts';
import { createProgress } from '../src/state/objectives';
import { LOCKER, clampLook, doorOpen, hiddenFrom, insideness, requestExit, startHide, stepHide } from '../src/state/hiding';
import { createEnemy, stepEnemy, visibility } from '../src/world/enemyAI';
import { overlapsWall } from '../src/world/collision';
import { PLAYER } from '../src/state/playerRules';
import { createRng } from '../src/world/rng';

const level = parseLevel(LEVEL_01);
const lockers = lockerSpots(level);

section('Lockers in Ward 13 (0.9.5)');
{
  check('seven lockers', lockers.length === 7);
  const quarters = new Set(lockers.map((l) => `${l.x < (level.cols * 3) / 2 ? 'W' : 'E'}${l.z < (level.rows * 3) / 2 ? 'N' : 'S'}`));
  check('spread over every quarter of the map', quarters.size === 4);
  lockers.forEach((l, i) => {
    const f = propFront(l);
    const out = { x: l.x + f.x * LOCKER.exitOut, z: l.z + f.z * LOCKER.exitOut };
    const others = propBlockers(placedProps(level).filter((p) => !(p.kind === 'locker' && p.x === l.x && p.z === l.z)));
    const cabinets = level.items.map((it) => itemPos(level, it.cell));
    check(`locker ${i + 1}: you step out into open floor, clear of walls and furniture`, !overlapsWall(level, out, PLAYER.radius, [...others, ...cabinets]));
    const stand = { x: l.x + f.x * 1.3, z: l.z + f.z * 1.3 };
    const t = findTarget(level, stand, { x: -f.x, z: -f.z }, []);
    check(`locker ${i + 1}: facing it from in front says Hide`, t?.type === 'locker' && t.index === i && promptFor(t, createProgress(), false)?.verb === 'hide');
    const behind = worldToCell({ x: l.x - f.x * 0.9, z: l.z - f.z * 0.9 });
    check(`locker ${i + 1}: its back is to a wall`, isSolid(level, behind.col, behind.row));
  });
}

section('Hiding (0.9.5)');
{
  let s = startHide(0, false, true);
  check('getting in: the door swings open then shut', doorOpen(s) === 0 && doorOpen({ ...s, t: LOCKER.enterSeconds / 2 }) > 1);
  const ev: string[] = [];
  for (let i = 0; i < 60 && s.phase === 'entering'; i++) {
    const r = stepHide(s, { dt: 1 / 60, peekHeld: false, seen: false });
    s = r.state;
    ev.push(...r.events);
  }
  check('then you are inside, door shut', s.phase === 'inside' && ev.includes('inside') && doorOpen(s) === 0 && insideness(s) === 1);
  check('unseen: hidden from it', hiddenFrom(s));
  // Peek: hold Space + W, it creeps open to 60° and no further.
  const r1 = stepHide(s, { dt: 1 / 60, peekHeld: true, seen: false });
  check('peeking starts (door creak)', r1.events.includes('peekStart'));
  let p = r1.state;
  for (let i = 0; i < 60; i++) p = stepHide(p, { dt: 1 / 60, peekHeld: true, seen: false }).state;
  check('peeking is slow (not fully open after a second)', p.peek < 0.6 && p.peek > 0.2);
  for (let i = 0; i < 600; i++) p = stepHide(p, { dt: 1 / 60, peekHeld: true, seen: false }).state;
  check('the door stops at 60°', Math.abs(doorOpen(p) - Math.PI / 3) < 1e-9);
  for (let i = 0; i < 60; i++) p = stepHide(p, { dt: 1 / 60, peekHeld: false, seen: false }).state;
  check('let go: it swings shut', p.peek === 0);
  check('peeking doesn\'t give you away', hiddenFrom(p));
  let o = requestExit(p);
  const out: string[] = [];
  for (let i = 0; i < 60 && !out.includes('out'); i++) {
    const r = stepHide(o, { dt: 1 / 60, peekHeld: false, seen: false });
    o = r.state;
    out.push(...r.events);
  }
  check('left click: you get out', out.includes('out'));
  check('can\'t get out halfway through getting in', requestExit(startHide(0, false, false)).phase === 'entering');
  // Seen getting in: exposed.
  let seen = startHide(0, false, false);
  seen = stepHide(seen, { dt: 0.1, peekHeld: false, seen: true }).state;
  check('it saw you get in: not hidden', seen.exposed && !hiddenFrom(seen));
  check('seen before you got in counts too', !hiddenFrom(startHide(0, true, false)));
  const look = clampLook(1.2, 2, 0);
  check('inside you can only look out of the locker', look.yaw === LOCKER.lookYaw && look.pitch === LOCKER.lookPitch);
}

section('The Patient and lockers (0.9.5)');
{
  const l = lockers[0];
  const e = createEnemy(level);
  const f = propFront(l);
  e.pos = { x: l.x + f.x * 0.6, z: l.z + f.z * 0.6 };
  e.dir = { x: -f.x, z: -f.z };
  const you = { pos: { x: l.x, z: l.z }, flashlightOn: false, crouching: false };
  check('hidden in a locker: it can\'t see you, even right in front', visibility(level, e, { ...you, hidden: true }) === 0);
  const ev = stepEnemy(level, e, { dt: 1 / 60, player: { ...you, hidden: true }, noise: null, fuses: 0 }, createRng(1));
  check('…or catch you', !ev.includes('caught'));
  const e2 = createEnemy(level);
  e2.pos = { ...e.pos };
  e2.dir = { ...e.dir };
  const ev2 = stepEnemy(level, e2, { dt: 1 / 60, player: { ...you, hidden: false }, noise: null, fuses: 0 }, createRng(1));
  check('seen going in: it gets you', ev2.includes('caught'));
  check('a locker isn\'t on its walking line (cell centre clear)', lockers.every((k) => dist(k, cellCenter(worldToCell(k))) > 0.7));
}
