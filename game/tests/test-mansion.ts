// Update 0.7 — level 2 (Ashgrove House): three floors, stairs, The Patient following you between floors.
import { check, section } from './harness';
import { LEVEL_01 } from '../src/world/content/level01';
import { LEVEL_02 } from '../src/world/content/level02';
import { LEVELS } from '../src/world/content/levels';
import {
  Cell, Level, LevelDef, TILE, Vec2, WALL_HEIGHT, cellCenter, crossPortal, dist, floorAt, floorOfRow, floorOffset, floorStride,
  isSolid, itemPos, parseLevel, stairRise, worldToCell,
} from '../src/world/level';
import { findPath, reachable } from '../src/world/pathfinding';
import { moveWithCollision } from '../src/world/collision';
import { lineOfSight } from '../src/world/lineOfSight';
import { ENEMY, EnemyState, cornerCells, generatorApproach, spawnAtCorner, stepEnemy, summonToGenerator, tuningFor } from '../src/world/enemyAI';
import { FUSES_NEEDED } from '../src/state/objectives';
import { PLAYER } from '../src/state/playerRules';
import { chooseStartLevel, startLevelIndex } from '../src/state/devTools';
import { createRng } from '../src/world/rng';

const level = parseLevel(LEVEL_02);
const S = floorStride(level);
const on = (floor: number, col: number, row: number): Cell => ({ col, row: floor * S + row });
const key = (c: Cell) => c.row * level.cols + c.col;
/** Where a logic position really is in the house. */
const real = (p: Vec2) => {
  const o = floorOffset(level, floorAt(level, p));
  return { x: p.x, y: o.y + stairRise(level, p), z: p.z + o.z };
};

section('Ashgrove House: layout (0.7)');
{
  check('three floors, four flights of stairs, two portals each', level.floors === 3 && level.stairs.length === 4 && level.portals.length === 8);
  check(`${FUSES_NEEDED} fuses, every note has text`, level.items.filter((i) => i.kind === 'fuse').length === FUSES_NEEDED && level.items.filter((i) => i.kind === 'note').every((i) => !!level.notes[i.noteIndex!]));
  check('lamps ≤ 8 for the whole house (point-light budget)', level.lamps.length <= 8, `${level.lamps.length}`);
  check('every item cabinet is pushed against a wall', level.items.every((i) => dist(itemPos(level, i.cell), cellCenter(i.cell)) > 1));
  const fromStart = reachable(level, level.playerStart);
  check('every item reachable from the start, up and down the stairs', level.items.every((i) => fromStart.has(key(i.cell))));
  const perFloor = [0, 1, 2].map((f) => [...fromStart].filter((k) => floorOfRow(level, Math.floor(k / level.cols)) === f).length);
  check('all three floors can be reached', perFloor.every((n) => n > 100), perFloor.join(' / '));
  let open = 0;
  for (let i = 0; i < level.solid.length; i++) if (!level.solid[i]) open++;
  check('no sealed-off rooms (every open cell is reachable)', open === fromStart.size, `${open} open, ${fromStart.size} reachable`);
  check('the generator is in the attic, the exit (front door) on the ground floor', floorOfRow(level, level.generator.row) === 2 && floorOfRow(level, level.exit.row) === 0);
  const nextTo = (c: Cell) => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dc, dr]) => fromStart.has(key({ col: c.col + dc, row: c.row + dr })));
  check('generator and exit can be walked up to', nextTo(level.generator) && nextTo(level.exit));
  check('you start in the entrance hall, facing the grand staircase', floorAt(level, cellCenter(level.playerStart)) === 0 && level.startYaw === 0);
  check('The Patient starts upstairs, far from you', floorAt(level, cellCenter(level.enemyStart)) === 2);
  check('its own intro text', level.intro.time !== parseLevel(LEVEL_01).intro.time && level.intro.lines.length === 2);
  check('levels in order: the hospital, then the house', LEVELS[0] === LEVEL_01 && LEVELS[1] === LEVEL_02);
}

section('Level 1 is unchanged by floors (0.7)');
{
  const l1 = parseLevel(LEVEL_01);
  check('one floor, no stairs, same size', l1.floors === 1 && l1.stairs.length === 0 && l1.portals.length === 0 && l1.rows === 19);
  check('four corner spawn points, as before', cornerCells(l1).length === 4);
  check('default Patient tuning on level 1', tuningFor(l1).memorySeconds === ENEMY.memorySeconds && tuningFor(l1).searchSeconds === ENEMY.searchSeconds);
}

section('Stairs: walking up and down (0.7)');
{
  // Grand staircase: from the entrance hall (ground, 12,14) north up to the gallery (first floor).
  const walk = (from: Vec2, dz: number, seconds: number) => {
    let p = { ...from };
    const trail: { p: Vec2; real: ReturnType<typeof real> }[] = [{ p, real: real(p) }];
    for (let i = 0; i < seconds * 60; i++) {
      p = moveWithCollision(level, p, 0, dz / 60, PLAYER.radius);
      p = crossPortal(level, p).pos;
      trail.push({ p, real: real(p) });
    }
    return trail;
  };
  const up = walk(cellCenter(on(0, 12, 14)), -PLAYER.speed.walk, 6);
  const end = up[up.length - 1];
  check('walking up the grand staircase takes you to the first floor', floorAt(level, end.p) === 1, `floor ${floorAt(level, end.p)}`);
  let maxJump = 0;
  let rising = true;
  for (let i = 1; i < up.length; i++) {
    const a = up[i - 1].real;
    const b = up[i].real;
    maxJump = Math.max(maxJump, Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z));
    if (b.y < a.y - 1e-9) rising = false;
  }
  check('no jump anywhere on the way up (height and position are continuous)', maxJump < 0.2, `largest step ${maxJump.toFixed(3)} m`);
  check('you only ever go up on the way up, to exactly one floor higher', rising && Math.abs(end.real.y - WALL_HEIGHT) < 1e-6);
  const down = walk(end.p, PLAYER.speed.walk, 8);
  const back = down[down.length - 1];
  check('and walking back down returns you to the ground floor', floorAt(level, back.p) === 0 && back.real.y === 0);
  let maxJumpDown = 0;
  for (let i = 1; i < down.length; i++) {
    const a = down[i - 1].real;
    const b = down[i].real;
    maxJumpDown = Math.max(maxJumpDown, Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z));
  }
  check('no jump on the way down either', maxJumpDown < 0.2, `largest step ${maxJumpDown.toFixed(3)} m`);
  // Upstairs, the stairwell is a hole with railings: you can't walk into it from the side.
  const gallery = cellCenter(on(1, 12, 14));
  const into = moveWithCollision(level, gallery, 0, -3, PLAYER.radius);
  check('you can\'t step into the stairwell from the gallery', worldToCell(into).row === on(1, 12, 14).row);
  // You can see across the stairwell, not through the block under the landing.
  check('you can see over a stairwell (from the landing down the gallery)', lineOfSight(level, cellCenter(on(1, 12, 11)), cellCenter(on(1, 12, 15))));
  check('…but not through the block under the landing', !lineOfSight(level, cellCenter(on(0, 12, 13)), cellCenter(on(0, 12, 9))));
  // A bad flight is caught when the level loads.
  const bad: LevelDef = { name: 'bad', notes: [], floors: [['#####', '#P^.#', '#####'], ['#####', '#Eo.#', '#####']] };
  let threw = false;
  try {
    parseLevel(bad);
  } catch {
    threw = true;
  }
  check('stairs without walls on both sides are rejected', threw);
}

section('The Patient across floors (0.7)');
{
  const hidden = { pos: { x: -100, z: -100 }, flashlightOn: false, crouching: true };
  // A path from the front door to the attic generator crosses floors only at the stairs.
  const path = findPath(level, level.playerStart, generatorApproach(level));
  let jumpsOk = true;
  let jumps = 0;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1];
    const b = path[i];
    if (Math.abs(a.col - b.col) <= 1 && Math.abs(a.row - b.row) <= 1) continue;
    jumps++;
    if (!level.portals.some((p) => p.to.col === b.col && p.to.row === b.row)) jumpsOk = false;
  }
  check('paths change floor only through the stairs (twice, front door → attic)', path.length > 0 && jumpsOk && jumps === 2, `${jumps} jumps`);
  check('twelve spawn corners (four per floor)', cornerCells(level).length === 12 && [0, 1, 2].every((f) => cornerCells(level).filter((c) => floorOfRow(level, c.row) === f).length === 4));
  // Generator on: from a ground-floor corner it climbs two flights and reaches the attic generator.
  let reached = 0;
  let inWall = 0;
  let floorsSeen = new Set<number>();
  for (let seed = 1; seed <= 12; seed++) {
    const rng = createRng(seed);
    const e = spawnAtCorner(level, rng, cellCenter(level.playerStart));
    summonToGenerator(level, e, cellCenter(level.playerStart), rng);
    for (let i = 0; i < 90 * 60; i++) {
      stepEnemy(level, e, { dt: 1 / 60, player: hidden, noise: null, fuses: 3 }, rng);
      floorsSeen.add(floorAt(level, e.pos));
      const c = worldToCell(e.pos);
      if (isSolid(level, c.col, c.row)) inWall++;
      if (dist(e.pos, cellCenter(generatorApproach(level))) < 0.3) {
        reached++;
        break;
      }
    }
  }
  check('summoned by the generator, it always makes it up to the attic', reached === 12, `${reached}/12`);
  check('…walking the stairs, never through a wall or floor', inWall === 0 && floorsSeen.size === 3, `${inWall} frames in walls`);
  // Chase: it sees you in the entrance hall, you run up the grand staircase. It follows you up.
  const follows = (lvl: Level) => {
    const rng = createRng(7);
    const e: EnemyState = spawnAtCorner(lvl, rng, cellCenter(lvl.playerStart));
    e.pos = cellCenter(on(0, 9, 15));
    e.dir = { x: 1, z: 0 };
    let p = cellCenter(on(0, 12, 15));
    let caught = false;
    for (let i = 0; i < 25 * 60; i++) {
      // You sprint for the stairs, up into the gallery, then off down the first-floor hallway.
      const target = floorAt(lvl, p) === 0 ? cellCenter(on(0, 12, 9)) : cellCenter(on(1, 20, 7));
      const d = dist(p, target);
      if (d > 0.1) {
        const step = Math.min(d, PLAYER.speed.sprint / 60);
        const path = floorAt(lvl, p) === 0 ? { x: 0, z: -step } : { x: ((target.x - p.x) / d) * step, z: ((target.z - p.z) / d) * step };
        p = crossPortal(lvl, moveWithCollision(lvl, p, path.x, path.z, PLAYER.radius)).pos;
      }
      const ev = stepEnemy(lvl, e, { dt: 1 / 60, player: { pos: p, flashlightOn: true, crouching: false }, noise: null, fuses: 0 }, rng);
      if (ev.includes('caught')) caught = true;
      if (caught) break;
    }
    return { floor: floorAt(lvl, e.pos), caught };
  };
  const r = follows(level);
  check('you run upstairs: it follows you up to the first floor (it keeps tracking you longer here)', r.floor === 1 || r.caught, `floor ${r.floor}${r.caught ? ', caught you' : ''}`);
  check('mansion tuning: tracks 5 s after losing sight, searches 16 s over 5 tiles', tuningFor(level).memorySeconds === 5 && tuningFor(level).searchSeconds === 16 && tuningFor(level).searchRadiusTiles === 5);
}

section('Starting on level 2 (dev only, 0.7)');
{
  check('?level=2 starts in the house when running locally', startLevelIndex(true, '?level=2', 2) === 1);
  check('the public build always starts at the hospital', startLevelIndex(false, '?level=2', 2) === 0);
  check('nonsense is ignored', startLevelIndex(true, '?level=9', 2) === 0 && startLevelIndex(true, '', 2) === 0);
}

section('Tester level picker (dev only, 0.7.1)');
{
  check('in the dev build, Begin starts on the picked level', chooseStartLevel(true, 1, 2) === 1 && chooseStartLevel(true, 0, 2) === 0);
  check('the public build always starts at level 1, whatever was picked', chooseStartLevel(false, 1, 2) === 0);
  check('a bad saved pick falls back to level 1', chooseStartLevel(true, 7, 2) === 0 && chooseStartLevel(true, NaN, 2) === 0 && chooseStartLevel(true, -1, 2) === 0);
}
