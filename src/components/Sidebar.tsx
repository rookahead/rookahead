import { useEffect, useId, useRef, useState, type FocusEvent, type ReactNode } from 'react'
import { NAV_ITEMS, type NavItem } from '../lib/nav'
import type { Route } from '../lib/router'
import { IconTile } from './IconTile'
import { Link } from './Link'
import { useReviewBadge } from '../lib/reviewBadge'
import { RookLogo } from './RookLogo'
import { StackedWordmark } from './Wordmark'
import { PlayerSearch } from './PlayerSearch'
import { DISCORD_URL } from '../lib/links'

// The card row's icons (Phosphor, MIT): three people, a newspaper, a panel.
const COMMUNITY =
  'M64.12,147.8a4,4,0,0,1-4,4.2H16a8,8,0,0,1-7.8-6.17,8.35,8.35,0,0,1,1.62-6.93A67.79,67.79,0,0,1,37,117.51a40,40,0,1,1,66.46-35.8,3.94,3.94,0,0,1-2.27,4.18A64.08,64.08,0,0,0,64,144C64,145.28,64,146.54,64.12,147.8Zm182-8.91A67.76,67.76,0,0,0,219,117.51a40,40,0,1,0-66.46-35.8,3.94,3.94,0,0,0,2.27,4.18A64.08,64.08,0,0,1,192,144c0,1.28,0,2.54-.12,3.8a4,4,0,0,0,4,4.2H240a8,8,0,0,0,7.8-6.17A8.33,8.33,0,0,0,246.17,138.89Zm-89,43.18a48,48,0,1,0-58.37,0A72.13,72.13,0,0,0,65.07,212,8,8,0,0,0,72,224H184a8,8,0,0,0,6.93-12A72.15,72.15,0,0,0,157.19,182.07Z'
const BLOG =
  'M216,48H56A16,16,0,0,0,40,64V184a8,8,0,0,1-16,0V88A8,8,0,0,0,8,88v96.11A24,24,0,0,0,32,208H208a24,24,0,0,0,24-24V64A16,16,0,0,0,216,48ZM176,152H96a8,8,0,0,1,0-16h80a8,8,0,0,1,0,16Zm0-32H96a8,8,0,0,1,0-16h80a8,8,0,0,1,0,16Z'
const PANEL = 'M216,40H40A16,16,0,0,0,24,56V200a16,16,0,0,0,16,16H216a16,16,0,0,0,16-16V56A16,16,0,0,0,216,40Zm0,160H88V56H216V200Z'

const HEART = 'M12 20s-7-4.4-8.9-8.8C1.7 8 3.6 4.5 7 4.5c2 0 3.5 1.1 5 2.8 1.5-1.7 3-2.8 5-2.8 3.4 0 5.3 3.5 3.9 6.7C19 15.6 12 20 12 20z'

/** The sidebar's buttons in the user card's row (UserCard, tools): the Discord, the blog, folding the sidebar. */
export function SidebarTools({ rail, onToggleRail }: { rail: boolean; onToggleRail: () => void }) {
  return (
    <>
      <a className="icon-btn solid" href={DISCORD_URL} target="_blank" rel="noopener noreferrer" aria-label="Community (Discord)" title="Community">
        <svg viewBox="0 0 256 256" aria-hidden>
          <path d={COMMUNITY} />
        </svg>
      </a>
      <a className="icon-btn solid" href="/blog" aria-label="Blog" title="Blog">
        <svg viewBox="0 0 256 256" aria-hidden>
          <path d={BLOG} fillRule="evenodd" />
        </svg>
      </a>
      <button className="icon-btn solid sidebar-toggle" onClick={onToggleRail} aria-label={rail ? 'Expand sidebar' : 'Collapse sidebar'} title={rail ? 'Expand' : 'Collapse'}>
        <svg viewBox="0 0 256 256" aria-hidden>
          <path d={PANEL} fillRule="evenodd" />
        </svg>
      </button>
    </>
  )
}

interface Props {
  route: Route
  /** Icons only; the full sidebar is the default. */
  rail: boolean
  /** The user card. */
  footer: ReactNode
  /** Game review was clicked: true when it was handled here (Load a game opened) instead of going there. */
  onGameReview?: () => boolean
}

/** A section's icon: solid, the same on its own page and off it. */
export function NavItemIcon({ item }: { item: Pick<NavItem, 'icon' | 'grid' | 'cuts'> }) {
  const g = item.grid ?? 24
  // (useId's colons don't belong in a url(#…).)
  const mask = `cut-${useId().replace(/[^\w-]/g, '')}`
  return (
    <svg viewBox={`0 0 ${g} ${g}`} aria-hidden>
      {item.cuts && (
        <mask id={mask} maskUnits="userSpaceOnUse" x={-2} y={-2} width={g + 4} height={g + 4}>
          <rect x={-2} y={-2} width={g + 4} height={g + 4} fill="#fff" stroke="none" />
          {item.cuts.map((c) =>
            c.width ? <path key={c.d} d={c.d} fill="none" stroke="#000" strokeWidth={c.width} strokeLinecap="round" /> : <path key={c.d} d={c.d} fill="#000" stroke="none" />,
          )}
        </mask>
      )}
      <path className="icon-solid" fillRule="evenodd" d={item.icon} mask={item.cuts ? `url(#${mask})` : undefined} />
    </svg>
  )
}

/**
 * Desktop navigation: a floating panel, full window height, with the collapse button and the user card at
 * the bottom. Collapsing folds it to a rail of icons at once: the icons, logo and avatar keep their places
 * while the words fade. The logo is the way Home in both.
 */
export function Sidebar({ route, rail, footer, onGameReview }: Props) {
  const toReview = useReviewBadge()
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
        <Link to="/" className="sidebar-brand" aria-label="Rookahead home" title="Home">
          <RookLogo />
          <StackedWordmark className="sidebar-wordmark" />
        </Link>
      </div>
      <nav className="sidebar-nav" aria-label="Main">
        {NAV_ITEMS.map((item) => {
          const icon = <NavItemIcon item={item} />
          const here = route === item.id || Boolean(item.also?.includes(route))
          return item.path ? (
            <Link
              key={item.id}
              to={item.path}
              className={`sidebar-item ${here ? 'active' : ''} ${item.id === 'analysis' ? 'review-item' : ''}`}
              aria-current={here ? 'page' : undefined}
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
              {/* Game review: this week's games waiting for a review. */}
              {item.id === 'analysis' && toReview > 0 && (
                <span className="side-badge" aria-label={`${toReview} ${toReview === 1 ? 'game' : 'games'} to review`}>
                  {toReview > 99 ? '99+' : toReview}
                </span>
              )}
            </Link>
          ) : item.menu ? (
            // No page of its own (Tools): a click opens its menu at once, as pointing at it does after a moment.
            <button
              key={item.id}
              className={`sidebar-item ${here ? 'active' : ''}`}
              aria-haspopup="menu"
              aria-expanded={menu?.item.id === item.id}
              onMouseEnter={(e) => openSoon(item, e.currentTarget)}
              onMouseLeave={closeSoon}
              onClick={(e) => (menu?.item.id === item.id ? setMenu(null) : place(item, e.currentTarget))}
              onBlur={(e) => !e.relatedTarget?.closest?.('.side-menu') && closeSoon()}
            >
              {icon}
              <span className="sidebar-label">{item.label}</span>
            </button>
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
          {menu.item.menu.map((m) => {
            const words = (
              <>
                {m.solid ? (
                  <span className={`icon-tile ${m.tone}`} aria-hidden>
                    <NavItemIcon item={m.solid} />
                  </span>
                ) : (
                  <IconTile tone={m.tone} />
                )}
                <span className="side-menu-words">
                  <strong>{m.label}</strong>
                  <small>{m.text}</small>
                </span>
              </>
            )
            const leave = (e: FocusEvent<HTMLElement>) => !e.currentTarget.parentElement?.contains(e.relatedTarget) && setMenu(null)
            return m.path ? (
              <Link key={m.label} to={m.path} role="menuitem" className="side-menu-item" onClick={() => setMenu(null)} onBlur={leave}>
                {words}
              </Link>
            ) : (
              // A dialog over this page rather than a page: App.tsx opens it.
              <button
                key={m.label}
                role="menuitem"
                className="side-menu-item"
                onClick={() => {
                  setMenu(null)
                  if (m.event) window.dispatchEvent(new Event(m.event))
                }}
                onBlur={leave}
              >
                {words}
              </button>
            )
          })}
        </div>
      )}
      <div className="sidebar-foot">
        {/* Support: the donate page, outside the app, so a plain link. In the heart's pink. */}
        <a className="sidebar-support" href="/donate" title={rail ? 'Support Rookahead' : undefined}>
          <svg viewBox="0 0 24 24" aria-hidden>
            <path d={HEART} />
          </svg>
          <span className="sidebar-label">Support</span>
        </a>
        <PlayerSearch />
        {footer}
      </div>
    </aside>
  )
}
