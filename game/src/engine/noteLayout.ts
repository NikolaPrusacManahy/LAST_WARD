// Update 0.9.9 — the line scrawled on a wall note always fits its paper. It was drawn at one size, so a
// longer line ("It can hear you...") ran off both edges of the page. Pure (tested).

/** Width of `s` drawn at `size` px. */
export type Measure = (s: string, size: number) => number;

/** Two lines, broken at the space nearest the middle (null: one word). */
export function splitInTwo(text: string): [string, string] | null {
  const mid = text.length / 2;
  let best = -1;
  for (let i = 0; i < text.length; i++) if (text[i] === ' ' && (best < 0 || Math.abs(i - mid) < Math.abs(best - mid))) best = i;
  return best < 0 ? null : [text.slice(0, best), text.slice(best + 1)];
}

/**
 * The lines and the size to draw them at: as big as `size`, on one line if it fits `maxWidth`, else on two,
 * else a little smaller each time (down to `minSize`).
 */
export function layoutNoteText(text: string, maxWidth: number, measure: Measure, size = 54, minSize = 24): { lines: string[]; size: number } {
  const two = splitInTwo(text);
  for (let s = size; s > minSize; s -= 2) {
    if (measure(text, s) <= maxWidth) return { lines: [text], size: s };
    if (two && two.every((l) => measure(l, s) <= maxWidth)) return { lines: two, size: s };
  }
  return { lines: two ?? [text], size: minSize };
}
