// Update 0.9.3 — difficulty: Easy night vision goggles, Normal as it was, Hard short battery + one life.
import { check, section } from './harness';
import { DIFFICULTY, DIFFICULTIES, hydrateDifficulty } from '../src/state/difficulty';
import { LIVES } from '../src/state/caughtSequence';
import { PLAYER, createPlayerStatus, tickStatus, toggleFlashlight } from '../src/state/playerRules';
import { NIGHT_VISION, atmosphereFor, blendAtmosphere } from '../src/state/lightLevels';
import { defaultSave, hydrateSave } from '../src/state/settings';

/** Seconds of light from a full battery. */
const lightFor = (mul: number) => {
  const s = createPlayerStatus(mul);
  toggleFlashlight(s);
  let t = 0;
  while (s.flashlightOn && t < 1000) {
    tickStatus(s, 'walk', 0.05);
    t += 0.05;
  }
  return t;
};

section('Difficulty (0.9.3)');
{
  check('three of them, Normal by default', DIFFICULTIES.join() === 'easy,normal,hard' && defaultSave().settings.difficulty === 'normal');
  check('the last pick is saved; junk falls back to Normal', hydrateSave({ settings: { difficulty: 'hard' } }).settings.difficulty === 'hard' && hydrateDifficulty('nightmare') === 'normal');
  const n = DIFFICULTY.normal;
  check('Normal: unchanged (two lives, normal battery, no goggles)', n.lives === LIVES && n.batteryDrainMul === 1 && !n.nightVision);
  check('Easy: night vision goggles, otherwise like Normal', DIFFICULTY.easy.nightVision && DIFFICULTY.easy.lives === LIVES && DIFFICULTY.easy.batteryDrainMul === 1);
  check('Hard: one life', DIFFICULTY.hard.lives === 1 && !DIFFICULTY.hard.nightVision);
  const normal = lightFor(1);
  const hard = lightFor(DIFFICULTY.hard.batteryDrainMul);
  check('Hard: the battery lasts 40% less', Math.abs(hard / normal - 0.6) < 0.01, `${normal.toFixed(1)} s → ${hard.toFixed(1)} s`);
  check('a full battery is still 100% on Hard (it just drains faster)', createPlayerStatus(DIFFICULTY.hard.batteryDrainMul).battery === PLAYER.batteryMax);
}

section('Night vision goggles (0.9.3)');
{
  const dark = atmosphereFor(false, false);
  const nv = blendAtmosphere(false, false, 1, 0);
  // FogExp2: what's left of a thing d metres away.
  const seen = (density: number, d: number) => Math.exp(-((density * d) ** 2));
  check('goggles on: The Patient 30 m away is still clearly there (fog keeps ≥ 80%)', seen(nv.fog, 30) >= 0.8 && seen(dark.fog, 30) < 0.05);
  check('goggles on: the ward is lit up', nv.ambient === NIGHT_VISION.ambient.dark && nv.ambient > dark.ambient * 3);
  check('goggles off: the normal dark', JSON.stringify(blendAtmosphere(false, false, 0, 0)) === JSON.stringify(dark));
  const half = blendAtmosphere(false, false, 0.5, 0);
  check('switching blends, no snap', half.ambient > dark.ambient && half.ambient < nv.ambient);
  check('F2 debug view ignores them', JSON.stringify(blendAtmosphere(false, true, 1, 0)) === JSON.stringify(atmosphereFor(false, true)));
}
