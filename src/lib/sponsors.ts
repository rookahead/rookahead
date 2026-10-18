// The sponsored card: Amazon affiliate search links (amazon.in for India, amazon.com for
// everyone else), or a card about Rookahead itself until a region has an affiliate tag.

/** Associates tracking IDs, from affiliate-program.amazon.in / .com. Empty = not approved yet. */
export const AMAZON_TAGS: Record<AmazonRegion, string> = { in: 'rookahead-21', com: 'rookahead-20' }

export type AmazonRegion = 'in' | 'com'

export type SponsorIcon = 'board' | 'clock' | 'book'

/** Search links rather than single products: they earn commission and never go out of stock. */
export const SPONSORS: { title: string; blurb: string; query: string; icon: SponsorIcon }[] = [
  { title: 'Tournament chess set', blurb: 'Roll-up board, weighted pieces', query: 'tournament chess set roll up board', icon: 'board' },
  { title: 'Wooden chess board', blurb: 'For playing over your games at home', query: 'wooden chess board set', icon: 'board' },
  { title: 'Digital chess clock', blurb: 'Practise with increments like online', query: 'digital chess clock', icon: 'clock' },
  { title: 'Logical Chess: Move by Move', blurb: 'Irving Chernev’s classic explains every move', query: 'logical chess move by move chernev', icon: 'book' },
  { title: 'My System', blurb: 'Nimzowitsch on positional chess', query: 'my system nimzowitsch', icon: 'book' },
]

export type Sponsor =
  | { kind: 'amazon'; title: string; blurb: string; url: string; icon: SponsorIcon; region: AmazonRegion }
  | { kind: 'house'; title: string; blurb: string; url: string }

const HOUSE: Sponsor = {
  kind: 'house',
  title: 'Free and open source',
  blurb: 'Like Rookahead? Star it on GitHub',
  url: 'https://github.com/rookahead/rookahead',
}

export function regionFromTimeZone(timeZone: string | undefined): AmazonRegion {
  return timeZone === 'Asia/Kolkata' || timeZone === 'Asia/Calcutta' ? 'in' : 'com'
}

export function amazonUrl(query: string, region: AmazonRegion, tag: string): string {
  return `https://www.amazon.${region}/s?k=${encodeURIComponent(query).replace(/%20/g, '+')}&tag=${encodeURIComponent(tag)}`
}

/** `random` in [0, 1) picks the item, so each visit can show a different one. */
export function pickSponsor(region: AmazonRegion, tags: Record<AmazonRegion, string>, random: number): Sponsor {
  const tag = tags[region]
  if (!tag) return HOUSE
  const item = SPONSORS[Math.min(SPONSORS.length - 1, Math.floor(random * SPONSORS.length))]
  return { kind: 'amazon', title: item.title, blurb: item.blurb, url: amazonUrl(item.query, region, tag), icon: item.icon, region }
}
