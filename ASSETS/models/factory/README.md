# The factory kit (Harrow Mill)

`abandoned_factory_modules.glb`: **Abandoned Factory Modules** by Thaddaeus (Sketchfab, CC BY 4.0,
https://sketchfab.com/3d-models/abandoned-factory-modules-1f8e4e72cafc4df18945a8a9cd22dd7d), the GLB download.
Credited on the in-game Credits screen (`game/src/state/credits.ts`).

The game doesn't load it as it is: from `game/`, run

```
node tools/prepare-kit.mjs ../ASSETS/models/factory/abandoned_factory_modules.glb public/models/props/factory_kit.glb
```

It keeps the pieces the game uses (`PIECES` in the script: the wall panels, the floor slab, the rusted roof plate,
the grating, the stairs, the round lamp, the bench, crates, the console, the tank, the fuse box, the signs and the
plans), scales a 2.46 m module to the game's 3 m tile, and writes them as one file sharing the kit's textures.
The kit's materials are in an old format three.js no longer reads (spec / gloss); the script converts them.
