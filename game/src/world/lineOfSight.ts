// Grid line-of-sight: samples along the segment and stops at the first wall.
import { Level, TILE, Vec2 } from './level';

export function lineOfSight(level: Level, a: Vec2, b: Vec2): boolean {
  const d = Math.hypot(b.x - a.x, b.z - a.z);
  const steps = Math.ceil(d / (TILE * 0.1));
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const x = a.x + (b.x - a.x) * t;
    const z = a.z + (b.z - a.z) * t;
    const col = Math.floor(x / TILE);
    const row = Math.floor(z / TILE);
    // Update 0.7 — walls block sight; stairwells (open to the floor below) don't.
    if (col < 0 || row < 0 || col >= level.cols || row >= level.rows || level.opaque[row * level.cols + col]) return false;
  }
  return true;
}
