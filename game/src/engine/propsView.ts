// Update 0.8 — draws the level's props (world/props.ts placements) from public/models/props/*.glb.
// Loads in the background; the level plays the same before they arrive. Also swaps the plain lamp boxes
// for fluorescent fixtures and the stand-in generator for the real one, and animates the breaker
// panel's door and the power switch's lever.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Level, floorAt, floorOffset } from '../world/level';
import { PropKind, placedProps, findProp } from '../world/props';
import type { LevelView } from './buildLevel';

export const PROP_URL = (kind: PropKind) => `/models/props/${kind}.glb`;

export interface PropsView {
  root: THREE.Group;
  /** 0 = shut, 1 = open (the breaker box door swings open while you work on it). */
  setPanelOpen(k: number): void;
  /** The power switch lever: off / on. */
  setSwitch(on: boolean): void;
  /** Orange light at the panel: sparks (0 = off). */
  setSpark(intensity: number): void;
  dispose(): void;
}

export function createPropsView(level: Level, view: LevelView): PropsView {
  const root = new THREE.Group();
  const loader = new GLTFLoader();
  const cache = new Map<PropKind, Promise<THREE.Group>>();
  const owned: { dispose(): void }[] = [];
  let disposed = false;
  let door: THREE.Object3D | null = null;
  let doorRest = 0;
  let lever: THREE.Object3D | null = null;
  let leverRest = 0;
  let panelOpen = 0;
  let switchOn = false;

  const load = (kind: PropKind) => {
    let p = cache.get(kind);
    if (!p) {
      p = loader.loadAsync(PROP_URL(kind)).then((g) => {
        g.scene.traverse((o) => {
          const m = o as THREE.Mesh;
          if (!m.isMesh) return;
          m.castShadow = true;
          m.receiveShadow = true;
          owned.push(m.geometry);
          const mats = Array.isArray(m.material) ? m.material : [m.material];
          for (const mat of mats) {
            owned.push(mat);
            for (const v of Object.values(mat)) if (v instanceof THREE.Texture) owned.push(v);
          }
        });
        return g.scene;
      });
      cache.set(kind, p);
    }
    return p;
  };

  const lift = (x: number, z: number) => {
    const o = floorOffset(level, floorAt(level, { x, z }));
    return { y: o.y, z: z + o.z };
  };

  // Placed props.
  for (const p of placedProps(level)) {
    load(p.kind)
      .then((scene) => {
        if (disposed) return;
        const obj = scene.clone(true);
        const at = lift(p.x, p.z);
        obj.position.set(p.x, at.y + p.y, at.z);
        obj.rotation.y = p.yaw;
        root.add(obj);
        if (p.kind === 'generator') {
          view.generatorStandIn.forEach((o) => (o.visible = false));
          // Status light on top of the machine's front corner.
          view.generatorBulb.position.set(0.85, 1.93, 0.5);
        } else if (p.kind === 'breaker_box') {
          door = obj.getObjectByName('BoxDoorPivot') ?? null;
          if (door) doorRest = door.rotation.y;
          applyPanel();
        } else if (p.kind === 'power_switch') {
          lever = obj.getObjectByName('Switch.001') ?? null;
          if (lever) leverRest = lever.rotation.x;
          applySwitch();
        }
      })
      .catch((err) => console.warn(`Prop ${p.kind} failed to load.`, err));
  }

  // Fluorescent fixtures at every ceiling lamp: the housing glows with the lamp's flicker.
  if (view.lamps.length) {
    load('fluorescent')
      .then((scene) => {
        if (disposed) return;
        for (const lamp of view.lamps) {
          const obj = scene.clone(true);
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
          obj.position.y = lamp.fixture.position.y - 0.06; // hangs from the ceiling (0.22 m tall)
          root.add(obj);
          lamp.fixture.visible = false;
        }
      })
      .catch((err) => console.warn('Fluorescent fixtures failed to load.', err));
  }

  // Sparks at the breaker panel.
  const panel = findProp(level, 'breaker_box');
  const spark = new THREE.PointLight(0xff9a2e, 0, 5, 2);
  if (panel) {
    const at = lift(panel.x, panel.z);
    // Just in front of the box.
    spark.position.set(panel.x + Math.sin(panel.yaw + Math.PI / 2) * 0.4, at.y + panel.y, at.z + Math.cos(panel.yaw + Math.PI / 2) * 0.4);
    root.add(spark);
  }

  function applyPanel() {
    if (door) door.rotation.y = doorRest - panelOpen * 1.9;
  }
  function applySwitch() {
    if (lever) lever.rotation.x = leverRest + (switchOn ? -1.1 : 0);
  }

  return {
    root,
    setPanelOpen(k) {
      panelOpen = Math.max(0, Math.min(1, k));
      applyPanel();
    },
    setSwitch(on) {
      switchOn = on;
      applySwitch();
    },
    setSpark(intensity) {
      spark.intensity = intensity;
    },
    dispose() {
      disposed = true;
      spark.dispose();
      owned.forEach((d) => d.dispose());
    },
  };
}
