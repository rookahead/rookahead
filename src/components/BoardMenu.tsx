import { useEffect, useRef, useState } from 'react'

interface Props {
  onFlip: () => void
  onNewBoard: () => void
  onLoadGame: () => void
  onSettings: () => void
  /** Which way the list opens: up from the move controls (the default), or down from a page header. */
  placement?: 'up' | 'down'
  /** Leave Flip out: it has a button of its own beside the menu. */
  noFlip?: boolean
}

const ITEMS = [
  {
    id: 'flip',
    label: 'Flip board',
    key: 'F',
    icon: <path d="M8 20V4M4 8l4-4 4 4M16 4v16M12 16l4 4 4-4" />,
  },
  {
    id: 'new',
    label: 'New board',
    icon: (
      <>
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <path d="M3 9h18M3 15h18M9 3v18M15 3v18" />
      </>
    ),
  },
  {
    id: 'load',
    label: 'Load game',
    icon: <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />,
  },
  {
    id: 'settings',
    label: 'Analysis settings',
    icon: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M12 2v3M12 19v3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1 7 17M17 7l2.1-2.1" />
      </>
    ),
  },
] as const

/** The last move control: a menu with the board's other actions (flip, a new board, load a game). */
export function BoardMenu({ onFlip, onNewBoard, onLoadGame, onSettings, placement = 'up', noFlip = false }: Props) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => !root.current?.contains(e.target as Node) && setOpen(false)
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('pointerdown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  const actions = { flip: onFlip, new: onNewBoard, load: onLoadGame, settings: onSettings }
  return (
    <div className={`board-menu ${placement}`} ref={root}>
      <button className={`ctrl more ${open ? 'active' : ''}`} onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open} aria-label="More" title="Flip, new board, load game, settings">
        <svg viewBox="0 0 24 24" aria-hidden>
          <path d="M4 6h16v2H4zm0 5h16v2H4zm0 5h16v2H4z" />
        </svg>
      </button>
      {open && (
        <div className="board-menu-list" role="menu">
          {ITEMS.filter((item) => !noFlip || item.id !== 'flip').map((item) => (
            <button
              key={item.id}
              role="menuitem"
              className="board-menu-item"
              onClick={() => {
                setOpen(false)
                actions[item.id]()
              }}
            >
              <svg viewBox="0 0 24 24" aria-hidden>
                {item.icon}
              </svg>
              {item.label}
              {'key' in item && <kbd>{item.key}</kbd>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
