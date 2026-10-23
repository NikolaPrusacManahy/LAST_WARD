// Objective chain: collect fuses → power the generator → escape through the exit.
// Update 0.8 — the power takes three steps now: fuses into the generator → repair the breaker panel
// (state/panelRepair.ts) → throw the power switch.

export const FUSES_NEEDED = 3;

export interface Progress {
  fuses: number;
  /** Update 0.8 — the fuses are in the generator (it runs, but the breaker has tripped). */
  fusesIn: boolean;
  /** Update 0.8 — the breaker panel is repaired (the switch can be thrown). */
  panelFixed: boolean;
  powered: boolean;
  escaped: boolean;
  collected: string[]; // item ids already picked up
  notesRead: number[];
}

export function createProgress(): Progress {
  return { fuses: 0, fusesIn: false, panelFixed: false, powered: false, escaped: false, collected: [], notesRead: [] };
}

export function objectiveText(p: Progress): string {
  if (p.escaped) return 'You got out.';
  if (p.powered) return 'Power is back. Reach the exit door.';
  if (p.panelFixed) return 'Throw the power switch.';
  if (p.fusesIn) return 'Repair the breaker panel.';
  if (p.fuses >= FUSES_NEEDED) return 'Fuses found. Put them in the generator.';
  return `Find fuses for the generator (${p.fuses}/${FUSES_NEEDED})`;
}

/** Update 0.8 — 'fuses-in' (was 'powered'): the generator turns over, then the breaker trips. */
export type GeneratorResult = 'fuses-in' | 'need-fuses' | 'already';

export function activateGenerator(p: Progress): GeneratorResult {
  if (p.fusesIn) return 'already';
  if (p.fuses < FUSES_NEEDED) return 'need-fuses';
  p.fusesIn = true;
  return 'fuses-in';
}

/** Update 0.8 — the panel finished repairing. */
export function fixPanel(p: Progress): boolean {
  if (!p.fusesIn || p.panelFixed) return false;
  p.panelFixed = true;
  return true;
}

export type SwitchResult = 'powered' | 'no-current' | 'already';

/** Update 0.8 — the lights come on here now (they used to with the generator). */
export function throwSwitch(p: Progress): SwitchResult {
  if (p.powered) return 'already';
  if (!p.panelFixed) return 'no-current';
  p.powered = true;
  return 'powered';
}

export type ExitResult = 'escaped' | 'locked';

export function tryExit(p: Progress): ExitResult {
  if (!p.powered) return 'locked';
  p.escaped = true;
  return 'escaped';
}
