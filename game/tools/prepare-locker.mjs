// Update 0.9.5 — the hiding locker. "Dirty Locker (256x256 Retro)" (xylvnking, CC BY 4.0) comes as two
// single-mesh lockers, one with its door open, door and body welded together. This takes the open one,
// cuts the door off (every triangle in front of the body's front face), hangs it on a hinge node
// `LockerDoor` (closed by default; the game swings it open) and scales it to a 2 m locker.
//
// Usage (from game/):  node tools/prepare-locker.mjs ../ASSETS/models/locker/locker.glb public/models/props/locker.glb
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { compactPrimitive, getBounds, prune, dedup, textureCompress } from '@gltf-transform/functions';
import sharp from 'sharp';

const [src, out] = process.argv.slice(2);
const HEIGHT = 2.0;
/** In the source mesh (z up, front towards -y): door triangles lie wholly in front of this. */
const DOOR_CUT_Y = -0.22;
/** The hinge (source mesh coords), worked out so the swung-shut door lines up with the closed locker. */
const HINGE = [0.197, -0.224];

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(src);
const root = doc.getRoot();
const meshNode = root.listNodes().find((n) => n.getName() === 'Locker_Texture Paint.001_0');
const prim = meshNode.getMesh().listPrimitives()[0];
const pos = prim.getAttribute('POSITION');
const idx = prim.getIndices();

const door = [];
const body = [];
for (let t = 0; t < idx.getCount(); t += 3) {
  const tri = [idx.getScalar(t), idx.getScalar(t + 1), idx.getScalar(t + 2)];
  // In front of the body, or the door's own edge right at the hinge (x > 0.158, a hair in front).
  const isDoor = tri.every((i) => {
    const [x, y] = pos.getElement(i, []);
    return y < DOOR_CUT_Y || (x > 0.158 && y < -0.2175);
  });
  (isDoor ? door : body).push(...tri);
}
const subset = (indices, name) => {
  const p = prim.clone();
  for (const sem of p.listSemantics()) p.setAttribute(sem, p.getAttribute(sem).clone());
  p.setIndices(doc.createAccessor(name + '_idx').setType('SCALAR').setArray(new Uint32Array(indices)));
  compactPrimitive(p); // keep only its own vertices (bounds, size)
  return doc.createMesh(name).addPrimitive(p);
};

const scene = root.listScenes()[0];
for (const n of [...scene.listChildren()]) scene.removeChild(n);
const s = HEIGHT / 1.269;
// Source is z-up: turn it -90° about x so it stands up, front towards +z.
const q = [-Math.SQRT1_2, 0, 0, Math.SQRT1_2];
const model = doc.createNode('LockerModel').setRotation(q).setScale([s, s, s]);
model.addChild(doc.createNode('LockerBody').setMesh(subset(body, 'LockerBody')));
// Hinge: rotating about its local z (up) swings the door. Closed = -90° from the source's open pose.
const hinge = doc.createNode('LockerDoor').setTranslation([HINGE[0], HINGE[1], 0]).setRotation([0, 0, -Math.SQRT1_2, Math.SQRT1_2]);
hinge.addChild(doc.createNode('LockerDoorMesh').setMesh(subset(door, 'LockerDoorMesh')).setTranslation([-HINGE[0], -HINGE[1], 0]));
model.addChild(hinge);
const wrap = doc.createNode('locker').addChild(model);
scene.addChild(wrap);
// Base on the floor, centred.
const b = getBounds(scene);
wrap.setTranslation([-(b.min[0] + b.max[0]) / 2, -b.min[1], -(b.min[2] + b.max[2]) / 2]);
for (const n of root.listNodes()) if (!n.getParentNode() && !scene.listChildren().includes(n)) n.dispose();
await doc.transform(prune(), dedup(), textureCompress({ encoder: sharp, targetFormat: 'webp', quality: 85 }));
await io.write(out, doc);
const ob = getBounds(scene);
console.log(`locker ${ob.max.map((v, i) => (v - ob.min[i]).toFixed(2)).join(' x ')} m, door ${door.length / 3} tris, body ${body.length / 3} tris → ${out}`);
