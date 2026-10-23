// Update 0.9.4 — hearing The Patient through walls and round corners at the right loudness.
import { check, section } from './harness';
import { LEVEL_01 } from '../src/world/content/level01';
import { cellCenter, parseLevel } from '../src/world/level';
import { lineOfSight } from '../src/world/lineOfSight';
import { soundPath, wallsBetween } from '../src/world/soundPath';
import { HEARING, enemyHearing, falloff } from '../src/audio/spatial';

const level = parseLevel(LEVEL_01);
const at = (col: number, row: number) => cellCenter({ col, row });
/** What actually reaches you, relative to it standing 2.5 m away in the open. */
const heard = (src: { col: number; row: number }, you: { col: number; row: number }) => {
  const p = soundPath(level, at(src.col, src.row), at(you.col, you.row));
  return { p, mix: enemyHearing(p), level: falloff(p.straight) * enemyHearing(p).gain };
};
/** The pre-0.9.4 model: a wall took off 45% and steps got 1.5× back. */
const before = (straight: number, occluded: boolean) => falloff(straight) * (occluded ? 0.55 * 1.5 : 1);

section('Hearing The Patient (0.9.4)');
{
  const you = { col: 10, row: 5 }; // top corridor
  const open = heard({ col: 16, row: 5 }, you); // same corridor, 18 m
  check('same corridor: nothing in the way, full loudness for the distance', open.p.walls === 0 && open.mix.gain === 1);
  const oneWall = heard({ col: 10, row: 8 }, you); // generator room, one wall
  check('one wall between', oneWall.p.walls === 1);
  const twoWalls = heard({ col: 10, row: 11 }, you); // the corridor past the generator room
  check('two walls between', twoWalls.p.walls === 2, `${twoWalls.p.walls}`);
  check('one wall: well under half as loud as in the open at that distance', oneWall.mix.gain < 0.45, oneWall.mix.gain.toFixed(2));
  check('two walls: quieter than one', twoWalls.level < oneWall.level * 0.6);
  check('two walls: at least 4× quieter than before 0.9.4', twoWalls.level < before(twoWalls.p.straight, true) / 4, `${twoWalls.level.toFixed(3)} vs ${before(twoWalls.p.straight, true).toFixed(3)}`);
  check('two walls away sounds further off than 18 m down an open corridor', twoWalls.level < open.level, `${twoWalls.level.toFixed(3)} vs ${open.level.toFixed(3)}`);
  check('through walls: dull (low-passed)', oneWall.mix.cutoff <= HEARING.aroundMaxHz && twoWalls.mix.cutoff <= HEARING.aroundMaxHz);
  // Round a corner: just out of sight down a side passage, the sound comes round, from the corner.
  const corner = heard({ col: 1, row: 7 }, { col: 3, row: 5 });
  check('just round a corner: heard round it, not through the wall', corner.p.walls >= 1 && corner.mix.around === true && corner.p.around < corner.p.straight * 2);
  check('…from the corner you can see', !!corner.p.via && lineOfSight(level, at(3, 5), corner.p.via));
  check('…and louder than through walls would be', corner.level > falloff(corner.p.straight) * Math.pow(HEARING.wallLoss, corner.p.walls));
  check('in sight: no muffling', !heard({ col: 12, row: 5 }, you).mix.occluded);
  check('walls are counted once each, however thick', wallsBetween(level, at(10, 5), at(10, 8)) === 1);
}
