// Turns a parsed Level into three.js meshes. Rendering only — rules live in world/.
// Update 0.7 — several floors: each floor is drawn where it really is (lifted by WALL_HEIGHT per floor
// and slid back over floor 0, world/level.ts floorOffset); Game moves the whole root so the floor
// you're on sits at the logic coordinates the rules use.
import * as THREE from 'three';
import { Level, TILE, WALL_HEIGHT, Vec2, cellCenter, isSolid, Cell, itemPos, FACE_DIR, floorOfRow, floorOffset, portalAt } from '../world/level';
import { ceilingTexture, floorTexture, noteTexture, signTexture, wallNoteTexture, wallTexture, WallVariant } from './textures';

export interface LampView {
  light: THREE.PointLight;
  mat: THREE.MeshStandardMaterial;
  phase: number;
  /** Update 0.7 — lamps only light the floor you're on (lights shine through floors otherwise). */
  floor: number;
  /** Update 0.8 — the plain box fixture (hidden once the fluorescent model is in) and the model's
   *  glowing materials, driven together with `mat`. */
  fixture: THREE.Mesh;
  glow: THREE.MeshStandardMaterial[];
}

export interface LevelView {
  root: THREE.Group;
  lamps: LampView[];
  items: Map<string, THREE.Object3D>;
  spinners: THREE.Object3D[];
  generatorLamp: THREE.MeshStandardMaterial;
  /** Update 0.8 — the stand-in generator (hidden once the model is in) and its status light. */
  generatorStandIn: THREE.Object3D[];
  generatorBulb: THREE.Mesh;
  /** Where the generator really is (world, all floors). */
  generatorPos: THREE.Vector3;
  exitSign: THREE.MeshBasicMaterial;
  exitDoor: THREE.Mesh;
  exitDoorClosedPos: THREE.Vector3;
  exitDoorSlide: THREE.Vector3;
  dispose(): void;
}

const hash = (c: number, r: number) => {
  let h = (c * 374761393 + r * 668265263) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

/** Direction from a fixture cell toward its walkable neighbour. */
function openSide(level: Level, cell: Cell): { dc: number; dr: number } {
  for (const [dc, dr] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
    if (!isSolid(level, cell.col + dc, cell.row + dr)) return { dc, dr };
  }
  return { dc: -1, dr: 0 };
}

export function buildLevel(level: Level): LevelView {
  const root = new THREE.Group();
  const disposables: { dispose(): void }[] = [];
  const track = <T extends { dispose(): void }>(x: T) => (disposables.push(x), x);
  // Update 0.7 — logic position → where it really is (its floor lifted up / slid back).
  const at = (p: Vec2, y: number, row = Math.floor(p.z / TILE)) => {
    const o = floorOffset(level, Math.max(0, floorOfRow(level, row)));
    return new THREE.Vector3(p.x, y + o.y, p.z + o.z);
  };
  const atCell = (c: Cell, y: number) => at(cellCenter(c), y, c.row);
  const idx = (col: number, row: number) => row * level.cols + col;
  const walkable = (col: number, row: number) => !isSolid(level, col, row);
  const isStair = new Set<number>();
  for (const run of level.stairs) for (const c of run.cells) isStair.add(idx(c.col, c.row));

  // --- Walls: one InstancedMesh per texture variant, only cells that touch floor.
  // Update 0.7 — "opaque" cells: walls, the exit, and the block under a stair landing (walkable for the
  // stairs' portal, but it's solid wall on that floor). Stairwells (voids) aren't walls.
  const wallGeo = track(new THREE.BoxGeometry(TILE, WALL_HEIGHT, TILE));
  const byVariant: Record<WallVariant, THREE.Matrix4[]> = { plain: [], stained: [], blood: [], writing: [] };
  let writings = 0;
  for (let row = 0; row < level.rows; row++) {
    if (floorOfRow(level, row) < 0) continue;
    for (let col = 0; col < level.cols; col++) {
      if (!level.opaque[idx(col, row)]) continue;
      if (level.generator.col === col && level.generator.row === row) continue;
      let touches = false;
      for (let dr = -1; dr <= 1 && !touches; dr++)
        for (let dc = -1; dc <= 1; dc++)
          if (!isSolid(level, col + dc, row + dr) && col + dc >= 0 && row + dr >= 0 && col + dc < level.cols && row + dr < level.rows) touches = true;
      if (!touches) continue;
      const h = hash(col, row);
      let v: WallVariant = h < 0.5 ? 'plain' : h < 0.88 ? 'stained' : 'blood';
      if (h > 0.97 && writings < 2) {
        v = 'writing';
        writings++;
      }
      const w = atCell({ col, row }, WALL_HEIGHT / 2);
      byVariant[v].push(new THREE.Matrix4().makeTranslation(w.x, w.y, w.z));
    }
  }
  (Object.keys(byVariant) as WallVariant[]).forEach((v, i) => {
    const list = byVariant[v];
    if (!list.length) return;
    const mat = track(new THREE.MeshStandardMaterial({ map: track(wallTexture(v, 11 + i)), roughness: 0.92 }));
    const mesh = new THREE.InstancedMesh(wallGeo, mat, list.length);
    list.forEach((m, k) => mesh.setMatrixAt(k, m));
    mesh.receiveShadow = true;
    mesh.castShadow = true;
    root.add(mesh);
  });

  // --- Floor + ceiling, one tile per cell (Update 0.7: holes where the stairs go up through).
  const floorTiles: THREE.Matrix4[] = [];
  const ceilTiles: THREE.Matrix4[] = [];
  const flat = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));
  const down = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0));
  const one = new THREE.Vector3(1, 1, 1);
  for (let row = 0; row < level.rows; row++) {
    if (floorOfRow(level, row) < 0) continue;
    for (let col = 0; col < level.cols; col++) {
      const i = idx(col, row);
      const open = walkable(col, row) && !level.opaque[i];
      const stairwell = level.voids[i];
      if (open && !stairwell) floorTiles.push(new THREE.Matrix4().compose(atCell({ col, row }, 0), flat, one));
      // Ceiling over every open cell and stairwell, except over a flight going up from this floor.
      if ((open || stairwell) && !isStair.has(i)) ceilTiles.push(new THREE.Matrix4().compose(atCell({ col, row }, WALL_HEIGHT), down, one));
    }
  }
  const tileGeo = track(new THREE.PlaneGeometry(TILE, TILE));
  const fTex = track(floorTexture());
  const floor = new THREE.InstancedMesh(tileGeo, track(new THREE.MeshStandardMaterial({ map: fTex, roughness: 0.75, metalness: 0.05 })), floorTiles.length);
  floorTiles.forEach((m, k) => floor.setMatrixAt(k, m));
  floor.receiveShadow = true;
  root.add(floor);
  const cTex = track(ceilingTexture());
  cTex.repeat.set(2, 2);
  const ceiling = new THREE.InstancedMesh(tileGeo, track(new THREE.MeshStandardMaterial({ map: cTex, roughness: 1 })), ceilTiles.length);
  ceilTiles.forEach((m, k) => ceiling.setMatrixAt(k, m));
  root.add(ceiling);

  // --- Update 0.7: stairs (a block per step) and railings round the stairwell upstairs.
  if (level.stairs.length) {
    const stepGeo = track(new THREE.BoxGeometry(1, 1, 1));
    const stepMat = track(new THREE.MeshStandardMaterial({ color: 0x3b2a1e, roughness: 0.85 }));
    const steps: THREE.Matrix4[] = [];
    const STEPS_PER_TILE = 8;
    for (const run of level.stairs) {
      const d = FACE_DIR[run.dir];
      const n = run.cells.length * STEPS_PER_TILE;
      const depth = (run.cells.length * TILE) / n;
      const first = cellCenter(run.cells[0]);
      const bottom = { x: first.x - (d.dc * TILE) / 2, z: first.z - (d.dr * TILE) / 2 };
      for (let k = 0; k < n; k++) {
        const h = ((k + 1) / n) * WALL_HEIGHT;
        const mid = { x: bottom.x + d.dc * depth * (k + 0.5), z: bottom.z + d.dr * depth * (k + 0.5) };
        const p = at(mid, h / 2, run.cells[0].row);
        const size = new THREE.Vector3(d.dc !== 0 ? depth : TILE - 0.02, h, d.dr !== 0 ? depth : TILE - 0.02);
        steps.push(new THREE.Matrix4().compose(p, new THREE.Quaternion(), size));
      }
    }
    const stairMesh = new THREE.InstancedMesh(stepGeo, stepMat, steps.length);
    steps.forEach((m, k) => stairMesh.setMatrixAt(k, m));
    stairMesh.castShadow = stairMesh.receiveShadow = true;
    root.add(stairMesh);

    const railMat = track(new THREE.MeshStandardMaterial({ color: 0x2a1d14, roughness: 0.7 }));
    const rails: THREE.Matrix4[] = [];
    for (let row = 0; row < level.rows; row++) {
      for (let col = 0; col < level.cols; col++) {
        if (!level.voids[idx(col, row)] || walkable(col, row)) continue; // the top step's well is the way down
        for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nc = col + dc;
          const nr = row + dr;
          if (!walkable(nc, nr) || portalAt(level, { col: nc, row: nr })) continue;
          const c = cellCenter({ col, row });
          const p = at({ x: c.x + (dc * TILE) / 2, z: c.z + (dr * TILE) / 2 }, 0.5, row);
          rails.push(new THREE.Matrix4().compose(p, new THREE.Quaternion(), new THREE.Vector3(dc !== 0 ? 0.08 : TILE, 1, dr !== 0 ? 0.08 : TILE)));
        }
      }
    }
    if (rails.length) {
      const railMesh = new THREE.InstancedMesh(stepGeo, railMat, rails.length);
      rails.forEach((m, k) => railMesh.setMatrixAt(k, m));
      railMesh.castShadow = true;
      root.add(railMesh);
    }
  }

  // --- Ceiling lamps (fluorescent strips). Point lights are capped by the level test.
  const lampGeo = track(new THREE.BoxGeometry(1.4, 0.08, 0.32));
  const lamps: LampView[] = level.lamps.map((cell, i) => {
    const mat = track(new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0xdde8ff, emissiveIntensity: 0.2 }));
    const fixture = new THREE.Mesh(lampGeo, mat);
    fixture.position.copy(atCell(cell, WALL_HEIGHT - 0.05));
    root.add(fixture);
    const light = new THREE.PointLight(0xcfdcff, 0, 11, 1.8);
    light.position.copy(atCell(cell, WALL_HEIGHT - 0.35));
    root.add(light);
    return { light, mat, phase: i * 1.7, floor: Math.max(0, floorOfRow(level, cell.row)), fixture, glow: [] };
  });

  // --- Items on bedside cabinets.
  const items = new Map<string, THREE.Object3D>();
  const spinners: THREE.Object3D[] = [];
  const cabinetGeo = track(new THREE.BoxGeometry(0.6, 0.8, 0.5));
  const cabinetMat = track(new THREE.MeshStandardMaterial({ color: 0x5c574d, roughness: 0.8, metalness: 0.2 }));
  const fuseGeo = track(new THREE.CylinderGeometry(0.06, 0.06, 0.26, 12));
  const fuseMat = track(new THREE.MeshStandardMaterial({ color: 0x331a00, emissive: 0xff8a1a, emissiveIntensity: 1.6 }));
  const capGeo = track(new THREE.CylinderGeometry(0.065, 0.065, 0.05, 12));
  const capMat = track(new THREE.MeshStandardMaterial({ color: 0x999999, metalness: 0.9, roughness: 0.3 }));
  const battGeo = track(new THREE.BoxGeometry(0.1, 0.22, 0.1));
  const battMat = track(new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0x2dff6a, emissiveIntensity: 0.8 }));
  const noteGeo = track(new THREE.PlaneGeometry(0.32, 0.4));
  const noteMat = track(new THREE.MeshStandardMaterial({ map: track(noteTexture()), emissive: 0x3a3628, emissiveIntensity: 0.6, side: THREE.DoubleSide }));

  for (const item of level.items) {
    const p = itemPos(level, item.cell);
    const g = new THREE.Group();
    g.position.copy(at(p, 0, item.cell.row));
    const cab = new THREE.Mesh(cabinetGeo, cabinetMat);
    cab.position.copy(at(p, 0.4, item.cell.row));
    cab.rotation.y = Math.atan2(p.face.x, p.face.z);
    cab.castShadow = cab.receiveShadow = true;
    root.add(cab);
    if (item.kind === 'fuse') {
      const f = new THREE.Mesh(fuseGeo, fuseMat);
      const c1 = new THREE.Mesh(capGeo, capMat);
      const c2 = new THREE.Mesh(capGeo, capMat);
      c1.position.y = 0.14;
      c2.position.y = -0.14;
      const spin = new THREE.Group();
      spin.add(f, c1, c2);
      spin.rotation.z = Math.PI / 2;
      spin.position.y = 0.95;
      g.add(spin);
      spinners.push(spin);
    } else if (item.kind === 'battery') {
      const b = new THREE.Mesh(battGeo, battMat);
      b.position.y = 0.92;
      g.add(b);
      spinners.push(b);
    } else {
      const n = new THREE.Mesh(noteGeo, noteMat);
      n.rotation.x = -Math.PI / 2;
      n.rotation.z = 0.3;
      n.position.y = 0.81;
      g.add(n);
    }
    root.add(g);
    items.set(item.id, g);
  }

  // --- Generator: a big machine filling its tile.
  const gen = new THREE.Group();
  const body = new THREE.Mesh(track(new THREE.BoxGeometry(2.6, 1.7, 2.2)), track(new THREE.MeshStandardMaterial({ color: 0x3f4a3a, roughness: 0.6, metalness: 0.5 })));
  body.position.y = 0.85;
  body.castShadow = body.receiveShadow = true;
  const pipes = new THREE.Mesh(track(new THREE.CylinderGeometry(0.12, 0.12, WALL_HEIGHT - 1.7, 8)), capMat);
  pipes.position.set(0.8, 1.7 + (WALL_HEIGHT - 1.7) / 2, 0.6);
  const generatorLamp = track(new THREE.MeshStandardMaterial({ color: 0x220000, emissive: 0xff1a1a, emissiveIntensity: 2 }));
  const side = openSide(level, level.generator);
  const lampBulb = new THREE.Mesh(track(new THREE.SphereGeometry(0.09, 10, 8)), generatorLamp);
  lampBulb.position.set(side.dc * 1.32, 1.35, side.dr * 1.12);
  const slots = new THREE.Mesh(track(new THREE.BoxGeometry(0.9, 0.35, 0.9)), track(new THREE.MeshStandardMaterial({ color: 0x151515 })));
  slots.position.set(side.dc * 1.1, 1.0, side.dr * 0.9);
  gen.add(body, pipes, lampBulb, slots);
  gen.position.copy(atCell(level.generator, 0));
  root.add(gen);

  // --- Exit door on the inner face of the exit tile + sign above.
  const ex = atCell(level.exit, 0);
  const es = openSide(level, level.exit);
  const face = new THREE.Vector3(ex.x + es.dc * (TILE / 2 + 0.02), ex.y, ex.z + es.dr * (TILE / 2 + 0.02));
  const exitDoor = new THREE.Mesh(
    track(new THREE.BoxGeometry(es.dc !== 0 ? 0.12 : 1.6, 2.4, es.dc !== 0 ? 1.6 : 0.12)),
    track(new THREE.MeshStandardMaterial({ color: 0x40474d, metalness: 0.7, roughness: 0.45 })),
  );
  exitDoor.position.set(face.x, face.y + 1.2, face.z);
  exitDoor.castShadow = true;
  root.add(exitDoor);
  const exitSign = track(new THREE.MeshBasicMaterial({ map: track(signTexture('EXIT', '#ff2a2a')) }));
  const sign = new THREE.Mesh(track(new THREE.PlaneGeometry(0.8, 0.3)), exitSign);
  sign.position.set(face.x + es.dc * 0.03, face.y + 2.75, face.z + es.dr * 0.03);
  sign.lookAt(sign.position.x + es.dc, sign.position.y, sign.position.z + es.dr);
  root.add(sign);
  // --- Update 0.6.3: notes pinned to walls (level.wallNotes), slightly off the face they hang on.
  const wallNoteGeo = track(new THREE.PlaneGeometry(0.96, 0.64));
  for (const w of level.wallNotes) {
    const d = FACE_DIR[w.face];
    const cc = atCell(w.cell, 0);
    const mat = track(
      new THREE.MeshStandardMaterial({ map: track(wallNoteTexture(w.text)), transparent: true, alphaTest: 0.5, roughness: 0.95, emissive: 0x3a3628, emissiveIntensity: 0.35 }),
    );
    mat.emissiveMap = mat.map;
    const paper = new THREE.Mesh(wallNoteGeo, mat);
    paper.position.set(cc.x + d.dc * (TILE / 2 + 0.015), cc.y + 1.55, cc.z + d.dr * (TILE / 2 + 0.015));
    paper.lookAt(paper.position.x + d.dc, paper.position.y, paper.position.z + d.dr);
    paper.rotation.z += 0.04;
    root.add(paper);
  }

  const exitDoorSlide = new THREE.Vector3(es.dr !== 0 ? 1.7 : 0, 0, es.dc !== 0 ? 1.7 : 0);

  return {
    root,
    lamps,
    items,
    spinners,
    generatorLamp,
    generatorStandIn: [body, pipes, slots],
    generatorBulb: lampBulb,
    generatorPos: atCell(level.generator, 1),
    exitSign,
    exitDoor,
    exitDoorClosedPos: exitDoor.position.clone(),
    exitDoorSlide,
    dispose: () => disposables.forEach((d) => d.dispose()),
  };
}
