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

/**
 * Update 0.9.3 — the flashlight reaches 1.5× further, so you can pick The Patient out down a long hall.
 * Three parts: the beam's cut-off distance (32 → 48 m); a gentler falloff, tuned so it's exactly as
 * bright as before at arm's length (2 m) while a wall 1.5× as far gets what one at 15 m used to; and the
 * fog (the ward's darkness) thins by the same 1.5× while the beam is on, or it would still swallow
 * anything past ~20 m however bright it's lit.
 */
export const FLASHLIGHT_RANGE = 1.5;
const OLD_DECAY = 1.5;
const NEAR = 2;
const FAR = 15;
export const FLASHLIGHT_BEAM = (() => {
  const decay = (OLD_DECAY * Math.log(FAR / NEAR)) / Math.log((FAR * FLASHLIGHT_RANGE) / NEAR);
  return { distance: 32 * FLASHLIGHT_RANGE, decay, intensityMul: NEAR ** (decay - OLD_DECAY) };
})();

/** Fog density with the beam at `beam` (0 off … 1 fully on). */
export function flashlightFog(base: number, beam: number): number {
  return base / (1 + (FLASHLIGHT_RANGE - 1) * Math.max(0, Math.min(1, beam)));
}

export type Atmosphere = { fog: number; ambient: number; exposure: number };

/** Fog, fill light and exposure for the current state of the ward. */
/** Update 0.9.3 — Easy's night vision goggles (right click instead of the flashlight): thin fog, strong
 *  fill, and the screen shader turns it phosphor green. */
export const NIGHT_VISION = { fog: 0.014, ambient: { dark: 2.1, powered: 2.4 }, exposure: 1.45 };

export function atmosphereFor(powered: boolean, debug: boolean, nightVision = false): Atmosphere {
  if (debug) return { fog: 0.004, ambient: 1.6, exposure: 1.3 };
  if (nightVision) return { fog: NIGHT_VISION.fog, ambient: powered ? NIGHT_VISION.ambient.powered : NIGHT_VISION.ambient.dark, exposure: NIGHT_VISION.exposure };
  return powered
    ? { fog: LIGHT.fog.powered, ambient: LIGHT.ambient.powered, exposure: 1.1 }
    : { fog: LIGHT.fog.dark, ambient: LIGHT.ambient.dark, exposure: 1.1 };
}

/**
 * Update 0.9.3 — the atmosphere this frame: `nv` is the goggles eased on (0..1, Easy), `beam` the
 * flashlight eased on (0..1; it thins the fog, see flashlightFog). They blend so switching never snaps.
 */
export function blendAtmosphere(powered: boolean, debug: boolean, nv: number, beam: number): Atmosphere {
  const a = atmosphereFor(powered, debug, false);
  if (debug) return a;
  const b = atmosphereFor(powered, false, true);
  const k = Math.max(0, Math.min(1, nv));
  const mix = (x: number, y: number) => x + (y - x) * k;
  return { fog: flashlightFog(mix(a.fog, b.fog), beam), ambient: mix(a.ambient, b.ambient), exposure: mix(a.exposure, b.exposure) };
}
