// Update 0.2 — Mixamo FBX → one game-ready GLB (model + named clips, no root motion, 1024px WebP textures).
//
// One-time setup (not part of the normal install, these are big):
//   npm i --no-save fbx2gltf @gltf-transform/core @gltf-transform/extensions @gltf-transform/functions sharp
//
// Usage (from game/):
//   node tools/convert-character.mjs <model.fbx> <out.glb> <clipName>=<anim.fbx> ...
// Example:
//   node tools/convert-character.mjs ../ASSETS/models/patient/Patient_Model.fbx public/models/patient.glb ^
//     idle=../ASSETS/models/patient/Patient_idle.fbx walk=../ASSETS/models/patient/Patient_walking.fbx ^
//     run=../ASSETS/models/patient/Patient_Running.fbx search=../ASSETS/models/patient/Patient_Search.fbx ^
//     scream=../ASSETS/models/patient/Patient_scream.fbx attack=../ASSETS/models/patient/Patient_attack.fbx
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { createRequire } from 'module';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { textureCompress, prune, dedup, resample } from '@gltf-transform/functions';
import sharp from 'sharp';

const [modelFbx, outFile, ...clipArgs] = process.argv.slice(2);
if (!modelFbx || !outFile) {
  console.error('Usage: node tools/convert-character.mjs <model.fbx> <out.glb> <clip>=<anim.fbx> ...');
  process.exit(1);
}

const require = createRequire(import.meta.url);
const fbx2gltf = require('fbx2gltf'); // (src, dest.glb) => Promise<path>, ships the platform binary
const tmp = mkdtempSync(join(tmpdir(), 'lw-convert-'));
const toGlb = (fbx, name) => fbx2gltf(fbx, join(tmp, name + '.glb'));

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(await toGlb(modelFbx, 'model'));
const root = doc.getRoot();
root.listAnimations().forEach((a) => a.dispose()); // bind-pose dummy clip
const byName = new Map(root.listNodes().map((n) => [n.getName(), n]));
const buffer = root.listBuffers()[0];

for (const arg of clipArgs) {
  const [name, file] = arg.split('=');
  const src = (await io.read(await toGlb(file, name))).getRoot().listAnimations()[0];
  const anim = doc.createAnimation(name);
  for (const ch of src.listChannels()) {
    const node = byName.get(ch.getTargetNode().getName());
    if (!node) continue;
    const s = ch.getSampler();
    const out = s.getOutput().getArray().slice();
    if (/Hips$/.test(ch.getTargetNode().getName()) && ch.getTargetPath() === 'translation') {
      // Keep the vertical bob; the game moves the character, so drop horizontal root motion.
      const x0 = out[0], z0 = out[2];
      for (let i = 0; i < out.length; i += 3) { out[i] = x0; out[i + 2] = z0; }
    }
    const input = doc.createAccessor().setType('SCALAR').setArray(s.getInput().getArray().slice()).setBuffer(buffer);
    const output = doc.createAccessor().setType(s.getOutput().getType()).setArray(out).setBuffer(buffer);
    const sampler = doc.createAnimationSampler().setInput(input).setOutput(output).setInterpolation(s.getInterpolation());
    anim.addSampler(sampler).addChannel(doc.createAnimationChannel().setTargetNode(node).setTargetPath(ch.getTargetPath()).setSampler(sampler));
  }
  console.log(`clip ${name}: ${anim.listChannels().length} channels`);
}

await doc.transform(resample(), dedup(), prune(), textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [1024, 1024], quality: 82 }));
await io.write(outFile, doc);
rmSync(tmp, { recursive: true, force: true });
console.log(`wrote ${outFile}`);
