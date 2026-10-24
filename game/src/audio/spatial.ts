// Update 0.4.1 — how The Patient's sounds are shaped by distance and walls. Pure (tested).
// Far sounds lose their highs; a wall between you muffles them hard. Together with 3D panning
// this is what lets you tell "behind the wall to my left" from "down the corridor ahead".

/** Steps were too loud: everything enemy-made is scaled by this (×0.5 = half as loud). */
export const ENEMY_STEP_GAIN = 0.5;

/** Update 0.4.2 — your own footsteps and the flashlight click were too loud too (×0.5). */
/** Update 0.9.1 — steps down another 40% (0.5 → 0.3). */
export const PLAYER_STEP_GAIN = 0.3;
export const FLASHLIGHT_CLICK_GAIN = 0.5;
/** Update 0.9.1 — its scream when it spots you: 40% quieter. */
export const SPOT_SCREAM_GAIN = 0.6;
/** Update 0.9.1 — the electrical panel sounds (fuse, repair loop, skill checks, bang, switch): 60% quieter. */
export const PANEL_SFX_GAIN = 0.4;
/** Update 0.9.3 — Easy: the night vision goggles' deploy sound, 80% quieter. */
export const NIGHT_VISION_SFX_GAIN = 0.2;
/** Update 0.9.6.1 — your breathing while you sprint, at half the recording's volume. */
export const RUN_BREATH_GAIN = 0.5;

export interface EnemyMix {
  /** Low-pass cutoff in Hz. */
  cutoff: number;
  /** Extra gain on top of the panner's straight-line falloff. */
  gain: number;
  /** A wall is between you and it. */
  occluded: boolean;
  /** Update 0.9.4 — the sound comes round through the halls (play it from the corner, `SoundPath.via`). */
  around?: boolean;
}

export function enemyStepGain(heavy: boolean, mix: EnemyMix): number {
  return (heavy ? 1 : 0.7) * ENEMY_STEP_GAIN * mix.gain;
}

const OPEN_MAX_HZ = 16000;
const OPEN_FAR_HZ = 3000; // at FAR_M and beyond
const FAR_M = 25;

/** Highs fade with distance (log-style sweep so they go gradually, not all at once). */
const openCutoff = (d: number) => OPEN_MAX_HZ * Math.pow(OPEN_FAR_HZ / OPEN_MAX_HZ, Math.min(1, Math.max(0, d / FAR_M)));

/**
 * Update 0.9.4 — real loudness for The Patient behind walls. Before, a wall only took off 45% and
 * footsteps through it got a 1.5× boost back, so two walls away it sounded nearly as loud as in the
 * open. Now sound takes the louder of two ways:
 *  - straight through: each wall keeps only `wallLoss` of it (about −10 dB) and leaves a dull thud;
 *  - round through the halls: the longer way costs the extra distance, plus `cornerLoss` for every
 *    right angle it bends round (at least one), and stays clearer (you hear it coming down the corridor).
 * `ref` / `rolloff` are the footstep panner's (audio.ts): the panner still does the straight-line
 * falloff, `gain` is what to add on top.
 */
export const HEARING = { ref: 2.5, rolloff: 1.3, wallLoss: 0.3, cornerLoss: 0.55, oneWallHz: 750, wallsHz: 420, aroundMaxHz: 2600 };

/** Inverse-distance falloff, as the Web Audio panner does it. */
export function falloff(d: number): number {
  const { ref, rolloff } = HEARING;
  return d <= ref ? 1 : ref / (ref + rolloff * (d - ref));
}

export function enemyHearing(p: { straight: number; walls: number; around: number; turns?: number }): EnemyMix {
  if (p.walls === 0) return { cutoff: openCutoff(p.straight), gain: 1, occluded: false };
  const open = falloff(p.straight);
  const through = open * Math.pow(HEARING.wallLoss, p.walls);
  const around = Number.isFinite(p.around) ? falloff(p.around) * Math.pow(HEARING.cornerLoss, Math.max(1, p.turns ?? 1)) : 0;
  if (around >= through) return { cutoff: Math.min(openCutoff(p.around), HEARING.aroundMaxHz), gain: around / open, occluded: true, around: true };
  return { cutoff: p.walls === 1 ? HEARING.oneWallHz : HEARING.wallsHz, gain: through / open, occluded: true };
}

/** Pre-0.9.4 helper kept for the open-air case: distance only. */
export function enemyMix(distance: number, occluded: boolean): EnemyMix {
  return enemyHearing({ straight: distance, walls: occluded ? 1 : 0, around: Infinity });
}
