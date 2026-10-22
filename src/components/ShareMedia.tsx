// The Share dialog's Image tab (and, later, GIF): renders frames with the lazily-loaded renderer.
import { useEffect, useRef, useState } from 'react'
import { useBoardPrefs } from '../lib/boardPrefs'
import type { GameReport } from '../lib/classify'
import { download } from '../lib/download'
import type { Color } from '../lib/evaluation'
import { frameFor } from '../lib/frame'
import { planGif, type GifRange, type GifSpeed } from '../lib/gifPlan'
import { pgnFileName } from '../lib/pgn'
import type { BoardTheme, Palette } from '../lib/settings'
import type { MoveNode, PgnHeaders } from '../lib/tree'
import { boardColors } from './Board'

const themeColors = (name: BoardTheme, palette: Palette) => {
  const t = boardColors(name, palette)
  return { light: t.light, dark: t.dark, lastMove: t.lastMove ?? 'rgba(255, 255, 51, 0.42)' }
}

export interface MediaProps {
  line: MoveNode[]
  node: MoveNode
  headers: PgnHeaders
  orientation: Color
  report: GameReport | null
  boardTheme: BoardTheme
}

const IMAGE_WIDTH = 840

export function ImageTab(props: MediaProps) {
  const [png, setPng] = useState<{ blob: Blob; url: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const { palette } = useBoardPrefs()
  // Drawn once per opening of the tab: the dialog is modal, so the position can't change underneath.
  const [spec] = useState(() => frameFor(props.node, { ...props, theme: themeColors(props.boardTheme, palette) }))

  useEffect(() => {
    let live = true
    let url: string | null = null
    void (async () => {
      try {
        const { renderFrame, canvasToPng } = await import('../lib/render')
        const blob = await canvasToPng(await renderFrame(spec, IMAGE_WIDTH))
        url = URL.createObjectURL(blob)
        if (live) setPng({ blob, url })
      } catch (err) {
        if (live) setError(err instanceof Error ? err.message : 'Couldn’t draw the image.')
      }
    })()
    return () => {
      live = false
      if (url) URL.revokeObjectURL(url)
    }
  }, [spec])

  const name = pgnFileName(props.headers).replace(/\.pgn$/, props.node.san ? `_move-${Math.ceil(props.node.ply / 2)}.png` : '.png')
  const canCopy = typeof ClipboardItem !== 'undefined' && Boolean(navigator.clipboard?.write)

  return (
    <>
      <div className="media-preview">{png ? <img src={png.url} alt="Board image" /> : <p className="muted">{error ?? 'Drawing…'}</p>}</div>
      <div className="form-actions media-actions">
        {canCopy && (
          <button
            className="btn ghost"
            disabled={!png}
            onClick={async () => {
              await navigator.clipboard.write([new ClipboardItem({ 'image/png': png!.blob })])
              setCopied(true)
              setTimeout(() => setCopied(false), 2000)
            }}
          >
            {copied ? 'Copied ✓' : 'Copy image'}
          </button>
        )}
        <button className="btn primary" disabled={!png} onClick={() => download(png!.blob, name)}>
          Download PNG
        </button>
      </div>
    </>
  )
}

const GIF_WIDTH = 480

/** The main line as an animated GIF; `endIndex` is the shared move, for "Last 10 moves". */
export function GifTab(props: MediaProps & { endIndex: number }) {
  const { palette } = useBoardPrefs()
  const [speed, setSpeed] = useState<GifSpeed>('normal')
  const [range, setRange] = useState<GifRange>('game')
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [gif, setGif] = useState<{ blob: Blob; url: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const live = useRef(true)

  useEffect(() => {
    live.current = true
    return () => {
      live.current = false
    }
  }, [])
  useEffect(() => () => {
    if (gif) URL.revokeObjectURL(gif.url)
  }, [gif])

  const make = async () => {
    setGif(null)
    setError(null)
    setProgress({ done: 0, total: 1 })
    try {
      const { line, report } = props
      const theme = themeColors(props.boardTheme, palette)
      // Every reviewed move gets its badge, as on the board.
      const reviewed = line.map((n) => Boolean(report?.moves[n.id]))
      const plan = planGif(line.length, { speed, range, endIndex: props.endIndex, badged: reviewed })
      const frames = plan.map((f) => ({ spec: frameFor(line[f.nodeIndex], { ...props, theme }, () => f.badge), delayMs: f.delayMs }))
      const { makeGif } = await import('../lib/gif')
      const blob = await makeGif(frames, GIF_WIDTH, (done, total) => live.current && setProgress({ done, total }))
      if (live.current) setGif({ blob, url: URL.createObjectURL(blob) })
    } catch (err) {
      if (live.current) setError(err instanceof Error ? err.message : 'Couldn’t make the GIF.')
    } finally {
      if (live.current) setProgress(null)
    }
  }

  const busy = progress !== null
  const option = <T extends string>(value: T, current: T, set: (v: T) => void, label: string) => (
    <button
      role="radio"
      aria-checked={value === current}
      className={value === current ? 'active' : ''}
      disabled={busy}
      onClick={() => {
        set(value)
        setGif(null)
      }}
    >
      {label}
    </button>
  )
  const name = pgnFileName(props.headers).replace(/\.pgn$/, '.gif')

  return (
    <>
      <div className="gif-options">
        <div className="segmented" role="radiogroup" aria-label="Speed">
          {option<GifSpeed>('slow', speed, setSpeed, 'Slow')}
          {option<GifSpeed>('normal', speed, setSpeed, 'Normal')}
          {option<GifSpeed>('fast', speed, setSpeed, 'Fast')}
        </div>
        <div className="segmented" role="radiogroup" aria-label="Moves">
          {option<GifRange>('game', range, setRange, 'Whole game')}
          {option<GifRange>('last10', range, setRange, 'Last 10 moves')}
        </div>
      </div>
      <div className="media-preview">
        {gif ? (
          <img src={gif.url} alt="Game animation" />
        ) : busy ? (
          <div className="gif-progress">
            <div className="progress">
              <div className="progress-fill" style={{ width: `${Math.round((progress.done / progress.total) * 100)}%` }} />
            </div>
            <span className="muted small">
              Frame {progress.done} of {progress.total}
            </span>
          </div>
        ) : (
          <p className="muted">
            {error ?? (props.report ? 'An animated replay with Rookahead’s verdict on every move.' : 'An animated replay. Review the game first to add Rookahead’s verdicts.')}
          </p>
        )}
      </div>
      <div className="form-actions media-actions">
        {gif && <span className="muted small gif-size">{(gif.blob.size / 1024 / 1024).toFixed(1)} MB</span>}
        <button className="btn ghost" disabled={busy || props.line.length < 2} onClick={() => void make()}>
          {gif ? 'Make again' : 'Make GIF'}
        </button>
        <button className="btn primary" disabled={!gif} onClick={() => download(gif!.blob, name)}>
          Download GIF
        </button>
      </div>
    </>
  )
}
