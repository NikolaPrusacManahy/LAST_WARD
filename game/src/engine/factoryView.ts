// Update 1.0.1 — Harrow Mill built from the factory kit (world/factory.ts says where each piece goes): a
// panel on every wall face, concrete slabs on the floors (grating on the gantry upstairs), rusted plates on
// the ceilings, the steel stairs and the round lamps. Walls, floors and roof plates are drawn in batches
// (one InstancedMesh per piece). Loads in the background: the plain floor, ceiling and stairs
// (engine/buildLevel.ts) stand in until it's there, and the walls' own texture is under the panels.
import * as THREE from 'three';
import { Level, WALL_HEIGHT, floorAt, floorOffset } from '../world/level';
import { LiningPiece, PANEL_STRETCH, floorTiles, liningFaces, roofTiles, stairPlacements } from '../world/factory';
import type { LevelView } from './buildLevel';
import { kitParts, kitPiece } from './factoryKit';

export interface FactoryView {
  root: THREE.Group;
  dispose(): void;
}

const Y_AXIS = new THREE.Vector3(0, 1, 0);
const FLIP = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI);

export function createFactoryView(level: Level, view: LevelView): FactoryView {
  const root = new THREE.Group();
  const owned: { dispose(): void }[] = [];
  let disposed = false;

  /** Logic position → where it really is (its floor lifted up / slid back), as a matrix. */
  const place = (x: number, y: number, z: number, yaw: number, scale: [number, number, number] = [1, 1, 1], flip = false) => {
    const o = floorOffset(level, floorAt(level, { x, z }));
    const q = new THREE.Quaternion().setFromAxisAngle(Y_AXIS, yaw);
    if (flip) q.multiply(FLIP);
    return new THREE.Matrix4().compose(new THREE.Vector3(x, y + o.y, z + o.z), q, new THREE.Vector3(...scale));
  };

  /** One InstancedMesh per mesh of the piece, a copy at each matrix. */
  const batch = async (piece: string, at: THREE.Matrix4[], shadows: boolean) => {
    if (!at.length) return;
    const parts = await kitParts(piece);
    if (disposed) return;
    const m = new THREE.Matrix4();
    for (const part of parts) {
      const mesh = new THREE.InstancedMesh(part.geometry, part.material, at.length);
      at.forEach((a, i) => mesh.setMatrixAt(i, m.multiplyMatrices(a, part.local)));
      mesh.castShadow = shadows;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false; // spread over the whole level
      root.add(mesh);
      owned.push(mesh);
    }
  };

  const walls = new Map<LiningPiece, THREE.Matrix4[]>();
  for (const f of liningFaces(level)) {
    if (!walls.has(f.piece)) walls.set(f.piece, []);
    walls.get(f.piece)!.push(place(f.x, WALL_HEIGHT / 2, f.z, f.yaw, [1, PANEL_STRETCH, 1]));
  }
  const floors = floorTiles(level);
  const surfaces = Promise.all([
    ...[...walls].map(([piece, at]) => batch(piece, at, true)),
    batch('floor', floors.filter((t) => !t.grate).map((t) => place(t.x, 0.002, t.z, 0)), false),
    batch('grate', floors.filter((t) => t.grate).map((t) => place(t.x, 0.002, t.z, 0)), false),
    // The plates turned over: their rusted face down, flush with the ceiling.
    batch('roof', roofTiles(level).map((t) => place(t.x, WALL_HEIGHT, t.z, 0, [1, 1, 1], true)), false),
    ...stairPlacements(level).map(async (s) => {
      const obj = await kitPiece('stairs');
      if (disposed) return;
      obj.applyMatrix4(place(s.x, 0, s.z, s.yaw, s.scale));
      root.add(obj);
    }),
  ]);
  void surfaces
    .then(() => {
      if (!disposed) view.plain.forEach((o) => (o.visible = false));
    })
    .catch((err) => console.warn('Factory kit failed to load.', err));

  // The round factory lamps at every ceiling lamp: they glow with the lamp's flicker (engine/lighting.ts).
  if (view.lamps.length) {
    void kitPiece('lamp')
      .then((template) => {
        if (disposed) return;
        for (const lamp of view.lamps) {
          const obj = template.clone(true);
          obj.traverse((o) => {
            const m = o as THREE.Mesh;
            if (!m.isMesh) return;
            m.castShadow = false;
            const mat = (m.material as THREE.MeshStandardMaterial).clone();
            mat.emissive = new THREE.Color(0xdde8ff);
            mat.emissiveMap = mat.map;
            mat.emissiveIntensity = 0.1;
            m.material = mat;
            lamp.glow.push(mat);
            owned.push(mat);
          });
          obj.position.copy(lamp.fixture.position);
          obj.position.y = lamp.fixture.position.y + 0.05 - 0.07; // hangs from the ceiling (13 cm tall)
          root.add(obj);
          lamp.fixture.visible = false;
        }
      })
      .catch((err) => console.warn('Factory lamps failed to load.', err));
  }

  return {
    root,
    dispose() {
      disposed = true;
      owned.forEach((d) => d.dispose());
    },
  };
}
