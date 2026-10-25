// Update 0.9.9 — Co-op from the main menu: your name, then Create room (you get a code to send) or Join
// with code; then the lobby: who's in, ready, the host's difficulty, a 3-second countdown into the run.
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { CoopClient, CoopStart } from '../net/room';
import { currentMic, getMic, micAnswer } from '../net/voice';
import { CODE_LENGTH, COOP_DIFFICULTIES, COOP_DIFFICULTY, CoopDifficulty, MAX_PLAYERS, NAME_MAX, Room, countdownLeft, lobbyHint, normalizeCode } from '../state/coop';
import { MIMIC } from '../state/coopRun';

interface Props {
  client: CoopClient;
  name: string;
  onName(name: string): void;
  onStart(run: CoopStart): void;
  onBack(): void;
}

export function CoopPanel({ client, name, onName, onStart, onBack }: Props) {
  const snap = useSyncExternalStore(client.subscribe, client.getSnapshot);
  const [view, setView] = useState<'start' | 'join'>('start');
  const [code, setCode] = useState('');
  const started = useRef(false);

  // The host flips the room to playing when the countdown ends: everyone's run starts then.
  useEffect(() => {
    if (snap.room?.status !== 'playing' || started.current) return;
    const run = client.startInfo();
    if (!run) return;
    started.current = true;
    onStart(run);
  }, [snap.room, client, onStart]);

  // Esc goes back a screen; it never takes you out of a room (that's Leave room).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Escape' || snap.room || snap.busy) return;
      client.clearError();
      if (view === 'join') setView('start');
      else onBack();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [client, view, snap.room, snap.busy, onBack]);

  if (snap.room) return <Lobby client={client} room={snap.room} me={snap.me} local={snap.local} busy={snap.busy} />;

  const create = () => void client.create(name, 'normal');
  const join = () => void client.join(code, name);
  const back = () => {
    client.clearError();
    if (view === 'join') setView('start');
    else onBack();
  };

  return (
    <div className="lw-overlay">
      <div className="lw-panel lw-coop">
        <h2 className="lw-panel-title">Co-op</h2>
        <label className="lw-coop-field">
          <span>Your name</span>
          <input
            value={name}
            maxLength={NAME_MAX}
            placeholder="Who are you?"
            spellCheck={false}
            autoComplete="off"
            autoFocus={view === 'start'}
            onChange={(e) => onName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && view === 'start' && create()}
          />
        </label>
        {view === 'join' && (
          <label className="lw-coop-field">
            <span>Room code</span>
            <input
              className="lw-coop-code"
              value={code}
              maxLength={CODE_LENGTH + 2}
              placeholder="K7Q2M"
              spellCheck={false}
              autoComplete="off"
              autoFocus
              onChange={(e) => setCode(normalizeCode(e.target.value).slice(0, CODE_LENGTH))}
              onKeyDown={(e) => e.key === 'Enter' && join()}
            />
          </label>
        )}
        <p className="lw-coop-error" role="alert">{snap.busy ? 'Connecting…' : snap.error ?? ''}</p>
        <nav className="lw-menu-nav">
          {view === 'start' ? (
            <>
              <button className="lw-menu-btn" disabled={snap.busy} onClick={create}>Create room</button>
              <button className="lw-menu-btn" disabled={snap.busy} onClick={() => (client.clearError(), setView('join'))}>Join with code</button>
            </>
          ) : (
            <button className="lw-menu-btn" disabled={snap.busy} onClick={join}>Join</button>
          )}
          <button className="lw-menu-btn" disabled={snap.busy} onClick={back}>Back</button>
        </nav>
      </div>
    </div>
  );
}

function Lobby({ client, room, me, local, busy }: { client: CoopClient; room: Room; me: string; local: boolean; busy: boolean }) {
  const host = room.host === me;
  const mine = room.players.find((p) => p.id === me);
  const [, redraw] = useState(0);
  const [copied, setCopied] = useState(false);
  // Update 0.9.9 — your microphone for proximity chat: asked on the main menu, and again when you press
  // Ready if you didn't say yes there.
  const [mic, setMic] = useState<'ask' | 'on' | 'off'>(() => (currentMic() || micAnswer() === 'yes' ? 'on' : micAnswer() === 'no' ? 'off' : 'ask'));
  const [asking, setAsking] = useState(false);
  // With proximity chat on, you're only ready once you've answered the microphone question: the countdown
  // used to start (and the run with it) while the prompt was still up, and you played without your mic.
  const ready = async () => {
    if (room.voice && !mine?.ready && mic !== 'on') {
      setAsking(true);
      const m = await getMic();
      setAsking(false);
      setMic(m ? 'on' : 'off');
    }
    void client.setReady(!mine?.ready);
  };

  // Redraw the countdown ten times a second while it runs.
  useEffect(() => {
    if (room.status !== 'starting') return;
    const t = setInterval(() => redraw((n) => n + 1), 100);
    return () => clearInterval(t);
  }, [room.status]);

  const left = countdownLeft(room, client.now());
  const copy = () => {
    void navigator.clipboard?.writeText(room.code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  const pick = (d: CoopDifficulty) => void client.setDifficulty(d);

  return (
    <div className="lw-overlay">
      <div className="lw-panel lw-coop lw-lobby">
        <h2 className="lw-panel-title">Lobby</h2>
        {/* Update 0.9.9 — two columns, so it fits the screen with no scrolling (Nikola): who's in on the
            left, the host's choices on the right. */}
        <div className="lw-lobby-cols">
        <div className="lw-lobby-col">
        <div className="lw-room-code">
          <span className="lw-coop-label">Room code</span>
          <span className="lw-room-code-value">{room.code}</span>
          <button className="lw-room-copy" onClick={copy}>{copied ? 'Copied' : 'Copy'}</button>
        </div>

        <ol className="lw-lobby-players">
          {Array.from({ length: MAX_PLAYERS }, (_, slot) => {
            const p = room.players.find((x) => x.slot === slot);
            if (!p) {
              return (
                <li key={slot} className="lw-lobby-player lw-lobby-empty">
                  <span className="lw-lobby-slot">{slot + 1}</span>
                  <span className="lw-lobby-name">Waiting for a friend…</span>
                </li>
              );
            }
            return (
              <li key={slot} className={`lw-lobby-player ${p.ready ? 'lw-lobby-ready' : ''} ${p.id === me ? 'lw-lobby-me' : ''}`}>
                <span className="lw-lobby-slot">{slot + 1}</span>
                <span className="lw-lobby-name">{p.name}</span>
                <span className="lw-lobby-tags">
                  {p.id === room.host && <em>host</em>}
                  {p.id === me && <em>you</em>}
                </span>
                <span className="lw-lobby-state">{p.ready ? 'Ready' : 'Not ready'}</span>
              </li>
            );
          })}
        </ol>
        </div>

        <div className="lw-lobby-col">
        <div className="lw-lobby-diff">
          <span className="lw-coop-label">Difficulty{host ? '' : ' · the host picks'}</span>
          <div className="lw-set-seg" role="radiogroup" aria-label="Difficulty">
            {COOP_DIFFICULTIES.map((d) => (
              <button key={d} role="radio" aria-checked={room.difficulty === d} className={`lw-set-seg-btn ${room.difficulty === d ? 'lw-set-seg-on' : ''}`} disabled={!host || room.status !== 'lobby'} onClick={() => pick(d)}>
                {COOP_DIFFICULTY[d].label}
              </button>
            ))}
          </div>
          <span className="lw-lobby-diff-blurb">{COOP_DIFFICULTY[room.difficulty].blurb}</span>
        </div>

        <div className="lw-lobby-opts">
          <span className="lw-coop-label">Voice{host ? '' : ' · the host picks'}</span>
          <label className="lw-opt">
            <input type="checkbox" checked={room.voice} disabled={!host || room.status !== 'lobby'} onChange={(e) => void client.setOptions({ voice: e.target.checked })} />
            <span className="lw-opt-name">Proximity chat</span>
          </label>
          <label className={`lw-opt ${room.voice ? '' : 'lw-opt-off'}`}>
            <input type="checkbox" checked={room.hear} disabled={!host || !room.voice || room.status !== 'lobby'} onChange={(e) => void client.setOptions({ hear: e.target.checked })} />
            <span className="lw-opt-name">Enemy can hear you talk</span>
          </label>
          {MIMIC.enabled && (
          <label className={`lw-opt ${room.voice ? '' : 'lw-opt-off'}`}>
            <input type="checkbox" checked={room.mimic} disabled={!host || !room.voice || room.status !== 'lobby'} onChange={(e) => void client.setOptions({ mimic: e.target.checked })} />
            <span className="lw-opt-name">It mimics your voices</span>
          </label>
          )}
          {room.voice && (
            <p className="lw-lobby-privacy">
              Voice is peer-to-peer: players in this room can see your IP.{MIMIC.enabled && room.mimic ? ' Mimic clips stay in memory, this run only.' : ''}
            </p>
          )}
          {room.voice && (
            <p className={`lw-lobby-mic lw-lobby-mic-${mic}`}>
              {mic === 'on' ? 'Mic on · V mutes' : mic === 'off' ? 'No mic' : 'Mic: asked on Ready'}
            </p>
          )}
        </div>
        </div>
        </div>

        <div className="lw-lobby-foot">
          <p className="lw-lobby-hint">
            {lobbyHint(room)}
            {local && <span className="lw-coop-local">Test mode (?coop=local): this browser's tabs only.</span>}
          </p>
          <nav className="lw-menu-nav lw-lobby-nav">
            <button className="lw-menu-btn" disabled={busy || asking || room.status === 'playing'} onClick={() => void ready()}>
              {asking ? 'Allow the microphone…' : mine?.ready ? 'Not ready' : 'Ready'}
            </button>
            <button className="lw-menu-btn" disabled={busy} onClick={() => void client.leave()}>{host ? 'Close room' : 'Leave room'}</button>
          </nav>
        </div>
      </div>
      {left !== null && (
        <div className="lw-countdown" key={left}>
          {left}
        </div>
      )}
    </div>
  );
}
