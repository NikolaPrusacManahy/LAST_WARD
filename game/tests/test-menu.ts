// Update 0.4.3b — main menu loop: stare → gone → face → gone → stare.
import { check, section } from './harness';
import { MenuPose, createMenuScare, stepMenuScare } from '../src/state/menuScare';

section('Main menu loop');
{
  const s = createMenuScare(5);
  const order: MenuPose[] = [s.pose];
  let swapWhileLit = false;
  let prevLight = s.light;
  let darkLight = 0;
  let faceLitFrames = 0;
  let faceFrames = 0;
  for (let i = 0; i < 60 * 180; i++) {
    stepMenuScare(s, 1 / 60);
    if (s.poseChanged) {
      order.push(s.pose);
      // Each swap happens at a cut to or from black, never on a steadily lit frame.
      if (prevLight > 0 && s.light > 0) swapWhileLit = true;
    }
    if (s.phase === 'dark' || s.phase === 'dark2') darkLight = Math.max(darkLight, s.light);
    if (s.pose === 'face') {
      faceFrames++;
      if (s.light > 0) faceLitFrames++;
    }
    prevLight = s.light;
  }
  const seq = order.slice(0, 5).join(' → ');
  check('loop order is stare → gone → face → gone → stare', seq === 'stare → gone → face → gone → stare', seq);
  check('what you see only changes in the dark', !swapWhileLit);
  check('gone means fully dark', darkLight === 0);
  check('the face strobes (mostly lit, never steady)', faceLitFrames / faceFrames > 0.45 && faceLitFrames < faceFrames);
  check('scares keep coming (≥ 10 in 3 min)', s.scares >= 10, `${s.scares}`);
}
