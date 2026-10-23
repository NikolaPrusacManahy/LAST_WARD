// Update 0.4.3b — main menu loop, as designed:
//   lit (it stands there staring) → light stutters out → dark (it's gone)
//   → SCARE: its face right in front of the screen under a crazy strobe → dark (gone again)
//   → light stutters back on, it's standing there staring again → loop.
// What's on screen only ever changes while the light is off. Pure + seeded (tested).
import { createRng, Rng } from '../world/rng';

export type MenuPose = 'stare' | 'gone' | 'face';
export type LightPhase = 'lit' | 'out' | 'dark' | 'scare' | 'dark2' | 'in';

export const MENU_TIMING = {
  lit: [5, 9] as const, // seconds it stands there under the light
  out: 0.7, // stutter going off
  dark: [1.5, 3] as const, // empty, waiting
  scare: [1.0, 1.6] as const, // face in your face, strobing
  dark2: [0.8, 1.4] as const,
  in: 0.6, // stutter coming back
};

export const POSE_FOR: Record<LightPhase, MenuPose> = {
  lit: 'stare',
  out: 'stare',
  dark: 'gone',
  scare: 'face',
  dark2: 'gone',
  in: 'stare',
};

const NEXT: Record<LightPhase, LightPhase> = { lit: 'out', out: 'dark', dark: 'scare', scare: 'dark2', dark2: 'in', in: 'lit' };

export interface MenuScare {
  phase: LightPhase;
  timeLeft: number;
  pose: MenuPose;
  /** True on the frame the pose was swapped. */
  poseChanged: boolean;
  /** 0..1 light this frame (the tube when standing, the strobe during the scare). */
  light: number;
  rng: Rng;
  scares: number;
}

const between = (rng: Rng, [a, b]: readonly [number, number]) => a + rng() * (b - a);

function duration(phase: LightPhase, rng: Rng): number {
  const t = MENU_TIMING[phase];
  return typeof t === 'number' ? t : between(rng, t);
}

export function createMenuScare(seed = 13): MenuScare {
  const rng = createRng(seed);
  return { phase: 'lit', timeLeft: duration('lit', rng), pose: 'stare', poseChanged: false, light: 1, rng, scares: 0 };
}

/** Hard on/off flashes, biased toward `bias` (1 = mostly on). */
function stutter(rng: Rng, bias: number): number {
  return rng() < bias ? 0.6 + rng() * 0.4 : 0;
}

export function stepMenuScare(s: MenuScare, dt: number): MenuScare {
  s.poseChanged = false;
  s.timeLeft -= dt;
  if (s.timeLeft <= 0) {
    s.phase = NEXT[s.phase];
    s.timeLeft = duration(s.phase, s.rng);
    if (s.phase === 'scare') s.scares++;
    const pose = POSE_FOR[s.phase];
    if (pose !== s.pose) {
      s.pose = pose;
      s.poseChanged = true;
    }
  }
  const k = Math.max(0, s.timeLeft);
  switch (s.phase) {
    case 'lit':
      s.light = s.rng() < 0.015 ? 0.75 : 1; // a healthy tube still dips now and then
      break;
    case 'out':
      s.light = stutter(s.rng, k / MENU_TIMING.out);
      break;
    case 'dark':
    case 'dark2':
      s.light = 0;
      break;
    case 'scare':
      // Crazy strobe: mostly on so you see it, never steady.
      s.light = s.rng() < 0.62 ? 0.7 + s.rng() * 0.6 : 0;
      break;
    case 'in':
      s.light = stutter(s.rng, 1 - k / MENU_TIMING.in);
      break;
  }
  return s;
}
