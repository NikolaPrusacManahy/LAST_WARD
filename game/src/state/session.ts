// Update 0.4.2 — Ctrl is now crouch, and browsers never let a page block Ctrl+W.
// While a run is in progress, closing the tab asks "Leave site?" instead of losing the run.
/** 'caught' — Update 0.6, the grab / throw / get-up sequence after losing a life. */
/** 'waking' — Update 0.6.3, coming to on the floor at the start of a run. */
export type RunPhase = 'intro' | 'waking' | 'playing' | 'paused' | 'caught' | 'dying' | 'escaping' | 'over';

export function guardLeave(phase: RunPhase): boolean {
  return phase === 'waking' || phase === 'playing' || phase === 'paused' || phase === 'caught' || phase === 'dying';
}
