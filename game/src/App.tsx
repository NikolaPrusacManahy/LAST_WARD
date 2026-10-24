// Screen flow: menu → game (intro → playing ⇄ paused) → dead / escaped → menu or retry.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MainMenu } from './screens/MainMenu';
import { GameView, GameHandle } from './screens/GameView';
import type { CoopEnd } from './engine/Game';
import { PauseMenu } from './screens/PauseMenu';
import { EndScreen } from './screens/EndScreen';
import { SettingsPanel } from './screens/SettingsPanel';
import { CreditsPanel } from './screens/CreditsPanel';
import { DifficultyPanel } from './screens/DifficultyPanel';
import { CoopPanel } from './screens/CoopPanel';
import { CoopClient, CoopStart } from './net/room';
import { connectCoop } from './net/backend';
import { createRng } from './world/rng';
import { NAME_MAX } from './state/coop';
import type { Difficulty } from './state/difficulty';
import { Settings, loadSave, recordEscape, writeSave, SaveData, mixVolumes } from './state/settings';
import { useUiSounds } from './hooks/useUiSounds';
import { CreditIntro } from './screens/CreditIntro';
import { setMenuAmbience } from './audio/menuAmbience';
import { wantsMenuAmbience } from './state/menuAudio';
import { chooseStartLevel, showCredits, startLevelIndex } from './state/devTools';
import { LEVELS } from './world/content/levels';

const PICK_KEY = 'lw-tester-level';

type Screen = 'menu' | 'game';
type Overlay = null | 'pause' | 'settings' | 'credits' | 'difficulty' | 'coop' | { end: 'dead' | 'escaped'; time: number; coop?: CoopEnd };

export default function App() {
  const [save, setSave] = useState<SaveData>(loadSave);
  const [screen, setScreen] = useState<Screen>('menu');
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [settingsFrom, setSettingsFrom] = useState<'menu' | 'pause'>('menu');
  const [runId, setRunId] = useState(0);
  const game = useRef<GameHandle>(null);
  // Update 0.9.9 — co-op: one connection for the page; the run in progress if it came from a room.
  const coop = useMemo(() => new CoopClient(connectCoop, createRng(Date.now() >>> 0)), []);
  const [coopRun, setCoopRun] = useState<CoopStart | null>(null);
  const coopRunRef = useRef(coopRun);
  coopRunRef.current = coopRun;
  // Update 0.5.1 — credit screen once per page load. ?debug skips it (automated checks), ?debug&credits shows it.
  // Update 0.6.5 — only in dev; the public build always shows it.
  const [credits, setCredits] = useState(() => showCredits(import.meta.env.DEV, location.search));

  // Update 0.7.1 — tester level picker (dev build only): ?level=N, else the last pick in this browser.
  const [startLevel, setStartLevel] = useState(() => {
    if (!import.meta.env.DEV) return 0;
    let saved = 0;
    try {
      saved = Number(localStorage.getItem(PICK_KEY) ?? 0);
    } catch {
      /* storage blocked: start at level 1 */
    }
    return startLevelIndex(true, location.search, LEVELS.length) || chooseStartLevel(true, saved, LEVELS.length);
  });
  const pickLevel = import.meta.env.DEV
    ? (n: number) => {
        setStartLevel(n);
        try {
          localStorage.setItem(PICK_KEY, String(n));
        } catch {
          /* fine: just not remembered */
        }
      }
    : () => {};

  useEffect(() => writeSave(save), [save]);
  // Closing the tab drops you out of any room straight away (the host's room closes with them).
  useEffect(() => {
    const onHide = () => coop.close();
    window.addEventListener('pagehide', onHide);
    return () => window.removeEventListener('pagehide', onHide);
  }, [coop]);
  const mix = mixVolumes(save.settings); // Update 0.9.2 — master × SFX / BGM
  useUiSounds(mix.uiSfx);
  // Update 0.5.2 — ambience under the credit screen + main menu; fades out when a run starts.
  useEffect(() => setMenuAmbience(wantsMenuAmbience(screen), mix.menuBgm), [screen, mix.menuBgm]);

  const updateSettings = useCallback((s: Settings) => {
    setSave((d) => ({ ...d, settings: s }));
    game.current?.setSettings(s);
  }, []);

  const start = () => {
    setRunId((n) => n + 1);
    setOverlay(null);
    setScreen('game');
  };

  // Update 0.9.3 — Begin asks for a difficulty first; the pick is saved and used for this run (and retries).
  const startWith = (d: Difficulty) => {
    const s = { ...save.settings, difficulty: d };
    setSave((x) => ({ ...x, settings: s }));
    setRunId((n) => n + 1);
    setOverlay(null);
    setScreen('game');
  };

  // Update 0.9.9 — the countdown ran out: everyone's run starts, side by side in the spawn room.
  const startCoop = useCallback((run: CoopStart) => {
    setCoopRun(run);
    setRunId((n) => n + 1);
    setOverlay(null);
    setScreen('game');
  }, []);

  const toMenu = () => {
    if (coopRunRef.current) {
      void coop.leave();
      setCoopRun(null);
    }
    setOverlay(null);
    setScreen('menu');
  };

  const onEnd = useCallback((end: 'dead' | 'escaped', time: number, coopEnd?: CoopEnd) => {
    // Co-op runs stay out of the solo record (escapes, deaths, best time).
    if (!coopRunRef.current) setSave((d) => (end === 'escaped' ? recordEscape(d, time) : { ...d, deaths: d.deaths + 1 }));
    setOverlay({ end, time, coop: coopEnd });
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
      if (overlay === 'credits' || overlay === 'difficulty') setOverlay(null); // co-op handles its own Esc
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [overlay, settingsFrom]);

  return (
    <div className="lw-app">
      {screen === 'menu' && overlay !== 'settings' && overlay !== 'credits' && overlay !== 'difficulty' && overlay !== 'coop' && <MainMenu save={save} onStart={() => setOverlay('difficulty')} onCoop={() => setOverlay('coop')} onSettings={() => openSettings('menu')} onCredits={() => setOverlay('credits')} startLevel={startLevel} onPickLevel={pickLevel} />}
      {screen === 'game' && (
        <GameView key={runId} ref={game} settings={save.settings} onEnd={onEnd} onPause={onPause} paused={overlay !== null} startLevel={startLevel} coop={coopRun} />
      )}
      {overlay === 'pause' && (
        <PauseMenu
          coop={!!coopRun}
          onResume={resume}
          onSettings={() => openSettings('pause')}
          onQuit={toMenu}
        />
      )}
      {overlay === 'settings' && (
        <SettingsPanel
          settings={save.settings}
          onChange={updateSettings}
          onClose={() => setOverlay(settingsFrom === 'pause' ? 'pause' : null)}
        />
      )}
      {overlay === 'credits' && <CreditsPanel onClose={() => setOverlay(null)} />}
      {overlay === 'difficulty' && <DifficultyPanel current={save.settings.difficulty} onPick={startWith} onBack={() => setOverlay(null)} />}
      {overlay === 'coop' && (
        <CoopPanel
          client={coop}
          name={save.coopName}
          onName={(n) => setSave((d) => ({ ...d, coopName: n.slice(0, NAME_MAX) }))}
          onStart={startCoop}
          onBack={() => setOverlay(null)}
        />
      )}
      {overlay && typeof overlay === 'object' && (
        <EndScreen
          result={overlay.end}
          time={overlay.time}
          save={save}
          coop={overlay.coop}
          onRetry={coopRun ? undefined : start}
          onMenu={toMenu}
        />
      )}
      {credits && <CreditIntro onDone={() => setCredits(false)} />}
    </div>
  );
}
