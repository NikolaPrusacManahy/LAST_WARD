// Update 1.0.1 — every map you can pick is playable: the same checks the hospital has always had (paths,
// items, props, panels, lockers, co-op spawns), run on each map, so a new map can't ship broken.
import { check, section } from './harness';
import { LEVELS, levelId } from '../src/world/content/levels';
import { TILE, cellCenter, dist, floorStride, isCorridor, isSolid, itemPos, parseLevel, worldToCell } from '../src/world/level';
import { PROPS, backedByWall, lockerSpots, panelSpots, panelSwitches, placedProps, propBlockers, propFront } from '../src/world/props';
import { reachable } from '../src/world/pathfinding';
import { moveWithCollision, overlapsWall, BLOCKER_RADIUS } from '../src/world/collision';
import { findTarget } from '../src/world/interact';
import { cornerCells } from '../src/world/enemyAI';
import { FUSES_NEEDED, PANEL_COUNT, createProgress } from '../src/state/objectives';
import { promptFor } from '../src/state/prompts';
import { LOCKER } from '../src/state/hiding';
import { PLAYER } from '../src/state/playerRules';
import { spawnSpot } from '../src/state/coop';
import { spawnThrowables } from '../src/state/throwables';

for (const def of LEVELS) {
  section(`Map: ${def.name} (1.0.1)`);
  const level = parseLevel(def);
  const key = (c: { col: number; row: number }) => c.row * level.cols + c.col;
  const fromStart = reachable(level, level.playerStart);
  const placed = placedProps(level);
  const cabinets = level.items.map((i) => itemPos(level, i.cell));

  check('has an id, a name for the picker and a line about it', !!levelId(def) && !!def.name && !!def.blurb);
  check(`${FUSES_NEEDED} fuses; every item reachable from the start`, level.items.filter((i) => i.kind === 'fuse').length === FUSES_NEEDED && level.items.every((i) => fromStart.has(key(i.cell))));
  check('the generator and the exit can be walked up to', [level.generator, level.exit].every((g) => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dc, dr]) => fromStart.has(key({ col: g.col + dc, row: g.row + dr })))));
  check('every floor cell can be reached (no sealed rooms)', fromStart.size === level.solid.filter((s) => !s).length - 0, `${fromStart.size} of ${level.solid.filter((s) => !s).length}`);
  check('lamps ≤ 8 (point-light budget)', level.lamps.length <= 8, `${level.lamps.length}`);
  check('every note has its text', level.items.filter((i) => i.kind === 'note').every((i) => !!level.notes[i.noteIndex!]));
  check('every item table is pushed against a wall', level.items.every((i) => dist(itemPos(level, i.cell), cellCenter(i.cell)) > 1));
  check('you start far from The Patient', dist(cellCenter(level.playerStart), cellCenter(level.enemyStart)) > 20);
  check('four corners on each floor for it to patrol', cornerCells(level).length === 4 * level.floors);
  check('corridors for it to crawl along', level.corridor.some(Boolean));

  // Props.
  check('every wall-mounted prop really has a wall behind it', level.props.every((p) => backedByWall(level, p)), level.props.filter((p) => !backedByWall(level, p)).map((p) => `${p.kind}@${p.cell.col},${p.cell.row}`).join(' '));
  const floorProps = placed.filter((p) => PROPS[p.kind].blocks && p.y < 0.5);
  const offCentre = floorProps.filter((p) => {
    const c = cellCenter(worldToCell(p));
    return Math.hypot(Math.max(0, Math.abs(c.x - p.x) - p.hx), Math.max(0, Math.abs(c.z - p.z) - p.hz)) < 0.4;
  });
  check('furniture stays off the cell centres (The Patient walks through them)', offCentre.length === 0, offCentre.map((p) => p.kind).join(' '));
  const inWall = floorProps.filter((p) =>
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].some(([sx, sz]) => {
      const c = worldToCell({ x: p.x + sx * (p.hx - 0.02), z: p.z + sz * (p.hz - 0.02) });
      return isSolid(level, c.col, c.row);
    }),
  );
  check('nothing pokes into a wall', inWall.length === 0, inWall.map((p) => p.kind).join(' '));
  const onCabinet = floorProps.filter((p) => cabinets.some((c) => Math.abs(c.x - p.x) < p.hx + BLOCKER_RADIUS && Math.abs(c.z - p.z) < p.hz + BLOCKER_RADIUS));
  check('no prop sits on an item table', onCabinet.length === 0, onCabinet.map((p) => `${p.kind}@${worldToCell(p).col},${worldToCell(p).row}`).join(' '));
  let overlaps = 0;
  for (let i = 0; i < floorProps.length; i++)
    for (let j = i + 1; j < floorProps.length; j++) {
      const a = floorProps[i];
      const b = floorProps[j];
      if (Math.abs(a.x - b.x) < a.hx + b.hx - 0.01 && Math.abs(a.z - b.z) < a.hz + b.hz - 0.01) overlaps++;
    }
  check('props don\'t overlap each other', overlaps === 0, `${overlaps}`);
  const blockers = [...cabinets, ...propBlockers(placed)];
  let stuck = 0;
  for (const k of fromStart) {
    const c = cellCenter({ col: k % level.cols, row: Math.floor(k / level.cols) });
    if (dist(moveWithCollision(level, c, 0.01, 0.01, PLAYER.radius, blockers), c) < 0.005) stuck++;
  }
  check('every cell centre is free to stand in', stuck === 0, `${stuck} blocked`);

  // Panels: four, one per quarter, spread out, each switch beside its box and facing the room.
  const panels = panelSpots(level);
  const switches = panelSwitches(level);
  check(`${PANEL_COUNT} panels, each with a switch beside it`, panels.length === PANEL_COUNT && switches.length === PANEL_COUNT && panels.every((p, i) => dist(p, switches[i]) < 1.5));
  // Quarters of the map seen from above, whatever floor a panel is on.
  const northHalf = (p: { x: number; z: number }) => (worldToCell(p).row % floorStride(level)) < level.floorRows / 2;
  const quarters = new Set(panels.map((p) => `${p.x < (level.cols * TILE) / 2 ? 'W' : 'E'}${northHalf(p) ? 'N' : 'S'}`));
  check('one panel in each quarter of the map', quarters.size === 4, [...quarters].join(' '));
  let gap = Infinity;
  for (let i = 0; i < panels.length; i++) for (let j = i + 1; j < panels.length; j++) gap = Math.min(gap, dist(panels[i], panels[j]));
  check('panels are spread out (≥ 15 m apart)', gap >= 15, `${gap.toFixed(1)} m`);
  const targets = switches.map((s, i) => {
    const out = { x: -Math.sin(s.yaw), z: -Math.cos(s.yaw) };
    const stand = { x: s.x + out.x * 1.1, z: s.z + out.z * 1.1 };
    const look = (p: { x: number; z: number }) => ({ x: (p.x - stand.x) / dist(stand, p), z: (p.z - stand.z) / dist(stand, p) });
    const atSwitch = findTarget(level, stand, look(s), []);
    const atBox = findTarget(level, stand, look(panels[i]), []);
    return atSwitch?.type === 'switch' && atSwitch.index === i && atBox?.type === 'panel' && atBox.index === i;
  });
  check('standing at each panel: the switch and the box can each be picked', targets.every(Boolean), targets.join(' '));

  // Lockers: you step out into open floor, facing one says Hide, its back is to a wall.
  const lockers = lockerSpots(level);
  const bad = lockers.filter((l, i) => {
    const f = propFront(l);
    const out = { x: l.x + f.x * LOCKER.exitOut, z: l.z + f.z * LOCKER.exitOut };
    const others = propBlockers(placed.filter((p) => !(p.kind === 'locker' && p.x === l.x && p.z === l.z)));
    const stand = { x: l.x + f.x * 1.3, z: l.z + f.z * 1.3 };
    const t = findTarget(level, stand, { x: -f.x, z: -f.z }, []);
    const behind = worldToCell({ x: l.x - f.x * 0.9, z: l.z - f.z * 0.9 });
    return overlapsWall(level, out, PLAYER.radius, [...others, ...cabinets]) || t?.type !== 'locker' || t.index !== i || promptFor(t, createProgress(), false)?.verb !== 'hide' || !isSolid(level, behind.col, behind.row);
  });
  check(`${lockers.length} lockers, every one usable`, lockers.length >= 10 && bad.length === 0, bad.map((l) => `${worldToCell(l).col},${worldToCell(l).row}`).join(' '));
  check('some lockers in the corridors (somewhere to go when it\'s on you)', lockers.filter((l) => isCorridor(level, worldToCell(l))).length >= 3);

  // Bricks and bottles on open floor; co-op players wake up side by side, clear of everything.
  const throwables = spawnThrowables(level.throwables);
  check('bricks and bottles lie on open floor, clear of the walls', throwables.length > 0 && throwables.every((t) => !overlapsWall(level, t.pos, 0.15)));
  const spots = [0, 1, 2].map((s) => spawnSpot(level, s, PLAYER.radius));
  check('co-op: three spawn spots, apart and clear', spots.every((p) => !overlapsWall(level, p, PLAYER.radius, blockers)) && dist(spots[0], spots[1]) > 0.8 && dist(spots[0], spots[2]) > 0.8);
}
