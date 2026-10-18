interface Props {
  rail: boolean
  settingsOpen: boolean
  onSettings: () => void
}

const Gear = () => (
  <svg viewBox="0 0 24 24" aria-hidden>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
)

/** Who you are and the way into settings, at the foot of the sidebar. Guest until accounts arrive. */
export function UserCard({ rail, settingsOpen, onSettings }: Props) {
  const settings = (
    <button className={`icon-btn user-card-gear ${settingsOpen ? 'active' : ''}`} onClick={onSettings} aria-label="Settings" title="Settings">
      <Gear />
    </button>
  )
  if (rail) {
    return (
      <div className="user-card rail">
        <span className="user-avatar guest" aria-hidden>
          ?
        </span>
        {settings}
      </div>
    )
  }
  return (
    <div className="user-card">
      <span className="user-avatar guest" aria-hidden>
        ?
      </span>
      <span className="user-card-text">
        <strong>Guest</strong>
        <span>Sign-up coming soon</span>
      </span>
      {settings}
    </div>
  )
}
