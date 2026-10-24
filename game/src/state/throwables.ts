// Update 0.9.6 — bricks and bottles. They lie about the halls; pick one up and it floats in front of you;
// Space throws it. A little physics: it flies off where you look, gravity pulls it down, and the first
// thing it hits (floor, wall) is where it lands. A bottle smashes (gone). A brick thuds down and breaks
// in half; the half can be thrown once more, then it's gone too. Either way the noise brings The Patient running (world/enemyAI.ts `lure`).
// Pure (tested).
import { Level, TILE, ThrowableSpawn, Vec2, WALL_HEIGHT, cellCenter, isSolid } from '../world/level';

export type ThrowableKind = 'brick' | 'bottle';

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface Throwable {
  id: number;
  kind: ThrowableKind;
  state: 'ground' | 'held' | 'flying' | 'gone';
  pos: Vec3;
  vel: Vec3;
  /** Which way it lies / spins (rad). */
  yaw: number;
  spin: number;
  /** Update 0.9.6 — times thrown (a brick is half a brick after one, gone after two). */
  throws: number;
}

export const THROW = {
  /** Launch speed (m/s) along your view, plus a little lift so it arcs. */
  speed: 11,
  lift: 2.2,
  gravity: 9.81,
  /** Collision sampling step (m) and how far it's held off a wall when it drops. */
  step: 0.05,
  wallGap: 0.18,
  /** How loud the landing is (noise radius, m; The Patient hears ×2 since 0.9.6, so it comes from twice
   *  this far in the open, 1.2× this far through walls). Brick 20 m (12 in the first draft). */
  noise: { brick: 20, bottle: 16 } as Record<ThrowableKind, number>,
  /** Update 0.9.6 — a brick breaks in half on its first landing and is gone after its second. */
  brickThrows: 2,
  /** Where it floats while you hold it: forward, right, down from your eyes (m). */
  hold: { forward: 0.55, right: 0.2, down: 0.24 },
};

export const THROWABLE_TITLE: Record<ThrowableKind, string> = { brick: 'Brick', bottle: 'Glass bottle' };

/** Update 0.9.6 — what it's called on the floor / in your hand ("Half a brick" once it's broken). */
export function throwableTitle(t: { kind: ThrowableKind; throws: number }): string {
  return t.kind === 'brick' && t.throws > 0 ? 'Half a brick' : THROWABLE_TITLE[t.kind];
}

export function spawnThrowables(spawns: ThrowableSpawn[]): Throwable[] {
  return spawns.map((s, id) => {
    const c = cellCenter(s.cell);
    const [dx, dz] = s.at ?? [0, 0];
    return { id, kind: s.kind, state: 'ground', pos: { x: c.x + dx, y: 0, z: c.z + dz }, vel: { x: 0, y: 0, z: 0 }, yaw: (id * 2.39996) % (Math.PI * 2), spin: 0, throws: 0 };
  });
}

/** Throw it from `from` (your hand) along `look` (unit, with pitch). */
export function launch(t: Throwable, from: Vec3, look: Vec3): Throwable {
  return {
    ...t,
    state: 'flying',
    pos: { ...from },
    vel: { x: look.x * THROW.speed, y: look.y * THROW.speed + THROW.lift, z: look.z * THROW.speed },
    spin: t.kind === 'brick' ? 9 : 12,
  };
}

export interface Landing {
  /** Where it hit (on the floor under the impact point). */
  at: Vec3;
  broke: boolean;
  noise: { pos: Vec2; radius: number };
}

const solidAt = (level: Level, x: number, z: number) => isSolid(level, Math.floor(x / TILE), Math.floor(z / TILE));

/** One frame of flight. Returns the landing when it hits something. */
export function stepFlight(level: Level, t: Throwable, dt: number): { item: Throwable; landing: Landing | null } {
  if (t.state !== 'flying') return { item: t, landing: null };
  const p = { ...t.pos };
  const v = { ...t.vel, y: t.vel.y - THROW.gravity * dt };
  const travel = Math.hypot(v.x, v.y, v.z) * dt;
  const n = Math.max(1, Math.ceil(travel / THROW.step));
  for (let i = 0; i < n; i++) {
    const q = { x: p.x + (v.x * dt) / n, y: p.y + (v.y * dt) / n, z: p.z + (v.z * dt) / n };
    if (q.y >= WALL_HEIGHT - 0.05) {
      v.y = -Math.abs(v.y) * 0.3; // off the ceiling
      q.y = WALL_HEIGHT - 0.05;
    }
    const wall = solidAt(level, q.x, q.z);
    if (wall || q.y <= 0) {
      // Hit: a wall (stop just short of it) or the floor.
      let rest = { x: p.x, z: p.z };
      if (wall) {
        const d = Math.hypot(v.x, v.z) || 1;
        rest = { x: p.x - (v.x / d) * THROW.wallGap, z: p.z - (v.z / d) * THROW.wallGap };
      }
      const at = { x: rest.x, y: 0, z: rest.z };
      const throws = t.throws + 1;
      const broke = t.kind === 'bottle' || throws >= THROW.brickThrows;
      return {
        item: { ...t, state: broke ? 'gone' : 'ground', pos: at, vel: { x: 0, y: 0, z: 0 }, spin: 0, yaw: t.yaw + Math.random() * 0.6, throws },
        landing: { at, broke, noise: { pos: { x: at.x, z: at.z }, radius: THROW.noise[t.kind] } },
      };
    }
    p.x = q.x;
    p.y = q.y;
    p.z = q.z;
  }
  return { item: { ...t, pos: p, vel: v, yaw: t.yaw + t.spin * dt }, landing: null };
}

/** Where a held one floats, from your eye position and view basis. */
export function heldPos(eye: Vec3, forward: Vec3, right: Vec3): Vec3 {
  const h = THROW.hold;
  return {
    x: eye.x + forward.x * h.forward + right.x * h.right,
    y: eye.y + forward.y * h.forward - h.down,
    z: eye.z + forward.z * h.forward + right.z * h.right,
  };
}
