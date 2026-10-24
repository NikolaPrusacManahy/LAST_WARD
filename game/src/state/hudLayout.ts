// Update 0.4.2 — HUD meter maths. Pure (tested).

/** Breath line under the crosshair: full width when rested, shrinks from both ends to a dot. */
export const BREATH_LINE_MAX_PX = 240;
export const BREATH_LINE_MIN_PX = 4;

export function breathLineWidth(stamina01: number): number {
  const s = Math.min(1, Math.max(0, stamina01));
  return Math.round(BREATH_LINE_MIN_PX + (BREATH_LINE_MAX_PX - BREATH_LINE_MIN_PX) * s);
}

/** Hidden while full; appears as soon as you start using breath. */
export function breathLineVisible(stamina01: number): boolean {
  return stamina01 < 0.995;
}

/** Update 0.9.8 — how much breath you have left, 0..1 (rounded for the HUD). It divided by 4.5 s, but a
 *  full sprint is `max` (5.5 s): the line stayed hidden for your first second of running. */
export function staminaShare(stamina: number, max: number): number {
  return Math.min(1, Math.max(0, Math.round((stamina / max) * 100) / 100));
}
