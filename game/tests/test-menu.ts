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

section('Menu panels: up to twice the size, never bigger than the window (0.9.9)');
{
  const { PANEL_BOX, UI_MAX, uiScale } = await import('../src/ui/uiScale');
  check('twice the size on a full 1080p screen, and on anything bigger', uiScale(1920, 1080) === 2 && uiScale(2560, 1440) === 2 && UI_MAX === 2);
  check('a smaller window: as big as fits (a 1080p browser window: 1.75; 1280 × 720: 1.3)', uiScale(1920, 950) === 1.75 && uiScale(1280, 720) === 1.3);
  const sizes: [number, number][] = [[1920, 1080], [1920, 950], [1600, 900], [1536, 864], [1366, 768], [1280, 720], [1024, 768], [2560, 1080], [3840, 2160]];
  check('a panel that fits 900 × 540 always fits the window at that size', sizes.every(([w, h]) => PANEL_BOX.w * uiScale(w, h) <= w && PANEL_BOX.h * uiScale(w, h) <= h));
  check('in steps of 0.05, never below half size', sizes.every(([w, h]) => Math.abs(uiScale(w, h) * 20 - Math.round(uiScale(w, h) * 20)) < 1e-9) && uiScale(300, 200) === 0.5);
}
