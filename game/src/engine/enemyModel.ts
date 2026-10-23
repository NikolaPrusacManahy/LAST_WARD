// Update 0.2 — the rigged Patient (Mixamo "Parasite", converted to public/models/patient.glb).
// Same EnemyView contract as the primitive fallback in enemyView.ts.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { EnemyMode } from '../world/enemyAI';
import type { EnemyView } from './enemyView';
import { EnemyClip, chooseEnemyClip, clipTimeScale } from './enemyAnim';

export const PATIENT_URL = '/models/patient.glb';
const SCALE = 1.15; // ~2.25 m tall: a bit too big to be human
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
  root.add(model);
  const head = model.getObjectByName('mixamorigHead') ?? model;

  const mixer = new THREE.AnimationMixer(model);
  const actions = new Map<EnemyClip, THREE.AnimationAction>();
  for (const clip of gltf.animations) {
    const a = mixer.clipAction(clip);
    if (clip.name === 'scream' || clip.name === 'attack') {
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
    update(pos, dir, mode: EnemyMode, moved, t, windingUp = false) {
      const dt = tick(t);
      root.position.set(pos.x, 0, pos.z);
      const targetYaw = Math.atan2(dir.x, dir.z);
      const d = Math.atan2(Math.sin(targetYaw - yaw), Math.cos(targetYaw - yaw));
      yaw += d * Math.min(1, dt * 10);
      root.rotation.y = yaw;
      if (dt > 0) speed += (moved / dt - speed) * Math.min(1, dt * 8);
      const clip = chooseEnemyClip(mode, speed, windingUp);
      play(clip, clipTimeScale(clip, speed));
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
