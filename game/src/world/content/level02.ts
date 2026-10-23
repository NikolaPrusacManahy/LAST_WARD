// Level 2 — Ashgrove House (Update 0.7). Three floors joined by stairs; see world/level.ts for the
// legend. Stairs: ^ = a flight going up toward the top of the map, o = its stairwell on the floor above.
//
// Ground floor: kitchen (servants' stair in its corner), dining room, parlour, the long hallway,
//   library, entrance hall (grand staircase, front door = the exit), drawing room.
// First floor: servants' room, master bedroom, nursery, hallway with the two attic stairs,
//   west bedroom, the gallery over the entrance hall, east bedroom.
// Attic: the generator, storerooms, the old nursery, the trunk room.
import { LevelDef } from '../level';

export const LEVEL_02: LevelDef = {
  name: 'Ashgrove House',
  floors: [
    // Ground floor
    [
      '#########################',
      '#....###........#.......#',
      '#....###........#.......#',
      '#F...#^#........#......N#',
      '#....#^#........#.......#',
      '#......#........#.......#',
      '###.#######.########.####',
      '#.....L...........L.....#',
      '####.#####.###.#####.####',
      '#.......#.......#.......#',
      '#.##.##.#..###..#..#....#',
      '#.......#..###..#..#....#',
      '#.##.##....#^#.........B#',
      '#.......#..#^#..#.......#',
      '#B......#.......#.......#',
      '#.......#...P..L#......N#',
      '############X############',
    ],
    // First floor
    [
      '#########################',
      '#......###.....###......#',
      '#......###.....###.....F#',
      '#....#o###.....###......#',
      '#....#o###.....###......#',
      '#......#^#.....#^#......#',
      '###.####^###.###^###.####',
      '#...L...............L...#',
      '####.#####.###.#####.####',
      '#.......#.......#.......#',
      '#.......#.......#.......#',
      '#####.###.......#.......#',
      '#.......#..#o#..#.......#',
      '#N......#..#o#..#......B#',
      '#.......#.......#.......#',
      '#.......#.......#.......#',
      '#########################',
    ],
    // Attic
    [
      '#########################',
      '#.......#...G...#.......#',
      '#F......#.......#.......#',
      '####.#######.#######.####',
      '#...........L...........#',
      '####.###o###.###o###.####',
      '#......#o#.....#o#.....N#',
      '#......###.....###......#',
      '#.......#.......#.......#',
      '#B..L...#.......#.......#',
      '#.......#.......#.......#',
      '#.......#...E...#.......#',
      '#####################.###',
      '#.......................#',
      '#B......................#',
      '#.......................#',
      '#########################',
    ],
  ],
  notes: [
    'Housekeeping, Ashgrove. Master Edwin is not to be disturbed after dark. Keep the attic locked. If he calls your name from the stairs, do not answer him.',
    'Since the storm the whole house runs off the generator in the attic. Three fuses. I hid them around the house so he could not pull them out again. The front door is on the same lock as the hospital. No power, no way out.',
    'Edwin came home from St. Brigid\'s last winter. The doctors said he was well. He does not sleep. He walks the stairs all night, up and down, up and down.',
    'If you hear it on the stairs, do not go up. It always comes up after you. It does not forget where you went.',
  ],
  intro: {
    time: '04:02 AM',
    lines: ['You wake up on the floor of a dark entrance hall.', 'The front door is locked. Something is walking upstairs.'],
  },
  // A bigger house over three floors: it keeps tracking you much longer once it has seen you
  // (follows you up and down the stairs), and searches longer and wider when it loses you.
  ai: { memorySeconds: 5, searchSeconds: 16, searchRadiusTiles: 5 },
  startYaw: 0, // facing up the map, toward the grand staircase
};
