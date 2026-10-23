// Update 0.7 — floors and stairs in the engine. Update 0.7.2 — level 2 was removed, so this checks the
// floor system on a tiny two-floor test level (kept ready for a future level that needs stairs).
import { check, section } from './harness';
import { LEVEL_01 } from '../src/world/content/level01';
import { LEVELS } from '../src/world/content/levels';
import { Cell, LevelDef, Vec2, WALL_HEIGHT, cellCenter, crossPortal, dist, floorAt, floorOffset, floorStride, isSolid, parseLevel, stairRise, worldToCell } from '../src/world/level';
import { findPath, reachable } from '../src/world/pathfinding';
import { moveWithCollision } from '../src/world/collision';
import { lineOfSight } from '../src/world/lineOfSight';
import { ENEMY, cornerCells, generatorApproach, spawnAtCorner, stepEnemy, summonToGenerator, tuningFor } from '../src/world/enemyAI';
import { PLAYER } from '../src/state/playerRules';
import { chooseStartLevel, startLevelIndex } from '../src/state/devTools';
import { createRng } from '../src/world/rng';

// One flight of stairs at column 5 going up (north) from the ground floor to the floor above.
const TWO_FLOORS: LevelDef = {
  name: 'stairs test',
  notes: [],
  floors: [
    [
      '#########',
      '#...###.#',
      '#...#^#.#',
      '#.P.#^#.#',
      '#.......X',
      '#.......#',
      '#########',
    ],
    [
      '#########',
      '#....L..#',
      '#...#o#.#',
      '#...#o#.#',
      '#.......#',
      '#E.....G#',
      '#########',
    ],
  ],
};
const level = parseLevel(TWO_FLOORS);
const S = floorStride(level);
const on = (floor: number, col: number, row: number): Cell => ({ col, row: floor * S + row });
const real = (p: Vec2) => {
  const o = floorOffset(level, floorAt(level, p));
  return { x: p.x, y: o.y + stairRise(level, p), z: p.z + o.z };
};

section('The game is the hospital (0.7.2)');
{
  check('one level: Ward 13', LEVELS.length === 1 && LEVELS[0] === LEVEL_01);
  const l1 = parseLevel(LEVEL_01);
  check('one floor, no stairs, same size as ever', l1.floors === 1 && l1.stairs.length === 0 && l1.portals.length === 0 && l1.rows === 19);
  check('four corner spawn points', cornerCells(l1).length === 4);
  check('default Patient tuning', tuningFor(l1).memorySeconds === ENEMY.memorySeconds && tuningFor(l1).searchSeconds === ENEMY.searchSeconds);
}

section('Floors and stairs (engine, test level)');
{
  check('two floors, one flight, two portals', level.floors === 2 && level.stairs.length === 1 && level.portals.length === 2);
  const fromStart = reachable(level, level.playerStart);
  let open = 0;
  for (let i = 0; i < level.solid.length; i++) if (!level.solid[i]) open++;
  check('everything reachable, upstairs too', open === fromStart.size);
  const walk = (from: Vec2, dz: number, seconds: number) => {
    let p = { ...from };
    let maxJump = 0;
    let prev = real(p);
    for (let i = 0; i < seconds * 60; i++) {
      p = crossPortal(level, moveWithCollision(level, p, 0, dz / 60, PLAYER.radius)).pos;
      const r = real(p);
      maxJump = Math.max(maxJump, Math.hypot(r.x - prev.x, r.y - prev.y, r.z - prev.z));
      prev = r;
    }
    return { p, maxJump };
  };
  const up = walk(cellCenter(on(0, 5, 4)), -PLAYER.speed.walk, 4);
  check('walking up the stairs takes you to the floor above', floorAt(level, up.p) === 1 && Math.abs(real(up.p).y - WALL_HEIGHT) < 1e-6);
  check('no jump on the way up (height and position continuous)', up.maxJump < 0.2, `${up.maxJump.toFixed(3)} m`);
  const down = walk(up.p, PLAYER.speed.walk, 5);
  check('and back down to the ground floor, no jump', floorAt(level, down.p) === 0 && real(down.p).y === 0 && down.maxJump < 0.2);
  const into = moveWithCollision(level, cellCenter(on(1, 5, 4)), 0, -3, PLAYER.radius);
  check('upstairs you can\'t step into the stairwell', worldToCell(into).row === on(1, 5, 4).row);
  check('you can see over a stairwell', lineOfSight(level, cellCenter(on(1, 5, 1)), cellCenter(on(1, 5, 4))));
  const under = on(0, 5, 1);
  check('the block under the landing is walked through (portal) but blocks sight', !isSolid(level, under.col, under.row) && level.opaque[under.row * level.cols + under.col]);
  const bad: LevelDef = { name: 'bad', notes: [], floors: [['#####', '#P^.#', '#####'], ['#####', '#Eo.#', '#####']] };
  let threw = false;
  try {
    parseLevel(bad);
  } catch {
    threw = true;
  }
  check('stairs without walls on both sides are rejected', threw);
}

section('The Patient on stairs (engine, test level)');
{
  const hidden = { pos: { x: -100, z: -100 }, flashlightOn: false, crouching: true };
  const path = findPath(level, level.playerStart, generatorApproach(level));
  const jumps = path.filter((c, i) => i > 0 && (Math.abs(c.col - path[i - 1].col) > 1 || Math.abs(c.row - path[i - 1].row) > 1));
  check('paths change floor only through the stairs', jumps.length === 1 && level.portals.some((p) => p.to.col === jumps[0].col && p.to.row === jumps[0].row));
  check('four spawn corners per floor', cornerCells(level).length === 8);
  // Sent up to the generator from the ground floor: it climbs the stairs and gets there.
  const rng = createRng(3);
  const e = spawnAtCorner(level, rng, cellCenter(level.playerStart));
  e.pos = cellCenter(on(0, 1, 5));
  summonToGenerator(level, e, cellCenter(level.playerStart), rng);
  e.pos = cellCenter(on(0, 1, 5)); // force the ground floor so it has to climb
  e.path = findPath(level, worldToCell(e.pos), generatorApproach(level));
  e.pathIndex = 0;
  let inWall = 0;
  let arrived = false;
  for (let i = 0; i < 40 * 60 && !arrived; i++) {
    stepEnemy(level, e, { dt: 1 / 60, player: hidden, noise: null, fuses: 0 }, rng);
    const c = worldToCell(e.pos);
    if (isSolid(level, c.col, c.row)) inWall++;
    arrived = dist(e.pos, cellCenter(generatorApproach(level))) < 0.3;
  }
  check('it climbs the stairs to the generator, never through a wall or floor', arrived && inWall === 0, `${arrived ? 'arrived' : 'not there'}, ${inWall} frames in walls`);
  // You run up the stairs in front of it: it follows you up (0.7 fix: it used to stall on the top step).
  const rng2 = createRng(7);
  const c = spawnAtCorner(level, rng2, cellCenter(level.playerStart));
  c.pos = cellCenter(on(0, 2, 4));
  c.dir = { x: 1, z: 0 };
  c.alert = 0.99; // it has already seen you: the chase is on
  let p = cellCenter(on(0, 5, 4));
  let caught = false;
  let cameUp = false;
  const away = cellCenter(on(1, 7, 4));
  for (let i = 0; i < 20 * 60 && !caught; i++) {
    const step = PLAYER.speed.sprint / 60;
    if (floorAt(level, p) === 0) p = crossPortal(level, moveWithCollision(level, p, 0, -step, PLAYER.radius)).pos;
    else if (dist(p, away) > 0.2) {
      // Off the landing and round into the room, away from the stairwell.
      const tgt = p.z > cellCenter(on(1, 5, 1)).z - 0.1 && p.x < away.x - 0.1 ? { x: away.x, z: cellCenter(on(1, 5, 1)).z } : away;
      const d = dist(p, tgt) || 1;
      p = crossPortal(level, moveWithCollision(level, p, ((tgt.x - p.x) / d) * step, ((tgt.z - p.z) / d) * step, PLAYER.radius)).pos;
    }
    caught = stepEnemy(level, c, { dt: 1 / 60, player: { pos: p, flashlightOn: true, crouching: false }, noise: null, fuses: 0 }, rng2).includes('caught');
    if (floorAt(level, c.pos) === 1) cameUp = true;
  }
  check('you run upstairs in front of it: it follows you up', caught || cameUp, caught ? 'caught you' : 'stayed downstairs');
  check('a level can make it track longer', tuningFor(parseLevel({ ...TWO_FLOORS, ai: { memorySeconds: 5 } })).memorySeconds === 5);
}

section('Tester start level (dev only)');
{
  check('?level=N picks a level only when running locally', startLevelIndex(true, '?level=2', 2) === 1 && startLevelIndex(false, '?level=2', 2) === 0);
  check('the public build always starts at level 1', chooseStartLevel(false, 1, 2) === 0 && chooseStartLevel(true, 1, 2) === 1);
  check('a bad pick falls back to level 1', chooseStartLevel(true, 7, 2) === 0 && chooseStartLevel(true, NaN, 2) === 0);
}
