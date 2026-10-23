// Update 0.6 — two lives. The first time The Patient catches you it grabs you, lifts you, throws you
// behind it, and vanishes while you get up injured. The second time it kills you (the old jumpscare).
// Pure timeline + numbers (tested); Game plays it, engine/caughtCamera.ts films it.
import type { Rng } from '../world/rng';

export const LIVES = 2;

/** Seconds from the moment you're caught. Throw = when its throw clip starts. */
export const CAUGHT = {
  /** Grab clip: arms up and lifting you by ~0.8 s; held until the throw. */
  grab: 2.0,
  /** You leave its hands 1.5 s into its throw (we don't wait for the whole throw clip). */
  launchAfterThrow: 1.5,
  /** Floor impact 2.5 s after the throw starts → 1.0 s in the air. */
  impactAfterThrow: 2.5,
  /** It vanishes this long after you hit the floor (camera still tumbling, red flash). */
  teleportAfterImpact: 0.4,
  /** Lying there, then the get-up clip. */
  lie: 1.0,
  /** Get-up clip until standing (the clip itself runs on to 7.6 s standing still). */
  getUp: 5.0,
  /** Camera eases from your body's eyes back to normal first person. */
  cameraReturn: 0.45,
};

/** Clip times in the player's `thrown` clip: the flip starts at 2.4 s and lands at 3.4 s. */
export const THROWN_CLIP = { flipStart: 2.4, land: 3.4 };

export const caughtTimes = {
  throwAt: CAUGHT.grab,
  launchAt: CAUGHT.grab + CAUGHT.launchAfterThrow,
  impactAt: CAUGHT.grab + CAUGHT.impactAfterThrow,
  teleportAt: CAUGHT.grab + CAUGHT.impactAfterThrow + CAUGHT.teleportAfterImpact,
  getUpAt: CAUGHT.grab + CAUGHT.impactAfterThrow + CAUGHT.lie,
  endAt: CAUGHT.grab + CAUGHT.impactAfterThrow + CAUGHT.lie + CAUGHT.getUp,
};

export type CaughtStage = 'grab' | 'throw' | 'flight' | 'down' | 'getUp' | 'done';

export function caughtStage(t: number): CaughtStage {
  if (t < caughtTimes.throwAt) return 'grab';
  if (t < caughtTimes.launchAt) return 'throw';
  if (t < caughtTimes.impactAt) return 'flight';
  if (t < caughtTimes.getUpAt) return 'down';
  if (t < caughtTimes.endAt) return 'getUp';
  return 'done';
}

/** One-shot cues; each fires on the frame t crosses its time. */
export type CaughtCue = 'caught' | 'throw' | 'launch' | 'impact' | 'teleport' | 'getUp' | 'done';

const CUES: [CaughtCue, number][] = [
  ['caught', 0],
  ['throw', caughtTimes.throwAt],
  ['launch', caughtTimes.launchAt],
  ['impact', caughtTimes.impactAt],
  ['teleport', caughtTimes.teleportAt],
  ['getUp', caughtTimes.getUpAt],
  ['done', caughtTimes.endAt],
];

/** Cues whose time lies in (prev, now]. Start the sequence with prev = -1 so 'caught' fires at once. */
export function cuesBetween(prev: number, now: number): CaughtCue[] {
  return CUES.filter(([, at]) => prev < at && now >= at).map(([c]) => c);
}

/** 0..1 horizontal progress of the throw: fast off its hands, easing into the landing. */
export function flightProgress(t: number): number {
  const k = (t - caughtTimes.launchAt) / (caughtTimes.impactAt - caughtTimes.launchAt);
  const c = Math.max(0, Math.min(1, k));
  return 1 - (1 - c) * (1 - c);
}

/** The thrown clip's time for sequence time t (flip lines up with launch → impact). */
export function thrownClipTime(t: number): number {
  return THROWN_CLIP.flipStart + (t - caughtTimes.launchAt) * ((THROWN_CLIP.land - THROWN_CLIP.flipStart) / (caughtTimes.impactAt - caughtTimes.launchAt));
}

/**
 * Dazed blink around the switch from lying on your back (thrown clip) to face down (get-up clip):
 * blending those two poses dragged the head through the floor, so the eyes close, the pose cuts,
 * the eyes open. 0 = open, 1 = shut.
 */
export function dazedBlink(t: number): number {
  const d = t - caughtTimes.getUpAt;
  if (d < -0.2 || d > 0.45) return 0;
  if (d < 0) return (d + 0.2) / 0.2;
  if (d < 0.1) return 1;
  return 1 - (d - 0.1) / 0.35;
}

/** Injured: a grunt every 5–7 s. */
export function nextGruntDelay(rng: Rng): number {
  return 5 + rng() * 2;
}

/** Red at the screen edges: a steady tint when injured, a hard flash on impact. */
export function injuredTint(injured: boolean, sinceImpact: number): number {
  const flash = sinceImpact >= 0 && sinceImpact < 0.6 ? 1 - sinceImpact / 0.6 : 0;
  return Math.max(injured ? 0.55 : 0, flash);
}
