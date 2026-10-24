// "The Patient" — enemy brain. Pure state machine: patrol → investigate → chase → search.
// Update 0.9.7 — and now and then, from a corridor patrol: crawl (up on the ceiling, see CRAWL).
// The engine calls stepEnemy() every frame and only renders the result.
import { Cell, Level, TILE, Vec2, cellCenter, crossPortal, dist, floorCells, floorOfRow, floorStride, isCorridor, isSolid, worldToCell, sameCell } from './level';
import { findPath } from './pathfinding';
import { lineOfSight } from './lineOfSight';
import { clearLine, moveWithCollision, overlapsWall } from './collision';
import { Rng } from './rng';

/** Update 0.9.7 — 'crawl': up on the ceiling ("search by crawling", see CRAWL). */
export type EnemyMode = 'patrol' | 'investigate' | 'chase' | 'search' | 'crawl';
/** Update 0.5.4 — 'teleported': moved to another corner after a minute without finding you. */
export type EnemyEvent = 'spotted' | 'lost' | 'heard' | 'caught' | 'teleported'
  /** Update 0.9.6 — checking a locker: door open / shut, and you were in it. */
  | 'lockerOpen' | 'lockerClose' | 'foundYou'
  /** Update 0.9.7 — it screams and goes up on the ceiling; back on the floor. */
  | 'crawlUp' | 'landed';

export const ENEMY = {
  /** Update 0.9.6 — it walked twice as fast (patrol 1.5 → 3.0, as fast as you walk), searching and going
   *  to look at a noise too. Update 0.9.6.2 — back to its old walk (it was too hard to get away from).
   *  The chase is unchanged. Update 0.9.7 — on the ceiling it crawls at twice its run. */
  speed: { patrol: 1.5, investigate: 2.6, chase: 4.3, search: 2.1, crawl: 8.6 } as Record<EnemyMode, number>,
  /** Update 0.9.6 — it hears everything twice as far. */
  hearingMul: 2,
  /** Update 0.9.6 — your flashlight on its body: it knows where you are at once (0.9.8: unless its back is to you).
   *  Your beam's half-angle (rad) and how far it counts (m). */
  beamHalf: 0.55,
  beamRange: 30,
  /** Update 0.9.6 — after running to a thrown thing: you within this far (m) and it comes for you. */
  lureRadius: 5,
  /** Update 0.9.6 — locker checks while searching: lockers this close (m) to where it lost you, at most
   *  once per `lockerRecheck` s each; door open for `lockerCheckSeconds`. */
  lockerCheckRadius: 9,
  lockerRecheck: 25,
  lockerCheckSeconds: 1,
  /** Each fuse collected makes it this much faster (it knows what you're doing).
   *  Update 0.9.6.2 — 7% → 4%, and only while it chases you (`enemySpeed`). */
  ragePerFuse: 0.04,
  catchRadius: 1.1,
  /** Update 0.5.2 — collision size of its body (was 0.35, its shoulders went into walls). */
  bodyRadius: 0.55,
  fovHalf: (65 * Math.PI) / 180,
  /** Update 0.4.4 — brighter ward + 1.3× flashlight: it sees you 1.3× further (was 16 / 8). */
  viewDistLight: 16 * 1.3,
  viewDistDark: 8 * 1.3,
  crouchSightMul: 0.7,
  /** Update 0.9 — running makes you easier to spot: it sees you this much further. */
  runSightMul: 1.3,
  senseRadius: 3, // this close it notices you at its sides too (0.9.8: not behind it; it used to at any angle)
  /** Update 0.9.8 — up close, or with your beam on it, it notices you in front and at its sides (this far
   *  round from where it faces, rad), never behind it: the flashlight on its back gave you away at once. */
  sideHalf: Math.PI / 2,
  alertRise: 2.4,
  alertDecay: 0.5,
  memorySeconds: 1.2, // keeps tracking you briefly after losing sight
  /** Update 0.9.8 — a safety net: this long after losing sight of you it gives up the chase wherever it is. */
  giveUpSeconds: 10,
  searchSeconds: 7,
  repathSeconds: 0.4,
  muffledNoiseMul: 0.6, // noise through walls carries less
  /** Update 0.2 — it screams before it charges: your head start. */
  windupSeconds: 1.0,
  /** Update 0.5.4 — without spotting you for this long it vanishes and turns up at another corner (0.6.4: 35 s, was 60). */
  teleportAfter: 35,
  /** Never teleports from or to anywhere you can see, or closer than this to you (m). */
  teleportMinDist: 14,
  /** Patrols within this many tiles of its home corner (0.6.4: 12, was 6). */
  homeRadiusTiles: 12,
  /** Update 0.6.4 — no tiny back-and-forth: each patrol leg is at least this many cells long
   *  (legs average ~2× the old ones, so it wanders into you by surprise). */
  patrolMinCells: 12,
  /** How many random cells it tries for a long enough leg (else the longest it found). */
  patrolTries: 12,
  /** Start corner must be at least this far from the player's start (m). */
  spawnMinDist: 20,
};

/**
 * Update 0.9.7 — "search by crawling". Now and then, patrolling a corridor, it screams, jumps, turns over
 * onto the ceiling and crawls along the corridors (never into a room) at twice its run, for 15–20 s.
 * Up there it can't catch you. If it sees you (or your beam) or hears your footsteps, it drops (the jump
 * played backwards) and chases you. Any other noise (a panel blowing, a switch, repair work, something you
 * threw): it crawls on to the corridor cell nearest it, the room's doorway, drops, and runs to it. No
 * teleport while it's up there, going up or coming down. (Speed: `ENEMY.speed.crawl`.)
 */
export const CRAWL = {
  /** It screams before the jump (s). */
  screamSeconds: 1.0,
  /** The jump clip's top (s): it's on the ceiling by then. Coming down plays the clip from here back to 0. */
  jumpTop: 1.58,
  /** Jump clip time it leaves the floor and starts turning over (s). */
  liftOff: 0.95,
  /** How long it crawls if it finds nothing (s). */
  minSeconds: 15,
  maxSeconds: 20,
  /** Never in the first minute of a run (s). */
  firstWait: 60,
  /** Then this long between two crawls (s). */
  cooldownMin: 40,
  cooldownMax: 70,
  /** Chance per second while it patrols a corridor once the cooldown is over (~12 s on average). */
  chancePerSecond: 0.08,
};
export const crawlUpSeconds = CRAWL.screamSeconds + CRAWL.jumpTop;
export const crawlDownSeconds = CRAWL.jumpTop;

export interface EnemyState {
  mode: EnemyMode;
  pos: Vec2;
  dir: Vec2;
  path: Cell[];
  pathIndex: number;
  goal: Vec2 | null;
  lastKnown: Vec2 | null;
  alert: number;
  modeTime: number;
  sinceSeen: number;
  idle: number;
  repath: number;
  rage: number;
  /** Seconds left of the scream before the chase starts. */
  windup: number;
  /** Update 0.5.4 — the corner it patrols around. */
  home: Cell;
  /** Seconds since it last spotted you (chasing counts as spotting). */
  sinceSpotted: number;
  /** Update 0.6.4 — sprinting to the generator after the power came on (cleared on arrival / mode change). */
  rush: boolean;
  /** Update 0.9.6 — running to something you threw: if you're near when it gets there, it chases you. */
  lure: boolean;
  /** Update 0.9.6 — checking a locker: walking to it, then the door open. */
  check: { locker: number; phase: 'going' | 'open'; t: number } | null;
  /** When it last checked each locker (its own clock, s). */
  checked: number[];
  clock: number;
  /** Update 0.9.7 — up on the ceiling (mode 'crawl'), else null. */
  crawl: CrawlState | null;
  /** Seconds before it may go up on the ceiling again. */
  crawlCooldown: number;
}

/** Update 0.9.7 — on the ceiling: going up, crawling the corridors, or dropping back down. */
export interface CrawlState {
  phase: 'up' | 'on' | 'down';
  /** Seconds into this phase. */
  t: number;
  /** Seconds of crawling left before it comes down on its own. */
  left: number;
  /** What it does once it's down: patrol again, chase you, run to `noise`, or the generator summon. */
  then: 'patrol' | 'chase' | 'noise' | 'generator';
  /** A noise it heard up there: it crawls to the corridor cell nearest it, drops, and runs to it. */
  noise: Noise | null;
}

export interface PlayerSense {
  pos: Vec2;
  flashlightOn: boolean;
  crouching: boolean;
  /** Update 0.9 — sprinting (it sees you further). */
  running?: boolean;
  /** Update 0.9.6 — where you look, and whether a real flashlight beam is on (goggles don't count). */
  facing?: Vec2;
  beam?: boolean;
  /** Update 0.9.5 — in a locker it didn't see you get into: it can't see you or catch you. */
  hidden?: boolean;
}

export interface Noise {
  pos: Vec2;
  radius: number;
  /** Update 0.9.1 — something it runs to (a panel blowing), not one it wanders over to check. */
  run?: boolean;
  /** Update 0.9.6 — something you threw: it runs there and comes for you if you're close by. */
  lure?: boolean;
  /** Update 0.9.7 — your footsteps (it's you, not something you did): on the ceiling it drops and chases. */
  step?: boolean;
}

export function createEnemy(level: Level): EnemyState {
  return {
    mode: 'patrol',
    pos: cellCenter(level.enemyStart),
    dir: { x: 0, z: 1 },
    path: [],
    pathIndex: 0,
    goal: null,
    lastKnown: null,
    alert: 0,
    modeTime: 0,
    sinceSeen: Infinity,
    idle: 2,
    repath: 0,
    rage: 0,
    windup: 0,
    home: level.enemyStart,
    sinceSpotted: 0,
    rush: false,
    lure: false,
    check: null,
    checked: [],
    clock: 0,
    crawl: null,
    crawlCooldown: CRAWL.firstWait, // never in the first minute
  };
}

/** Update 0.5.4 — the open cell nearest each corner of the map (its four spawn / teleport points).
 *  Update 0.7 — four per floor. */
export function cornerCells(level: Level): Cell[] {
  const all = floorCells(level);
  const out: Cell[] = [];
  for (let f = 0; f < level.floors; f++) {
    const cells = all.filter((x) => floorOfRow(level, x.row) === f);
    const top = f * floorStride(level);
    const corners = [
      { col: 0, row: top },
      { col: level.cols - 1, row: top },
      { col: 0, row: top + level.floorRows - 1 },
      { col: level.cols - 1, row: top + level.floorRows - 1 },
    ];
    out.push(...corners.map((c) => cells.reduce((best, x) => (Math.abs(x.col - c.col) + Math.abs(x.row - c.row) < Math.abs(best.col - c.col) + Math.abs(best.row - c.row) ? x : best))));
  }
  return out;
}

/** Update 0.7 — ENEMY numbers with this level's tweaks (a big level can make it keep tracking you longer). */
export function tuningFor(level: Level) {
  return {
    memorySeconds: level.ai.memorySeconds ?? ENEMY.memorySeconds,
    searchSeconds: level.ai.searchSeconds ?? ENEMY.searchSeconds,
    searchRadiusTiles: level.ai.searchRadiusTiles ?? 3,
  };
}

/** Update 0.5.4 — start of a run: one of the four corners, never the one by the player. */
export function spawnAtCorner(level: Level, rng: Rng, playerStart: Vec2): EnemyState {
  const far = cornerCells(level).filter((c) => dist(cellCenter(c), playerStart) >= ENEMY.spawnMinDist);
  const pick = far[Math.floor(rng() * far.length)] ?? level.enemyStart;
  const e = createEnemy(level);
  e.pos = cellCenter(pick);
  e.home = pick;
  return e;
}

/** Hidden from the player: no line of sight, or far into the dark. */
const outOfSight = (level: Level, a: Vec2, player: Vec2) => !lineOfSight(level, a, player) || dist(a, player) > 25;

/**
 * Update 0.6 — after throwing you it vanishes to a corner: the farthest one you can't see
 * (any farthest corner if none is hidden). Fresh patrol, fresh clock.
 */
export function teleportAway(level: Level, e: EnemyState, player: Vec2): void {
  const corners = cornerCells(level).sort((a, b) => dist(cellCenter(b), player) - dist(cellCenter(a), player));
  const to = corners.find((c) => outOfSight(level, cellCenter(c), player)) ?? corners[0];
  e.pos = cellCenter(to);
  e.home = to;
  e.mode = 'patrol';
  e.modeTime = 0;
  e.goal = null;
  e.path = [];
  e.lastKnown = null;
  e.alert = 0;
  e.windup = 0;
  e.idle = 2;
  e.sinceSpotted = 0;
  e.sinceSeen = Infinity;
  e.rush = false;
  e.lure = false;
  e.check = null;
  e.crawl = null;
}

/** Update 0.6.4 — the open cell next to the generator (the machine itself is solid, so no path ends on it). */
export function generatorApproach(level: Level): Cell {
  const g = level.generator;
  const near = [
    { col: g.col, row: g.row - 1 },
    { col: g.col, row: g.row + 1 },
    { col: g.col - 1, row: g.row },
    { col: g.col + 1, row: g.row },
  ].filter((c) => !isSolid(level, c.col, c.row));
  if (near.length) return near[0];
  return floorCells(level).reduce((best, c) => (dist(cellCenter(c), cellCenter(g)) < dist(cellCenter(best), cellCenter(g)) ? c : best));
}

/**
 * Update 0.6.4 — the generator comes on: it vanishes to a random corner (one far from you), screams,
 * then sprints for the generator. Sight still turns it into a chase; noises don't distract it.
 */
export function summonToGenerator(level: Level, e: EnemyState, player: Vec2, rng: Rng): Cell {
  const corners = cornerCells(level);
  const far = corners.filter((c) => dist(cellCenter(c), player) >= ENEMY.teleportMinDist);
  const pool = far.length ? far : corners;
  const to = pool[Math.floor(rng() * pool.length)];
  teleportAway(level, e, player); // resets the brain (patrol, alert, clocks)…
  e.pos = cellCenter(to); // …at the corner we picked
  e.home = to;
  e.mode = 'investigate';
  e.modeTime = 0;
  e.windup = ENEMY.windupSeconds;
  e.idle = 0;
  goTo(level, e, cellCenter(generatorApproach(level)));
  e.rush = true;
  const g = cellCenter(level.generator);
  const d = dist(e.pos, g) || 1;
  e.dir = { x: (g.x - e.pos.x) / d, z: (g.z - e.pos.z) / d };
  return to;
}

/** Update 0.9.6 — busy with something it has to finish before it may teleport.
 *  Update 0.9.7 — being on the ceiling (going up, crawling, coming down) counts too. */
export function onTask(e: EnemyState): boolean {
  return !!e.check || (e.lure && e.mode === 'investigate') || !!e.crawl;
}

/** Update 0.5.4 — after a minute without finding you, move to another corner you can't see. */
function tryTeleport(level: Level, e: EnemyState, player: Vec2, rng: Rng): boolean {
  if (e.mode === 'chase' || e.sinceSpotted < ENEMY.teleportAfter) return false;
  // Update 0.9.6 — never in the middle of a task: checking a locker, or running to something you threw.
  // It finishes the task first, then teleports.
  if (onTask(e)) return false;
  if (dist(e.pos, player) < ENEMY.teleportMinDist || !outOfSight(level, e.pos, player)) return false;
  const options = cornerCells(level).filter(
    (c) => !sameCell(c, e.home) && dist(cellCenter(c), player) >= ENEMY.teleportMinDist && outOfSight(level, cellCenter(c), player),
  );
  if (!options.length) return false;
  const to = options[Math.floor(rng() * options.length)];
  e.pos = cellCenter(to);
  e.home = to;
  e.mode = 'patrol';
  e.modeTime = 0;
  e.goal = null;
  e.path = [];
  e.lastKnown = null;
  e.alert = 0;
  e.idle = 1;
  e.sinceSpotted = 0;
  e.rush = false; // Update 0.9.6 — fix: it used to keep running (rush) the whole game after teleporting mid-sprint
  e.lure = false;
  e.check = null;
  return true;
}

/** 0 = can't see you, 1 = sees you clearly. */
export function visibility(level: Level, e: EnemyState, p: PlayerSense): number {
  if (p.hidden) return 0;
  const d = dist(e.pos, p.pos);
  let view = p.flashlightOn ? ENEMY.viewDistLight : ENEMY.viewDistDark;
  if (p.crouching) view *= ENEMY.crouchSightMul;
  if (p.running) view *= ENEMY.runSightMul;
  if (d > view) return 0;
  if (d > 0.01) {
    const toP = { x: (p.pos.x - e.pos.x) / d, z: (p.pos.z - e.pos.z) / d };
    const dot = toP.x * e.dir.x + toP.z * e.dir.z;
    // Its view cone; up close, its sides too. Update 0.9.8 — never behind it.
    if (Math.acos(Math.max(-1, Math.min(1, dot))) > (d > ENEMY.senseRadius ? ENEMY.fovHalf : ENEMY.sideHalf)) return 0;
  }
  if (!lineOfSight(level, e.pos, p.pos)) return 0;
  return Math.min(1, (1 - d / view) * 1.6 + 0.2);
}

export function heardNoise(level: Level, e: EnemyState, n: Noise): boolean {
  const d = dist(e.pos, n.pos);
  const r = n.radius * ENEMY.hearingMul; // Update 0.9.6 — twice as far
  if (d > r) return false;
  return lineOfSight(level, e.pos, n.pos) || d <= r * ENEMY.muffledNoiseMul;
}

/** Update 0.9.6 — your flashlight beam is on it (and nothing's in the way).
 *  Update 0.9.8 — and you're in front of it or at its side: shining it on its back gives nothing away. */
export function litByBeam(level: Level, e: EnemyState, p: PlayerSense): boolean {
  if (!p.beam || !p.facing || p.hidden) return false;
  const d = dist(e.pos, p.pos);
  if (d > ENEMY.beamRange || d < 0.01) return false;
  const to = { x: (e.pos.x - p.pos.x) / d, z: (e.pos.z - p.pos.z) / d };
  if (-(to.x * e.dir.x + to.z * e.dir.z) < Math.cos(ENEMY.sideHalf) - 1e-9) return false; // you're behind it
  const dot = to.x * p.facing.x + to.z * p.facing.z;
  // Its body is ~0.5 m wide: count it lit if the beam cone reaches its edge.
  const half = ENEMY.beamHalf + Math.atan2(ENEMY.bodyRadius, d);
  return Math.acos(Math.max(-1, Math.min(1, dot))) <= half && lineOfSight(level, p.pos, e.pos);
}

function setMode(e: EnemyState, mode: EnemyMode) {
  if (e.mode !== mode) {
    e.mode = mode;
    e.modeTime = 0;
    e.rush = false;
    e.lure = false;
    e.check = null;
  }
}

/** Update 0.9.6 — start checking the nearest locker to `near` it hasn't looked in lately, if any. */
function startLockerCheck(level: Level, e: EnemyState, lockers: LockerSpot[] | undefined, near: Vec2) {
  if (!lockers?.length) return;
  let best = -1;
  let bestD = ENEMY.lockerCheckRadius;
  lockers.forEach((l, i) => {
    const d = dist(l.center, near);
    const last = e.checked[i];
    if (d <= bestD && (last === undefined || e.clock - last >= ENEMY.lockerRecheck)) {
      best = i;
      bestD = d;
    }
  });
  if (best < 0) return;
  e.check = { locker: best, phase: 'going', t: 0 };
  goTo(level, e, lockers[best].stand);
}

/** Update 0.5.2 — pull a point in from the walls so its body fits there (a noise right by a wall). */
function roomFor(level: Level, p: Vec2): Vec2 {
  const r = ENEMY.bodyRadius;
  if (!overlapsWall(level, p, r)) return { ...p };
  const c = cellCenter(worldToCell(p));
  for (let t = 0.1; t <= 1; t += 0.1) {
    const q = { x: p.x + (c.x - p.x) * t, z: p.z + (c.z - p.z) * t };
    if (!overlapsWall(level, q, r)) return q;
  }
  return c;
}

function goTo(level: Level, e: EnemyState, target: Vec2) {
  e.goal = roomFor(level, target);
  e.path = findPath(level, worldToCell(e.pos), worldToCell(target));
  // Skip its own cell's centre only if it can walk straight to the next one without clipping a corner.
  // Update 0.7 — or if the next step is up / down the stairs (through the portal right beside it):
  // walking back to the centre first, every re-plan, kept it from ever reaching the top step's portal.
  const crossing = e.path.length > 1 && (Math.abs(e.path[1].col - e.path[0].col) > 1 || Math.abs(e.path[1].row - e.path[0].row) > 1);
  e.pathIndex = e.path.length > 1 && (crossing || clearLine(level, e.pos, cellCenter(e.path[1]), ENEMY.bodyRadius)) ? 1 : 0;
  // Update 0.9.8 — already in the target's cell: straight to it if its body fits. Walking to the cell's
  // middle first, every re-plan (each 0.4 s in a chase), left it going back and forth, never getting to a
  // spot near the cell's edge (in front of a locker, by a wall) until it saw you again.
  if (e.path.length === 1 && e.goal && clearLine(level, e.pos, e.goal, ENEMY.bodyRadius)) e.pathIndex = 1;
  e.repath = ENEMY.repathSeconds;
  if (!e.path.length) e.goal = null; // unreachable: never walk through walls

}

function pickWanderGoal(level: Level, e: EnemyState, rng: Rng, near: Vec2 | null, radiusTiles: number) {
  let cells = floorCells(level);
  if (near) {
    const c = worldToCell(near);
    const local = cells.filter((x) => Math.abs(x.col - c.col) <= radiusTiles && Math.abs(x.row - c.row) <= radiusTiles);
    if (local.length) cells = local;
  }
  const here = worldToCell(e.pos);
  const options = cells.filter((c) => !sameCell(c, here));
  const pick = options[Math.floor(rng() * options.length)] ?? here;
  goTo(level, e, cellCenter(pick));
}

/** Update 0.6.4 — a patrol leg: a cell near home at least `patrolMinCells` of path away (else the longest tried). */
function pickPatrolGoal(level: Level, e: EnemyState, rng: Rng) {
  const home = e.home;
  const r = ENEMY.homeRadiusTiles;
  const here = worldToCell(e.pos);
  let cells = floorCells(level).filter((x) => Math.abs(x.col - home.col) <= r && Math.abs(x.row - home.row) <= r && !sameCell(x, here));
  if (!cells.length) cells = floorCells(level).filter((x) => !sameCell(x, here));
  let best: Cell | null = null;
  let bestLen = -1;
  for (let i = 0; i < ENEMY.patrolTries; i++) {
    const c = cells[Math.floor(rng() * cells.length)];
    if (!c) break;
    const len = findPath(level, here, c).length;
    if (len > bestLen) {
      best = c;
      bestLen = len;
    }
    if (len >= ENEMY.patrolMinCells) break;
  }
  goTo(level, e, cellCenter(best ?? here));
}

/** Moves along the path. Returns true when the goal is reached. */
function followPath(level: Level, e: EnemyState, speed: number, dt: number): boolean {
  let budget = speed * dt;
  let guard = 0;
  while (budget > 0 && guard++ < 64) {
    let wp = e.pathIndex < e.path.length ? cellCenter(e.path[e.pathIndex]) : e.goal;
    if (!wp) return true;
    // Update 0.7 — the next waypoint is on another floor: walk into the stairs' portal cell first.
    if (level.portals.length && e.pathIndex < e.path.length) {
      const next = e.path[e.pathIndex];
      const here = worldToCell(e.pos);
      if (Math.abs(next.col - here.col) > 1 || Math.abs(next.row - here.row) > 1) {
        const portal = level.portals.find((p) => sameCell(p.to, next));
        if (portal) wp = cellCenter(portal.from);
      }
    }
    const d = dist(e.pos, wp);
    if (d < 0.05) {
      if (e.pathIndex >= e.path.length) return true;
      e.pathIndex++;
      continue;
    }
    const step = Math.min(budget, d);
    const dir = { x: (wp.x - e.pos.x) / d, z: (wp.z - e.pos.z) / d };
    e.pos = crossPortal(level, { x: e.pos.x + dir.x * step, z: e.pos.z + dir.z * step }).pos;
    turnToward(e, dir, dt);
    budget -= step;
  }
  return false;
}

/**
 * Turns its facing toward `dir` (eased). Update 0.9.6 — by angle: blending the two vectors never turned
 * it when the new way was straight behind it (they cancel out), so after a teleport or a U-turn it
 * walked backwards down the corridor. Now it always turns round.
 */
export function turnToward(e: EnemyState, dir: Vec2, dt: number) {
  const k = Math.min(1, dt * 8);
  const from = Math.atan2(e.dir.x, e.dir.z);
  let d = Math.atan2(dir.x, dir.z) - from;
  d = Math.atan2(Math.sin(d), Math.cos(d));
  if (Math.abs(d) > Math.PI - 0.05) d = Math.PI - 0.05; // dead behind: pick a side and turn
  const a = from + d * k;
  e.dir = { x: Math.sin(a), z: Math.cos(a) };
}

/** Update 0.9.6 — a locker it can check: its middle, and where it stands to open it. */
export interface LockerSpot {
  center: Vec2;
  stand: Vec2;
}

export interface StepInput {
  dt: number;
  player: PlayerSense;
  noise: Noise | null;
  fuses: number;
  /** Update 0.9.6 — the lockers, and the one you're hiding in (if any). */
  lockers?: LockerSpot[];
  playerLocker?: number | null;
}

const FOUR = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;

/** Update 0.9.7 — the corridor cell nearest `p` by walking (a room's doorway, from inside the room). */
export function nearestCorridorCell(level: Level, p: Vec2): Cell {
  const start = worldToCell(p);
  const open = (c: Cell) => !isSolid(level, c.col, c.row);
  // A noise on a wall (a panel) starts from the floor beside it.
  const queue: Cell[] = open(start) ? [start] : FOUR.map(([dc, dr]) => ({ col: start.col + dc, row: start.row + dr })).filter(open);
  const seen = new Set<number>();
  for (let i = 0; i < queue.length; i++) {
    const c = queue[i];
    const k = c.row * level.cols + c.col;
    if (seen.has(k)) continue;
    seen.add(k);
    if (isCorridor(level, c)) return c;
    for (const [dc, dr] of FOUR) {
      const n = { col: c.col + dc, row: c.row + dr };
      if (open(n)) queue.push(n);
    }
  }
  return start;
}

/** Update 0.9.7 — a path along the corridor ceilings only. */
function goToCorridor(level: Level, e: EnemyState, cell: Cell) {
  e.path = findPath(level, worldToCell(e.pos), cell, level.corridor);
  e.pathIndex = e.path.length > 1 ? 1 : 0;
  e.goal = e.path.length ? cellCenter(cell) : null;
  e.repath = ENEMY.repathSeconds;
}

function startCrawl(e: EnemyState, rng: Rng) {
  setMode(e, 'crawl');
  e.crawl = { phase: 'up', t: 0, left: CRAWL.minSeconds + rng() * (CRAWL.maxSeconds - CRAWL.minSeconds), then: 'patrol', noise: null };
  e.path = [];
  e.goal = null;
  e.idle = 0;
}

/**
 * Update 0.9.7 — the generator came on while it's on the ceiling: it drops first, then the usual summon
 * (vanish to a corner, scream, sprint for the generator). False if it isn't up there.
 */
export function dropFromCeiling(e: EnemyState): boolean {
  if (!e.crawl) return false;
  e.crawl.then = 'generator';
  return true;
}

/** Update 0.9.7 — one frame up on the ceiling. `seen`: it spotted you (as it would on the floor). */
function stepCrawl(level: Level, e: EnemyState, input: StepInput, seen: boolean, events: EnemyEvent[], rng: Rng) {
  const c = e.crawl!;
  const { dt, player, noise } = input;
  c.t += dt;
  const urgent = c.then === 'chase' || c.then === 'generator';
  // You: it sees you, or hears your footsteps → down, and after you. (Going up it's committed: it acts
  // on it once it's up there.)
  if (seen || (noise?.step && heardNoise(level, e, noise))) {
    if (!urgent) {
      c.then = 'chase';
      events.push('spotted');
    }
    if (c.then === 'chase') e.lastKnown = seen ? { ...player.pos } : { ...noise!.pos };
  } else if (noise && !noise.step && c.then === 'patrol' && heardNoise(level, e, noise)) {
    // Something you did: crawl over to it first. (The first one counts; it doesn't turn aside after.)
    c.then = 'noise';
    c.noise = { ...noise, pos: { ...noise.pos } };
    events.push('heard');
    if (c.phase === 'on') goToCorridor(level, e, nearestCorridorCell(level, noise.pos));
  }

  switch (c.phase) {
    case 'up':
      if (c.t >= crawlUpSeconds) {
        c.t = 0;
        if (c.then === 'chase' || c.then === 'generator') c.phase = 'down';
        else {
          c.phase = 'on';
          if (c.noise) goToCorridor(level, e, nearestCorridorCell(level, c.noise.pos));
          else startRoute(level, e, rng);
        }
      }
      break;
    case 'on': {
      if (c.then === 'chase' || c.then === 'generator') {
        c.phase = 'down';
        c.t = 0;
        break;
      }
      const speed = enemySpeed(e);
      if (c.noise) {
        if (followPath(level, e, speed, dt)) {
          c.phase = 'down';
          c.t = 0;
        }
        break;
      }
      c.left -= dt;
      // Its time is up, or (just in case) the route ran out: down it comes.
      if (c.left <= 0 || followPath(level, e, speed, dt)) {
        c.phase = 'down';
        c.t = 0;
      }
      break;
    }
    case 'down':
      if (c.t >= crawlDownSeconds) land(level, e, input, events, rng);
      break;
  }
}

/**
 * Update 0.9.7 — its whole route for this crawl, worked out the moment it's up there: from where it is,
 * always on along the corridors to the nearest stretch it hasn't crawled yet (a random way at a fork), for
 * `metres`. So in the time it has it sweeps as many different corridors as it can, and all of them if
 * there's time, rather than wandering back and forth. (Once every corridor is done, it goes round again.)
 */
export function planCrawlRoute(level: Level, from: Cell, metres: number, rng: Rng): Cell[] {
  const key = (c: Cell) => c.row * level.cols + c.col;
  const cellOf = (k: number) => ({ col: k % level.cols, row: Math.floor(k / level.cols) });
  const total = level.corridor.filter(Boolean).length;
  const cells = Math.ceil(metres / TILE) + 1;
  const route: Cell[] = [from];
  const crawled = new Set([key(from)]);
  while (route.length < cells) {
    const here = route[route.length - 1];
    if (crawled.size >= total) crawled.clear();
    // Along the corridors to the nearest cell it hasn't crawled.
    const back = new Map([[key(here), -1]]);
    const queue = [here];
    let found = -1;
    for (let i = 0; i < queue.length && found < 0; i++) {
      const ways = [...FOUR].sort(() => rng() - 0.5);
      for (const [dc, dr] of ways) {
        const n = { col: queue[i].col + dc, row: queue[i].row + dr };
        const k = key(n);
        if (!isCorridor(level, n) || back.has(k)) continue;
        back.set(k, key(queue[i]));
        if (!crawled.has(k)) {
          found = k;
          break;
        }
        queue.push(n);
      }
    }
    if (found < 0) break; // a corridor with nowhere to go
    const leg: Cell[] = [];
    for (let k = found; k !== key(here); k = back.get(k)!) leg.push(cellOf(k));
    for (const c of leg.reverse()) {
      route.push(c);
      crawled.add(key(c));
    }
  }
  return route.slice(0, cells);
}

/** Update 0.9.7 — up on the ceiling: its route for all the crawling time it has left. */
function startRoute(level: Level, e: EnemyState, rng: Rng) {
  const c = e.crawl!;
  // A cell or two more than the time allows: the clock, not the route, says when it drops.
  e.path = planCrawlRoute(level, worldToCell(e.pos), c.left * enemySpeed(e) + 2 * TILE, rng);
  e.pathIndex = e.path.length > 1 ? 1 : 0;
  e.goal = cellCenter(e.path[e.path.length - 1]);
  e.repath = ENEMY.repathSeconds;
}

/** Update 0.9.7 — back on the floor: patrol, chase you, run to the noise, or the generator summon. */
function land(level: Level, e: EnemyState, input: StepInput, events: EnemyEvent[], rng: Rng) {
  const c = e.crawl!;
  e.crawl = null;
  e.crawlCooldown = CRAWL.cooldownMin + rng() * (CRAWL.cooldownMax - CRAWL.cooldownMin);
  e.path = [];
  e.goal = null;
  e.windup = 0;
  events.push('landed');
  if (c.then === 'generator') {
    summonToGenerator(level, e, input.player.pos, rng);
  } else if (c.then === 'chase') {
    setMode(e, 'chase'); // the drop was your head start: no scream before it runs
    e.alert = 1;
    e.lastKnown = e.lastKnown ?? { ...input.player.pos };
  } else if (c.then === 'noise' && c.noise) {
    setMode(e, 'investigate');
    goTo(level, e, c.noise.pos);
    e.rush = true; // it runs there, whether it sees you or not
    e.lure = !!c.noise.lure;
  } else {
    setMode(e, 'patrol');
    e.idle = 0.5;
  }
}

/**
 * Update 0.9.6.2 — how fast it moves. The fuses you've found (`rage`) only speed up the chase: at 7% on
 * every mode, four fuses put its chase past your sprint and its patrol past your walk. Rushing somewhere
 * (the generator, a blown panel, a thrown thing) is plain chase speed.
 */
export function enemySpeed(e: Pick<EnemyState, 'mode' | 'rush' | 'rage'>): number {
  return ENEMY.speed[e.rush ? 'chase' : e.mode] * (e.mode === 'chase' ? 1 + e.rage : 1);
}

/** Advances the enemy one frame. Mutates `e`, returns what happened. */
export function stepEnemy(level: Level, e: EnemyState, input: StepInput, rng: Rng): EnemyEvent[] {
  const { dt, player, noise } = input;
  const events: EnemyEvent[] = [];
  const tune = tuningFor(level);
  e.rage = input.fuses * ENEMY.ragePerFuse;
  e.modeTime += dt;
  e.clock += dt;
  // Update 0.9.6 — running flat out is only ever for getting somewhere (investigate); never left on.
  if (e.mode !== 'investigate') e.rush = false;

  // Update 0.5.4 — a minute without finding you: teleport to another corner (only when unseen).
  e.sinceSpotted = e.mode === 'chase' ? 0 : e.sinceSpotted + dt;
  if (tryTeleport(level, e, player.pos, rng)) events.push('teleported');

  // Update 0.9.6 — your beam on its body gives you away at once, even from behind.
  const lit = litByBeam(level, e, player);
  const vis = lit ? 1 : visibility(level, e, player);
  const close = lit || (vis > 0 && dist(e.pos, player.pos) <= ENEMY.senseRadius);
  if (vis > 0) {
    e.alert = Math.min(1, e.alert + vis * ENEMY.alertRise * dt);
    e.sinceSeen = 0;
    e.sinceSpotted = 0; // any sighting restarts the teleport clock
  } else {
    e.alert = Math.max(0, e.alert - ENEMY.alertDecay * dt);
    e.sinceSeen += dt;
  }

  // Update 0.9.7 — up on the ceiling: its own rules. It can't catch you from there.
  if (e.crawl) {
    stepCrawl(level, e, input, e.alert >= 1 || close, events, rng);
    return events;
  }
  e.crawlCooldown = Math.max(0, e.crawlCooldown - dt);

  // Perception → mode changes.
  if (e.mode !== 'chase' && (e.alert >= 1 || close)) {
    setMode(e, 'chase');
    e.alert = 1;
    e.windup = ENEMY.windupSeconds;
    events.push('spotted');
  } else if (e.mode !== 'chase' && vis > 0 && e.alert > 0.35) {
    setMode(e, 'investigate');
    goTo(level, e, player.pos);
  } else if (e.mode !== 'chase' && !e.rush && noise && heardNoise(level, e, noise)) {
    if (e.mode !== 'investigate') events.push('heard');
    setMode(e, 'investigate');
    goTo(level, e, noise.pos);
    if (noise.run || noise.lure) e.rush = true; // chase speed, and no other noise turns it aside on the way
    if (noise.lure) e.lure = true;
  }

  if (e.mode === 'chase' && e.sinceSeen <= tune.memorySeconds) e.lastKnown = { ...player.pos };

  // Update 0.6.4 — rushing to the generator (0.9.1: or to a panel that blew): chase speed.
  const speed = enemySpeed(e); // Update 0.9.6.2 — the fuses only speed up the chase

  switch (e.mode) {
    case 'chase': {
      if (e.windup > 0) {
        // Screaming: stands still, turns to face you.
        e.windup = Math.max(0, e.windup - dt);
        const d = dist(e.pos, player.pos);
        if (d > 0.01) turnToward(e, { x: (player.pos.x - e.pos.x) / d, z: (player.pos.z - e.pos.z) / d }, dt);
        break;
      }
      if (vis > 0 && clearLine(level, e.pos, player.pos, ENEMY.bodyRadius)) {
        // Direct pursuit while its whole body fits along the line to you — smoother than grid paths.
        // Update 0.5.2 — seeing you isn't enough: past a doorway corner it used to snag and stop.
        const d = dist(e.pos, player.pos);
        if (d > 0.01) {
          const dir = { x: (player.pos.x - e.pos.x) / d, z: (player.pos.z - e.pos.z) / d };
          const step = Math.min(speed * dt, d);
          e.pos = crossPortal(level, moveWithCollision(level, e.pos, dir.x * step, dir.z * step, ENEMY.bodyRadius)).pos;
          turnToward(e, dir, dt);
        }
        e.path = [];
      } else if (e.lastKnown) {
        e.repath -= dt;
        if (e.repath <= 0 || !e.goal || dist(e.goal, e.lastKnown) > TILE * 0.5) goTo(level, e, e.lastKnown);
        const arrived = followPath(level, e, speed, dt);
        if ((arrived && e.sinceSeen > tune.memorySeconds) || e.sinceSeen > tune.memorySeconds + ENEMY.giveUpSeconds) {
          // Update 0.9.8 — lost you: straight back to its patrol. It used to search round there and check
          // the nearest locker, which was always the one you'd just got away into.
          setMode(e, 'patrol');
          events.push('lost');
          e.idle = 1.5;
          e.goal = null;
        }
      }
      break;
    }
    case 'investigate': {
      if (e.windup > 0) {
        // Update 0.6.4 — screaming at the corner before the sprint to the generator.
        e.windup = Math.max(0, e.windup - dt);
        break;
      }
      if (!e.goal) pickWanderGoal(level, e, rng, null, 0);
      if (followPath(level, e, speed, dt)) {
        // Update 0.9.6 — it ran to something you threw: you're close by, so it comes for you.
        if (e.lure && !player.hidden && dist(e.pos, player.pos) <= ENEMY.lureRadius) {
          setMode(e, 'chase');
          e.alert = 1;
          e.windup = ENEMY.windupSeconds;
          e.lastKnown = { ...player.pos };
          e.sinceSeen = 0;
          events.push('spotted');
          break;
        }
        const here = e.goal ?? e.pos;
        setMode(e, 'search');
        pickWanderGoal(level, e, rng, here, tune.searchRadiusTiles);
        startLockerCheck(level, e, input.lockers, here); // Update 0.9.6
      }
      break;
    }
    case 'search': {
      // Update 0.9.6 — checking a locker: walk up, open it for a second, shut it.
      if (e.check && input.lockers) {
        const c = e.check;
        const l = input.lockers[c.locker];
        if (c.phase === 'going') {
          c.t += dt;
          if (followPath(level, e, speed, dt) || c.t > 15) {
            c.phase = 'open';
            c.t = 0;
            events.push('lockerOpen');
            if (input.playerLocker === c.locker) events.push('foundYou');
          }
        } else {
          c.t += dt;
          const d = dist(e.pos, l.center) || 1;
          turnToward(e, { x: (l.center.x - e.pos.x) / d, z: (l.center.z - e.pos.z) / d }, dt);
          if (c.t >= ENEMY.lockerCheckSeconds) {
            events.push('lockerClose');
            e.checked[c.locker] = e.clock;
            e.check = null;
            e.modeTime = Math.min(e.modeTime, tune.searchSeconds * 0.5); // a little more searching after
            pickWanderGoal(level, e, rng, e.lastKnown ?? e.pos, tune.searchRadiusTiles);
          }
        }
        break;
      }
      if (e.modeTime > tune.searchSeconds) {
        setMode(e, 'patrol');
        e.idle = 1.5;
        e.goal = null;
        break;
      }
      if (followPath(level, e, speed, dt)) pickWanderGoal(level, e, rng, e.lastKnown ?? e.pos, tune.searchRadiusTiles);
      break;
    }
    case 'patrol': {
      // Update 0.9.7 — now and then, patrolling a corridor, it screams and goes up on the ceiling.
      if (e.crawlCooldown <= 0 && isCorridor(level, worldToCell(e.pos)) && rng() < CRAWL.chancePerSecond * dt) {
        startCrawl(e, rng);
        events.push('crawlUp');
        break;
      }
      if (e.idle > 0) {
        e.idle -= dt;
        break;
      }
      if (!e.goal) {
        // Update 0.5.4 — patrols its own part of the map; noise still draws it anywhere, and after
        // 35 s without finding you it moves to another corner (tryTeleport). 0.6.4 — long legs.
        pickPatrolGoal(level, e, rng);
      }
      if (followPath(level, e, speed, dt)) {
        e.goal = null;
        e.idle = 1 + rng() * 2.5;
      }
      break;
    }
  }

  if (!player.hidden && dist(e.pos, player.pos) <= ENEMY.catchRadius) events.push('caught');
  return events;
}
