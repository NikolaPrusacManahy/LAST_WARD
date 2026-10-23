// Update 0.3 — first-person body ("full body awareness"): the Mixamo player model stands just
// behind the camera with its head hidden, so legs and torso show when you look down.
// Update 0.3.1 — no torch model (the light comes from the camera); arms tuck away while sprinting
// so the pumping hands never swing into view.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { Gait } from '../state/playerRules';
import { PlayerClip, armScaleFor, bodyBackOffset, bodyRootFor, choosePlayerClip, playerClipTimeScale } from './playerAnim';

export const PLAYER_URL = '/models/player.glb';
const FADE = 0.2;

export interface BodyInput {
  pos: { x: number; z: number };
  yaw: number;
  pitch: number;
  gait: Gait;
  crouching: boolean;
  speed: number;
  camera: THREE.Camera;
  dt: number;
  flashlightOn: boolean;
}

export interface PlayerBody {
  root: THREE.Group;
  update(i: BodyInput): void;
  setVisible(v: boolean): void;
  dispose(): void;
}

const find = (root: THREE.Object3D, re: RegExp) => {
  let hit: THREE.Object3D | undefined;
  root.traverse((o) => {
    if (!hit && re.test(o.name)) hit = o;
  });
  if (!hit) throw new Error(`Player rig is missing ${re}`);
  return hit;
};

export async function loadPlayerBody(eyeHeight: number): Promise<PlayerBody> {
  const gltf = await new GLTFLoader().loadAsync(PLAYER_URL);
  const model = gltf.scene;
  const root = new THREE.Group();
  root.add(model);

  model.traverse((o) => {
    const m = o as THREE.SkinnedMesh;
    if (!m.isMesh) return;
    m.castShadow = false; // the flashlight sits at the eyes: the body must not block the beam
    m.receiveShadow = false;
    m.frustumCulled = false;
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    for (const mat of mats as THREE.MeshStandardMaterial[]) {
      mat.metalness = 0;
      if (mat.transparent) {
        mat.transparent = false;
        mat.alphaTest = 0.5;
      }
    }
  });

  const head = find(model, /Head$/);
  const arms = [find(model, /LeftArm$/), find(model, /RightArm$/)];
  let armScale = 1;

  const mixer = new THREE.AnimationMixer(model);
  const actions = new Map<PlayerClip, THREE.AnimationAction>();
  for (const clip of gltf.animations) actions.set(clip.name as PlayerClip, mixer.clipAction(clip));

  // Scale so the eyes (≈10 cm above the head bone) sit at camera height.
  actions.get('idle')?.play();
  mixer.update(0);
  model.updateWorldMatrix(true, true);
  const headY = head.getWorldPosition(new THREE.Vector3()).y;
  model.scale.setScalar(eyeHeight / (headY + 0.1));
  head.scale.setScalar(0.001); // hides head, hair and eyelashes (all skinned to it)

  let current: PlayerClip | null = null;
  const play = (clip: PlayerClip, timeScale: number) => {
    const next = actions.get(clip) ?? actions.get('idle');
    if (!next) return;
    next.timeScale = timeScale;
    if (current === clip) return;
    const prev = current ? actions.get(current) : undefined;
    next.reset().play();
    if (prev) next.crossFadeFrom(prev, FADE, false);
    current = clip;
  };

  const headPos = new THREE.Vector3();
  const headDelta = { x: 0, z: 0 };

  return {
    root,
    update(i) {
      const clip = choosePlayerClip(i.gait, i.crouching);
      play(clip, playerClipTimeScale(clip, i.speed));
      mixer.update(i.dt);

      // Update 0.4.2 — measure where the animated head is, then place the body so the head sits
      // just behind the camera (crouch/run lean forward; a fixed offset put the camera in the collar).
      const fwd = { x: -Math.sin(i.yaw), z: -Math.cos(i.yaw) };
      root.position.set(i.pos.x, 0, i.pos.z);
      root.rotation.y = i.yaw + Math.PI; // Mixamo faces +Z
      root.updateWorldMatrix(true, true);
      head.getWorldPosition(headPos);
      const k = Math.min(1, i.dt * 12);
      headDelta.x += (headPos.x - i.pos.x - headDelta.x) * k;
      headDelta.z += (headPos.z - i.pos.z - headDelta.z) * k;
      const at = bodyRootFor(i.pos, headDelta, fwd, bodyBackOffset(i.pitch));
      root.position.set(at.x, 0, at.z);

      // Tuck the arms away (shrink into the shoulders) while sprinting, ease back after.
      armScale += (armScaleFor(clip) - armScale) * Math.min(1, i.dt * 12);
      const s = Math.max(0.001, armScale);
      for (const a of arms) a.scale.setScalar(s);
    },
    setVisible(v) {
      root.visible = v;
    },
    dispose() {
      mixer.stopAllAction();
      root.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        m.geometry.dispose();
        const mats = Array.isArray(m.material) ? m.material : [m.material];
        for (const mat of mats as THREE.MeshStandardMaterial[]) {
          mat.map?.dispose();
          mat.normalMap?.dispose();
          mat.roughnessMap?.dispose();
          mat.dispose();
        }
      });
    },
  };
}
