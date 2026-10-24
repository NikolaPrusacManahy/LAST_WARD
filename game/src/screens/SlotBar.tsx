// Update 0.9.8 — your three slots, bottom centre: what's in each, the one your hand is on lifted and lit,
// its key in the corner. Underneath: what you're holding and how to drop it.
import type { HudState } from '../engine/hudStore';
import { InputIcon } from './InputIcon';
import { ItemIcon } from './ItemIcon';

interface Props {
  slots: HudState['slots'];
  slot: number;
  stowed: boolean;
  dropKey: string;
}

export function SlotBar({ slots, slot, stowed, dropKey }: Props) {
  const inHand = stowed ? null : slots[slot];
  return (
    <div className="lw-slots">
      <div className="lw-slots-row">
        {slots.map((s, i) => (
          <div key={i} className={`lw-slot${i === slot ? ' lw-slot-on' : ''}${i === slot && stowed ? ' lw-slot-stowed' : ''}`}>
            <span className="lw-slot-key">{i + 1}</span>
            {s && <ItemIcon kind={s.kind} half={s.title === 'Half a brick'} />}
          </div>
        ))}
      </div>
      <div className="lw-slots-label">
        {inHand ? (
          <>
            <span className="lw-slots-name">{inHand.title}</span>
            <span className="lw-slots-hint">
              <InputIcon code={dropKey} size="sm" /> drop
            </span>
          </>
        ) : (
          <span className="lw-slots-name lw-slots-idle">{stowed ? 'Put away' : 'Empty hands'}</span>
        )}
      </div>
    </div>
  );
}
