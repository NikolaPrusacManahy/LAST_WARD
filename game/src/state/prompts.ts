// Update 0.5 — what the crosshair prompt says: "Press [icon] to collect" etc. The icon comes from the
// interact binding at render time; this only decides the words. Pure (tested).
import type { Target } from '../world/interact';
import { FUSES_NEEDED, Progress } from './objectives';

export type PromptVerb = 'collect' | 'read' | 'interact';

export interface Prompt {
  /** What you're looking at. */
  title: string;
  /** Shown as "Press [icon] to <verb>". Null = nothing to do yet, show `info` instead. */
  verb: PromptVerb | null;
  info?: string;
}

const ITEM_TITLE = { fuse: 'Fuse', battery: 'Battery', note: 'Note' } as const;

export function promptFor(t: Target | null, p: Progress, noteOpen: boolean): Prompt | null {
  if (!t || noteOpen) return null;
  if (t.type === 'item') {
    return { title: ITEM_TITLE[t.item.kind], verb: t.item.kind === 'note' ? 'read' : 'collect' };
  }
  if (t.type === 'generator') {
    if (p.powered) return null;
    return p.fuses >= FUSES_NEEDED
      ? { title: 'Generator', verb: 'interact' }
      : { title: 'Generator', verb: null, info: `Needs fuses (${p.fuses}/${FUSES_NEEDED})` };
  }
  return p.powered ? { title: 'Exit', verb: 'interact' } : { title: 'Exit', verb: null, info: 'Mag-lock. No power.' };
}

export const samePrompt = (a: Prompt | null, b: Prompt | null) =>
  a === b || (!!a && !!b && a.title === b.title && a.verb === b.verb && a.info === b.info);

/** Update 0.5 — the controls card shown at the start of a run: 10 s, or Enter closes it. */
export const CONTROLS_CARD_SECONDS = 10;

export function tickControlsCard(left: number, dt: number, closePressed: boolean): number {
  if (closePressed) return 0;
  return Math.max(0, left - dt);
}
