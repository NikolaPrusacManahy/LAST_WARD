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
  check('grunts every 15–25 s', Math.min(...delays) >= 15 && Math.max(...delays) <= 25 && Math.max(...delays) - Math.min(...delays) > 8);
  check('red tint while injured, a hard red flash on impact', injuredTint(true, 99) > 0.3 && injuredTint(false, 0) === 1 && injuredTint(false, 99) === 0);
}

section('Thrown until a wall (0.6.1)');
{
  const cells = floorCells(level);
  const rng = createRng(6);
  let bad = 0;
  let notBehind = 0;
  let notStopped = 0;
  let n = 0;
  for (let i = 0; i < 300; i++) {
    const c = cellCenter(cells[Math.floor(rng() * cells.length)]);
    const from = { x: c.x + (rng() - 0.5) * TILE * 0.7, z: c.z + (rng() - 0.5) * TILE * 0.7 };
    if (overlapsWall(level, from, THROW.bodyRadius)) continue;
    const a = rng() * Math.PI * 2;
    const facing = { x: Math.sin(a), z: Math.cos(a) };
    const r = throwLanding(level, from, facing);
    n++;
    if (overlapsWall(level, r.at, THROW.bodyRadius) || !clearLine(level, from, r.at, THROW.bodyRadius - 0.01)) bad++;
    if (Math.abs(r.dir.x + facing.x) > 1e-9 || Math.abs(r.dir.z + facing.z) > 1e-9) notBehind++;
    // Stopped by a wall: one more step would touch it (unless the 10 m cap stopped it).
    const next = { x: r.at.x + r.dir.x * 0.1, z: r.at.z + r.dir.z * 0.1 };
    if (r.distance < THROW.maxDistance - 0.06 && !overlapsWall(level, next, THROW.bodyRadius)) notStopped++;
  }
  check('always straight out behind it (exactly 180° from where it looks)', notBehind === 0, `${notBehind}/${n}`);
  check('flies until a wall stops it (300 random throws)', notStopped === 0, `${notStopped}/${n}`);
  check('never ends inside a wall or passes through one', bad === 0, `${bad}/${n}`);
  // Long corridor (row 11) facing along it: capped at 10 m.
  const open = cellCenter({ col: 4, row: 11 });
  const far = throwLanding(level, open, { x: -1, z: 0 });
  check('a long empty corridor is capped at 10 m', Math.abs(far.distance - THROW.maxDistance) < 0.06, `${far.distance.toFixed(2)} m`);
  const short = throwLanding(level, cellCenter({ col: 1, row: 11 }), { x: 1, z: 0 }); // wall right behind it
  check('a wall right there stops you short', short.distance < 1.2, `${short.distance.toFixed(2)} m`);
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

section('Blacking out (0.6.1)');
{
  const { eyelids, EYELIDS, ENEMY_THROW_SPEED } = await import('../src/state/caughtSequence');
  check('eyes open until you hit the wall', eyelids(caughtTimes.impactAt - 0.01) === 0 && eyelids(caughtTimes.launchAt + 0.5) === 0);
  check('lids drift shut after the wall (not a snap)', eyelids(caughtTimes.impactAt + 0.3) > 0 && eyelids(caughtTimes.impactAt + 0.3) < 1 && eyelids(caughtTimes.impactAt + EYELIDS.close) === 1);
  let monotonic = true;
  let prev = 0;
  let dips = 0;
  for (let t = caughtTimes.impactAt; t <= caughtTimes.impactAt + EYELIDS.close; t += 0.02) {
    const v = eyelids(t);
    if (v < prev - 1e-9) dips++;
    if (v < 0 || v > 1) monotonic = false;
    prev = v;
  }
  check('they flutter (fighting to stay awake) but stay in range', dips > 0 && monotonic);
  check('it vanishes while your eyes are shut', eyelids(caughtTimes.teleportAt) === 1);
  check('the pose switch to the get-up happens with eyes shut', eyelids(caughtTimes.getUpAt - 0.01) === 1 && eyelids(caughtTimes.getUpAt) === 1);
  check('the get-up opens them again', eyelids(caughtTimes.getUpAt + EYELIDS.open + 0.01) === 0 && eyelids(caughtTimes.getUpAt + 0.4) < 1);
  check('its throw clip plays 1.5x slower', Math.abs(ENEMY_THROW_SPEED - 1 / 1.5) < 1e-12);
}
