interface Props {
  /** The Analysis tab: opens a fresh board, ready for a new analysis. */
  onAnalysis: () => void
  onNewBoard: () => void
  onLoad: () => void
  settingsOpen: boolean
  onToggleSettings: () => void
  /** The settings popover, rendered under its button. */
  settings: React.ReactNode
}

const stroke = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const

/** Brand, the app's sections (just Analysis for now), and the board actions. */
export function TopNav({ onAnalysis, onNewBoard, onLoad, settingsOpen, onToggleSettings, settings }: Props) {
  return (
    <header className="topnav">
      <div className="topnav-brand">
        <div className="topnav-logo" aria-hidden>
          {/* A rook with an arrow cut through it, breaking out to the right: looking ahead. */}
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M5 3H8V5H10.5V3H13.5V5H16V3H19V7.72L15 6.3V7.3H10.5A0.7 0.7 0 0 0 10.5 8.7H15V9.7L19 8.28V11H15.5C15.5 15 16.5 17 19.5 18V21H4.5V18C7.5 17 8.5 15 8.5 11H5Z" />
          </svg>
        </div>
        <span className="topnav-wordmark">Rookahead</span>
      </div>

      <nav className="topnav-tabs" aria-label="Main">
        <button className="topnav-tab active" aria-current="page" onClick={onAnalysis} title="New analysis">
          Analysis
        </button>
      </nav>

      <div className="topnav-actions">
        <button className="btn ghost small topnav-action" onClick={onNewBoard} title="New board">
          <svg viewBox="0 0 24 24" aria-hidden {...stroke}>
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <path d="M3 9h18M3 15h18M9 3v18M15 3v18" />
          </svg>
          <span className="topnav-label">New board</span>
        </button>
        <button className="btn primary small topnav-action" onClick={onLoad} title="Load game">
          <svg viewBox="0 0 24 24" aria-hidden {...stroke}>
            <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />
          </svg>
          <span className="topnav-label">Load game</span>
        </button>
        <div className="settings-anchor">
          <button className={`icon-btn ${settingsOpen ? 'active' : ''}`} onClick={onToggleSettings} aria-label="Settings" title="Settings">
            <svg viewBox="0 0 24 24" aria-hidden {...stroke}>
              {/* Three sliders, each with its knob at a different setting. */}
              <path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h7M15 18h5" />
              <circle cx="15" cy="6" r="2" />
              <circle cx="9" cy="12" r="2" />
              <circle cx="13" cy="18" r="2" />
            </svg>
          </button>
          {settings}
        </div>
      </div>
    </header>
  )
}
