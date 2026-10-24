// Tiny external store: the engine writes HUD values ~10×/s, React reads them with
// useSyncExternalStore (see hooks/useHud.ts). Keeps React out of the frame loop.
import type { Prompt } from '../state/prompts';
import { DEFAULT_INTRO, LevelIntro } from '../world/level';
import { Bindings, DEFAULT_BINDINGS } from '../state/bindings';

export interface HudState {
  battery: number;
  flashlightOn: boolean;
  stamina: number; // 0..1
  exhausted: boolean;
  objective: string;
  /** Update 0.5 — words only; the icon is the interact binding. */
  prompt: Prompt | null;
  toast: string | null;
  note: string | null;
  fear: number;
  time: number;
  started: boolean;
  /** Update 0.6.3 — the intro text's opacity while it fades on black as you wake (0 once gone). */
  intro: number;
  /** Update 0.7 — this level's intro text. */
  introText: LevelIntro;
  /** Death / escape sequence: hide the HUD. */
  cinematic: boolean;
  /** Update 0.3 — F2 debug panel lines, or null when closed. */
  debug: string[] | null;
  /** Update 0.5 — current controls, for prompt icons and the controls card. */
  bindings: Bindings;
  /** Seconds left on the start-of-run controls card (0 = hidden). */
  controls: number;
  /** Update 0.9 — the line under the objective (fuses held / found). */
  objectiveDetail: string;
  /** Update 0.9 — a new objective, announced big at the top; `key` restarts the animation. */
  banner: { text: string; label: string; key: number } | null;
  /** Update 0.9 — panel repair bar and the skill check circle (times on performance.now(), ms). */
  repair: { progress: number; dead: boolean; check: { spinAtMs: number; zone: number } | null } | null;
  /** Update 0.9.3 — Easy: the light is night vision goggles (battery bar + controls card say so). */
  nightVision: boolean;
  /** Update 0.9.5 — inside a locker: show how to peek and get out. */
  hiding: boolean;
  /** Update 0.9.6 — holding a brick / bottle: show how to throw it. */
  holding: 'brick' | 'bottle' | null;
}

export const initialHud: HudState = {
  battery: 100,
  flashlightOn: true,
  stamina: 1,
  exhausted: false,
  objective: '',
  prompt: null,
  toast: null,
  note: null,
  fear: 0,
  time: 0,
  started: false,
  intro: 1,
  introText: DEFAULT_INTRO,
  cinematic: false,
  debug: null,
  bindings: DEFAULT_BINDINGS,
  controls: 0,
  objectiveDetail: '',
  nightVision: false,
  hiding: false,
  holding: null,
  banner: null,
  repair: null,
};

export function createHudStore() {
  let state = initialHud;
  const subs = new Set<() => void>();
  return {
    get: () => state,
    set(patch: Partial<HudState>) {
      let changed = false;
      for (const k in patch) {
        const key = k as keyof HudState;
        if (state[key] !== patch[key]) {
          changed = true;
          break;
        }
      }
      if (!changed) return;
      state = { ...state, ...patch };
      subs.forEach((f) => f());
    },
    subscribe(f: () => void) {
      subs.add(f);
      return () => subs.delete(f);
    },
  };
}

export type HudStore = ReturnType<typeof createHudStore>;
