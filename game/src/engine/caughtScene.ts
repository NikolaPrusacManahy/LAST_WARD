// Update 0.6 — films the first catch (timeline in state/caughtSequence.ts):
//   grab: the camera rides up to its raised hands, staring at its face, struggling
//   throw: it winds up with you in its hands
//   flight → down → get up: the camera is your body's eyes while the thrown / get-up clips play,
//   so you feel every flip and the slam into the floor.
import * as THREE from 'three';
import type { Level, Vec2 } from '../world/level';
import { throwLanding } from '../world/throwLanding';
import { caughtTimes, cuesBetween, flightProgress, THROWN_CLIP, CaughtCue } from '../state/caughtSequence';
import type { EnemyView } from './enemyView';
import type { PlayerBody } from './playerBody';

/** Which way the thrown clip travels in the model's own frame (measured from its hips: +x, a little +z). */
const THROWN_TRAVEL_LOCAL = { x: 1.57, z: 0.46 };

/** Body facing (game yaw) so the thrown clip's travel points along `dir`. */
export function bodyYawForThrow(dir: Vec2): number {
  // Body root rotation is yaw + π; three.js Y rotation maps local (x, z) → (x cos + z sin, −x sin + z cos).
  let best = 0;
  let bestDot = -Infinity;
  for (let i = 0; i < 360; i++) {
    const yaw = (i / 360) * Math.PI * 2;
    const r = yaw + Math.PI;
    const wx = THROWN_TRAVEL_LOCAL.x * Math.cos(r) + THROWN_TRAVEL_LOCAL.z * Math.sin(r);
    const wz = -THROWN_TRAVEL_LOCAL.x * Math.sin(r) + THROWN_TRAVEL_LOCAL.z * Math.cos(r);
    const dot = (wx * dir.x + wz * dir.z) / Math.hypot(wx, wz);
    if (dot > bestDot) {
      bestDot = dot;
      best = yaw;
    }
  }
  return best;
}

export interface CaughtSceneInput {
  level: Level;
  camera: THREE.PerspectiveCamera;
  enemyView: EnemyView;
  body: () => PlayerBody | null;
  playerPos: Vec2;
  eyeHeight: number;
  enemyPos: Vec2;
}

export function createCaughtScene(i: CaughtSceneInput) {
  let t = 0;
  let prev = -1;
  const toPlayer = { x: i.playerPos.x - i.enemyPos.x, z: i.playerPos.z - i.enemyPos.z };
  const len = Math.hypot(toPlayer.x, toPlayer.z) || 1;
  const facing = { x: toPlayer.x / len, z: toPlayer.z / len }; // it faces you
  const enemyYaw = Math.atan2(facing.x, facing.z);
  const landing = throwLanding(i.level, i.playerPos, facing);
  const bodyYaw = bodyYawForThrow(landing.dir);

  const startEye = new THREE.Vector3(i.playerPos.x, i.eyeHeight, i.playerPos.z);
  const held = new THREE.Vector3();
  const face = new THREE.Vector3();
  const eyePos = new THREE.Vector3();
  const eyeQ = new THREE.Quaternion();
  let enemyGone = false;
  let enemyAt: Vec2 = { ...i.enemyPos };

  return {
    landing: landing.at,
    bodyYaw,
    get t() {
      return t;
    },
    /** The Patient has been sent to a corner; keep drawing it there. */
    enemyMoved(at: Vec2) {
      enemyGone = true;
      enemyAt = at;
    },
    /** Advance by dt; returns the cues that fired this frame. `clock` = the game's world time. */
    update(dt: number, clock: number): CaughtCue[] {
      t += dt;
      const cues = cuesBetween(prev, t);
      prev = t;
      const cam = i.camera;
      const body = i.body();

      // The Patient: grab → throw in place, facing you; after vanishing, idling at its corner.
      if (!enemyGone) i.enemyView.pose(i.enemyPos, enemyYaw, t < caughtTimes.throwAt ? 'grab' : 'throw', clock);
      else i.enemyView.pose(enemyAt, enemyYaw, 'idle', clock);

      if (t < caughtTimes.launchAt || !body) {
        // In its hands: ride up to them (lifted), look it in the face, thrash a little.
        i.enemyView.hands(held);
        held.y -= 0.08;
        held.x += facing.x * 0.12;
        held.z += facing.z * 0.12;
        const k = Math.min(1, t / 0.8);
        const lift = k * k * (3 - 2 * k);
        if (t < caughtTimes.launchAt) cam.position.lerpVectors(startEye, held, lift);
        else {
          // No body model: tumble along the throw path instead.
          const f = flightProgress(t);
          const arc = Math.sin(Math.min(1, f) * Math.PI) * 1.2;
          cam.position.set(
            i.playerPos.x + (landing.at.x - i.playerPos.x) * f,
            Math.max(0.25, 1.4 * (1 - f) + 0.25 * f + arc),
            i.playerPos.z + (landing.at.z - i.playerPos.z) * f,
          );
        }
        i.enemyView.head.getWorldPosition(face);
        cam.lookAt(face);
        const shake = t < caughtTimes.launchAt ? 0.025 : 0.2;
        cam.rotation.z += (Math.random() - 0.5) * shake;
        cam.rotation.x += (Math.random() - 0.5) * shake;
        body?.setVisible(false);
      } else {
        // Thrown: your body flies and flips; the camera is its eyes.
        body.setVisible(true);
        if (t < caughtTimes.getUpAt) {
          const f = flightProgress(t);
          const at = { x: i.playerPos.x + (landing.at.x - i.playerPos.x) * f, z: i.playerPos.z + (landing.at.z - i.playerPos.z) * f };
          body.cinematic({ clip: 'thrown', startAt: THROWN_CLIP.flipStart, fade: 0.05, pos: at, yaw: bodyYaw, dt });
        } else {
          // Hard cut (hidden by the dazed blink): a blend from on-your-back to face-down sank the head into the floor.
          body.cinematic({ clip: 'getUp', startAt: 0, fade: 0, pos: landing.at, yaw: bodyYaw, dt });
        }
        body.eyes(eyePos, eyeQ);
        cam.position.copy(eyePos);
        cam.position.y = Math.max(0.1, cam.position.y); // never below the floor
        cam.quaternion.copy(eyeQ);
        // The slam: a hard jolt for a moment after hitting the floor.
        const since = t - caughtTimes.impactAt;
        if (since >= 0 && since < 0.35) {
          const j = (1 - since / 0.35) * 0.06;
          cam.position.x += (Math.random() - 0.5) * j;
          cam.position.y += (Math.random() - 0.5) * j;
          cam.rotateZ((Math.random() - 0.5) * j * 3);
        }
      }
      cam.updateMatrixWorld();
      return cues;
    },
    /** Where the camera ended (eases back into normal first person from here). */
    lastView() {
      return { pos: i.camera.position.clone(), quat: i.camera.quaternion.clone() };
    },
  };
}

export type CaughtScene = ReturnType<typeof createCaughtScene>;
