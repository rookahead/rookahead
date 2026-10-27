// Builds the blog (rookahead.com/blog) from the Markdown posts in blog/: one plain page per post,
// the list of posts, an Atom feed and the sitemap. Runs before dev and build; the output lands in
// public/ (git-ignored), where it's served like About and Privacy.
//
// A post is blog/<slug>.md with a front block:
//   ---
//   title: How Rookahead grades a move
//   description: One sentence for search results and link previews.
//   date: 2026-10-22
//   cover: moves 1.e4 | badge e4 best     (optional: the board on the post's card)
//   announce: Explain is here             (optional: the bar over the header while it's the newest post)
//   ---
// A ```board block draws a position (see boardSvg below).
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Chess } from 'chess.js'
import { Marked } from 'marked'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SITE = 'https://rookahead.com'
const POSTS = path.join(root, 'blog')
const PUBLIC = path.join(root, 'public')

// The verdict colours (src/lib/classify.ts). The boards' own colours come from the app (themeCss below).
const VERDICTS = {
  brilliant: ['Legendary', '#8b5cf6'],
  great: ['Clutch', '#2f80ed'],
  best: ['Best', '#4f9a3c'],
  excellent: ['Strong', '#4f9a3c'],
  good: ['Solid', '#7a9a68'],
  book: ['Theory', '#a98a62'],
  inaccuracy: ['Slip', '#c99a16'],
  mistake: ['Mistake', '#d9711f'],
  miss: ['Oversight', '#cf4b63'],
  blunder: ['Blunder', '#c7372f'],
  forced: ['Forced', '#5b5f68'],
}

const escape = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

// ── Pieces: Chessground's cburnett set, as one <symbol> per piece ───────────────────────────────

const PIECE_NAMES = { pawn: 'p', knight: 'n', bishop: 'b', rook: 'r', queen: 'q', king: 'k' }
const PIECES = (() => {
  const css = fs.readFileSync(path.join(root, 'node_modules/@lichess-org/chessground/assets/chessground.cburnett.css'), 'utf8')
  const out = {}
  for (const [, role, color, b64] of css.matchAll(/piece\.(\w+)\.(white|black)\s*{\s*background-image:\s*url\('data:image\/svg\+xml;base64,([^']+)'\)/g)) {
    const svg = Buffer.from(b64, 'base64').toString('utf8')
    out[(color === 'white' ? 'w' : 'b') + PIECE_NAMES[role]] = svg.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '')
  }
  return out
})()

const pieceDefs = (used) =>
  `<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>${[...used]
    .sort()
    .map((id) => `<symbol id="pc-${id}" viewBox="0 0 45 45">${PIECES[id]}</symbol>`)
    .join('')}</defs></svg>`

// ── Verdict badges: the app's ClassIcon marks (src/components/ClassIcon.tsx) ────────────────────

const LINE = 'fill="none" stroke="#fff" stroke-linecap="round" stroke-linejoin="round"'
const bang = (cx, s = 1) => `<path d="M${cx} ${50 - 25 * s}V${50 + 6 * s}" ${LINE} stroke-width="${12.5 * s}"/><circle cx="${cx}" cy="${50 + 24 * s}" r="${7.2 * s}" fill="#fff"/>`
function query(cx, s = 1) {
  const p = (x, y) => `${+(cx + (x - 50) * s).toFixed(2)} ${+(50 + (y - 50) * s).toFixed(2)}`
  const d = `M${p(36.5, 38)}C${p(36.5, 29.5)} ${p(42.5, 24.5)} ${p(50.5, 24.5)}C${p(58.5, 24.5)} ${p(64, 29.5)} ${p(64, 36.5)}C${p(64, 43)} ${p(59.5, 46)} ${p(55.5, 48.5)}C${p(52, 50.8)} ${p(50.5, 53.5)} ${p(50.5, 58)}`
  return `<path d="${d}" ${LINE} stroke-width="${11 * s}"/><circle cx="${cx + 0.5 * s}" cy="${50 + 24.5 * s}" r="${7 * s}" fill="#fff"/>`
}
const SOLID = 'fill="#fff" stroke="#fff" stroke-linejoin="round"'
const MARKS = {
  brilliant: bang(36, 0.88) + bang(57, 0.88) + '<path d="M77 14Q78.6 22.4 87 24Q78.6 25.6 77 34Q75.4 25.6 67 24Q75.4 22.4 77 14Z" fill="#fff"/>',
  great: bang(50),
  best: `<path d="M50 23l8.2 16.8 18.5 2.7-13.4 13 3.2 18.4L50 65.2l-16.5 8.7 3.2-18.4-13.4-13 18.5-2.7z" ${SOLID} stroke-width="4"/>`,
  excellent: `<path d="M28 50h9v24h-9zM43 50l9-19c2.5-5 9.5-3.5 9 2l-1.5 12H71c4 0 7 3.6 6 7.6l-3.6 14.6A6 6 0 0 1 67.6 72H43z" ${SOLID} stroke-width="3"/>`,
  good: `<path d="M29 52l14 14 28-30" ${LINE} stroke-width="11"/>`,
  book: `<path d="M50 33C43 28 32 27 24 30V70C32 67 43 68 50 73C57 68 68 67 76 70V30C68 27 57 28 50 33ZM50 33V73" ${LINE} stroke-width="7.5"/>`,
  inaccuracy: query(37, 0.8) + bang(66, 0.8),
  mistake: query(50),
  miss: `<path d="M21 50C31 34 69 34 79 50C69 66 31 66 21 50Z" ${LINE} stroke-width="8.5"/><circle cx="50" cy="50" r="8" fill="#fff"/><path d="M27 77L73 23" stroke="${VERDICTS.miss[1]}" stroke-width="20" stroke-linecap="round"/><path d="M27 77L73 23" ${LINE} stroke-width="9"/>`,
  blunder: query(33, 0.8) + query(66, 0.8),
  forced: `<path d="M29 50H69M55 35L70 50 55 65" ${LINE} stroke-width="10.5"/>`,
}

/** An inline badge for prose: [[brilliant]] in a post becomes the Legendary mark. */
const badge = (cls, size = 18) =>
  `<svg class="badge" width="${size}" height="${size}" viewBox="0 0 100 100" role="img" aria-label="${VERDICTS[cls][0]}"><rect x="4" y="4" width="92" height="92" rx="28" fill="${VERDICTS[cls][1]}"/>${MARKS[cls]}</svg>`

// ── Board diagrams ──────────────────────────────────────────────────────────────────────────────

/**
 * A ```board block, one setting per line:
 *   fen <FEN>              the position (or `moves` instead)
 *   moves <SAN …>          play these from the start; the last one is marked as the last move
 *   last e2e4              highlight a move's two squares
 *   badge e4 brilliant     a verdict badge on a square
 *   arrow d1d8             an arrow (green); `arrow d1d8 red` for a threat
 *   flip                   Black at the bottom
 *   caption <text>         Markdown, shown under the board
 * `bare` draws just the board (no coordinates, no figure), for post covers.
 */
function boardSvg(spec, used, inline, { bare = false } = {}) {
  const opts = { arrows: [], badges: [] }
  for (const raw of spec.split('\n')) {
    const line = raw.trim()
    if (!line) continue
    const [key, ...rest] = line.split(/\s+/)
    const value = line.slice(key.length).trim()
    if (key === 'fen') opts.fen = value
    else if (key === 'moves') opts.moves = value
    else if (key === 'last') opts.last = value
    else if (key === 'badge') opts.badges.push({ sq: rest[0], cls: rest[1] })
    else if (key === 'arrow') opts.arrows.push({ from: rest[0].slice(0, 2), to: rest[0].slice(2, 4), red: rest[1] === 'red' })
    else if (key === 'flip') opts.flip = true
    else if (key === 'caption') opts.caption = value
    else throw new Error(`board: unknown setting "${key}"`)
  }

  const chess = new Chess(opts.fen)
  if (opts.moves) {
    let move
    for (const san of opts.moves.replace(/\d+\.(\.\.)?/g, ' ').split(/\s+/).filter(Boolean)) move = chess.move(san)
    if (move && !opts.last) opts.last = move.from + move.to
  }
  for (const b of opts.badges) if (!VERDICTS[b.cls]) throw new Error(`board: unknown verdict "${b.cls}"`)

  const S = 100
  const xy = (sq) => {
    const f = sq.charCodeAt(0) - 97
    const r = Number(sq[1]) - 1
    return opts.flip ? [(7 - f) * S, r * S] : [f * S, (7 - r) * S]
  }
  const parts = []
  for (let r = 0; r < 8; r++)
    for (let f = 0; f < 8; f++) if ((r + f) % 2 === 1) parts.push(`<rect class="sq-d" x="${f * S}" y="${r * S}" width="${S}" height="${S}"/>`)
  if (opts.last)
    for (const sq of [opts.last.slice(0, 2), opts.last.slice(2, 4)]) {
      const [x, y] = xy(sq)
      parts.push(`<rect class="sq-last" x="${x}" y="${y}" width="${S}" height="${S}"/>`)
    }
  // Coordinates inside the edge squares, in the other square colour, as the app draws them.
  for (let i = 0; i < 8 && !bare; i++) {
    const file = String.fromCharCode(97 + (opts.flip ? 7 - i : i))
    const rank = opts.flip ? i + 1 : 8 - i
    parts.push(`<text x="${i * S + S - 6}" y="${8 * S - 7}" text-anchor="end" class="coord ${i % 2 === 0 ? 'on-d' : 'on-l'}">${file}</text>`)
    parts.push(`<text x="6" y="${i * S + 22}" class="coord ${i % 2 === 0 ? 'on-l' : 'on-d'}">${rank}</text>`)
  }
  for (const row of chess.board())
    for (const p of row) {
      if (!p) continue
      const id = p.color + p.type
      used.add(id)
      const [x, y] = xy(p.square)
      parts.push(`<use href="#pc-${id}" x="${x}" y="${y}" width="${S}" height="${S}"/>`)
    }
  for (const a of opts.arrows) {
    const [x1, y1] = xy(a.from).map((v) => v + S / 2)
    const [x2, y2] = xy(a.to).map((v) => v + S / 2)
    const len = Math.hypot(x2 - x1, y2 - y1)
    const [ux, uy] = [(x2 - x1) / len, (y2 - y1) / len]
    const head = 34
    const [bx, by] = [x2 - ux * head, y2 - uy * head]
    const color = a.red ? '#c7372f' : '#15781b'
    parts.push(
      `<g opacity="0.8"><line x1="${x1}" y1="${y1}" x2="${bx}" y2="${by}" stroke="${color}" stroke-width="16"/><path d="M${x2} ${y2}L${bx - uy * 22} ${by + ux * 22}L${bx + uy * 22} ${by - ux * 22}Z" fill="${color}"/></g>`,
    )
  }
  // Badges sit on the square's top-right corner, tucked inside on the board's edges like the app's.
  for (const b of opts.badges) {
    const [x, y] = xy(b.sq)
    const size = 44
    const bx = Math.min(x + S - size / 2, 8 * S - size)
    const by = Math.max(y - size / 2, 0)
    parts.push(
      `<svg x="${bx}" y="${by}" width="${size}" height="${size}" viewBox="0 0 100 100"><rect x="4" y="4" width="92" height="92" rx="28" fill="${VERDICTS[b.cls][1]}"/>${MARKS[b.cls]}</svg>`,
    )
  }

  const toMove = chess.turn() === 'w' ? 'White' : 'Black'
  const label = opts.caption ? opts.caption.replace(/[*_`]/g, '') : `${toMove} to move`
  const svg = `<svg class="board" viewBox="0 0 800 800" role="img" aria-label="${escape(label)}"><rect class="sq-l" width="800" height="800"/>${parts.join('')}</svg>`
  if (bare) return svg
  return `<figure class="diagram">${svg}${opts.caption ? `<figcaption>${inline(opts.caption)}</figcaption>` : ''}</figure>`
}

// ── Markdown ────────────────────────────────────────────────────────────────────────────────────

/** Curly quotes and dashes in prose (never in code). */
const smarten = (s) =>
  s
    .replace(/(^|[\s([{“—-])"/g, '$1“')
    .replace(/"/g, '”')
    .replace(/(^|[\s([{“—-])'/g, '$1‘')
    .replace(/'/g, '’')
    .replace(/ -- /g, ' – ')
    .replace(/\.\.\./g, '…')

const slugify = (s) =>
  s
    .toLowerCase()
    .replace(/<[^>]+>/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

function renderPost(markdown, used) {
  const toc = []
  const marked = new Marked({
    gfm: true,
    walkTokens(token) {
      if (token.type === 'text' && !token.tokens) token.text = smarten(token.text)
    },
    renderer: {
      code({ text, lang }) {
        if (lang === 'board') return boardSvg(text, used, (md) => marked.parseInline(md))
        return false
      },
      // Sections get an id, for the table of contents.
      heading({ tokens, depth }) {
        const text = this.parser.parseInline(tokens)
        if (depth !== 2) return `<h${depth}>${text}</h${depth}>\n`
        const id = slugify(text)
        toc.push({ id, text })
        return `<h2 id="${id}">${text}</h2>\n`
      },
      // External links open in a new tab; links inside Rookahead don't.
      link({ href, title, tokens }) {
        const external = /^https?:\/\//.test(href) && !href.startsWith(SITE)
        return `<a href="${escape(href)}"${title ? ` title="${escape(title)}"` : ''}${external ? ' rel="noopener"' : ''}>${this.parser.parseInline(tokens)}</a>`
      },
    },
  })
  // [[brilliant]] → the Legendary badge, before Markdown sees the brackets.
  const html = marked.parse(markdown.replace(/\[\[(\w+)\]\]/g, (m, cls) => (VERDICTS[cls] ? badge(cls) : m)))
  return { html, toc }
}

function readPost(file) {
  const source = fs.readFileSync(path.join(POSTS, file), 'utf8')
  const m = /^---\n([\s\S]*?)\n---\n/.exec(source)
  if (!m) throw new Error(`${file}: no front block`)
  const meta = Object.fromEntries(
    m[1].split('\n').map((l) => {
      const i = l.indexOf(':')
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()]
    }),
  )
  for (const key of ['title', 'description', 'date']) if (!meta[key]) throw new Error(`${file}: no ${key}`)
  meta.title = smarten(meta.title)
  meta.description = smarten(meta.description)
  // A cover is a board, written like a ```board block with " | " between its lines.
  meta.cover = meta.cover?.replace(/\s*\|\s*/g, '\n')
  const body = source.slice(m[0].length)
  const words = body.replace(/```[\s\S]*?```/g, '').split(/\s+/).filter(Boolean).length
  return { ...meta, slug: file.replace(/\.md$/, ''), body, minutes: Math.max(1, Math.round(words / 220)) }
}

// ── Pages ───────────────────────────────────────────────────────────────────────────────────────

const longDate = (iso) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
const meta = (p) => `<span class="meta"><time datetime="${p.date}">${longDate(p.date)}</time><span>${p.minutes} min read</span></span>`
const DEFAULT_COVER = 'moves 1.e4'

// The app's rook (src/components/RookLogo.tsx) and the Simple Icons logos the sidebar uses (CC0).
const ROOK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 3H8V5H10.5V3H13.5V5H16V3H19V7.72L15 6.3V7.3H10.5A0.7 0.7 0 0 0 10.5 8.7H15V9.7L19 8.28V11H15.5C15.5 15 16.5 17 19.5 18V21H4.5V18C7.5 17 8.5 15 8.5 11H5Z"/></svg>'
const DISCORD =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189Z"/></svg>'
const GITHUB =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/></svg>'
const DISCORD_URL = 'https://discord.gg/ebm3NZNHZH'

// The look you picked in the app (Settings → Appearance and Board), before the first paint: light, dark or
// black (else the device's), your colour and your board. Settings read as the app reads them (src/lib/settings.ts):
// a Graphite board from before the Theme board and a Gold that was only the default for a day are the defaults.
const THEME = `<script>try{var s=JSON.parse(localStorage.getItem('rookahead.settings.v2')||'{}'),a=s.appearance,r=document.documentElement,v=s.themes||0;r.dataset.theme=a==='light'?'light':a==='dark'||a==='black'||a==='dim'?'dark':matchMedia('(prefers-color-scheme: light)').matches?'light':'dark';if(a==='black')r.setAttribute('data-black','');if(s.palette&&!(s.palette==='gold'&&v<3))r.dataset.palette=s.palette;if(s.boardTheme&&!(s.boardTheme==='graphite'&&v<2))r.dataset.board=s.boardTheme}catch(e){}</script>`

// Before the first paint too: the announcement gone if you closed it.
const headScript = (announce) =>
  `<script>try{var r=document.documentElement;if(localStorage.getItem('rookahead.blog.announce')===${JSON.stringify(announce?.slug ?? '')})r.setAttribute('data-announce-closed','')}catch(e){}</script>`

// Copy link, closing the announcement, and the table of contents following the section you're reading.
const SCRIPT = `<script>
var announce = document.querySelector('[data-announce]')
if (announce) announce.querySelector('button').addEventListener('click', function () {
  document.documentElement.setAttribute('data-announce-closed', '')
  try { localStorage.setItem('rookahead.blog.announce', announce.dataset.announce) } catch (e) {}
})
document.querySelectorAll('[data-copy]').forEach(function (b) {
  b.addEventListener('click', function () {
    navigator.clipboard.writeText(location.origin + location.pathname).then(function () {
      b.textContent = 'Link copied'
      setTimeout(function () { b.textContent = 'Copy link' }, 1600)
    })
  })
})
var heads = [].slice.call(document.querySelectorAll('.prose h2[id]'))
var links = [].slice.call(document.querySelectorAll('.toc a'))
function mark() {
  var current = null
  heads.forEach(function (h) { if (h.getBoundingClientRect().top < innerHeight * 0.35) current = h.id })
  links.forEach(function (l) { l.toggleAttribute('aria-current', l.getAttribute('href') === '#' + current) })
}
if (heads.length) { addEventListener('scroll', mark, { passive: true }); mark() }
</script>`

/** The bar over the header: the newest post, its `announce` line if it has one. Not on that post itself. */
const announceBar = (post) =>
  post
    ? `<div class="announce" data-announce="${post.slug}">
      <a href="/blog/${post.slug}">${escape(post.announce ?? `New post: ${post.title}`)}. Read the post <span aria-hidden="true">→</span></a>
      <button type="button" aria-label="Close">×</button>
    </div>`
    : ''

function page({ title, description, canonical, type = 'website', head = '', body, defs = '', current = '', announce = null }) {
  const nav = [
    ['/blog', 'Blog'],
    ['/blog/whats-new', 'What’s new'],
    ['/about', 'About'],
  ]
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    ${THEME}
    ${headScript(announce)}
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <link rel="preload" href="/blog/fonts/syne.woff2" as="font" type="font/woff2" crossorigin />
    <link rel="preload" href="/blog/fonts/dm-sans.woff2" as="font" type="font/woff2" crossorigin />
    <link rel="stylesheet" href="/blog/theme.css" />
    <link rel="stylesheet" href="/blog.css" />
    <link rel="canonical" href="${canonical}" />
    <link rel="alternate" type="application/atom+xml" title="Rookahead blog" href="/blog/feed.xml" />
    <title>${escape(title)}</title>
    <meta name="description" content="${escape(description)}" />
    <meta property="og:site_name" content="Rookahead" />
    <meta property="og:type" content="${type}" />
    <meta property="og:title" content="${escape(title)}" />
    <meta property="og:description" content="${escape(description)}" />
    <meta property="og:url" content="${canonical}" />
    <meta property="og:image" content="${SITE}/og.png" />
    <meta name="twitter:card" content="summary_large_image" />${head}
  </head>
  <body>
    ${defs}
    ${announceBar(announce)}
    <header class="top">
      <div class="top-in">
        <a class="brand" href="/" aria-label="Rookahead">${ROOK}<span class="wordmark">rook<span>ahead</span></span></a>
        <nav class="top-nav" aria-label="Site">${nav.map(([href, label]) => `<a href="${href}"${href === current ? ' aria-current="page"' : ''}>${label}</a>`).join('')}</nav>
        <div class="top-end">
          <a class="icon-link" href="${DISCORD_URL}" rel="noopener" aria-label="Discord" title="Discord">${DISCORD}</a>
          <a class="icon-link" href="https://github.com/rookahead/rookahead" rel="noopener" aria-label="GitHub" title="GitHub">${GITHUB}</a>
          <a class="app-btn" href="/">Open the app</a>
        </div>
      </div>
    </header>
${body}
    <footer class="foot">
      <span>Rookahead, free chess game review</span>
      <nav aria-label="More"><a href="/blog">Blog</a><a href="/about">About</a><a href="/privacy">Privacy</a></nav>
    </footer>
    ${SCRIPT}
  </body>
</html>
`
}

const cover = (p, used) => boardSvg(p.cover ?? DEFAULT_COVER, used, null, { bare: true })

function indexPage(posts) {
  const used = new Set()
  const [latest, ...rest] = posts
  const cards = rest
    .map(
      (p) => `        <li>
          <a class="card" href="/blog/${p.slug}">
            <h3>${escape(p.title)}</h3>
            <span class="card-desc">${escape(p.description)}</span>
            ${meta(p)}
          </a>
        </li>`,
    )
    .join('\n')
  const body = `    <main class="index">
      <h1 class="hidden">Rookahead blog</h1>
      <a class="hero" href="/blog/${latest.slug}">
        <span class="hero-text">
          <span class="hero-tag">${ROOK}Latest post</span>
          <h2>${escape(latest.title)}</h2>
          <span class="hero-desc">${escape(latest.description)}</span>
          ${meta(latest)}
          <span class="hero-cta">Read the post</span>
        </span>
        <span class="hero-board">${cover(latest, used)}</span>
      </a>
      <h2 class="more-title">Recent posts</h2>
      <ul class="cards">
${cards}
      </ul>
    </main>`
  return page({
    title: 'Blog · Rookahead',
    description: 'How Rookahead grades your moves, what’s new, and the thinking behind a free chess game review.',
    canonical: `${SITE}/blog`,
    current: '/blog',
    body,
    defs: pieceDefs(used),
    announce: latest,
  })
}

function postPage(post, posts) {
  const used = new Set()
  const { html, toc } = renderPost(post.body, used)
  const url = `${SITE}/blog/${post.slug}`
  const ld = { '@context': 'https://schema.org', '@type': 'BlogPosting', headline: post.title, description: post.description, datePublished: post.date, author: { '@type': 'Organization', name: 'Rookahead', url: SITE }, mainEntityOfPage: url, image: `${SITE}/og.png` }
  const list = posts.map((p) => `<li><a href="/blog/${p.slug}"${p === post ? ' aria-current="page"' : ''}>${escape(p.title)}</a></li>`).join('')
  const tocList = toc.map((t) => `<li><a href="#${t.id}">${t.text}</a></li>`).join('')
  const i = posts.indexOf(post)
  const pager = [
    [posts[i - 1], 'Newer'],
    [posts[i + 1], 'Older'],
  ]
    .filter(([p]) => p)
    .map(([p, label]) => `<a class="pager-link" href="/blog/${p.slug}"><span class="pager-label">${label}</span><span class="pager-title">${escape(p.title)}</span></a>`)
    .join('')
  const body = `    <div class="post-layout">
      <nav class="side" aria-label="Posts">
        <a class="side-title" href="/blog">All posts</a>
        <ul>${list}</ul>
      </nav>
      <main class="post">
        <details class="drop posts-menu"><summary>All posts</summary><ul>${list}</ul></details>
        <h1>${escape(post.title)}</h1>
        <p class="lede">${escape(post.description)}</p>
        <div class="byline">
          <span class="avatar">${ROOK}</span>
          <span class="byline-text"><strong>Rookahead</strong>${meta(post)}</span>
          <button class="copy" type="button" data-copy>Copy link</button>
        </div>
        ${toc.length ? `<details class="drop toc-inline"><summary>On this page</summary><ul class="toc">${tocList}</ul></details>` : ''}
        <div class="prose">
${html}
        </div>
        <aside class="try">
          <h2>Review your own games, free</h2>
          <p>Paste a game, or bring in your Chess.com and Lichess games by username. Stockfish runs on your device, so there’s no limit and no account to make.</p>
          <p class="try-actions"><a class="app-btn" href="/">Open Rookahead</a><a href="${DISCORD_URL}" rel="noopener">Talk about it on Discord</a></p>
        </aside>
        ${pager ? `<nav class="pager" aria-label="More posts">${pager}</nav>` : ''}
      </main>
      <aside class="toc-rail" aria-label="On this page">${toc.length ? `<p class="toc-title">On this page</p><ul class="toc">${tocList}</ul>` : ''}</aside>
    </div>`
  return page({
    title: `${post.title} · Rookahead`,
    description: post.description,
    canonical: url,
    type: 'article',
    current: post.slug === 'whats-new' ? '/blog/whats-new' : '/blog',
    head: `\n    <meta property="article:published_time" content="${post.date}" />\n    <script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>`,
    body,
    defs: used.size ? pieceDefs(used) : '',
    announce: post === posts[0] ? null : posts[0],
  })
}

function feed(posts) {
  const updated = posts[0]?.date ?? '2026-10-22'
  const entries = posts
    .map((p) => {
      const url = `${SITE}/blog/${p.slug}`
      return `  <entry>
    <title>${escape(p.title)}</title>
    <link href="${url}" />
    <id>${url}</id>
    <updated>${p.date}T00:00:00Z</updated>
    <summary>${escape(p.description)}</summary>
  </entry>`
    })
    .join('\n')
  return `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Rookahead blog</title>
  <link href="${SITE}/blog" />
  <link rel="self" href="${SITE}/blog/feed.xml" />
  <id>${SITE}/blog</id>
  <updated>${updated}T00:00:00Z</updated>
  <author><name>Rookahead</name></author>
${entries}
</feed>
`
}

/**
 * The app's colours for the blog (blog/theme.css), so it follows the theme you picked there: the colour
 * themes' tones, cut from src/index.css, and every board's squares, read from src/components/Board.tsx.
 * blog.css builds on these the way index.css does.
 */
function themeCss() {
  const css = fs.readFileSync(path.join(root, 'src/index.css'), 'utf8')
  const start = css.indexOf('/* ═══════════════ Colour themes')
  const end = css.indexOf('/* ═══════════════ Black')
  if (start < 0 || end < start) throw new Error('theme: the colour themes are missing from src/index.css')
  const tsx = fs.readFileSync(path.join(root, 'src/components/Board.tsx'), 'utf8')
  const boards = (name) => {
    const block = tsx.slice(tsx.indexOf(`const ${name}`), tsx.indexOf('\n}\n', tsx.indexOf(`const ${name}`)))
    const found = [...block.matchAll(/^\s*(\w+): \{ light: '(#\w+)', dark: '(#\w+)', label: '[^']*'(?:, lastMove: '([^']+)')?/gm)]
    if (!found.length) throw new Error(`theme: no boards in ${name} (src/components/Board.tsx)`)
    return found.map(([, id, light, dark, last]) => ({ id, light, dark, last: last ?? 'rgba(255, 255, 51, 0.42)' }))
  }
  const squares = (b) => `--sq-light: ${b.light};\n  --sq-dark: ${b.dark};\n  --sq-last: ${b.last};`
  const fixed = boards('BOARD_THEMES').map((b) => `:root[data-board='${b.id}'] {\n  ${squares(b)}\n}`)
  // The Theme board, the default: Sky's unless your colour theme says otherwise.
  const themed = boards('THEME_BOARDS').map((b) => {
    const sel = `:root[data-palette='${b.id}']:is(:not([data-board]), [data-board='theme'])`
    return `${b.id === 'sky' ? ":root:is(:not([data-board]), [data-board='theme']),\n" : ''}${sel} {\n  ${squares(b)}\n}`
  })
  return `/* Made by scripts/build-blog.mjs from the app's own colours: don't edit, it's rebuilt. */\n${css.slice(start, end).trim()}\n\n${[...themed, ...fixed].join('\n\n')}\n`
}

// The app's own pages that are worth finding from a search, then the blog.
const APP_PAGES = ['/', '/games', '/puzzles', '/puzzles/daily', '/play', '/legendary', '/board', '/about', '/privacy']

function sitemap(posts) {
  const urls = [...APP_PAGES.map((p) => ({ loc: SITE + p })), { loc: `${SITE}/blog`, lastmod: posts[0]?.date }, ...posts.map((p) => ({ loc: `${SITE}/blog/${p.slug}`, lastmod: p.date }))]
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${u.loc}</loc>${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ''}</url>`).join('\n')}
</urlset>
`
}

const posts = fs
  .readdirSync(POSTS)
  .filter((f) => f.endsWith('.md'))
  .map(readPost)
  .sort((a, b) => (a.date === b.date ? Number(b.order ?? 0) - Number(a.order ?? 0) : a.date < b.date ? 1 : -1))

const out = path.join(PUBLIC, 'blog')
fs.rmSync(out, { recursive: true, force: true })
fs.mkdirSync(path.join(out, 'fonts'), { recursive: true })
// The app's Syne and DM Sans, so the blog reads like Rookahead.
fs.copyFileSync(path.join(root, 'node_modules/@fontsource-variable/syne/files/syne-latin-wght-normal.woff2'), path.join(out, 'fonts/syne.woff2'))
fs.copyFileSync(path.join(root, 'node_modules/@fontsource-variable/dm-sans/files/dm-sans-latin-wght-normal.woff2'), path.join(out, 'fonts/dm-sans.woff2'))
for (const post of posts) fs.writeFileSync(path.join(out, `${post.slug}.html`), postPage(post, posts))
fs.writeFileSync(path.join(PUBLIC, 'blog.html'), indexPage(posts))
fs.writeFileSync(path.join(out, 'feed.xml'), feed(posts))
fs.writeFileSync(path.join(out, 'theme.css'), themeCss())
fs.writeFileSync(path.join(PUBLIC, 'sitemap.xml'), sitemap(posts))
console.log(`blog: ${posts.length} posts`)
