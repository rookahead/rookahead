import type { Appearance, Settings } from '../../lib/settings'
import { Section } from './shared'

const THEMES: [Appearance, string, string][] = [
  ['dark', 'Dark', 'Easy on the eyes, day or night.'],
  ['light', 'Light', 'Bright and crisp.'],
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

/** Dark, light, or whatever the device uses. */
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
    </Section>
  )
}
