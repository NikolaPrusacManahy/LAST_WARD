// Update 0.9.7 — "search by crawling": now and then it goes up on the ceiling and crawls the corridors.
import { readFileSync } from 'fs';
import { check, section } from './harness';
import { CRAWL, ENEMY, EnemyEvent, EnemyState, Noise, PlayerSense, cornerCells, crawlDownSeconds, crawlUpSeconds, createEnemy, dropFromCeiling, nearestCorridorCell, onTask, planCrawlRoute, stepEnemy } from '../src/world/enemyAI';
import { chooseEnemyClip, crawlPose } from '../src/engine/enemyAnim';
import { findPath } from '../src/world/pathfinding';
import { LEVEL_01 } from '../src/world/content/level01';
import { Cell, cellCenter, dist, floorCells, isCorridor, parseLevel, sameCell, worldToCell } from '../src/world/level';
import { createRng } from '../src/world/rng';

const level = parseLevel(LEVEL_01);
const at = (col: number, row: number) => cellCenter({ col, row });
// Out of the map: it can never see you.
const away: PlayerSense = { pos: { x: -100, z: -100 }, flashlightOn: false, crouching: true };
const step = (e: EnemyState, rng: () => number, noise: Noise | null = null, player: PlayerSense = away) =>
  stepEnemy(level, e, { dt: 1 / 60, player, noise, fuses: 0 }, rng);
/** An enemy already up on the ceiling at a corridor cell. */
const crawler = (col: number, row: number, rng: () => number) => {
  const e = createEnemy(level);
  e.pos = at(col, row);
  e.crawlCooldown = 0;
  e.idle = 1000; // standing still in the corridor: it goes up from there
  for (let i = 0; i < 120 * 60 && !e.crawl; i++) step(e, rng);
  for (let i = 0; i < 10 * 60 && e.crawl?.phase === 'up'; i++) step(e, rng);
  return e;
};

section('Corridors (0.9.7)');
{
  const corridor = floorCells(level).filter((c) => isCorridor(level, c));
  check('the corridors are marked (a ring, the middle hall, four short halls)', corridor.length > 100, `${corridor.length} cells`);
  check('every corridor links up along the ceilings (no room needed)', corridor.every((c) => findPath(level, { col: 1, row: 5 }, c, level.corridor).length > 0));
  const rooms: Cell[] = [{ col: 3, row: 2 }, { col: 12, row: 8 }, { col: 12, row: 14 }, { col: 4, row: 8 }, { col: 20, row: 14 }];
  const doorways: Cell[] = [{ col: 3, row: 4 }, { col: 12, row: 10 }, { col: 6, row: 9 }, { col: 5, row: 14 }, { col: 11, row: 16 }];
  check('rooms and their doorways are not corridor', [...rooms, ...doorways].every((c) => !isCorridor(level, c)));
  check('from anywhere, the nearest corridor cell is a corridor cell', floorCells(level).every((c) => isCorridor(level, nearestCorridorCell(level, cellCenter(c)))));
  check('from inside the spawn room, it is the hall just outside its door', sameCell(nearestCorridorCell(level, at(3, 2)), { col: 3, row: 5 }));
  check('from inside the generator room, the middle hall outside its door', sameCell(nearestCorridorCell(level, at(12, 8)), { col: 12, row: 11 }));
  check('a corridor path never goes into a room', findPath(level, { col: 1, row: 5 }, { col: 23, row: 17 }, level.corridor).every((c) => isCorridor(level, c)));
}

section('Going up (0.9.7)');
{
  const e = createEnemy(level);
  check('never in the first minute (the first crawl waits 60 s)', e.crawlCooldown === CRAWL.firstWait && CRAWL.firstWait === 60);
  e.pos = at(12, 5);
  e.idle = 1000;
  let up = false;
  const rng = createRng(1);
  for (let i = 0; i < 59 * 60 && !up; i++) up = step(e, rng).includes('crawlUp');
  check('…a corridor patrol for 59 s: it stays on the floor', !up && !e.crawl);
  // Once the cooldown is over: up within a minute in a corridor, never from a room.
  let ups = 0;
  let fromRoom = 0;
  for (let seed = 1; seed <= 20; seed++) {
    const r = createRng(seed);
    const a = createEnemy(level);
    a.pos = at(12, 5);
    a.crawlCooldown = 0;
    a.idle = 1000;
    for (let i = 0; i < 60 * 60 && !a.crawl; i++) step(a, r);
    if (a.crawl) ups++;
    const b = createEnemy(level);
    b.pos = at(3, 2); // the spawn room
    b.crawlCooldown = 0;
    b.idle = 1000;
    b.sinceSpotted = -1e6; // (no teleport to a corridor corner)
    for (let i = 0; i < 60 * 60 && !b.crawl; i++) step(b, r);
    if (b.crawl) fromRoom++;
  }
  check('patrolling a corridor once the cooldown is over, it goes up', ups === 20, `${ups}/20`);
  check('never from inside a room', fromRoom === 0);
  // The scream and the jump: standing still, then up.
  const c = createEnemy(level);
  c.pos = at(12, 5);
  c.crawlCooldown = 0;
  c.idle = 1000;
  const r = createRng(3);
  for (let i = 0; i < 120 * 60 && !c.crawl; i++) step(c, r);
  const from = { ...c.pos };
  let t = 0;
  while (c.crawl?.phase === 'up') {
    step(c, r);
    t += 1 / 60;
  }
  check('it screams and jumps on the spot (~2.6 s), then it is up', dist(from, c.pos) < 1e-6 && Math.abs(t - crawlUpSeconds) < 0.05 && c.crawl?.phase === 'on', `${t.toFixed(2)} s`);
  check('mode "crawl" while it is up there', c.mode === 'crawl');
}

section('On the ceiling (0.9.7)');
{
  const rng = createRng(5);
  const e = crawler(12, 5, rng);
  let inRoom = false;
  let travelled = 0;
  let onFor = 0;
  let teleported = false;
  e.sinceSpotted = 1000; // its teleport clock ran out long ago
  while (e.crawl?.phase === 'on') {
    const before = { ...e.pos };
    teleported = step(e, rng).includes('teleported') || teleported;
    travelled += dist(before, e.pos);
    onFor += 1 / 60;
    if (!isCorridor(level, worldToCell(e.pos))) inRoom = true;
  }
  check('it crawls along the corridors only, never into a room', !inRoom);
  check('at twice its running speed (8.6 m/s)', ENEMY.speed.crawl === 2 * ENEMY.speed.chase && Math.abs(travelled / onFor - ENEMY.speed.crawl) < 0.4, `${(travelled / onFor).toFixed(2)} m/s`);
  check('finding nothing, it comes down after 15–20 s', onFor >= CRAWL.minSeconds - 0.05 && onFor <= CRAWL.maxSeconds + 0.05, `${onFor.toFixed(1)} s`);
  check('no teleport while it is up there', !teleported && onTask(createEnemy(level)) === false);
  let landed = false;
  for (let i = 0; i < 5 * 60 && !landed; i++) {
    const ev = step(e, rng);
    landed = ev.includes('landed');
    teleported = ev.includes('teleported') || teleported;
  }
  check('…then the drop (~1.6 s) and it patrols again', landed && e.mode === 'patrol' && !e.crawl && !teleported);
  check('and it can\'t go up again for 40–70 s', CRAWL.cooldownMin === 40 && CRAWL.cooldownMax === 70 && e.crawlCooldown >= 40 && e.crawlCooldown <= 70);
  let later = false;
  for (let i = 0; i < 2 * 60 && !later; i++) later = step(e, rng).includes('teleported');
  check('once it is down, the teleport it owed happens', later);
}

section('Its whole route, planned when it gets up there (0.9.7)');
{
  const near = (a: Cell, b: Cell) => Math.abs(a.col - b.col) + Math.abs(a.row - b.row) === 1;
  const total = floorCells(level).filter((c) => isCorridor(level, c)).length;
  let okSteps = true;
  let worst = 1;
  for (let seed = 1; seed <= 20; seed++) {
    const route = planCrawlRoute(level, { col: 12, row: 5 }, 17 * ENEMY.speed.crawl, createRng(seed));
    if (!route.every((c, i) => isCorridor(level, c) && (i === 0 || near(route[i - 1], c)))) okSteps = false;
    const distinct = new Set(route.map((c) => `${c.col},${c.row}`)).size;
    worst = Math.min(worst, distinct / route.length);
  }
  check('one cell at a time, along the corridors only', okSteps);
  const route17 = planCrawlRoute(level, { col: 12, row: 5 }, 17 * ENEMY.speed.crawl, createRng(1));
  check('it is as long as the crawl (17 s at 8.6 m/s ≈ 146 m)', Math.abs((route17.length - 1) * 3 - 17 * ENEMY.speed.crawl) <= 3, `${route17.length} cells`);
  check('it sweeps new corridor nearly all the way (little doubling back)', worst > 0.85, `worst ${(worst * 100).toFixed(0)}% new cells`);
  const all = planCrawlRoute(level, { col: 1, row: 5 }, 600, createRng(2));
  check('given the time, every single corridor', new Set(all.map((c) => `${c.col},${c.row}`)).size === total, `${total} corridor cells`);
  // In the game: the route is set the moment it is up, and it follows it.
  const rng = createRng(21);
  const e = crawler(12, 5, rng);
  const planned = e.path.length;
  const seen = new Set<string>();
  while (e.crawl?.phase === 'on') {
    step(e, rng);
    const c = worldToCell(e.pos);
    seen.add(`${c.col},${c.row}`);
  }
  check('up there, the whole route is planned at once and crawled', planned > 40 && seen.size > 40, `${planned} planned, ${seen.size} different cells crawled`);
}

section('It finds you (0.9.7)');
{
  // Right under it: it sees you. It can't catch you until it has dropped.
  const rng = createRng(7);
  const e = crawler(12, 5, rng);
  const you: PlayerSense = { pos: { ...e.pos }, flashlightOn: false, crouching: false };
  const evs: EnemyEvent[] = [];
  let caughtBeforeLanding = false;
  for (let i = 0; i < 5 * 60 && !evs.includes('landed'); i++) {
    you.pos = { ...e.pos };
    const ev = step(e, rng, null, you);
    if (ev.includes('caught') && !ev.includes('landed')) caughtBeforeLanding = true;
    evs.push(...ev);
  }
  check('it sees you below: it screams and drops', evs.includes('spotted') && evs.includes('landed'));
  check('it can\'t catch you from the ceiling, only once it is down', !caughtBeforeLanding);
  check('…and chases you straight away (the drop was your head start)', e.mode === 'chase' && e.windup === 0);
  // It hears your footsteps (12 m away down the hall): down, and after you.
  const r2 = createRng(8);
  const h = crawler(12, 5, r2);
  const where = { x: h.pos.x + 8, z: h.pos.z };
  step(h, r2, { pos: where, radius: 6, step: true });
  let landed = false;
  for (let i = 0; i < 5 * 60 && !landed; i++) landed = step(h, r2).includes('landed');
  check('it hears your footsteps: it drops and chases where it heard you', landed && h.mode === 'chase' && !!h.lastKnown && dist(h.lastKnown, where) < 0.01);
  // Crouching makes no noise, and a noise it can't hear changes nothing.
  const r3 = createRng(9);
  const q = crawler(12, 5, r3);
  step(q, r3, { pos: { x: q.pos.x + 30, z: q.pos.z }, radius: 6, step: true });
  check('footsteps out of earshot: it keeps crawling', q.crawl?.phase === 'on' && q.crawl.then === 'patrol');
}

section('Something you did (0.9.7)');
{
  // A panel blows in the generator room: it crawls to the hall outside the door, drops there, runs in.
  const rng = createRng(11);
  const e = crawler(1, 5, rng);
  const bang = at(10, 8); // open floor in the generator room
  step(e, rng, { pos: bang, radius: 999, run: true });
  let inRoom = false;
  let landed = false;
  for (let i = 0; i < 20 * 60 && !landed; i++) {
    landed = step(e, rng).includes('landed');
    if (!landed && !isCorridor(level, worldToCell(e.pos))) inRoom = true;
  }
  check('it crawls over along the corridors (never into a room)', landed && !inRoom);
  check('…and drops at the hall outside the room\'s door', sameCell(worldToCell(e.pos), { col: 12, row: 11 }), `${worldToCell(e.pos).col},${worldToCell(e.pos).row}`);
  check('…then runs to the sound, whether it sees you or not', e.mode === 'investigate' && e.rush && !!e.goal && dist(e.goal, bang) < 1.5);
  let got = false;
  for (let i = 0; i < 10 * 60 && !got; i++) {
    step(e, rng);
    got = e.mode !== 'investigate';
  }
  check('…all the way into the room', got && dist(e.pos, bang) < 2);
  // A thrown bottle: it comes for you if you're near when it gets there (the lure still works).
  const r2 = createRng(12);
  const t = crawler(1, 11, r2);
  step(t, r2, { pos: at(20, 11), radius: 999, lure: true });
  check('something you threw counts too (it remembers it was a lure)', t.crawl?.then === 'noise' && !!t.crawl.noise?.lure);
}

section('The generator comes on while it is up (0.9.7)');
{
  check('on the floor: nothing to drop from (the usual summon)', !dropFromCeiling(createEnemy(level)));
  const rng = createRng(13);
  const e = crawler(12, 5, rng);
  check('up there: it drops first', dropFromCeiling(e));
  let landed = false;
  for (let i = 0; i < 5 * 60 && !landed; i++) landed = step(e, rng).includes('landed');
  const corner = cornerCells(level).some((c) => sameCell(c, worldToCell(e.pos)));
  check('…then the usual: at a far corner, screaming, about to sprint for the generator', landed && corner && e.mode === 'investigate' && e.rush && e.windup > 0);
}

section('How it looks (0.9.7)');
{
  check('on the floor: no ceiling pose', crawlPose(null) === null);
  const up0 = crawlPose({ phase: 'up', t: 0 })!;
  check('going up: it screams first, on the floor', up0.clip === 'scream' && up0.lift === 0 && up0.flip === 0);
  const jump = crawlPose({ phase: 'up', t: CRAWL.screamSeconds + 0.5 })!;
  check('…then the jump clip, still low', jump.clip === 'jumpUp' && jump.lift === 0 && Math.abs((jump.time ?? -1) - 0.5) < 1e-9);
  let rising = true;
  let last = 0;
  for (let t = CRAWL.screamSeconds; t <= crawlUpSeconds; t += 0.05) {
    const p = crawlPose({ phase: 'up', t })!;
    if (p.lift < last - 1e-9) rising = false;
    last = p.lift;
  }
  check('…it rises and turns over smoothly, up to the ceiling', rising && crawlPose({ phase: 'up', t: crawlUpSeconds })!.lift === 1 && crawlPose({ phase: 'up', t: crawlUpSeconds })!.flip === 1);
  check('up there: upside down, crawling', JSON.stringify(crawlPose({ phase: 'on', t: 3 })) === JSON.stringify({ lift: 1, flip: 1, clip: 'crawl', timeScale: crawlPose({ phase: 'on', t: 0 })!.timeScale }));
  const down = crawlPose({ phase: 'down', t: crawlDownSeconds })!;
  check('coming down: the jump backwards, ending on its feet', down.lift === 0 && down.flip === 0 && down.clip === 'jumpUp' && down.time === 0);
  check('the crawl clip in crawl mode', chooseEnemyClip('crawl', 8, false) === 'crawl');
  // The clips are in the model.
  const glb = readFileSync(new URL('../public/models/patient.glb', import.meta.url));
  const json = JSON.parse(glb.subarray(20, 20 + glb.readUInt32LE(12)).toString('utf8')) as { animations: { name: string }[] };
  const names = json.animations.map((a) => a.name);
  check('patient.glb has the crawl and jumpUp clips', names.includes('crawl') && names.includes('jumpUp'), names.join(' '));
}
