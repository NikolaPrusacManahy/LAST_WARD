// Objective chain: collect fuses → power the generator → escape through the exit.

export const FUSES_NEEDED = 3;

export interface Progress {
  fuses: number;
  powered: boolean;
  escaped: boolean;
  collected: string[]; // item ids already picked up
  notesRead: number[];
}

export function createProgress(): Progress {
  return { fuses: 0, powered: false, escaped: false, collected: [], notesRead: [] };
}

export function objectiveText(p: Progress): string {
  if (p.escaped) return 'You got out.';
  if (p.powered) return 'Power is back. Reach the exit door.';
  if (p.fuses >= FUSES_NEEDED) return 'Fuses found. Restart the generator.';
  return `Find fuses for the generator (${p.fuses}/${FUSES_NEEDED})`;
}

export type GeneratorResult = 'powered' | 'need-fuses' | 'already';

export function activateGenerator(p: Progress): GeneratorResult {
  if (p.powered) return 'already';
  if (p.fuses < FUSES_NEEDED) return 'need-fuses';
  p.powered = true;
  return 'powered';
}

export type ExitResult = 'escaped' | 'locked';

export function tryExit(p: Progress): ExitResult {
  if (!p.powered) return 'locked';
  p.escaped = true;
  return 'escaped';
}
