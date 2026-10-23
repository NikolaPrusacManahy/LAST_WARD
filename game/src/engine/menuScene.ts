// Update 0.4.3b — main menu backdrop. The Patient stands on the right under one failing tube,
// staring at you. The light dies, it's gone, then its face is right in front of the screen under
// a crazy strobe, dark again, and it's back where it was. Schedule: state/menuScare.ts.
import * as THREE from 'three';
import { loadEnemyModel } from './enemyModel';
import type { EnemyView } from './enemyView';
import { floorTexture, wallTexture } from './textures';
import { LightPhase, createMenuScare, stepMenuScare } from '../state/menuScare';

// Wide shot: looking left of it keeps it on the right, clear of the title.
const CAMERA = new THREE.Vector3(-0.6, 1.5, 7.6);
const LOOK = new THREE.Vector3(-1.9, 1.35, 0);
const STAND = { x: 0, z: 0 };
// Face shot: the camera sits this far in front of its head and tracks it every frame.
const FACE_DIST = 0.66;
const FACE_UP = 0.07;

export interface MenuSceneOptions {
  /** Light changes worth a sound: stutter out / in, and the scare. */
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
  const camera = new THREE.PerspectiveCamera(34, 1, 0.05, 40);
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

  // The failing tube over the spot it stands on.
  const tubeMat = new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0xdde8ff, emissiveIntensity: 2 });
  const tube = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.05, 0.12), tubeMat);
  tube.position.set(0.1, 3.05, 0.7);
  const lamp = new THREE.SpotLight(0xd8e4ff, 0, 9, 0.62, 0.65, 1.4);
  lamp.position.set(0.1, 3.0, 0.7);
  lamp.target.position.set(0.1, 0, 0.7);
  lamp.castShadow = true;
  lamp.shadow.mapSize.set(1024, 1024);
  lamp.shadow.bias = -0.0005;
  const spill = new THREE.PointLight(0xcfdcff, 0, 6, 2);
  spill.position.set(0.1, 2.6, 1.2);
  // The strobe for the face shot: from just below the lens, harsh and cold.
  const strobe = new THREE.SpotLight(0xe8f0ff, 0, 1.7, 0.75, 0.5, 2);
  scene.add(tube, lamp, lamp.target, spill, strobe, strobe.target);

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
  // ?debug: expose the schedule so automated checks can jump to a phase.
  if (new URLSearchParams(location.search).has('debug')) (window as unknown as { __lastWardMenu: unknown }).__lastWardMenu = scare;
  let lastPhase: LightPhase = scare.phase;
  let t = 0;
  let last = performance.now();
  let raf = 0;
  const head = new THREE.Vector3();
  const standYaw = Math.atan2(CAMERA.x - STAND.x, CAMERA.z - STAND.z); // face the camera

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
    const dt = Math.max(0, Math.min(0.05, (now - last) / 1000));
    last = now;
    t += dt;
    stepMenuScare(scare, dt);
    if (scare.phase !== lastPhase) {
      if (scare.phase === 'out' || scare.phase === 'in' || scare.phase === 'scare') opts.onFlicker?.(scare.phase);
      lastPhase = scare.phase;
    }

    const face = scare.pose === 'face';
    container.classList.toggle('lw-menu-scene-face', face);
    const tubeLight = face ? 0 : scare.light;
    lamp.intensity = 45 * tubeLight;
    spill.intensity = 1.6 * tubeLight;
    tubeMat.emissiveIntensity = 0.05 + 2.2 * tubeLight;
    strobe.intensity = face ? 3.2 * scare.light : 0;

    camera.position.copy(CAMERA);
    camera.lookAt(LOOK);
    if (enemy) {
      enemy.root.visible = scare.pose !== 'gone';
      if (scare.pose !== 'gone') {
        // Same spot and stare either way; only the camera changes for the face shot.
        enemy.pose(STAND, face ? 0 : standYaw, 'stare', t);
        if (face) {
          enemy.head.getWorldPosition(head);
          const jx = (Math.random() - 0.5) * 0.012; // tiny shake while the strobe goes
          camera.position.set(head.x + jx, head.y + FACE_UP, head.z + FACE_DIST);
          camera.lookAt(head.x, head.y + FACE_UP - 0.03, head.z);
          strobe.position.set(camera.position.x, camera.position.y - 0.25, camera.position.z);
          strobe.target.position.set(head.x, head.y + FACE_UP, head.z);
        }
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
      container.classList.remove('lw-menu-scene-face');
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
      strobe.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
