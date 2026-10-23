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
    'To whoever finds this: it can\'t see well in the dark, but it hears EVERYTHING. Walk slowly. Crouch if it\'s close. Don\'t run unless it\'s already seen you.',
    'Maintenance: the generator takes three fuses. I hid the spares around the ward so it couldn\'t pull them. The exit door is on the mag-lock. No power, no way out.',
    'It got faster every time someone fixed something. Like it knew. Like it was angry we were trying to leave.',
  ],
};
