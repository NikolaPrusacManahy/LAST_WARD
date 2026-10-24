// Update 0.4.2 — Ctrl is now crouch, and browsers never let a page block Ctrl+W.
// While a run is in progress, closing the tab asks "Leave site?" instead of losing the run.
/** 'caught' — Update 0.6, the grab / throw / get-up sequence after losing a life. */
/** 'waking' — Update 0.6.3, coming to on the floor at the start of a run. */
/** 'reading' — Update 0.6.4, a note is open: the whole game is paused until you put it down. */
/** 'down' — Update 0.9.9 (co-op), on your last life: on the floor until a teammate gets you up, or you're out. */
/** 'spectating' — Update 0.9.9 (co-op), out (taken or escaped): watching a teammate until the run ends. */
export type RunPhase = 'intro' | 'waking' | 'playing' | 'reading' | 'paused' | 'caught' | 'dying' | 'escaping' | 'down' | 'spectating' | 'over';

export function guardLeave(phase: RunPhase): boolean {
  return phase === 'waking' || phase === 'playing' || phase === 'reading' || phase === 'paused' || phase === 'caught' || phase === 'dying' || phase === 'down' || phase === 'spectating';
}

/** Update 0.6.4 — how fast the world runs in this phase (reading a note stops it).
 *  Update 0.9.9 — not in co-op: the ward goes on for everyone else. */
export function worldTimeScale(phase: RunPhase, coop = false): number {
  return phase === 'reading' && !coop ? 0 : 1;
}

/** Update 0.6.4 — the note closes on the interact button, Enter or Esc. */
export function closesNote(p: { interact: boolean; enter: boolean; escape: boolean }): boolean {
  return p.interact || p.enter || p.escape;
}
