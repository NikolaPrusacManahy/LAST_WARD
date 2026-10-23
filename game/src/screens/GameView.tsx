// Hosts the three.js Game and the HUD. One instance per run (keyed by runId in App).
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import { Game } from '../engine/Game';
import { createHudStore } from '../engine/hudStore';
import type { Settings } from '../state/settings';
import { Hud } from './Hud';

export interface GameHandle {
  resume(): Promise<boolean>;
  setSettings(s: Settings): void;
}

interface Props {
  settings: Settings;
  paused: boolean;
  onEnd(result: 'dead' | 'escaped', seconds: number): void;
  onPause(): void;
  /** Update 0.7.1 — level to start on (tester picker; ignored by the public build). */
  startLevel: number;
}

export const GameView = forwardRef<GameHandle, Props>(function GameView({ settings, paused, onEnd, onPause, startLevel }, ref) {
  const host = useRef<HTMLDivElement>(null);
  const game = useRef<Game | null>(null);
  const hud = useMemo(() => createHudStore(), []);
  const cbs = useRef({ onEnd, onPause });
  cbs.current = { onEnd, onPause };

  useEffect(() => {
    let disposed = false;
    // Wait for web fonts so the wall writing texture uses the right typeface.
    void document.fonts.ready.then(() => {
      if (disposed || !host.current) return;
      game.current = new Game(host.current, settings, hud, {
        onEnd: (r, s) => cbs.current.onEnd(r, s),
        onPause: () => cbs.current.onPause(),
      }, startLevel);
    });
    return () => {
      disposed = true;
      game.current?.dispose();
      game.current = null;
    };
    // Settings changes go through setSettings, not a rebuild.
  }, [hud]);

  useImperativeHandle(ref, () => ({
    resume: () => game.current?.resume() ?? Promise.resolve(false),
    setSettings: (s) => game.current?.setSettings(s),
  }));

  return (
    <div className="lw-game" ref={host}>
      <Hud store={hud} hidden={paused} onBegin={() => game.current?.begin()} />
    </div>
  );
});
