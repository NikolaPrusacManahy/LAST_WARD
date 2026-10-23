import { check, section } from './harness';
import { parseLevel, TILE } from '../src/world/level';
import { moveWithCollision, overlapsWall } from '../src/world/collision';
import { findPath } from '../src/world/pathfinding';
import { lineOfSight } from '../src/world/lineOfSight';

const box = parseLevel({
  name: 'box',
  map: [
    '#######',
    '#P....#',
    '#.###.#',
    '#..E#.#',
    '#####X#',
    '#..G..#',
    '#######',
  ],
  notes: [],
});

section('Collision');
const start = { x: 1.5 * TILE, z: 1.5 * TILE };
const r = 0.35;
const intoWall = moveWithCollision(box, start, -10, 0, r);
check('stops at the wall', intoWall.x >= TILE + r - 1e-6, `${intoWall.x}`);
check('never overlaps a wall', !overlapsWall(box, intoWall, r));
const slide = moveWithCollision(box, start, -5, 1, r);
check('slides along a wall', slide.z > start.z && slide.x >= TILE + r - 1e-6);
const fast = moveWithCollision(box, start, 0, 50, r);
check('fast move does not tunnel', !overlapsWall(box, fast, r) && fast.z < 4 * TILE);
const free = moveWithCollision(box, start, 1, 0, r);
check('free move is exact', Math.abs(free.x - (start.x + 1)) < 1e-9);

section('Pathfinding');
const path = findPath(box, { col: 1, row: 1 }, { col: 3, row: 3 });
check('finds a path', path.length > 0);
check('path starts and ends right', path[0].col === 1 && path[0].row === 1 && path[path.length - 1].col === 3 && path[path.length - 1].row === 3);
check('path avoids walls', path.every((c) => !box.solid[c.row * box.cols + c.col]));
let cuts = false;
for (let i = 1; i < path.length; i++) {
  const a = path[i - 1];
  const b = path[i];
  if (a.col !== b.col && a.row !== b.row) {
    if (box.solid[a.row * box.cols + b.col] || box.solid[b.row * box.cols + a.col]) cuts = true;
  }
}
check('no corner cutting', !cuts);
check('unreachable → empty', findPath(box, { col: 1, row: 1 }, { col: 1, row: 5 }).length === 0);
check('wall goal → empty', findPath(box, { col: 1, row: 1 }, { col: 0, row: 0 }).length === 0);

section('Line of sight');
check('clear corridor', lineOfSight(box, { x: 1.5 * TILE, z: 1.5 * TILE }, { x: 5.5 * TILE, z: 1.5 * TILE }));
check('blocked by wall', !lineOfSight(box, { x: 1.5 * TILE, z: 1.5 * TILE }, { x: 1.5 * TILE, z: 5.5 * TILE }));
