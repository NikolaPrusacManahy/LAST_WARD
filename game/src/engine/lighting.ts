// Ceiling lamps: dead and flickering before the generator runs, steady after.
import type { LevelView } from './buildLevel';
import { signTexture } from './textures';

const slotRand = (lamp: number, slot: number) => {
  const x = Math.sin(lamp * 127.1 + slot * 311.7) * 43758.5453;
  return x - Math.floor(x);
};

export function createLighting(view: LevelView) {
  const greenSign = signTexture('EXIT', '#2bff6a');
  let powered = false;
  let powerTime = 0;

  return {
    setPowered(t: number) {
      powered = true;
      powerTime = t;
      view.generatorLamp.emissive.setHex(0x2bff6a);
      view.exitSign.map = greenSign;
      view.exitSign.needsUpdate = true;
    },
    /** `floor` — the floor you're on (Update 0.7: other floors' lamps would light through the floors). */
    update(t: number, floor = 0) {
      view.lamps.forEach((lamp, i) => {
        let k: number;
        if (!powered) {
          // Mostly dead; short random bursts so corridors flash in and out of view.
          const slot = Math.floor(t * 9 + lamp.phase * 3);
          const r = slotRand(i, slot);
          const burst = slotRand(i + 50, Math.floor(t * 0.6 + lamp.phase));
          k = burst > 0.7 && r > 0.45 ? 0.5 + r * 0.5 : 0.03;
        } else {
          const since = t - powerTime;
          // Strike-up stutter for the first second, then a steady hum with rare dips.
          if (since < 1.2) k = slotRand(i, Math.floor(since * 20)) > 0.5 ? 1 : 0.05;
          else k = slotRand(i, Math.floor(t * 12)) > 0.985 ? 0.4 : 1;
        }
        lamp.light.intensity = lamp.floor === floor ? (powered ? 14 : 9) * k : 0;
        lamp.light.distance = powered ? 15 : 11;
        lamp.mat.emissiveIntensity = 0.15 + 2.2 * k;
        for (const g of lamp.glow) g.emissiveIntensity = 0.05 + 1.4 * k; // Update 0.8 — the fluorescent model
      });
      view.spinners.forEach((s, i) => {
        s.rotation.y = t * 1.2 + i;
      });
    },
    dispose() {
      greenSign.dispose();
    },
  };
}

export type Lighting = ReturnType<typeof createLighting>;
