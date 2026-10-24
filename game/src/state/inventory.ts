// Update 0.9.8 — your three slots. Everything you carry goes in one: bricks, bottles, fuses, batteries,
// med kits (state/throwables.ts). Keys 1–3 pick which one is in your hand; an empty slot is empty hands.
// Pressing the key of the slot you're holding puts it away, so with all three full you can still use your
// hands (panels, notes, lockers, picking things up). Pure (tested).
import { Blocker, overlapsWall } from '../world/collision';
import type { Level, Vec2 } from '../world/level';

export const SLOTS = 3;

export interface Inventory {
  /** Item ids (state/throwables.ts), or null for an empty slot. */
  slots: (number | null)[];
  /** The slot your hand is on (0–2). */
  selected: number;
  /** Its item is put away: empty hands. */
  stowed: boolean;
}

export const createInventory = (): Inventory => ({ slots: Array<number | null>(SLOTS).fill(null), selected: 0, stowed: false });

/** What's in your hand (an item id), or null for empty hands. */
export const inHand = (inv: Inventory): number | null => (inv.stowed ? null : inv.slots[inv.selected]);

export const isFull = (inv: Inventory) => inv.slots.every((s) => s !== null);

/** Press a slot key: that slot in your hand; the one you're holding again puts it away (or takes it out). */
export function selectSlot(inv: Inventory, i: number): Inventory {
  if (i < 0 || i >= SLOTS) return inv;
  if (i === inv.selected && inv.slots[i] !== null) return { ...inv, stowed: !inv.stowed };
  return { ...inv, selected: i, stowed: false };
}

/** Picked something up: into the slot your hand is on if it's free (so you're holding it), else the first
 *  free one. `slot` is -1 when all three are full. */
export function store(inv: Inventory, id: number): { inv: Inventory; slot: number } {
  const here = inv.slots[inv.selected] === null ? inv.selected : inv.slots.findIndex((s) => s === null);
  if (here < 0) return { inv, slot: -1 };
  const slots = [...inv.slots];
  slots[here] = id;
  return { inv: { ...inv, slots, stowed: here === inv.selected ? false : inv.stowed }, slot: here };
}

/** Thrown, used up or dropped: its slot empties (your hand stays on it: empty hands). */
export function remove(inv: Inventory, id: number): Inventory {
  const slots = inv.slots.map((s) => (s === id ? null : s));
  return { ...inv, slots, stowed: slots[inv.selected] === null ? false : inv.stowed };
}

/** Update 0.9.8 — a med kit: hold use this long (s) to patch yourself up. */
export const MEDKIT_SECONDS = 5;

/** Where something you drop lands: on the floor a step in front of you, or at your feet if a wall or
 *  furniture is in the way. */
export function dropSpot(level: Level, at: Vec2, forward: Vec2, blockers: Blocker[] = []): Vec2 {
  const len = Math.hypot(forward.x, forward.z) || 1;
  for (const d of [0.7, 0.45]) {
    const p = { x: at.x + (forward.x / len) * d, z: at.z + (forward.z / len) * d };
    if (!overlapsWall(level, p, 0.15, blockers)) return p;
  }
  return { ...at };
}
