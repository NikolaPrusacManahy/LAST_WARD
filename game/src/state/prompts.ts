// Update 0.5 — what the crosshair prompt says: "Press [icon] to collect" etc. The icon comes from the
// interact binding at render time; this only decides the words. Pure (tested).
import type { Target } from '../world/interact';
import { FUSES_NEEDED, Progress } from './objectives';

export type PromptVerb = 'collect' | 'read' | 'interact' | 'repair';

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
    if (p.powered) return null;
    // Update 0.8 — fuses in → it turns over, but the breaker's tripped.
    if (p.fusesIn) return { title: 'Generator', verb: null, info: "Running. The breaker's tripped." };
    return p.fuses >= FUSES_NEEDED
      ? { title: 'Generator', verb: 'interact' }
      : { title: 'Generator', verb: null, info: `Needs fuses (${p.fuses}/${FUSES_NEEDED})` };
  }
  if (t.type === 'panel') {
    if (p.panelFixed) return null;
    if (!p.fusesIn) return { title: 'Breaker panel', verb: null, info: 'Dead. Start the generator first.' };
    return { title: 'Breaker panel', verb: 'repair', hold: true };
  }
  if (t.type === 'switch') {
    if (p.powered) return null;
    if (!p.panelFixed) return { title: 'Power switch', verb: null, info: 'No current.' };
    return { title: 'Power switch', verb: 'interact' };
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
