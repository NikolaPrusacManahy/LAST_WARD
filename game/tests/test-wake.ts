// Update 0.6.3 — waking up on the floor at the start, the note outside the spawn room, the victim's note.
import { check, section } from './harness';
import { WAKE, wakeClipTime, wakeCues, wakeEyelids, wakeLight, wakeTextOpacity, wakeTimes } from '../src/state/wakeSequence';
import { guardLeave } from '../src/state/session';
import { LEVEL_01 } from '../src/world/content/level01';
import { FACE_DIR, cellCenter, isSolid, parseLevel } from '../src/world/level';

const level = parseLevel(LEVEL_01);

section('Wake-up intro (0.6.3)');
{
  check('eyes stay shut while the intro text fades on black', wakeEyelids(0) === 1 && wakeEyelids(WAKE.textFade * 0.99) === 1);
  check('the text is gone before the lids start to open', wakeTextOpacity(wakeTimes.lidsAt) === 0 && wakeTextOpacity(0) === 1);
  check('the lids open, then they are fully open', wakeEyelids(wakeTimes.lidsAt + WAKE.lidsOpen / 2) < 1 && wakeEyelids(wakeTimes.openAt) === 0);
  check('1 s lying there with eyes open before getting up', Math.abs(wakeTimes.getUpAt - wakeTimes.openAt - 1) < 1e-9);
  check('the get-up clip holds its first pose until then', wakeClipTime(0) === 0 && wakeClipTime(wakeTimes.getUpAt) === 0 && wakeClipTime(wakeTimes.getUpAt + 1) === 1);
  const fired: string[] = [];
  let prev = -1;
  for (let t = 0; t <= wakeTimes.endAt + 0.1; t += 1 / 60) {
    fired.push(...wakeCues(prev, t));
    prev = t;
  }
  check('get up (with the grunt) fires once, then the run starts', fired.join(',') === 'getUp,done', fired.join(','));
  check('the flashlight is dim face-down on the floor, full once you are up',
    wakeLight(wakeTimes.openAt) < 0.2 && wakeLight(wakeTimes.getUpAt) < 0.2 && wakeLight(wakeTimes.endAt) === 1);
  check('the intro grunt is cut to 1 s', WAKE.gruntSeconds === 1);
  check('leaving mid wake-up asks first, like a running game', guardLeave('waking'));
}

section('Wall note outside the spawn room (0.6.3)');
{
  check('one wall note: "It can hear you..."', level.wallNotes.length === 1 && level.wallNotes[0].text === 'It can hear you...');
  const w = level.wallNotes[0];
  const d = FACE_DIR[w.face];
  check('it hangs on a wall, facing open floor', isSolid(level, w.cell.col, w.cell.row) && !isSolid(level, w.cell.col + d.dc, w.cell.row + d.dr));
  // Walk out of the spawn room: from the player start straight down (+row) until the first wall.
  const s = level.playerStart;
  let row = s.row;
  while (!isSolid(level, s.col, row + 1)) row++;
  check('straight ahead as you step out of the spawn room', w.cell.col === s.col && w.cell.row === row + 1 && w.face === 'north', `${w.cell.col},${w.cell.row}`);
  const doorway = cellCenter({ col: s.col, row: s.row + 2 });
  check('the doorway lines up with the note', Math.abs(doorway.x - cellCenter(w.cell).x) < 1e-9);
  let threw = false;
  try {
    parseLevel({ ...LEVEL_01, wallNotes: [{ cell: { col: 3, row: 5 }, face: 'north', text: 'x' }] });
  } catch {
    threw = true;
  }
  check('a wall note on floor is rejected', threw);
}

section("The victim's note replaces the old advice (0.6.3)");
{
  const all = LEVEL_01.notes.join(' ');
  check('no table note gives the old "it hears everything" advice', !/hears everything|walk slowly|crouch if/i.test(all));
  const story = LEVEL_01.notes.find((n) => /five metres/i.test(n));
  check('a note tells of being thrown at least five metres', !!story);
  check('…and of the broken leg', !!story && /leg/i.test(story));
  check('note count still matches the N tiles', LEVEL_01.notes.length === 4);
}
