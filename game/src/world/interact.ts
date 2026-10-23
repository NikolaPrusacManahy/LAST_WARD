// Picks what the player is looking at within reach: items, the generator, the exit.
import { Level, LevelItem, Vec2, cellCenter, dist, itemPos } from './level';

export const REACH = 2.4;
/** Fixtures are solid tiles, so the player can't stand on their centre. */
export const FIXTURE_REACH = 2.9;

export type Target =
  | { type: 'item'; item: LevelItem }
  | { type: 'generator' }
  | { type: 'exit' };

function inView(from: Vec2, facing: Vec2, at: Vec2, reach: number): number | null {
  const d = dist(from, at);
  if (d > reach) return null;
  if (d < 0.6) return d; // standing on it
  const dot = ((at.x - from.x) * facing.x + (at.z - from.z) * facing.z) / d;
  return dot > 0.55 ? d : null;
}

export function findTarget(level: Level, pos: Vec2, facing: Vec2, collected: string[]): Target | null {
  let best: { t: Target; d: number } | null = null;
  const consider = (t: Target, at: Vec2, reach: number) => {
    const d = inView(pos, facing, at, reach);
    if (d !== null && (!best || d < best.d)) best = { t, d };
  };
  for (const item of level.items) {
    if (!collected.includes(item.id)) consider({ type: 'item', item }, itemPos(level, item.cell), REACH);
  }
  consider({ type: 'generator' }, cellCenter(level.generator), FIXTURE_REACH);
  consider({ type: 'exit' }, cellCenter(level.exit), FIXTURE_REACH);
  return (best as { t: Target } | null)?.t ?? null;
}
