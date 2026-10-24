// Update 0.6.4 — longer patrols, teleport every 35 s, the generator summons it, reading pauses the game.
import { check, section } from './harness';
import { ENEMY, EnemyState, cornerCells, generatorApproach, spawnAtCorner, stepEnemy, summonToGenerator } from '../src/world/enemyAI';
import { chooseEnemyClip, RUN_THRESHOLD } from '../src/engine/enemyAnim';
import { closesNote, guardLeave, worldTimeScale } from '../src/state/session';
import { LEVEL_01 } from '../src/world/content/level01';
import { cellCenter, dist, isSolid, parseLevel, sameCell, worldToCell } from '../src/world/level';
import { createRng } from '../src/world/rng';

const level = parseLevel(LEVEL_01);
const start = cellCenter(level.playerStart);
// Out of the map: it can never see you (so only the behaviour under test shows).
const hidden = { pos: { x: -100, z: -100 }, flashlightOn: false, crouching: true };
const step = (e: EnemyState, rng: () => number, noise: { pos: { x: number; z: number }; radius: number } | null = null, player = hidden) =>
  stepEnemy(level, e, { dt: 1 / 60, player, noise, fuses: 3 }, rng);

section('Patrols: long legs, teleport every 35 s (0.6.4)');
{
  check('teleports after 35 s without spotting you', ENEMY.teleportAfter === 35);
  // Patrol leg length (path cells) over 20 runs × 2 min. Before 0.6.4 the legs averaged ~8 cells.
  const legs: number[] = [];
  for (let seed = 1; seed <= 20; seed++) {
    const rng = createRng(seed);
    const e = spawnAtCorner(level, rng, start);
    let goal = e.goal;
    for (let i = 0; i < 120 * 60; i++) {
      step(e, rng);
      if (e.goal !== goal && e.goal && e.mode === 'patrol') legs.push(e.path.length);
      goal = e.goal;
    }
  }
  const mean = legs.reduce((s, x) => s + x, 0) / legs.length;
  const tiny = legs.filter((l) => l < 6).length / legs.length;
  check('patrol legs are ~2× longer than before (avg ≥ 16 cells, was ~8)', mean >= 16, `avg ${mean.toFixed(1)} cells over ${legs.length} legs`);
  check('almost no tiny back-and-forth legs (< 6 cells)', tiny < 0.1, `${(tiny * 100).toFixed(0)}%`);
}

section('Generator on: it screams at a corner, then sprints for the generator (0.6.4)');
{
  const approach = generatorApproach(level);
  const gen = cellCenter(level.generator);
  check('it heads for an open cell beside the machine (the machine is solid)', !isSolid(level, approach.col, approach.row) && Math.abs(approach.col - level.generator.col) + Math.abs(approach.row - level.generator.row) === 1);
  const corners = cornerCells(level);
  const used = new Set<string>();
  let okCorner = true;
  let okPath = true;
  const times: number[] = [];
  for (let seed = 1; seed <= 30; seed++) {
    const rng = createRng(seed);
    const e = spawnAtCorner(level, rng, start);
    // Mid-chase or wherever it was, it vanishes to a corner.
    e.mode = 'chase';
    e.pos = cellCenter({ col: 12, row: 11 });
    const to = summonToGenerator(level, e, gen, rng);
    used.add(`${to.col},${to.row}`);
    if (!corners.some((c) => sameCell(c, to)) || !sameCell(worldToCell(e.pos), to) || dist(e.pos, gen) < ENEMY.teleportMinDist) okCorner = false;
    if (!e.goal || !e.path.length || (e.mode as string) !== 'investigate' || !e.rush) okPath = false;
    // Screams first: stands still for the windup.
    const at = { ...e.pos };
    for (let i = 0; i < ENEMY.windupSeconds * 60 - 2; i++) step(e, rng);
    if (dist(at, e.pos) > 1e-6) okPath = false;
    // Then sprints, ignoring a noise on the way, until it's at the generator.
    let t = ENEMY.windupSeconds;
    for (let i = 0; i < 60 * 60 && dist(e.pos, cellCenter(approach)) > 0.3; i++) {
      step(e, rng, i === 30 ? { pos: start, radius: 999 } : null);
      t += 1 / 60;
    }
    times.push(t);
    if (dist(e.pos, cellCenter(approach)) > 0.3) okPath = false;
  }
  check('it turns up at one of the corners, far from you', okCorner);
  check('a random corner each time (not always the same)', used.size >= 3, [...used].join(' '));
  check('screams in place, then runs a real path to the generator (noise does not distract it)', okPath);
  const minT = Math.min(...times);
  check('you get a few seconds to leave the room (≥ 4 s before it arrives)', minT >= 4, `fastest ${minT.toFixed(1)} s, slowest ${Math.max(...times).toFixed(1)} s`);
  // Sprint speed is the chase speed (0.9.6.2: the fuses' rage is only for chasing you, not this rush).
  const rng = createRng(9);
  const e = spawnAtCorner(level, rng, start);
  summonToGenerator(level, e, gen, rng);
  for (let i = 0; i < ENEMY.windupSeconds * 60 + 1; i++) step(e, rng);
  const a = { ...e.pos };
  for (let i = 0; i < 30; i++) step(e, rng);
  const v = dist(a, e.pos) / 0.5;
  check('it sprints at chase speed', Math.abs(v - ENEMY.speed.chase) < 0.3, `${v.toFixed(2)} m/s`);
  check('…and plays its run, not a fast walk', chooseEnemyClip('investigate', v, false) === 'run' && chooseEnemyClip('investigate', ENEMY.speed.investigate * 1.21, false) === 'walk' && RUN_THRESHOLD > ENEMY.speed.investigate * 1.21);
  // Seeing you on the way still means a chase.
  const e2 = spawnAtCorner(level, createRng(3), start);
  summonToGenerator(level, e2, gen, createRng(3));
  const facing = { pos: { x: e2.pos.x + e2.dir.x * 2, z: e2.pos.z + e2.dir.z * 2 }, flashlightOn: true, crouching: false };
  const ev = step(e2, createRng(4), null, facing);
  check('if it sees you on the way, it chases you', ev.includes('spotted') && e2.mode === 'chase' && !e2.rush);
}

section('Reading a note pauses the game (0.6.4)');
{
  check('world time stops while reading', worldTimeScale('reading') === 0 && worldTimeScale('playing') === 1);
  check('click (interact), Enter or Esc puts it down', closesNote({ interact: true, enter: false, escape: false }) && closesNote({ interact: false, enter: true, escape: false }) && closesNote({ interact: false, enter: false, escape: true }) && !closesNote({ interact: false, enter: false, escape: false }));
  check('closing the tab mid-read still asks first', guardLeave('reading'));
}
