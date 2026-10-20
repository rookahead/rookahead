import type { ReactNode } from 'react'
import { goBack } from '../lib/router'
import { Link } from './Link'
import { NavIcon } from './NavIcons'
import { RookLogo } from './RookLogo'
import { Wordmark } from './Wordmark'

interface Props {
  /** Shown on desktop; phones show the logo instead (or `phoneTitle` beside a Back button). */
  title?: string
  /** Page actions, at the right. */
  children?: ReactNode
  /** Only phones get this bar (desktop pages that have their own heading). */
  phoneOnly?: boolean
  /** Phones: a full-screen page gets a Back button (to the page you came from, else this path) instead of the logo. */
  back?: string
  /** Phones: the page's name beside the Back button, with a line under it. */
  phoneTitle?: ReactNode
  phoneSub?: ReactNode
}

/** The bar at the top of a page: its title and actions; on phones the logo (home), or Back on a full-screen page. */
export function PageHeader({ title, children, phoneOnly, back, phoneTitle, phoneSub }: Props) {
  return (
    <header className={`page-header ${phoneOnly ? 'phone-only' : ''} ${back ? 'has-back' : ''}`}>
      {back ? (
        <>
          <button className="icon-btn page-header-back" onClick={() => goBack(back)} aria-label="Back">
            <NavIcon name="back" />
          </button>
          <span className="page-header-phone-title">
            <strong>{phoneTitle ?? title}</strong>
            {phoneSub && <span>{phoneSub}</span>}
          </span>
        </>
      ) : (
        <Link to="/" className="page-header-home" aria-label="Rookahead home">
          <RookLogo />
          <Wordmark className="page-header-wordmark" />
        </Link>
      )}
      {title && <h1 className="page-header-title">{title}</h1>}
      <div className="page-header-actions">{children}</div>
    </header>
  )
}
