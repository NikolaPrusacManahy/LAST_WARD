// Update 0.4.2 — Ctrl is now crouch, and browsers never let a page block Ctrl+W.
// While a run is in progress, closing the tab asks "Leave site?" instead of losing the run.
/** 'caught' — Update 0.6, the grab / throw / get-up sequence after losing a life. */
export type RunPhase = 'intro' | 'playing' | 'paused' | 'caught' | 'dying' | 'escaping' | 'over';

export function guardLeave(phase: RunPhase): boolean {
  return phase === 'playing' || phase === 'paused' || phase === 'caught' || phase === 'dying';
}
