// Update 1.0.1 — level 2: Harrow Mill, an abandoned factory (Nikola: "Player can pick which level they
// want to play"), built from the Abandoned Factory Modules kit (Thaddaeus, CC BY 4.0; engine/factoryView.ts).
// See world/level.ts for the legend.
// Ground floor — west: the office you wake up in, the changing room, the boiler room (generator). Middle:
// the machine hall (machines and pillars to break its sight) and the warehouse (shelf aisles). East: the
// locker room, the foreman's office and the loading bay with the way out. Three corridors join them.
// Upstairs (Nikola: "let's add an upper floor to it") — a steel stair at the top of each side corridor
// leads to the gantry, and off it the records office, the drafting loft over the hall and the control
// room (one of the four panels is up there). Two ways up and down: it can follow you either way.
// The Patient crawls along the ceilings of the corridors and the gantry.
import { FLOOR_GAP_ROWS, LevelDef } from '../level';

const ROWS = 19;
/** A cell upstairs, in the level's logic rows (floors are stacked: world/level.ts). */
const up = (col: number, row: number) => ({ col, row: ROWS + FLOOR_GAP_ROWS + row });

export const LEVEL_02: LevelDef = {
  name: 'Harrow Mill',
  id: 'factory',
  short: 'Harrow Mill',
  blurb: 'Open halls, long sight lines. Two floors.',
  theme: 'factory',
  floors: [
    [
      '###########################',
      '#....B###........F###B....#',
      '#.P...#^#.##...##.#^#.....#',
      '#.........##.L.##.........#',
      '#N....#L#.........#.#.....#',
      '#######.....#.#.....#.....#',
      '#....M#.#........N#.#######',
      '#.....#.#.##...##.#L#....F#',
      '#.......#.##...##.#.......#',
      '#N....#.............#....N#',
      '#######.#.###.###.#.#######',
      '#....F#.#.........#.#.....#',
      '#.....#L#.###.###.#.......#',
      '#.....#......E......#.....#',
      '#..G....#.###.###.#.#..L..X',
      '#.....#.#B......F.#.#.....#',
      '#.....#.###.###.###.......#',
      '#.....#......L......#B...M#',
      '###########################',
    ],
    [
      '###########################',
      '#............L............#',
      '#.....#o###.###.###o#.....#',
      '#.....###M...#....###.....#',
      '#N....###....#....###.....#',
      '#########.##...##.###....B#',
      '#########.....L...#########',
      '#########.........#########',
      '###########################',
      '###########################',
      '###########################',
      '###########################',
      '###########################',
      '###########################',
      '###########################',
      '###########################',
      '###########################',
      '###########################',
      '###########################',
    ],
  ],
  // Facing the office door (east).
  startYaw: -Math.PI / 2,
  // Update 1.0.2 — The Patient's pace here (Nikola): patrols half as fast again, crawls 5–10 s longer.
  ai: { patrolSpeed: 1.5, crawlExtra: [5, 10] },
  intro: {
    time: '02:47 AM',
    lines: ['You wake up on the floor of the old Harrow Mill office.', 'The last crate from St. Brigid’s came in tonight. It was empty.'],
  },
  notes: [
    'SHIFT LOG, 22:40 — A crate came over from St. Brigid’s. Sealed, no papers. By midnight the lid was off and the night shift was gone.',
    'FOREMAN — Four breaker panels: two down here, one in the warehouse, one up in the control room. Fuse, repair, switch. Then the generator in the boiler room. The loading door stays shut without power.',
    'Don’t cross the main hall with your torch on. It stands between the machines and waits for the light.',
    'LOG — It runs along the corridor ceilings, and the gantry’s. Every fuse we fit, it gets faster. Two stairs up. Use the one it isn’t on.',
    'RECORDS, 1971 — Patient 13 transferred from St. Brigid’s to Harrow Mill for work therapy. Discharged: never.',
  ],
  wallNotes: [{ cell: { col: 8, row: 4 }, face: 'west', text: 'It came in the crate' }],
  throwables: [
    { kind: 'brick', cell: { col: 7, row: 4 }, at: [1.15, 0] },
    { kind: 'bottle', cell: { col: 7, row: 15 }, at: [-1.15, 0] },
    { kind: 'brick', cell: { col: 19, row: 4 }, at: [1.15, 0] },
    { kind: 'bottle', cell: { col: 19, row: 15 }, at: [-1.15, 0.3] },
    { kind: 'brick', cell: { col: 12, row: 17 }, at: [0.4, 1.15] },
    { kind: 'bottle', cell: { col: 17, row: 17 }, at: [0, 1.15] },
    { kind: 'bottle', cell: { col: 9, row: 6 }, at: [-1.15, 0] },
    { kind: 'brick', cell: { col: 13, row: 1 }, at: [0, -1.15] },
    { kind: 'bottle', cell: { col: 17, row: 11 }, at: [1.15, 0] },
    { kind: 'brick', cell: up(10, 1), at: [0, -1.15] },
    { kind: 'bottle', cell: up(16, 1), at: [0.3, -1.15] },
  ],
  // Update 1.0.2 — the side corridors run on up their stairs (Nikola: it crawls on up the stairwell, turned
  // upright up the wall, then over onto the ceiling upstairs): the stair, the block under the landing and the
  // stairwell above are corridor too, so its crawl joins both floors.
  corridors: [
    { from: { col: 7, row: 1 }, to: { col: 7, row: 17 } }, // west corridor, up its stair
    { from: { col: 19, row: 1 }, to: { col: 19, row: 17 } }, // east corridor, up its stair
    { from: { col: 8, row: 17 }, to: { col: 18, row: 17 } }, // south corridor
    { from: up(7, 1), to: up(19, 1) }, // the gantry upstairs, landing to landing
    { from: up(7, 2), to: up(7, 2) }, // the two stairwells (down from the gantry)
    { from: up(19, 2), to: up(19, 2) },
  ],
  props: [
    // Boiler room: the generator facing its door, pipes and boxes on the walls, drums, a warning.
    { kind: 'generator', cell: { col: 3, row: 14 }, face: 'east' },
    { kind: 'electrical_wall', cell: { col: 1, row: 14 }, wall: 'west', y: 1.57 },
    { kind: 'electrical_wall', cell: { col: 3, row: 11 }, wall: 'north', y: 1.57 },
    { kind: 'barrel', cell: { col: 1, row: 17 }, wall: 'west', along: 0.5 },
    { kind: 'barrel', cell: { col: 2, row: 17 }, wall: 'south', along: -0.3 },
    { kind: 'barrel_lying', cell: { col: 5, row: 17 }, wall: 'east', along: 0.4 },
    { kind: 'sign_warning', cell: { col: 5, row: 13 }, wall: 'east', y: 1.7 },
    // The four electrical panels (box + its switch), one per corner of the plant (the north-east one upstairs).
    { kind: 'breaker_box', cell: { col: 1, row: 7 }, wall: 'west', along: -0.35, y: 1.45 },
    { kind: 'power_switch', cell: { col: 1, row: 7 }, wall: 'west', along: 0.75, y: 1.3 },
    { kind: 'breaker_box', cell: up(25, 2), wall: 'east', along: -0.35, y: 1.45 },
    { kind: 'power_switch', cell: up(25, 2), wall: 'east', along: 0.75, y: 1.3 },
    { kind: 'breaker_box', cell: { col: 9, row: 11 }, wall: 'west', along: -0.35, y: 1.45 },
    { kind: 'power_switch', cell: { col: 9, row: 11 }, wall: 'west', along: 0.75, y: 1.3 },
    { kind: 'breaker_box', cell: { col: 25, row: 12 }, wall: 'east', along: -0.35, y: 1.45 },
    { kind: 'power_switch', cell: { col: 25, row: 12 }, wall: 'east', along: 0.75, y: 1.3 },
    // Lockers: a row in the locker room, the rest spread round the plant.
    { kind: 'locker', cell: { col: 22, row: 1 }, wall: 'north' },
    { kind: 'locker', cell: { col: 23, row: 1 }, wall: 'north' },
    { kind: 'locker', cell: { col: 24, row: 1 }, wall: 'north' },
    { kind: 'locker', cell: { col: 23, row: 5 }, wall: 'south' },
    { kind: 'locker', cell: { col: 7, row: 6 }, wall: 'west' },
    { kind: 'locker', cell: { col: 19, row: 11 }, wall: 'east' },
    { kind: 'locker', cell: { col: 10, row: 17 }, wall: 'south' },
    { kind: 'locker', cell: { col: 16, row: 17 }, wall: 'south' },
    { kind: 'locker', cell: { col: 3, row: 9 }, wall: 'south' },
    { kind: 'locker', cell: { col: 9, row: 4 }, wall: 'west' },
    { kind: 'locker', cell: { col: 17, row: 8 }, wall: 'east' },
    { kind: 'locker', cell: { col: 13, row: 15 }, wall: 'south' },
    { kind: 'locker', cell: { col: 1, row: 12 }, wall: 'west' },
    { kind: 'locker', cell: { col: 22, row: 9 }, wall: 'south' },
    { kind: 'locker', cell: { col: 21, row: 13 }, wall: 'west' },
    { kind: 'locker', cell: up(12, 1), wall: 'north' },
    { kind: 'locker', cell: up(3, 4), wall: 'south' },
    { kind: 'locker', cell: up(17, 3), wall: 'east' },
    { kind: 'locker', cell: up(9, 6), wall: 'west' },
    { kind: 'locker', cell: up(22, 5), wall: 'south' },
    // The machine hall: control consoles at the machines, a fuse box by the door.
    { kind: 'console', cell: { col: 12, row: 2 }, wall: 'west' },
    { kind: 'console', cell: { col: 14, row: 3 }, wall: 'east' },
    { kind: 'console', cell: { col: 12, row: 8 }, wall: 'west' },
    { kind: 'console', cell: { col: 14, row: 7 }, wall: 'east' },
    { kind: 'electric_box', cell: { col: 9, row: 2 }, wall: 'west', y: 1.4 },
    { kind: 'sign_caution', cell: { col: 10, row: 4 }, wall: 'north', y: 1.9 },
    { kind: 'barrel', cell: { col: 9, row: 7 }, wall: 'west', along: 0.6 },
    { kind: 'barrel_lying', cell: { col: 17, row: 4 }, wall: 'east', along: -0.4 },
    // The warehouse: crates against the shelving.
    { kind: 'crate', cell: { col: 10, row: 11 }, wall: 'south', along: 0.3 },
    { kind: 'crate_tall', cell: { col: 16, row: 13 }, wall: 'north', along: -0.4 },
    { kind: 'crate', cell: { col: 11, row: 15 }, wall: 'north' },
    { kind: 'tank', cell: { col: 14, row: 11 }, wall: 'south', along: 0.9 },
    // Loading bay: crates and drums by the door, the warning by the way out.
    { kind: 'crate_tall', cell: { col: 22, row: 11 }, wall: 'north', along: -0.5 },
    { kind: 'crate', cell: { col: 23, row: 11 }, wall: 'north', along: 0.2 },
    { kind: 'barrel', cell: { col: 25, row: 16 }, wall: 'east', along: 0.3 },
    { kind: 'barrel', cell: { col: 24, row: 17 }, wall: 'south', along: 0.2 },
    { kind: 'sign_warning', cell: { col: 25, row: 15 }, wall: 'east', y: 1.8 },
    // Corridors: fuse boxes and signs.
    { kind: 'electric_box', cell: { col: 7, row: 9 }, wall: 'west', y: 1.4 },
    { kind: 'electric_box', cell: { col: 19, row: 14 }, wall: 'east', y: 1.4 },
    { kind: 'sign_caution', cell: { col: 13, row: 17 }, wall: 'south', y: 1.9 },
    // Upstairs. The control room: consoles, its panel (above) and a fuse box.
    { kind: 'console', cell: up(21, 1), wall: 'north', along: 0.4 },
    { kind: 'console', cell: up(23, 1), wall: 'north' },
    { kind: 'electric_box', cell: up(21, 3), wall: 'west', y: 1.4 },
    { kind: 'blueprint', cell: up(24, 1), wall: 'north', y: 1.6 },
    // The drafting loft: plans on the walls, crates of records.
    { kind: 'blueprint', cell: up(10, 3), wall: 'north', y: 1.6 },
    { kind: 'blueprint', cell: up(16, 3), wall: 'north', y: 1.6 },
    { kind: 'crate', cell: up(17, 7), wall: 'south', along: 0.4 },
    { kind: 'crate_tall', cell: up(9, 7), wall: 'south', along: -0.4 },
    // The records office.
    { kind: 'crate', cell: up(5, 1), wall: 'north', along: 0.4 },
    { kind: 'crate_tall', cell: up(1, 1), wall: 'west', along: -0.4 },
    // The gantry.
    { kind: 'sign_caution', cell: up(14, 1), wall: 'south', y: 1.9 },
  ],
};
