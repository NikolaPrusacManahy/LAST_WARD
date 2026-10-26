// Level 1 — St. Brigid's, Ward 13. See world/level.ts for the legend.
import { LevelDef } from '../level';

export const LEVEL_01: LevelDef = {
  name: "St. Brigid's — Ward 13",
  id: 'ward13',
  short: 'Ward 13',
  blurb: 'Tight halls, small rooms.',
  theme: 'hospital',
  map: [
    '#########################',
    '#.....#..F..#...M.#....N#',
    '#..P..#.....#.....#.....#',
    '#.....#.....#.B...#B....#',
    '###.#####.#####.#####.###',
    '#...L.......L.......L...#',
    '#.#####.#########.#####.#',
    '#.#N..#.#.......#.#..F#.#',
    '#.#...#.#...G...#.#...#.#',
    '#.#B....#.......#....B#.#',
    '#.#####.####.####.#####.#',
    '#...........L...........#',
    '#.####.#####.#####.####.#',
    '#.#..#.#M.......F#.#..#.#',
    '#.#F...#....E....#...N#.#',
    '#.#..#.#.........#.#B.#.#',
    '#.####.####.######.####.#',
    '#.....L.....N.....L.....X',
    '#########################',
  ],
  // Update 0.9.8 — short logs, up to date (four panels, the ceiling, med kits, its blind back).
  notes: [
    "NIGHT LOG, 03:12 — Patient 13 is out of restraints again. It walks when the lights go out. It never sees what's behind it. Keep the generator running.",
    "LOG, DAY 2 — It threw me five metres down the hall. My leg broke against the wall. It won't let go twice. There are med kits in the rooms. Find one.",
    'MAINTENANCE — Four panels, one in each wing. Each takes a fuse: fit it, repair it, throw its switch. Then start the generator. The exit is on the mag-lock. No power, no way out.',
    'LOG, DAY 3 — Every fuse we find, it runs faster. Now it climbs the ceilings of the halls. Up there it never comes into a room. Get into one and keep still.',
  ],
  // Update 0.6.3 — straight ahead as you leave the spawn room (its door is cell 3,4; this wall closes the corridor).
  wallNotes: [{ cell: { col: 3, row: 6 }, face: 'north', text: 'It can hear you...' }],
  // Update 0.8 — real props (world/props.ts, models credited in state/credits.ts). `wall` = the side of the
  // cell it stands against; it faces into the room.
  // Update 0.9 — the generator room is lined with brick on every wall (everything else stays tiled).
  // Update 0.9.6 — bricks and bottles lying in the halls, against the walls (state/throwables.ts).
  throwables: [
    { kind: 'brick', cell: { col: 2, row: 5 }, at: [0.3, -1.15] },
    { kind: 'bottle', cell: { col: 10, row: 5 }, at: [-0.4, 1.15] },
    { kind: 'brick', cell: { col: 17, row: 5 }, at: [0.5, -1.15] },
    { kind: 'bottle', cell: { col: 1, row: 8 }, at: [-1.15, 0.4] },
    { kind: 'brick', cell: { col: 5, row: 11 }, at: [-0.3, -1.15] },
    { kind: 'bottle', cell: { col: 14, row: 11 }, at: [0.6, 1.15] },
    { kind: 'brick', cell: { col: 23, row: 13 }, at: [1.15, -0.5] },
    { kind: 'bottle', cell: { col: 9, row: 17 }, at: [0.2, 1.15] },
    { kind: 'brick', cell: { col: 20, row: 17 }, at: [-0.6, -1.15] },
  ],
  brickRooms: [{ from: { col: 9, row: 7 }, to: { col: 15, row: 9 } }],
  // Update 0.9.7 — the corridors: The Patient crawls along their ceilings, never into a room (doorways
  // aren't corridor). A ring round the ward, the middle hall, and four short halls between them.
  corridors: [
    { from: { col: 1, row: 5 }, to: { col: 23, row: 5 } }, // top hall
    { from: { col: 1, row: 11 }, to: { col: 23, row: 11 } }, // middle hall
    { from: { col: 1, row: 17 }, to: { col: 23, row: 17 } }, // bottom hall
    { from: { col: 1, row: 6 }, to: { col: 1, row: 16 } }, // west hall
    { from: { col: 23, row: 6 }, to: { col: 23, row: 16 } }, // east hall
    { from: { col: 7, row: 6 }, to: { col: 7, row: 10 } }, // top → middle, left
    { from: { col: 17, row: 6 }, to: { col: 17, row: 10 } }, // top → middle, right
    { from: { col: 6, row: 12 }, to: { col: 6, row: 16 } }, // middle → bottom, left
    { from: { col: 18, row: 12 }, to: { col: 18, row: 16 } }, // middle → bottom, right
  ],
  props: [
    // The room you wake up in: the bed, its screen, cabinets, the medicine shelf, pictures.
    { kind: 'hospital_bed', cell: { col: 3, row: 1 }, wall: 'north' },
    { kind: 'bedside_flowers', cell: { col: 2, row: 1 }, wall: 'north', along: 0.9 },
    { kind: 'privacy_screen', cell: { col: 4, row: 1 }, wall: 'north', along: -0.55 },
    { kind: 'side_table', cell: { col: 5, row: 1 }, wall: 'north', along: 0.4 },
    { kind: 'medicine_shelf', cell: { col: 1, row: 2 }, wall: 'west' },
    { kind: 'bedside_meds', cell: { col: 1, row: 3 }, wall: 'west', along: 0.6 },
    { kind: 'bedside_drawing', cell: { col: 5, row: 3 }, wall: 'east', along: 0.6 },
    { kind: 'radiator', cell: { col: 5, row: 2 }, wall: 'east' },
    { kind: 'portrait', cell: { col: 1, row: 1 }, wall: 'west', y: 1.65 },
    { kind: 'child_drawing', cell: { col: 5, row: 2 }, wall: 'east', y: 1.55 },
    // Generator room: the machine, the electrical wall behind it, the breaker panel and the switch.
    { kind: 'generator', cell: { col: 12, row: 8 }, face: 'south' },
    { kind: 'electrical_wall', cell: { col: 12, row: 7 }, wall: 'north', y: 1.57 },
    // Update 0.9 — the four electrical panels (box + its switch), one per corner of the ward. Tiled walls.
    { kind: 'breaker_box', cell: { col: 7, row: 2 }, wall: 'west', along: -0.35, y: 1.45 },
    { kind: 'power_switch', cell: { col: 7, row: 2 }, wall: 'west', along: 0.75, y: 1.3 },
    { kind: 'breaker_box', cell: { col: 23, row: 2 }, wall: 'east', along: -0.35, y: 1.45 },
    { kind: 'power_switch', cell: { col: 23, row: 2 }, wall: 'east', along: 0.75, y: 1.3 },
    { kind: 'breaker_box', cell: { col: 1, row: 14 }, wall: 'west', along: -0.35, y: 1.45 },
    { kind: 'power_switch', cell: { col: 1, row: 14 }, wall: 'west', along: 0.75, y: 1.3 },
    { kind: 'breaker_box', cell: { col: 20, row: 13 }, wall: 'north', along: -0.35, y: 1.45 },
    { kind: 'power_switch', cell: { col: 20, row: 13 }, wall: 'north', along: 0.75, y: 1.3 },
    { kind: 'barrel', cell: { col: 15, row: 9 }, wall: 'south', along: 0.75 },
    { kind: 'barrel', cell: { col: 15, row: 9 }, wall: 'east', along: -0.2 },
    { kind: 'barrel_lying', cell: { col: 9, row: 9 }, wall: 'west', along: 0.5 },
    // Halls: radiators under the windows that aren't there, a barrel at the west end.
    { kind: 'radiator', cell: { col: 8, row: 5 }, wall: 'south' },
    { kind: 'radiator', cell: { col: 16, row: 5 }, wall: 'south' },
    { kind: 'radiator', cell: { col: 19, row: 11 }, wall: 'north' },
    { kind: 'radiator', cell: { col: 2, row: 17 }, wall: 'south' },
    { kind: 'barrel', cell: { col: 1, row: 11 }, wall: 'west', along: 0.6 },
    // The washroom off the bottom-left corridor.
    { kind: 'toilet', cell: { col: 4, row: 13 }, wall: 'north' },
    // Update 0.9.5 — lockers to hide in, spread round the ward (state/hiding.ts).
    { kind: 'locker', cell: { col: 11, row: 2 }, wall: 'east' },
    { kind: 'locker', cell: { col: 17, row: 2 }, wall: 'east' },
    { kind: 'locker', cell: { col: 5, row: 8 }, wall: 'east' },
    { kind: 'locker', cell: { col: 19, row: 8 }, wall: 'west' },
    { kind: 'locker', cell: { col: 8, row: 15 }, wall: 'west' },
    { kind: 'locker', cell: { col: 16, row: 15 }, wall: 'east' },
    { kind: 'locker', cell: { col: 14, row: 17 }, wall: 'south' },
    // Update 0.9.6 — more lockers in the corridors (somewhere to go when it's on you) and two in the
    // generator room.
    { kind: 'locker', cell: { col: 6, row: 5 }, wall: 'north' },
    { kind: 'locker', cell: { col: 21, row: 11 }, wall: 'north' },
    { kind: 'locker', cell: { col: 23, row: 7 }, wall: 'east' },
    { kind: 'locker', cell: { col: 4, row: 17 }, wall: 'south' },
    { kind: 'locker', cell: { col: 9, row: 7 }, wall: 'west', along: -0.5 },
    { kind: 'locker', cell: { col: 15, row: 7 }, wall: 'east', along: -0.5 },
    // Update 0.9.6 — the generator room was bare: a store room now. Pipes and boxes on the walls, drums,
    // a supply shelf, a work table, a radiator (all against the walls, the middle kept clear).
    { kind: 'electrical_wall', cell: { col: 9, row: 8 }, wall: 'west', y: 1.57 },
    { kind: 'electrical_wall', cell: { col: 15, row: 8 }, wall: 'east', y: 1.57 },
    { kind: 'medicine_shelf', cell: { col: 10, row: 7 }, wall: 'north' },
    { kind: 'side_table', cell: { col: 14, row: 7 }, wall: 'north' },
    { kind: 'barrel', cell: { col: 9, row: 9 }, wall: 'south', along: 0.7 },
    { kind: 'barrel', cell: { col: 10, row: 9 }, wall: 'south', along: -0.6 },
    { kind: 'barrel_lying', cell: { col: 14, row: 9 }, wall: 'south', along: 0.5 },
    { kind: 'radiator', cell: { col: 11, row: 9 }, wall: 'south' },
  ],
};
