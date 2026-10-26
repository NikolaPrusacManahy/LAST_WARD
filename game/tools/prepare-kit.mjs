// Update 1.0.1 — the Abandoned Factory Modules kit (Thaddaeus, CC BY 4.0) → one game-ready GLB,
// public/models/props/factory_kit.glb, for Harrow Mill. Every piece the game uses becomes a top-level node
// named after it (wall, stairs, crate…), scaled and anchored like prepare-props.mjs does, all sharing the
// kit's few textures (one download, one copy of each texture on the graphics card). The game draws the
// walls, floors and roof plates from it in batches (engine/factoryView.ts) and the rest as props.
//
// Needs (not in package.json, install once when re-running this):
//   npm i --no-save @gltf-transform/core @gltf-transform/extensions @gltf-transform/functions sharp
//
// Usage (from game/):  node tools/prepare-kit.mjs ../ASSETS/models/factory/abandoned_factory_modules.glb public/models/props/factory_kit.glb
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, getBounds, metalRough, prune, textureCompress } from '@gltf-transform/functions';
import sharp from 'sharp';

/** One kit module (2.46 m) → one 3 m tile. */
const TILE = 3 / 2.4573;

/**
 * out — the node name the game looks up · kit — the module in the kit · scale — metres per kit metre
 * anchor — 'floor': base at y = 0 (default); 'center': middle at the origin (things hung on walls).
 * Every piece is centred on x / z. Fronts: the walls, the doorway and what hangs on a wall face +x.
 */
export const PIECES = [
  // Lining every wall face (walls stretched to the 3.2 m wall at placement).
  { out: 'wall', kit: 'Wall_Type1', scale: TILE, anchor: 'center' },
  { out: 'wall_window', kit: 'Wall_Type2', scale: TILE, anchor: 'center' },
  { out: 'wall_arch', kit: 'Wall_Type3', scale: TILE, anchor: 'center' },
  { out: 'doorway', kit: 'Doorway', scale: TILE, anchor: 'center' },
  // Floor slabs (the 4.9 m slab shrunk to a tile), the roof's rusted plates, the gantry's grating.
  { out: 'floor', kit: 'Concrete_Ground', scale: 3 / 4.913 },
  { out: 'roof', kit: 'Rusted_Panel', scale: TILE },
  { out: 'grate', kit: 'Grate_Panel', scale: TILE },
  // The steel stairs (stretched to the flight at placement) and the round ceiling lamp.
  { out: 'stairs', kit: 'Stairs', scale: 1 },
  { out: 'lamp', kit: 'Stick_on_Light', scale: TILE, anchor: 'center' },
  // Props.
  { out: 'shelf', kit: 'Shelf_Unit', scale: TILE },
  { out: 'crate', kit: 'Crate', scale: TILE },
  { out: 'crate_tall', kit: 'Crate_trapezoid', scale: TILE },
  { out: 'console', kit: 'Console_Panel', scale: TILE },
  { out: 'tank', kit: 'Tank', scale: TILE },
  { out: 'electric_box', kit: 'Electrial_Box', scale: TILE, anchor: 'center' },
  { out: 'sign_caution', kit: 'Decal_Caution', scale: TILE * 1.6, anchor: 'center' },
  { out: 'sign_warning', kit: 'Decal_Warning', scale: TILE * 1.6, anchor: 'center' },
  { out: 'blueprint', kit: 'Decal_Blueprint', scale: TILE * 1.6, anchor: 'center' },
  { out: 'plates', kit: 'Broken_Plates', scale: TILE },
  { out: 'brace', kit: 'Brace', scale: TILE, anchor: 'center' },
  { out: 'vent', kit: 'Ventilation', scale: TILE * 1.5, anchor: 'center' },
];

const [src, out] = process.argv.slice(2);
if (!src || !out) {
  console.error('Usage: node tools/prepare-kit.mjs <abandoned_factory_modules.glb> <out.glb>');
  process.exit(1);
}
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(src);
const root = doc.getRoot();
const scene = root.listScenes()[0];
const rootNode = root.listNodes().find((n) => n.getName() === 'RootNode');
// The Sketchfab wrappers turn the FBX's centimetres into kit metres: 245.73 × 0.01, and their two
// quarter turns about x cancel out.
const unit = 2.4573;
const modules = new Map(rootNode.listChildren().map((n) => [n.getName().replace('Factory_Modules:', ''), n]));
const made = [];
for (const p of PIECES) {
  const m = modules.get(p.kit);
  if (!m) throw new Error(`${p.out}: no ${p.kit} in the kit`);
  const b = getBounds(m);
  const c = b.min.map((v, i) => (v + b.max[i]) / 2);
  const anchor = [c[0], p.anchor === 'center' ? c[1] : b.min[1], c[2]];
  const t = m.getTranslation();
  const k = p.scale * unit;
  // Kit metres p → (p − anchor) × scale; a child's raw position q lands at unit × (t + q).
  const node = doc.createNode(p.out).setScale([k, k, k]).setTranslation([0, 1, 2].map((i) => p.scale * (unit * t[i] - anchor[i])));
  for (const child of m.listChildren()) node.addChild(child);
  scene.addChild(node);
  made.push(node);
}
// Everything else goes: the wrappers and the modules not used.
for (const n of [...scene.listChildren()]) if (!made.includes(n)) scene.removeChild(n);
await doc.transform(metalRough(), prune(), dedup(), textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [1024, 1024], quality: 80 }));
await io.write(out, doc);
for (const n of made) {
  const b = getBounds(n);
  console.log(`${n.getName().padEnd(14)} ${b.max.map((v, i) => (v - b.min[i]).toFixed(2)).join(' x ').padEnd(20)} m   min ${b.min.map((v) => v.toFixed(2)).join(',')}`);
}
