// Update 0.8 — the breaker panel minigame. Hold interact to repair it. Every few seconds of work it
// starts to spark: let go within WARN seconds or it shorts out with a bang (noise The Patient hears,
// you lose some progress and the panel is dead for a moment). Working on it makes a little noise too.
// Pure + seeded (tested); Game.ts drives it, the HUD shows the bar and the warning.
import type { Rng } from '../world/rng';

export const REPAIR = {
  /** Seconds of holding to finish (sparks don't count). */
  seconds: 12,
  /** Seconds of work between sparks (random in this range). */
  sparkEvery: [2.2, 4.2] as [number, number],
  /** Let go within this long after it starts sparking. */
  warn: 0.7,
  /** Shorting out costs this much progress… */
  setback: 0.18,
  /** …and the panel is dead this long (can't work, sparks die down). */
  stun: 1.2,
  /** Noise radii (m): the bang, and the clatter of working, every `workNoiseEvery` s. */
  bangNoise: 22,
  workNoise: 5,
  workNoiseEvery: 1.2,
};

export interface RepairState {
  progress: number;
  /** Work seconds until the next spark. */
  nextSpark: number;
  /** Seconds since it started sparking (−1 = not sparking). */
  warnT: number;
  /** Seconds left dead after a short. */
  stun: number;
  /** Work seconds since the last work noise. */
  sinceNoise: number;
}

export type RepairEvent = 'spark' | 'saved' | 'short' | 'noise' | 'done';

const gap = (rng: Rng) => REPAIR.sparkEvery[0] + rng() * (REPAIR.sparkEvery[1] - REPAIR.sparkEvery[0]);

export function createRepair(rng: Rng): RepairState {
  return { progress: 0, nextSpark: gap(rng), warnT: -1, stun: 0, sinceNoise: 0 };
}

export const repairDone = (s: RepairState) => s.progress >= 1;
export const sparking = (s: RepairState) => s.warnT >= 0;

export function stepRepair(s: RepairState, dt: number, holding: boolean, rng: Rng): { state: RepairState; events: RepairEvent[] } {
  const events: RepairEvent[] = [];
  const n = { ...s };
  if (repairDone(n)) return { state: n, events };
  if (n.stun > 0) {
    n.stun = Math.max(0, n.stun - dt);
    return { state: n, events };
  }
  if (n.warnT >= 0) {
    // Sparking: let go now.
    if (!holding) {
      n.warnT = -1;
      n.nextSpark = gap(rng);
      events.push('saved');
      return { state: n, events };
    }
    n.warnT += dt;
    if (n.warnT >= REPAIR.warn) {
      n.warnT = -1;
      n.progress = Math.max(0, n.progress - REPAIR.setback);
      n.stun = REPAIR.stun;
      n.nextSpark = gap(rng);
      events.push('short');
    }
    return { state: n, events };
  }
  if (!holding) return { state: n, events };
  n.progress = Math.min(1, n.progress + dt / REPAIR.seconds);
  n.sinceNoise += dt;
  if (n.sinceNoise >= REPAIR.workNoiseEvery) {
    n.sinceNoise = 0;
    events.push('noise');
  }
  if (repairDone(n)) {
    events.push('done');
    return { state: n, events };
  }
  n.nextSpark -= dt;
  if (n.nextSpark <= 0) {
    n.warnT = 0;
    events.push('spark');
  }
  return { state: n, events };
}
