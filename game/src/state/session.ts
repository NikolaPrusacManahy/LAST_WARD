// Update 0.4.2 — Ctrl is now crouch, and browsers never let a page block Ctrl+W.
// While a run is in progress, closing the tab asks "Leave site?" instead of losing the run.
export type RunPhase = 'intro' | 'playing' | 'paused' | 'dying' | 'escaping' | 'over';

export function guardLeave(phase: RunPhase): boolean {
  return phase === 'playing' || phase === 'paused' || phase === 'dying';
}
