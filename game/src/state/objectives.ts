// Objective chain. Update 0.9: find 4 fuses → at each of the 4 electrical panels fit a fuse, repair it
// (skill checks, state/skillCheck.ts) and throw its switch → start the generator → escape through the exit.

export const PANEL_COUNT = 4;
/** One fuse per electrical panel. */
export const FUSES_NEEDED = PANEL_COUNT;

export interface PanelState {
  fuse: boolean;
  /** Repair progress 0..1. */
  repair: number;
  fixed: boolean;
  on: boolean;
}

export interface Progress {
  /** Fuses found (picked up at least once; some may be in panels already). */
  fuses: number;
  panels: PanelState[];
  powered: boolean;
  escaped: boolean;
  collected: string[]; // item ids already picked up
  notesRead: number[];
}

export const newPanel = (): PanelState => ({ fuse: false, repair: 0, fixed: false, on: false });

export function createProgress(panelCount = PANEL_COUNT): Progress {
  return { fuses: 0, panels: Array.from({ length: panelCount }, newPanel), powered: false, escaped: false, collected: [], notesRead: [] };
}

export const fusesFitted = (p: Progress) => p.panels.filter((x) => x.fuse).length;
export const panelsOn = (p: Progress) => p.panels.filter((x) => x.on).length;
export const allPanelsOn = (p: Progress) => p.panels.length > 0 && panelsOn(p) === p.panels.length;

/** The current step, short. Changes here are announced big at the top of the screen. */
export function objectiveText(p: Progress): string {
  if (p.escaped) return 'You got out.';
  if (p.powered) return 'Power is back. Reach the exit door.';
  if (allPanelsOn(p)) return 'All panels are live. Start the generator.';
  return `Restore the electrical panels (${panelsOn(p)}/${p.panels.length})`;
}

/** Second line under the objective: what you're carrying. Update 0.9.8 — `carried`: fuses in your slots. */
export function objectiveDetail(p: Progress, carried: number): string {
  if (p.powered || allPanelsOn(p)) return '';
  return carried > 0 ? `Fuses: ${carried}` : `Find fuses (${fusesFitted(p)}/${FUSES_NEEDED} fitted)`;
}

export type FuseResult = 'fitted' | 'no-fuse' | 'already';

/** Update 0.9.8 — the fuse comes from your hand: `holding` one or not. */
export function fitFuse(p: Progress, i: number, holding: boolean): FuseResult {
  const panel = p.panels[i];
  if (panel.fuse) return 'already';
  if (!holding) return 'no-fuse';
  panel.fuse = true;
  return 'fitted';
}

/** The repair bar reached the end. */
export function finishRepair(p: Progress, i: number): boolean {
  const panel = p.panels[i];
  if (!panel.fuse || panel.fixed) return false;
  panel.fixed = true;
  panel.repair = 1;
  return true;
}

export type SwitchResult = 'on' | 'not-ready' | 'already';

export function throwPanelSwitch(p: Progress, i: number): SwitchResult {
  const panel = p.panels[i];
  if (panel.on) return 'already';
  if (!panel.fixed) return 'not-ready';
  panel.on = true;
  return 'on';
}

export type GeneratorResult = 'powered' | 'panels' | 'already';

/** The lights come back here (and it brings The Patient running). */
export function startGenerator(p: Progress): GeneratorResult {
  if (p.powered) return 'already';
  if (!allPanelsOn(p)) return 'panels';
  p.powered = true;
  return 'powered';
}

export type ExitResult = 'escaped' | 'locked';

export function tryExit(p: Progress): ExitResult {
  if (!p.powered) return 'locked';
  p.escaped = true;
  return 'escaped';
}
