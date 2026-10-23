// "The Patient" — enemy brain. Pure state machine: patrol → investigate → chase → search.
// The engine calls stepEnemy() every frame and only renders the result.
import { Cell, Level, TILE, Vec2, cellCenter, dist, floorCells, worldToCell, sameCell } from './level';
import { findPath } from './pathfinding';
import { lineOfSight } from './lineOfSight';
import { clearLine, moveWithCollision, overlapsWall } from './collision';
import { Rng } from './rng';

export type EnemyMode = 'patrol' | 'investigate' | 'chase' | 'search';
export type EnemyEvent = 'spotted' | 'lost' | 'heard' | 'caught';

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
  senseRadius: 3, // sees you at any angle this close
  alertRise: 2.4,
  alertDecay: 0.5,
  memorySeconds: 1.2, // keeps tracking you briefly after losing sight
  searchSeconds: 7,
  repathSeconds: 0.4,
  muffledNoiseMul: 0.6, // noise through walls carries less
  /** Update 0.2 — it screams before it charges: your head start. */
  windupSeconds: 1.0,
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
}

export interface PlayerSense {
  pos: Vec2;
  flashlightOn: boolean;
  crouching: boolean;
}

export interface Noise {
  pos: Vec2;
  radius: number;
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
  };
}

/** 0 = can't see you, 1 = sees you clearly. */
export function visibility(level: Level, e: EnemyState, p: PlayerSense): number {
  const d = dist(e.pos, p.pos);
  let view = p.flashlightOn ? ENEMY.viewDistLight : ENEMY.viewDistDark;
  if (p.crouching) view *= ENEMY.crouchSightMul;
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
  e.pathIndex = e.path.length > 1 && clearLine(level, e.pos, cellCenter(e.path[1]), ENEMY.bodyRadius) ? 1 : 0;
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

/** Moves along the path. Returns true when the goal is reached. */
function followPath(e: EnemyState, speed: number, dt: number): boolean {
  let budget = speed * dt;
  while (budget > 0) {
    const wp = e.pathIndex < e.path.length ? cellCenter(e.path[e.pathIndex]) : e.goal;
    if (!wp) return true;
    const d = dist(e.pos, wp);
    if (d < 0.05) {
      if (e.pathIndex >= e.path.length) return true;
      e.pathIndex++;
      continue;
    }
    const step = Math.min(budget, d);
    const dir = { x: (wp.x - e.pos.x) / d, z: (wp.z - e.pos.z) / d };
    e.pos = { x: e.pos.x + dir.x * step, z: e.pos.z + dir.z * step };
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
  e.rage = input.fuses * ENEMY.ragePerFuse;
  e.modeTime += dt;

  const vis = visibility(level, e, player);
  const close = vis > 0 && dist(e.pos, player.pos) <= ENEMY.senseRadius;
  if (vis > 0) {
    e.alert = Math.min(1, e.alert + vis * ENEMY.alertRise * dt);
    e.sinceSeen = 0;
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
  } else if (e.mode !== 'chase' && noise && heardNoise(level, e, noise)) {
    if (e.mode !== 'investigate') events.push('heard');
    setMode(e, 'investigate');
    goTo(level, e, noise.pos);
  }

  if (e.mode === 'chase' && e.sinceSeen <= ENEMY.memorySeconds) e.lastKnown = { ...player.pos };

  const speed = ENEMY.speed[e.mode] * (1 + e.rage);

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
          e.pos = moveWithCollision(level, e.pos, dir.x * step, dir.z * step, ENEMY.bodyRadius);
          turnToward(e, dir, dt);
        }
        e.path = [];
      } else if (e.lastKnown) {
        e.repath -= dt;
        if (e.repath <= 0 || !e.goal || dist(e.goal, e.lastKnown) > TILE * 0.5) goTo(level, e, e.lastKnown);
        const arrived = followPath(e, speed, dt);
        if (arrived && e.sinceSeen > ENEMY.memorySeconds) {
          setMode(e, 'search');
          events.push('lost');
          pickWanderGoal(level, e, rng, e.lastKnown, 3);
        }
      }
      break;
    }
    case 'investigate': {
      if (!e.goal) pickWanderGoal(level, e, rng, null, 0);
      if (followPath(e, speed, dt)) {
        setMode(e, 'search');
        pickWanderGoal(level, e, rng, e.goal, 3);
      }
      break;
    }
    case 'search': {
      if (e.modeTime > ENEMY.searchSeconds) {
        setMode(e, 'patrol');
        e.idle = 1.5;
        e.goal = null;
        break;
      }
      if (followPath(e, speed, dt)) pickWanderGoal(level, e, rng, e.lastKnown ?? e.pos, 3);
      break;
    }
    case 'patrol': {
      if (e.idle > 0) {
        e.idle -= dt;
        break;
      }
      if (!e.goal) {
        // Drifts toward the player a third of the time, so it never wanders off for long.
        const near = rng() < 0.35 ? player.pos : null;
        pickWanderGoal(level, e, rng, near, 6);
      }
      if (followPath(e, speed, dt)) {
        e.goal = null;
        e.idle = 1 + rng() * 2.5;
      }
      break;
    }
  }

  if (dist(e.pos, player.pos) <= ENEMY.catchRadius) events.push('caught');
  return events;
}
