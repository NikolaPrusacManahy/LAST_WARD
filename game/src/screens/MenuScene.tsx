// Update 0.4.3 — mounts the 3D menu backdrop (engine/menuScene.ts) on the right of the main menu.
import { useEffect, useRef } from 'react';
import { createMenuScene } from '../engine/menuScene';
import { flickerBuzz } from '../audio/uiSounds';

export function MenuScene() {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!host.current) return;
    const scene = createMenuScene(host.current, {
      onFlicker: (phase) => (phase === 'scare' ? flickerBuzz(1.3, 0.09) : flickerBuzz()),
    });
    return () => scene.dispose();
  }, []);
  return <div className="lw-menu-scene" ref={host} aria-hidden="true" />;
}
