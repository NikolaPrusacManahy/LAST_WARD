// Update 0.4.2 — Ctrl is now crouch, and browsers never let a page block Ctrl+W.
// While a run is in progress, closing the tab asks "Leave site?" instead of losing the run.
/** 'caught' — Update 0.6, the grab / throw / get-up sequence after losing a life. */
/** 'waking' — Update 0.6.3, coming to on the floor at the start of a run. */
/** 'reading' — Update 0.6.4, a note is open: the whole game is paused until you put it down. */
export type RunPhase = 'intro' | 'waking' | 'playing' | 'reading' | 'paused' | 'caught' | 'dying' | 'escaping' | 'over';

export function guardLeave(phase: RunPhase): boolean {
  return phase === 'waking' || phase === 'playing' || phase === 'reading' || phase === 'paused' || phase === 'caught' || phase === 'dying';
}

/** Update 0.6.4 — how fast the world runs in this phase (reading a note stops it). */
export function worldTimeScale(phase: RunPhase): number {
  return phase === 'reading' ? 0 : 1;
}

/** Update 0.6.4 — the note closes on the interact button, Enter or Esc. */
export function closesNote(p: { interact: boolean; enter: boolean; escape: boolean }): boolean {
  return p.interact || p.enter || p.escape;
}
