// Tiny external store: the engine writes HUD values ~10×/s, React reads them with
// useSyncExternalStore (see hooks/useHud.ts). Keeps React out of the frame loop.

export interface HudState {
  battery: number;
  flashlightOn: boolean;
  stamina: number; // 0..1
  exhausted: boolean;
  objective: string;
  prompt: string | null;
  toast: string | null;
  note: string | null;
  fear: number;
  time: number;
  started: boolean;
  /** Death / escape sequence: hide the HUD. */
  cinematic: boolean;
  /** Update 0.3 — F2 debug panel lines, or null when closed. */
  debug: string[] | null;
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
  cinematic: false,
  debug: null,
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
