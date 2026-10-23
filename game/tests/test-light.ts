// Update 0.4.4 — brighter ward, 1.3× flashlight, and an enemy that sees you further because of it.
import { check, section } from './harness';
import { FLASHLIGHT_BEAM, FLASHLIGHT_BOOST, FLASHLIGHT_RANGE, LIGHT, atmosphereFor, flashlightFog } from '../src/state/lightLevels';
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

section('Flashlight reach (0.9.3)');
{
  // Light reaching a wall d metres away (three.js: intensity / d^decay, ignoring the cut-off).
  const oldAt = (d: number) => LIGHT.flashlight / d ** 1.5;
  const newAt = (d: number) => (LIGHT.flashlight * FLASHLIGHT_BEAM.intensityMul) / d ** FLASHLIGHT_BEAM.decay;
  check('reaches 1.5× further: cut-off 32 → 48 m', FLASHLIGHT_RANGE === 1.5 && FLASHLIGHT_BEAM.distance === 48);
  check('as bright as before at arm\'s length (2 m)', Math.abs(newAt(2) / oldAt(2) - 1) < 1e-9);
  check('a wall at 22.5 m gets what one at 15 m used to', Math.abs(newAt(22.5) / oldAt(15) - 1) < 1e-9);
  const dark = atmosphereFor(false, false).fog;
  // FogExp2: what's left of a thing d metres away is exp(-(density·d)²).
  const seen = (density: number, d: number) => Math.exp(-((density * d) ** 2));
  check('with the beam on, the fog lets you see 1.5× as far', Math.abs(seen(flashlightFog(dark, 1), 22.5) - seen(dark, 15)) < 1e-9);
  check('beam off: fog as before', flashlightFog(dark, 0) === dark);
}

