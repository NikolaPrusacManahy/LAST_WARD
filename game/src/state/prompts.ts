// Update 0.5 — what the crosshair prompt says: "Press [icon] to collect" etc. The icon comes from the
// interact binding at render time; this only decides the words. Pure (tested).
import type { Target } from '../world/interact';
import { Progress, allPanelsOn, fusesHeld, panelsOn } from './objectives';

export type PromptVerb = 'collect' | 'read' | 'interact' | 'repair' | 'fit a fuse' | 'switch on' | 'start';

export interface Prompt {
  /** What you're looking at. */
  title: string;
  /** Shown as "Press [icon] to <verb>". Null = nothing to do yet, show `info` instead. */
  verb: PromptVerb | null;
  info?: string;
  /** Update 0.8 — "Hold [icon] to …" instead of "Press". */
  hold?: boolean;
}

const ITEM_TITLE = { fuse: 'Fuse', battery: 'Battery', note: 'Note' } as const;

export function promptFor(t: Target | null, p: Progress, noteOpen: boolean): Prompt | null {
  if (!t || noteOpen) return null;
  if (t.type === 'item') {
    return { title: ITEM_TITLE[t.item.kind], verb: t.item.kind === 'note' ? 'read' : 'collect' };
  }
  if (t.type === 'generator') {
    // Update 0.9 — it starts once all four panels are live.
    if (p.powered) return null;
    if (!allPanelsOn(p)) return { title: 'Generator', verb: null, info: `Dead. Restore the panels (${panelsOn(p)}/${p.panels.length}).` };
    return { title: 'Generator', verb: 'start' };
  }
  if (t.type === 'panel') {
    const panel = p.panels[t.index];
    const title = 'Electrical panel';
    if (!panel || panel.on) return { title, verb: null, info: 'Live.' };
    if (!panel.fuse) return fusesHeld(p) > 0 ? { title, verb: 'fit a fuse' } : { title, verb: null, info: 'Needs a fuse.' };
    if (!panel.fixed) return { title, verb: 'repair', hold: true };
    return { title, verb: 'switch on' };
  }
  return p.powered ? { title: 'Exit', verb: 'interact' } : { title: 'Exit', verb: null, info: 'Mag-lock. No power.' };
}

export const samePrompt = (a: Prompt | null, b: Prompt | null) =>
  a === b || (!!a && !!b && a.title === b.title && a.verb === b.verb && a.info === b.info && a.hold === b.hold);

/** Update 0.5 — the controls card shown at the start of a run: 10 s, or Enter closes it. */
export const CONTROLS_CARD_SECONDS = 10;

export function tickControlsCard(left: number, dt: number, closePressed: boolean): number {
  if (closePressed) return 0;
  return Math.max(0, left - dt);
}
