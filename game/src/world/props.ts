// Update 0.8 — real props (Sketchfab models, see state/credits.ts) placed from level data. Pure: where
// each prop stands, which way it faces and what it blocks; engine/propsView.ts draws them.
import { Cell, FACE_DIR, Level, TILE, Vec2, WALL_HEIGHT, WallFace, cellCenter, isSolid } from './level';

export type PropKind =
  | 'hospital_bed' | 'privacy_screen' | 'bedside_flowers' | 'bedside_drawing' | 'bedside_meds' | 'side_table'
  | 'medicine_shelf' | 'portrait' | 'child_drawing' | 'generator' | 'electrical_wall' | 'brick_wall' | 'breaker_box'
  | 'power_switch' | 'radiator' | 'barrel' | 'barrel_lying' | 'toilet' | 'fluorescent';

/** Local axis a model's front points along. */
type Front = 'x' | '-x' | 'z' | '-z';

interface PropSpec {
  /** Model size in metres along its own x, y, z (public/models/props/<kind>.glb, tools/prepare-props.mjs). */
  size: [number, number, number];
  front: Front;
  /** Stands on the floor and stops you (and is kept off the enemy's walking lines). */
  blocks: boolean;
}

export const PROPS: Record<PropKind, PropSpec> = {
  hospital_bed: { size: [2.12, 1.08, 1.08], front: 'z', blocks: true },
  privacy_screen: { size: [1.15, 1.65, 0.55], front: 'z', blocks: true },
  bedside_flowers: { size: [0.63, 1.17, 0.64], front: 'x', blocks: true },
  bedside_drawing: { size: [0.38, 0.68, 0.61], front: '-x', blocks: true },
  bedside_meds: { size: [0.35, 0.85, 0.61], front: 'x', blocks: true },
  side_table: { size: [1.18, 0.83, 0.92], front: 'z', blocks: true },
  medicine_shelf: { size: [0.5, 1.92, 2.16], front: '-x', blocks: true },
  portrait: { size: [0.02, 0.41, 0.33], front: 'x', blocks: false },
  child_drawing: { size: [0.01, 0.31, 0.22], front: '-x', blocks: false },
  generator: { size: [2.31, 1.93, 1.31], front: 'z', blocks: false }, // its tile is solid already
  electrical_wall: { size: [0.13, 2.08, 2.89], front: 'x', blocks: false }, // 0.9: pipes and boxes only
  brick_wall: { size: [0.0, 3.2, 3.62], front: 'x', blocks: false }, // bare brick: lines the generator room (0.9)
  breaker_box: { size: [0.16, 0.87, 0.55], front: 'x', blocks: false },
  power_switch: { size: [0.45, 0.66, 0.33], front: '-z', blocks: false }, // 0.9.1: its face is -z (lever side)
  radiator: { size: [1.43, 0.78, 0.29], front: 'z', blocks: true },
  barrel: { size: [0.62, 0.93, 0.62], front: 'z', blocks: true },
  barrel_lying: { size: [0.63, 0.62, 0.93], front: 'z', blocks: true },
  toilet: { size: [0.45, 0.8, 0.59], front: 'z', blocks: true },
  fluorescent: { size: [1.52, 0.22, 0.66], front: 'z', blocks: false },
};

/** How a level places a prop. `wall`: the side of the cell it backs onto (it faces away from it).
 *  Otherwise it stands in the middle facing `face`. `along` slides it along the wall (m), `y` lifts it. */
export interface PropPlacement {
  kind: PropKind;
  cell: Cell;
  wall?: WallFace;
  face?: WallFace;
  along?: number;
  y?: number;
}

export interface PlacedProp {
  kind: PropKind;
  x: number;
  y: number;
  z: number;
  /** Rotation about Y (three.js) that turns the model's front to face the right way. */
  yaw: number;
  /** Half extents of its footprint on the ground (world x / z). */
  hx: number;
  hz: number;
  /** Update 0.9 — stretch along the model's own axes (brick lining fits each 3 m wall face). */
  scale?: [number, number, number];
}

const FRONT_DIR: Record<Front, Vec2> = { x: { x: 1, z: 0 }, '-x': { x: -1, z: 0 }, z: { x: 0, z: 1 }, '-z': { x: 0, z: -1 } };
const heading = (v: Vec2) => Math.atan2(v.x, v.z);
const OPPOSITE: Record<WallFace, WallFace> = { north: 'south', south: 'north', east: 'west', west: 'east' };

export function placeProp(p: PropPlacement): PlacedProp {
  const spec = PROPS[p.kind];
  const facing = p.wall ? OPPOSITE[p.wall] : p.face ?? 'south';
  const want = { x: FACE_DIR[facing].dc, z: FACE_DIR[facing].dr };
  const yaw = heading(want) - heading(FRONT_DIR[spec.front]);
  const quarter = Math.round(yaw / (Math.PI / 2));
  const turned = Math.abs(quarter) % 2 === 1;
  const hx = (turned ? spec.size[2] : spec.size[0]) / 2;
  const hz = (turned ? spec.size[0] : spec.size[2]) / 2;
  const c = cellCenter(p.cell);
  let x = c.x;
  let z = c.z;
  if (p.wall) {
    const n = FACE_DIR[p.wall];
    const depth = n.dc !== 0 ? hx : hz;
    x += n.dc * (TILE / 2 - depth - 0.01);
    z += n.dr * (TILE / 2 - depth - 0.01);
    // Slide along the wall.
    x += Math.abs(n.dr) * (p.along ?? 0);
    z += Math.abs(n.dc) * (p.along ?? 0);
  }
  return { kind: p.kind, x, y: p.y ?? 0, z, yaw, hx, hz };
}

/** Collision circles for the props you can't walk through (a row of circles along long ones). */
export function propBlockers(placed: PlacedProp[]): { x: number; z: number; r: number }[] {
  const out: { x: number; z: number; r: number }[] = [];
  for (const p of placed) {
    if (!PROPS[p.kind].blocks || p.y > 0.5) continue;
    const long = Math.max(p.hx, p.hz);
    const r = Math.max(0.15, Math.min(p.hx, p.hz));
    const n = Math.max(1, Math.ceil(long / r));
    const alongX = p.hx >= p.hz;
    for (let i = 0; i < n; i++) {
      const t = n === 1 ? 0 : -long + r + ((2 * (long - r)) / (n - 1)) * i;
      out.push({ x: p.x + (alongX ? t : 0), z: p.z + (alongX ? 0 : t), r });
    }
  }
  return out;
}

/** Every prop of a level, placed. */
export function placedProps(level: Level): PlacedProp[] {
  return level.props.map(placeProp);
}

/** Update 0.8 — the first prop of a kind. */
export function findProp(level: Level, kind: PropKind): PlacedProp | null {
  const p = level.props.find((x) => x.kind === kind);
  return p ? placeProp(p) : null;
}

/** Update 0.9 — the electrical panels (breaker boxes, in level order); panel i's switch is the i-th switch. */
export function panelSpots(level: Level): PlacedProp[] {
  return level.props.filter((x) => x.kind === 'breaker_box').map(placeProp);
}
export function panelSwitches(level: Level): PlacedProp[] {
  return level.props.filter((x) => x.kind === 'power_switch').map(placeProp);
}

/**
 * Update 0.9 — brick on every wall face of a level's brick rooms: one brick panel per face, stretched to
 * the 3 m tile. Not the generator (a machine, not a wall) or the exit door.
 */
export function brickLining(level: Level): PlacedProp[] {
  const out: PlacedProp[] = [];
  const width = PROPS.brick_wall.size[2];
  for (const room of level.brickRooms) {
    for (let row = room.from.row; row <= room.to.row; row++) {
      for (let col = room.from.col; col <= room.to.col; col++) {
        if (isSolid(level, col, row)) continue;
        for (const wall of ['north', 'south', 'east', 'west'] as WallFace[]) {
          const n = FACE_DIR[wall];
          const c = col + n.dc;
          const r = row + n.dr;
          if (!isSolid(level, c, r)) continue;
          if ((c === level.generator.col && r === level.generator.row) || (c === level.exit.col && r === level.exit.row)) continue;
          out.push({ ...placeProp({ kind: 'brick_wall', cell: { col, row }, wall, y: WALL_HEIGHT / 2 }), scale: [1, 1, TILE / width] });
        }
      }
    }
  }
  return out;
}

/** The wall a placement backs onto is really a wall (tests + level checks). */
export function backedByWall(level: Level, p: PropPlacement): boolean {
  if (!p.wall) return true;
  const n = FACE_DIR[p.wall];
  return isSolid(level, p.cell.col + n.dc, p.cell.row + n.dr);
}
