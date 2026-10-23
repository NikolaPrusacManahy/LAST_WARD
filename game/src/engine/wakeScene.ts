// Update 0.6.3 — films the start of a run (timeline in state/wakeSequence.ts): you lie face down on
// the floor where you spawn; the camera is your body's eyes while the get-up clip holds its first
// pose, then plays. No body model yet → a simple low camera that rises instead.
import * as THREE from 'three';
import type { Vec2 } from '../world/level';
import { wakeClipTime, wakeCues, wakeTimes, WakeCue } from '../state/wakeSequence';
import type { PlayerBody } from './playerBody';

export interface WakeSceneInput {
  camera: THREE.PerspectiveCamera;
  body: () => PlayerBody | null;
  pos: Vec2;
  /** Facing (game yaw) once you're up. */
  yaw: number;
  eyeHeight: number;
}

export function createWakeScene(i: WakeSceneInput) {
  let t = 0;
  let prev = -1;
  let clipT = 0;
  const eyePos = new THREE.Vector3();
  const eyeQ = new THREE.Quaternion();
  const look = new THREE.Euler(0, 0, 0, 'YXZ');

  return {
    get t() {
      return t;
    },
    update(dt: number): WakeCue[] {
      t += dt;
      const cues = wakeCues(prev, t);
      prev = t;
      const cam = i.camera;
      const body = i.body();
      if (body) {
        body.setVisible(true);
        // Hold the get-up clip's first pose (face down) until it's time to get up, then play it.
        const next = wakeClipTime(t);
        const step = Math.max(0, next - clipT);
        clipT = next;
        body.cinematic({ clip: 'getUp', startAt: 0, fade: 0, pos: i.pos, yaw: i.yaw, dt: step });
        body.eyes(eyePos, eyeQ);
        cam.position.copy(eyePos);
        cam.position.y = Math.max(0.1, cam.position.y);
        cam.quaternion.copy(eyeQ);
      } else {
        // Fallback: cheek on the floor, then up to standing as the get-up time passes.
        const k = Math.min(1, wakeClipTime(t) / (wakeTimes.endAt - wakeTimes.getUpAt));
        const e = k * k * (3 - 2 * k);
        cam.position.set(i.pos.x, 0.18 + (i.eyeHeight - 0.18) * e, i.pos.z);
        look.set(-1.1 * (1 - e), i.yaw, 0.9 * (1 - e));
        cam.quaternion.setFromEuler(look);
      }
      cam.updateMatrixWorld();
      return cues;
    },
    lastView() {
      return { pos: i.camera.position.clone(), quat: i.camera.quaternion.clone() };
    },
  };
}

export type WakeScene = ReturnType<typeof createWakeScene>;
