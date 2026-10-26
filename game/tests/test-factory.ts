// Update 1.0.1 — Harrow Mill from the factory kit: the kit file has every piece the game asks for, every
// wall face gets one panel facing the room, the floors and roof cover the right cells, the steel stairs
// climb the way the flight goes, and a teammate taking the stairs isn't blended across the map.
import { readFileSync } from 'fs';
import { check, section } from './harness';
import { LEVEL_02 } from '../src/world/content/level02';
import { FACE_DIR, TILE, WALL_HEIGHT, WallFace, cellCenter, crossPortal, dist, floorAt, floorOffset, floorOfRow, isCorridor, isSolid, parseLevel, stairRise, worldToCell } from '../src/world/level';
import { moveWithCollision } from '../src/world/collision';
import { findPath } from '../src/world/pathfinding';
import { spawnAtCorner, stepEnemy } from '../src/world/enemyAI';
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
