// Update 0.2 — which Mixamo clip The Patient plays, and how fast. Pure (no three.js) so it's tested.
import type { EnemyMode } from '../world/enemyAI';

/** 'stare' is menu-only (Update 0.4.3b). */
/** 'grab' / 'throw' — Update 0.6, the first time it catches you. */
export type EnemyClip = 'idle' | 'walk' | 'run' | 'search' | 'scream' | 'attack' | 'stare' | 'grab' | 'throw';

/** Ground speed each clip was authored at (measured from the stance foot), m/s. */
export const CLIP_GROUND_SPEED: Record<EnemyClip, number> = {
  idle: 0,
  walk: 1.47,
  run: 2.6,
  search: 0,
  scream: 0,
  attack: 0,
  stare: 0,
  grab: 0,
  throw: 0,
};

export const MOVING_THRESHOLD = 0.25; // m/s

export function chooseEnemyClip(mode: EnemyMode, speed: number, windingUp: boolean): EnemyClip {
  if (windingUp) return 'scream';
  const moving = speed > MOVING_THRESHOLD;
  if (mode === 'chase') return moving ? 'run' : 'idle';
  if (moving) return 'walk';
  return mode === 'search' ? 'search' : 'idle';
}

/** Playback speed so feet match the ground (clamped so it never looks absurd). */
export function clipTimeScale(clip: EnemyClip, speed: number): number {
  const ref = CLIP_GROUND_SPEED[clip];
  if (clip === 'scream') return 1.6; // fits the AI windup
  if (!ref) return 1;
  return Math.min(1.9, Math.max(0.6, speed / ref));
}
