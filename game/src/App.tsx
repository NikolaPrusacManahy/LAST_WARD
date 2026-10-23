// Screen flow: menu → game (intro → playing ⇄ paused) → dead / escaped → menu or retry.
import { useCallback, useEffect, useRef, useState } from 'react';
import { MainMenu } from './screens/MainMenu';
import { GameView, GameHandle } from './screens/GameView';
import { PauseMenu } from './screens/PauseMenu';
import { EndScreen } from './screens/EndScreen';
import { SettingsPanel } from './screens/SettingsPanel';
import { Settings, loadSave, recordEscape, writeSave, SaveData } from './state/settings';
import { useUiSounds } from './hooks/useUiSounds';
import { CreditIntro } from './screens/CreditIntro';
import { setMenuAmbience } from './audio/menuAmbience';
import { wantsMenuAmbience } from './state/menuAudio';

type Screen = 'menu' | 'game';
type Overlay = null | 'pause' | 'settings' | { end: 'dead' | 'escaped'; time: number };

export default function App() {
  const [save, setSave] = useState<SaveData>(loadSave);
  const [screen, setScreen] = useState<Screen>('menu');
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [settingsFrom, setSettingsFrom] = useState<'menu' | 'pause'>('menu');
  const [runId, setRunId] = useState(0);
  const game = useRef<GameHandle>(null);
  // Update 0.5.1 — credit screen once per page load. ?debug skips it (automated checks), ?debug&credits shows it.
  const [credits, setCredits] = useState(() => {
    const q = new URLSearchParams(location.search);
    return !q.has('debug') || q.has('credits');
  });

  useEffect(() => writeSave(save), [save]);
  useUiSounds(save.settings.volume);
  // Update 0.5.2 — ambience under the credit screen + main menu; fades out when a run starts.
  useEffect(() => setMenuAmbience(wantsMenuAmbience(screen), save.settings.volume), [screen, save.settings.volume]);

  const updateSettings = useCallback((s: Settings) => {
    setSave((d) => ({ ...d, settings: s }));
    game.current?.setSettings(s);
  }, []);

  const start = () => {
    setRunId((n) => n + 1);
    setOverlay(null);
    setScreen('game');
  };

  const onEnd = useCallback((end: 'dead' | 'escaped', time: number) => {
    setSave((d) => (end === 'escaped' ? recordEscape(d, time) : { ...d, deaths: d.deaths + 1 }));
    setOverlay({ end, time });
  }, []);

  const onPause = useCallback(() => setOverlay('pause'), []);

  const resume = async () => {
    const ok = await game.current?.resume();
    if (ok) setOverlay(null);
  };

  const openSettings = (from: 'menu' | 'pause') => {
    setSettingsFrom(from);
    setOverlay('settings');
  };

  // Esc closes the innermost pop-up first.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Escape') return;
      if (overlay === 'settings') setOverlay(settingsFrom === 'pause' ? 'pause' : null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [overlay, settingsFrom]);

  return (
    <div className="lw-app">
      {screen === 'menu' && overlay !== 'settings' && <MainMenu save={save} onStart={start} onSettings={() => openSettings('menu')} />}
      {screen === 'game' && (
        <GameView key={runId} ref={game} settings={save.settings} onEnd={onEnd} onPause={onPause} paused={overlay !== null} />
      )}
      {overlay === 'pause' && (
        <PauseMenu
          onResume={resume}
          onSettings={() => openSettings('pause')}
          onQuit={() => {
            setOverlay(null);
            setScreen('menu');
          }}
        />
      )}
      {overlay === 'settings' && (
        <SettingsPanel
          settings={save.settings}
          onChange={updateSettings}
          onClose={() => setOverlay(settingsFrom === 'pause' ? 'pause' : null)}
        />
      )}
      {overlay && typeof overlay === 'object' && (
        <EndScreen
          result={overlay.end}
          time={overlay.time}
          save={save}
          onRetry={start}
          onMenu={() => {
            setOverlay(null);
            setScreen('menu');
          }}
        />
      )}
      {credits && <CreditIntro onDone={() => setCredits(false)} />}
    </div>
  );
}
