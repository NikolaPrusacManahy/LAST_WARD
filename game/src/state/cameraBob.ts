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

/**
 * Update 0.9.1 — injured (after the first catch): a much heavier bob and a limp. Everything is scaled
 * up and every other step (the bad leg) dips deeper and rolls further.
 */
export const INJURED = { mul: { y: 1.9, side: 1.8, roll: 2.4, nod: 2.2, fov: 1 } as BobAmp, limp: 0.8, idleSway: 0.012 };

export function injuredAmp(a: BobAmp): BobAmp {
  const m = INJURED.mul;
  return { y: a.y * m.y, side: a.side * m.side, roll: a.roll * m.roll, nod: a.nod * m.nod, fov: a.fov * m.fov };
}

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
export function bobOffset(amp: BobAmp, phase: number, t: number, limp = 0): BobOffset {
  const s = Math.sin(phase);
  const impact = 1 - Math.abs(s); // 1 on footfall, 0 mid-stride
  // Update 0.9.1 — limp: the step landing at an odd multiple of π is the bad leg. The switch between
  // legs falls mid-stride, where the dip is 0, so nothing jumps.
  const bad = Math.round(phase / Math.PI) % 2 !== 0 ? 1 + limp : 1;
  return {
    y: -amp.y * impact * impact * bad + BREATH.y * (1 + limp) * Math.sin(t * BREATH.rate),
    side: amp.side * s * (s < 0 ? 1 + limp * 0.5 : 1),
    roll: amp.roll * s * (s < 0 ? 1 + limp * 0.5 : 1) + limp * INJURED.idleSway * Math.sin(t * 0.9),
    nod: amp.nod * impact * impact * bad,
  };
}

/** Blends amplitudes so changing gait never snaps the camera. */
export function blendAmp(cur: BobAmp, target: BobAmp, k: number): BobAmp {
  const mix = (a: number, b: number) => a + (b - a) * k;
  return { y: mix(cur.y, target.y), side: mix(cur.side, target.side), roll: mix(cur.roll, target.roll), nod: mix(cur.nod, target.nod), fov: mix(cur.fov, target.fov) };
}
