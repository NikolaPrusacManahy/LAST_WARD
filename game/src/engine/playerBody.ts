// Update 0.3 — first-person body ("full body awareness"): the Mixamo player model stands just
// behind the camera with its head hidden. Legs and torso show when you look down; the right
// arm is posed every frame to hold the flashlight toward where you look.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { Gait } from '../state/playerRules';
import { PlayerClip, choosePlayerClip, playerClipTimeScale } from './playerAnim';

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
  /** World position of the flashlight lens (the beam starts here). */
  lens: THREE.Vector3;
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

const vA = new THREE.Vector3();
const vB = new THREE.Vector3();
const qA = new THREE.Quaternion();
const qB = new THREE.Quaternion();
const qC = new THREE.Quaternion();

/** Rotates `bone` (in world space) so the direction bone → child points along `dir`. */
function aim(bone: THREE.Object3D, child: THREE.Object3D, dir: THREE.Vector3) {
  bone.updateWorldMatrix(true, true);
  const cur = child.getWorldPosition(vA).sub(bone.getWorldPosition(vB)).normalize();
  qA.setFromUnitVectors(cur, dir);
  const world = bone.getWorldQuaternion(qB).premultiply(qA);
  const parent = bone.parent!.getWorldQuaternion(qC).invert();
  bone.quaternion.copy(parent.multiply(world));
  bone.updateWorldMatrix(false, true);
}

export async function loadPlayerBody(eyeHeight: number): Promise<PlayerBody> {
  const gltf = await new GLTFLoader().loadAsync(PLAYER_URL);
  const model = gltf.scene;
  const root = new THREE.Group();
  root.add(model);

  model.traverse((o) => {
    const m = o as THREE.SkinnedMesh;
    if (!m.isMesh) return;
    m.castShadow = false; // the flashlight sits inside the hand: its own arm must not block the beam
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
  const arm = find(model, /RightArm$/);
  const fore = find(model, /RightForeArm$/);
  const hand = find(model, /RightHand$/);
  const finger = find(model, /RightHandMiddle1$/);

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

  // A simple torch in the right hand. Bone axis (+Y) points toward the fingers.
  const torch = new THREE.Group();
  const metal = new THREE.MeshStandardMaterial({ color: 0x5a5e62, metalness: 0.5, roughness: 0.35 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.2, 12), metal);
  const bezel = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.024, 0.06, 14), metal);
  bezel.position.y = 0.125;
  const lensMat = new THREE.MeshBasicMaterial({ color: 0xfff3d6 });
  const lensMesh = new THREE.Mesh(new THREE.CircleGeometry(0.032, 14), lensMat);
  lensMesh.rotation.x = -Math.PI / 2;
  lensMesh.position.y = 0.156;
  torch.add(body, bezel, lensMesh);
  torch.position.set(0.0, 0.05, 0.03);
  // Undo the model scale so the torch keeps real size.
  torch.scale.setScalar(1 / model.scale.x);
  hand.add(torch);

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

  const fwd = new THREE.Vector3();
  const right = new THREE.Vector3();
  const down = new THREE.Vector3();
  const dir = new THREE.Vector3();
  const lens = new THREE.Vector3();

  return {
    root,
    lens,
    update(i) {
      const clip = choosePlayerClip(i.gait, i.crouching);
      play(clip, playerClipTimeScale(clip, i.speed));
      mixer.update(i.dt);

      // Stand behind the camera; step further back when looking down so the view never ends up inside the chest.
      const back = 0.05 + 0.3 * Math.max(0, -i.pitch);
      const fx = -Math.sin(i.yaw);
      const fz = -Math.cos(i.yaw);
      root.position.set(i.pos.x - fx * back, 0, i.pos.z - fz * back);
      root.rotation.y = i.yaw + Math.PI; // Mixamo faces +Z
      root.updateWorldMatrix(true, true);

      // Flashlight arm: upper arm down-forward, forearm and hand along the view.
      i.camera.getWorldDirection(fwd);
      right.set(1, 0, 0).applyQuaternion(i.camera.quaternion);
      down.set(0, -1, 0).applyQuaternion(i.camera.quaternion);
      aim(arm, fore, dir.copy(fwd).multiplyScalar(0.9).addScaledVector(down, 0.3).addScaledVector(right, 0.05).normalize());
      aim(fore, hand, dir.copy(fwd).multiplyScalar(0.9).addScaledVector(down, -0.32).addScaledVector(right, -0.22).normalize());
      aim(hand, finger, fwd);
      lensMesh.getWorldPosition(lens);
      lensMat.color.setHex(i.flashlightOn ? 0xfff3d6 : 0x222222);
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
