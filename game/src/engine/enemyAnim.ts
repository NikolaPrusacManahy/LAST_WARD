// Update 0.2 — which Mixamo clip The Patient plays, and how fast. Pure (no three.js) so it's tested.
import { CRAWL, CrawlState, EnemyMode } from '../world/enemyAI';
import { FACE_DIR, Level, TILE, Vec2, WALL_HEIGHT, cellCenter, stairRunAt, worldToCell } from '../world/level';

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
  /** Update 1.0.2 — tipped about its sideways axis (rad): upright up a stairwell's wall (crawlShaft). */
  tilt?: number;
}

/** Update 1.0.2 — climbing a stairwell on its crawl: where it is drawn (logic x / z on the floor the stairs go
 *  up from), how high its feet are above that floor, and how far it's tipped. */
export interface ShaftPose {
  x: number;
  z: number;
  y: number;
  tilt: number;
}

/** Update 1.0.2 — how long the turn in the top corner (wall onto ceiling) takes, as metres of the climb. */
const INNER_TURN = 0.6;

/**
 * Update 1.0.2 — Nikola: crawling on through a stairwell, "rotate his crawl position up, then normal and
 * continue crawl upstairs". Its middle (the turning point, CRAWL_FLIP_PIVOT from the surface it's on)
 * swings round the edge where the ceiling below stops, climbs the stairwell's end wall upright, turns over
 * in the top corner onto the ceiling upstairs and crawls on along it; coming down, the same backwards, head
 * first. Worked out from how far up the flight it is, so it's the same on every screen (co-op) and both
 * ends meet the ceiling crawl exactly. null when it isn't on a flight of stairs.
 */
export function crawlShaft(level: Level, pos: Vec2, dir: Vec2): ShaftPose | null {
  const run = stairRunAt(level, worldToCell(pos));
  if (!run) return null;
  const d = FACE_DIR[run.dir];
  const L = run.cells.length * TILE;
  const first = cellCenter(run.cells[0]);
  // The bottom edge of the flight: where the ceiling below stops and the stairwell's end wall goes up.
  const bx = first.x - (d.dc * TILE) / 2;
  const bz = first.z - (d.dr * TILE) / 2;
  const along = (pos.x - bx) * d.dc + (pos.z - bz) * d.dr;
  const side = { x: pos.x - bx - d.dc * along, z: pos.z - bz - d.dr * along };
  const P = CRAWL_FLIP_PIVOT;
  const H = WALL_HEIGHT;
  // The path its middle takes: round the edge (a quarter circle), up the wall, the turn in the top corner,
  // along the ceiling upstairs to the far end of the flight.
  const round = (P * Math.PI) / 2;
  const climb = H - P;
  const ceiling = L - P;
  const s = (Math.max(0, Math.min(L, along)) / L) * (round + climb + INNER_TURN + ceiling);
  let turn: number; // 0 = upside down on a ceiling, 1 = upright on the wall
  let out: number; // its middle, this far into the stairwell from the end wall
  let up: number; // and this high above the floor below
  if (s < round) {
    turn = s / round;
    out = P * Math.sin((turn * Math.PI) / 2);
    up = H - P * Math.cos((turn * Math.PI) / 2);
  } else if (s < round + climb) {
    turn = 1;
    out = P;
    up = H + (s - round);
  } else if (s < round + climb + INNER_TURN) {
    turn = 1 - (s - round - climb) / INNER_TURN;
    out = P;
    up = 2 * H - P;
  } else {
    turn = 0;
    out = P + (s - round - climb - INNER_TURN);
    up = 2 * H - P;
  }
  // Going up it tips head up; coming down, head first.
  const climbing = dir.x * d.dc + dir.z * d.dr > 0;
  return { x: bx + side.x + d.dc * out, z: bz + side.z + d.dr * out, y: up - P, tilt: ((climbing ? -1 : 1) * turn * Math.PI) / 2 };
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
