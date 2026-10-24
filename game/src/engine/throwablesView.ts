// Update 0.9.6 — draws the bricks and bottles (state/throwables.ts): lying about, held in front of you,
// or flying (spinning). Models from public/models/props/brick.glb and bottle.glb, loaded in the background.
// Update 0.9.8 — and everything else you carry: fuses and batteries (the glowing ones that used to sit on
// the tables) and the med kit (public/models/props/medkit.glb), on a table, on the floor or in your hand.
// None of them casts a shadow (in your hand, with the flashlight on, one fell across the whole screen).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { CarryKind, Throwable, Vec3 } from '../state/throwables';

export interface ThrowablesView {
  root: THREE.Group;
  /** `place(p)`: logic position → where to draw it (floors). `held`: the one in your hand, drawn there. */
  update(items: Throwable[], place: (p: Vec3) => Vec3, held: { id: number; pos: Vec3; quat: THREE.Quaternion } | null, t: number): void;
  dispose(): void;
}

/** How each lies: turned over (x, rad) and raised (m) so it rests on its side / flat. */
const LIE: Record<CarryKind, { tilt: number; lift: number }> = {
  brick: { tilt: 0, lift: 0 },
  bottle: { tilt: Math.PI / 2, lift: 0.031 },
  fuse: { tilt: Math.PI / 2, lift: 0.065 },
  battery: { tilt: Math.PI / 2, lift: 0.05 },
  medkit: { tilt: -Math.PI / 2, lift: 0.04 },
};

export function createThrowablesView(): ThrowablesView {
  const root = new THREE.Group();
  const loader = new GLTFLoader();
  const models: Partial<Record<CarryKind, THREE.Object3D>> = {};
  const owned: { dispose(): void }[] = [];
  const objs = new Map<number, THREE.Object3D>();
  let disposed = false;
  const noShadow = (o: THREE.Object3D) =>
    o.traverse((x) => {
      const m = x as THREE.Mesh;
      if (!m.isMesh) return;
      m.castShadow = false;
      m.receiveShadow = true;
    });
  for (const kind of ['brick', 'bottle', 'medkit'] as CarryKind[]) {
    loader
      .loadAsync(`/models/props/${kind}.glb`)
      .then((g) => {
        if (disposed) return;
        g.scene.traverse((o) => {
          const m = o as THREE.Mesh;
          if (!m.isMesh) return;
          owned.push(m.geometry);
          const mats = Array.isArray(m.material) ? m.material : [m.material];
          mats.forEach((x) => owned.push(x));
        });
        noShadow(g.scene);
        if (kind === 'medkit') {
          // Its origin at its middle (it's 23 cm tall, base on the floor), so it turns and lies about its centre.
          const pivot = new THREE.Group();
          g.scene.position.y = -0.115;
          pivot.add(g.scene);
          models[kind] = pivot;
        } else models[kind] = g.scene;
      })
      .catch((err) => console.warn(`Carried item ${kind} failed to load.`, err));
  }
  // The fuse and the battery: the glowing ones from the tables (so you can spot them in the dark).
  const track = <T extends { dispose(): void }>(x: T) => (owned.push(x), x);
  const capMat = track(new THREE.MeshStandardMaterial({ color: 0x999999, metalness: 0.9, roughness: 0.3 }));
  const fuse = new THREE.Group();
  const fuseBody = new THREE.Mesh(track(new THREE.CylinderGeometry(0.06, 0.06, 0.26, 12)), track(new THREE.MeshStandardMaterial({ color: 0x331a00, emissive: 0xff8a1a, emissiveIntensity: 1.6 })));
  const capGeo = track(new THREE.CylinderGeometry(0.065, 0.065, 0.05, 12));
  const capA = new THREE.Mesh(capGeo, capMat);
  const capB = new THREE.Mesh(capGeo, capMat);
  capA.position.y = 0.14;
  capB.position.y = -0.14;
  fuse.add(fuseBody, capA, capB);
  models.fuse = fuse;
  models.battery = new THREE.Mesh(track(new THREE.BoxGeometry(0.1, 0.22, 0.1)), track(new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0x2dff6a, emissiveIntensity: 0.8 })));
  noShadow(fuse);
  noShadow(models.battery);

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
        // In a slot: only the one in your hand shows.
        o.visible = it.state !== 'gone' && !(it.state === 'held' && held?.id !== it.id);
        if (!o.visible) continue;
        // Update 0.9.6 — thrown once, a brick is broken in half (half its length, along its local z).
        o.scale.set(1, 1, it.kind === 'brick' && it.throws > 0 ? 0.5 : 1);
        if (it.state === 'held' && held) {
          // The med kit is a bulky case: smaller in your hand, or it fills the corner of the screen.
          if (it.kind === 'medkit') o.scale.setScalar(0.65);
          o.position.set(held.pos.x, held.pos.y + Math.sin(t * 1.7) * 0.008, held.pos.z);
          o.quaternion.copy(held.quat).multiply(tilt);
          continue;
        }
        const w = place(it.pos);
        o.position.set(w.x, w.y, w.z);
        if (it.state === 'flying') o.rotation.set(it.yaw * 0.8, it.yaw, it.yaw * 0.5);
        else {
          // Lying on the floor or a table: a brick flat, the rest on their side (the med kit flat).
          const lie = LIE[it.kind];
          o.rotation.set(lie.tilt, it.yaw, 0, 'YXZ');
          o.position.y += lie.lift;
        }
      }
    },
    dispose() {
      disposed = true;
      owned.forEach((d) => d.dispose());
    },
  };
}
