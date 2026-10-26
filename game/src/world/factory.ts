// Update 1.0.1 — Harrow Mill's build from the factory kit, as data: which kit piece goes on each wall face,
// floor and ceiling tile, and where the steel stairs stand. Pure (no three.js); engine/factoryView.ts draws it.
import { Cell, FACE_DIR, Level, TILE, WALL_HEIGHT, WallFace, cellCenter, floorOfRow, isCorridor, isSolid, itemPos } from './level';

export type LiningPiece = 'wall' | 'wall_window' | 'wall_arch';

/** Kit wall panels are 3 m wide and 3 m tall: stretched up to the wall. */
export const PANEL_STRETCH = WALL_HEIGHT / 3;
/** A panel's face is its back plane (trims and frames stick out of it toward the room): every panel's back
 *  stands 1 cm proud of the wall. The arched one's frames stick out 30 cm, so it only goes where nothing
 *  hangs. Half-depths of the kit pieces. */
const HALF_DEPTH: Record<LiningPiece, number> = { wall: 0.047, wall_window: 0.047, wall_arch: 0.16 };
const PROUD = 0.01;

export interface Placed {
  /** Logic position (the floor is in the row, like everything else). */
  x: number;
  z: number;
  /** Rotation about y, three.js style. */
  yaw: number;
}

export interface LiningFace extends Placed {
  piece: LiningPiece;
}

const SIDES: WallFace[] = ['north', 'east', 'south', 'west'];
const OPPOSITE: Record<WallFace, WallFace> = { north: 'south', south: 'north', east: 'west', west: 'east' };
const key = (c: Cell, side: WallFace) => `${c.col},${c.row},${side}`;

const hash = (a: number, b: number, c: number) => {
  let h = (a * 374761393 + b * 668265263 + c * 2147483647) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

/** A cell you can see into: walkable floor, a stair, or a stairwell (not walls or the block under a landing). */
function open(level: Level, col: number, row: number): boolean {
  if (col < 0 || row < 0 || col >= level.cols || row >= level.rows || floorOfRow(level, row) < 0) return false;
  return !level.opaque[row * level.cols + col];
}

/** The wall faces something hangs on or stands against (props, item tables, notes): a plain panel there. */
export function busyFaces(level: Level): Set<string> {
  const busy = new Set<string>();
  for (const p of level.props) if (p.wall) busy.add(key(p.cell, p.wall));
  for (const item of level.items) {
    const at = itemPos(level, item.cell);
    const c = cellCenter(item.cell);
    const side = SIDES.find((s) => Math.sign(at.x - c.x) === FACE_DIR[s].dc && Math.sign(at.z - c.z) === FACE_DIR[s].dr);
    if (side) busy.add(key(item.cell, side));
  }
  for (const w of level.wallNotes) {
    const d = FACE_DIR[w.face];
    busy.add(key({ col: w.cell.col + d.dc, row: w.cell.row + d.dr }, OPPOSITE[w.face]));
  }
  return busy;
}

/**
 * Every wall face that looks onto open floor gets a kit panel: mostly plain concrete, now and then the
 * two-pane window or the arched pair. Not the generator (a machine) or the exit (its door).
 */
export function liningFaces(level: Level): LiningFace[] {
  const busy = busyFaces(level);
  const out: LiningFace[] = [];
  for (let row = 0; row < level.rows; row++) {
    for (let col = 0; col < level.cols; col++) {
      if (!open(level, col, row)) continue;
      const c = cellCenter({ col, row });
      SIDES.forEach((side, s) => {
        const d = FACE_DIR[side];
        const wc = col + d.dc;
        const wr = row + d.dr;
        if (open(level, wc, wr) || floorOfRow(level, wr) < 0) return;
        if ((wc === level.generator.col && wr === level.generator.row) || (wc === level.exit.col && wr === level.exit.row)) return;
        const h = hash(col, row, s);
        const plain = busy.has(key({ col, row }, side));
        const piece: LiningPiece = plain || h < 0.62 ? 'wall' : h < 0.86 ? 'wall_window' : 'wall_arch';
        const off = TILE / 2 - PROUD - HALF_DEPTH[piece];
        // The panel's front (+x) faces away from the wall, into the room: three.js turns (1, 0) by yaw to
        // (cos yaw, -sin yaw), which must be (-dc, -dr).
        out.push({ piece, x: c.x + d.dc * off, z: c.z + d.dr * off, yaw: Math.atan2(d.dr, -d.dc) });
      });
    }
  }
  return out;
}

/** Floor tiles: concrete slabs, the gantry's grating upstairs (its corridor cells). Same cells as the
 *  plain floor (engine/buildLevel.ts): open, not a stairwell. */
export function floorTiles(level: Level): (Placed & { grate: boolean })[] {
  const out: (Placed & { grate: boolean })[] = [];
  for (let row = 0; row < level.rows; row++) {
    for (let col = 0; col < level.cols; col++) {
      const i = row * level.cols + col;
      if (!open(level, col, row) || level.voids[i] || isSolid(level, col, row)) continue;
      const c = cellCenter({ col, row });
      out.push({ x: c.x, z: c.z, yaw: 0, grate: floorOfRow(level, row) > 0 && isCorridor(level, { col, row }) });
    }
  }
  return out;
}

/** Roof plates: over every open cell and stairwell, except over a flight going up (it's open to the floor above). */
export function roofTiles(level: Level): Placed[] {
  const stair = new Set(level.stairs.flatMap((s) => s.cells.map((c) => c.row * level.cols + c.col)));
  const out: Placed[] = [];
  for (let row = 0; row < level.rows; row++) {
    for (let col = 0; col < level.cols; col++) {
      if (!open(level, col, row) || stair.has(row * level.cols + col)) continue;
      const c = cellCenter({ col, row });
      out.push({ x: c.x, z: c.z, yaw: 0 });
    }
  }
  return out;
}

/** The kit's steel stairs climb toward their own -x; 2.57 m long, 3.31 m up, 2.45 m wide. */
export const KIT_STAIRS = { run: 2.57, rise: 3.31, width: 2.45 };

/** A flight's middle (logic), the turn that points the kit stairs up it, and the stretch to fit it. */
export function stairPlacements(level: Level): (Placed & { scale: [number, number, number]; floor: number })[] {
  return level.stairs.map((s) => {
    const a = cellCenter(s.cells[0]);
    const b = cellCenter(s.cells[s.cells.length - 1]);
    const d = FACE_DIR[s.dir];
    return {
      x: (a.x + b.x) / 2,
      z: (a.z + b.z) / 2,
      // Local -x → (dc, dr): three.js turns (-1, 0) by yaw to (-cos yaw, sin yaw).
      yaw: Math.atan2(d.dr, -d.dc),
      scale: [(s.cells.length * TILE) / KIT_STAIRS.run, WALL_HEIGHT / KIT_STAIRS.rise, (TILE - 0.1) / KIT_STAIRS.width],
      floor: s.floor,
    };
  });
}
