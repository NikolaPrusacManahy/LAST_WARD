// "The Patient" — enemy brain. Pure state machine: patrol → investigate → chase → search.
// The engine calls stepEnemy() every frame and only renders the result.
import { Cell, Level, TILE, Vec2, cellCenter, crossPortal, dist, floorCells, floorOfRow, floorStride, isSolid, worldToCell, sameCell } from './level';
import { findPath } from './pathfinding';
import { lineOfSight } from './lineOfSight';
import { clearLine, moveWithCollision, overlapsWall } from './collision';
import { Rng } from './rng';

export type EnemyMode = 'patrol' | 'investigate' | 'chase' | 'search';
/** Update 0.5.4 — 'teleported': moved to another corner after a minute without finding you. */
export type EnemyEvent = 'spotted' | 'lost' | 'heard' | 'caught' | 'teleported';

export const ENEMY = {
  speed: { patrol: 1.5, investigate: 2.6, chase: 4.3, search: 2.1 } as Record<EnemyMode, number>,
  /** Each fuse collected makes it this much faster (it knows what you're doing). */
  ragePerFuse: 0.07,
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
  senseRadius: 3, // sees you at any angle this close
  alertRise: 2.4,
  alertDecay: 0.5,
  memorySeconds: 1.2, // keeps tracking you briefly after losing sight
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
}

export interface PlayerSense {
  pos: Vec2;
  flashlightOn: boolean;
  crouching: boolean;
  /** Update 0.9 — sprinting (it sees you further). */
  running?: boolean;
  /** Update 0.9.5 — in a locker it didn't see you get into: it can't see you or catch you. */
  hidden?: boolean;
}

export interface Noise {
  pos: Vec2;
  radius: number;
  /** Update 0.9.1 — something it runs to (a panel blowing), not one it wanders over to check. */
  run?: boolean;
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

/** Update 0.5.4 — after a minute without finding you, move to another corner you can't see. */
function tryTeleport(level: Level, e: EnemyState, player: Vec2, rng: Rng): boolean {
  if (e.mode === 'chase' || e.sinceSpotted < ENEMY.teleportAfter) return false;
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
  if (d > ENEMY.senseRadius) {
    const toP = { x: (p.pos.x - e.pos.x) / d, z: (p.pos.z - e.pos.z) / d };
    const dot = toP.x * e.dir.x + toP.z * e.dir.z;
    if (Math.acos(Math.max(-1, Math.min(1, dot))) > ENEMY.fovHalf) return 0;
  }
  if (!lineOfSight(level, e.pos, p.pos)) return 0;
  return Math.min(1, (1 - d / view) * 1.6 + 0.2);
}

export function heardNoise(level: Level, e: EnemyState, n: Noise): boolean {
  const d = dist(e.pos, n.pos);
  if (d > n.radius) return false;
  return lineOfSight(level, e.pos, n.pos) || d <= n.radius * ENEMY.muffledNoiseMul;
}

function setMode(e: EnemyState, mode: EnemyMode) {
  if (e.mode !== mode) {
    e.mode = mode;
    e.modeTime = 0;
    e.rush = false;
  }
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

function turnToward(e: EnemyState, dir: Vec2, dt: number) {
  const k = Math.min(1, dt * 8);
  const x = e.dir.x + (dir.x - e.dir.x) * k;
  const z = e.dir.z + (dir.z - e.dir.z) * k;
  const len = Math.hypot(x, z) || 1;
  e.dir = { x: x / len, z: z / len };
}

export interface StepInput {
  dt: number;
  player: PlayerSense;
  noise: Noise | null;
  fuses: number;
}

/** Advances the enemy one frame. Mutates `e`, returns what happened. */
export function stepEnemy(level: Level, e: EnemyState, input: StepInput, rng: Rng): EnemyEvent[] {
  const { dt, player, noise } = input;
  const events: EnemyEvent[] = [];
  const tune = tuningFor(level);
  e.rage = input.fuses * ENEMY.ragePerFuse;
  e.modeTime += dt;

  // Update 0.5.4 — a minute without finding you: teleport to another corner (only when unseen).
  e.sinceSpotted = e.mode === 'chase' ? 0 : e.sinceSpotted + dt;
  if (tryTeleport(level, e, player.pos, rng)) events.push('teleported');

  const vis = visibility(level, e, player);
  const close = vis > 0 && dist(e.pos, player.pos) <= ENEMY.senseRadius;
  if (vis > 0) {
    e.alert = Math.min(1, e.alert + vis * ENEMY.alertRise * dt);
    e.sinceSeen = 0;
    e.sinceSpotted = 0; // any sighting restarts the teleport clock
  } else {
    e.alert = Math.max(0, e.alert - ENEMY.alertDecay * dt);
    e.sinceSeen += dt;
  }

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
    if (noise.run) e.rush = true; // chase speed, and no other noise turns it aside on the way
  }

  if (e.mode === 'chase' && e.sinceSeen <= tune.memorySeconds) e.lastKnown = { ...player.pos };

  // Update 0.6.4 — rushing to the generator (0.9.1: or to a panel that blew): chase speed.
  const speed = ENEMY.speed[e.rush ? 'chase' : e.mode] * (1 + e.rage);

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
        if (arrived && e.sinceSeen > tune.memorySeconds) {
          setMode(e, 'search');
          events.push('lost');
          pickWanderGoal(level, e, rng, e.lastKnown, tune.searchRadiusTiles);
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
        setMode(e, 'search');
        pickWanderGoal(level, e, rng, e.goal, tune.searchRadiusTiles);
      }
      break;
    }
    case 'search': {
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
