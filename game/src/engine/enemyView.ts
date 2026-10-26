// "The Patient": a tall, too-thin figure in a hospital gown, built from primitives.
// Animation only — where it goes is decided by world/enemyAI.ts.
import * as THREE from 'three';
import type { EnemyMode } from '../world/enemyAI';
import { CRAWL_FLIP_PIVOT, type CrawlPose } from './enemyAnim';

export interface EnemyView {
  root: THREE.Group;
  head: THREE.Object3D;
  /** Update 0.6 — where it holds you: between its hands (world space). */
  hands(out: THREE.Vector3): THREE.Vector3;
  /** Update 0.9.7 — `crawl`: up on the ceiling (turned over by `flip`; Game lifts the root by `lift`). */
  update(pos: { x: number; z: number }, dir: { x: number; z: number }, mode: EnemyMode, moved: number, t: number, windingUp?: boolean, crawl?: CrawlPose | null): void;
  /** Jumpscare: the neck stretches and the face lunges at the camera. k: 0 → 1. */
  lunge(k: number, t: number): void;
  /** Update 0.4.3b — menu: place it exactly (no turning lerp) and loop a named clip, e.g. 'stare'.
   *  Update 0.9.9 — `from`: start the clip there (the hit starts its attack just before it rears up). */
  pose(pos: { x: number; z: number }, yaw: number, clip: string, t: number, timeScale?: number, from?: number): void;
  dispose(): void;
}

export function createEnemyView(): EnemyView {
  const disposables: { dispose(): void }[] = [];
  const track = <T extends { dispose(): void }>(x: T) => (disposables.push(x), x);
  const skin = track(new THREE.MeshStandardMaterial({ color: 0x6f736c, roughness: 0.95 }));
  const gownMat = track(new THREE.MeshStandardMaterial({ color: 0x55605c, roughness: 1, side: THREE.DoubleSide }));
  const stain = track(new THREE.MeshStandardMaterial({ color: 0x3a0505, roughness: 1 }));
  const eyeMat = track(new THREE.MeshBasicMaterial({ color: 0xfff6e0 }));
  const dark = track(new THREE.MeshBasicMaterial({ color: 0x050505 }));

  const root = new THREE.Group();
  // Update 0.9.7 — it turns over onto the ceiling about its middle (spin), not its feet.
  const spin = new THREE.Group();
  spin.position.y = CRAWL_FLIP_PIVOT;
  const figure = new THREE.Group();
  figure.position.y = -CRAWL_FLIP_PIVOT;
  spin.add(figure);
  root.add(spin);
  const body = new THREE.Group(); // leans forward when chasing
  figure.add(body);

  // Gown — a slightly flared, open tube.
  const gown = new THREE.Mesh(track(new THREE.CylinderGeometry(0.2, 0.34, 1.15, 10, 1, true)), gownMat);
  gown.position.y = 1.15;
  const blood = new THREE.Mesh(track(new THREE.CylinderGeometry(0.205, 0.3, 0.4, 10, 1, true, 0, 2.2)), stain);
  blood.position.y = 1.05;
  const chest = new THREE.Mesh(track(new THREE.CapsuleGeometry(0.17, 0.5, 4, 8)), gownMat);
  chest.position.y = 1.75;
  body.add(gown, blood, chest);

  // Neck + head, too long and slightly tilted.
  const neck = new THREE.Mesh(track(new THREE.CylinderGeometry(0.05, 0.06, 0.3, 6)), skin);
  neck.position.y = 2.15;
  const head = new THREE.Group();
  head.position.y = 2.38;
  const skull = new THREE.Mesh(track(new THREE.SphereGeometry(0.15, 14, 12)), skin);
  skull.scale.set(0.9, 1.3, 1);
  const mouth = new THREE.Mesh(track(new THREE.SphereGeometry(0.05, 8, 6)), dark);
  mouth.scale.set(1, 1.8, 0.4);
  mouth.position.set(0, -0.08, 0.135);
  const eyeGeo = track(new THREE.SphereGeometry(0.022, 8, 6));
  const eyeL = new THREE.Mesh(eyeGeo, eyeMat);
  const eyeR = new THREE.Mesh(eyeGeo, eyeMat);
  eyeL.position.set(-0.05, 0.04, 0.13);
  eyeR.position.set(0.05, 0.03, 0.13);
  head.add(skull, mouth, eyeL, eyeR);
  body.add(neck, head);

  // Arms hang to the knees.
  const armGeo = track(new THREE.CylinderGeometry(0.035, 0.045, 1.25, 6));
  armGeo.translate(0, -0.62, 0);
  const handGeo = track(new THREE.BoxGeometry(0.08, 0.22, 0.04));
  const makeArm = (side: number) => {
    const shoulder = new THREE.Group();
    shoulder.position.set(side * 0.24, 1.98, 0);
    const arm = new THREE.Mesh(armGeo, skin);
    const hand = new THREE.Mesh(handGeo, skin);
    hand.position.y = -1.32;
    shoulder.add(arm, hand);
    body.add(shoulder);
    return shoulder;
  };
  const armL = makeArm(-1);
  const armR = makeArm(1);

  // Legs.
  const legGeo = track(new THREE.CylinderGeometry(0.045, 0.04, 0.85, 6));
  legGeo.translate(0, -0.42, 0);
  const makeLeg = (side: number) => {
    const hip = new THREE.Group();
    hip.position.set(side * 0.1, 0.85, 0);
    hip.add(new THREE.Mesh(legGeo, skin));
    figure.add(hip);
    return hip;
  };
  const legL = makeLeg(-1);
  const legR = makeLeg(1);

  root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) o.castShadow = true;
  });

  let stride = 0;
  let yaw = 0;

  return {
    root,
    head,
    hands(out) {
      // Primitive figure: just in front of its face.
      root.updateWorldMatrix(true, false);
      return out.set(0, 2.2, 0.55).applyMatrix4(root.matrixWorld);
    },
    update(pos, dir, mode, moved, t, _windingUp, crawl) {
      root.position.set(pos.x, 0, pos.z);
      const targetYaw = Math.atan2(dir.x, dir.z);
      let d = targetYaw - yaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      yaw += d * 0.25;
      root.rotation.y = yaw;
      spin.rotation.z = (crawl?.flip ?? 0) * Math.PI; // Update 0.9.7 — upside down on the ceiling
      spin.rotation.x = crawl?.tilt ?? 0; // Update 1.0.2 — upright up a stairwell's wall

      stride += moved * 2.2;
      const chasing = mode === 'chase';
      const swing = Math.sin(stride);
      legL.rotation.x = swing * 0.55;
      legR.rotation.x = -swing * 0.55;
      armL.rotation.x = -swing * (chasing ? 0.2 : 0.35) - (chasing ? 1.1 : 0);
      armR.rotation.x = swing * (chasing ? 0.2 : 0.35) - (chasing ? 1.1 : 0);
      body.rotation.x = THREE.MathUtils.lerp(body.rotation.x, chasing ? 0.35 : 0.05, 0.08);
      root.position.y = Math.abs(Math.cos(stride)) * 0.05;

      // Wrong, twitchy head: slow tilt plus sudden jerks.
      const jerk = Math.sin(t * 13.7) > 0.96 ? (Math.random() - 0.5) * 0.9 : 0;
      head.rotation.z = Math.sin(t * 0.7) * 0.35 + jerk;
      head.rotation.y = Math.sin(t * 0.43) * 0.25 + (mode === 'search' ? Math.sin(t * 3) * 0.6 : 0);
    },
    pose(pos, yaw) {
      root.position.set(pos.x, 0, pos.z);
      root.rotation.y = yaw;
    },
    lunge(k, t) {
      body.rotation.x = 0.1 * k;
      head.position.set(0, 2.38 - 0.5 * k, 0.55 * k);
      neck.scale.y = 1 + 2.5 * k;
      neck.position.set(0, 2.15 - 0.2 * k, 0.3 * k);
      neck.rotation.x = 1.0 * k;
      head.rotation.set(0, 0, Math.sin(t * 40) * 0.12 * k + 0.3 * k);
      mouth.scale.set(1.3, 1.8 + 2.2 * k, 0.4);
      armL.rotation.x = -1.0 * k;
      armR.rotation.x = -1.0 * k;
      armL.rotation.z = -0.35 * k;
      armR.rotation.z = 0.35 * k;
    },
    dispose: () => disposables.forEach((x) => x.dispose()),
  };
}
