// Draws a position as an image: player bars, the board in the user's theme, the move's
// classification badge and a Rookahead footer. Used for the Share dialog's Image and GIF tabs,
// and loaded lazily, so none of this weighs on the main bundle.
import { Chess } from 'chess.js'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { ClassIcon } from '../components/ClassIcon'
import { CLASS_INFO, type MoveClass } from './classify'
import { frameLayout, squareOrigin, type FrameSpec } from './frame'

const BG = '#0b0b0c'
const TEXT = '#ededed'
const MUTED = '#8b8b94'
const FONT = "'DM Sans Variable', 'DM Sans', system-ui, sans-serif"
const ROLES: Record<string, string> = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' }

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`Couldn't load ${src.slice(0, 40)}`))
    img.src = src
  })
}

const svgUrl = (markup: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`

/** The board's own piece set: read from the cburnett stylesheet the app already loads. */
let pieces: Promise<Record<string, HTMLImageElement>> | null = null
function loadPieces() {
  pieces ??= (async () => {
    const wrap = document.createElement('div')
    wrap.className = 'cg-wrap'
    wrap.style.cssText = 'position:absolute;left:-9999px;width:10px;height:10px'
    document.body.append(wrap)
    const out: Record<string, HTMLImageElement> = {}
    try {
      for (const color of ['white', 'black']) {
        for (const [letter, role] of Object.entries(ROLES)) {
          const el = document.createElement('piece')
          el.className = `${role} ${color}`
          wrap.append(el)
          const url = /url\("?(.*?)"?\)$/.exec(getComputedStyle(el).backgroundImage)?.[1]
          if (!url) throw new Error(`No image for the ${color} ${role}`)
          out[(color === 'white' ? letter.toUpperCase() : letter)] = await loadImage(url)
        }
      }
    } finally {
      wrap.remove()
    }
    return out
  })()
  return pieces
}

const badges = new Map<MoveClass, Promise<HTMLImageElement>>()
function loadBadge(cls: MoveClass) {
  let badge = badges.get(cls)
  if (!badge) {
    // Images drawn from SVG can't use the page's web fonts: give the glyphs a common bold sans.
    const markup = renderToStaticMarkup(createElement(ClassIcon, { cls, size: 100 }))
      .replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ')
      .replace(/<text /g, '<text font-family="Helvetica, Arial, sans-serif" ')
    badge = loadImage(svgUrl(markup))
    badges.set(cls, badge)
  }
  return badge
}

let logo: Promise<HTMLImageElement> | null = null
const loadLogo = () => (logo ??= loadImage('/favicon.svg'))

/** Hex "#22c3a6" → "rgba(34, 195, 166, a)". */
function tint(hex: string, alpha: number) {
  const n = parseInt(hex.slice(1), 16)
  return `rgba(${n >> 16}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`
}

/** Shortens `text` with an ellipsis until it fits `max` pixels. */
function fit(ctx: CanvasRenderingContext2D, text: string, max: number) {
  if (ctx.measureText(text).width <= max) return text
  let s = text
  while (s.length > 1 && ctx.measureText(s + '…').width > max) s = s.slice(0, -1)
  return s + '…'
}

/** Loads fonts and images a frame needs, so drawing many GIF frames afterwards is synchronous. */
export async function prepareAssets(classes: MoveClass[] = []) {
  const unit = 26
  await Promise.all([document.fonts.load(`600 ${unit}px ${FONT}`), document.fonts.load(`400 ${unit}px ${FONT}`)])
  const [p, l, ...b] = await Promise.all([loadPieces(), loadLogo(), ...classes.map(loadBadge)])
  return { pieces: p, logo: l, badges: Object.fromEntries(classes.map((c, i) => [c, b[i]])) as Partial<Record<MoveClass, HTMLImageElement>> }
}

export type Assets = Awaited<ReturnType<typeof prepareAssets>>

export function drawFrame(canvas: HTMLCanvasElement, spec: FrameSpec, width: number, assets: Assets) {
  const L = frameLayout(width)
  canvas.width = width
  canvas.height = L.height
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = BG
  ctx.fillRect(0, 0, width, L.height)

  const pad = Math.round(width * 0.03)
  const bar = (y: number, player: FrameSpec['top'], color: 'white' | 'black') => {
    const r = L.bar * 0.28
    const cx = pad + r
    const cy = y + L.bar / 2
    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, Math.PI * 2)
    ctx.fillStyle = color === 'white' ? '#f2f2f3' : '#26262b'
    ctx.fill()
    ctx.fillStyle = color === 'white' ? '#111113' : '#f2f2f3'
    ctx.font = `600 ${Math.round(r * 1.05)}px ${FONT}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText((player.name[0] ?? '?').toUpperCase(), cx, cy + 1)

    ctx.textAlign = 'left'
    const x = cx + r + pad * 0.6
    const nameFont = `600 ${Math.round(L.bar * 0.34)}px ${FONT}`
    const ratingFont = `400 ${Math.round(L.bar * 0.3)}px ${FONT}`
    const rating = player.rating ? ` ${player.rating}` : ''
    ctx.font = ratingFont
    const ratingWidth = rating ? ctx.measureText(rating).width : 0
    ctx.font = nameFont
    ctx.fillStyle = TEXT
    const name = fit(ctx, player.name, width - x - pad - ratingWidth)
    ctx.fillText(name, x, cy + 1)
    if (rating) {
      const nameWidth = ctx.measureText(name).width
      ctx.font = ratingFont
      ctx.fillStyle = MUTED
      ctx.fillText(rating, x + nameWidth, cy + 1)
    }
  }

  const topColor = spec.orientation === 'white' ? 'black' : 'white'
  bar(0, spec.top, topColor)

  // Board
  const by = L.bar
  const sq = L.square
  for (let r = 0; r < 8; r++)
    for (let f = 0; f < 8; f++) {
      ctx.fillStyle = (r + f) % 2 ? spec.theme.dark : spec.theme.light
      ctx.fillRect(f * sq, by + r * sq, sq, sq)
    }
  if (spec.lastMove) {
    ctx.fillStyle = spec.cls ? tint(CLASS_INFO[spec.cls].color, 0.6) : spec.theme.lastMove
    for (const s of spec.lastMove) {
      const o = squareOrigin(s, spec.orientation, sq)
      ctx.fillRect(o.x, by + o.y, sq, sq)
    }
  }
  const board = new Chess(spec.fen).board()
  board.forEach((row) =>
    row.forEach((cell) => {
      if (!cell) return
      const img = assets.pieces[cell.color === 'w' ? cell.type.toUpperCase() : cell.type]
      const o = squareOrigin(cell.square, spec.orientation, sq)
      ctx.drawImage(img, o.x, by + o.y, sq, sq)
    }),
  )
  const badge = spec.cls && spec.lastMove && assets.badges[spec.cls]
  if (badge && spec.lastMove) {
    const size = sq * 0.4
    const o = squareOrigin(spec.lastMove[1], spec.orientation, sq)
    const x = Math.min(o.x + sq - size * 0.7, width - size - 2)
    const y = by + Math.max(o.y - size * 0.3, -L.bar * 0.2)
    ctx.save()
    ctx.shadowColor = 'rgba(0, 0, 0, 0.45)'
    ctx.shadowBlur = size * 0.2
    ctx.shadowOffsetY = size * 0.06
    ctx.drawImage(badge, x, y, size, size)
    ctx.restore()
  }

  bar(L.bar + L.board, spec.bottom, spec.orientation)

  // Footer: caption on the left, logo + address on the right.
  const fy = 2 * L.bar + L.board
  ctx.fillStyle = '#111113'
  ctx.fillRect(0, fy, width, L.footer)
  ctx.fillStyle = 'rgba(255, 255, 255, 0.07)'
  ctx.fillRect(0, fy, width, 1)
  const cy = fy + L.footer / 2
  ctx.textBaseline = 'middle'
  ctx.font = `500 ${Math.round(L.footer * 0.34)}px ${FONT}`
  const site = 'rookahead.com'
  const siteWidth = ctx.measureText(site).width
  const logoSize = L.footer * 0.44
  ctx.textAlign = 'right'
  ctx.fillStyle = MUTED
  ctx.fillText(site, width - pad, cy + 1)
  ctx.drawImage(assets.logo, width - pad - siteWidth - logoSize - pad * 0.4, cy - logoSize / 2, logoSize, logoSize)
  // Caption, then the verdict: its icon and name in its colour.
  ctx.textAlign = 'left'
  ctx.font = `600 ${Math.round(L.footer * 0.38)}px ${FONT}`
  const room = width - 3 * pad - siteWidth - logoSize - pad
  const caption = fit(ctx, spec.caption, room * 0.55)
  ctx.fillStyle = TEXT
  ctx.fillText(caption, pad, cy + 1)
  const icon = spec.verdict && assets.badges[spec.verdict]
  if (spec.verdict && icon) {
    const size = L.footer * 0.46
    const x = pad + ctx.measureText(caption).width + pad * 0.7
    ctx.drawImage(icon, x, cy - size / 2, size, size)
    ctx.fillStyle = CLASS_INFO[spec.verdict].color
    ctx.fillText(fit(ctx, CLASS_INFO[spec.verdict].label, pad + room - x - size - pad * 0.35), x + size + pad * 0.35, cy + 1)
  }
}

export async function renderFrame(spec: FrameSpec, width: number): Promise<HTMLCanvasElement> {
  const assets = await prepareAssets([...new Set([spec.cls, spec.verdict].filter((c): c is MoveClass => Boolean(c)))])
  const canvas = document.createElement('canvas')
  drawFrame(canvas, spec, width, assets)
  return canvas
}

export function canvasToPng(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG encoding failed'))), 'image/png'))
}
