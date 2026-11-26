import { useEffect, useRef, useState } from 'react'
import { navigate } from '../lib/router'
import { Face } from './DefaultFace'
import { profilePath, searchProfiles } from '../lib/publicProfile'

type Found = { username: string; avatarUrl: string | null }

/**
 * Search players, at the sidebar's foot: public Rookahead profiles whose username starts with what you type,
 * listed above the box as you type. Enter (or a click) opens one; arrows move through them; Escape clears.
 */
export function PlayerSearch() {
  const [q, setQ] = useState('')
  // null: not asked yet (or nothing typed); false: couldn't ask.
  const [found, setFound] = useState<Found[] | null | false>(null)
  const [at, setAt] = useState(0)
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)

  // Asked a moment after typing stops, and only the latest answer counts.
  useEffect(() => {
    const words = q.trim().replace(/^@/, '')
    if (!words) return setFound(null)
    let live = true
    const timer = setTimeout(() => {
      void searchProfiles(words).then((list) => {
        if (!live) return
        setFound(list ?? false)
        setAt(0)
      })
    }, 180)
    return () => {
      live = false
      clearTimeout(timer)
    }
  }, [q])

  // Closed by a click anywhere else.
  useEffect(() => {
    if (!open) return
    const away = (e: PointerEvent) => !box.current?.contains(e.target as Node) && setOpen(false)
    document.addEventListener('pointerdown', away)
    return () => document.removeEventListener('pointerdown', away)
  }, [open])

  const go = (name: string) => {
    setQ('')
    setFound(null)
    setOpen(false)
    navigate(profilePath(name))
  }

  const list = found || []
  const showing = open && q.trim() !== '' && found !== null
  return (
    <div className="player-search" ref={box}>
      {showing && (
        <div className="player-search-list" role="listbox" aria-label="Players">
          {found === false && <p className="player-search-note">Couldn’t search. Check your connection.</p>}
          {found !== false && list.length === 0 && <p className="player-search-note">No public profile starts with “{q.trim().replace(/^@/, '')}”.</p>}
          {list.map((p, i) => (
            <button
              key={p.username}
              role="option"
              aria-selected={i === at}
              className={`player-search-item ${i === at ? 'active' : ''}`}
              onPointerDown={(e) => e.preventDefault()}
              onClick={() => go(p.username)}
              onMouseEnter={() => setAt(i)}
            >
              <span className="player-search-avatar" aria-hidden>
                <Face url={p.avatarUrl} name={p.username} />
              </span>
              <span className="player-search-name">{p.username}</span>
            </button>
          ))}
        </div>
      )}
      <label className="player-search-box">
        <svg viewBox="0 0 24 24" aria-hidden>
          <path d="M10.5 17.5a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20.5 20.5 15.6 15.6" />
        </svg>
        <input
          type="search"
          value={q}
          placeholder="Search"
          aria-label="Search players"
          autoComplete="off"
          spellCheck={false}
          maxLength={21}
          onChange={(e) => {
            setQ(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown' && list.length) {
              e.preventDefault()
              setAt((at + 1) % list.length)
            } else if (e.key === 'ArrowUp' && list.length) {
              e.preventDefault()
              setAt((at - 1 + list.length) % list.length)
            } else if (e.key === 'Enter' && list[at]) {
              go(list[at].username)
            } else if (e.key === 'Escape') {
              setQ('')
              setOpen(false)
              e.currentTarget.blur()
            }
          }}
        />
      </label>
    </div>
  )
}
