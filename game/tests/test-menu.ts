// Update 0.4.3 — main menu light / pose schedule.
import { check, section } from './harness';
import { MENU_TIMING, MenuPose, createMenuScare, nextPose, stepMenuScare } from '../src/state/menuScare';
import { createRng } from '../src/world/rng';

section('Main menu tease');
{
  const s = createMenuScare(5);
  let litPoseSwap = false;
  let darkLight = 0;
  const poses = new Set<MenuPose>();
  let prev = s.pose;
  let repeats = 0;
  for (let i = 0; i < 60 * 180; i++) {
    stepMenuScare(s, 1 / 60);
    if (s.poseChanged && s.phase !== 'dark') litPoseSwap = true;
    if (s.phase === 'dark') darkLight = Math.max(darkLight, s.light);
    if (s.poseChanged) {
      if (s.pose === prev) repeats++;
      prev = s.pose;
      poses.add(s.pose);
    }
  }
  check('it only moves while the light is out', !litPoseSwap);
  check('fully dark while dark', darkLight === 0);
  check('blacks out regularly (≥ 10 times in 3 min)', s.blackouts >= 10, `${s.blackouts}`);
  check('never the same pose twice in a row', repeats === 0);
  check('shows several different poses', poses.size >= 4, [...poses].join(','));
}
{
  const rng = createRng(9);
  let ok = true;
  for (let i = 0; i < 500; i++) for (const p of ['idle', 'near', 'search', 'gone', 'scream'] as MenuPose[]) if (nextPose(p, rng) === p) ok = false;
  check('nextPose never repeats', ok);
  check('light holds for 5–10 s', MENU_TIMING.lit[0] === 5 && MENU_TIMING.lit[1] === 10);
}
