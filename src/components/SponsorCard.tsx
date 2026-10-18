import { useState } from 'react'
import { AMAZON_TAGS, pickSponsor, regionFromTimeZone, type Sponsor, type SponsorIcon } from '../lib/sponsors'

const ICONS: Record<SponsorIcon | 'star', React.ReactNode> = {
  board: <path d="M4 4h16v16H4zm2 2v4h4V6zm4 4v4h4v-4zm4-4v4h4V6zM6 14v4h4v-4zm8 0v4h4v-4z" />,
  clock: <path d="M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16m0 2a6 6 0 1 1 0 12 6 6 0 0 1 0-12m-1 2v5l4 2.4.9-1.5-2.9-1.7V8zM9 1h6v2H9z" />,
  book: <path d="M6 3h11a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2m0 2v14h11V5h-1v6l-2.5-1.5L11 11V5z" />,
  star: <path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z" />,
}

/** One sponsored card per visit: an Amazon search for India or everywhere else, or Rookahead itself. */
export function SponsorCard() {
  const [sponsor] = useState<Sponsor>(() => pickSponsor(regionFromTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone), AMAZON_TAGS, Math.random()))
  const amazon = sponsor.kind === 'amazon'
  return (
    <a className="sponsor-card" href={sponsor.url} target="_blank" rel={amazon ? 'sponsored noopener noreferrer' : 'noopener'}>
      <span className="sponsor-icon" aria-hidden>
        <svg viewBox="0 0 24 24">{ICONS[amazon ? sponsor.icon : 'star']}</svg>
      </span>
      <span className="sponsor-text">
        <span className="sponsor-title">{sponsor.title}</span>
        <span className="sponsor-blurb">{sponsor.blurb}</span>
        <span className="sponsor-label">{amazon ? `Sponsored · Amazon.${sponsor.region}` : 'Rookahead'}</span>
      </span>
      <span className="sponsor-go" aria-hidden>
        ↗
      </span>
    </a>
  )
}
