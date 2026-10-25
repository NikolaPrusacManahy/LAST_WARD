// Update 0.5 — settings: every action with its key/mouse icon. Click one, then press a key or mouse
// button to rebind it (a clash swaps the two). Esc cancels.
import { useEffect, useState } from 'react';
import { ACTIONS, Action, Bindings, DEFAULT_BINDINGS, isBindable, mouseCode, rebind } from '../state/bindings';
import { MOUSE_LOOK, glyphFor } from '../state/inputIcons';
import { InputIcon } from './InputIcon';

interface Props {
  bindings: Bindings;
  onChange(b: Bindings): void;
}

export function KeyBindings({ bindings, onChange }: Props) {
  const [listening, setListening] = useState<Action | null>(null);

  useEffect(() => {
    if (!listening) return;
    const finish = (code: string | null) => {
      if (code && isBindable(code)) onChange(rebind(bindings, listening, code));
      setListening(null);
    };
    // Capture phase: Esc here must not also close the settings panel.
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      finish(e.code === 'Escape' ? null : e.code);
    };
    const onMouse = (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      // The click that follows this press must not land on a button (it would start listening again).
      const eatClick = (c: MouseEvent) => {
        c.preventDefault();
        c.stopPropagation();
      };
      window.addEventListener('click', eatClick, { capture: true, once: true });
      setTimeout(() => window.removeEventListener('click', eatClick, true), 400);
      finish(mouseCode(e.button));
    };
    const noMenu = (e: MouseEvent) => e.preventDefault();
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('mousedown', onMouse, true);
    window.addEventListener('contextmenu', noMenu, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('mousedown', onMouse, true);
      // Let the right-click that ended listening finish before the menu is allowed again.
      setTimeout(() => window.removeEventListener('contextmenu', noMenu, true), 0);
    };
  }, [listening, bindings, onChange]);

  return (
    <section className="lw-keys">
      {/* Update 0.9.9 — in two columns (the settings fit the screen, no scrolling). */}
      <div className="lw-keys-grid">
      {ACTIONS.map(({ id, label }) => (
        <div className="lw-keys-row" key={id}>
          <span>{label}</span>
          <button
            className={`lw-keys-btn ${listening === id ? 'lw-keys-wait' : ''}`}
            onClick={(e) => {
              e.currentTarget.blur();
              setListening(id);
            }}
          >
            {listening === id ? (
              <span className="lw-keys-press">Press a key…</span>
            ) : (
              <>
                <InputIcon code={bindings[id]} />
                <span className="lw-keys-name">{glyphFor(bindings[id]).label}</span>
              </>
            )}
          </button>
        </div>
      ))}
      <div className="lw-keys-row lw-keys-fixed">
        <span>Look</span>
        <span className="lw-keys-btn">
          <InputIcon glyph={MOUSE_LOOK} />
          <span className="lw-keys-name">Mouse</span>
        </span>
      </div>
      <div className="lw-keys-row lw-keys-fixed">
        <span>Pause</span>
        <span className="lw-keys-btn">
          <InputIcon code="Escape" />
          <span className="lw-keys-name">Esc</span>
        </span>
      </div>
      </div>
      <button className="lw-keys-reset" onClick={() => onChange({ ...DEFAULT_BINDINGS })}>
        Reset controls
      </button>
    </section>
  );
}
