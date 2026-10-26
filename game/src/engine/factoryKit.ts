// Update 1.0.1 — the factory kit (world/props.ts KIT_URL), loaded once per page and shared: Harrow Mill's
// walls, floors, roof, stairs, lamps and props are all copies of its pieces (same geometry, same materials),
// so nothing here is disposed with a level.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { KIT_URL } from '../world/props';

let kit: Promise<THREE.Group> | null = null;

export function loadFactoryKit(): Promise<THREE.Group> {
  if (!kit) {
    kit = new GLTFLoader().loadAsync(KIT_URL).then((g) => {
      g.scene.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) m.castShadow = m.receiveShadow = true;
      });
      g.scene.updateMatrixWorld(true);
      return g.scene;
    });
    kit.catch(() => (kit = null)); // a failed load can be tried again by the next level
  }
  return kit;
}

/** One kit piece, in a group of its own to place (it keeps the scale and anchor the kit gave it). */
export async function kitPiece(name: string): Promise<THREE.Group> {
  const node = (await loadFactoryKit()).getObjectByName(name);
  if (!node) throw new Error(`No ${name} in the factory kit`);
  const g = new THREE.Group();
  g.add(node.clone(true));
  return g;
}

/** A piece's meshes with their place inside it: what to draw it with in batches (InstancedMesh). */
export async function kitParts(name: string): Promise<{ geometry: THREE.BufferGeometry; material: THREE.Material | THREE.Material[]; local: THREE.Matrix4 }[]> {
  const node = (await loadFactoryKit()).getObjectByName(name);
  if (!node) throw new Error(`No ${name} in the factory kit`);
  const inv = node.parent ? new THREE.Matrix4().copy(node.parent.matrixWorld).invert() : new THREE.Matrix4();
  const parts: { geometry: THREE.BufferGeometry; material: THREE.Material | THREE.Material[]; local: THREE.Matrix4 }[] = [];
  node.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) parts.push({ geometry: m.geometry, material: m.material, local: new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld) });
  });
  return parts;
}
