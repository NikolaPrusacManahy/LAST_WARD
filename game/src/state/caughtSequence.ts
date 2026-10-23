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
  /** Update 0.6.1 — it vanishes while your eyes are shut (you black out against the wall). */
  teleportAfterImpact: 1.5,
  /** Lying there: eyelids close over 1.2 s, stay shut, then the get-up clip opens them. */
  lie: 2.0,
  /** Get-up clip until standing (the clip itself runs on to 7.6 s standing still). */
  getUp: 5.0,
  /** Camera eases from your body's eyes back to normal first person. */
  cameraReturn: 0.45,
};

/** Update 0.6.1 — its throw clip plays 1.5× slower so the throwing motion carries on while you fly. */
export const ENEMY_THROW_SPEED = 1 / 1.5;

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

/** Update 0.6.1 — blacking out against the wall: how long the lids take to close / to open again. */
export const EYELIDS = { close: 1.2, open: 0.9 };

/**
 * Update 0.6.1 — eyelids (0 = open, 1 = shut). After the wall they drift shut, fluttering like you're
 * fighting it; they stay shut while it vanishes and while your pose switches from on-your-back to
 * face-down (a blend of those sank the head into the floor); the get-up opens them, heavy at first.
 */
export function eyelids(t: number): number {
  const d = t - caughtTimes.impactAt;
  const sinceUp = t - caughtTimes.getUpAt;
  if (d < 0) return 0;
  if (sinceUp < 0) {
    const k = Math.min(1, d / EYELIDS.close);
    const flutter = 0.3 * Math.sin(k * Math.PI * 3) * (1 - k); // half-close, drag open, give in
    return Math.max(0, Math.min(1, k * k * (3 - 2 * k) + flutter));
  }
  const k = Math.min(1, sinceUp / EYELIDS.open);
  if (k >= 1) return 0;
  const bump = 0.22 * Math.sin(k * Math.PI * 2) * (1 - k); // first crack of light, droop, then open
  return Math.max(0, Math.min(1, 1 - k * k * (3 - 2 * k) + bump));
}

/** Injured: a grunt every 15–25 s (Update 0.6.1, was 5–7), plus one as you start getting up. */
export function nextGruntDelay(rng: Rng): number {
  return 15 + rng() * 10;
}

/** Red at the screen edges: a steady tint when injured, a hard flash on impact. */
export function injuredTint(injured: boolean, sinceImpact: number): number {
  const flash = sinceImpact >= 0 && sinceImpact < 0.6 ? 1 - sinceImpact / 0.6 : 0;
  return Math.max(injured ? 0.55 : 0, flash);
}
