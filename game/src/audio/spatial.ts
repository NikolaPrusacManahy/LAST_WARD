// Update 0.4.1 — how The Patient's sounds are shaped by distance and walls. Pure (tested).
// Far sounds lose their highs; a wall between you muffles them hard. Together with 3D panning
// this is what lets you tell "behind the wall to my left" from "down the corridor ahead".

/** Steps were too loud: everything enemy-made is scaled by this (×0.5 = half as loud). */
export const ENEMY_STEP_GAIN = 0.5;

/** Update 0.4.2 — your own footsteps and the flashlight click were too loud too (×0.5). */
export const PLAYER_STEP_GAIN = 0.5;
export const FLASHLIGHT_CLICK_GAIN = 0.5;

export interface EnemyMix {
  /** Low-pass cutoff in Hz. */
  cutoff: number;
  /** Extra gain on top of normal distance falloff. */
  gain: number;
}

const OPEN_MAX_HZ = 16000;
const OPEN_FAR_HZ = 3000; // at FAR_M and beyond
const FAR_M = 25;
const WALL_HZ = 750;
const WALL_GAIN = 0.55;

export function enemyMix(distance: number, occluded: boolean): EnemyMix {
  const k = Math.min(1, Math.max(0, distance / FAR_M));
  // Log-style sweep so the highs fade gradually, not all at once.
  const open = OPEN_MAX_HZ * Math.pow(OPEN_FAR_HZ / OPEN_MAX_HZ, k);
  return occluded ? { cutoff: Math.min(open, WALL_HZ), gain: WALL_GAIN } : { cutoff: open, gain: 1 };
}
