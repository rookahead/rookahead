import { PALETTES, type Palette } from '../lib/settings'

/** The app's colour themes as swatches; `compact` drops the names (the You page's quick row). */
export function PalettePicker({ value, onChange, compact = false }: { value: Palette; onChange: (p: Palette) => void; compact?: boolean }) {
  return (
    <div className={`palette-picker ${compact ? 'compact' : ''}`} role="radiogroup" aria-label="Colour">
      {PALETTES.map((p) => (
        <button
          key={p.id}
          type="button"
          role="radio"
          aria-checked={value === p.id}
          aria-label={p.label}
          title={p.label}
          className={`palette-option ${value === p.id ? 'active' : ''}`}
          onClick={() => onChange(p.id)}
        >
          <span className="palette-swatch" style={{ background: p.swatch }} aria-hidden />
          {!compact && <span className="palette-name">{p.label}</span>}
        </button>
      ))}
    </div>
  )
}
