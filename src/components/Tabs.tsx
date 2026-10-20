import type { CSSProperties, ReactNode } from 'react'
import { Link } from './Link'

export type Tone = 'sky' | 'amber' | 'violet' | 'rose' | 'green'

export interface TabItem<T extends string> {
  id: T
  label: string
  /** A 24×24 stroke icon drawn above the label. */
  icon?: ReactNode
  /** The tab's own colour: its icon, and its underline when active (sky by default). */
  tone?: Tone
  /** A count on the icon's corner (hidden at 0). */
  badge?: number
  /** A quiet total after the label. */
  count?: number
  /** A tab with its own address is a link (`onSelect` still hears the click). */
  to?: string
}

/** The app's one tab bar: equal columns across the full width, icon over label, a coloured underline on the active tab. */
export function Tabs<T extends string>({ items, value, onSelect, label }: { items: TabItem<T>[]; value: T; onSelect?: (id: T) => void; label?: string }) {
  const at = items.findIndex((item) => item.id === value)
  return (
    <nav className="tabs-bar" role="tablist" aria-label={label} style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
      {at >= 0 && (
        <span
          className="tabs-ink"
          aria-hidden
          style={{ '--i': at, '--n': items.length, '--ink': `var(--tone-${items[at].tone ?? 'sky'})` } as CSSProperties}
        />
      )}
      {items.map((item) => {
        const active = item.id === value
        const content = (
          <>
            {item.icon && (
              <span className="tabs-icon">
                <svg viewBox="0 0 24 24" aria-hidden>
                  {item.icon}
                </svg>
                {item.badge ? <span className="tabs-badge">{item.badge > 99 ? '99+' : item.badge}</span> : null}
              </span>
            )}
            <span className="tabs-label">
              {item.label}
              {item.count != null && <span className="tabs-count">{item.count}</span>}
            </span>
          </>
        )
        const props = {
          role: 'tab',
          'aria-selected': active,
          className: `tabs-tab tone-${item.tone ?? 'sky'} ${active ? 'active' : ''}`,
        }
        return item.to ? (
          <Link key={item.id} to={item.to} {...props} onClick={() => onSelect?.(item.id)}>
            {content}
          </Link>
        ) : (
          <button key={item.id} type="button" {...props} onClick={() => onSelect?.(item.id)}>
            {content}
          </button>
        )
      })}
    </nav>
  )
}

/** Icons for the tab bars (strokes, 24×24). */
export const TAB_ICONS = {
  rated: (
    <>
      <path d="M4 17l5-5 4 4 7-7" />
      <path d="M15 9h5v5" />
    </>
  ),
  sprint: <path d="M13 3L5 14h6l-1 7 8-11h-6l1-7z" />,
  daily: (
    <>
      <rect x="4" y="5" width="16" height="15" rx="3" />
      <path d="M8 3v4M16 3v4M4 10h16" />
    </>
  ),
  mistakes: (
    <>
      <path d="M9 14L4 9l5-5" />
      <path d="M4 9h10a6 6 0 0 1 0 12h-3" />
    </>
  ),
  // The same marks as Game review and Analyze in the sidebar.
  review: <path d="M4 20V10M10 20V4M16 20v-8M22 20H2" />,
  analysis: (
    <>
      <path d="M10.5 17.5a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20.5 20.5 15.6 15.6" />
      <path className="icon-fill" d="M7 7h3.5v3.5H7zM10.5 10.5H14V14h-3.5z" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v6M12 7.5v.01" />
    </>
  ),
}
