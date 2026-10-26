// Update 1.0.1 — Harrow Mill from the factory kit: the kit file has every piece the game asks for, every
// wall face gets one panel facing the room, the floors and roof cover the right cells, the steel stairs
// climb the way the flight goes, and a teammate taking the stairs isn't blended across the map.
import { readFileSync } from 'fs';
import { check, section } from './harness';
import { LEVEL_02 } from '../src/world/content/level02';
import { LEVEL_01 } from '../src/world/content/level01';
import { FACE_DIR, TILE, WALL_HEIGHT, WallFace, cellCenter, crossPortal, dist, floorAt, floorOffset, floorOfRow, isCorridor, isSolid, parseLevel, portalAt, stairRise, worldToCell } from '../src/world/level';
import { moveWithCollision } from '../src/world/collision';
import { findPath } from '../src/world/pathfinding';
import { ENEMY, enemySpeed, inShaft, nearestCorridorCell, planCrawlRoute, spawnAtCorner, stepEnemy, tuningFor } from '../src/world/enemyAI';
import { CRAWL_LIFT, crawlShaft } from '../src/engine/enemyAnim';
import { PLAYER } from '../src/state/playerRules';
import { createRng } from '../src/world/rng';
import { PANEL_STRETCH, busyFaces, floorTiles, liningFaces, roofTiles, stairPlacements } from '../src/world/factory';
import { PROPS, PropKind } from '../src/world/props';
import { PROP_CREDIT } from '../src/state/credits';
import { LiveState, TRACK_JUMP, addToTrack, createTrack, sampleTrack } from '../src/state/coopRun';

/** The node names in a .glb (its JSON chunk). */
function glbNodes(path: URL): Set<string> {
  const buf = readFileSync(path);
  const len = buf.readUInt32LE(12);
  const json = JSON.parse(buf.subarray(20, 20 + len).toString('utf8')) as { nodes: { name?: string }[] };
  return new Set(json.nodes.map((n) => n.name ?? ''));
}

const level = parseLevel(LEVEL_02);

section('The factory kit (1.0.1)');
{
  const nodes = glbNodes(new URL('../public/models/props/factory_kit.glb', import.meta.url));
  const kitProps = (Object.keys(PROPS) as PropKind[]).filter((k) => PROPS[k].kit);
  const built = ['wall', 'wall_window', 'wall_arch', 'floor', 'grate', 'roof', 'stairs', 'lamp', 'shelf'];
  const want = [...kitProps, ...built];
  check('every piece the game asks for is in factory_kit.glb', want.every((n) => nodes.has(n)), want.filter((n) => !nodes.has(n)).join(' '));
  check('its props are credited to the kit', kitProps.length >= 8 && kitProps.every((k) => PROP_CREDIT[k] === 'factory'));
}

section('Harrow Mill: a kit panel on every wall face (1.0.1)');
{
  const faces = liningFaces(level);
  const busy = busyFaces(level);
  const sides: WallFace[] = ['north', 'east', 'south', 'west'];
  // Which face each panel is on: the side its back is to, and the open cell in front of it.
  const where = faces.map((f) => {
    const front = { x: Math.cos(f.yaw), z: -Math.sin(f.yaw) };
    const side = sides.find((s) => Math.abs(FACE_DIR[s].dc + front.x) < 1e-6 && Math.abs(FACE_DIR[s].dr + front.z) < 1e-6);
    const d = side ? FACE_DIR[side] : { dc: 0, dr: 0 };
    const cell = worldToCell({ x: f.x - d.dc * 0.5, z: f.z - d.dr * 0.5 });
    return { side, cell, key: `${cell.col},${cell.row},${side}` };
  });
  check('each panel faces straight into its room', where.every((w) => !!w.side));
  check('one panel per face, no doubles', new Set(where.map((w) => w.key)).size === faces.length, `${faces.length} panels`);
  const have = new Set(where.map((w) => w.key));
  let bare = 0;
  for (let row = 0; row < level.rows; row++) {
    for (let col = 0; col < level.cols; col++) {
      if (floorOfRow(level, row) < 0 || level.opaque[row * level.cols + col]) continue;
      for (const s of sides) {
        const wc = col + FACE_DIR[s].dc;
        const wr = row + FACE_DIR[s].dr;
        if (!level.opaque[wr * level.cols + wc]) continue;
        const special = (wc === level.generator.col && wr === level.generator.row) || (wc === level.exit.col && wr === level.exit.row);
        if (!special && !have.has(`${col},${row},${s}`)) bare++;
      }
    }
  }
  check('every wall face that looks onto the floor is covered', bare === 0, `${bare} bare`);
  const onSpecial = where.filter((w) => {
    const d = FACE_DIR[w.side!];
    const c = { col: w.cell.col + d.dc, row: w.cell.row + d.dr };
    return (c.col === level.generator.col && c.row === level.generator.row) || (c.col === level.exit.col && c.row === level.exit.row);
  });
  check('no panel over the generator or the exit door', onSpecial.length === 0);
  check('where something hangs or stands (panels, lockers, tables, notes), a plain panel', busy.size > 30 && where.every((w, i) => !busy.has(w.key) || faces[i].piece === 'wall'));
  const kinds = new Set(faces.map((f) => f.piece));
  check('plain walls, windows and arched windows', kinds.has('wall') && kinds.has('wall_window') && kinds.has('wall_arch'));
  const backs = faces.map((f, i) => {
    const c = cellCenter(where[i].cell);
    const d = FACE_DIR[where[i].side!];
    const half = f.piece === 'wall_arch' ? 0.16 : 0.047;
    return TILE / 2 - ((f.x - c.x) * d.dc + (f.z - c.z) * d.dr) - half;
  });
  check('each panel\'s back stands 1 cm out from the wall (its face is the back plane)', backs.every((b) => Math.abs(b - 0.01) < 1e-6));
  check('stretched to the 3.2 m wall', Math.abs(PANEL_STRETCH * 3 - WALL_HEIGHT) < 1e-9);
}

section('Harrow Mill: floors, roof and stairs (1.0.1)');
{
  const tiles = floorTiles(level);
  const open = level.solid.filter((s, i) => !s && !level.opaque[i] && !level.voids[i]).length;
  check('a concrete slab or grating on every floor cell', tiles.length === open, `${tiles.length} of ${open}`);
  check('grating only on the gantry upstairs', tiles.filter((t) => t.grate).length > 5 && tiles.every((t) => !t.grate || (floorOfRow(level, worldToCell(t).row) === 1 && isCorridor(level, worldToCell(t)))));
  const roof = roofTiles(level);
  const stairCells = new Set(level.stairs.flatMap((s) => s.cells.map((c) => `${c.col},${c.row}`)));
  check('roof plates everywhere but over the stairs (open to the floor above)', roof.length > 300 && !roof.some((r) => stairCells.has(`${worldToCell(r).col},${worldToCell(r).row}`)));
  const stairs = stairPlacements(level);
  check('two flights, one kit stair each', level.stairs.length === 2 && stairs.length === 2);
  check('each climbs the way its flight goes (its own -x turned onto the flight)', stairs.every((s, i) => {
    const d = FACE_DIR[level.stairs[i].dir];
    return Math.abs(-Math.cos(s.yaw) - d.dc) < 1e-6 && Math.abs(Math.sin(s.yaw) - d.dr) < 1e-6;
  }));
  check('stretched to climb exactly one floor', stairs.every((s) => Math.abs(s.scale[1] * 3.31 - WALL_HEIGHT) < 1e-6));
}

section('A teammate taking the stairs is not blended across the map (1.0.1)');
{
  const at = (t: number, x: number, z: number, rise: number): LiveState => ({ ...createTrack().snaps[0], t, pos: { x, z }, sense: { x, z }, rise, yaw: 0, pitch: 0 }) as LiveState;
  const tr = createTrack();
  addToTrack(tr, at(1, 22.5, 7.5, 3), 1);
  // The top step: the next update has them on the floor above, 21 rows (63 m) further down the grid.
  addToTrack(tr, at(1.1, 22.5, 70.5, 0), 1.1);
  const mid = sampleTrack(tr, 1.05 + tr.offset, 0)!;
  check(`a jump of more than ${TRACK_JUMP} m: shown where they landed, not halfway`, mid.pos.z === 70.5);
  const walk = createTrack();
  addToTrack(walk, at(1, 22.5, 7.5, 0), 1);
  addToTrack(walk, at(1.1, 23.1, 7.5, 0), 1.1);
  const w = sampleTrack(walk, 1.05 + walk.offset, 0)!;
  check('a step is still blended', w.pos.x > 22.5 && w.pos.x < 23.1);
}

section('Harrow Mill: up and down the steel stairs (1.0.1)');
{
  const UP = level.floorRows + 2;
  const real = (p: { x: number; z: number }) => {
    const o = floorOffset(level, floorAt(level, p));
    return { x: p.x, y: o.y + stairRise(level, p), z: p.z + o.z };
  };
  const walk = (from: { x: number; z: number }, dz: number, seconds: number) => {
    let p = { ...from };
    let jump = 0;
    let prev = real(p);
    for (let i = 0; i < seconds * 60; i++) {
      p = crossPortal(level, moveWithCollision(level, p, 0, dz / 60, PLAYER.radius)).pos;
      const r = real(p);
      jump = Math.max(jump, Math.hypot(r.x - prev.x, r.y - prev.y, r.z - prev.z));
      prev = r;
    }
    return { p, jump };
  };
  for (const col of [7, 19]) {
    const up = walk(cellCenter({ col, row: 4 }), -PLAYER.speed.walk, 4);
    check(`the stair at the top of the ${col === 7 ? 'west' : 'east'} corridor takes you up to the gantry, smoothly`, floorAt(level, up.p) === 1 && Math.abs(real(up.p).y - WALL_HEIGHT) < 1e-6 && up.jump < 0.2, `${up.jump.toFixed(3)} m`);
    const down = walk(up.p, PLAYER.speed.walk, 4);
    check('…and back down', floorAt(level, down.p) === 0 && real(down.p).y === 0 && down.jump < 0.2);
  }
  // It follows: a panel blows in the control room upstairs while it's in the warehouse; it runs there,
  // up a stair, never through a wall or a floor.
  const hidden = { pos: { x: -100, z: -100 }, flashlightOn: false, crouching: true };
  const rng = createRng(5);
  const e = spawnAtCorner(level, rng, cellCenter(level.playerStart));
  e.pos = cellCenter({ col: 13, row: 13 });
  const goal = { col: 24, row: UP + 2 };
  check('its path upstairs goes through a stair', findPath(level, worldToCell(e.pos), goal).some((c) => floorAt(level, cellCenter(c)) === 1));
  let inWall = 0;
  let arrived = false;
  for (let i = 0; i < 60 * 60 && !arrived; i++) {
    const noise = i === 0 ? { pos: cellCenter(goal), radius: 999, run: true } : null;
    stepEnemy(level, e, { dt: 1 / 60, player: hidden, noise, fuses: 0 }, rng);
    const c = worldToCell(e.pos);
    if (isSolid(level, c.col, c.row)) inWall++;
    arrived = floorAt(level, e.pos) === 1 && dist(e.pos, cellCenter(goal)) < 3;
  }
  check('The Patient climbs up to the control room, never through a wall or floor', arrived && inWall === 0, `${arrived ? 'arrived' : `stuck at ${worldToCell(e.pos).col},${worldToCell(e.pos).row}`}, ${inWall} frames in walls`);
}

section('Harrow Mill: its pace, and crawling on up the stairs (1.0.2)');
{
  const tune = tuningFor(level);
  const ward = tuningFor(parseLevel(LEVEL_01));
  check('it patrols half as fast again here (Ward 13 as before)', enemySpeed({ mode: 'patrol', rush: false, rage: 0 }, tune.patrolSpeed) === ENEMY.speed.patrol * 1.5 && ward.patrolSpeed === 1);
  check('…only the patrol: its chase is the same', enemySpeed({ mode: 'chase', rush: false, rage: 0 }, tune.patrolSpeed) === ENEMY.speed.chase);
  // Its crawls: 5–10 s longer here.
  const crawlFor = (lv: ReturnType<typeof parseLevel>, seed: number) => {
    const rng = createRng(seed);
    const e = spawnAtCorner(lv, rng, cellCenter(lv.playerStart));
    e.pos = cellCenter({ col: lv === level ? 7 : 1, row: 12 });
    e.crawlCooldown = 0;
    e.idle = 0;
    for (let i = 0; i < 60 * 60 && !e.crawl; i++) stepEnemy(lv, e, { dt: 1 / 60, player: { pos: { x: -100, z: -100 }, flashlightOn: false, crouching: true }, noise: null, fuses: 0 }, rng);
    return e.crawl?.left ?? -1;
  };
  const here = [1, 2, 3, 4, 5, 6].map((s) => crawlFor(level, s));
  const there = [1, 2, 3, 4, 5, 6].map((s) => crawlFor(parseLevel(LEVEL_01), s));
  check('each crawl lasts 20–30 s here (15–20 s and 5–10 more)', here.every((t) => t >= 20 && t <= 30), here.map((t) => t.toFixed(1)).join(' '));
  check('…and still 15–20 s in Ward 13', there.every((t) => t >= 15 && t <= 20), there.map((t) => t.toFixed(1)).join(' '));

  // The stairwells join the crawl's corridors: a route sweeps both floors, through the stairs' portals.
  const route = planCrawlRoute(level, { col: 7, row: 10 }, 400, createRng(9));
  const floors = new Set(route.map((c) => floorAt(level, cellCenter(c))));
  check('a long crawl sweeps both floors', floors.has(0) && floors.has(1));
  check('it never stops in a stair\'s portal cell (stepping in is the other floor)', !route.some((c) => !!portalAt(level, c)));
  check('step by step along the corridors, or through a stair', route.every((c, i) => i === 0 || (Math.abs(c.col - route[i - 1].col) + Math.abs(c.row - route[i - 1].row) === 1) || level.portals.some((p) => p.to.col === c.col && p.to.row === c.row)));
  let dropsInShaft = 0;
  for (let row = 0; row < level.rows; row++) for (let col = 0; col < level.cols; col++) if (!isSolid(level, col, row) && inShaft(level, nearestCorridorCell(level, cellCenter({ col, row })))) dropsInShaft++;
  check('a noise never calls it down into a stairwell', dropsInShaft === 0);

  // The climb, drawn: round the edge, up the wall, over onto the ceiling upstairs; both ends meet the crawl.
  const run = level.stairs[0];
  const d = FACE_DIR[run.dir];
  const first = cellCenter(run.cells[0]);
  const at = (along: number) => ({ x: first.x + d.dc * (along - TILE / 2), z: first.z + d.dr * (along - TILE / 2) });
  const upDir = { x: d.dc, z: d.dr };
  const start = crawlShaft(level, at(1e-6), upDir)!;
  const end = crawlShaft(level, at(TILE - 1e-6), upDir)!;
  check('at the bottom: on the ceiling below, as in the corridor (feet CRAWL_LIFT up, not tipped)', Math.abs(start.y - CRAWL_LIFT) < 1e-4 && Math.abs(start.tilt) < 1e-4);
  check('at the top: on the ceiling upstairs (a floor higher)', Math.abs(end.y - (WALL_HEIGHT + CRAWL_LIFT)) < 1e-3 && Math.abs(end.tilt) < 1e-6);
  const poses = Array.from({ length: 301 }, (_, i) => crawlShaft(level, at(Math.min(TILE - 1e-6, Math.max(1e-6, (i / 300) * TILE))), upDir)!);
  check('upright on the wall on the way (tipped a quarter turn, head up)', poses.some((p) => Math.abs(p.tilt + Math.PI / 2) < 1e-6));
  let jump = 0;
  for (let i = 1; i < poses.length; i++) jump = Math.max(jump, Math.hypot(poses[i].x - poses[i - 1].x, poses[i].y - poses[i - 1].y, poses[i].z - poses[i - 1].z));
  check('a smooth climb, no jumps', jump < 0.1, `${jump.toFixed(3)} m`);
  const down = crawlShaft(level, at(TILE / 2), { x: -d.dc, z: -d.dr })!;
  check('coming down it goes head first (tipped the other way)', down.tilt > 0);

  // On the ceiling with a route up the west stair: it climbs to the gantry; called down half way up the
  // stairwell, it climbs on out before it drops.
  const away = { pos: { x: -100, z: -100 }, flashlightOn: false, crouching: true };
  const crawlUp = (seed: number, callDownInShaft: boolean) => {
    const rng = createRng(seed);
    const e = spawnAtCorner(level, rng, cellCenter(level.playerStart));
    e.mode = 'crawl';
    e.pos = cellCenter({ col: 7, row: 5 });
    e.dir = { x: 0, z: -1 };
    e.crawl = { phase: 'on', t: 0, left: 30, then: 'patrol', noise: null };
    e.path = findPath(level, { col: 7, row: 5 }, { col: 12, row: level.floorRows + 2 + 1 }, level.corridor);
    e.pathIndex = 1;
    let up = false;
    let dropIn = false;
    let calledAt: string | null = null;
    for (let i = 0; i < 20 * 60 && e.crawl; i++) {
      const c = worldToCell(e.pos);
      if (callDownInShaft && !calledAt && inShaft(level, c) && crawlShaft(level, e.pos, e.dir)!.tilt < -1) {
        e.crawl.then = 'chase'; // it spots you while it's upright on the wall
        calledAt = `${c.col},${c.row}`;
      }
      const was = e.crawl.phase;
      stepEnemy(level, e, { dt: 1 / 60, player: away, noise: null, fuses: 0 }, rng);
      if (floorAt(level, e.pos) === 1) up = true;
      if (e.crawl && was === 'on' && e.crawl.phase === 'down' && inShaft(level, worldToCell(e.pos))) dropIn = true;
    }
    return { up, dropIn, calledAt, end: worldToCell(e.pos) };
  };
  const free = crawlUp(4, false);
  check('crawling up the stair it reaches the gantry', free.up && !free.dropIn);
  const called = crawlUp(4, true);
  check('called down while upright on the wall, it climbs on out to the landing before it drops', !!called.calledAt && !called.dropIn && floorAt(level, cellCenter(called.end)) === 1, `called at ${called.calledAt}, came down at ${called.end.col},${called.end.row}`);
}
