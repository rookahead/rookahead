import type { DrawShape } from '@lichess-org/chessground/draw'
import type { Key } from '@lichess-org/chessground/types'
import { DEFAULT_POSITION } from 'chess.js'
import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react'
import { Board } from './components/Board'
import { ClassIcon } from './components/ClassIcon'
import { CoachCard } from './components/CoachCard'
import { EngineLines } from './components/EngineLines'
import { EvalBar } from './components/EvalBar'
import { EvalGraph } from './components/EvalGraph'
import { GameInfo } from './components/GameInfo'
import { KeyMoments } from './components/KeyMoments'
import { LoadGameDialog, type LoadRequest } from './components/LoadGameDialog'
import { MoveList } from './components/MoveList'
import { PlayerBar } from './components/PlayerBar'
import { ReviewSummary } from './components/ReviewSummary'
import { San } from './components/San'
import { SettingsPanel } from './components/SettingsPanel'
import { TopNav } from './components/TopNav'
import type { AnalysisResult } from './engine/Engine'
import { terminalState, useGameReview, useLiveAnalysis, type PositionEval } from './hooks/useAnalysis'
import { useEngine } from './hooks/useEngine'
import { useMediaQuery } from './hooks/useMediaQuery'
import { useMoveSounds } from './hooks/useMoveSounds'
import { openingFromEcoUrl } from './lib/chesscom'
import { classifyGame } from './lib/classify'
import { gameSummary, moveDetail, moveHeadline } from './lib/commentary'
import type { Color } from './lib/evaluation'
import { materialState } from './lib/material'
import { loadOpeningBook, openingOf, type OpeningBook } from './lib/openings'
import { useSettings } from './lib/settings'
import {
  addLine,
  addMove,
  createTree,
  deleteNode,
  isMainline,
  mainline,
  mainlineToPgn,
  moveNumberLabel,
  pathTo,
  promoteVariation,
  pvToSan,
  ROOT_ID,
  treeFromPgn,
  type GameTree,
  type MoveInput,
  type PgnHeaders,
} from './lib/tree'

interface Game {
  tree: GameTree
  headers: PgnHeaders
}

type Tab = 'review' | 'analysis'

/** Live scores shallower than this don't move the eval bar (a few ms at most with SF19). */
const BAR_MIN_DEPTH = 12

const SESSION_KEY = 'rookahead.session.v1'

interface Session {
  pgn: string
  orientation: Color
  currentPly: number
  evals: Record<string, PositionEval>
}

function restoreSession(): { game: Game; orientation: Color; currentId: string; evals: Record<string, PositionEval> } | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const s = JSON.parse(raw) as Session
    const { tree, headers } = treeFromPgn(s.pgn)
    const line = mainline(tree)
    const current = line[Math.min(s.currentPly, line.length - 1)]
    return { game: { tree, headers }, orientation: s.orientation, currentId: current.id, evals: s.evals ?? {} }
  } catch {
    return null
  }
}

const Icon = {
  first: <path d="M6 5h2v14H6zM20 5v14l-10-7z" />,
  prev: <path d="M15.4 5.4 9 12l6.4 6.6-1.4 1.4L6.2 12 14 4z" />,
  next: <path d="m8.6 18.6 6.4-6.6-6.4-6.6L10 4l7.8 8-7.8 8z" />,
  last: <path d="M16 5h2v14h-2zM4 5v14l10-7z" />,
  play: <path d="M7 4.5v15l12.5-7.5z" />,
  pause: <path d="M6.5 5h4v14h-4zm7 0h4v14h-4z" />,
  flip: <path d="M7 3 3 7l4 4V8h11V6H7zm10 10v3H6v2h11v3l4-4z" />,
  back: <path d="M20 11H7.8l5.6-5.6L12 4l-8 8 8 8 1.4-1.4L7.8 13H20z" />,
}

const Svg = ({ children }: { children: React.ReactNode }) => (
  <svg viewBox="0 0 24 24" aria-hidden>
    {children}
  </svg>
)

export default function App() {
  const [settings, updateSettings] = useSettings()
  const { engine, status } = useEngine(settings.engine)
  const ready = status?.state === 'ready'

  const [restored] = useState(restoreSession)
  const [game, setGame] = useState<Game>(() => restored?.game ?? { tree: createTree(), headers: {} })
  const [currentId, setCurrentId] = useState(() => restored?.currentId ?? ROOT_ID)
  const [orientation, setOrientation] = useState<Color>(() => restored?.orientation ?? 'white')
  const [engineOn, setEngineOn] = useState(true)
  const [loadOpen, setLoadOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [pendingReview, setPendingReview] = useState(false)
  const [tab, setTab] = useState<Tab>(() => (restored && Object.keys(restored.evals).length ? 'review' : 'analysis'))
  const [stepping, setStepping] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [book, setBook] = useState<OpeningBook | null>(null)
  const systemLight = useMediaQuery('(prefers-color-scheme: light)')
  const theme = settings.appearance === 'system' ? (systemLight ? 'light' : 'dark') : settings.appearance
  // Layout effect, so the first paint already has the right colours.
  useLayoutEffect(() => {
    document.documentElement.dataset.theme = theme
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'light' ? '#f7f7f8' : '#0b0b0c')
  }, [theme])

  useEffect(() => {
    void loadOpeningBook().then(setBook, () => {})
  }, [])

  const { tree, headers } = game
  const node = tree.nodes[currentId] ?? tree.nodes[ROOT_ID]
  const line = useMemo(() => mainline(tree), [tree])
  const path = useMemo(() => pathTo(tree, node.id), [tree, node.id])
  const terminal = useMemo(() => terminalState(node.fen), [node.fen])

  const { review, startReview, cancelReview, resetReview, hydrateReview } = useGameReview({
    engine,
    ready,
    depth: settings.reviewDepth,
    strength: settings.engine,
  })
  const reviewing = review.status === 'running'

  useEffect(() => {
    if (restored && Object.keys(restored.evals).length) hydrateReview(restored.evals)
  }, [restored, hydrateReview])

  const report = useMemo(
    () => (Object.keys(review.evals).length ? classifyGame(line, review.evals, book?.isBook) : null),
    [line, review.evals, book],
  )
  const currentReview = report?.moves[node.id]

  const live = useLiveAnalysis({
    engine,
    ready,
    fen: node.fen,
    enabled: engineOn,
    multiPv: settings.lines,
    depth: settings.liveDepth,
    paused: reviewing,
  })

  // During a review, fall back to the review's verdict for positions it has reached.
  const reviewEval = review.evals[node.fen]
  const shown: AnalysisResult | null = useMemo(() => {
    if (live.result?.lines.length) return live.result
    if (!reviewEval) return null
    return {
      fen: node.fen,
      depth: reviewEval.depth,
      bestMove: reviewEval.bestMove,
      lines: reviewEval.pv.length ? [{ multipv: 1, depth: reviewEval.depth, score: reviewEval.score, pv: reviewEval.pv }] : [],
    }
  }, [live.result, reviewEval, node.fen])

  const score = terminal?.score ?? shown?.lines[0]?.score ?? reviewEval?.score ?? null
  // The eval bar ignores the engine's first few plies, which swing wildly before settling.
  const liveTop = live.result?.lines[0]
  const barScore = terminal?.score ?? (liveTop && liveTop.depth >= BAR_MIN_DEPTH ? liveTop.score : null) ?? reviewEval?.score ?? null
  const steppingThrough = tab === 'review' && stepping && review.status === 'done'

  const shapes = useMemo<DrawShape[]>(() => {
    // While stepping through a review, show only "this was better" for the move just played.
    if (steppingThrough) {
      const best = currentReview?.bestMove
      if (!best || !currentReview || ['best', 'book', 'brilliant', 'great', 'forced'].includes(currentReview.cls)) return []
      return [{ orig: best.slice(0, 2) as Key, dest: best.slice(2, 4) as Key, brush: 'suggest' }]
    }
    if (!settings.showArrows || !engineOn || !shown || terminal) return []
    const seen = new Set<string>()
    const out: DrawShape[] = []
    shown.lines.slice(0, Math.min(settings.lines, 3)).forEach((l, i) => {
      const uci = l.pv[0]
      if (!uci || seen.has(uci.slice(0, 4))) return
      seen.add(uci.slice(0, 4))
      out.push({ orig: uci.slice(0, 2) as Key, dest: uci.slice(2, 4) as Key, brush: i === 0 ? 'best' : 'alt' })
    })
    return out
  }, [steppingThrough, currentReview, settings.showArrows, settings.lines, engineOn, shown, terminal])

  // Persist the session so a refresh doesn't lose the game.
  useEffect(() => {
    try {
      const session: Session = {
        pgn: mainlineToPgn(tree, headers),
        orientation,
        currentPly: isMainline(tree, node.id) ? node.ply - line[0].ply : 0,
        evals: review.evals,
      }
      localStorage.setItem(SESSION_KEY, JSON.stringify(session))
    } catch {
      // Storage full or unavailable — not fatal.
    }
  }, [tree, headers, orientation, node, line, review.evals])

  const runReview = useCallback(() => {
    setTab('review')
    setStepping(false)
    void startReview(line)
  }, [startReview, line])

  // Kick off a queued review once the engine is up.
  useEffect(() => {
    if (pendingReview && ready && line.length > 1) {
      setPendingReview(false)
      runReview()
    }
  }, [pendingReview, ready, line, runReview])

  const playMove = useCallback(
    (move: MoveInput) => {
      const next = addMove(tree, node.id, move)
      if (!next) return
      setGame((g) => ({ ...g, tree: next.tree }))
      setCurrentId(next.nodeId)
    },
    [tree, node.id],
  )

  const playLineFrom = useCallback(
    (fromId: string, pv: string[]) => {
      const next = addLine(tree, fromId, pv)
      setGame((g) => ({ ...g, tree: next.tree }))
      setCurrentId(next.nodeId)
    },
    [tree],
  )

  const playLine = useCallback((pv: string[], count: number) => playLineFrom(node.id, pv.slice(0, count)), [playLineFrom, node.id])

  const loadGame = useCallback(
    (req: LoadRequest): string | null => {
      try {
        let next: Game
        if (req.kind === 'pgn') {
          const imported = treeFromPgn(req.pgn)
          next = { tree: imported.tree, headers: imported.headers }
        } else {
          next = { tree: createTree(req.fen), headers: req.fen === DEFAULT_POSITION ? {} : { SetUp: '1', FEN: req.fen } }
        }
        resetReview()
        setGame(next)
        setCurrentId(ROOT_ID)
        setStepping(false)
        setPlaying(false)
        if (req.kind === 'pgn') {
          setOrientation(req.orientation ?? 'white')
          if (settings.autoReview && mainline(next.tree).length > 1) {
            setTab('review')
            setPendingReview(true)
          }
        } else {
          setTab('analysis')
          setOrientation(req.fen.split(' ')[1] === 'b' ? 'black' : 'white')
        }
        return null
      } catch (err) {
        return err instanceof Error ? err.message.replace(/^Invalid PGN: /, 'Couldn’t read that PGN: ') : 'Couldn’t read that game.'
      }
    },
    [resetReview, settings.autoReview],
  )

  const newBoard = () => {
    resetReview()
    setGame({ tree: createTree(), headers: {} })
    setCurrentId(ROOT_ID)
    setTab('analysis')
    setStepping(false)
  }

  const goto = useCallback((id: string | null | undefined) => id && setCurrentId(id), [])
  const goPrev = useCallback(() => goto(node.parentId), [goto, node.parentId])
  const goNext = useCallback(() => goto(node.children[0]), [goto, node.children])
  const goStart = useCallback(() => goto(ROOT_ID), [goto])
  const goEnd = useCallback(() => {
    let n = node
    while (n.children.length) n = tree.nodes[n.children[0]]
    goto(n.id)
  }, [goto, node, tree])
  const flip = useCallback(() => setOrientation((o) => (o === 'white' ? 'black' : 'white')), [])

  // Autoplay steps forward until the end of the line.
  useEffect(() => {
    if (!playing) return
    if (!node.children.length) {
      setPlaying(false)
      return
    }
    const timer = setTimeout(() => setCurrentId(node.children[0]), 1100)
    return () => clearTimeout(timer)
  }, [playing, node])

  // Keyboard navigation.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (target.closest('input, textarea, select, dialog[open]') || e.metaKey || e.ctrlKey || e.altKey) return
      const actions: Record<string, () => void> = {
        ArrowLeft: goPrev,
        ArrowRight: goNext,
        ArrowUp: goStart,
        Home: goStart,
        ArrowDown: goEnd,
        End: goEnd,
        f: flip,
        l: () => setEngineOn((on) => !on),
        ' ': () => setPlaying((p) => !p),
      }
      const action = actions[e.key]
      if (action) {
        e.preventDefault()
        if (e.key !== ' ') setPlaying(false)
        action()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [goPrev, goNext, goStart, goEnd, flip])

  const material = useMemo(() => materialState(node.fen), [node.fen])
  const turn: Color = node.fen.split(' ')[1] === 'b' ? 'black' : 'white'
  const result = headers.Result && headers.Result !== '*' ? headers.Result : undefined
  const gameOver = Boolean(terminal) || Boolean(result && !node.children.length && isMainline(tree, node.id))
  useMoveSounds(tree, node, settings.soundVolume, gameOver)
  const resultFor = (c: Color) => (result && node.children.length === 0 && isMainline(tree, node.id) ? (c === 'white' ? result.split('-')[0] : result.split('-')[1]) : undefined)
  const player = (c: Color) => (
    <PlayerBar
      color={c}
      name={headers[c === 'white' ? 'White' : 'Black'] || (c === 'white' ? 'White' : 'Black')}
      rating={headers[c === 'white' ? 'WhiteElo' : 'BlackElo']}
      result={resultFor(c)?.replace('1/2', '½')}
      captured={material.captured[c]}
      advantage={material.advantage[c]}
    />
  )

  const opening = useMemo(() => (book ? openingOf(book, path) : undefined), [book, path])
  const gameOpening = useMemo(() => (book ? openingOf(book, line) : undefined), [book, line])
  const hasGame = Boolean(headers.White || headers.Black)
  const currentIndex = isMainline(tree, node.id) ? node.ply - line[0].ply : null
  const inVariation = !isMainline(tree, node.id)
  const lastMove = node.from && node.to ? ([node.from, node.to] as [typeof node.from, typeof node.to]) : undefined
  const summaryText = useMemo(() => (report ? gameSummary(report, tree, headers) : ''), [report, tree, headers])

  // The game's opening for a loaded game (our book names first: they're the best formatted);
  // on a fresh board, wherever the moves have got to.
  const pgnOpening = openingFromEcoUrl(headers.ECOUrl) ?? headers.Opening
  const infoOpening = hasGame
    ? gameOpening ?? (pgnOpening ? { name: pgnOpening } : undefined)
    : opening ?? { name: tree.nodes[ROOT_ID].fen === DEFAULT_POSITION ? 'Starting position' : 'Custom position' }

  // ── Review tab content ──
  const stepCoach = () => {
    const parent = node.parentId ? tree.nodes[node.parentId] : null
    if (!parent || !node.san) {
      return <CoachCard key={node.id} title="Let’s go through the game" detail="Step through with Next or the arrow keys. Every move gets a verdict." />
    }
    if (!currentReview) {
      return (
        <CoachCard
          key={node.id}
          kicker={moveNumberLabel(node.ply)}
          title={<San san={node.san} />}
          detail={inVariation ? 'You’re exploring a side line. The Analysis tab has the live engine.' : 'Not reviewed yet.'}
          score={score}
        />
      )
    }
    const bestSan = currentReview.bestMove ? pvToSan(parent.fen, [currentReview.bestMove])[0] : undefined
    return (
      <CoachCard
        key={node.id}
        icon={<ClassIcon cls={currentReview.cls} size={26} />}
        kicker={moveNumberLabel(node.ply)}
        title={moveHeadline(node.san, currentReview)}
        detail={moveDetail(currentReview, bestSan)}
        score={currentReview.score}
      >
        {currentReview.bestMove && !['best', 'book', 'brilliant', 'great', 'forced'].includes(currentReview.cls) && (
          <button className="btn ghost" onClick={() => playLineFrom(parent.id, [currentReview.bestMove!])}>
            Show {bestSan ?? 'best'}
          </button>
        )}
        <button className="btn primary" onClick={goNext} disabled={!node.children.length}>
          Next move
          <Svg>{Icon.next}</Svg>
        </button>
      </CoachCard>
    )
  }

  let reviewBody: React.ReactNode
  if (review.status === 'running') {
    const pct = Math.round((review.progress / Math.max(review.total, 1)) * 100)
    reviewBody = (
      <>
        <CoachCard title="Reviewing the game…" detail={`Stockfish is checking every move at depth ${settings.reviewDepth}.`}>
          <div className="review-progress">
            <div className="progress">
              <div className="progress-fill" style={{ width: `${pct}%` }} />
            </div>
            <span className="muted small">
              {review.progress} of {review.total} positions
            </span>
            <button className="btn ghost small" onClick={cancelReview}>
              Cancel
            </button>
          </div>
        </CoachCard>
        <EvalGraph line={line} evals={review.evals} currentIndex={currentIndex} onSelect={setCurrentId} report={report} height={104} />
        <MoveList tree={tree} currentId={node.id} onSelect={setCurrentId} result={result} report={report} />
      </>
    )
  } else if (review.status === 'done' && report) {
    reviewBody = stepping ? (
      <>
        {stepCoach()}
        <EvalGraph line={line} evals={review.evals} currentIndex={currentIndex} onSelect={setCurrentId} report={report} height={96} />
        <MoveList tree={tree} currentId={node.id} onSelect={setCurrentId} result={result} report={report} />
      </>
    ) : (
      <>
        <EvalGraph line={line} evals={review.evals} currentIndex={currentIndex} onSelect={setCurrentId} report={report} height={96} />
        <ReviewSummary report={report} headers={headers} />
        <div className="summary-cta">
          <button
            className="btn primary big"
            onClick={() => {
              setStepping(true)
              if (!node.parentId && line[1]) setCurrentId(line[1].id)
            }}
          >
            Start review
          </button>
        </div>
      </>
    )
  } else {
    reviewBody = (
      <CoachCard
        title={line.length > 1 ? 'Ready when you are' : 'Nothing to review yet'}
        detail={
          line.length > 1
            ? `Stockfish 19 will grade every move — brilliant to blunder — and work out each side’s accuracy.`
            : 'Load a game or play some moves on the board first.'
        }
      >
        <button className="btn primary" disabled={!ready || line.length < 2} onClick={runReview}>
          Review game
        </button>
      </CoachCard>
    )
  }

  return (
    <div className="app">
      <TopNav
        onAnalysis={newBoard}
        onNewBoard={newBoard}
        onLoad={() => setLoadOpen(true)}
        settingsOpen={settingsOpen}
        onToggleSettings={() => setSettingsOpen((o) => !o)}
        settings={
          settingsOpen && (
            <SettingsPanel
              settings={settings}
              status={status}
              onChange={updateSettings}
              onClose={() => setSettingsOpen(false)}
              crossOriginIsolated={typeof crossOriginIsolated !== 'undefined' && crossOriginIsolated}
            />
          )
        }
      />

      <main className="layout">
        <section className="board-column">
          {player(orientation === 'white' ? 'black' : 'white')}
          <div className="board-row">
            <EvalBar score={barScore} orientation={orientation} active={engineOn || Boolean(reviewEval)} />
            <Board
              fen={node.fen}
              orientation={orientation}
              lastMove={lastMove}
              shapes={shapes}
              theme={settings.boardTheme}
              coordinates={settings.coordinates}
              onMove={playMove}
              annotation={currentReview?.cls}
            />
          </div>
          {player(orientation)}
        </section>

        {/* Wide screens: the info card goes left of the board, the panel right. Narrower: both stack on the right. */}
        <div className="side-stack">
          <aside className="info-card" aria-label="Game">
            <GameInfo
              headers={headers}
              hasGame={hasGame}
              opening={infoOpening}
              positionNote={terminal ? terminal.label : `${turn === 'white' ? 'White' : 'Black'} to move`}
            />
            {hasGame && opening && opening.name !== infoOpening?.name && (
              <section className="info-section position-opening" aria-label="Opening at this move">
                <span className="section-label">At this move</span>
                <span className="position-opening-name">
                  <span className="gi-eco">{opening.eco}</span> {opening.name}
                </span>
              </section>
            )}
            {review.status === 'done' && report ? (
              <KeyMoments
                report={report}
                tree={tree}
                currentId={node.id}
                intro={summaryText}
                onSelect={(id) => {
                  setTab('review')
                  setStepping(true)
                  setCurrentId(id)
                }}
              />
            ) : !hasGame && line.length < 2 ? (
              <section className="info-section info-empty">
                <p>Load a game from Chess.com or paste a PGN, and its review shows up here.</p>
                <button className="btn ghost small" onClick={() => setLoadOpen(true)}>
                  Load game
                </button>
              </section>
            ) : hasGame && review.status !== 'running' ? (
              <section className="info-section info-empty">
                <p>Review the game to find its key moments.</p>
              </section>
            ) : null}
          </aside>

          <aside className="panel">
            <div className="panel-card">
              <header className="panel-header">
                {steppingThrough && (
                  <button className="icon-btn" onClick={() => setStepping(false)} aria-label="Back to summary" title="Back to summary">
                    <Svg>{Icon.back}</Svg>
                  </button>
                )}
                <div className="panel-tabs" role="tablist">
                  <button role="tab" aria-selected={tab === 'review'} className={tab === 'review' ? 'active' : ''} onClick={() => setTab('review')}>
                    Review
                  </button>
                  <button role="tab" aria-selected={tab === 'analysis'} className={tab === 'analysis' ? 'active' : ''} onClick={() => setTab('analysis')}>
                    Analysis
                  </button>
                </div>
              </header>

              <div className={`panel-body ${tab}`}>
                {tab === 'analysis' ? (
                  <>
                    <EngineLines
                      fen={node.fen}
                      status={status}
                      enabled={engineOn}
                      onToggle={() => setEngineOn((on) => !on)}
                      result={engineOn ? shown : null}
                      searching={live.searching}
                      maxLines={settings.lines}
                      terminal={terminal}
                      reviewing={reviewing}
                      onPlayLine={playLine}
                    />
                    <MoveList tree={tree} currentId={node.id} onSelect={setCurrentId} result={result} report={report} />
                    {inVariation && (
                      <div className="variation-actions">
                        <span className="muted small">Side line</span>
                        <button className="btn ghost small" onClick={() => setGame((g) => ({ ...g, tree: promoteVariation(g.tree, node.id) }))}>
                          Promote
                        </button>
                        <button
                          className="btn ghost small danger"
                          onClick={() => {
                            const parent = node.parentId!
                            setGame((g) => ({ ...g, tree: deleteNode(g.tree, node.id) }))
                            setCurrentId(parent)
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    )}
                  </>
                ) : (
                  reviewBody
                )}
              </div>

              <nav className="panel-nav" aria-label="Move navigation">
                <button className="ctrl" onClick={goStart} disabled={!node.parentId} aria-label="First move" title="First move (↑)">
                  <Svg>{Icon.first}</Svg>
                </button>
                <button className="ctrl" onClick={goPrev} disabled={!node.parentId} aria-label="Previous move" title="Previous move (←)">
                  <Svg>{Icon.prev}</Svg>
                </button>
                <button
                  className={`ctrl ${playing ? 'active' : ''}`}
                  onClick={() => setPlaying((p) => !p)}
                  disabled={!playing && !node.children.length}
                  aria-label={playing ? 'Pause' : 'Play'}
                  title="Play through (Space)"
                >
                  <Svg>{playing ? Icon.pause : Icon.play}</Svg>
                </button>
                <button className="ctrl" onClick={goNext} disabled={!node.children.length} aria-label="Next move" title="Next move (→)">
                  <Svg>{Icon.next}</Svg>
                </button>
                <button className="ctrl" onClick={goEnd} disabled={!node.children.length} aria-label="Last move" title="Last move (↓)">
                  <Svg>{Icon.last}</Svg>
                </button>
                <button className="ctrl flip" onClick={flip} aria-label="Flip board" title="Flip board (F)">
                  <Svg>{Icon.flip}</Svg>
                </button>
              </nav>
            </div>
          </aside>
        </div>
      </main>

      <LoadGameDialog
        open={loadOpen}
        onClose={() => setLoadOpen(false)}
        onLoad={loadGame}
        chesscomUser={settings.chesscomUser}
        onChesscomUser={(chesscomUser) => updateSettings({ chesscomUser })}
      />
    </div>
  )
}
