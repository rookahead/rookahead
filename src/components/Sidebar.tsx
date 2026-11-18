import { useEffect, useRef, useState, type ReactNode } from 'react'
import { NAV_ITEMS, type NavItem } from '../lib/nav'
import type { Route } from '../lib/router'
import { IconTile } from './IconTile'
import { Link } from './Link'
import { RookLogo } from './RookLogo'
import { Wordmark } from './Wordmark'

interface Props {
  route: Route
  /** Icons only; the full sidebar is the default. */
  rail: boolean
  onToggleRail: () => void
  /** The user card. */
  footer: ReactNode
  /** Game review was clicked: true when it was handled here (Load a game opened) instead of going there. */
  onGameReview?: () => boolean
}

/** A section's icon: its strokes, plus any solid shapes. */
export function NavItemIcon({ item }: { item: NavItem }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path d={item.icon} />
      {item.fill && <path className="icon-fill" d={item.fill} />}
    </svg>
  )
}

/**
 * Desktop navigation: a floating panel, full window height, with the collapse button and the user card at
 * the bottom. Collapsing folds it to a rail of icons at once: the icons, logo and avatar keep their places
 * while the words fade. The logo is the way Home in both.
 */
export function Sidebar({ route, rail, onToggleRail, footer, onGameReview }: Props) {
  // An item's own pages, beside it while it's pointed at (or focused). A moment's wait before it opens (passing over
  // on the way down doesn't flash it) and before it closes (time to cross the gap into it).
  const side = useRef<HTMLElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const [menu, setMenu] = useState<{ item: NavItem; top: number; left: number } | null>(null)
  const place = (item: NavItem, el: HTMLElement) => {
    // Showing one: a close still waiting (from the item just left) doesn't take it away.
    clearTimeout(timer.current)
    const at = el.getBoundingClientRect()
    setMenu({ item, top: at.top - 8, left: (side.current?.getBoundingClientRect().right ?? at.right) + 10 })
  }
  const openSoon = (item: NavItem, el: HTMLElement) => {
    clearTimeout(timer.current)
    if (!item.menu) return setMenu(null)
    // Already open on another item: move over at once.
    if (menu) return place(item, el)
    timer.current = setTimeout(() => place(item, el), 250)
  }
  const keep = () => clearTimeout(timer.current)
  const closeSoon = () => {
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setMenu(null), 220)
  }
  useEffect(() => () => clearTimeout(timer.current), [])
  // Gone once you've gone somewhere, or press Escape.
  useEffect(() => {
    setMenu(null)
  }, [route])
  // Gone too on a click anywhere else, or when the window loses focus: it must never stay up on its own.
  useEffect(() => {
    if (!menu) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMenu(null)
    const onDown = (e: PointerEvent) => {
      const at = e.target as Element | null
      if (!at?.closest('.side-menu, .sidebar-item')) setMenu(null)
    }
    const onBlur = () => setMenu(null)
    window.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onDown)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onDown)
      window.removeEventListener('blur', onBlur)
    }
  }, [menu])

  return (
    <aside ref={side} className={`sidebar ${rail ? 'rail' : ''}`} aria-label="Sidebar">
      <div className="sidebar-head">
        <Link to="/" className="sidebar-brand" aria-label="Rookahead home" aria-current={route === 'home' ? 'page' : undefined} title="Home">
          <RookLogo />
          <Wordmark className="sidebar-wordmark" />
        </Link>
      </div>
      <nav className="sidebar-nav" aria-label="Main">
        {NAV_ITEMS.map((item) => {
          const icon = <NavItemIcon item={item} />
          return item.path ? (
            <Link
              key={item.id}
              to={item.path}
              className={`sidebar-item ${route === item.id ? 'active' : ''} ${item.featured ? 'featured' : ''}`}
              aria-current={route === item.id ? 'page' : undefined}
              title={rail && !item.menu ? item.label : undefined}
              aria-haspopup={item.menu ? 'menu' : undefined}
              aria-expanded={item.menu ? menu?.item.id === item.id : undefined}
              onMouseEnter={(e) => openSoon(item, e.currentTarget)}
              onMouseLeave={closeSoon}
              // From the keyboard only: a link keeps focus after it's clicked, and gets it again when you come back
              // to the window, which would open the menu with the pointer nowhere near it.
              onFocus={(e) => item.menu && e.currentTarget.matches(':focus-visible') && place(item, e.currentTarget)}
              onBlur={(e) => !e.relatedTarget?.closest?.('.side-menu') && closeSoon()}
              // Game review asks first: it may open Load a game here instead of going there.
              onClick={(e) => {
                // Going there: its shortcuts aren't needed.
                clearTimeout(timer.current)
                setMenu(null)
                if (item.id === 'analysis' && onGameReview && onGameReview()) e.preventDefault()
              }}
            >
              {icon}
              <span className="sidebar-label">{item.label}</span>
            </Link>
          ) : (
            <span key={item.id} className="sidebar-item soon" aria-disabled="true" title={`${item.label}: coming soon`}>
              {icon}
              <span className="sidebar-label">{item.label}</span>
              <span className="soon-tag">Soon</span>
            </span>
          )
        })}
      </nav>
      {menu?.item.menu && (
        // Fixed, so the sidebar's own clipping doesn't cut it off.
        <div className="side-menu" role="menu" aria-label={menu.item.label} style={{ top: menu.top, left: menu.left }} onMouseEnter={keep} onMouseLeave={closeSoon}>
          {menu.item.menu.map((m) => (
            <Link key={m.path} to={m.path} role="menuitem" className="side-menu-item" onClick={() => setMenu(null)} onBlur={(e) => !e.currentTarget.parentElement?.contains(e.relatedTarget) && setMenu(null)}>
              <IconTile tone={m.tone} />
              <span className="side-menu-words">
                <strong>{m.label}</strong>
                <small>{m.text}</small>
              </span>
            </Link>
          ))}
        </div>
      )}
      <div className="sidebar-foot">
        {/* The donate page is outside the app, so a plain link. */}
        <a className="sidebar-item sidebar-donate" href="/donate" title={rail ? 'Donate' : undefined}>
          <svg viewBox="0 0 24 24" aria-hidden>
            <path d="M12 20s-7-4.4-8.9-8.8C1.7 8 3.6 4.5 7 4.5c2 0 3.5 1.1 5 2.8 1.5-1.7 3-2.8 5-2.8 3.4 0 5.3 3.5 3.9 6.7C19 15.6 12 20 12 20z" />
          </svg>
          <span className="sidebar-label">Donate</span>
        </a>
        <button className="sidebar-item sidebar-toggle" onClick={onToggleRail} aria-label={rail ? 'Expand sidebar' : 'Collapse sidebar'} title={rail ? 'Expand' : undefined}>
          <span className="sidebar-label">Collapse</span>
          <svg viewBox="0 0 24 24" aria-hidden>
            <path d="m11 7-5 5 5 5M18 7l-5 5 5 5" />
          </svg>
        </button>
        {footer}
      </div>
    </aside>
  )
}
