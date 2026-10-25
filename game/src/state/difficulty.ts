// Update 0.9.3 — difficulty, picked each time you press Begin (the last pick is remembered).
// Easy: night vision goggles: the ward in green, bright and clear, so you see The Patient from far
// away. Normal: the game as it is. Hard: the battery lasts 40% less and you have one life.
export type Difficulty = 'easy' | 'normal' | 'hard';

export interface DifficultyRules {
  label: string;
  /** One line on the picker. */
  blurb: string;
  lives: number;
  /** The flashlight drains this many times faster (1 / 0.6 = it lasts 40% less). */
  batteryDrainMul: number;
  nightVision: boolean;
}

export const DIFFICULTIES: Difficulty[] = ['easy', 'normal', 'hard'];

export const DIFFICULTY: Record<Difficulty, DifficultyRules> = {
  easy: { label: 'Easy', blurb: 'Night vision.', lives: 2, batteryDrainMul: 1, nightVision: true },
  normal: { label: 'Normal', blurb: '2 lives.', lives: 2, batteryDrainMul: 1, nightVision: false },
  hard: { label: 'Hard', blurb: '1 life. Less battery.', lives: 1, batteryDrainMul: 1 / 0.6, nightVision: false },
};

export const DEFAULT_DIFFICULTY: Difficulty = 'normal';

export function hydrateDifficulty(v: unknown): Difficulty {
  return typeof v === 'string' && (DIFFICULTIES as string[]).includes(v) ? (v as Difficulty) : DEFAULT_DIFFICULTY;
}
