// Update 0.6 — where The Patient throws you. Update 0.6.1 — you really fly: straight out until your body
// hits a wall, which stops you. Capped so a long corridor doesn't send you across the map.
// Update 0.9.7 — forward, the way it faces (it turns to throw), never back over its shoulder: down the
// middle of a corridor, or the way in a room with room to land (throwPlan).
import { Blocker, overlapsWall } from './collision';
import { Level, Vec2, cellCenter, isCorridor, worldToCell } from './level';

export const THROW = {
  /** Never further than this (m), even down a long empty corridor. */
  maxDistance: 10,
  /** Your body's size for the wall stop: the wall catches you when it touches this circle. */
  bodyRadius: 0.45,
  step: 0.05,
  /** Update 0.9.7 — it only throws you a way with at least this much room (m): a wall right there had you
   *  clipping into it. */
  minClear: 2,
  /** How far in front of it you leave its hands (m). */
  hands: 0.6,
};

/** Fly from `from` along `dir` until a wall stops you (or the cap).
 *  Update 0.9.6 — furniture (`blockers`: item tables, lockers…) stops you too: you used to land inside a
 *  table and be stuck there. */
export function throwLanding(level: Level, from: Vec2, dir: Vec2, blockers: Blocker[] = []): { at: Vec2; dir: Vec2; distance: number } {
  const len = Math.hypot(dir.x, dir.z) || 1;
  const d1 = { x: dir.x / len, z: dir.z / len };
  let d = 0;
  while (d + THROW.step <= THROW.maxDistance) {
    const next = { x: from.x + d1.x * (d + THROW.step), z: from.z + d1.z * (d + THROW.step) };
    if (overlapsWall(level, next, THROW.bodyRadius, blockers)) break; // the wall (or furniture) stops you
    d += THROW.step;
  }
  return { at: { x: from.x + d1.x * d, z: from.z + d1.z * d }, dir: d1, distance: d };
}

/**
 * Update 0.9.7 — which way it throws you, and from where. It turns to face that way and throws you forward.
 *  - In a corridor: straight down the hall (never into its side walls), from the middle of it, toward the
 *    end closest to where it was looking.
 *  - Elsewhere: of 16 ways round, the one closest to where it was looking with at least `minClear` of room.
 * If no way has that much room, the roomiest one.
 */
export function throwPlan(level: Level, enemyPos: Vec2, facing: Vec2, blockers: Blocker[] = []): { from: Vec2; dir: Vec2 } {
  const cell = worldToCell(enemyPos);
  const mid = cellCenter(cell);
  const corridor = isCorridor(level, cell);
  const ways: Vec2[] = corridor
    ? [{ x: 1, z: 0 }, { x: -1, z: 0 }, { x: 0, z: 1 }, { x: 0, z: -1 }].filter((d) => isCorridor(level, { col: cell.col + d.x, row: cell.row + d.z }))
    : Array.from({ length: 16 }, (_, i) => ({ x: Math.sin((i / 16) * Math.PI * 2), z: Math.cos((i / 16) * Math.PI * 2) }));
  const fl = Math.hypot(facing.x, facing.z) || 1;
  type Way = { from: Vec2; dir: Vec2; room: number; dot: number };
  let best: Way | null = null;
  let roomiest: Way | null = null;
  for (const dir of ways) {
    let from = { x: enemyPos.x + dir.x * THROW.hands, z: enemyPos.z + dir.z * THROW.hands };
    // Down the middle of the hall: the cross-hall coordinate is the corridor's middle line.
    if (corridor) from = dir.x !== 0 ? { x: from.x, z: mid.z } : { x: mid.x, z: from.z };
    if (overlapsWall(level, from, THROW.bodyRadius, blockers)) from = corridor ? mid : { ...enemyPos };
    const room = throwLanding(level, from, dir, blockers).distance;
    const way = { from, dir, room, dot: (dir.x * facing.x + dir.z * facing.z) / fl };
    if (room >= THROW.minClear && (!best || way.dot > best.dot)) best = way;
    if (!roomiest || room > roomiest.room) roomiest = way;
  }
  const pick = best ?? roomiest;
  return pick ? { from: pick.from, dir: pick.dir } : { from: { ...enemyPos }, dir: { x: facing.x / fl, z: facing.z / fl } };
}
