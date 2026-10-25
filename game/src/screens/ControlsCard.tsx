// Update 0.5 — the controls box on the right at the start of a run. Shown for 10 s; Enter closes it.
import type { Bindings } from '../state/bindings';
import { MOUSE_LOOK } from '../state/inputIcons';
import { CONTROLS_CARD_SECONDS } from '../state/prompts';
import { InputIcon } from './InputIcon';

interface Props {
  bindings: Bindings;
  secondsLeft: number;
  /** Update 0.9.3 — Easy: the flashlight key is the night vision goggles. */
  nightVision?: boolean;
  /** Update 0.9.9 — co-op: the ping, and (with proximity chat) the mute key. */
  coop?: { voice: boolean };
}

export function ControlsCard({ bindings: b, secondsLeft, nightVision, coop }: Props) {
  const rows: [string, JSX.Element][] = [
    ['Move', <><InputIcon code={b.forward} /><InputIcon code={b.left} /><InputIcon code={b.back} /><InputIcon code={b.right} /></>],
    ['Look', <InputIcon glyph={MOUSE_LOOK} />],
    ['Run', <InputIcon code={b.sprint} />],
    ['Crouch', <InputIcon code={b.crouch} />],
    [nightVision ? 'Night vision' : 'Flashlight', <InputIcon code={b.flashlight} />],
    ['Interact / use item', <InputIcon code={b.interact} />],
    // Update 0.9.8 — your three slots, and dropping what's in your hand.
    ['Item slots', <><InputIcon code="Digit1" /><InputIcon code="Digit2" /><InputIcon code="Digit3" /></>],
    ['Skill check / drop', <InputIcon code={b.skillCheck} />],
    ['Look back (running)', <InputIcon code={b.lookBack} />],
    ...(coop ? ([['Ping', <InputIcon code={b.ping} />]] as [string, JSX.Element][]) : []),
    ...(coop?.voice ? ([['Mute microphone', <InputIcon code={b.mute} />]] as [string, JSX.Element][]) : []),
    [coop ? 'Menu (nothing stops)' : 'Pause', <InputIcon code="Escape" />],
  ];
  return (
    <aside className="lw-ctl-card" aria-label="Controls">
      <h3 className="lw-ctl-title">Controls</h3>
      <dl className="lw-ctl-list">
        {rows.map(([label, keys]) => (
          <div className="lw-ctl-row" key={label}>
            <dt>{label}</dt>
            <dd>{keys}</dd>
          </div>
        ))}
      </dl>
      <div className="lw-ctl-foot">
        <InputIcon code="Enter" size="sm" />
        <span>close</span>
      </div>
      <div className="lw-ctl-timer" style={{ width: `${(secondsLeft / CONTROLS_CARD_SECONDS) * 100}%` }} />
    </aside>
  );
}
