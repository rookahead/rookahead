import { useState, type FormEvent } from 'react'
import { importGames, SOURCE_LABEL, type ImportSite } from '../lib/myGames'

interface Props {
  /** Saves the username once its games have loaded. */
  onSaved: (site: ImportSite, username: string) => void
  /** An earlier failure to show (a saved username that no longer loads). */
  error?: string
}

/** "Where do you play?" + username: fetches your games, then remembers the name. */
export function UsernameForm({ onSaved, error: initialError }: Props) {
  const [site, setSite] = useState<ImportSite>('chesscom')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | undefined>(initialError)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const user = name.trim()
    if (!user) return
    setBusy(true)
    setError(undefined)
    try {
      await importGames(site, user)
      onSaved(site, user)
    } catch (err) {
      setError(err instanceof Error ? err.message : `Could not reach ${SOURCE_LABEL[site]}.`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="username-form">
      <div className="site-switch" role="radiogroup" aria-label="Where you play">
        {(['chesscom', 'lichess'] as const).map((s) => (
          <button key={s} type="button" role="radio" aria-checked={site === s} className={site === s ? 'on' : ''} onClick={() => setSite(s)}>
            {SOURCE_LABEL[s]}
          </button>
        ))}
      </div>
      <form className="username-row" onSubmit={submit}>
        <input
          className="input"
          aria-label={`${SOURCE_LABEL[site]} username`}
          placeholder="Your username"
          value={name}
          onChange={(e) => setName(e.target.value)}
          spellCheck={false}
          autoCapitalize="off"
          autoComplete="off"
        />
        <button className="btn accent-btn" disabled={busy || !name.trim()}>
          {busy ? 'Loading…' : 'Get my games'}
        </button>
      </form>
      {error && <p className="username-error">{error}</p>}
    </div>
  )
}
