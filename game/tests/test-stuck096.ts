// Update 0.9.6 — thrown by The Patient next to a table: you land in front of it, never inside it.
import { check, section } from './harness';
import { LEVEL_01 } from '../src/world/content/level01';
import { itemPos, parseLevel } from '../src/world/level';
import { throwLanding, THROW } from '../src/world/throwLanding';
import { nearestFree, overlapsWall } from '../src/world/collision';
import { placedProps, propBlockers } from '../src/world/props';
import { PLAYER } from '../src/state/playerRules';

const level = parseLevel(LEVEL_01);
const blockers = [...level.items.map((i) => itemPos(level, i.cell)), ...propBlockers(placedProps(level))];

section('Thrown into furniture (0.9.6)');
{
  // Every item table: stand 2.2 m in front of it with The Patient beyond you, so it throws you at the table.
  let inside = 0;
  for (const it of level.items) {
    const t = itemPos(level, it.cell);
    const from = { x: t.x + t.face.x * 2.2, z: t.z + t.face.z * 2.2 };
    const facing = { x: t.face.x, z: t.face.z }; // it faces away from the table: you fly back into it
    const land = throwLanding(level, from, facing, blockers);
    if (overlapsWall(level, land.at, PLAYER.radius, blockers)) inside++;
  }
  check('thrown at a table: you land in front of it, never in it', inside === 0, `${inside} inside`);
  // And the old way (no furniture) really did land in tables: the test catches the bug.
  const t0 = itemPos(level, level.items[0].cell);
  const old = throwLanding(level, { x: t0.x + t0.face.x * 2.2, z: t0.z + t0.face.z * 2.2 }, t0.face);
  check('(before the fix it ended inside the table)', overlapsWall(level, old.at, THROW.bodyRadius, blockers));
  // Anything that does leave you inside furniture: you're moved to the nearest free spot.
  const out = nearestFree(level, { x: t0.x, z: t0.z }, PLAYER.radius, blockers);
  check('stuck inside a table: moved out to the nearest open floor', !overlapsWall(level, out, PLAYER.radius, blockers) && Math.hypot(out.x - t0.x, out.z - t0.z) < 1.2);
}
