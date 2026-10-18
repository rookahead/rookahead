import { useEffect, useMemo, useRef, useState } from 'react'
import type { GameReport, MoveClass } from '../lib/classify'
import type { Color } from '../lib/evaluation'
import { download } from '../lib/download'
import { exportPgn, pgnFileName } from '../lib/pgn'
import type { BoardTheme } from '../lib/settings'
import { EMBED_SIZES, embedUrl, gameShareText, iframeSnippet, momentShareText, moveLabel, shareUrl, type EmbedSize } from '../lib/share'
import { GifTab, ImageTab } from './ShareMedia'
import type { MoveNode, PgnHeaders } from '../lib/tree'

export type ShareMode = 'game' | 'move'
type Tab = 'pgn' | 'fen' | 'image' | 'gif' | 'embed'

/** Mounted only while open, so every opening starts fresh. */
interface Props {
  onClose: () => void
  initialMode: ShareMode
  /** Main line, start position first. */
  line: MoveNode[]
  currentNode: MoveNode
  headers: PgnHeaders
  orientation: Color
  report: GameReport | null
  boardTheme: BoardTheme
  /** The share-link token for this game (and its review, when finished). */
  getToken: () => Promise<string>
}

export const ShareIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden>
    <path d="m12 2 5 5-1.4 1.4L13 5.8V15h-2V5.8L8.4 8.4 7 7zM4 12h2v8h12v-8h2v10H4z" />
  </svg>
)

const CopyIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden>
    <path d="M8 3h11a2 2 0 0 1 2 2v11h-2V5H8zM5 7h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2m0 2v10h10V9z" />
  </svg>
)

/** Copies `text`; says "Copied ✓" in place for two seconds. */
export function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])
  return (
    <button
      className={`copy-btn ${copied ? 'copied' : ''}`}
      disabled={!text}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text)
          setCopied(true)
          clearTimeout(timer.current)
          timer.current = setTimeout(() => setCopied(false), 2000)
        } catch {
          window.prompt('Copy this', text)
        }
      }}
      aria-label={label}
      title={label}
    >
      {copied ? 'Copied ✓' : <CopyIcon />}
    </button>
  )
}

export function ShareDialog({ onClose, initialMode, line, currentNode, headers, orientation, report, boardTheme, getToken }: Props) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [mode, setMode] = useState<ShareMode>(initialMode)
  const [tab, setTab] = useState<Tab>('pgn')
  const [token, setToken] = useState<string | null>(null)
  const [withReview, setWithReview] = useState(true)
  const [withClocks, setWithClocks] = useState(false)
  const [embedSize, setEmbedSize] = useState<EmbedSize>('medium')
  const getTokenRef = useRef(getToken)
  useEffect(() => {
    getTokenRef.current = getToken
  })

  // "This move" needs a main-line move; the start position only shares the whole game.
  const moveIndex = line.findIndex((n) => n.id === currentNode.id)
  const moveNode = moveIndex > 0 ? line[moveIndex] : null
  const moveCls = moveNode ? report?.moves[moveNode.id]?.cls : undefined
  const activeMode: ShareMode = mode === 'move' && moveNode ? 'move' : 'game'

  useEffect(() => {
    dialog.current?.showModal()
  }, [])

  // The token reflects the game and review as they are when the dialog opens.
  useEffect(() => {
    let live = true
    void getTokenRef.current().then((t) => live && setToken(t))
    return () => {
      live = false
    }
  }, [])

  const url = token ? shareUrl(token, activeMode === 'move' ? moveIndex : null, location.origin) : ''
  const text =
    activeMode === 'move' && moveNode
      ? momentShareText(moveNode.ply, moveNode.san!, moveCls, headers)
      : gameShareText(headers, report && report.accuracy.white != null ? report.accuracy : null)

  const classes = useMemo(
    () => (report ? (Object.fromEntries(Object.entries(report.moves).map(([id, m]) => [id, m.cls])) as Record<string, MoveClass>) : null),
    [report],
  )
  const hasClocks = line.some((n) => n.clock !== undefined)
  const pgn = useMemo(
    () => exportPgn(line, headers, { classes: withReview ? classes : null, clocks: withClocks && hasClocks }),
    [line, headers, classes, withReview, withClocks, hasClocks],
  )

  const tabs: [Tab, string][] = [
    ['pgn', 'PGN'],
    ['fen', 'FEN'],
    ['image', 'Image'],
    ['gif', 'GIF'],
    ['embed', 'Embed'],
  ]

  return (
    <dialog
      ref={dialog}
      className="dialog share-dialog"
      onClose={() => {
        // Unmount once the closing fade (0.16s in index.css) has played.
        setTimeout(onClose, 160)
        requestAnimationFrame(() => (document.activeElement as HTMLElement | null)?.blur())
      }}
      onClick={(e) => {
        if (e.target === dialog.current) dialog.current.close()
      }}
    >
      <div className="dialog-inner">
        <header className="dialog-header">
          <h2>Share</h2>
          <button className="icon-btn" onClick={() => dialog.current?.close()} aria-label="Close">
            ✕
          </button>
        </header>

        <section className="share-link">
          <div className="segmented" role="radiogroup" aria-label="Link to">
            <button role="radio" aria-checked={activeMode === 'game'} className={activeMode === 'game' ? 'active' : ''} onClick={() => setMode('game')}>
              Whole game
            </button>
            <button
              role="radio"
              aria-checked={activeMode === 'move'}
              className={activeMode === 'move' ? 'active' : ''}
              disabled={!moveNode}
              onClick={() => setMode('move')}
            >
              {moveNode ? `This move · ${moveLabel(moveNode.ply, moveNode.san!, moveCls)}` : 'This move'}
            </button>
          </div>
          <div className="copy-field">
            <input className="input mono" readOnly value={url || 'Making link…'} aria-label="Share link" onFocus={(e) => e.target.select()} />
            <CopyButton text={url} label="Copy link" />
          </div>
          {typeof navigator.share === 'function' && (
            <button className="btn ghost" disabled={!url} onClick={() => void navigator.share({ title: 'Rookahead', text, url }).catch(() => {})}>
              <ShareIcon />
              Share…
            </button>
          )}
        </section>

        <div className="tabs" role="tablist">
          {tabs.map(([id, label]) => (
            <button key={id} role="tab" aria-selected={tab === id} className={`tab ${tab === id ? 'active' : ''}`} onClick={() => setTab(id)}>
              {label}
            </button>
          ))}
        </div>

        <div className="tab-body share-body">
          {tab === 'pgn' && (
            <>
              <div className="copy-area">
                <textarea className="input textarea" readOnly value={pgn} aria-label="PGN" spellCheck={false} />
                <CopyButton text={pgn} label="Copy PGN" />
              </div>
              <div className="share-options">
                <label className={classes ? '' : 'disabled'}>
                  <input type="checkbox" checked={withReview && Boolean(classes)} disabled={!classes} onChange={(e) => setWithReview(e.target.checked)} />
                  Include review (!!, !, ?!, ?, ??)
                </label>
                <label className={hasClocks ? '' : 'disabled'}>
                  <input type="checkbox" checked={withClocks && hasClocks} disabled={!hasClocks} onChange={(e) => setWithClocks(e.target.checked)} />
                  Include clocks
                </label>
              </div>
              <div className="form-actions">
                <button className="btn primary" onClick={() => download(new Blob([pgn], { type: 'application/x-chess-pgn' }), pgnFileName(headers))}>
                  Download .pgn
                </button>
              </div>
            </>
          )}
          {tab === 'fen' && (
            <div className="copy-field">
              <input className="input mono" readOnly value={currentNode.fen} aria-label="FEN" onFocus={(e) => e.target.select()} />
              <CopyButton text={currentNode.fen} label="Copy FEN" />
            </div>
          )}
          {tab === 'image' && <ImageTab line={line} node={currentNode} headers={headers} orientation={orientation} report={report} boardTheme={boardTheme} />}
          {tab === 'gif' && (
            <GifTab line={line} node={currentNode} headers={headers} orientation={orientation} report={report} boardTheme={boardTheme} endIndex={moveIndex > 0 ? moveIndex : line.length - 1} />
          )}
          {tab === 'embed' && (
            <EmbedTab
              url={token ? embedUrl(token, activeMode === 'move' ? moveIndex : null, location.origin) : ''}
              size={embedSize}
              onSize={setEmbedSize}
              title={`${headers.White || 'White'} vs ${headers.Black || 'Black'} · Rookahead`}
            />
          )}
        </div>
      </div>
    </dialog>
  )
}

/** Iframe code for other sites, with a scaled-down live preview. */
function EmbedTab({ url, size, onSize, title }: { url: string; size: EmbedSize; onSize: (s: EmbedSize) => void; title: string }) {
  const { width, height } = EMBED_SIZES[size]
  const snippet = url ? iframeSnippet(url, size, title) : ''
  const box = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)
  useEffect(() => {
    const el = box.current
    if (!el) return
    const observer = new ResizeObserver(([entry]) => setScale(Math.min(1, entry.contentRect.width / width)))
    observer.observe(el)
    return () => observer.disconnect()
  }, [width])

  return (
    <>
      <div className="segmented" role="radiogroup" aria-label="Size">
        {(Object.keys(EMBED_SIZES) as EmbedSize[]).map((s) => (
          <button key={s} role="radio" aria-checked={s === size} className={s === size ? 'active' : ''} onClick={() => onSize(s)}>
            {EMBED_SIZES[s].label} · {EMBED_SIZES[s].width}×{EMBED_SIZES[s].height}
          </button>
        ))}
      </div>
      <div ref={box} className="embed-preview" style={{ height: height * scale }}>
        {url && <iframe src={url} title={title} width={width} height={height} style={{ transform: `scale(${scale})` }} />}
      </div>
      <div className="copy-area">
        <textarea className="input textarea embed-code" readOnly value={snippet} aria-label="Embed code" spellCheck={false} />
        <CopyButton text={snippet} label="Copy embed code" />
      </div>
    </>
  )
}
