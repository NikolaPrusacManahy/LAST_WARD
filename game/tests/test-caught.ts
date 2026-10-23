// Update 0.6 — two lives: grab → throw → get up injured; the second catch kills.
import { check, section } from './harness';
import { CAUGHT, LIVES, THROWN_CLIP, caughtStage, caughtTimes, cuesBetween, flightProgress, injuredTint, nextGruntDelay, thrownClipTime } from '../src/state/caughtSequence';
import { throwLanding, THROW } from '../src/world/throwLanding';
import { cornerCells, spawnAtCorner, teleportAway } from '../src/world/enemyAI';
import { overlapsWall, clearLine } from '../src/world/collision';
import { LEVEL_01 } from '../src/world/content/level01';
import { TILE, Vec2, cellCenter, dist, floorCells, parseLevel, sameCell } from '../src/world/level';
import { lineOfSight } from '../src/world/lineOfSight';
import { createRng } from '../src/world/rng';

const level = parseLevel(LEVEL_01);

section('Lives + caught timeline (0.6)');
{
  check('two lives', LIVES === 2);
  check('thrown 1.5 s into its throw, floor impact 2.5 s into it', caughtTimes.launchAt - caughtTimes.throwAt === 1.5 && caughtTimes.impactAt - caughtTimes.throwAt === 2.5);
  check('grab → throw → flight → down → get up → done',
    caughtStage(0.5) === 'grab' && caughtStage(caughtTimes.throwAt + 0.1) === 'throw' && caughtStage(caughtTimes.launchAt + 0.1) === 'flight' &&
    caughtStage(caughtTimes.impactAt + 0.1) === 'down' && caughtStage(caughtTimes.getUpAt + 0.1) === 'getUp' && caughtStage(caughtTimes.endAt) === 'done');
  check('it vanishes after you land but before you are up', caughtTimes.teleportAt > caughtTimes.impactAt && caughtTimes.teleportAt < caughtTimes.getUpAt);
  // Every cue fires exactly once over a run at 60 fps.
  const fired: string[] = [];
  let prev = -1;
  for (let t = 0; t <= caughtTimes.endAt + 0.1; t += 1 / 60) {
    fired.push(...cuesBetween(prev, t));
    prev = t;
  }
  check('every cue fires once, in order', fired.join(',') === 'caught,throw,launch,impact,teleport,getUp,done', fired.join(','));
  check('the player clip flips in the air exactly while flying', Math.abs(thrownClipTime(caughtTimes.launchAt) - THROWN_CLIP.flipStart) < 1e-9 && Math.abs(thrownClipTime(caughtTimes.impactAt) - THROWN_CLIP.land) < 1e-9);
  check('flight starts fast and lands softly', flightProgress(caughtTimes.launchAt) === 0 && flightProgress(caughtTimes.impactAt) === 1 && flightProgress((caughtTimes.launchAt + caughtTimes.impactAt) / 2) > 0.5);
  check('get up takes 5 s', CAUGHT.getUp === 5);
}

section('Injured (0.6)');
{
  const r = createRng(3);
  const delays = Array.from({ length: 200 }, () => nextGruntDelay(r));
  check('grunts every 5–7 s', Math.min(...delays) >= 5 && Math.max(...delays) <= 7);
  check('red tint while injured, a hard red flash on impact', injuredTint(true, 99) > 0.3 && injuredTint(false, 0) === 1 && injuredTint(false, 99) === 0);
}

section('Throw landing (0.6)');
{
  const cells = floorCells(level);
  const rng = createRng(6);
  let bad = 0;
  let behind = 0;
  let n = 0;
  for (let i = 0; i < 300; i++) {
    const c = cellCenter(cells[Math.floor(rng() * cells.length)]);
    const from = { x: c.x + (rng() - 0.5) * TILE * 0.7, z: c.z + (rng() - 0.5) * TILE * 0.7 };
    if (overlapsWall(level, from, 0.4)) continue;
    const a = rng() * Math.PI * 2;
    const facing = { x: Math.sin(a), z: Math.cos(a) };
    const { at, dir } = throwLanding(level, from, facing);
    n++;
    if (overlapsWall(level, at, 0.4) || !clearLine(level, from, at, 0.3)) bad++;
    if (dir.x * -facing.x + dir.z * -facing.z > 0.7) behind++; // within ~45° of straight back
  }
  check('never lands in a wall or through one (300 random throws)', bad === 0, `${bad}/${n}`);
  check('mostly behind it (within 45° of 180° from where it faces)', behind / n > 0.75, `${behind}/${n}`);
  const open = cellCenter({ col: 12, row: 11 }); // middle of the long corridor
  const r1 = throwLanding(level, open, { x: 1, z: 0 });
  check('in the open: thrown the full 3 m straight back', Math.abs(dist(open, r1.at) - THROW.distance) < 1e-6 && r1.dir.x < -0.99);
}

section('Vanishes after the throw (0.6)');
{
  const start = cellCenter(level.playerStart);
  const corners = cornerCells(level);
  let ok = true;
  for (let seed = 1; seed <= 20; seed++) {
    const e = spawnAtCorner(level, createRng(seed), start);
    const r = createRng(seed + 100);
    const cells = floorCells(level);
    const p: Vec2 = cellCenter(cells[Math.floor(r() * cells.length)]);
    e.pos = { x: p.x + 1, z: p.z };
    e.mode = 'chase';
    teleportAway(level, e, p);
    const visible = lineOfSight(level, e.pos, p) && dist(e.pos, p) <= 25;
    const hiddenCornerExists = corners.some((c) => !lineOfSight(level, cellCenter(c), p) || dist(cellCenter(c), p) > 25);
    if (!corners.some((c) => sameCell(c, e.home)) || (e.mode as string) !== 'patrol' || (visible && hiddenCornerExists)) ok = false;
  }
  check('always to a corner you cannot see, back on patrol', ok);
  const e = spawnAtCorner(level, createRng(2), start);
  teleportAway(level, e, cellCenter(corners[0]));
  check('…the farthest hidden one from where you landed', dist(e.pos, cellCenter(corners[0])) > 20);
}

section('Dazed blink (0.6)');
{
  const { dazedBlink } = await import('../src/state/caughtSequence');
  check('eyes shut exactly when the pose switches to the get-up', dazedBlink(caughtTimes.getUpAt) === 1);
  check('open before and after', dazedBlink(caughtTimes.getUpAt - 0.5) === 0 && dazedBlink(caughtTimes.getUpAt + 0.6) === 0);
  check('opens gradually (dazed)', dazedBlink(caughtTimes.getUpAt + 0.3) > 0 && dazedBlink(caughtTimes.getUpAt + 0.3) < 1);
}
