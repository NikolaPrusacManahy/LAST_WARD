// Update 0.2 — the rigged Patient (Mixamo "Parasite", converted to public/models/patient.glb). Update 0.9.9 — a new
// model (Nikola's, Mixamo "Ch30"), with the same animations (the converter fits them to its hips).
// Same EnemyView contract as the primitive fallback in enemyView.ts.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { EnemyMode } from '../world/enemyAI';
import type { EnemyView } from './enemyView';
import { CRAWL_FLIP_PIVOT, EnemyClip, chooseEnemyClip, clipTimeScale } from './enemyAnim';
import { CRAWL } from '../world/enemyAI';

export const PATIENT_URL = '/models/patient.glb';
const SCALE = 1.32; // ~2.33 m tall, as the old one was: a bit too big to be human (the model is 1.77 m)
const FADE = 0.25;
/** Attack clip: rears back at ~0.7 s, lunges at ~1.5 s. Start just before the rear-up. */
const ATTACK_START = 0.55;

export async function loadEnemyModel(url = PATIENT_URL): Promise<EnemyView> {
  const gltf = await new GLTFLoader().loadAsync(url);
  const model = gltf.scene;
  model.scale.setScalar(SCALE);
  model.traverse((o) => {
    const m = o as THREE.SkinnedMesh;
    if (!m.isMesh) return;
    m.castShadow = true;
    m.frustumCulled = false; // skinned bounds don't follow the animation
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    for (const mat of mats as THREE.MeshStandardMaterial[]) {
      // Converter defaults were shiny-metal; make it wet skin instead. No alpha sorting on a skinned mesh.
      mat.metalness = 0;
      mat.roughness = 0.55;
      if (mat.transparent) {
        mat.transparent = false;
        mat.alphaTest = 0.5;
      }
    }
  });

  const root = new THREE.Group();
  // Update 0.9.7 — it turns over onto the ceiling about its middle (spin), not its feet: turning about its
  // feet swung its whole body out sideways into the corridor walls.
  const spin = new THREE.Group();
  spin.position.y = CRAWL_FLIP_PIVOT;
  model.position.y = -CRAWL_FLIP_PIVOT;
  spin.add(model);
  root.add(spin);
  const head = model.getObjectByName('mixamorigHead') ?? model;
  const handL = model.getObjectByName('mixamorigLeftHand');
  const handR = model.getObjectByName('mixamorigRightHand');
  const tmpH = new THREE.Vector3();

  const mixer = new THREE.AnimationMixer(model);
  const actions = new Map<EnemyClip, THREE.AnimationAction>();
  for (const clip of gltf.animations) {
    const a = mixer.clipAction(clip);
    if (['scream', 'attack', 'grab', 'throw', 'jumpUp'].includes(clip.name)) {
      a.setLoop(THREE.LoopOnce, 1);
      a.clampWhenFinished = true;
    }
    actions.set(clip.name as EnemyClip, a);
  }
  let current: EnemyClip | null = null;
  const play = (clip: EnemyClip, timeScale: number, from?: number) => {
    const next = actions.get(clip) ?? actions.get('idle');
    if (!next) return;
    next.timeScale = timeScale;
    if (current === clip) return;
    const prev = current ? actions.get(current) : undefined;
    next.reset();
    if (from !== undefined) next.time = from;
    next.play();
    if (prev) next.crossFadeFrom(prev, from !== undefined ? 0.08 : FADE, false);
    current = clip;
  };

  let lastT: number | null = null;
  let speed = 0;
  let yaw = 0;
  const tick = (t: number) => {
    const dt = lastT === null ? 0 : Math.min(0.1, t - lastT);
    lastT = t;
    return dt;
  };

  return {
    root,
    head,
    hands(out) {
      if (!handL || !handR) return head.getWorldPosition(out);
      handL.getWorldPosition(out);
      return out.add(handR.getWorldPosition(tmpH)).multiplyScalar(0.5);
    },
    update(pos, dir, mode: EnemyMode, moved, t, windingUp = false, crawl = null) {
      const dt = tick(t);
      root.position.set(pos.x, 0, pos.z);
      const targetYaw = Math.atan2(dir.x, dir.z);
      const d = Math.atan2(Math.sin(targetYaw - yaw), Math.cos(targetYaw - yaw));
      yaw += d * Math.min(1, dt * 10);
      root.rotation.y = yaw;
      spin.rotation.z = (crawl?.flip ?? 0) * Math.PI; // Update 0.9.7 — upside down on the ceiling
      // A teleport (metres in one frame) isn't running: don't let it spike the gait.
      if (dt > 0) speed += ((moved > 2 ? 0 : moved) / dt - speed) * Math.min(1, dt * 8);
      if (crawl) {
        // Update 0.9.7 — going up / coming down: the jump clip at the time the AI gives (forwards or back).
        play(crawl.clip, crawl.timeScale);
        const jump = actions.get('jumpUp');
        if (crawl.clip === 'jumpUp' && jump) jump.time = Math.min(crawl.time ?? 0, CRAWL.jumpTop);
      } else {
        const clip = chooseEnemyClip(mode, speed, windingUp);
        play(clip, clipTimeScale(clip, speed));
      }
      mixer.update(dt);
    },
    pose(pos, yawNow, clip, t, timeScale = 1, from) {
      const dt = tick(t);
      root.position.set(pos.x, 0, pos.z);
      yaw = yawNow;
      root.rotation.y = yawNow;
      spin.rotation.z = 0;
      play((actions.has(clip as EnemyClip) ? clip : 'idle') as EnemyClip, timeScale, from);
      mixer.update(dt);
    },
    lunge(_k, t) {
      const dt = tick(t);
      play('attack', 1.25, ATTACK_START);
      mixer.update(dt);
    },
    dispose() {
      mixer.stopAllAction();
      model.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        m.geometry.dispose();
        const mats = Array.isArray(m.material) ? m.material : [m.material];
        for (const mat of mats as THREE.MeshStandardMaterial[]) {
          mat.map?.dispose();
          mat.normalMap?.dispose();
          mat.dispose();
        }
      });
    },
  };
}
