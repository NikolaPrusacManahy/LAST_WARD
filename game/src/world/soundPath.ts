// Update 0.9.4 — how The Patient's sound reaches you. Two ways: straight through the walls between
// you (each wall eats most of it), or round through the open halls (longer, so quieter, and bent
// round corners). Pure (tested); audio/spatial.ts turns it into loudness and muffling.
import { Level, TILE, Vec2, cellCenter, dist, worldToCell } from './level';
import { findPath } from './pathfinding';
import { lineOfSight } from './lineOfSight';

export interface SoundPath {
  /** Straight-line distance (m). */
  straight: number;
  /** Walls the straight line passes through (each solid run counts once). */
  walls: number;
  /** Length of the way round through open cells (m); Infinity if there's none. */
  around: number;
  /** How much the way round bends, in right angles (two 90° corners = 2). */
  turns: number;
  /** The last point of the way round you can see: the corner it seems to come from. Null when in sight. */
  via: Vec2 | null;
}

/** How many separate walls a straight line from a to b goes through. */
export function wallsBetween(level: Level, a: Vec2, b: Vec2): number {
  const d = dist(a, b);
  const steps = Math.max(1, Math.ceil(d / (TILE * 0.1)));
  let walls = 0;
  let inWall = false;
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const col = Math.floor((a.x + (b.x - a.x) * t) / TILE);
    const row = Math.floor((a.z + (b.z - a.z) * t) / TILE);
    const solid = col < 0 || row < 0 || col >= level.cols || row >= level.rows || level.opaque[row * level.cols + col];
    if (solid && !inWall) walls++;
    inWall = solid;
  }
  return walls;
}

export function soundPath(level: Level, source: Vec2, listener: Vec2): SoundPath {
  const straight = dist(source, listener);
  const walls = wallsBetween(level, source, listener);
  if (walls === 0) return { straight, walls, around: straight, turns: 0, via: null };
  const cells = findPath(level, worldToCell(listener), worldToCell(source));
  if (cells.length < 2) return { straight, walls, around: Infinity, turns: 0, via: null };
  // Listener → cell centres → source.
  const pts: Vec2[] = [listener, ...cells.slice(1, -1).map(cellCenter), source];
  let around = 0;
  for (let i = 1; i < pts.length; i++) around += dist(pts[i - 1], pts[i]);
  let turned = 0;
  for (let i = 2; i < pts.length; i++) {
    const a = Math.atan2(pts[i - 1].z - pts[i - 2].z, pts[i - 1].x - pts[i - 2].x);
    const b = Math.atan2(pts[i].z - pts[i - 1].z, pts[i].x - pts[i - 1].x);
    let d = Math.abs(b - a) % (2 * Math.PI);
    if (d > Math.PI) d = 2 * Math.PI - d;
    turned += d;
  }
  let via: Vec2 | null = null;
  for (let i = 1; i < pts.length; i++) {
    if (!lineOfSight(level, listener, pts[i])) break;
    via = pts[i];
  }
  return { straight, walls, around: Math.max(around, straight), turns: turned / (Math.PI / 2), via: via ?? pts[1] };
}
