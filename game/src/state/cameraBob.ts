// Update 0.3.1 — camera bob. Gentle for walking, heavy and frantic for sprinting (Outlast-style):
// a dip on every footstep, side-to-side sway every two steps, a roll that follows the sway,
// a nod on impact, and a wider FOV while sprinting. Pure numbers (tested).
import type { Gait } from './playerRules';

export interface BobAmp {
  /** Vertical dip per step (m). */
  y: number;
  /** Side-to-side sway (m). */
  side: number;
  /** Roll with the sway (rad). */
  roll: number;
  /** Nod down on each impact (rad). */
  nod: number;
  /** Extra field of view (degrees). */
  fov: number;
}

export const BOB: Record<Gait, BobAmp> = {
  idle: { y: 0, side: 0, roll: 0, nod: 0, fov: 0 },
  crouch: { y: 0.02, side: 0.02, roll: 0.006, nod: 0.004, fov: 0 },
  walk: { y: 0.045, side: 0.025, roll: 0.01, nod: 0.008, fov: 0 },
  sprint: { y: 0.11, side: 0.06, roll: 0.035, nod: 0.03, fov: 7 },
};

/** Idle breathing so the view is never perfectly still. */
export const BREATH = { y: 0.006, rate: 1.7 };

export interface BobOffset {
  y: number;
  side: number;
  roll: number;
  nod: number;
}

/**
 * `phase` advances π per footstep (see PlayerController.step). Impact = phase at a multiple of π:
 * that's where the dip and the nod peak.
 */
export function bobOffset(amp: BobAmp, phase: number, t: number): BobOffset {
  const s = Math.sin(phase);
  const impact = 1 - Math.abs(s); // 1 on footfall, 0 mid-stride
  return {
    y: -amp.y * impact * impact + BREATH.y * Math.sin(t * BREATH.rate),
    side: amp.side * s,
    roll: amp.roll * s,
    nod: amp.nod * impact * impact,
  };
}

/** Blends amplitudes so changing gait never snaps the camera. */
export function blendAmp(cur: BobAmp, target: BobAmp, k: number): BobAmp {
  const mix = (a: number, b: number) => a + (b - a) * k;
  return { y: mix(cur.y, target.y), side: mix(cur.side, target.side), roll: mix(cur.roll, target.roll), nod: mix(cur.nod, target.nod), fov: mix(cur.fov, target.fov) };
}
