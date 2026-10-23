// Update 0.3 — F2 debug view: full light, no fog, and The Patient marked through walls
// with its current path. Rendering only; the game rules don't change.
import * as THREE from 'three';
import { Level, TILE, WALL_HEIGHT, cellCenter } from '../world/level';
import type { EnemyMode, EnemyState } from '../world/enemyAI';

const MODE_COLOR: Record<EnemyMode, number> = {
  patrol: 0x3fd16b,
  investigate: 0xffc233,
  search: 0x4aa8ff,
  chase: 0xff2a2a,
};

export function createDebugView(level: Level) {
  const root = new THREE.Group();
  root.visible = false;

  // Daylight: a sun + a strong sky fill so every corner is readable.
  const sun = new THREE.DirectionalLight(0xffffff, 2.2);
  sun.position.set(level.cols * TILE * 0.3, 40, level.rows * TILE * 0.2);
  sun.target.position.set((level.cols * TILE) / 2, 0, (level.rows * TILE) / 2);
  const sky = new THREE.HemisphereLight(0xdde6ff, 0x5a5348, 1.6);
  root.add(sun, sun.target, sky);

  // Enemy marker: a beam + ring drawn on top of everything (visible through walls).
  const markMat = new THREE.MeshBasicMaterial({ color: MODE_COLOR.patrol, transparent: true, opacity: 0.85, depthTest: false });
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, WALL_HEIGHT * 1.6, 8), markMat);
  beam.position.y = WALL_HEIGHT * 0.8;
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.7, 32), markMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.05;
  const marker = new THREE.Group();
  marker.add(beam, ring);
  marker.renderOrder = 999;
  beam.renderOrder = ring.renderOrder = 999;
  root.add(marker);

  // Its planned path.
  const pathGeo = new THREE.BufferGeometry();
  const pathPositions = new Float32Array(3 * 256);
  pathGeo.setAttribute('position', new THREE.BufferAttribute(pathPositions, 3));
  const pathMat = new THREE.LineBasicMaterial({ color: 0xffffff, depthTest: false, transparent: true, opacity: 0.8 });
  const pathLine = new THREE.Line(pathGeo, pathMat);
  pathLine.renderOrder = 998;
  pathLine.frustumCulled = false;
  root.add(pathLine);

  return {
    root,
    get enabled() {
      return root.visible;
    },
    setEnabled(on: boolean) {
      root.visible = on;
    },
    update(e: EnemyState, t: number) {
      if (!root.visible) return;
      marker.position.set(e.pos.x, 0, e.pos.z);
      markMat.color.setHex(MODE_COLOR[e.mode]);
      ring.scale.setScalar(1 + 0.15 * Math.sin(t * 6));
      const pts = [{ x: e.pos.x, z: e.pos.z }, ...e.path.slice(e.pathIndex).map(cellCenter)];
      if (e.goal) pts.push(e.goal);
      const n = Math.min(pts.length, 256);
      for (let i = 0; i < n; i++) {
        pathPositions[i * 3] = pts[i].x;
        pathPositions[i * 3 + 1] = 0.1;
        pathPositions[i * 3 + 2] = pts[i].z;
      }
      pathGeo.setDrawRange(0, n);
      pathGeo.attributes.position.needsUpdate = true;
    },
    dispose() {
      root.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.geometry) m.geometry.dispose();
      });
      markMat.dispose();
      pathMat.dispose();
      sun.dispose();
      sky.dispose();
    },
  };
}

export type DebugView = ReturnType<typeof createDebugView>;
