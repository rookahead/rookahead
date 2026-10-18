// A shared game for other websites' iframes: board, players, moves and verdicts. No engine.
import { useEffect, useMemo, useState } from 'react'
import { Board } from '../components/Board'
import { MoveList } from '../components/MoveList'
import { PlayerBar } from '../components/PlayerBar'
import { classifyGame, withClasses } from '../lib/classify'
import type { Color } from '../lib/evaluation'
import { materialState } from '../lib/material'
import { clampPly, decodeShare, fromSharedGame, parseEmbedHash, shareUrl, type ShareError } from '../lib/share'
import { mainline } from '../lib/tree'

type Loaded = { token: string; game: ReturnType<typeof fromSharedGame> } | { error: ShareError } | null

const ERRORS: Record<ShareError, string> = {
  damaged: 'This game link is incomplete or damaged.',
  'newer-version': 'Refresh to open this game.',
}

const ICONS = {
  first: <path d="M6 5h2v14H6zM20 5v14l-10-7z" />,
  prev: <path d="M15.4 5.4 9 12l6.4 6.6-1.4 1.4L6.2 12 14 4z" />,
  next: <path d="m8.6 18.6 6.4-6.6-6.4-6.6L10 4l7.8 8-7.8 8z" />,
  last: <path d="M16 5h2v14h-2zM4 5v14l10-7z" />,
}

export function EmbedApp() {
  const [link] = useState(() => parseEmbedHash(location.pathname, location.hash))
  const [loaded, setLoaded] = useState<Loaded>(null)
  const [index, setIndex] = useState(0)

  useEffect(() => {
    if (!link) return
    void decodeShare(link.token).then((shared) => {
      if ('error' in shared) return setLoaded({ error: shared.error })
      const game = fromSharedGame(shared)
      setLoaded({ token: link.token, game })
      setIndex(clampPly(link.ply, mainline(game.tree).length) ?? 0)
    })
  }, [link])

  const game = loaded && 'game' in loaded ? loaded.game : null
  const line = useMemo(() => (game ? mainline(game.tree) : []), [game])
  const report = useMemo(() => (game?.classes ? withClasses(classifyGame(line, game.evals), game.classes) : null), [game, line])
  const last = Math.max(0, line.length - 1)
  const go = (i: number) => setIndex(Math.max(0, Math.min(last, i)))

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const keys: Record<string, number> = { ArrowLeft: index - 1, ArrowRight: index + 1, ArrowUp: 0, Home: 0, ArrowDown: last, End: last }
      if (e.key in keys) {
        e.preventDefault()
        setIndex(Math.max(0, Math.min(last, keys[e.key])))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [index, last])

  if (!link) return <p className="embed-message">No game to show.</p>
  if (!loaded) return null
  if ('error' in loaded) return <p className="embed-message">{ERRORS[loaded.error]}</p>

  const { headers, orientation } = loaded.game
  const node = line[index]
  const material = materialState(node.fen)
  const result = headers.Result && headers.Result !== '*' ? headers.Result : undefined
  const atEnd = index === last
  const player = (c: Color) => (
    <PlayerBar
      color={c}
      name={headers[c === 'white' ? 'White' : 'Black'] || (c === 'white' ? 'White' : 'Black')}
      rating={headers[c === 'white' ? 'WhiteElo' : 'BlackElo']}
      result={result && atEnd ? (c === 'white' ? result.split('-')[0] : result.split('-')[1]).replace('1/2', '½') : undefined}
      captured={material.captured[c]}
      advantage={material.advantage[c]}
    />
  )
  const nav = (
    <nav className="embed-nav" aria-label="Move navigation">
      {(
        [
          ['first', 0, 'First move'],
          ['prev', index - 1, 'Previous move'],
          ['next', index + 1, 'Next move'],
          ['last', last, 'Last move'],
        ] as const
      ).map(([icon, target, label]) => (
        <button key={icon} className="ctrl" onClick={() => go(target)} disabled={target === index || target < 0 || target > last} aria-label={label} title={label}>
          <svg viewBox="0 0 24 24" aria-hidden>
            {ICONS[icon]}
          </svg>
        </button>
      ))}
    </nav>
  )

  return (
    <div className="embed">
      <section className="embed-board">
        {player(orientation === 'white' ? 'black' : 'white')}
        <Board
          fen={node.fen}
          orientation={orientation}
          lastMove={node.from && node.to ? [node.from, node.to] : undefined}
          shapes={[]}
          theme="graphite"
          coordinates
          onMove={() => {}}
          annotation={report?.moves[node.id]?.cls}
          viewOnly
        />
        {player(orientation)}
      </section>
      <aside className="embed-side">
        <MoveList tree={loaded.game.tree} currentId={node.id} onSelect={(id) => go(line.findIndex((n) => n.id === id))} result={result} report={report} />
        {nav}
        <a className="embed-open" href={shareUrl(loaded.token, index || null, 'https://rookahead.com')} target="_blank" rel="noopener">
          <img src="/favicon.svg" alt="" />
          Open full review on Rookahead ↗
        </a>
      </aside>
    </div>
  )
}
