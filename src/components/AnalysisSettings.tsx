import { useState, type ReactNode } from 'react'
import { autoThreads, FULL_ENGINE_AVAILABLE, type EngineStatus } from '../engine/Engine'
import type { Settings } from '../lib/settings'
import { BoardOptions } from './BoardOptions'
import { OptionRow, Segmented, SwitchRow } from './controls'
import { SettingsDialog } from './SettingsDialog'
import { Tabs } from './Tabs'

export type AnalysisSettingsTab = 'engine' | 'display' | 'board'

/** Mounted only while open, so every opening starts fresh. */
interface Props {
  settings: Settings
  status: EngineStatus | null
  onChange: (patch: Partial<Settings>) => void
  onClose: () => void
  initialTab?: AnalysisSettingsTab
}

const TABS: { id: AnalysisSettingsTab; label: string; icon: ReactNode }[] = [
  { id: 'engine', label: 'Engine', icon: <path d="M9 3v3M15 3v3M9 18v3M15 18v3M3 9h3M3 15h3M18 9h3M18 15h3M6 6h12v12H6zM10 10h4v4h-4z" /> },
  { id: 'display', label: 'Display', icon: <path d="M3 12s3.5-7 9-7 9 7 9 7-3.5 7-9 7-9-7-9-7zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" /> },
  { id: 'board', label: 'Board', icon: <path d="M4 4h16v16H4zM4 12h16M12 4v16M4 8h4M8 4v8M12 16h4M16 12v8" /> },
]

/** Which Stockfish is running, and how it's doing (the full network's one-time download). */
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

/** Thread counts worth offering on this device: Auto, then doubling up to all its cores. */
function threadOptions(): [number, string][] {
  const cores = navigator.hardwareConcurrency || 4
  const counts = [1, 2, 4, 8, 16, 32].filter((n) => n < cores)
  return [[0, `Auto · ${autoThreads()}`], ...counts.map((n) => [n, String(n)] as [number, string]), [cores, String(cores)]]
}

function EngineTab({ settings, status, onChange }: Omit<Props, 'onClose' | 'initialTab'>) {
  const isolated = typeof crossOriginIsolated !== 'undefined' && crossOriginIsolated
  return (
    <>
      <h3 className="options-heading">Analysis</h3>
      {FULL_ENGINE_AVAILABLE && (
        <div className="options-block">
          <OptionRow label="Engine" hint={settings.engine === 'full' ? 'Strongest. A one-time ~100 MB download.' : '2 MB, starts instantly. Full is stronger.'}>
            <Segmented
              label="Engine"
              value={settings.engine}
              options={[
                ['lite', 'Lite'],
                ['full', 'Full'],
              ]}
              onChange={(engine) => onChange({ engine })}
            />
          </OptionRow>
          <EngineStatusRow status={status} strength={settings.engine} />
        </div>
      )}
      <OptionRow label="Lines" hint="Best moves shown side by side.">
        <Segmented label="Lines" value={settings.lines} options={[1, 2, 3, 4, 5].map((n) => [n, String(n)] as [number, string])} onChange={(lines) => onChange({ lines })} />
      </OptionRow>
      <OptionRow label="Depth" hint="The engine stops here: higher is slower, more exact.">
        <Segmented
          label="Depth"
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
      </OptionRow>
      {isolated ? (
        <OptionRow label="Threads" hint="CPU cores Stockfish uses. Changing it restarts the engine.">
          <Segmented label="Threads" value={settings.threads} options={threadOptions()} onChange={(threads) => onChange({ threads })} />
        </OptionRow>
      ) : (
        <p className="hint warn">Running single-threaded: the page isn’t cross-origin isolated, so multi-threading is unavailable.</p>
      )}

      <h3 className="options-heading">Game review</h3>
      <OptionRow label="Review depth" hint="How hard Stockfish looks at each move.">
        <Segmented
          label="Review depth"
          value={settings.reviewDepth}
          options={[
            [12, 'Fast · 12'],
            [16, 'Standard · 16'],
            [20, 'Deep · 20'],
          ]}
          onChange={(reviewDepth) => onChange({ reviewDepth })}
        />
      </OptionRow>
      <SwitchRow label="Review games automatically" hint="Start as soon as a game is loaded." checked={settings.autoReview} onChange={(autoReview) => onChange({ autoReview })} />
    </>
  )
}

function DisplayTab({ settings, onChange }: Pick<Props, 'settings' | 'onChange'>) {
  return (
    <>
      <h3 className="options-heading">On the board</h3>
      <SwitchRow label="Best-move arrows" hint="The engine’s top moves, drawn as arrows." checked={settings.showArrows} onChange={(showArrows) => onChange({ showArrows })} />
      <SwitchRow label="Classification on the board" hint="A reviewed move’s badge (brilliant, blunder…) on its square." checked={settings.classOnBoard} onChange={(classOnBoard) => onChange({ classOnBoard })} />
    </>
  )
}

/** Analysis settings, Chess.com style: Engine, Display and Board tabs. Changes apply as you make them. */
export function AnalysisSettings({ settings, status, onChange, onClose, initialTab = 'engine' }: Props) {
  const [tab, setTab] = useState<AnalysisSettingsTab>(initialTab)
  return (
    <SettingsDialog title="Settings" onClose={onClose} top={<Tabs label="Settings" value={tab} onSelect={setTab} items={TABS} />}>
      {tab === 'engine' && <EngineTab settings={settings} status={status} onChange={onChange} />}
      {tab === 'display' && <DisplayTab settings={settings} onChange={onChange} />}
      {tab === 'board' && <BoardOptions settings={settings} onChange={onChange} preview />}
    </SettingsDialog>
  )
}
