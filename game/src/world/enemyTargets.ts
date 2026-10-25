// Update 0.9.9 — co-op: one Patient, up to three of you. The brain (enemyAI.ts) thinks about one player
// at a time; each frame the host picks which one (`pickTarget`), and checks every one of you for a catch
// (`catchable`). Pure (tested).
import { ENEMY, EnemyState, PlayerSense, chaseSees, litByBeam, visibility } from './enemyAI';
import { Level, Vec2, dist } from './level';

export interface Hunted {
  id: string;
  sense: PlayerSense;
}

/** Nobody to hunt (all out, down or gone): somewhere it can never see or reach. */
export const NOBODY: PlayerSense = { pos: { x: -1000, z: -1000 }, flashlightOn: false, crouching: false, hidden: true };

/** How much it notices you right now: your beam on it beats being seen, being seen beats nothing. */
function notice(level: Level, e: EnemyState, h: Hunted): number {
  if (litByBeam(level, e, h.sense)) return 2;
  return visibility(level, e, h.sense);
}

/**
 * Who it hunts this frame. Chasing someone it can still see (or nobody else is in view): them. Else
 * whoever it notices most; with nobody in view, the nearest (so its noises, teleports and lures make
 * sense for someone). Null when there's no one.
 */
export function pickTarget(level: Level, e: EnemyState, hunted: Hunted[], current: string | null): Hunted | null {
  if (!hunted.length) return null;
  const scored = hunted.map((h) => ({ h, n: notice(level, e, h), d: dist(e.pos, h.sense.pos) }));
  const cur = scored.find((s) => s.h.id === current);
  const seen = scored.filter((s) => s.n > 0);
  // (Update 0.9.9 — the one it chases it sees anywhere in its line of sight: see `chaseSees`.)
  if (cur && e.mode === 'chase' && (cur.n > 0 || chaseSees(level, e, cur.h.sense) || !seen.length)) return cur.h;
  const pool = seen.length ? seen : scored;
  pool.sort((a, b) => b.n - a.n || a.d - b.d);
  return pool[0].h;
}

/** Everyone it would catch now: in reach and not hidden. It can't catch anyone from the ceiling. */
export function catchable(e: EnemyState, hunted: Hunted[]): string[] {
  if (e.crawl) return [];
  return hunted.filter((h) => !h.sense.hidden && dist(e.pos, h.sense.pos) <= ENEMY.catchRadius).map((h) => h.id);
}

/**
 * Update 0.9.9 — off the host, whether The Patient on your screen has you: in reach, you not hidden, it not
 * on the ceiling nor holding someone. Your own game decides: the host's picture of you is a moment old,
 * and it caught you while it still looked a couple of metres off on yours.
 */
export function catchesYou(e: EnemyState, holding: boolean, you: PlayerSense): boolean {
  return !holding && catchable(e, [{ id: '', sense: you }]).length > 0;
}

/** Where its "teleport away from you" should be measured from: the nearest of you (or anywhere). */
export function nearestPos(e: EnemyState, hunted: Hunted[]): Vec2 {
  let best: Vec2 = NOBODY.pos;
  let d = Infinity;
  for (const h of hunted) {
    const k = dist(e.pos, h.sense.pos);
    if (k < d) {
      d = k;
      best = h.sense.pos;
    }
  }
  return best;
}
