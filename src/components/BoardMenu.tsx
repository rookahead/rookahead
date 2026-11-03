import { useEffect, useRef, useState } from 'react'
import { FlipIcon, LoadIcon, NewBoardIcon } from './NavIcons'
import { Gear } from './UserCard'

interface Props {
  onFlip: () => void
  onNewBoard: () => void
  onLoadGame: () => void
  onSettings: () => void
  /** Which way the list opens: up from the move controls (the default), or down from a page header. */
  placement?: 'up' | 'down'
}

const ITEMS = [
  { id: 'flip', label: 'Flip board', key: 'F', icon: <FlipIcon /> },
  { id: 'new', label: 'New board', icon: <NewBoardIcon /> },
  { id: 'load', label: 'Load game', icon: <LoadIcon /> },
  { id: 'settings', label: 'Settings', icon: <Gear /> },
] as const

/** The last move control: a menu with the board's other actions (flip, a new board, load a game). */
export function BoardMenu({ onFlip, onNewBoard, onLoadGame, onSettings, placement = 'up' }: Props) {
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
          <path d="M5 7h14M5 12h14M5 17h14" />
        </svg>
      </button>
      {open && (
        <div className="board-menu-list" role="menu">
          {ITEMS.map((item) => (
            <button
              key={item.id}
              role="menuitem"
              className="board-menu-item"
              onClick={() => {
                setOpen(false)
                actions[item.id]()
              }}
            >
              {item.icon}
              {item.label}
              {'key' in item && <kbd>{item.key}</kbd>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
