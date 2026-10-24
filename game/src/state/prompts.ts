// Update 0.5 — what the crosshair prompt says: "Press [icon] to collect" etc. The icon comes from the
// interact binding at render time; this only decides the words. Pure (tested).
import type { Target } from '../world/interact';
import { Progress, allPanelsOn, panelsOn } from './objectives';
import type { CarryKind } from './throwables';

export type PromptVerb =
  | 'collect' | 'read' | 'interact' | 'repair' | 'fit a fuse' | 'switch on' | 'start' | 'hide' | 'pick up'
  /** Update 0.9.8 — using what's in your hand. */
  | 'throw it' | 'load it' | 'patch yourself up' | 'fit the fuse'
  /** Update 0.9.9 — co-op: a teammate who's down. */
  | 'get them up';

export interface Prompt {
  /** What you're looking at. */
  title: string;
  /** Shown as "Press [icon] to <verb>". Null = nothing to do yet, show `info` instead. */
  verb: PromptVerb | null;
  info?: string;
  /** Update 0.8 — "Hold [icon] to …" instead of "Press". */
  hold?: boolean;
}

const ITEM_TITLE = { fuse: 'Fuse', battery: 'Battery', note: 'Note', medkit: 'Med kit' } as const;

/** Update 0.9.8 — your hands and slots, for the prompt. */
export interface Hand {
  /** What's in your hand (null: empty hands) and what it's called ("Half a brick"). */
  kind: CarryKind | null;
  title?: string;
  /** All three slots are taken. */
  full: boolean;
  /** Fuses in your slots (in your hand or put away). */
  fuses: number;
  injured: boolean;
  /** The light's battery is at 100%. */
  batteryFull: boolean;
}

export const EMPTY_HANDS: Hand = { kind: null, full: false, fuses: 0, injured: false, batteryFull: false };

/** Update 0.9.8 — with something in your hand, left click uses it: that's what the prompt says. */
function handPrompt(t: Target | null, p: Progress, hand: Hand): Prompt {
  const title = hand.title ?? ITEM_TITLE[hand.kind as 'fuse'] ?? '';
  switch (hand.kind) {
    case 'fuse': {
      const panel = t?.type === 'panel' ? p.panels[t.index] : null;
      if (panel && !panel.fuse) return { title: 'Electrical panel', verb: 'fit the fuse' };
      return { title, verb: null, info: 'Fit it in an electrical panel.' };
    }
    case 'battery':
      return hand.batteryFull ? { title, verb: null, info: 'Your light is full.' } : { title, verb: 'load it' };
    case 'medkit':
      return hand.injured ? { title, verb: 'patch yourself up', hold: true } : { title, verb: null, info: 'You\'re not hurt.' };
    default:
      return { title, verb: 'throw it' };
  }
}

export function promptFor(t: Target | null, p: Progress, noteOpen: boolean, hand: Hand = EMPTY_HANDS): Prompt | null {
  if (noteOpen) return null;
  if (hand.kind) return handPrompt(t, p, hand);
  if (!t) return null;
  // Update 0.9.6 — a brick or bottle. Update 0.9.8 — anything to carry, into a free slot.
  if (t.type === 'loose') {
    const title = t.title ?? ITEM_TITLE[t.kind as 'fuse'] ?? (t.kind === 'brick' ? 'Brick' : 'Glass bottle');
    return hand.full ? { title, verb: null, info: 'Your slots are full.' } : { title, verb: 'pick up' };
  }
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
    // Update 0.9.8 — the fuse goes in from your hand: take it out of its slot first.
    if (!panel.fuse) return { title, verb: null, info: hand.fuses > 0 ? 'Needs a fuse. Take one in your hand (1–3).' : 'Needs a fuse.' };
    if (!panel.fixed) return { title, verb: 'repair', hold: true };
    return { title, verb: null, info: 'Repaired. Throw its switch.' };
  }
  if (t.type === 'locker') return { title: 'Locker', verb: 'hide' }; // Update 0.9.5
  if (t.type === 'switch') {
    // Update 0.9.1 — the switch is its own thing to look at and press.
    const panel = p.panels[t.index];
    const title = 'Power switch';
    if (!panel || panel.on) return { title, verb: null, info: 'On.' };
    if (panel.fixed) return { title, verb: 'switch on' };
    return { title, verb: null, info: panel.fuse ? 'Dead. Repair the panel first.' : 'Dead. The panel needs a fuse.' };
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
