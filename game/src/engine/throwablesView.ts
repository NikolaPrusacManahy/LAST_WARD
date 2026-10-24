// Update 0.9.6 — draws the bricks and bottles (state/throwables.ts): lying about, held in front of you,
// or flying (spinning). Models from public/models/props/brick.glb and bottle.glb, loaded in the background.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { Throwable, ThrowableKind, Vec3 } from '../state/throwables';

export interface ThrowablesView {
  root: THREE.Group;
  /** `place(p)`: logic position → where to draw it (floors). `held`: the one in your hand, drawn there. */
  update(items: Throwable[], place: (p: Vec3) => Vec3, held: { pos: Vec3; quat: THREE.Quaternion } | null, t: number): void;
  dispose(): void;
}

export function createThrowablesView(): ThrowablesView {
  const root = new THREE.Group();
  const loader = new GLTFLoader();
  const models: Partial<Record<ThrowableKind, THREE.Object3D>> = {};
  const owned: { dispose(): void }[] = [];
  const objs = new Map<number, THREE.Object3D>();
  let disposed = false;
  for (const kind of ['brick', 'bottle'] as ThrowableKind[]) {
    loader
      .loadAsync(`/models/props/${kind}.glb`)
      .then((g) => {
        if (disposed) return;
        g.scene.traverse((o) => {
          const m = o as THREE.Mesh;
          if (!m.isMesh) return;
          m.castShadow = true;
          m.receiveShadow = true;
          owned.push(m.geometry);
          const mats = Array.isArray(m.material) ? m.material : [m.material];
          mats.forEach((x) => owned.push(x));
        });
        models[kind] = g.scene;
      })
      .catch((err) => console.warn(`Throwable ${kind} failed to load.`, err));
  }
  const tilt = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.35, 0.6, 0.15));
  return {
    root,
    update(items, place, held, t) {
      for (const it of items) {
        let o = objs.get(it.id);
        if (!o) {
          const m = models[it.kind];
          if (!m) continue;
          o = m.clone(true);
          objs.set(it.id, o);
          root.add(o);
        }
        o.visible = it.state !== 'gone' && !(it.state === 'held' && !held);
        if (!o.visible) continue;
        if (it.state === 'held' && held) {
          o.position.set(held.pos.x, held.pos.y + Math.sin(t * 1.7) * 0.008, held.pos.z);
          o.quaternion.copy(held.quat).multiply(tilt);
          continue;
        }
        const w = place(it.pos);
        o.position.set(w.x, w.y, w.z);
        if (it.state === 'flying') o.rotation.set(it.yaw * 0.8, it.yaw, it.yaw * 0.5);
        // On the ground: a brick lies flat; a bottle lies on its side.
        else o.rotation.set(it.kind === 'bottle' ? Math.PI / 2 : 0, it.yaw, 0, 'YXZ');
        if (it.state === 'ground' && it.kind === 'bottle') o.position.y += 0.031;
      }
    },
    dispose() {
      disposed = true;
      owned.forEach((d) => d.dispose());
    },
  };
}
