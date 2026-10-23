// Update 0.4.1 — hover / click sounds for every menu button (main menu, settings, pause, end
// screens, the intro card). One document-level listener, so new buttons get sounds for free
// as long as they use the lw-menu-btn class.
import { useEffect } from 'react';
import { setUiVolume, uiClick, uiHover, unlockUi } from '../audio/uiSounds';

const HOVER = '.lw-menu-btn';
const CLICK = '.lw-menu-btn, .lw-intro, .lw-set-row input[type="checkbox"]';

export function useUiSounds(volume: number) {
  useEffect(() => setUiVolume(volume), [volume]);

  useEffect(() => {
    let current: Element | null = null;
    const onOver = (e: PointerEvent) => {
      const btn = (e.target as Element | null)?.closest?.(HOVER) ?? null;
      if (btn && btn !== current) uiHover();
      current = btn;
    };
    const onDown = (e: PointerEvent) => {
      unlockUi();
      if ((e.target as Element | null)?.closest?.(CLICK)) uiClick();
    };
    const onKey = () => unlockUi();
    document.addEventListener('pointerover', onOver);
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey, { once: true });
    return () => {
      document.removeEventListener('pointerover', onOver);
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, []);
}
