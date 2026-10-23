// Update 0.4.4 — how bright the ward is. One place for every light level, so tests pin them.
// The ward is readable without the flashlight now, and the flashlight is 1.3× stronger.
// The trade-off is in ENEMY (world/enemyAI.ts): it sees you from further away too.

export const FLASHLIGHT_BOOST = 1.3;

export const LIGHT = {
  /** Flashlight spot intensity at full battery (was 34). */
  flashlight: 34 * FLASHLIGHT_BOOST,
  /** Sky/ground fill colours. Lighter than the old near-black 0x2a3040 / 0x0a0806 so it actually shows. */
  skyColor: 0x7d8aa6,
  groundColor: 0x241e1a,
  /** Fill strength before the generator / after it (roughly double the 0.4.3 brightness with the flashlight off). */
  ambient: { dark: 0.6, powered: 0.9 },
  /** Fog density: lower = you see further down a hall (was 0.085 / 0.06). */
  fog: { dark: 0.065, powered: 0.05 },
  /** Soft glow around your eyes with the flashlight off, so nearby walls never go pitch black (was 0.35). */
  eyeGlow: 1.1,
  /** Extra eye glow added at full flashlight strength. */
  eyeGlowFlashlight: 0.9,
} as const;

export type Atmosphere = { fog: number; ambient: number; exposure: number };

/** Fog, fill light and exposure for the current state of the ward. */
export function atmosphereFor(powered: boolean, debug: boolean): Atmosphere {
  if (debug) return { fog: 0.004, ambient: 1.6, exposure: 1.3 };
  return powered
    ? { fog: LIGHT.fog.powered, ambient: LIGHT.ambient.powered, exposure: 1.1 }
    : { fog: LIGHT.fog.dark, ambient: LIGHT.ambient.dark, exposure: 1.1 };
}
