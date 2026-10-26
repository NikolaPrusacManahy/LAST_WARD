// Level data model. Levels are ASCII grids in world/content/ — one char per tile.
// Pure: no three.js, no DOM.
import type { PropPlacement } from './props';

export const TILE = 3; // metres per grid cell
export const WALL_HEIGHT = 3.2;

export type ItemKind = 'fuse' | 'battery' | 'note' | 'medkit'; // Update 0.9.8 — medkit (map: M)
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

/** Update 0.7 — the black-screen intro text as you wake up on this level. */
export interface LevelIntro {
  time: string;
  lines: string[];
}

/** Update 0.7 — per-level tweaks to The Patient (world/enemyAI.ts ENEMY), e.g. longer tracking in a big house. */
export interface AiTuning {
  memorySeconds?: number;
  searchSeconds?: number;
  searchRadiusTiles?: number;
}

/** Update 0.9.6 — something to throw, lying on the floor. */
export interface ThrowableSpawn {
  kind: 'brick' | 'bottle';
  cell: Cell;
  /** Offset from the cell's middle (m), to lie against a wall rather than in the walking line. */
  at?: [number, number];
}

/** Update 1.0.1 — how a level looks: the hospital's tiles, or the factory's concrete and brick. */
export type LevelTheme = 'hospital' | 'factory';

export interface LevelDef {
  name: string;
  /** Update 1.0.1 — the map's key: saved as your last pick, sent to a co-op room. Defaults to the name. */
  id?: string;
  /** Update 1.0.1 — one line under the name on the map picker. */
  blurb?: string;
  /** Update 1.0.1 — a short name for the co-op lobby's map switch. */
  short?: string;
  theme?: LevelTheme;
  /** One floor (level 1). */
  map?: string[];
  /** Update 0.7 — several floors, ground floor first, all the same size. Stairs: ^ v < > on the floor
   *  they start from (pointing up the stairs), o on the floor above (the stairwell). */
  floors?: string[][];
  notes: string[];
  /** `floor` is the floor index (0 = ground) for multi-floor levels. */
  wallNotes?: (WallNote & { floor?: number })[];
  intro?: LevelIntro;
  ai?: AiTuning;
  /** Facing at the start (game yaw; π = down the map, 0 = up the map). */
  startYaw?: number;
  /** Update 0.8 — real props (world/props.ts): furniture, the generator, the breaker panel, the switch. */
  props?: PropPlacement[];
  /** Update 0.9 — rooms (cell rectangles) whose walls are lined with brick instead of tiles. */
  brickRooms?: { from: Cell; to: Cell }[];
  /** Update 0.9.6 — bricks and bottles lying in the halls: the cell and an offset from its middle (m). */
  throwables?: ThrowableSpawn[];
  /** Update 0.9.7 — the corridors (cell rectangles, all open floor): The Patient crawls along their
   *  ceilings and never into a room. */
  corridors?: { from: Cell; to: Cell }[];
}

/** Update 0.7 — a straight flight of stairs. `cells` are logic cells on `floor`, bottom → top. */
export interface StairRun {
  floor: number;
  cells: Cell[];
  dir: WallFace;
}

/** Update 0.7 — walking into `from` puts you at the same spot on another floor, in `to`. */
export interface Portal {
  from: Cell;
  to: Cell;
}

export const DEFAULT_INTRO: LevelIntro = {
  time: '03:14 AM',
  lines: ['You wake up on a gurney in Ward 13.', 'The power is out. Something is breathing down the hall.'],
};

export interface Level {
  name: string;
  id: string;
  theme: LevelTheme;
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
  /** Update 0.7 — floors are stacked in this one grid (top to bottom in rows), each `floorRows` tall,
   *  with FLOOR_GAP_ROWS solid rows between them, so every grid rule (collision, sight, paths, items)
   *  works per floor for free. Stairs join them through `portals`. */
  floors: number;
  floorRows: number;
  stairs: StairRun[];
  portals: Portal[];
  /** Stairwell cells on the floor above a flight: no floor to stand on, but you can see across. */
  voids: boolean[];
  /** Blocks line of sight (walls, the block under a stair landing; not stairwells). */
  opaque: boolean[];
  intro: LevelIntro;
  ai: AiTuning;
  startYaw: number;
  props: PropPlacement[];
  brickRooms: { from: Cell; to: Cell }[];
  throwables: ThrowableSpawn[];
  /** Update 0.9.7 — true = a corridor cell (The Patient can crawl on its ceiling). Index: row * cols + col. */
  corridor: boolean[];
}

/** Update 0.7 — solid rows between stacked floors in the logic grid (keeps them apart). */
export const FLOOR_GAP_ROWS = 2;

const STAIR_CHARS: Record<string, WallFace> = { '^': 'north', v: 'south', '<': 'west', '>': 'east' };

/**
 * Legend:
 *  #  wall            .  floor
 *  P  player start    E  enemy start
 *  F  fuse            B  battery         N  note
 *  G  generator (solid machine)          X  exit door (in the outer wall)
 *  L  ceiling lamp (floor)
 *  ^ v < >  stairs going up that way (Update 0.7)    o  stairwell on the floor above them
 */
export function parseLevel(def: LevelDef): Level {
  const floorMaps = def.floors ?? (def.map ? [def.map] : []);
  if (!floorMaps.length) throw new Error('Level needs a map');
  const F = floorMaps.length;
  const floorRows = floorMaps[0].length;
  const cols = floorMaps[0][0].length;
  const stride = floorRows + FLOOR_GAP_ROWS;
  const rows = F * floorRows + (F - 1) * FLOOR_GAP_ROWS;
  const solid: boolean[] = new Array(rows * cols).fill(true); // gap rows stay solid
  const voids: boolean[] = new Array(rows * cols).fill(false);
  const opaque: boolean[] = new Array(rows * cols).fill(true);
  const items: LevelItem[] = [];
  const lamps: Cell[] = [];
  let playerStart: Cell | null = null;
  let enemyStart: Cell | null = null;
  let generator: Cell | null = null;
  let exit: Cell | null = null;
  let noteCount = 0;
  const counts: Record<ItemKind, number> = { fuse: 0, battery: 0, note: 0, medkit: 0 };
  const charAt = (f: number, col: number, row: number) =>
    col < 0 || row < 0 || col >= cols || row >= floorRows ? '#' : floorMaps[f][row][col];
  const idx = (f: number, col: number, row: number) => (f * stride + row) * cols + col;

  floorMaps.forEach((map, f) => {
    if (map.length !== floorRows) throw new Error(`Floor ${f} has ${map.length} rows, expected ${floorRows}`);
    map.forEach((line, row) => {
      if (line.length !== cols) throw new Error(`Row ${row} has ${line.length} chars, expected ${cols}`);
      for (let col = 0; col < cols; col++) {
        const ch = line[col];
        const cell = { col, row: f * stride + row };
        const i = idx(f, col, row);
        solid[i] = false;
        opaque[i] = false;
        const wall = () => {
          solid[i] = true;
          opaque[i] = true;
        };
        const addItem = (kind: ItemKind) => {
          const item: LevelItem = { id: `${kind}-${counts[kind]++}`, kind, cell };
          if (kind === 'note') item.noteIndex = noteCount++;
          items.push(item);
        };
        switch (ch) {
          case '#': wall(); break;
          case '.': break;
          case 'P': playerStart = cell; break;
          case 'E': enemyStart = cell; break;
          case 'F': addItem('fuse'); break;
          case 'B': addItem('battery'); break;
          case 'N': addItem('note'); break;
          case 'M': addItem('medkit'); break; // Update 0.9.8
          case 'L': lamps.push(cell); break;
          case 'G': generator = cell; wall(); break;
          case 'X': exit = cell; wall(); break;
          case 'o': solid[i] = true; voids[i] = true; break; // checked against the stairs below
          default:
            if (!(ch in STAIR_CHARS)) throw new Error(`Unknown tile '${ch}' at ${col},${row}${F > 1 ? ` (floor ${f})` : ''}`);
        }
      }
    });
  });

  if (!playerStart || !enemyStart || !generator || !exit) {
    throw new Error('Level needs P, E, G and X');
  }
  if (noteCount > def.notes.length) throw new Error('Level has more N tiles than note texts');

  // --- Update 0.7: stairs. A flight is a straight line of the same arrow, pointing up.
  const stairs: StairRun[] = [];
  const portals: Portal[] = [];
  const stairwell = new Set<number>();
  for (let f = 0; f < F; f++) {
    for (let row = 0; row < floorRows; row++) {
      for (let col = 0; col < cols; col++) {
        const ch = charAt(f, col, row);
        const dir = STAIR_CHARS[ch];
        if (!dir) continue;
        const d = FACE_DIR[dir];
        if (charAt(f, col - d.dc, row - d.dr) === ch) continue; // not the bottom step
        const local: Cell[] = [];
        for (let c = col, r = row; charAt(f, c, r) === ch; c += d.dc, r += d.dr) local.push({ col: c, row: r });
        const where = `stairs at ${col},${row} (floor ${f})`;
        if (f + 1 >= F) throw new Error(`${where} lead above the top floor`);
        const top = local[local.length - 1];
        const under = { col: top.col + d.dc, row: top.row + d.dr }; // block under the landing
        const land = { col: under.col, row: under.row }; // the landing, on the floor above
        const px = d.dr !== 0 ? 1 : 0;
        const pz = d.dc !== 0 ? 1 : 0;
        const isWall = (ff: number, c: number, r: number) => charAt(ff, c, r) === '#';
        if (isWall(f, col - d.dc, row - d.dr)) throw new Error(`${where}: nothing to step onto them from`);
        for (const s of local) {
          if (!isWall(f, s.col + px, s.row + pz) || !isWall(f, s.col - px, s.row - pz)) throw new Error(`${where}: needs walls on both sides`);
          if (charAt(f + 1, s.col, s.row) !== 'o') throw new Error(`${where}: the floor above needs a stairwell (o) over every step`);
        }
        if (!isWall(f, under.col, under.row)) throw new Error(`${where}: the cell past the top step must be a wall (under the landing)`);
        for (const [c, r] of [[under.col + d.dc, under.row + d.dr], [under.col + px, under.row + pz], [under.col - px, under.row - pz]]) {
          if (!isWall(f, c, r)) throw new Error(`${where}: the block under the landing must be walled in`);
        }
        const landCh = charAt(f + 1, land.col, land.row);
        if (landCh === '#' || landCh === 'o' || landCh in STAIR_CHARS) throw new Error(`${where}: no landing to step off onto upstairs`);
        for (const [c, r] of [[top.col + px, top.row + pz], [top.col - px, top.row - pz]]) {
          const ch2 = charAt(f + 1, c, r);
          if (ch2 !== '#' && ch2 !== 'o') throw new Error(`${where}: the stairwell upstairs must be closed at the sides of the top step`);
        }
        const cells = local.map((s) => ({ col: s.col, row: f * stride + s.row }));
        stairs.push({ floor: f, cells, dir });
        for (const s of local) stairwell.add(idx(f + 1, s.col, s.row));
        // The block under the landing: walkable (you pass through it to go up) but drawn as a wall.
        const u = idx(f, under.col, under.row);
        solid[u] = false;
        opaque[u] = true;
        // The top step's stairwell upstairs: walkable (you pass through it to go down), no floor.
        const t = idx(f + 1, top.col, top.row);
        solid[t] = false;
        portals.push({ from: { col: under.col, row: f * stride + under.row }, to: { col: land.col, row: (f + 1) * stride + land.row } });
        portals.push({ from: { col: top.col, row: (f + 1) * stride + top.row }, to: { col: top.col, row: f * stride + top.row } });
      }
    }
  }
  for (let i = 0; i < voids.length; i++) {
    if (voids[i] && !stairwell.has(i)) {
      const r = Math.floor(i / cols);
      throw new Error(`Stairwell (o) at ${i % cols},${r % stride} (floor ${Math.floor(r / stride)}) has no stairs under it`);
    }
  }

  const wallNotes: WallNote[] = (def.wallNotes ?? []).map((w) => ({ cell: { col: w.cell.col, row: (w.floor ?? 0) * stride + w.cell.row }, face: w.face, text: w.text }));
  for (const w of wallNotes) {
    const d = FACE_DIR[w.face];
    const wallAt = solid[w.cell.row * cols + w.cell.col];
    const c = w.cell.col + d.dc;
    const r = w.cell.row + d.dr;
    const open = c >= 0 && r >= 0 && c < cols && r < rows && !solid[r * cols + c];
    if (!wallAt || !open) throw new Error(`Wall note at ${w.cell.col},${w.cell.row} must be on a wall facing floor`);
  }

  // Update 0.9.7 — corridor cells (level 1 only has one floor; rows are logic rows).
  const corridor: boolean[] = new Array(cols * rows).fill(false);
  for (const c of def.corridors ?? []) {
    for (let r = Math.min(c.from.row, c.to.row); r <= Math.max(c.from.row, c.to.row); r++) {
      for (let col = Math.min(c.from.col, c.to.col); col <= Math.max(c.from.col, c.to.col); col++) {
        if (solid[r * cols + col]) throw new Error(`Corridor cell ${col},${r} is a wall`);
        corridor[r * cols + col] = true;
      }
    }
  }

  return {
    name: def.name,
    id: def.id ?? def.name,
    theme: def.theme ?? 'hospital',
    cols,
    rows,
    solid,
    playerStart,
    enemyStart,
    items,
    lamps,
    generator,
    exit,
    notes: def.notes,
    wallNotes,
    floors: F,
    floorRows,
    stairs,
    portals,
    voids,
    opaque,
    intro: def.intro ?? DEFAULT_INTRO,
    ai: def.ai ?? {},
    startYaw: def.startYaw ?? Math.PI,
    props: def.props ?? [],
    brickRooms: def.brickRooms ?? [],
    throwables: def.throwables ?? [],
    corridor,
  };
}

/** Update 0.9.7 — a corridor cell (The Patient can crawl on its ceiling). */
export function isCorridor(level: Level, cell: Cell): boolean {
  return cell.col >= 0 && cell.row >= 0 && cell.col < level.cols && cell.row < level.rows && level.corridor[cell.row * level.cols + cell.col];
}

/** Update 0.7 — rows from one floor's top row to the next floor's in the logic grid. */
export const floorStride = (level: Level) => level.floorRows + FLOOR_GAP_ROWS;

/** Which floor a logic row is on (−1 in the gap between floors). */
export function floorOfRow(level: Level, row: number): number {
  const s = floorStride(level);
  const f = Math.floor(row / s);
  return row - f * s < level.floorRows && f >= 0 && f < level.floors ? f : -1;
}

/** Floor of a logic position. */
export const floorAt = (level: Level, p: Vec2) => Math.max(0, floorOfRow(level, Math.floor(p.z / TILE)));

/** Update 0.7 — where a floor really is: world = logic + this (it's lifted up and slid back over floor 0). */
export function floorOffset(level: Level, f: number): { y: number; z: number } {
  return { y: f * WALL_HEIGHT, z: -f * floorStride(level) * TILE };
}

/** The portal whose entry cell this is, if any. */
export function portalAt(level: Level, cell: Cell): Portal | undefined {
  return level.portals.find((p) => p.from.col === cell.col && p.from.row === cell.row);
}

/** Update 0.7 — stepping into a portal cell moves you to the same spot on the other floor. */
export function crossPortal(level: Level, p: Vec2): { pos: Vec2; crossed: Portal | null } {
  if (!level.portals.length) return { pos: p, crossed: null };
  const portal = portalAt(level, worldToCell(p));
  if (!portal) return { pos: p, crossed: null };
  return { pos: { x: p.x + (portal.to.col - portal.from.col) * TILE, z: p.z + (portal.to.row - portal.from.row) * TILE }, crossed: portal };
}

/** Update 0.7 — how high up a flight of stairs you stand (0 at the bottom, WALL_HEIGHT at the top). */
export function stairRise(level: Level, p: Vec2): number {
  if (!level.stairs.length) return 0;
  const cell = worldToCell(p);
  for (const run of level.stairs) {
    if (!run.cells.some((c) => sameCell(c, cell))) continue;
    const d = FACE_DIR[run.dir];
    const first = cellCenter(run.cells[0]);
    const bottom = { x: first.x - (d.dc * TILE) / 2, z: first.z - (d.dr * TILE) / 2 };
    const along = (p.x - bottom.x) * d.dc + (p.z - bottom.z) * d.dr;
    return Math.max(0, Math.min(1, along / (run.cells.length * TILE))) * WALL_HEIGHT;
  }
  return 0;
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
      if (!isSolid(level, col, row) && !portalAt(level, { col, row })) out.push({ col, row });
    }
  }
  return out;
}
