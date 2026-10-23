// Level 1 — St. Brigid's, Ward 13. See world/level.ts for the legend.
import { LevelDef } from '../level';

export const LEVEL_01: LevelDef = {
  name: "St. Brigid's — Ward 13",
  map: [
    '#########################',
    '#.....#..F..#.....#....N#',
    '#..P..#.....#.....#.....#',
    '#.....#.....#.B...#.....#',
    '###.#####.#####.#####.###',
    '#...L.......L.......L...#',
    '#.#####.#########.#####.#',
    '#.#N..#.#.......#.#..F#.#',
    '#.#...#.#...G...#.#...#.#',
    '#.#B....#.......#.....#.#',
    '#.#####.####.####.#####.#',
    '#...........L...........#',
    '#.####.#####.#####.####.#',
    '#.#..#.#.........#.#..#.#',
    '#.#F...#....E....#...N#.#',
    '#.#..#.#.........#.#B.#.#',
    '#.####.####.######.####.#',
    '#.....L.....N.....L.....X',
    '#########################',
  ],
  notes: [
    'NIGHT LOG, 03:12 — Patient in 13 is out of restraints again. Orderly says it walks when the lights go out. Keep the generator running. Whatever happens, keep it running.',
    'I don\'t know who\'ll read this. It picked me up like I weighed nothing — one hand, by the collar — and threw me down the corridor. Five metres, maybe more. I heard my leg go before I hit the wall. I lay there with my eyes shut while it walked away, like it was done with me. Like it was saving me for later. I can\'t stop shaking. If it gets hold of you, it won\'t let go twice.',
    'Maintenance: the generator takes three fuses. I hid the spares around the ward so it couldn\'t pull them. The exit door is on the mag-lock. No power, no way out.',
    'It got faster every time someone fixed something. Like it knew. Like it was angry we were trying to leave.',
  ],
  // Update 0.6.3 — straight ahead as you leave the spawn room (its door is cell 3,4; this wall closes the corridor).
  wallNotes: [{ cell: { col: 3, row: 6 }, face: 'north', text: 'It can hear you...' }],
  // Update 0.8 — real props (world/props.ts, models credited in state/credits.ts). `wall` = the side of the
  // cell it stands against; it faces into the room.
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
    { kind: 'electrical_wall', cell: { col: 12, row: 7 }, wall: 'north', y: 1.6 },
    // Update 0.8.1 — the same brick behind the breaker panel and the switch.
    { kind: 'brick_wall', cell: { col: 10, row: 7 }, wall: 'north', along: -0.6, y: 1.6 },
    { kind: 'breaker_box', cell: { col: 10, row: 7 }, wall: 'north', along: -0.35, y: 1.45 },
    { kind: 'power_switch', cell: { col: 10, row: 7 }, wall: 'north', along: 0.75, y: 1.3 },
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
  ],
};
