// Update 0.2 — which Mixamo clip The Patient plays, and how fast. Pure (no three.js) so it's tested.
import { CRAWL, CrawlState, EnemyMode } from '../world/enemyAI';
import { WALL_HEIGHT } from '../world/level';

/** 'stare' is menu-only (Update 0.4.3b). */
/** 'grab' / 'throw' — Update 0.6, the first time it catches you. */
/** 'crawl' / 'jumpUp' — Update 0.9.7, up on the ceiling. */
export type EnemyClip = 'idle' | 'walk' | 'run' | 'search' | 'scream' | 'attack' | 'stare' | 'grab' | 'throw' | 'crawl' | 'jumpUp';

/** Ground speed each clip was authored at (measured from the stance foot), m/s. */
export const CLIP_GROUND_SPEED: Record<EnemyClip, number> = {
  idle: 0,
  walk: 1.47,
  run: 2.6,
  search: 0,
  scream: 0,
  attack: 0,
  stare: 0,
  grab: 0,
  throw: 0,
  crawl: 0,
  jumpUp: 0,
};

export const MOVING_THRESHOLD = 0.25; // m/s
/** Update 0.6.4 — this fast it runs whatever its mode (sprinting to the generator). */
export const RUN_THRESHOLD = 4.0; // m/s (0.9.6: 4.0, was 3.4 — its walk is faster now, and stays a walk)

export function chooseEnemyClip(mode: EnemyMode, speed: number, windingUp: boolean): EnemyClip {
  if (mode === 'crawl') return 'crawl'; // (crawlPose picks the clip while it goes up / comes down)
  if (windingUp) return 'scream';
  const moving = speed > MOVING_THRESHOLD;
  if (mode === 'chase') return moving ? 'run' : 'idle';
  if (speed > RUN_THRESHOLD) return 'run';
  if (moving) return 'walk';
  return mode === 'search' ? 'search' : 'idle';
}

/** Playback speed so feet match the ground (clamped so it never looks absurd). */
export function clipTimeScale(clip: EnemyClip, speed: number): number {
  const ref = CLIP_GROUND_SPEED[clip];
  if (clip === 'scream') return 1.6; // fits the AI windup
  if (!ref) return 1;
  return Math.min(2.2, Math.max(0.6, speed / ref)); // 0.9.6: 2.2 (its walk is twice as fast now)
}

/** Update 0.9.7 — the crawl clip's speed on the ceiling (a frantic scuttle; it's in place, so no ground match). */
export const CRAWL_CLIP_SPEED = 2.4;
/** Update 0.9.7 — it turns over about its middle, this high above its feet (m), so it stays in the corridor. */
export const CRAWL_FLIP_PIVOT = 1.1;
/** How far its feet rise (m): turned over about its middle, its hands and feet then touch the ceiling. */
export const CRAWL_LIFT = WALL_HEIGHT - 2 * CRAWL_FLIP_PIVOT;

/**
 * Update 0.9.7 — up on the ceiling: how high it is (0 floor → 1 ceiling), how far it has turned over
 * (0 → 1 = upside down, rolled about its forward axis) and which clip, at what time. Going up: the
 * scream, then the jump clip to its top while it lifts and turns over, into the crawl. Coming down: the
 * same backwards (the jump's push-off played in reverse reads as landing). null = on the floor.
 */
export interface CrawlPose {
  lift: number;
  flip: number;
  clip: EnemyClip;
  /** Jump clip time (s), set directly (it runs forwards going up, backwards coming down). */
  time?: number;
  timeScale: number;
}

export function crawlPose(c: Pick<CrawlState, 'phase' | 't'> | null): CrawlPose | null {
  if (!c) return null;
  const crawl: CrawlPose = { lift: 1, flip: 1, clip: 'crawl', timeScale: CRAWL_CLIP_SPEED };
  if (c.phase === 'on') return crawl;
  if (c.phase === 'up' && c.t < CRAWL.screamSeconds) return { lift: 0, flip: 0, clip: 'scream', timeScale: clipTimeScale('scream', 0) };
  // Jump clip time: forwards going up, backwards coming down.
  const jt = c.phase === 'up' ? Math.min(CRAWL.jumpTop, c.t - CRAWL.screamSeconds) : Math.max(0, CRAWL.jumpTop - c.t);
  const x = Math.min(1, Math.max(0, (jt - CRAWL.liftOff) / (CRAWL.jumpTop - CRAWL.liftOff)));
  const k = x * x * (3 - 2 * x);
  // Most of the way over, it's already in its crawl (it grabs the ceiling / lets go of it).
  if (k > 0.6) return { ...crawl, lift: k, flip: k };
  return { lift: k, flip: k, clip: 'jumpUp', time: jt, timeScale: 0 };
}
