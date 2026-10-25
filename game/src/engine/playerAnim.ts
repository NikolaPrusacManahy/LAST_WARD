// Update 0.3 — which clip the first-person body plays for a gait. Pure (tested).
import type { Gait } from '../state/playerRules';

/** Update 0.5.3 — strafeLeft / strafeRight. Update 0.6 — thrown / getUp (caught) + injured set. */
export type PlayerClip =
  | 'idle' | 'walk' | 'run' | 'crouch' | 'strafeLeft' | 'strafeRight'
  | 'thrown' | 'getUp' | 'injuredIdle' | 'injuredWalk' | 'injuredRun'
  /** Update 0.9.9 — hit on your last life and sent flying; down: crawling, and dying there; getting a
   *  teammate up (on one knee). */
  | 'hitFly' | 'crawl' | 'proneDeath' | 'revive';

/** Ground speed each clip was authored at (stance foot), m/s. */
export const PLAYER_CLIP_SPEED: Record<PlayerClip, number> = {
  idle: 0, walk: 1.6, run: 3.2, crouch: 1.25, strafeLeft: 1.6, strafeRight: 1.6,
  thrown: 0, getUp: 0, injuredIdle: 0, injuredWalk: 1.6, injuredRun: 3.2,
  hitFly: 0, crawl: 0, proneDeath: 0, revive: 0,
};

/** Clips that play once and hold their last frame (the rest loop). */
export const PLAY_ONCE: readonly string[] = ['thrown', 'getUp', 'hitFly', 'proneDeath', 'revive'];

/** Update 0.6 — after losing a life the idle / walk / run clips are the injured ones. */
const INJURED: Partial<Record<PlayerClip, PlayerClip>> = { idle: 'injuredIdle', walk: 'injuredWalk', run: 'injuredRun' };
export function injuredClip(clip: PlayerClip, injured: boolean): PlayerClip {
  return injured ? INJURED[clip] ?? clip : clip;
}

/**
 * Update 0.5.3 — which way you're stepping, from your velocity in your own frame (+side = right).
 * Strafe only when moving more sideways than forward/back; diagonals keep the walk.
 */
export function strafeSide(side: number, ahead: number): 'left' | 'right' | null {
  if (Math.abs(side) < 0.2 || Math.abs(side) <= Math.abs(ahead)) return null;
  return side > 0 ? 'right' : 'left';
}

export function choosePlayerClip(gait: Gait, crouching: boolean, strafe: 'left' | 'right' | null = null): PlayerClip {
  if (crouching) return 'crouch';
  if (gait === 'sprint') return 'run';
  if (gait === 'walk') return strafe === 'left' ? 'strafeLeft' : strafe === 'right' ? 'strafeRight' : 'walk';
  return 'idle';
}

/** Update 0.5.3 — most the body turns toward a diagonal move (W+A etc.). */
export const MAX_BODY_TURN = Math.PI / 4;

/**
 * Update 0.5.3 — W+A / W+D: turn the body (not the camera) up to 45° so the legs walk along the
 * move instead of straight ahead. + = turn left. Only forward diagonals (designer's call); 0 when
 * moving back, strafing (the strafe clips already step sideways) or barely moving.
 */
export function bodyTurnFor(side: number, ahead: number, strafing: boolean): number {
  if (strafing || ahead <= 0 || Math.hypot(side, ahead) < 0.2) return 0;
  const t = Math.atan(-side / ahead);
  return Math.max(-MAX_BODY_TURN, Math.min(MAX_BODY_TURN, t));
}

/** Your velocity in your own frame: +side = right, +ahead = where you're looking. */
export function localVelocity(vel: { x: number; z: number }, yaw: number): { side: number; ahead: number } {
  return {
    side: vel.x * Math.cos(yaw) - vel.z * Math.sin(yaw),
    ahead: -vel.x * Math.sin(yaw) - vel.z * Math.cos(yaw),
  };
}

/** Update 0.3.1 — arms shrink away while running so the pumping hands stay out of view. */
export function armScaleFor(clip: PlayerClip): number {
  return clip === 'run' || clip === 'injuredRun' ? 0 : 1;
}

/**
 * Update 0.4.2 — where to stand the body so its (animated) head sits `back` metres behind the
 * camera. The crouch and run clips lean the head forward of the feet; placing the feet at a fixed
 * offset put the camera inside the neck/collar when crouched. `headDelta` = head minus body root.
 */
export function bodyRootFor(
  camera: { x: number; z: number },
  headDelta: { x: number; z: number },
  forward: { x: number; z: number },
  back: number,
): { x: number; z: number } {
  return { x: camera.x - headDelta.x - forward.x * back, z: camera.z - headDelta.z - forward.z * back };
}

/** How far behind the camera the head sits; more when looking down so the chest stays below view. */
export function bodyBackOffset(pitch: number): number {
  return 0.12 + 0.3 * Math.max(0, -pitch);
}

/** Update 0.5.2 — half the body's depth/width: how far it must stay from a wall. */
export const BODY_RADIUS = 0.22;

/**
 * Update 0.5.2 — never stand the body further behind the camera than there is room (`room` metres,
 * measured backwards from the camera). With your back to a wall it used to be drawn inside it.
 */
export function limitBodyBack(
  root: { x: number; z: number },
  camera: { x: number; z: number },
  forward: { x: number; z: number },
  room: number,
): { x: number; z: number } {
  const behind = (camera.x - root.x) * forward.x + (camera.z - root.z) * forward.z;
  const excess = behind - room;
  return excess > 0 ? { x: root.x + forward.x * excess, z: root.z + forward.z * excess } : root;
}

/** Update 0.4.1 — the walk looked rushed; it plays at half the matched speed.
 *  (0.9.7 matched it to stop the feet sliding; 0.9.8 is back to half: the quick steps looked off.) */
export const WALK_ANIM_SLOWDOWN = 0.5;
/** Update 0.4.3 — same for the new run clip. */
export const RUN_ANIM_SLOWDOWN = 0.5;

/** Crouching still = crouch pose frozen; otherwise match feet to ground speed (clamped). */
export function playerClipTimeScale(clip: PlayerClip, speed: number): number {
  const ref = PLAYER_CLIP_SPEED[clip];
  if (!ref) return 1;
  if (speed < 0.2) return clip === 'crouch' ? 0 : 1;
  const matched = Math.min(1.7, Math.max(0.6, speed / ref));
  if (clip === 'walk' || clip === 'strafeLeft' || clip === 'strafeRight' || clip === 'injuredWalk') return matched * WALK_ANIM_SLOWDOWN;
  if (clip === 'run' || clip === 'injuredRun') return matched * RUN_ANIM_SLOWDOWN;
  return matched;
}
