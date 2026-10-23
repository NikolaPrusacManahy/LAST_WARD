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
};
