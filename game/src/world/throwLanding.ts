// Update 0.6 — where The Patient throws you: behind it (opposite the way it faces), up to 3 m, at a
// spot with room for a body lying on the floor. Walls in the way → the best nearby angle instead.
import { clearLine, overlapsWall } from './collision';
import type { Level, Vec2 } from './level';

export const THROW = {
  distance: 3,
  minDistance: 1.2,
  /** Room needed around the landing spot (a body lying down + the camera in its head). */
  roomRadius: 0.9,
  /** Room along the flight path. */
  pathRadius: 0.35,
};

const rotate = (d: Vec2, a: number): Vec2 => ({ x: d.x * Math.cos(a) - d.z * Math.sin(a), z: d.x * Math.sin(a) + d.z * Math.cos(a) });

/** Best landing point from `from`, preferring straight behind the enemy (180° from where it faces). */
export function throwLanding(level: Level, from: Vec2, enemyFacing: Vec2): { at: Vec2; dir: Vec2 } {
  const len = Math.hypot(enemyFacing.x, enemyFacing.z) || 1;
  const back = { x: -enemyFacing.x / len, z: -enemyFacing.z / len };
  const angles = [0, 0.35, -0.35, 0.7, -0.7, 1.1, -1.1, 1.57, -1.57, 2.2, -2.2, Math.PI];
  for (const radius of [THROW.roomRadius, 0.6, 0.4]) {
    // Score: straight behind it matters most, distance second (2 m straight back beats 3 m at 40°).
    let best: { at: Vec2; dir: Vec2; score: number } | null = null;
    for (const a of angles) {
      const dir = rotate(back, a);
      for (let d = THROW.distance; d >= THROW.minDistance - 1e-9; d -= 0.3) {
        const at = { x: from.x + dir.x * d, z: from.z + dir.z * d };
        if (overlapsWall(level, at, radius) || !clearLine(level, from, at, THROW.pathRadius)) continue;
        const score = d - Math.abs(a) * 2.5;
        if (!best || score > best.score) best = { at, dir, score };
        break; // farthest valid distance at this angle
      }
    }
    if (best) return { at: best.at, dir: best.dir };
  }
  return { at: { ...from }, dir: back }; // boxed in: you drop where you are
}
