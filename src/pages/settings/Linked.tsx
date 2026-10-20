import { useState } from 'react'
import { cachedFor, importGames, loadImportCache, SOURCE_LABEL, type ImportSite } from '../../lib/myGames'
import type { Settings } from '../../lib/settings'
import { Section } from './shared'

const FIELD: Record<ImportSite, 'chesscomUser' | 'lichessUser'> = { chesscom: 'chesscomUser', lichess: 'lichessUser' }

/** One site: who you are there and how many of your games came in, or a box to connect. */
function SiteRow({ site, user, onSave }: { site: ImportSite; user: string; onSave: (name: string) => void }) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const count = user ? cachedFor(loadImportCache(), site, user)?.games.length : undefined

  const connect = async () => {
    const next = name.trim()
    if (!next) return
    setBusy(true)
    setError(null)
    try {
      // Fetch first, so a misspelt name is caught here rather than on My games.
      await importGames(site, next)
      onSave(next)
      setEditing(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : `Could not reach ${SOURCE_LABEL[site]}.`)
    } finally {
      setBusy(false)
    }
  }

  const form = (
    <form
      className="linked-form"
      onSubmit={(e) => {
        e.preventDefault()
        void connect()
      }}
    >
      <input
        className="input"
        aria-label={`${SOURCE_LABEL[site]} username`}
        placeholder={`Your ${SOURCE_LABEL[site]} username`}
        value={name}
        onChange={(e) => setName(e.target.value)}
        spellCheck={false}
        autoCapitalize="off"
        autoComplete="off"
        autoFocus={editing}
      />
      {editing && (
        <button type="button" className="btn ghost" onClick={() => setEditing(false)}>
          Cancel
        </button>
      )}
      <button className="btn primary" disabled={busy || !name.trim()}>
        {busy ? 'Checking…' : 'Connect'}
      </button>
    </form>
  )

  return (
    <div className={`linked-site ${site}`}>
      <div className="linked-head">
        <span className="linked-dot" aria-hidden />
        <div className="linked-text">
          <strong>{SOURCE_LABEL[site]}</strong>
          {user && !editing ? (
            <span>
              <b>{user}</b>
              {count !== undefined && ` · ${count} recent ${count === 1 ? 'game' : 'games'}`}
            </span>
          ) : (
            <span>Not connected</span>
          )}
        </div>
        {user && !editing && (
          <div className="linked-actions">
            <button
              className="btn ghost small"
              onClick={() => {
                setName(user)
                setEditing(true)
              }}
            >
              Change
            </button>
            <button className="btn ghost small" onClick={() => onSave('')}>
              Remove
            </button>
          </div>
        )}
      </div>
      {(!user || editing) && form}
      {error && <p className="form-error">{error}</p>}
    </div>
  )
}

/** Your Chess.com and Lichess usernames, whose games come into My games. */
export function LinkedSection({ settings, onChange }: { settings: Settings; onChange: (patch: Partial<Settings>) => void }) {
  return (
    <Section title="Linked accounts" lead="Your public games from these sites show up in My games, ready to review. Rookahead only reads them: no password needed.">
      <div className="linked-sites">
        {(['chesscom', 'lichess'] as const).map((site) => (
          <SiteRow key={site} site={site} user={settings[FIELD[site]]} onSave={(name) => onChange({ [FIELD[site]]: name })} />
        ))}
      </div>
    </Section>
  )
}
