// Update 0.4.4 — brighter ward, 1.3× flashlight, and an enemy that sees you further because of it.
import { check, section } from './harness';
import { FLASHLIGHT_BOOST, LIGHT, atmosphereFor } from '../src/state/lightLevels';
import { ENEMY, createEnemy, visibility } from '../src/world/enemyAI';
import { LEVEL_01 } from '../src/world/content/level01';
import { parseLevel } from '../src/world/level';

section('Light levels (0.4.4)');
{
  check('flashlight is 1.3x stronger', FLASHLIGHT_BOOST === 1.3 && Math.abs(LIGHT.flashlight - 34 * 1.3) < 1e-9);
  const dark = atmosphereFor(false, false);
  const lin = (hex: number) => ((hex >> 16) & 255) / 255; // red channel is enough to compare brightness
  check('ward readable without the flashlight (fill up, fog down)', lin(LIGHT.skyColor) ** 2.2 * dark.ambient > lin(0x2a3040) ** 2.2 * 0.12 * 3 && dark.fog < 0.085);
  check('eye glow brighter than before with the flashlight off', LIGHT.eyeGlow > 0.35);
  const powered = atmosphereFor(true, false);
  check('generator on is still brighter than off', powered.ambient > dark.ambient && powered.fog < dark.fog);
  check('F2 debug stays brightest', atmosphereFor(false, true).ambient > powered.ambient && atmosphereFor(false, true).fog < powered.fog);
}

section('Enemy sight (0.4.4)');
{
  check('sees a lit player 1.3x further', Math.abs(ENEMY.viewDistLight - 16 * 1.3) < 1e-9);
  check('sees an unlit player 1.3x further', Math.abs(ENEMY.viewDistDark - 8 * 1.3) < 1e-9);
  check('flashlight still makes you easier to see than darkness', ENEMY.viewDistLight > ENEMY.viewDistDark);
  // Straight down an open line at 9 m, flashlight off: hidden before 0.4.4 (8 m), seen now.
  const level = parseLevel(LEVEL_01);
  const e = createEnemy(level);
  let found = false;
  for (const dir of [{ x: 1, z: 0 }, { x: -1, z: 0 }, { x: 0, z: 1 }, { x: 0, z: -1 }]) {
    e.dir = dir;
    const p = { pos: { x: e.pos.x + dir.x * 9, z: e.pos.z + dir.z * 9 }, flashlightOn: false, crouching: false };
    if (visibility(level, e, p) > 0) found = true;
  }
  check('spots you at 9 m in the dark where it used to miss you', found, 'needs a 9 m open line from its spawn');
}
