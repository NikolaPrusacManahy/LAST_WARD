// Picks what the player is looking at within reach: items, the generator, the exit.
import type { CarryKind } from '../state/throwables';
import { Level, LevelItem, Vec2, cellCenter, dist, itemPos } from './level';
import { lockerSpots, panelSpots, panelSwitches } from './props';

export const REACH = 2.4;
/** Fixtures are solid tiles, so the player can't stand on their centre. */
export const FIXTURE_REACH = 2.9;

export type Target =
  /** A note on a table. (Update 0.9.8 — fuses, batteries and med kits are `loose`, like a brick.) */
  | { type: 'item'; item: LevelItem }
  | { type: 'generator' }
  | { type: 'exit' }
  /** Update 0.9 — one of the electrical panels (fit a fuse, hold to repair, switch on). */
  | { type: 'panel'; index: number }
  /** Update 0.9.1 — a panel's power switch (thrown once the panel is repaired). */
  | { type: 'switch'; index: number }
  /** Update 0.9.5 — a locker to hide in. */
  | { type: 'locker'; index: number }
  /** Update 0.9.6 — a brick or bottle on the floor. Update 0.9.8 — anything to carry, on a table or the floor. */
  | { type: 'loose'; id: number; kind: CarryKind; title?: string };

/** Lower is better. Update 0.9.1 — what you aim at wins over what's merely closer (a panel and its
 *  switch are a metre apart: look at the one you mean). */
function inView(from: Vec2, facing: Vec2, at: Vec2, reach: number): number | null {
  const d = dist(from, at);
  if (d > reach) return null;
  if (d < 0.6) return d * 0.15; // standing on it
  const dot = ((at.x - from.x) * facing.x + (at.z - from.z) * facing.z) / d;
  return dot > 0.55 ? (1 - dot) * 4 + d * 0.15 : null;
}

export function findTarget(level: Level, pos: Vec2, facing: Vec2, collected: string[], loose: { id: number; kind: CarryKind; pos: Vec2; title?: string }[] = []): Target | null {
  let best: { t: Target; d: number } | null = null;
  const consider = (t: Target, at: Vec2, reach: number) => {
    const d = inView(pos, facing, at, reach);
    if (d !== null && (!best || d < best.d)) best = { t, d };
  };
  for (const item of level.items) {
    if (item.kind === 'note' && !collected.includes(item.id)) consider({ type: 'item', item }, itemPos(level, item.cell), REACH);
  }
  consider({ type: 'generator' }, cellCenter(level.generator), FIXTURE_REACH);
  consider({ type: 'exit' }, cellCenter(level.exit), FIXTURE_REACH);
  panelSpots(level).forEach((at, index) => consider({ type: 'panel', index }, at, REACH));
  panelSwitches(level).forEach((at, index) => consider({ type: 'switch', index }, at, REACH));
  lockerSpots(level).forEach((at, index) => consider({ type: 'locker', index }, at, REACH));
  for (const t of loose) consider({ type: 'loose', id: t.id, kind: t.kind, title: t.title }, t.pos, REACH);
  return (best as { t: Target } | null)?.t ?? null;
}
