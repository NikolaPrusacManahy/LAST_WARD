// Update 0.5.1 — boot credit screen: holds 3 s, then fades out. A click cuts the fade to 0.5 s.
// Pure timing (tested); screens/CreditIntro.tsx only draws it.

export const CREDIT_TIMING = {
  hold: 3, // seconds fully visible
  fade: 1, // normal fade out
  skipFade: 0.5, // fade after a click
};

export interface CreditIntro {
  t: number;
  /** When the fade started (or will start). */
  fadeAt: number;
  fadeLen: number;
  /** Opacity the fade starts from (a click mid-fade continues from where it is). */
  fadeFrom: number;
}

export function createCreditIntro(): CreditIntro {
  return { t: 0, fadeAt: CREDIT_TIMING.hold, fadeLen: CREDIT_TIMING.fade, fadeFrom: 1 };
}

export function creditOpacity(s: CreditIntro): number {
  if (s.t < s.fadeAt) return 1;
  return Math.max(0, s.fadeFrom * (1 - (s.t - s.fadeAt) / s.fadeLen));
}

export function creditDone(s: CreditIntro): boolean {
  return s.t >= s.fadeAt && creditOpacity(s) <= 0;
}

export function stepCreditIntro(s: CreditIntro, dt: number): CreditIntro {
  return { ...s, t: s.t + Math.max(0, dt) };
}

/** Click: fade out from wherever it is now, finishing within 0.5 s (never slower than already planned). */
export function skipCreditIntro(s: CreditIntro): CreditIntro {
  const o = creditOpacity(s);
  if (o <= 0) return s;
  const remaining = s.t < s.fadeAt ? Infinity : s.fadeAt + s.fadeLen - s.t;
  if (remaining <= CREDIT_TIMING.skipFade) return s;
  return { ...s, fadeAt: s.t, fadeLen: CREDIT_TIMING.skipFade, fadeFrom: o };
}
