// Update 0.9 — repairing an electrical panel, Dead by Daylight style. Hold interact to work on it. Every
// few seconds of work a warning ticks, then a circle appears with a needle sweeping round it once: press
// the skill-check key (Space) while the needle is in the zone. The small slice at the start of the zone
// is a perfect hit (a progress bonus). Miss, or let it go round, and the panel blows: a bang The Patient
// hears from far away, lost progress and a moment where the panel is dead. Let go of the panel and the
// check is called off. Pure (tested). Times are real seconds (`now`), so what you see is what's judged.
import type { Rng } from '../world/rng';

export const SKILL = {
  /** Seconds of holding to repair one panel (work goes on during checks). */
  repairSeconds: 14,
  /** Seconds of work between checks (random in this range). */
  gap: [2.6, 4.6] as [number, number],
  /** Warning tick → circle appears. */
  lead: 0.8,
  /** One sweep of the needle (s). */
  spin: 1.15,
  /** Where the zone can start (fraction of the circle, clockwise from the top). */
  zoneFrom: [0.38, 0.78] as [number, number],
  /** Zone size and its perfect slice (fractions of the circle). */
  good: 0.13,
  great: 0.035,
  /** Perfect hit: this much extra progress. */
  greatBonus: 0.05,
  /** Miss: progress lost, panel dead for `stun` s. The bang is heard anywhere on the map and The
   *  Patient runs to it (0.9.1). */
  missSetback: 0.12,
  stun: 1.4,
  bangNoise: Infinity,
  /** Update 0.9.1 — throwing a panel's switch: it walks over if it's within this many metres. */
  switchNoise: 14,
  /** Working on it clatters a little (radius m, every s of work). */
  workNoise: 5,
  workNoiseEvery: 1.2,
};

export type Judgement = 'great' | 'good' | 'miss';

/** Needle at `f` (0..1 round the circle) against a zone starting at `zone`. */
export function judge(f: number, zone: number): Judgement {
  if (f >= zone && f < zone + SKILL.great) return 'great';
  if (f >= zone && f < zone + SKILL.good) return 'good';
  return 'miss';
}

export interface Check {
  /** Warning sounded at (s); the needle starts at `spinAt`. */
  spinAt: number;
  /** Zone start (fraction of the circle). */
  zone: number;
}

export interface RepairState {
  /** Seconds of work until the next check. */
  nextCheck: number;
  check: Check | null;
  /** Panel dead until this time (s). */
  deadUntil: number;
  sinceNoise: number;
}

export type RepairEvent = 'warn' | 'great' | 'good' | 'miss' | 'noise' | 'done';

const gap = (rng: Rng) => SKILL.gap[0] + rng() * (SKILL.gap[1] - SKILL.gap[0]);

export function createRepair(rng: Rng): RepairState {
  return { nextCheck: gap(rng), check: null, deadUntil: -1, sinceNoise: 0 };
}

/** Needle position (0..1) at `now`, or null while it's only the warning. */
export function needle(c: Check, now: number): number | null {
  return now < c.spinAt ? null : (now - c.spinAt) / SKILL.spin;
}

export interface RepairInput {
  dt: number;
  now: number;
  holding: boolean;
  /** Skill-check key pressed this frame. */
  press: boolean;
}

/** One frame of work on a panel whose progress is `progress`. */
export function stepRepair(progress: number, s: RepairState, i: RepairInput, rng: Rng): { progress: number; state: RepairState; events: RepairEvent[] } {
  const events: RepairEvent[] = [];
  const n = { ...s };
  let p = progress;
  if (p >= 1) return { progress: 1, state: n, events };
  if (i.now < n.deadUntil) return { progress: p, state: { ...n, check: null }, events };
  if (n.check) {
    if (!i.holding) {
      // Walked away / let go: the check is called off.
      n.check = null;
      n.nextCheck = Math.max(n.nextCheck, 0.8);
      return { progress: p, state: n, events };
    }
    // The work goes on while the check runs (as in Dead by Daylight).
    p = Math.min(1, p + i.dt / SKILL.repairSeconds);
    if (p >= 1) {
      n.check = null;
      events.push('done');
      return { progress: p, state: n, events };
    }
    const f = needle(n.check, i.now);
    let result: Judgement | null = null;
    if (i.press && f !== null) result = judge(f, n.check.zone);
    else if (i.press) result = 'miss'; // pressed before the circle even showed
    else if (f !== null && f >= 1) result = 'miss'; // let it go all the way round
    if (result) {
      n.check = null;
      n.nextCheck = gap(rng);
      if (result === 'miss') {
        p = Math.max(0, p - SKILL.missSetback);
        n.deadUntil = i.now + SKILL.stun;
      } else if (result === 'great') {
        p = Math.min(1, p + SKILL.greatBonus);
      }
      events.push(result);
      if (p >= 1) events.push('done');
    }
    return { progress: p, state: n, events };
  }
  if (!i.holding) return { progress: p, state: n, events };
  p = Math.min(1, p + i.dt / SKILL.repairSeconds);
  n.sinceNoise += i.dt;
  if (n.sinceNoise >= SKILL.workNoiseEvery) {
    n.sinceNoise = 0;
    events.push('noise');
  }
  if (p >= 1) {
    events.push('done');
    return { progress: p, state: n, events };
  }
  n.nextCheck -= i.dt;
  if (n.nextCheck <= 0) {
    n.check = { spinAt: i.now + SKILL.lead, zone: SKILL.zoneFrom[0] + rng() * (SKILL.zoneFrom[1] - SKILL.zoneFrom[0]) };
    events.push('warn');
  }
  return { progress: p, state: n, events };
}

/** Pausing (or anything that takes you away from the panel) calls off the check. */
export const cancelCheck = (s: RepairState): RepairState => (s.check ? { ...s, check: null, nextCheck: 0.8 } : s);
