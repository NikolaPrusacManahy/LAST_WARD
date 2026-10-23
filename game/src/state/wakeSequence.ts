// Update 0.6.3 — the start of a run: you come to on the floor. The intro text fades on black, your
// eyelids open onto the floor, you lie there a second, then get up (the get-up clip, a short grunt)
// and the run begins. Pure timeline (tested); engine/wakeScene.ts films it from your body's eyes.
import { openingLids } from './caughtSequence';

export const WAKE = {
  /** The intro text fades out on the black screen. */
  textFade: 0.9,
  /** Then the lids open, heavy (same curve as after the throw, a little slower). */
  lidsOpen: 1.4,
  /** Lying there, eyes open, before getting up. */
  wait: 1.0,
  /** The get-up clip until standing. */
  getUp: 5.0,
  /** The grunt as you push yourself up is cut to this long. */
  gruntSeconds: 1.0,
};

export const wakeTimes = {
  lidsAt: WAKE.textFade,
  openAt: WAKE.textFade + WAKE.lidsOpen,
  getUpAt: WAKE.textFade + WAKE.lidsOpen + WAKE.wait,
  endAt: WAKE.textFade + WAKE.lidsOpen + WAKE.wait + WAKE.getUp,
};

export type WakeCue = 'getUp' | 'done';

export function wakeCues(prev: number, now: number): WakeCue[] {
  const out: WakeCue[] = [];
  if (prev < wakeTimes.getUpAt && now >= wakeTimes.getUpAt) out.push('getUp');
  if (prev < wakeTimes.endAt && now >= wakeTimes.endAt) out.push('done');
  return out;
}

/** 1 = shut. Shut while the text fades, then they open. */
export function wakeEyelids(t: number): number {
  return openingLids((t - wakeTimes.lidsAt) / WAKE.lidsOpen);
}

/** Opacity of the intro text card (fades on black before the lids open). */
export function wakeTextOpacity(t: number): number {
  return Math.max(0, 1 - t / WAKE.textFade);
}

/** Flashlight strength: the torch is in your hand on the floor, so it's dim point-blank on the tiles
 *  (full strength there blows the frame out white) and comes up to full as you stand. */
export function wakeLight(t: number): number {
  const k = Math.min(1, wakeClipTime(t) / (WAKE.getUp * 0.7));
  return 0.12 + 0.88 * k * k * (3 - 2 * k);
}

/** The get-up clip time: frozen face-down until it's time to get up. */
export function wakeClipTime(t: number): number {
  return Math.max(0, t - wakeTimes.getUpAt);
}
