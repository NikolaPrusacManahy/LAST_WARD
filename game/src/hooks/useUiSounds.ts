// Update 0.4.1 — hover / click sounds for every menu button (main menu, settings, pause, end
// screens, the intro card). One document-level listener, so new buttons get sounds for free
// as long as they use the lw-menu-btn class.
// Update 0.9.9 — and every other thing you pick in a menu: the difficulty cards, switches (the lobby's
// difficulty, graphics), the lobby's voice options and Copy, the settings tabs, the key buttons. They had
// no sound. Greyed out (not the host, say): silent.
// Update 1.0.1 — the map cards.
import { useEffect } from 'react';
import { setUiVolume, uiClick, uiHover, unlockUi } from '../audio/uiSounds';

const PICK = '.lw-menu-btn, .lw-diff, .lw-map, .lw-set-seg-btn, .lw-set-tab, .lw-opt, .lw-room-copy, button.lw-keys-btn, .lw-keys-reset';
const HOVER = PICK;
const CLICK = `${PICK}, .lw-intro, .lw-set-row input[type="checkbox"]`;

/** The thing under the pointer that makes a sound, if it isn't greyed out. */
function soundOf(target: EventTarget | null, selector: string): Element | null {
  const el = (target as Element | null)?.closest?.(selector) ?? null;
  return el && !el.matches(':disabled') && !el.querySelector('input:disabled') ? el : null;
}

export function useUiSounds(volume: number) {
  useEffect(() => setUiVolume(volume), [volume]);

  useEffect(() => {
    let current: Element | null = null;
    const onOver = (e: PointerEvent) => {
      const btn = soundOf(e.target, HOVER);
      if (btn && btn !== current) uiHover();
      current = btn;
    };
    const onDown = (e: PointerEvent) => {
      unlockUi();
      if (soundOf(e.target, CLICK)) uiClick();
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
