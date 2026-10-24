// Update 0.9.6 — bricks and bottles: where they lie, picking up, the throw arc, landing and noise.
import { check, section } from './harness';
import { LEVEL_01 } from '../src/world/content/level01';
import { TILE, cellCenter, dist, isSolid, parseLevel, worldToCell } from '../src/world/level';
import { THROW, heldPos, launch, spawnThrowables, stepFlight, throwableTitle, Throwable } from '../src/state/throwables';
import { ENEMY, createEnemy, heardNoise, stepEnemy } from '../src/world/enemyAI';
import { lineOfSight } from '../src/world/lineOfSight';
import { createRng } from '../src/world/rng';
import { findTarget } from '../src/world/interact';
import { EMPTY_HANDS, promptFor } from '../src/state/prompts';
import { createProgress } from '../src/state/objectives';

const level = parseLevel(LEVEL_01);
const items = spawnThrowables(level.throwables);
const fly = (t: Throwable) => {
  let it = t;
  for (let i = 0; i < 600; i++) {
    const r = stepFlight(level, it, 1 / 60);
    it = r.item;
    if (r.landing) return { it, landing: r.landing, seconds: i / 60 };
  }
  return { it, landing: null, seconds: 10 };
};

section('Bricks and bottles in the halls (0.9.6)');
{
  check('nine of them, bricks and bottles', items.length === 9 && items.some((x) => x.kind === 'brick') && items.some((x) => x.kind === 'bottle'));
  const clear = (p: { x: number; z: number }) => [[0.25, 0], [-0.25, 0], [0, 0.25], [0, -0.25]].every(([dx, dz]) => {
    const c = worldToCell({ x: p.x + dx, z: p.z + dz });
    return !isSolid(level, c.col, c.row);
  });
  check('each lies on open floor, clear of the walls', items.every((x) => x.state === 'ground' && clear(x.pos)));
  check('…off the middle of the corridor (where it walks)', items.every((x) => dist(x.pos, cellCenter(worldToCell(x.pos))) > 0.9));
  const b = items[0];
  const t = findTarget(level, { x: b.pos.x + 1.2, z: b.pos.z }, { x: -1, z: 0 }, [], [{ id: b.id, kind: b.kind, pos: b.pos }]);
  check('looking at one: Press [icon] to pick up', t?.type === 'loose' && promptFor(t, createProgress(), false)?.verb === 'pick up');
  check('0.9.8: all three slots full: it says so', t !== null && promptFor(t, createProgress(), false, { ...EMPTY_HANDS, full: true })?.info === 'Your slots are full.');
  const held = heldPos({ x: 0, y: 1.6, z: 0 }, { x: 0, y: 0, z: -1 }, { x: 1, y: 0, z: 0 });
  check('held: floating in front of you, a little right and down', held.z < -0.4 && held.x > 0 && held.y < 1.6);
}

section('Throwing (0.9.6)');
{
  // Down the long top corridor (row 5), from eye height.
  const from = { x: cellCenter({ col: 3, row: 5 }).x, y: 1.45, z: cellCenter({ col: 3, row: 5 }).z };
  const brick = launch({ ...items[0], state: 'held' }, from, { x: 1, y: 0, z: 0 });
  const b = fly(brick);
  check('it arcs down and lands on the floor', !!b.landing && b.landing.at.y === 0);
  const range = b.landing ? b.landing.at.x - from.x : 0;
  check('a decent throw: 6 to 12 m down the hall', range > 6 && range < 12, `${range.toFixed(1)} m in ${b.seconds.toFixed(2)} s`);
  check('a brick stays after one throw (you can pick it up again)…', b.it.state === 'ground' && !b.landing!.broke);
  check('…broken in half: "Half a brick"', b.it.throws === 1 && throwableTitle(b.it) === 'Half a brick' && throwableTitle(items[0]) === 'Brick');
  const second = fly(launch({ ...b.it, state: 'held' }, from, { x: 1, y: 0, z: 0 }));
  check('the second throw is its last: gone', second.it.state === 'gone' && second.landing!.broke && second.landing!.noise.radius === THROW.noise.brick);
  check('the landing makes a noise that lures it', b.landing!.noise.radius === THROW.noise.brick);
  const bottle = fly(launch({ ...items[1], state: 'held' }, from, { x: 1, y: 0, z: 0 }));
  check('a bottle smashes (gone) on its first throw', bottle.it.state === 'gone' && bottle.landing!.broke && bottle.landing!.noise.radius === THROW.noise.bottle);
  // Straight at the wall a metre away: it drops just in front of it, never inside.
  const wall = fly(launch({ ...items[0], state: 'held' }, { ...from, x: cellCenter({ col: 6, row: 5 }).x }, { x: 0, y: 0, z: -1 }));
  const c = worldToCell(wall.landing!.at);
  check('thrown at a wall: drops in front of it, not in it', !!wall.landing && !isSolid(level, c.col, c.row) && wall.landing.at.z > Math.floor(from.z / TILE) * TILE);
  const up = fly(launch({ ...items[0], state: 'held' }, from, { x: 0.3, y: 0.95, z: 0 }));
  check('thrown at the ceiling: comes back down', !!up.landing && up.landing.at.y === 0);
}

section('How far a brick landing is heard');
{
  check('louder brick: 20 m (was 12), heard from twice that by The Patient', THROW.noise.brick === 20 && ENEMY.hearingMul === 2);
  // Open corridor: the long top hall, row 5.
  const land = cellCenter({ col: 1, row: 5 });
  const e = createEnemy(level);
  e.pos = { x: land.x + 38, z: land.z };
  check('in the open: heard from 38 m down the hall', lineOfSight(level, e.pos, land) && heardNoise(level, e, { pos: land, radius: THROW.noise.brick }));
  e.pos = { x: land.x + 41, z: land.z };
  check('…not from 41 m', !heardNoise(level, e, { pos: land, radius: THROW.noise.brick }));
  // Through walls: it's muffled to 0.6 of that, 24 m.
  const behind = cellCenter({ col: 10, row: 11 });
  const e2 = createEnemy(level);
  e2.pos = cellCenter({ col: 10, row: 5 }); // 18 m away, two walls between
  check('through two walls: heard from 18 m', !lineOfSight(level, e2.pos, behind) && heardNoise(level, e2, { pos: behind, radius: THROW.noise.brick }));
  check('…where the old 12 m brick was not', !heardNoise(level, e2, { pos: behind, radius: 12 }));
  // And it acts on it: the landing noise (lure) sends it running there.
  stepEnemy(level, e2, { dt: 1 / 60, player: { pos: { x: -100, z: -100 }, flashlightOn: false, crouching: true }, noise: { pos: behind, radius: THROW.noise.brick, lure: true }, fuses: 0 }, createRng(9));
  check('…and runs to it', e2.mode === 'investigate' && e2.rush && e2.lure);
}
