// Update 0.8 — draws the level's props (world/props.ts placements) from public/models/props/*.glb.
// Loads in the background; the level plays the same before they arrive. Also swaps the plain lamp boxes
// for fluorescent fixtures and the stand-in generator for the real one, and animates the breaker
// panel's door and the power switch's lever.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Level, floorAt, floorOffset } from '../world/level';
import { PlacedProp, PropKind, brickLining, panelSpots, placedProps } from '../world/props';
import type { LevelView } from './buildLevel';

export const PROP_URL = (kind: PropKind) => `/models/props/${kind}.glb`;

export interface PropsView {
  root: THREE.Group;
  /** Panel `i`'s door: 0 = shut, 1 = open (it swings open while you work on it). */
  setPanelOpen(i: number, k: number): void;
  /** Panel `i`'s switch lever: off / on. */
  setSwitch(i: number, on: boolean): void;
  /** Orange sparks light at panel `i` (0 = off). One light, moved to whichever panel sparks. */
  setSpark(i: number, intensity: number): void;
  /** Update 0.9.5 — locker i's door open by `rad` (0 = shut). */
  setLockerDoor(i: number, rad: number): void;
  dispose(): void;
}

/** Update 0.9.1 — lever swing from ON (rest pose) down to OFF (rad). */
const SWITCH_OFF = -1.3;

export function createPropsView(level: Level, view: LevelView): PropsView {
  const root = new THREE.Group();
  const loader = new GLTFLoader();
  const cache = new Map<PropKind, Promise<THREE.Group>>();
  const owned: { dispose(): void }[] = [];
  let disposed = false;
  // Update 0.9 — several panels: doors / levers in level order.
  const doors: { node: THREE.Object3D; rest: number }[] = [];
  const lockerDoors: { node: THREE.Object3D; rest: number }[] = [];
  const lockerOpen: number[] = [];
  const levers: { node: THREE.Object3D; rest: number }[] = [];
  const open: number[] = [];
  const on: boolean[] = [];

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

  // Placed props (+ Update 0.9: brick lining the brick rooms).
  let boxes = 0;
  let switches = 0;
  let lockers = 0;
  for (const p of [...placedProps(level), ...brickLining(level)]) {
    const slot = p.kind === 'breaker_box' ? boxes++ : p.kind === 'power_switch' ? switches++ : p.kind === 'locker' ? lockers++ : -1;
    load(p.kind)
      .then((scene) => {
        if (disposed) return;
        const obj = scene.clone(true);
        const at = lift(p.x, p.z);
        obj.position.set(p.x, at.y + p.y, at.z);
        obj.rotation.y = p.yaw;
        if (p.scale) obj.scale.set(...p.scale);
        root.add(obj);
        if (p.kind === 'generator') {
          view.generatorStandIn.forEach((o) => (o.visible = false));
          // Status light on top of the machine's front corner.
          view.generatorBulb.position.set(0.85, 1.93, 0.5);
        } else if (p.kind === 'breaker_box') {
          const node = obj.getObjectByName('BoxDoorPivot');
          if (node) doors[slot] = { node, rest: node.rotation.y };
          applyPanel(slot);
        } else if (p.kind === 'locker') {
          const node = obj.getObjectByName('LockerDoor');
          if (node) lockerDoors[slot] = { node, rest: node.rotation.z };
          applyLocker(slot);
        } else if (p.kind === 'power_switch') {
          // three.js drops the '.' from node names on load (0.9.1: the lever never moved).
          const node = obj.getObjectByName('Switch001') ?? obj.getObjectByName('Switch.001');
          if (node) levers[slot] = { node, rest: node.rotation.x };
          applySwitch(slot);
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

  // Sparks: one light, moved in front of whichever panel is sparking.
  const panels = panelSpots(level);
  const spark = new THREE.PointLight(0xff9a2e, 0, 5, 2);
  root.add(spark);
  const front = (p: PlacedProp) => {
    const at = lift(p.x, p.z);
    // Its front is its local +x, turned by its yaw.
    return new THREE.Vector3(p.x + Math.cos(p.yaw) * 0.4, at.y + p.y, at.z - Math.sin(p.yaw) * 0.4);
  };

  function applyPanel(i: number) {
    const d = doors[i];
    if (d) d.node.rotation.y = d.rest - (open[i] ?? 0) * 1.9;
  }
  // Update 0.9.5 — the door hangs on its hinge node's local z (the model is turned up from z-up).
  function applyLocker(i: number) {
    const d = lockerDoors[i];
    if (d) d.node.rotation.z = d.rest + (lockerOpen[i] ?? 0);
  }
  function applySwitch(i: number) {
    const l = levers[i];
    // 0.9.1: the model's rest pose is the lever up at ON; off swings it down to OFF.
    if (l) l.node.rotation.x = l.rest + (on[i] ? 0 : SWITCH_OFF);
  }

  return {
    root,
    setPanelOpen(i, k) {
      open[i] = Math.max(0, Math.min(1, k));
      applyPanel(i);
    },
    setLockerDoor(i, rad) {
      lockerOpen[i] = rad;
      applyLocker(i);
    },
    setSwitch(i, value) {
      on[i] = value;
      applySwitch(i);
    },
    setSpark(i, intensity) {
      const p = panels[i];
      if (p && intensity > 0) spark.position.copy(front(p));
      spark.intensity = intensity;
    },
    dispose() {
      disposed = true;
      spark.dispose();
      owned.forEach((d) => d.dispose());
    },
  };
}
