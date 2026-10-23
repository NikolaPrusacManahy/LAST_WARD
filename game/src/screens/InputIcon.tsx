// Update 0.5 — one input prompt: a Kenney icon (public/ui/inputs) or a drawn key cap with the label.
import { InputGlyph, glyphFor } from '../state/inputIcons';

interface Props {
  code?: string;
  glyph?: InputGlyph;
  size?: 'sm' | 'md' | 'lg';
}

export function InputIcon({ code, glyph, size = 'md' }: Props) {
  const g = glyph ?? glyphFor(code ?? '');
  if (!g.icon) return <span className={`lw-input-cap lw-input-${size}`}>{g.label}</span>;
  return <img className={`lw-input-icon lw-input-${size}`} src={`/ui/inputs/${g.icon}.svg`} alt={g.label} title={g.label} draggable={false} />;
}
