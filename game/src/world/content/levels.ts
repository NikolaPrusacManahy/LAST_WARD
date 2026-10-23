// Update 0.7 — the levels in play order. Escaping one level wakes you up in the next.
import type { LevelDef } from '../level';
import { LEVEL_01 } from './level01';
import { LEVEL_02 } from './level02';

export const LEVELS: LevelDef[] = [LEVEL_01, LEVEL_02];
