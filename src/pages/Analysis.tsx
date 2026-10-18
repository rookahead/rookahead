import type { DrawShape } from '@lichess-org/chessground/draw'
import type { Key } from '@lichess-org/chessground/types'
import { DEFAULT_POSITION } from 'chess.js'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Board } from '../components/Board'
import { ClassIcon } from '../components/ClassIcon'
import { NavIcon } from '../components/NavIcons'
import { CoachCard } from '../components/CoachCard'
import { EngineLines } from '../components/EngineLines'
import { EvalBar } from '../components/EvalBar'
import { EvalGraph } from '../components/EvalGraph'
import { GameInfo } from '../components/GameInfo'
import { KeyMoments } from '../components/KeyMoments'
import { LoadGameDialog, type LoadRequest } from '../components/LoadGameDialog'
import { MoveList } from '../components/MoveList'
import { PlayerBar } from '../components/PlayerBar'
import { ReviewSummary } from '../components/ReviewSummary'
import { San } from '../components/San'
import { SponsorCard } from '../components/SponsorCard'
import { ShareBanner } from '../components/ShareBanner'
import { ShareDialog, ShareIcon } from '../components/ShareDialog'
import { PageHeader } from '../components/PageHeader'
import type { AnalysisResult, EngineStatus, StockfishEngine } from '../engine/Engine'
import { terminalState, useGameReview, useLiveAnalysis, type PositionEval } from '../hooks/useAnalysis'
import { useMoveSounds } from '../hooks/useMoveSounds'
import { openingFromEcoUrl } from '../lib/chesscom'
import { classifyGame, withClasses, type MoveClass } from '../lib/classify'
import { gameSummary, moveDetail, moveHeadline } from '../lib/commentary'
import type { Color } from '../lib/evaluation'
import { materialState } from '../lib/material'
import { loadOpeningBook, openingOf, type OpeningBook } from '../lib/openings'
import { gameKey, saveReview } from '../lib/reviewCache'
import { clearLoadRequest, loadDialogRequested, readSession, writeSession, type Session } from '../lib/session'
import type { Settings } from '../lib/settings'
import { clampPly, decodeShare, encodeShare, fromSharedGame, parseShareHash, toSharedGame, type ShareError } from '../lib/share'
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
} from '../lib/tree'

interface Game {
  tree: GameTree
  headers: PgnHeaders
}

type Tab = 'review' | 'analysis'

/** Live scores shallower than this don't move the eval bar (a few ms at most with SF19). */
const BAR_MIN_DEPTH = 12

function restoreSession(): {
  game: Game
  orientation: Color
  currentId: string
  evals: Record<string, PositionEval>
  classes: Record<string, MoveClass> | null
  review: boolean
} | null {
  // A share link replaces the saved game, so don't flash the old one first.
  if (parseShareHash(location.pathname, location.hash)) return null
  try {
    const s = readSession()
    if (!s) return null
    const { tree, headers } = treeFromPgn(s.pgn)
    const line = mainline(tree)
    const current = line[Math.min(s.currentPly, line.length - 1)]
    let classes: Record<string, MoveClass> | null = null
    if (s.classes) {
      classes = {}
      line.slice(1).forEach((node, i) => {
        const cls = s.classes![i]
        if (cls) classes![node.id] = cls
      })
    }
    return { game: { tree, headers }, orientation: s.orientation, currentId: current.id, evals: s.evals ?? {}, classes, review: Boolean(s.review) }
  } catch {
    return null
  }
}

interface Props {
  settings: Settings
  updateSettings: (patch: Partial<Settings>) => void
  engine: StockfishEngine | null
  status: EngineStatus | null
  /** False while another page is showing: the engine pauses and the keyboard is left alone. */
  active: boolean
  /** The phone header's avatar button, from the shell. */
  avatar?: ReactNode
}

export function AnalysisPage({ settings, updateSettings, engine, status, active, avatar }: Props) {
  const ready = status?.state === 'ready'

  const [restored] = useState(restoreSession)
  const [game, setGame] = useState<Game>(() => restored?.game ?? { tree: createTree(), headers: {} })
  const [currentId, setCurrentId] = useState(() => restored?.currentId ?? ROOT_ID)
  const [orientation, setOrientation] = useState<Color>(() => restored?.orientation ?? 'white')
  const [engineOn, setEngineOn] = useState(true)
  const [loadOpen, setLoadOpen] = useState(loadDialogRequested)
  useEffect(clearLoadRequest, [])
  // A game picked on the home page arrives with `review` set: review it as soon as the engine is up.
  const [pendingReview, setPendingReview] = useState(() => restored?.review ?? false)
  const [tab, setTab] = useState<Tab>(() => (restored && (Object.keys(restored.evals).length || restored.review) ? 'review' : 'analysis'))
  const [stepping, setStepping] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [book, setBook] = useState<OpeningBook | null>(null)
  const [sharedClasses, setSharedClasses] = useState<Record<string, MoveClass> | null>(() => restored?.classes ?? null)
  const [banner, setBanner] = useState<'shared' | ShareError | null>(null)
  const [shareLink] = useState(() => parseShareHash(location.pathname, location.hash))
  const [shareOpen, setShareOpen] = useState(false)

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
    () => {
      if (!Object.keys(review.evals).length) return null
      const classified = classifyGame(line, review.evals, book?.isBook)
      return sharedClasses ? withClasses(classified, sharedClasses) : classified
    },
    [line, review.evals, book, sharedClasses],
  )
  const currentReview = report?.moves[node.id]

  const live = useLiveAnalysis({
    engine,
    ready,
    fen: node.fen,
    enabled: engineOn,
    multiPv: settings.lines,
    depth: settings.liveDepth,
    // Dialogs pause the live engine: it frees the CPU for their animations and they don't need it.
    paused: reviewing || loadOpen || shareOpen || !active,
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
    const session: Session = {
      pgn: mainlineToPgn(tree, headers),
      orientation,
      currentPly: isMainline(tree, node.id) ? node.ply - line[0].ply : 0,
      evals: review.evals,
      classes: sharedClasses ? line.slice(1).map((n) => sharedClasses[n.id] ?? null) : undefined,
    }
    writeSession(session)
  }, [tree, headers, orientation, node, line, review.evals, sharedClasses])

  // Remember each finished review, so the home page can show its accuracy and reopen it instantly.
  const reviewRan = useRef(false)
  useEffect(() => {
    if (review.status === 'running') reviewRan.current = true
    if (review.status !== 'done' || !reviewRan.current || !report || line.length < 2) return
    reviewRan.current = false
    const key = gameKey(headers, line)
    const depth = Object.values(review.evals)[0]?.depth ?? settings.reviewDepth
    void encodeShare(toSharedGame(line, headers, orientation, { evals: review.evals, report, depth })).then((token) =>
      saveReview(key, {
        token,
        white: headers.White ?? '',
        black: headers.Black ?? '',
        accuracy: report.accuracy,
        brilliant: { white: report.counts.white.brilliant, black: report.counts.black.brilliant },
        at: Date.now(),
      }),
    )
  }, [review.status, review.evals, report, line, headers, orientation, settings.reviewDepth])

  const runReview = useCallback(() => {
    setSharedClasses(null)
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
        setSharedClasses(null)
        setBanner(null)
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
    setSharedClasses(null)
    setBanner(null)
    setGame({ tree: createTree(), headers: {} })
    setCurrentId(ROOT_ID)
    setTab('analysis')
    setStepping(false)
  }

  // Open a share link once on start-up (the ref keeps StrictMode's second run from repeating it).
  const openedShare = useRef(false)
  useEffect(() => {
    if (!shareLink || openedShare.current) return
    openedShare.current = true
    void decodeShare(shareLink.token).then((shared) => {
      // An unknown version keeps its address, so the refresh it asks for (fetching the new app) opens it.
      if (!('error' in shared && shared.error === 'newer-version')) history.replaceState(null, '', '/analysis')
      resetReview()
      setStepping(false)
      setPlaying(false)
      if ('error' in shared) {
        setGame({ tree: createTree(), headers: {} })
        setCurrentId(ROOT_ID)
        setTab('analysis')
        setBanner(shared.error)
        return
      }
      const opened = fromSharedGame(shared)
      const sharedLine = mainline(opened.tree)
      const index = clampPly(shareLink.ply, sharedLine.length)
      const at = index === null ? null : sharedLine[index]
      setGame({ tree: opened.tree, headers: opened.headers })
      setOrientation(opened.orientation)
      setSharedClasses(opened.classes)
      setBanner('shared')
      if (opened.classes) {
        hydrateReview(opened.evals)
        setTab('review')
        setStepping(Boolean(at?.parentId))
        setCurrentId(at?.id ?? ROOT_ID)
      } else {
        setCurrentId(at?.id ?? ROOT_ID)
        const review = settings.autoReview && sharedLine.length > 1
        setTab(review ? 'review' : 'analysis')
        setPendingReview(review)
      }
    })
  }, [shareLink, resetReview, hydrateReview, settings.autoReview])

  /** The share-link token for the main line (and its review, when finished). */
  const makeShareToken = () => {
    const reviewed = review.status === 'done' && report ? { evals: review.evals, report, depth: Object.values(review.evals)[0]?.depth ?? settings.reviewDepth } : null
    return encodeShare(toSharedGame(line, headers, orientation, reviewed))
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

  // Keyboard navigation (only while this page is showing).
  useEffect(() => {
    if (!active) return
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
  }, [active, goPrev, goNext, goStart, goEnd, flip])

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
          <NavIcon name="next" />
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
            ? `Stockfish 19 will grade every move — genius to blunder — and work out each side’s accuracy.`
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
    <div className="analysis-page">
      <PageHeader title="Analysis" avatar={avatar}>
        <button className="btn ghost small page-header-action" onClick={newBoard} title="New board">
          <svg viewBox="0 0 24 24" aria-hidden>
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <path d="M3 9h18M3 15h18M9 3v18M15 3v18" />
          </svg>
          <span className="page-header-label">New board</span>
        </button>
        <button className="btn primary small page-header-action" onClick={() => setLoadOpen(true)} title="Load game">
          <svg viewBox="0 0 24 24" aria-hidden>
            <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />
          </svg>
          <span className="page-header-label">Load game</span>
        </button>
      </PageHeader>

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
            <section className="info-section info-share">
              {line.length > 1 && (
                <button className="btn ghost info-share-btn" onClick={() => setShareOpen(true)}>
                  <ShareIcon />
                  Share game
                </button>
              )}
              <SponsorCard />
              <nav className="site-links" aria-label="Site">
                <a href="/about">About</a>
                <span aria-hidden>·</span>
                <a href="/privacy">Privacy</a>
              </nav>
            </section>
          </aside>

          <aside className="panel">
            {banner && <ShareBanner kind={banner} onLoadGame={() => setLoadOpen(true)} onClose={() => setBanner(null)} />}
            <div className="panel-card">
              <header className="panel-header">
                {steppingThrough && (
                  <button className="icon-btn" onClick={() => setStepping(false)} aria-label="Back to summary" title="Back to summary">
                    <NavIcon name="back" />
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
                  <NavIcon name="first" />
                </button>
                <button className="ctrl" onClick={goPrev} disabled={!node.parentId} aria-label="Previous move" title="Previous move (←)">
                  <NavIcon name="prev" />
                </button>
                <button
                  className={`ctrl ${playing ? 'active' : ''}`}
                  onClick={() => setPlaying((p) => !p)}
                  disabled={!playing && !node.children.length}
                  aria-label={playing ? 'Pause' : 'Play'}
                  title="Play through (Space)"
                >
                  <NavIcon name={playing ? 'pause' : 'play'} />
                </button>
                <button className="ctrl" onClick={goNext} disabled={!node.children.length} aria-label="Next move" title="Next move (→)">
                  <NavIcon name="next" />
                </button>
                <button className="ctrl" onClick={goEnd} disabled={!node.children.length} aria-label="Last move" title="Last move (↓)">
                  <NavIcon name="last" />
                </button>
                <button className="ctrl flip" onClick={flip} aria-label="Flip board" title="Flip board (F)">
                  <NavIcon name="flip" />
                </button>
              </nav>
            </div>
          </aside>
        </div>
      </main>

      {shareOpen && (
        <ShareDialog
          onClose={() => setShareOpen(false)}
          line={line}
          currentNode={node}
          headers={headers}
          orientation={orientation}
          report={review.status === 'done' ? report : null}
          boardTheme={settings.boardTheme}
          getToken={makeShareToken}
        />
      )}

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
