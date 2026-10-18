import type { ReactNode } from 'react'
import { Link } from './Link'
import { RookLogo } from './RookLogo'
import { Wordmark } from './Wordmark'

interface Props {
  /** Shown on desktop; phones show the logo instead. */
  title?: string
  /** Page actions, at the right. */
  children?: ReactNode
  /** The phone's avatar button (desktop has the sidebar's user card). */
  avatar?: ReactNode
  /** Only phones get this bar (desktop pages that have their own heading). */
  phoneOnly?: boolean
}

/** The bar at the top of a page: its title and actions; on phones also the logo (home) and the avatar. */
export function PageHeader({ title, children, avatar, phoneOnly }: Props) {
  return (
    <header className={`page-header ${phoneOnly ? 'phone-only' : ''}`}>
      <Link to="/" className="page-header-home" aria-label="Rookahead home">
        <RookLogo />
        <Wordmark className="page-header-wordmark" />
      </Link>
      {title && <h1 className="page-header-title">{title}</h1>}
      <div className="page-header-actions">
        {children}
        {avatar}
      </div>
    </header>
  )
}
