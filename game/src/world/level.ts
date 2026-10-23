// Level data model. Levels are ASCII grids in world/content/ — one char per tile.
// Pure: no three.js, no DOM.

export const TILE = 3; // metres per grid cell
export const WALL_HEIGHT = 3.2;

export type ItemKind = 'fuse' | 'battery' | 'note';
export type FixtureKind = 'generator' | 'exit';

export interface Vec2 {
  x: number;
  z: number;
}

export interface Cell {
  col: number;
  row: number;
}

export interface LevelItem {
  id: string;
  kind: ItemKind;
  cell: Cell;
  /** Note text index into the level's notes list (notes only). */
  noteIndex?: number;
}

/** Update 0.6.3 — which side of a wall cell a pinned note hangs on (the open floor it faces). */
export type WallFace = 'north' | 'south' | 'east' | 'west';
export const FACE_DIR: Record<WallFace, { dc: number; dr: number }> = {
  north: { dc: 0, dr: -1 },
  south: { dc: 0, dr: 1 },
  east: { dc: 1, dr: 0 },
  west: { dc: -1, dr: 0 },
};

/** Update 0.6.3 — a scrap of paper pinned to a wall (decoration you read from a distance, not an item). */
export interface WallNote {
  cell: Cell;
  face: WallFace;
  text: string;
}

export interface LevelDef {
  name: string;
  map: string[];
  notes: string[];
  wallNotes?: WallNote[];
}

export interface Level {
  name: string;
  cols: number;
  rows: number;
  /** true = wall / solid. Index: row * cols + col. */
  solid: boolean[];
  playerStart: Cell;
  enemyStart: Cell;
  items: LevelItem[];
  lamps: Cell[];
  generator: Cell;
  exit: Cell;
  notes: string[];
  wallNotes: WallNote[];
}

/**
 * Legend:
 *  #  wall            .  floor
 *  P  player start    E  enemy start
 *  F  fuse            B  battery         N  note
 *  G  generator (solid machine)          X  exit door (in the outer wall)
 *  L  ceiling lamp (floor)
 */
export function parseLevel(def: LevelDef): Level {
  const rows = def.map.length;
  const cols = def.map[0].length;
  const solid: boolean[] = new Array(rows * cols).fill(false);
  const items: LevelItem[] = [];
  const lamps: Cell[] = [];
  let playerStart: Cell | null = null;
  let enemyStart: Cell | null = null;
  let generator: Cell | null = null;
  let exit: Cell | null = null;
  let noteCount = 0;
  const counts: Record<ItemKind, number> = { fuse: 0, battery: 0, note: 0 };

  def.map.forEach((line, row) => {
    if (line.length !== cols) throw new Error(`Row ${row} has ${line.length} chars, expected ${cols}`);
    for (let col = 0; col < cols; col++) {
      const ch = line[col];
      const cell = { col, row };
      const i = row * cols + col;
      const addItem = (kind: ItemKind) => {
        const item: LevelItem = { id: `${kind}-${counts[kind]++}`, kind, cell };
        if (kind === 'note') item.noteIndex = noteCount++;
        items.push(item);
      };
      switch (ch) {
        case '#': solid[i] = true; break;
        case '.': break;
        case 'P': playerStart = cell; break;
        case 'E': enemyStart = cell; break;
        case 'F': addItem('fuse'); break;
        case 'B': addItem('battery'); break;
        case 'N': addItem('note'); break;
        case 'L': lamps.push(cell); break;
        case 'G': generator = cell; solid[i] = true; break;
        case 'X': exit = cell; solid[i] = true; break;
        default: throw new Error(`Unknown tile '${ch}' at ${col},${row}`);
      }
    }
  });

  if (!playerStart || !enemyStart || !generator || !exit) {
    throw new Error('Level needs P, E, G and X');
  }
  if (noteCount > def.notes.length) throw new Error('Level has more N tiles than note texts');

  const wallNotes = def.wallNotes ?? [];
  for (const w of wallNotes) {
    const d = FACE_DIR[w.face];
    const wallAt = solid[w.cell.row * cols + w.cell.col];
    const c = w.cell.col + d.dc;
    const r = w.cell.row + d.dr;
    const open = c >= 0 && r >= 0 && c < cols && r < rows && !solid[r * cols + c];
    if (!wallAt || !open) throw new Error(`Wall note at ${w.cell.col},${w.cell.row} must be on a wall facing floor`);
  }

  return { name: def.name, cols, rows, solid, playerStart, enemyStart, items, lamps, generator, exit, notes: def.notes, wallNotes };
}

export function isSolid(level: Level, col: number, row: number): boolean {
  if (col < 0 || row < 0 || col >= level.cols || row >= level.rows) return true;
  return level.solid[row * level.cols + col];
}

/** Centre of a cell in world space (x right, z down the map). */
export function cellCenter(cell: Cell): Vec2 {
  return { x: (cell.col + 0.5) * TILE, z: (cell.row + 0.5) * TILE };
}

export function worldToCell(p: Vec2): Cell {
  return { col: Math.floor(p.x / TILE), row: Math.floor(p.z / TILE) };
}

export function sameCell(a: Cell, b: Cell): boolean {
  return a.col === b.col && a.row === b.row;
}

export function dist(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

/** Items sit on a cabinet pushed against a wall, so they never block the cell centre
 *  (the enemy walks through cell centres). Returns the cabinet position + which way it faces. */
export const ITEM_WALL_OFFSET = 1.1;
export function itemPos(level: Level, cell: Cell): Vec2 & { face: Vec2 } {
  const c = cellCenter(cell);
  for (const [dc, dr] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
    if (isSolid(level, cell.col + dc, cell.row + dr)) {
      return { x: c.x + dc * ITEM_WALL_OFFSET, z: c.z + dr * ITEM_WALL_OFFSET, face: { x: -dc, z: -dr } };
    }
  }
  return { ...c, face: { x: 0, z: 1 } };
}

/** Every walkable cell — used for enemy wandering. */
export function floorCells(level: Level): Cell[] {
  const out: Cell[] = [];
  for (let row = 0; row < level.rows; row++) {
    for (let col = 0; col < level.cols; col++) {
      if (!isSolid(level, col, row)) out.push({ col, row });
    }
  }
  return out;
}
