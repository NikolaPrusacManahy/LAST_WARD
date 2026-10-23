// Update 0.4.3 — main menu tease: the light over The Patient stays on for a while, stutters out,
// stays dark, then flickers back on. Its pose only ever changes in the dark, so each time the
// light returns it may be closer, turned, screaming… or gone. Pure + seeded (tested).
import { createRng, Rng } from '../world/rng';

export type MenuPose = 'idle' | 'near' | 'search' | 'gone' | 'scream';
export type LightPhase = 'lit' | 'out' | 'dark' | 'in';

export const MENU_TIMING = {
  lit: [5, 10] as const, // seconds the light holds
  out: 0.7, // stutter going off
  dark: [1.2, 3.2] as const,
  in: 0.6, // stutter coming back
};

export interface MenuScare {
  phase: LightPhase;
  timeLeft: number;
  pose: MenuPose;
  /** True on the frame the pose was swapped (always while dark). */
  poseChanged: boolean;
  /** 0..1 lamp brightness this frame. */
  light: number;
  rng: Rng;
  blackouts: number;
}

const between = (rng: Rng, [a, b]: readonly [number, number]) => a + rng() * (b - a);

export function createMenuScare(seed = 13): MenuScare {
  const rng = createRng(seed);
  return { phase: 'lit', timeLeft: between(rng, MENU_TIMING.lit), pose: 'idle', poseChanged: false, light: 1, rng, blackouts: 0 };
}

/** Next pose: never the same twice, never 'gone' or 'scream' twice in a row, scream is rare. */
export function nextPose(prev: MenuPose, rng: Rng): MenuPose {
  const r = rng();
  let pick: MenuPose = r < 0.32 ? 'idle' : r < 0.58 ? 'near' : r < 0.8 ? 'search' : r < 0.92 ? 'gone' : 'scream';
  if (pick === prev) pick = prev === 'idle' ? 'near' : 'idle';
  return pick;
}

/** Stutter pattern: hard on/off flashes, biased toward `bias` (1 = mostly on). */
function stutter(rng: Rng, bias: number): number {
  return rng() < bias ? 0.6 + rng() * 0.4 : 0;
}

export function stepMenuScare(s: MenuScare, dt: number): MenuScare {
  s.poseChanged = false;
  s.timeLeft -= dt;
  if (s.timeLeft <= 0) {
    switch (s.phase) {
      case 'lit':
        s.phase = 'out';
        s.timeLeft = MENU_TIMING.out;
        break;
      case 'out':
        s.phase = 'dark';
        s.timeLeft = between(s.rng, MENU_TIMING.dark);
        s.blackouts++;
        s.pose = nextPose(s.pose, s.rng);
        s.poseChanged = true;
        break;
      case 'dark':
        s.phase = 'in';
        s.timeLeft = MENU_TIMING.in;
        break;
      case 'in':
        s.phase = 'lit';
        s.timeLeft = between(s.rng, MENU_TIMING.lit);
        break;
    }
  }
  const k = Math.max(0, s.timeLeft);
  switch (s.phase) {
    case 'lit':
      // A healthy tube still buzzes: tiny dips now and then.
      s.light = s.rng() < 0.015 ? 0.75 : 1;
      break;
    case 'out':
      s.light = stutter(s.rng, k / MENU_TIMING.out); // more off as it dies
      break;
    case 'dark':
      s.light = 0;
      break;
    case 'in':
      s.light = stutter(s.rng, 1 - k / MENU_TIMING.in); // more on as it catches
      break;
  }
  return s;
}
