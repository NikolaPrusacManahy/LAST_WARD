// Update 0.6 — where The Patient throws you. Update 0.6.1 — you really fly: straight back (opposite
// the way it faces) until your body hits a wall, which stops you. Capped so a long corridor doesn't
// send you across the map.
import { Blocker, overlapsWall } from './collision';
import type { Level, Vec2 } from './level';

export const THROW = {
  /** Never further than this (m), even down a long empty corridor. */
  maxDistance: 10,
  /** Your body's size for the wall stop: the wall catches you when it touches this circle. */
  bodyRadius: 0.45,
  step: 0.05,
};

/** Fly from `from` straight out behind the enemy until a wall stops you (or the cap).
 *  Update 0.9.6 — furniture (`blockers`: item tables, lockers…) stops you too: you used to land inside a
 *  table and be stuck there. */
export function throwLanding(level: Level, from: Vec2, enemyFacing: Vec2, blockers: Blocker[] = []): { at: Vec2; dir: Vec2; distance: number } {
  const len = Math.hypot(enemyFacing.x, enemyFacing.z) || 1;
  // 180° from where it looks: over it and out behind it (the 0.6 spec), until a wall.
  const dir = { x: -enemyFacing.x / len, z: -enemyFacing.z / len };
  let d = 0;
  while (d + THROW.step <= THROW.maxDistance) {
    const next = { x: from.x + dir.x * (d + THROW.step), z: from.z + dir.z * (d + THROW.step) };
    if (overlapsWall(level, next, THROW.bodyRadius, blockers)) break; // the wall (or furniture) stops you
    d += THROW.step;
  }
  return { at: { x: from.x + dir.x * d, z: from.z + dir.z * d }, dir, distance: d };
}
