// A* on the tile grid. 8-way moves; diagonals only when both side cells are open
// (no corner cutting, so the enemy never clips through a wall corner).
import { Cell, Level, isSolid, portalAt } from './level';

const DIRS = [
  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
  [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2],
] as const;

/** Path from start to goal, inclusive of both. Empty if unreachable. */
export function findPath(level: Level, start: Cell, goal: Cell): Cell[] {
  if (isSolid(level, goal.col, goal.row) || isSolid(level, start.col, start.row)) return [];
  const cols = level.cols;
  const key = (c: number, r: number) => r * cols + c;
  const startK = key(start.col, start.row);
  const goalK = key(goal.col, goal.row);
  const g = new Map<number, number>([[startK, 0]]);
  const came = new Map<number, number>();
  const closed = new Set<number>();
  const h = (c: number, r: number) => {
    const dx = Math.abs(c - goal.col);
    const dz = Math.abs(r - goal.row);
    return Math.max(dx, dz) + (Math.SQRT2 - 1) * Math.min(dx, dz);
  };
  // Small grids: a sorted array is plenty fast.
  const open: { k: number; f: number }[] = [{ k: startK, f: h(start.col, start.row) }];

  while (open.length) {
    let best = 0;
    for (let i = 1; i < open.length; i++) if (open[i].f < open[best].f) best = i;
    const { k } = open.splice(best, 1)[0];
    if (k === goalK) break;
    if (closed.has(k)) continue;
    closed.add(k);
    const c = k % cols;
    const r = Math.floor(k / cols);
    for (const [dc, dr, cost] of DIRS) {
      let nc = c + dc;
      let nr = r + dr;
      if (isSolid(level, nc, nr)) continue;
      if (dc !== 0 && dr !== 0 && (isSolid(level, c + dc, r) || isSolid(level, c, r + dr))) continue;
      // Update 0.7 — stepping into a stair portal lands on the other floor: the path jumps there.
      if (level.portals.length) {
        const portal = portalAt(level, { col: nc, row: nr });
        if (portal) {
          if (dc !== 0 && dr !== 0) continue; // only walk into a flight head-on
          nc = portal.to.col;
          nr = portal.to.row;
        }
      }
      const nk = key(nc, nr);
      if (closed.has(nk)) continue;
      const ng = (g.get(k) ?? Infinity) + cost;
      if (ng < (g.get(nk) ?? Infinity)) {
        g.set(nk, ng);
        came.set(nk, k);
        open.push({ k: nk, f: ng + h(nc, nr) });
      }
    }
  }

  if (!g.has(goalK)) return [];
  const path: Cell[] = [];
  let k: number | undefined = goalK;
  while (k !== undefined) {
    path.push({ col: k % cols, row: Math.floor(k / cols) });
    if (k === startK) break;
    k = came.get(k);
  }
  return path.reverse();
}

/** Flood fill from a cell — used by tests to prove every item is reachable. */
export function reachable(level: Level, start: Cell): Set<number> {
  const seen = new Set<number>();
  const stack = [start];
  while (stack.length) {
    const { col, row } = stack.pop()!;
    if (isSolid(level, col, row)) continue;
    const k = row * level.cols + col;
    if (seen.has(k)) continue;
    seen.add(k);
    // Update 0.7 — a stair portal leads to the other floor.
    const portal = level.portals.length ? portalAt(level, { col, row }) : undefined;
    if (portal) {
      stack.push(portal.to);
      continue;
    }
    stack.push({ col: col + 1, row }, { col: col - 1, row }, { col, row: row + 1 }, { col, row: row - 1 });
  }
  return seen;
}
