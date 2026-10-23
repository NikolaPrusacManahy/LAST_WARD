// Update 0.8 — Sketchfab props (ASSETS/models/props, ASSETS/models/electrical) → game-ready GLBs in
// public/models/props/. Each job picks parts of a source model, scales it to metres, puts its base on the
// floor (or its middle at the origin for wall pieces), drops what we don't use and shrinks textures to
// WebP. Placement in the level is data (world/content/level01.ts `props`), not done here.
//
// Needs (not in package.json, install once when re-running this):
//   npm i --no-save @gltf-transform/core @gltf-transform/extensions @gltf-transform/functions sharp
//
// Usage (from game/):  node tools/prepare-props.mjs ../ASSETS/models public/models/props
import { mkdirSync } from 'fs';
import { join } from 'path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, getBounds, metalRough, prune, simplify, textureCompress, weld } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';

const ROOM = 'props/horror_hospital_room.glb';
const ELEC = 'electrical/simple_electrical_environment.glb';
// The electrical wall: the brick plane and everything mounted on it (the spare parts sit beside it, z > 2.1).
// Update 0.9 — without its own brick: the generator room is lined with brick (`brick_wall`) everywhere.
const onWall = (n, b) => n.getName() !== 'WallTest' && b.max[2] <= 2.1;

/**
 * scale — metres per source unit (world units of the source scene), or `height` to size it.
 * anchor — 'floor': base at y = 0 (default); 'center': middle at the origin (things hung on walls).
 * simplify — keep about this share of the triangles (very dense models).
 * metal — metalness for materials with no metal/rough map. The spec/gloss → metal/rough conversion leaves
 *         some fully metallic, which renders near black without reflections (Update 0.9: brick, panels).
 */
export const PLAN = [
  // Horror Hospital Room (KarolinaGlad, CC BY 4.0): its furniture dresses the room you wake up in.
  // 1 room unit ≈ 0.24 m (the bed comes out 2.1 m long, the table 0.7 m high).
  { out: 'hospital_bed', src: ROOM, keep: ['bed3:pCylinder11', 'Uchujin_Main6'], scale: 24 },
  { out: 'privacy_screen', src: ROOM, keep: ['divider1:pCylinder3'], scale: 24 },
  { out: 'bedside_flowers', src: ROOM, keep: ['bedside_shelf', 'vase:pCylinder1', 'Uchujin_Main2', 'Uchujin_Main4', 'Uchujin_Main5'], scale: 24 },
  { out: 'bedside_drawing', src: ROOM, keep: ['bedside_shelf2', 'drawing_2'], scale: 24 },
  { out: 'bedside_meds', src: ROOM, keep: ['bedside_shelf3', 'medicine1', 'pCylinder40'], scale: 24 },
  { out: 'side_table', src: ROOM, keep: ['table:pCube2', 'beaker2:pCylinder1', 'pCylinder1'], scale: 24 },
  { out: 'medicine_shelf', src: ROOM, keep: ['shelf3', 'books', 'medicine'], scale: 24, simplify: 0.35 },
  { out: 'portrait', src: ROOM, keep: ['portrait2:pCube5'], scale: 24, anchor: 'center' },
  { out: 'child_drawing', src: ROOM, keep: ['drawing_1'], scale: 24, anchor: 'center' },
  // Generator (Ghazi_3D, CC BY 4.0) — doubled: an industrial generator filling its tile.
  { out: 'generator', src: 'props/generator_stylized_sci-fi_generator.glb', keep: ['SM_Generator_12342'], scale: 2 },
  // Simple electrical environment (trashbinkr, Sketchfab Standard): the brick wall with its conduits and
  // boxes for the generator room (scaled to the 3.2 m wall), and the breaker box whose door opens.
  { out: 'electrical_wall', src: ELEC, pick: onWall, scale: 0.8, anchor: 'center', metal: 0.35 },
  // The bare brick panel: lines every wall of the generator room (Update 0.9).
  { out: 'brick_wall', src: ELEC, keep: ['WallTest'], scale: 0.8, anchor: 'center', metal: 0 },
  { out: 'breaker_box', src: ELEC, keep: ['BoxWithGlassFrame', 'BoxDoorPivot'], scale: 1, anchor: 'center', metal: 0.35 },
  // Simple Industrial ON/OFF Switch (trashbinkr, Sketchfab Standard): lever node 'Switch.001'.
  { out: 'power_switch', src: 'props/simple_industrial_onoff_switch.glb', keep: ['Panel.001', 'Switch.001'], scale: 1, anchor: 'center', metal: 0.35 },
  // Rusty Radiator (loxfear, CC BY 4.0), towel included.
  { out: 'radiator', src: 'props/rusty_radiator.glb', keep: ['Radiator_low', 'Plane_1'], height: 0.78 },
  // Old tin barrel (3dhdscan, CC BY 4.0): upright and lying (its big shadow plane dropped).
  { out: 'barrel', src: 'props/old_tin_barrel.glb', keep: ['sud_low'], scale: 1 },
  { out: 'barrel_lying', src: 'props/old_tin_barrel.glb', keep: ['sud_low001'], scale: 1 },
  // Toilet (game ready) (Sean Thomas, CC BY 4.0).
  { out: 'toilet', src: 'props/toilet_game_ready.glb', keep: ['LP1'], height: 0.8 },
  // Fluorecent lights (Sean Thomas, CC BY 4.0): the long ceiling housing.
  { out: 'fluorescent', src: 'props/fluorecent_lights.glb', keep: ['group8'], scale: 0.01, anchor: 'center' },
];

const [srcDir, outDir] = process.argv.slice(2);
if (!srcDir || !outDir) {
  console.error('Usage: node tools/prepare-props.mjs <ASSETS/models> <out dir>');
  process.exit(1);
}
mkdirSync(outDir, { recursive: true });
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const only = process.env.ONLY?.split(',');

for (const job of PLAN) {
  if (only && !only.includes(job.out)) continue;
  const doc = await io.read(join(srcDir, job.src));
  const root = doc.getRoot();
  const scene = root.listScenes()[0];
  const rootNode = root.listNodes().find((n) => n.getName() === 'RootNode');
  const keep = new Set(job.keep ?? []);
  const pick = job.pick ?? ((n) => keep.has(n.getName()));
  let kept = 0;
  for (const child of [...rootNode.listChildren()]) {
    if (pick(child, getBounds(child))) {
      kept++;
      continue;
    }
    const all = [];
    child.traverse((n) => all.push(n));
    all.reverse().forEach((n) => n.dispose());
  }
  if (!kept) throw new Error(`${job.out}: nothing matched in ${job.src}`);
  const b = getBounds(scene);
  const size = b.max.map((v, i) => v - b.min[i]);
  const s = job.height ? job.height / size[1] : job.scale;
  const c = b.min.map((v, i) => (v + b.max[i]) / 2);
  const anchorY = job.anchor === 'center' ? c[1] : b.min[1];
  const wrap = doc.createNode(job.out).setScale([s, s, s]).setTranslation([-c[0] * s, -anchorY * s, -c[2] * s]);
  for (const n of [...scene.listChildren()]) {
    scene.removeChild(n);
    wrap.addChild(n);
  }
  scene.addChild(wrap);
  // Old spec/gloss materials (the barrels) → metal/rough, which three.js reads.
  const steps = [metalRough(), prune(), dedup()];
  if (job.simplify) {
    await MeshoptSimplifier.ready;
    steps.push(weld(), simplify({ simplifier: MeshoptSimplifier, ratio: job.simplify, error: 0.002 }));
  }
  await doc.transform(...steps, textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [job.tex ?? 1024, job.tex ?? 1024], quality: 80 }));
  if (job.metal !== undefined) {
    for (const m of root.listMaterials()) if (!m.getMetallicRoughnessTexture()) m.setMetallicFactor(Math.min(m.getMetallicFactor(), job.metal));
  }
  const file = join(outDir, `${job.out}.glb`);
  await io.write(file, doc);
  const out = getBounds(scene);
  console.log(`${job.out.padEnd(16)} ${out.max.map((v, i) => (v - out.min[i]).toFixed(2)).join(' x ').padEnd(20)} m  → ${file}`);
}
