import { check, section } from './harness';
import { LEVEL_01 } from '../src/world/content/level01';
import { cellCenter, isSolid, parseLevel, TILE, worldToCell, dist } from '../src/world/level';
import { createEnemy, stepEnemy, visibility, heardNoise, ENEMY, EnemyEvent, enemySpeed } from '../src/world/enemyAI';
import { PLAYER, gaitNoise } from '../src/state/playerRules';
import { FUSES_NEEDED } from '../src/state/objectives';
import { overlapsWall } from '../src/world/collision';
import { createRng } from '../src/world/rng';

const level = parseLevel(LEVEL_01);
const farPlayer = { pos: cellCenter(level.playerStart), flashlightOn: false, crouching: true };

section('Enemy — patrol');
{
  const e = createEnemy(level);
  const rng = createRng(1);
  let inWall = false;
  let moved = 0;
  let last = { ...e.pos };
  for (let i = 0; i < 60 * 60; i++) {
    stepEnemy(level, e, { dt: 1 / 60, player: farPlayer, noise: null, fuses: 0 }, rng);
    const c = worldToCell(e.pos);
    if (isSolid(level, c.col, c.row)) inWall = true;
    moved += dist(last, e.pos);
    last = { ...e.pos };
  }
  check('wanders (moves > 20 m in 60 s)', moved > 20, `${moved.toFixed(1)} m`);
  check('never inside a wall', !inWall);
}

section('Enemy — determinism');
{
  const run = () => {
    const e = createEnemy(level);
    const rng = createRng(42);
    for (let i = 0; i < 600; i++) stepEnemy(level, e, { dt: 1 / 60, player: farPlayer, noise: null, fuses: 0 }, rng);
    return e.pos;
  };
  const a = run();
  const b = run();
  check('same seed → same position', a.x === b.x && a.z === b.z);
}

section('Enemy — perception');
{
  const e = createEnemy(level);
  // Put the player straight ahead (+z) in the same room, 6 m away.
  e.dir = { x: 0, z: -1 };
  const ahead = { pos: { x: e.pos.x, z: e.pos.z - 2.5 }, flashlightOn: true, crouching: false };
  check('sees a lit player in front', visibility(level, e, ahead) > 0);
  e.dir = { x: 0, z: 1 };
  check('0.9.8: right behind it, lit up: it doesn\'t notice (never from behind)', visibility(level, e, ahead) === 0);
  e.dir = { x: 1, z: 0 };
  check('…but close at its side it does (within the sense radius)', visibility(level, e, ahead) > 0);
  const behindFar = { pos: { x: e.pos.x + 4 * TILE, z: e.pos.z }, flashlightOn: true, crouching: false };
  e.dir = { x: -1, z: 0 };
  check('does not see behind at range', visibility(level, e, behindFar) === 0);
  const wallP = { pos: cellCenter(level.playerStart), flashlightOn: true, crouching: false };
  check('walls block sight', visibility(level, e, wallP) === 0);
  check('hears a sprint nearby', heardNoise(level, e, { pos: { x: e.pos.x + 3, z: e.pos.z }, radius: 15 }));
  check('silent crouch not heard', !heardNoise(level, e, { pos: { x: e.pos.x + 3, z: e.pos.z }, radius: 0 }));
  // 0.9.6.2 — crouching makes no footstep noise at all (Game only sends a noise when it's above 0), so it
  // can't hear you crouch-walk anywhere, through a wall or not. Walking is heard 12 m out, ~7 m through a wall.
  check('0.9.6.2: crouch-walking makes no noise at all', gaitNoise('crouch') === 0 && PLAYER.noise.crouch === 0);
  check('0.9.6.2: walking is heard through a wall only up close', PLAYER.noise.walk * ENEMY.hearingMul * ENEMY.muffledNoiseMul < 7.5);
}

section('Enemy — chase and catch');
{
  const e = createEnemy(level);
  const rng = createRng(7);
  e.dir = { x: 1, z: 0 };
  const p = { pos: { x: e.pos.x + 7, z: e.pos.z }, flashlightOn: true, crouching: false };
  const events: EnemyEvent[] = [];
  for (let i = 0; i < 600 && !events.includes('caught'); i++) {
    events.push(...stepEnemy(level, e, { dt: 1 / 60, player: p, noise: null, fuses: 0 }, rng));
    if (overlapsWall(level, e.pos, 0.3)) break;
  }
  check('spots a visible player', events.includes('spotted'));
  {
    const e2 = createEnemy(level);
    e2.dir = { x: 1, z: 0 };
    const p2 = { pos: { x: e2.pos.x + 2.5, z: e2.pos.z }, flashlightOn: true, crouching: false };
    const r2 = createRng(9);
    stepEnemy(level, e2, { dt: 1 / 60, player: p2, noise: null, fuses: 0 }, r2);
    const start = { ...e2.pos };
    for (let i = 0; i < 50; i++) stepEnemy(level, e2, { dt: 1 / 60, player: p2, noise: null, fuses: 0 }, r2);
    check('screams in place before charging (windup)', e2.mode === 'chase' && dist(start, e2.pos) < 1e-9 && e2.windup > 0);
    for (let i = 0; i < 40; i++) stepEnemy(level, e2, { dt: 1 / 60, player: p2, noise: null, fuses: 0 }, r2);
    check('charges after the windup', dist(start, e2.pos) > 0.5);
  }
  check('catches a player who stands still', events.includes('caught'));
}

section('Enemy — noise lures it');
{
  const e = createEnemy(level);
  const rng = createRng(3);
  const noisePos = { x: e.pos.x + 2 * TILE, z: e.pos.z };
  const ev = stepEnemy(level, e, { dt: 1 / 60, player: farPlayer, noise: { pos: noisePos, radius: 15 }, fuses: 0 }, rng);
  check('reacts to noise', ev.includes('heard') && e.mode === 'investigate');
  for (let i = 0; i < 300; i++) stepEnemy(level, e, { dt: 1 / 60, player: farPlayer, noise: null, fuses: 0 }, rng);
  check('walks to the noise', dist(e.pos, noisePos) < TILE * 3.5, `${dist(e.pos, noisePos).toFixed(1)} m`);
}

section('Enemy — rage (0.9.6.2: 4% per fuse, chase only)');
{
  const e = createEnemy(level);
  stepEnemy(level, e, { dt: 0.01, player: farPlayer, noise: null, fuses: FUSES_NEEDED }, createRng(1));
  const chase = enemySpeed({ ...e, mode: 'chase', rush: false });
  check('every fuse found → chase still slower than your sprint', chase < PLAYER.speed.sprint, chase.toFixed(2));
  check('…and faster than you walk', chase > PLAYER.speed.walk);
  check('4% per fuse', ENEMY.ragePerFuse === 0.04 && Math.abs(chase - ENEMY.speed.chase * (1 + FUSES_NEEDED * 0.04)) < 1e-9);
  check('patrol, search and investigate ignore the fuses (its patrol never outpaces your walk)',
    (['patrol', 'search', 'investigate'] as const).every((m) => enemySpeed({ ...e, mode: m, rush: false }) === ENEMY.speed[m]) &&
      enemySpeed({ ...e, mode: 'patrol', rush: false }) <= PLAYER.speed.walk);
  check('rushing somewhere is plain chase speed', enemySpeed({ ...e, mode: 'investigate', rush: true }) === ENEMY.speed.chase);
  check('outside a chase it walks slower than you (patrol, search, to a noise)', (['patrol', 'search', 'investigate'] as const).every((m) => enemySpeed({ ...e, mode: m, rush: false }) < PLAYER.speed.walk));
}
