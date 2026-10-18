import { FULL_ENGINE_AVAILABLE, type EngineStatus } from '../engine/Engine'
import type { BoardTheme, Settings } from '../lib/settings'
import { playSound } from '../lib/sound'
import { BOARD_THEMES } from './Board'

interface Props {
  settings: Settings
  status: EngineStatus | null
  onChange: (patch: Partial<Settings>) => void
  onClose: () => void
  crossOriginIsolated: boolean
}

function Segmented<T extends string | number>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="segmented" role="radiogroup">
      {options.map(([v, label]) => (
        <button key={String(v)} role="radio" aria-checked={v === value} className={v === value ? 'active' : ''} onClick={() => onChange(v)}>
          {label}
        </button>
      ))}
    </div>
  )
}

function EngineStatusRow({ status, strength }: { status: EngineStatus | null; strength: Settings['engine'] }) {
  const state = status?.state ?? 'loading'
  const name = status?.name?.replace(/\s*(WASM|Lite|Multithreaded).*$/i, '') || 'Stockfish 19'
  const pct = Math.round((status?.progress ?? 0) * 100)
  let detail: string
  if (state === 'error') detail = status?.error ? `Failed to load: ${status.error}` : 'Failed to load'
  else if (state === 'loading') detail = strength === 'full' ? `Downloading the full network… ${pct}%` : 'Loading…'
  else detail = `${status?.multiThreaded ? `${status.threads} threads` : 'Single thread'} · ${strength === 'full' ? 'full network' : 'lite network'}`

  return (
    <div className={`engine-status ${state}`}>
      <span className="engine-status-dot" aria-hidden />
      <div className="engine-status-text">
        <span className="engine-status-name">{name}</span>
        <span className="engine-status-detail">{detail}</span>
        {state === 'loading' && strength === 'full' && (
          <div className="progress">
            <div className="progress-fill" style={{ width: `${Math.max(pct, 3)}%` }} />
          </div>
        )}
      </div>
    </div>
  )
}

export function SettingsPanel({ settings, status, onChange, onClose, crossOriginIsolated }: Props) {
  return (
    <div className="settings-popover" role="dialog" aria-label="Settings">
      <header className="settings-header">
        <h3>Settings</h3>
        <button className="icon-btn" onClick={onClose} aria-label="Close settings">
          ✕
        </button>
      </header>

      <div className="setting">
        <div className="setting-label">Appearance</div>
        <Segmented
          value={settings.appearance}
          options={[
            ['dark', 'Dark'],
            ['light', 'Light'],
            ['system', 'System'],
          ]}
          onChange={(appearance) => onChange({ appearance })}
        />
      </div>

      <div className="setting">
        <div className="setting-label">
          Engine
          <span className="hint">
            {!FULL_ENGINE_AVAILABLE
              ? 'Lite network: 2 MB, starts instantly, far stronger than any human.'
              : settings.engine === 'full'
                ? 'Full network: strongest, a one-time ~100 MB download'
                : 'Small network: 2 MB, starts instantly. Full is stronger.'}
          </span>
        </div>
        {FULL_ENGINE_AVAILABLE && (
          <Segmented
            value={settings.engine}
            options={[
              ['lite', 'Lite'],
              ['full', 'Full'],
            ]}
            onChange={(engine) => onChange({ engine })}
          />
        )}
        <EngineStatusRow status={status} strength={settings.engine} />
      </div>
      {!crossOriginIsolated && (
        <p className="hint warn">Running single-threaded: the page isn't cross-origin isolated, so multi-threading is unavailable.</p>
      )}

      <div className="setting">
        <div className="setting-label">Engine lines</div>
        <Segmented value={settings.lines} options={[1, 2, 3, 4, 5].map((n) => [n, String(n)] as [number, string])} onChange={(lines) => onChange({ lines })} />
      </div>

      <div className="setting">
        <div className="setting-label">
          Live depth
          <span className="hint">The engine stops here; higher is slower but more accurate.</span>
        </div>
        <Segmented
          value={settings.liveDepth}
          options={[
            [20, '20'],
            [26, '26'],
            [30, '30'],
            [40, '40'],
            [99, '∞'],
          ]}
          onChange={(liveDepth) => onChange({ liveDepth })}
        />
      </div>

      <div className="setting">
        <div className="setting-label">
          Review depth
          <span className="hint">Depth per move when reviewing a whole game.</span>
        </div>
        <Segmented
          value={settings.reviewDepth}
          options={[
            [12, 'Fast · 12'],
            [16, 'Standard · 16'],
            [20, 'Deep · 20'],
          ]}
          onChange={(reviewDepth) => onChange({ reviewDepth })}
        />
      </div>

      <div className="setting">
        <div className="setting-label">Board</div>
        <div className="theme-swatches">
          {(Object.keys(BOARD_THEMES) as BoardTheme[]).map((t) => (
            <button
              key={t}
              className={`swatch ${settings.boardTheme === t ? 'active' : ''}`}
              style={{ background: `linear-gradient(135deg, ${BOARD_THEMES[t].light} 50%, ${BOARD_THEMES[t].dark} 50%)` }}
              onClick={() => onChange({ boardTheme: t })}
              aria-label={`${BOARD_THEMES[t].label} board`}
              title={BOARD_THEMES[t].label}
            />
          ))}
        </div>
      </div>

      <div className="setting">
        <div className="setting-label">Move sounds</div>
        <Segmented
          value={settings.soundVolume}
          options={[
            [0, 'Off'],
            [0.35, 'Soft'],
            [0.7, 'Normal'],
            [1, 'Loud'],
          ]}
          onChange={(soundVolume) => {
            onChange({ soundVolume })
            playSound('move', soundVolume)
          }}
        />
      </div>

      <label className="setting check">
        <input type="checkbox" checked={settings.showArrows} onChange={(e) => onChange({ showArrows: e.target.checked })} />
        Show best-move arrows
      </label>
      <label className="setting check">
        <input type="checkbox" checked={settings.coordinates} onChange={(e) => onChange({ coordinates: e.target.checked })} />
        Show coordinates
      </label>
      <label className="setting check">
        <input type="checkbox" checked={settings.autoReview} onChange={(e) => onChange({ autoReview: e.target.checked })} />
        Review games automatically when loaded
      </label>
    </div>
  )
}
