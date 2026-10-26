// Update 0.7 — the levels in play order. Escaping one level wakes you up in the next.
// Update 0.7.2 — level 2 (the mansion) removed: quality over quantity, the hospital comes first.
// Update 1.0.1 — the maps you pick from (Begin → map → difficulty; the host picks in a co-op lobby).
// Each is a run of its own: escaping one ends the run.
import type { LevelDef } from '../level';
import { LEVEL_01 } from './level01';
import { LEVEL_02 } from './level02';

export const LEVELS: LevelDef[] = [LEVEL_01, LEVEL_02];

export const levelId = (def: LevelDef) => def.id ?? def.name;

/** The map with this id, or the first one (an old save, a room from an older build). */
export function levelIndexOf(id: string | null | undefined): number {
  const i = LEVELS.findIndex((l) => levelId(l) === id);
  return i < 0 ? 0 : i;
}
