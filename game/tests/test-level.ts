import { check, section } from './harness';
import { LEVEL_01 } from '../src/world/content/level01';
import { cellCenter, isSolid, itemPos, parseLevel, dist } from '../src/world/level';
import { reachable } from '../src/world/pathfinding';
import { FUSES_NEEDED } from '../src/state/objectives';

section('Level 01');
const level = parseLevel(LEVEL_01);
const fromStart = reachable(level, level.playerStart);
const key = (c: { col: number; row: number }) => c.row * level.cols + c.col;

check('parses', level.cols === 25 && level.rows === 19);
check(`has ${FUSES_NEEDED} fuses`, level.items.filter((i) => i.kind === 'fuse').length === FUSES_NEEDED);
check('every item reachable from start', level.items.every((i) => fromStart.has(key(i.cell))));
check('enemy start reachable', fromStart.has(key(level.enemyStart)));
check(
  'generator has a walkable neighbour',
  [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dc, dr]) => fromStart.has(key({ col: level.generator.col + dc, row: level.generator.row + dr }))),
);
check(
  'exit has a walkable neighbour',
  [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dc, dr]) => fromStart.has(key({ col: level.exit.col + dc, row: level.exit.row + dr }))),
);
check('lamps ≤ 8 (point-light budget)', level.lamps.length <= 8, `${level.lamps.length}`);
check('notes all have text', level.items.filter((i) => i.kind === 'note').every((i) => !!level.notes[i.noteIndex!]));
check(
  'every item cabinet is pushed against a wall (keeps cell centres clear)',
  level.items.every((i) => dist(itemPos(level, i.cell), cellCenter(i.cell)) > 1),
);
check('outside the map is solid', isSolid(level, -1, 0) && isSolid(level, 0, 999));
const s = cellCenter(level.playerStart);
check('player starts far from enemy', Math.hypot(s.x - cellCenter(level.enemyStart).x, s.z - cellCenter(level.enemyStart).z) > 20);

let threw = false;
try {
  parseLevel({ name: 'bad', map: ['#?#'], notes: [] });
} catch {
  threw = true;
}
check('unknown tile throws', threw);

section('Wall notes: the line fits the page (0.9.9)');
{
  const { layoutNoteText, splitInTwo } = await import('../src/engine/noteLayout');
  // A typewriter face: every letter 0.6 of the size wide.
  const mono = (t: string, size: number) => t.length * size * 0.6;
  const page = 326;
  const short = layoutNoteText('RUN', page, mono);
  check('a short line: one line, full size', short.lines.length === 1 && short.size === 54);
  const it = layoutNoteText('It can hear you...', page, mono);
  check('"It can hear you..." (ran off both edges): two lines, nearly full size, inside the page', it.lines.length === 2 && it.size >= 44 && it.lines.every((l) => mono(l, it.size) <= page), `${it.lines.join(' / ')} at ${it.size}px`);
  const texts = ['It can hear you...', 'Do not trust the voices you hear in the dark', 'Antidisestablishmentarianism', 'Hide', 'The exit is on the second floor'];
  check('any line: every part inside the page (smaller if it must be)', texts.every((t) => { const f = layoutNoteText(t, page, mono); return f.lines.every((l) => mono(l, f.size) <= page) || f.size === 24; }));
  check('broken at the space nearest the middle; one word stays whole', JSON.stringify(splitInTwo('It can hear you...')) === JSON.stringify(['It can hear', 'you...']) && splitInTwo('Hide') === null);
}
