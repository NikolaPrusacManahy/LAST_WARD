// Circle-vs-grid collision. Moves one axis at a time so the player slides along walls.
import { Level, TILE, Vec2, isSolid } from './level';

export const BLOCKER_RADIUS = 0.4;

function overlapsWall(level: Level, p: Vec2, r: number, blockers: Vec2[] = []): boolean {
  for (const b of blockers) {
    if ((p.x - b.x) ** 2 + (p.z - b.z) ** 2 < (r + BLOCKER_RADIUS) ** 2) return true;
  }
  const c0 = Math.floor((p.x - r) / TILE);
  const c1 = Math.floor((p.x + r) / TILE);
  const r0 = Math.floor((p.z - r) / TILE);
  const r1 = Math.floor((p.z + r) / TILE);
  for (let row = r0; row <= r1; row++) {
    for (let col = c0; col <= c1; col++) {
      if (!isSolid(level, col, row)) continue;
      // Closest point on the tile box to the circle centre.
      const nx = Math.max(col * TILE, Math.min(p.x, (col + 1) * TILE));
      const nz = Math.max(row * TILE, Math.min(p.z, (row + 1) * TILE));
      if ((p.x - nx) ** 2 + (p.z - nz) ** 2 < r * r) return true;
    }
  }
  return false;
}

/** Returns the new position after trying to move by (dx, dz). */
/** `blockers` are small round props (item cabinets) the mover can't walk through. */
export function moveWithCollision(level: Level, pos: Vec2, dx: number, dz: number, radius: number, blockers: Vec2[] = []): Vec2 {
  // Sub-step big moves so fast movers can't tunnel through a wall.
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / (radius * 0.5)));
  let p = { ...pos };
  for (let s = 0; s < steps; s++) {
    const tryX = { x: p.x + dx / steps, z: p.z };
    if (!overlapsWall(level, tryX, radius, blockers)) p = tryX;
    const tryZ = { x: p.x, z: p.z + dz / steps };
    if (!overlapsWall(level, tryZ, radius, blockers)) p = tryZ;
  }
  return p;
}

export { overlapsWall };
