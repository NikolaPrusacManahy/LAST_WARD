// Update 0.3 — which clip the first-person body plays for a gait. Pure (tested).
import type { Gait } from '../state/playerRules';

export type PlayerClip = 'idle' | 'walk' | 'run' | 'crouch';

/** Ground speed each clip was authored at (stance foot), m/s. */
export const PLAYER_CLIP_SPEED: Record<PlayerClip, number> = { idle: 0, walk: 1.6, run: 3.2, crouch: 1.25 };

export function choosePlayerClip(gait: Gait, crouching: boolean): PlayerClip {
  if (crouching) return 'crouch';
  if (gait === 'sprint') return 'run';
  if (gait === 'walk') return 'walk';
  return 'idle';
}

/** Update 0.3.1 — arms shrink away while running so the pumping hands stay out of view. */
export function armScaleFor(clip: PlayerClip): number {
  return clip === 'run' ? 0 : 1;
}

/** Crouching still = crouch pose frozen; otherwise match feet to ground speed (clamped). */
export function playerClipTimeScale(clip: PlayerClip, speed: number): number {
  const ref = PLAYER_CLIP_SPEED[clip];
  if (!ref) return 1;
  if (speed < 0.2) return clip === 'crouch' ? 0 : 1;
  return Math.min(1.7, Math.max(0.6, speed / ref));
}
