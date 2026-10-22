import type { Appearance, Settings } from '../../lib/settings'
import { PalettePicker } from '../../components/PalettePicker'
import { Section } from './shared'

const THEMES: [Appearance, string, string][] = [
  ['dark', 'Dark', 'Dark, tinted with your colour.'],
  ['black', 'Black', 'True black, for AMOLED screens.'],
  ['light', 'Light', 'Bright, tinted with your colour.'],
  ['system', 'System', 'Follows your device.'],
]

/** A tiny sketch of the app (sidebar, heading, cards) in one theme; System shows both halves. */
function Sketch({ theme }: { theme: Appearance }) {
  if (theme === 'system') {
    return (
      <span className="theme-sketch system" aria-hidden>
        <Sketch theme="dark" />
        <Sketch theme="light" />
      </span>
    )
  }
  return (
    <span className={`theme-sketch ${theme}`} aria-hidden>
      <span className="theme-sketch-side" />
      <span className="theme-sketch-main">
        <span className="theme-sketch-title" />
        <span className="theme-sketch-cards">
          <span />
          <span />
        </span>
        <span className="theme-sketch-wide" />
      </span>
    </span>
  )
}

/** Dark, black, light, or whatever the device uses. */
export function AppearanceSection({ settings, onChange }: { settings: Settings; onChange: (patch: Partial<Settings>) => void }) {
  return (
    <Section title="Appearance" lead="Choose how Rookahead looks.">
      <div className="theme-tiles" role="radiogroup" aria-label="Theme">
        {THEMES.map(([value, label, line]) => (
          <button key={value} role="radio" aria-checked={settings.appearance === value} className={`theme-tile ${settings.appearance === value ? 'active' : ''}`} onClick={() => onChange({ appearance: value })}>
            <Sketch theme={value} />
            <span className="theme-tile-text">
              <strong>{label}</strong>
              <span>{line}</span>
            </span>
          </button>
        ))}
      </div>
      <header className="settings-section-head palette-head">
        <h2>Colour</h2>
        <p>The accent on buttons and your latest game, and the tint of every background.</p>
      </header>
      <PalettePicker value={settings.palette} onChange={(palette) => onChange({ palette })} />
    </Section>
  )
}
