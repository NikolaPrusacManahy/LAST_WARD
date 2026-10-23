import { useSyncExternalStore } from 'react';
import type { HudState, HudStore } from '../engine/hudStore';

/** Subscribes a component to the engine's HUD values. */
export function useHud(store: HudStore): HudState {
  return useSyncExternalStore(store.subscribe, store.get);
}
