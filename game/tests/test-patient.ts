// Update 0.5.4 — corner spawns, teleport after a minute without finding you, random table items.
import { check, section } from './harness';
import { ENEMY, cornerCells, spawnAtCorner, stepEnemy, EnemyEvent } from '../src/world/enemyAI';
import { shuffleItems } from '../src/world/itemShuffle';
import { LEVEL_01 } from '../src/world/content/level01';
import { cellCenter, dist, parseLevel, sameCell } from '../src/world/level';
import { lineOfSight } from '../src/world/lineOfSight';
import { reachable } from '../src/world/pathfinding';
import { createRng } from '../src/world/rng';
import { FUSES_NEEDED } from '../src/state/objectives';

const level = parseLevel(LEVEL_01);
const start = cellCenter(level.playerStart);
const corners = cornerCells(level);

section('Patient corners (0.5.4)');
{
  check('four corner points, one per corner of the map', corners.length === 4 && new Set(corners.map((c) => `${c.col},${c.row}`)).size === 4);
  const fromStart = reachable(level, level.playerStart);
  check('all corners reachable', corners.every((c) => fromStart.has(c.row * level.cols + c.col)));
  const used = new Set<string>();
  let nearPlayer = 0;
  for (let seed = 1; seed <= 200; seed++) {
    const e = spawnAtCorner(level, createRng(seed), start);
    used.add(`${e.home.col},${e.home.row}`);
    if (dist(e.pos, start) < ENEMY.spawnMinDist) nearPlayer++;
    if (!corners.some((c) => sameCell(c, e.home))) nearPlayer += 1000;
  }
  check('always spawns at a corner, never the one by the player', nearPlayer === 0, `${nearPlayer}`);
  check('uses every other corner across runs', used.size === 3, [...used].join(' '));
}

section('Teleport after a minute (0.5.4)');
{
  // Player hides in the start room, out of its sight and silent.
  const hidden = { pos: start, flashlightOn: false, crouching: true };
  const e = spawnAtCorner(level, createRng(4), start);
  const firstHome = e.home;
  const rng = createRng(5);
  let at = -1;
  for (let i = 0; i < 70 * 60 && at < 0; i++) {
    const ev: EnemyEvent[] = stepEnemy(level, e, { dt: 1 / 60, player: hidden, noise: null, fuses: 0 }, rng);
    if (ev.includes('teleported')) at = i / 60;
  }
  check('teleports once a minute passes without finding you', at >= ENEMY.teleportAfter - 0.05 && at < ENEMY.teleportAfter + 5, `at ${at.toFixed(1)} s`);
  check('…to a different corner', !sameCell(e.home, firstHome) && corners.some((c) => sameCell(c, e.home)));
  check('…never where you can see it or close to you', dist(e.pos, start) >= ENEMY.teleportMinDist && (!lineOfSight(level, e.pos, start) || dist(e.pos, start) > 25));
  check('…and patrols again with a fresh clock', e.mode === 'patrol' && e.sinceSpotted === 0);
  // Patrol stays around its home corner.
  let far = 0;
  for (let i = 0; i < 30 * 60; i++) {
    stepEnemy(level, e, { dt: 1 / 60, player: hidden, noise: null, fuses: 0 }, rng);
    if (e.mode === 'patrol' && dist(e.pos, cellCenter(e.home)) > (ENEMY.homeRadiusTiles + 1.5) * 3) far++;
  }
  check('patrols its own corner of the map', far === 0, `${far} frames outside`);

  // Seen by it → clock restarts; chasing → never teleports.
  const e2 = spawnAtCorner(level, createRng(9), start);
  e2.sinceSpotted = 59;
  const ahead = { x: e2.pos.x + e2.dir.x * 4, z: e2.pos.z + e2.dir.z * 4 };
  stepEnemy(level, e2, { dt: 1 / 60, player: { pos: ahead, flashlightOn: true, crouching: false }, noise: null, fuses: 0 }, createRng(1));
  check('being seen restarts the clock', e2.sinceSpotted === 0);
  const e3 = spawnAtCorner(level, createRng(9), start);
  e3.mode = 'chase';
  e3.sinceSpotted = 999;
  const ev3 = stepEnemy(level, e3, { dt: 1 / 60, player: hidden, noise: null, fuses: 0 }, createRng(2));
  check('never teleports mid-chase', !ev3.includes('teleported'));
  // Too close / in view → waits.
  const e4 = spawnAtCorner(level, createRng(9), start);
  e4.sinceSpotted = 61;
  e4.mode = 'patrol';
  const near = { pos: { x: e4.pos.x + 3, z: e4.pos.z }, flashlightOn: false, crouching: true };
  const ev4 = stepEnemy(level, e4, { dt: 1 / 60, player: near, noise: null, fuses: 0 }, createRng(3));
  check('never vanishes right next to you', !ev4.includes('teleported'));
}

section('Table items shuffle (0.5.4)');
{
  const spots = level.items.map((i) => `${i.cell.col},${i.cell.row}`).sort().join(' ');
  const layouts = new Set<string>();
  let ok = true;
  const fromStart = reachable(level, level.playerStart);
  for (let seed = 1; seed <= 50; seed++) {
    const l = shuffleItems(level, createRng(seed));
    const kinds = (k: string) => l.items.filter((i) => i.kind === k).length;
    if (kinds('fuse') !== FUSES_NEEDED || kinds('battery') !== 3 || kinds('note') !== 4) ok = false;
    if (l.items.map((i) => `${i.cell.col},${i.cell.row}`).sort().join(' ') !== spots) ok = false;
    if (!l.items.every((i) => fromStart.has(i.cell.row * l.cols + i.cell.col))) ok = false;
    const notes = l.items.filter((i) => i.kind === 'note').map((i) => i.noteIndex).sort().join(',');
    if (notes !== '0,1,2,3') ok = false;
    if (new Set(l.items.map((i) => i.id)).size !== l.items.length) ok = false;
    layouts.add(l.items.map((i) => `${i.kind}${i.noteIndex ?? ''}`).join(' '));
  }
  check('same counts, same tables, all reachable, every note once, unique ids', ok);
  check('a different layout most runs (50 seeds)', layouts.size >= 45, `${layouts.size} distinct`);
  check('the level data itself is untouched', level.items[0].kind === parseLevel(LEVEL_01).items[0].kind);
}
