// Update 0.4.3 — the main menu's right side: The Patient standing under one failing tube light.
// The light schedule and poses come from state/menuScare.ts; this file only draws them.
import * as THREE from 'three';
import { loadEnemyModel } from './enemyModel';
import type { EnemyView } from './enemyView';
import { floorTexture, wallTexture } from './textures';
import { LightPhase, MenuPose, createMenuScare, stepMenuScare } from '../state/menuScare';

// Looking a little left of it keeps it on the right, clear of the title.
const CAMERA = new THREE.Vector3(-0.5, 1.5, 7.6);
const LOOK = new THREE.Vector3(-0.85, 1.3, 0);

/** Where it stands for each pose (x, z) and which AI mode drives its animation. */
const POSES: Record<Exclude<MenuPose, 'gone'>, { x: number; z: number; turn: number; mode: 'patrol' | 'search' }> = {
  idle: { x: 0, z: 0, turn: 0, mode: 'patrol' },
  near: { x: 0.25, z: 1.7, turn: 0, mode: 'patrol' },
  search: { x: -0.35, z: 0.3, turn: 0.7, mode: 'search' },
  scream: { x: 0.1, z: 1.1, turn: 0, mode: 'patrol' },
};

export interface MenuSceneOptions {
  onFlicker?(phase: LightPhase): void;
}

export function createMenuScene(container: HTMLElement, opts: MenuSceneOptions = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.setClearColor(0x050506);
  renderer.domElement.className = 'lw-menu-scene-canvas';
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x050506, 0.09);
  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 40);
  camera.position.copy(CAMERA);
  camera.lookAt(LOOK);
  scene.add(new THREE.HemisphereLight(0x30364a, 0x050403, 0.04));

  const floorTex = floorTexture();
  floorTex.repeat.set(5, 5);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.8 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  const wallTex = wallTexture('blood', 31);
  wallTex.repeat.set(3, 1);
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(9.6, 3.2), new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.92 }));
  wall.position.set(0, 1.6, -1.6);
  wall.receiveShadow = true;
  scene.add(floor, wall);

  // The failing tube: an emissive strip + a spotlight straight down onto the spot it stands.
  const tubeMat = new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0xdde8ff, emissiveIntensity: 2 });
  const tube = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.05, 0.12), tubeMat);
  tube.position.set(0.1, 3.05, 0.7);
  const lamp = new THREE.SpotLight(0xd8e4ff, 0, 9, 0.62, 0.65, 1.4);
  lamp.position.set(0.1, 3.0, 0.7);
  lamp.target.position.set(0.1, 0, 0.7);
  lamp.castShadow = true;
  lamp.shadow.mapSize.set(1024, 1024);
  lamp.shadow.bias = -0.0005;
  const spill = new THREE.PointLight(0xcfdcff, 0, 6, 2); // soft fill so the wall catches some light
  spill.position.set(0.1, 2.6, 1.2);
  scene.add(tube, lamp, lamp.target, spill);

  let enemy: EnemyView | null = null;
  let disposed = false;
  loadEnemyModel()
    .then((v) => {
      if (disposed) return v.dispose();
      enemy = v;
      scene.add(v.root);
    })
    .catch((err) => console.warn('Menu: Patient model failed to load.', err));

  const scare = createMenuScare((Date.now() & 0xffff) + 1);
  let lastPhase: LightPhase = scare.phase;
  let t = 0;
  let last = performance.now();
  let raf = 0;

  const resize = () => {
    const w = container.clientWidth || 1;
    const h = container.clientHeight || 1;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  const ro = new ResizeObserver(resize);
  ro.observe(container);
  resize();

  const frame = (now: number) => {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    t += dt;
    stepMenuScare(scare, dt);
    if (scare.phase !== lastPhase) {
      if (scare.phase === 'out' || scare.phase === 'in') opts.onFlicker?.(scare.phase);
      lastPhase = scare.phase;
    }

    lamp.intensity = 45 * scare.light;
    spill.intensity = 1.6 * scare.light;
    tubeMat.emissiveIntensity = 0.05 + 2.2 * scare.light;

    if (enemy) {
      const pose = scare.pose;
      enemy.root.visible = pose !== 'gone';
      if (pose !== 'gone') {
        const p = POSES[pose];
        const toCam = new THREE.Vector2(CAMERA.x - p.x, CAMERA.z - p.z).normalize();
        const c = Math.cos(p.turn);
        const s = Math.sin(p.turn);
        const dir = { x: toCam.x * c - toCam.y * s, z: toCam.x * s + toCam.y * c };
        // The scream starts as the light comes back, so you catch it mid-roar.
        const screaming = pose === 'scream' && scare.phase !== 'dark';
        enemy.update({ x: p.x, z: p.z }, dir, p.mode, 0, t, screaming);
      }
    }
    renderer.render(scene, camera);
  };
  raf = requestAnimationFrame(frame);

  return {
    dispose() {
      disposed = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      enemy?.dispose();
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        m.geometry.dispose();
        const mat = m.material as THREE.MeshStandardMaterial;
        mat.map?.dispose();
        mat.dispose();
      });
      lamp.dispose();
      spill.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
