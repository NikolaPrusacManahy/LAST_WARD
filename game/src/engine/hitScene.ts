// Update 0.9.9 — films the hit (timeline in state/hitSequence.ts): your eyes on it as it rears up and
// swings, then the blow lands and your body is sent flying back (the `hitFly` clip; the game carries it
// along the floor, away from it, until a wall or furniture stops you); the camera is your body's eyes
// through the flight, the slam and lying there.
import * as THREE from 'three';
import type { Level, Vec2 } from '../world/level';
import { throwLanding } from '../world/throwLanding';
import { HIT, HitCue, flyProgress, hitCues, hitTimes } from '../state/hitSequence';
import type { Blocker } from '../world/collision';
import type { EnemyView } from './enemyView';
import type { PlayerBody } from './playerBody';

export interface HitSceneInput {
  level: Level;
  camera: THREE.PerspectiveCamera;
  enemyView: EnemyView;
  body: () => PlayerBody | null;
  blockers?: Blocker[];
  playerPos: Vec2;
  eyeHeight: number;
  enemyPos: Vec2;
  /** Co-op Normal: you'll be down at the end, not dead. */
  down: boolean;
}

export function createHitScene(i: HitSceneInput) {
  let t = 0;
  let prev = -1;
  const dx = i.playerPos.x - i.enemyPos.x;
  const dz = i.playerPos.z - i.enemyPos.z;
  const len = Math.hypot(dx, dz) || 1;
  const away = { x: dx / len, z: dz / len };
  // It stands at arm's length (its reach in the clip), facing you.
  const enemyAt = { x: i.playerPos.x - away.x * HIT.reach, z: i.playerPos.z - away.z * HIT.reach };
  const enemyYaw = Math.atan2(away.x, away.z);
  // You face it, and fly back, away from it, until something stops you.
  const bodyYaw = Math.atan2(away.x, away.z);
  const land = throwLanding(i.level, i.playerPos, away, i.blockers ?? []);
  const fly = Math.min(HIT.flyMax, land.distance);
  const to = { x: i.playerPos.x + away.x * fly, z: i.playerPos.z + away.z * fly };
  const startEye = new THREE.Vector3(i.playerPos.x, i.eyeHeight, i.playerPos.z);
  const face = new THREE.Vector3();
  const eyePos = new THREE.Vector3();
  const eyeQ = new THREE.Quaternion();
  const look = new THREE.Matrix4();
  const lookQ = new THREE.Quaternion();
  let at: Vec2 = { ...i.playerPos };
  let posed = false;

  return {
    bodyYaw,
    enemyAt,
    /** Where your body is now (flying, then lying). */
    get pos() {
      return at;
    },
    get t() {
      return t;
    },
    update(dt: number, clock: number): HitCue[] {
      t += dt;
      const cues = hitCues(prev, t, i.down);
      prev = t;
      const cam = i.camera;
      const body = i.body();
      // Its blow, from just before it rears up (the first call starts the clip there).
      i.enemyView.pose(enemyAt, enemyYaw, 'attack', clock, HIT.clipSpeed, posed ? undefined : HIT.clipFrom);
      posed = true;
      if (t < hitTimes.hitAt || !body) {
        // Your eyes, on its face as it winds up.
        i.enemyView.head.getWorldPosition(face);
        if (t < hitTimes.hitAt) cam.position.copy(startEye);
        else {
          // No body model: fly back along the floor.
          const f = flyProgress(t);
          cam.position.set(i.playerPos.x + (to.x - i.playerPos.x) * f, Math.max(0.25, i.eyeHeight * (1 - f) + 0.25 * f), i.playerPos.z + (to.z - i.playerPos.z) * f);
        }
        look.lookAt(cam.position, face, cam.up);
        lookQ.setFromRotationMatrix(look);
        cam.quaternion.slerp(lookQ, Math.min(1, dt * 10));
        body?.setVisible(false);
      } else {
        // Sent flying: your body, its eyes.
        body.setVisible(true);
        const f = flyProgress(t);
        at = { x: i.playerPos.x + (to.x - i.playerPos.x) * f, z: i.playerPos.z + (to.z - i.playerPos.z) * f };
        body.cinematic({ clip: 'hitFly', startAt: Math.max(0, t - hitTimes.hitAt), fade: 0.04, pos: at, yaw: bodyYaw, dt });
        body.eyes(eyePos, eyeQ);
        cam.position.copy(eyePos);
        cam.position.y = Math.max(0.1, cam.position.y);
        cam.quaternion.copy(eyeQ);
        // The blow, then the slam: a hard jolt each time.
        for (const [when, size] of [[hitTimes.hitAt, 0.09], [hitTimes.landAt, 0.06]] as const) {
          const since = t - when;
          if (since >= 0 && since < 0.3) {
            const j = (1 - since / 0.3) * size;
            cam.position.x += (Math.random() - 0.5) * j;
            cam.position.y += (Math.random() - 0.5) * j;
            cam.rotateZ((Math.random() - 0.5) * j * 3);
          }
        }
      }
      cam.updateMatrixWorld();
      return cues;
    },
    lastView() {
      return { pos: i.camera.position.clone(), quat: i.camera.quaternion.clone() };
    },
  };
}

export type HitScene = ReturnType<typeof createHitScene>;
