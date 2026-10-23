// Update 0.5.1 — boot credit screen: holds 3 s, then fades out. A click cuts the fade to 0.5 s.
// Update 0.6.2 — two cards: the studio title (its typing GIF), then the full-screen + headphones tips.
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

export function createCreditIntro(timing: { hold: number; fade: number } = CREDIT_TIMING): CreditIntro {
  return { t: 0, fadeAt: timing.hold, fadeLen: timing.fade, fadeFrom: 1 };
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

/** Update 0.6.2 — the cards, in order. The studio GIF types for 1.6 s and plays once (2.56 s). */
export type CreditCard = 'studio' | 'tips';
export const CREDIT_CARDS: { id: CreditCard; hold: number; fade: number }[] = [
  { id: 'studio', hold: 3.2, fade: 0.8 },
  { id: 'tips', hold: CREDIT_TIMING.hold, fade: CREDIT_TIMING.fade },
];

export interface CreditSequence {
  card: number;
  intro: CreditIntro;
}

export function createCreditSequence(): CreditSequence {
  return { card: 0, intro: createCreditIntro(CREDIT_CARDS[0]) };
}

export const creditCard = (s: CreditSequence): CreditCard | null => CREDIT_CARDS[s.card]?.id ?? null;
export const creditSequenceDone = (s: CreditSequence) => s.card >= CREDIT_CARDS.length;

/** When a card has faded out, the next one starts. Leftover time carries over so nothing drifts. */
export function stepCreditSequence(s: CreditSequence, dt: number): CreditSequence {
  if (creditSequenceDone(s)) return s;
  const intro = stepCreditIntro(s.intro, dt);
  if (!creditDone(intro)) return { ...s, intro };
  const card = s.card + 1;
  if (card >= CREDIT_CARDS.length) return { card, intro };
  const end = intro.fadeAt + intro.fadeLen;
  return { card, intro: stepCreditIntro(createCreditIntro(CREDIT_CARDS[card]), Math.max(0, intro.t - end)) };
}

/** A click fades the card that's up within 0.5 s (the next card still shows). */
export function skipCreditSequence(s: CreditSequence): CreditSequence {
  return creditSequenceDone(s) ? s : { ...s, intro: skipCreditIntro(s.intro) };
}
