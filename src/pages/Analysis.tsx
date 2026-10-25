import type { DrawShape } from '@lichess-org/chessground/draw'
import type { Key } from '@lichess-org/chessground/types'
import { DEFAULT_POSITION } from 'chess.js'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Board } from '../components/Board'
import { ClassIcon } from '../components/ClassIcon'
import { NavIcon } from '../components/NavIcons'
import { CoachCard } from '../components/CoachCard'
import { Segmented, SwitchRow } from '../components/controls'
import { AnalysisSettings } from '../components/AnalysisSettings'
import { EngineLines } from '../components/EngineLines'
import { chipText, EvalBar } from '../components/EvalBar'
import { EvalGraph } from '../components/EvalGraph'
import { BoardMenu } from '../components/BoardMenu'
import { GameInfo } from '../components/GameInfo'
import { KeyMoments } from '../components/KeyMoments'
import { LoadGameDialog, type LoadRequest } from '../components/LoadGameDialog'
import { MoveList } from '../components/MoveList'
import { MoveStrip } from '../components/MoveStrip'
import { PlayerBar } from '../components/PlayerBar'
import { ReviewSummary } from '../components/ReviewSummary'
import { San } from '../components/San'
import { ShareBanner } from '../components/ShareBanner'
import { ShareDialog } from '../components/ShareDialog'
import { TAB_ICONS, Tabs } from '../components/Tabs'
import { PageHeader } from '../components/PageHeader'
import { ReportDialog } from '../components/ReportDialog'
import type { AnalysisResult, EngineStatus, StockfishEngine } from '../engine/Engine'
import { DEEPER, depthOfReview, terminalState, useGameReview, useLiveAnalysis, useSideLineReview, type PositionEval } from '../hooks/useAnalysis'
import { useMediaQuery } from '../hooks/useMediaQuery'
import { useMoveSounds, useSteppedForward } from '../hooks/useMoveSounds'
import { endMarks } from '../lib/gameEnd'
import { openingFromEcoUrl } from '../lib/chesscom'
import { classifyGame, RULES_VERSION, withClasses, type GameReport, type MoveClass, type MoveReview } from '../lib/classify'
import { gameSummary, moveDetail, moveHeadline } from '../lib/commentary'
import type { Color } from '../lib/evaluation'
import { materialState } from '../lib/material'
import { loadOpeningBook, openingOf, type OpeningBook } from '../lib/openings'
import { reviewLines } from '../lib/regrade'
import { gameKey, saveReview } from '../lib/reviewCache'
import { ACCOUNTS_ENABLED } from '../lib/account'
import { useImmersive } from '../lib/immersive'
import { sendVerdictReport } from '../lib/reports'
import { navigate } from '../lib/router'
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

type Tab = 'review' | 'analysis' | 'info'

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
  /** Opened as Analyze (/board): starts on a clean board each time it's opened. */
  blank?: boolean
}

export function AnalysisPage({ settings, updateSettings, engine, status, active, blank = false }: Props) {
  const ready = status?.state === 'ready'
  // Phones show the board full screen, with the review's parts one at a time under it.
  const phone = useMediaQuery('(max-width: 1000px)')
  useImmersive(active && phone)

  const [restored] = useState(restoreSession)
  const [game, setGame] = useState<Game>(() => restored?.game ?? { tree: createTree(), headers: {} })
  const [currentId, setCurrentId] = useState(() => restored?.currentId ?? ROOT_ID)
  const [orientation, setOrientation] = useState<Color>(() => restored?.orientation ?? 'white')
  const [engineOn, setEngineOn] = useState(true)
  // The board's size when dragged by its corner handle (this device only); null fits it to the window.
  const [boardSize, setBoardSize] = useState<number | null>(readBoardSize)
  const [loadOpen, setLoadOpen] = useState(loadDialogRequested)
  const [optionsOpen, setOptionsOpen] = useState(false)
  useEffect(clearLoadRequest, [])
  // A game picked on the home page arrives with `review` set: review it as soon as the engine is up.
  const [pendingReview, setPendingReview] = useState(() => restored?.review ?? false)
  // Analyze's clean board opens on the engine; Game review on its Review tab (Load game is there when it's empty).
  const [tab, setTab] = useState<Tab>(() => (restored && (Object.keys(restored.evals).length || restored.review)) || !blank ? 'review' : 'analysis')
  const [stepping, setStepping] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [book, setBook] = useState<OpeningBook | null>(null)
  const [sharedClasses, setSharedClasses] = useState<Record<string, MoveClass> | null>(() => restored?.classes ?? null)
  const [banner, setBanner] = useState<'shared' | ShareError | null>(null)
  const [shareLink] = useState(() => parseShareHash(location.pathname, location.hash))
  const [shareOpen, setShareOpen] = useState(false)
  // "Report this verdict": the move whose verdict is being reported, and those sent this visit.
  const [reporting, setReporting] = useState<string | null>(null)
  const [reported, setReported] = useState<ReadonlySet<string>>(() => new Set())

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

  const inVariation = !isMainline(tree, node.id)
  // The Analysis board grades the moves played on it as they're played, until the game is reviewed.
  const gradingBoard = blank && review.status === 'idle'
  // Moves tried in a side line after the review get verdicts too, from the same kind of search.
  const sideLine = useMemo(() => {
    if (!inVariation && !gradingBoard) return []
    const off = gradingBoard ? path : path.filter((n) => !isMainline(tree, n.id))
    // The move on the board first, then the rest of the line from where it leaves the game.
    return [...new Set([node.fen, path[path.length - 2]?.fen, ...off.map((n) => n.fen)])].filter((f): f is string => Boolean(f))
  }, [inVariation, gradingBoard, path, tree, node.fen])
  const reviewDepth = depthOfReview(review.evals) ?? settings.reviewDepth
  const side = useSideLineReview({
    engine,
    ready,
    evals: review.evals,
    fens: sideLine,
    depth: reviewDepth,
    enabled: ((review.status === 'done' && Boolean(report)) || gradingBoard) && active,
  })
  const sideMoves = useMemo(() => {
    const moves: Record<string, MoveReview> = {}
    if (!Object.keys(side.evals).length) return moves
    const evals = { ...review.evals, ...side.evals }
    // Each side line is graded as a game of its own, from the start, so book and "miss" work as usual.
    // With no review, every line is one of the board's own, the main line included.
    for (const n of Object.values(tree.nodes)) {
      if (n.children.length || (report && isMainline(tree, n.id))) continue
      for (const [id, m] of Object.entries(classifyGame(pathTo(tree, n.id), evals, book?.isBook).moves)) {
        if (!report || (!report.moves[id] && !isMainline(tree, id))) moves[id] = m
      }
    }
    return moves
  }, [report, review.evals, side.evals, tree, book])
  // The move list's icons: the game's moves and any side-line moves graded since.
  const listReport = useMemo<Pick<GameReport, 'moves'> | null>(
    () => (Object.keys(sideMoves).length ? { ...report, moves: { ...report?.moves, ...sideMoves } } : report),
    [report, sideMoves],
  )
  const currentReview = report?.moves[node.id] ?? sideMoves[node.id]

  const live = useLiveAnalysis({
    engine,
    ready,
    fen: node.fen,
    enabled: engineOn,
    multiPv: settings.lines,
    depth: settings.liveDepth,
    // Dialogs pause the live engine: it frees the CPU for their animations and they don't need it.
    paused: reviewing || side.pending || loadOpen || shareOpen || !active,
  })

  // During a review, fall back to the review's verdict for positions it has reached.
  const reviewEval = review.evals[node.fen] ?? side.evals[node.fen]
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
  // Phones pick one part at a time under the board: the coach (stepping through), the engine,
  // the review's summary, or the game's details.
  const reviewed = review.status === 'done' && Boolean(report)
  const phoneView: PhoneView = tab === 'analysis' ? 'engine' : tab === 'info' ? 'info' : reviewed && !stepping ? 'summary' : 'coach'
  const pickPhoneView = (view: PhoneView) => {
    if (view === 'engine') return setTab('analysis')
    if (view === 'info') return setTab('info')
    setTab('review')
    if (view === 'summary') return setStepping(false)
    if (reviewed) {
      setStepping(true)
      if (!node.parentId && line[1]) setCurrentId(line[1].id)
    }
  }
  // A look at the Info tab mid-review keeps the review's arrows on the board.
  const reviewArrows = tab !== 'analysis' && stepping && review.status === 'done'

  const shapes = useMemo<DrawShape[]>(() => {
    // While stepping through a review, show only "this was better" for the move just played.
    if (reviewArrows) {
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
  }, [reviewArrows, currentReview, settings.showArrows, settings.lines, engineOn, shown, terminal])

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
        rules: RULES_VERSION,
        lines: reviewLines(line, review.evals),
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

  // Analyze clears the board each time it's opened (not on every render while it's showing).
  const wasBlank = useRef(false)
  useEffect(() => {
    if (blank && !wasBlank.current) newBoard()
    wasBlank.current = blank
  }, [blank])

  // Open a share link once on start-up (the ref keeps StrictMode's second run from repeating it).
  const openedShare = useRef(false)
  useEffect(() => {
    if (!shareLink || openedShare.current) return
    openedShare.current = true
    void decodeShare(shareLink.token).then((shared) => {
      // An unknown version keeps its address, so the refresh it asks for (fetching the new app) opens it.
      if (!('error' in shared && shared.error === 'newer-version')) history.replaceState(history.state, '', '/analysis')
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
  const steppedForward = useSteppedForward(tree, node)
  // Checkmate and stalemate show wherever they happen; resignations, time and draws only on the game's last move.
  const atGameEnd = Boolean(result && !node.children.length && isMainline(tree, node.id))
  const ends = useMemo(() => endMarks(node.fen, atGameEnd ? { result, termination: headers.Termination } : {}), [node.fen, atGameEnd, result, headers.Termination])
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
          detail={inVariation ? (side.pending ? 'Checking this move…' : 'You’re exploring a side line. The Analysis tab has the live engine.') : 'Not reviewed yet.'}
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
        // A forced move has nothing to disagree with.
        onReport={ACCOUNTS_ENABLED && currentReview.cls !== 'forced' ? () => setReporting(node.id) : undefined}
        reported={reported.has(`${node.id}:${currentReview.cls}`)}
      >
        {currentReview.bestMove && !['best', 'book', 'brilliant', 'great', 'forced'].includes(currentReview.cls) && (
          <button className="btn ghost" onClick={() => playLineFrom(parent.id, [currentReview.bestMove!])}>
            Show {bestSan ?? 'best'}
          </button>
        )}
        {/* Phones have the big Next under the thumb instead. */}
        {!phone && (
          <button className="btn primary" onClick={goNext} disabled={!node.children.length}>
            Next move
            <NavIcon name="next" />
          </button>
        )}
      </CoachCard>
    )
  }

  let reviewBody: React.ReactNode
  if (review.status === 'running') {
    // Then the moments where the eval jumps get a second, deeper look (backup.ts).
    const { checking } = review
    const pct = Math.round(checking ? (checking.done / Math.max(checking.total, 1)) * 100 : (review.progress / Math.max(review.total, 1)) * 100)
    reviewBody = (
      <>
        <CoachCard
          title="Reviewing the game…"
          detail={checking ? `Double-checking the sharp moments at depth ${settings.reviewDepth + DEEPER}.` : `Stockfish is checking every move at depth ${settings.reviewDepth}.`}
        >
          <div className="review-progress">
            <div className="progress">
              <div className="progress-fill" style={{ width: `${pct}%` }} />
            </div>
            <span className="muted small">
              {checking ? `${checking.done} of ${checking.total} sharp moments` : `${review.progress} of ${review.total} positions`}
            </span>
            <button className="btn ghost small" onClick={cancelReview}>
              Cancel
            </button>
          </div>
        </CoachCard>
        {phone ? (
          <MoveStrip tree={tree} currentId={node.id} onSelect={setCurrentId} report={listReport} />
        ) : (
          <>
            <EvalGraph line={line} evals={review.evals} currentIndex={currentIndex} onSelect={setCurrentId} report={report} height={104} />
            <MoveList tree={tree} currentId={node.id} onSelect={setCurrentId} result={result} report={listReport} />
          </>
        )}
      </>
    )
  } else if (review.status === 'done' && report) {
    reviewBody = stepping ? (
      <>
        {stepCoach()}
        {phone ? (
          <MoveStrip tree={tree} currentId={node.id} onSelect={setCurrentId} report={listReport} />
        ) : (
          <>
            <EvalGraph line={line} evals={review.evals} currentIndex={currentIndex} onSelect={setCurrentId} report={report} height={96} />
            <MoveList tree={tree} currentId={node.id} onSelect={setCurrentId} result={result} report={listReport} />
          </>
        )}
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
      <>
        <CoachCard
          title={line.length > 1 ? 'Ready when you are' : 'Nothing to review yet'}
          detail={
            line.length > 1
              ? `Stockfish 19 will grade every move — Legendary to Blunder — and work out each side’s accuracy.`
              : 'Load a game or play some moves on the board first.'
          }
        >
          {line.length > 1 ? (
            <button className="btn primary" disabled={!ready} onClick={runReview}>
              Review game
            </button>
          ) : (
            <button className="btn primary" onClick={() => setLoadOpen(true)}>
              Load game
            </button>
          )}
        </CoachCard>
        <div className="review-options">
          <div className="setting">
            <div className="setting-label">
              Review depth
              <span className="hint">How hard Stockfish looks at each move. Deeper is more exact, and slower.</span>
            </div>
            <Segmented
              label="Review depth"
              value={settings.reviewDepth}
              options={[
                [12, 'Fast · 12'],
                [16, 'Standard · 16'],
                [20, 'Deep · 20'],
              ]}
              onChange={(reviewDepth) => updateSettings({ reviewDepth })}
            />
          </div>
          <SwitchRow
            label="Review games automatically"
            hint="Start as soon as a game is loaded."
            checked={settings.autoReview}
            onChange={(autoReview) => updateSettings({ autoReview })}
          />
        </div>
      </>
    )
  }

  /** Drag the corner handle: the corner keeps as close to the pointer as it can. The board is centred, so
   *  as it grows its corner moves half as far sideways as down: the drag is measured along that path.
   *  The layout's size variable is set directly while dragging, so the page doesn't re-render each frame. */
  const startResize = (e: React.PointerEvent<HTMLElement>) => {
    const board = e.currentTarget.parentElement?.querySelector('.board')
    const layout = e.currentTarget.closest<HTMLElement>('.layout')
    if (!board || !layout) return
    e.preventDefault()
    const handle = e.currentTarget
    handle.setPointerCapture(e.pointerId)
    const start = board.getBoundingClientRect().width
    const max = boardLimit(layout)
    const [x0, y0] = [e.clientX, e.clientY]
    let size = start
    let moved = false
    const onMove = (ev: PointerEvent) => {
      moved = true
      const grow = (0.5 * (ev.clientX - x0) + (ev.clientY - y0)) / 1.25
      size = Math.round(Math.min(Math.max(start + grow, MIN_BOARD), max))
      layout.style.setProperty('--board-user', `${size}px`)
      layout.classList.add('sized')
    }
    const onUp = () => {
      handle.removeEventListener('pointermove', onMove)
      handle.removeEventListener('pointerup', onUp)
      handle.removeEventListener('pointercancel', onUp)
      if (moved) saveBoardSize(setBoardSize, size)
    }
    handle.addEventListener('pointermove', onMove)
    handle.addEventListener('pointerup', onUp)
    handle.addEventListener('pointercancel', onUp)
  }

  return (
    <div className="analysis-page">
      <PageHeader
        title={blank ? 'Analysis board' : 'Game review'}
        back="/games"
        phoneTitle={hasGame ? `${headers.White || 'White'} vs ${headers.Black || 'Black'}` : blank ? 'Analysis board' : 'Game review'}
        phoneSub={hasGame ? [blank ? 'Analysis board' : 'Game review', result?.replace('1/2-1/2', '½–½')].filter(Boolean).join(' · ') : undefined}
      >
        {line.length > 1 && (
          <button className="btn ghost small page-header-action" onClick={() => setShareOpen(true)} title="Share game" aria-label="Share game">
            <svg viewBox="0 0 24 24" aria-hidden>
              <path d="M12 15V4M7 9l5-5 5 5M5 14v6h14v-6" />
            </svg>
            <span className="page-header-label">Share</span>
          </button>
        )}
        {phone && <BoardMenu placement="down" onFlip={flip} onNewBoard={newBoard} onLoadGame={() => setLoadOpen(true)} onSettings={() => setOptionsOpen(true)} />}
      </PageHeader>

      <main
        className={`layout ${blank ? '' : 'with-moments'} ${boardSize ? 'sized' : ''}`}
        style={boardSize ? ({ '--board-user': `${boardSize}px` } as React.CSSProperties) : undefined}
      >
        <section className="board-column">
          {player(orientation === 'white' ? 'black' : 'white')}
          {phone && <EvalBar horizontal score={barScore} orientation={orientation} active={engineOn || Boolean(reviewEval)} theme={settings.boardTheme} />}
          <div className="board-row">
            <span
              className="board-resize"
              role="separator"
              aria-label="Resize the board"
              title="Drag to resize the board · double-click to fit"
              onPointerDown={startResize}
              onDoubleClick={() => saveBoardSize(setBoardSize, null)}
            />
            {!phone && <EvalBar score={barScore} orientation={orientation} active={engineOn || Boolean(reviewEval)} theme={settings.boardTheme} />}
            <Board
              fen={node.fen}
              orientation={orientation}
              lastMove={lastMove}
              shapes={shapes}
              theme={settings.boardTheme}
              coordinates={settings.coordinates}
              onMove={playMove}
              annotation={settings.classOnBoard ? currentReview?.cls : undefined}
              ends={ends}
              legendary={steppedForward}
            />
          </div>
          {player(orientation)}
        </section>

          <aside className="panel">
            {banner && <ShareBanner kind={banner} onLoadGame={() => setLoadOpen(true)} onClose={() => setBanner(null)} />}
            <div className="panel-card">
              <header className="panel-header">
                {phone ? (
                  <PhoneViews
                    value={phoneView}
                    reviewed={reviewed}
                    score={engineOn && barScore ? chipText(barScore) : null}
                    onSelect={pickPhoneView}
                  />
                ) : steppingThrough && (
                  <button className="icon-btn" onClick={() => setStepping(false)} aria-label="Back to summary" title="Back to summary">
                    <NavIcon name="back" />
                  </button>
                )}
                {!phone && <Tabs
                  value={tab}
                  onSelect={setTab}
                  items={[
                    { id: 'review', label: 'Review', icon: TAB_ICONS.review, tone: 'sky' },
                    { id: 'analysis', label: 'Analysis', icon: TAB_ICONS.analysis, tone: 'green' },
                    { id: 'info', label: 'Info', icon: TAB_ICONS.info, tone: 'violet' },
                  ]}
                />}
              </header>

              <div className={`panel-body ${tab}`}>
                {tab === 'info' ? (
                  <>
                    <GameInfo
                      headers={headers}
                      hasGame={hasGame}
                      opening={infoOpening}
                      positionNote={terminal ? terminal.label : `${turn === 'white' ? 'White' : 'Black'} to move`}
                      positionOpening={hasGame && opening && opening.name !== infoOpening?.name ? opening : undefined}
                      summary={review.status === 'done' && report ? summaryText : undefined}
                    />
                    <nav className="site-links phone-only" aria-label="Site">
                      <a href="/about">About</a>
                      <span aria-hidden>·</span>
                      <a href="/privacy">Privacy</a>
                    </nav>
                  </>
                ) : tab === 'analysis' ? (
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
                      onOpenSettings={() => setOptionsOpen(true)}
                    />
                    <MoveList tree={tree} currentId={node.id} onSelect={setCurrentId} result={result} report={listReport} />
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
                <button className="ctrl next" onClick={goNext} disabled={!node.children.length} aria-label="Next move" title="Next move (→)">
                  <NavIcon name="next" />
                </button>
                <button className="ctrl" onClick={goEnd} disabled={!node.children.length} aria-label="Last move" title="Last move (↓)">
                  <NavIcon name="last" />
                </button>
                {!phone && <BoardMenu onFlip={flip} onNewBoard={newBoard} onLoadGame={() => setLoadOpen(true)} onSettings={() => setOptionsOpen(true)} />}
              </nav>
            </div>
          </aside>

        {/* Under the board: the moves that decided the game, one click from the board. */}
        {!blank && (
          <section className="moments-strip" aria-label="Key moments">
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
            ) : (
              <p className="moments-empty">
                <span className="section-label">Key moments</span>
                {review.status === 'running' ? 'Finding them…' : line.length > 1 ? 'Review the game to find them.' : 'Load a game and review it to find them.'}
              </p>
            )}
          </section>
        )}
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

      {reporting && tree.nodes[reporting] && (report?.moves[reporting] ?? sideMoves[reporting]) && (
        <ReportDialog
          moveNumber={moveNumberLabel(tree.nodes[reporting].ply)}
          san={tree.nodes[reporting].san!}
          verdict={(report?.moves[reporting] ?? sideMoves[reporting]).cls}
          onSend={async (opinion, note) => {
            const reportPath = pathTo(tree, reporting)
            const moved = reportPath[reportPath.length - 1]
            const verdict = report?.moves[reporting] ?? sideMoves[reporting]
            const problem = await sendVerdictReport({
              fen: reportPath[reportPath.length - 2].fen,
              move: moved.uci!,
              san: moved.san!,
              verdict: verdict.cls,
              opinion,
              note,
              startFen: reportPath[0].fen,
              moves: reportPath.slice(1).map((n) => n.uci!),
              sideLine: !isMainline(tree, reporting),
              depth: reviewDepth,
              engine: settings.engine,
              review: { winBefore: verdict.winBefore, winAfter: verdict.winAfter, loss: verdict.loss, bestMove: verdict.bestMove, score: verdict.score },
            })
            if (!problem) setReported((r) => new Set(r).add(`${reporting}:${verdict.cls}`))
            return problem
          }}
          onClose={() => setReporting(null)}
        />
      )}

      {optionsOpen && <AnalysisSettings settings={settings} status={status} onChange={updateSettings} onClose={() => setOptionsOpen(false)} />}

      <LoadGameDialog
        open={loadOpen}
        onClose={() => setLoadOpen(false)}
        onLoad={(req) => {
          const err = loadGame(req)
          // A game loaded on Analyze is a game to review: the address (and the menu) follow.
          if (!err && blank && req.kind === 'pgn') navigate('/analysis', { replace: true })
          return err
        }}
        chesscomUser={settings.chesscomUser}
        onChesscomUser={(chesscomUser) => updateSettings({ chesscomUser })}
        lichessUser={settings.lichessUser}
        onLichessUser={(lichessUser) => updateSettings({ lichessUser })}
      />
    </div>
  )
}

type PhoneView = 'coach' | 'engine' | 'summary' | 'info'

/** Phones: the switch under the board between the review's parts. The engine's button carries its score. */
function PhoneViews({ value, reviewed, score, onSelect }: { value: PhoneView; reviewed: boolean; score: string | null; onSelect: (v: PhoneView) => void }) {
  const views: [PhoneView, string][] = [
    ['coach', reviewed ? 'Coach' : 'Review'],
    ['engine', 'Engine'],
    ...(reviewed ? ([['summary', 'Summary']] as [PhoneView, string][]) : []),
    ['info', 'Info'],
  ]
  return (
    <div className="phone-views" role="tablist" aria-label="Under the board">
      {views.map(([v, label]) => (
        <button key={v} role="tab" aria-selected={value === v} className={value === v ? 'active' : ''} onClick={() => onSelect(v)}>
          {label}
          {v === 'engine' && score && <span className="phone-views-score">{score}</span>}
        </button>
      ))}
    </div>
  )
}

const BOARD_SIZE_KEY = 'rookahead.boardSize'
const MIN_BOARD = 280
const MAX_BOARD = 1400

/** The biggest board the page has room for: the same limits as `.layout.sized` in the CSS, so a drag
 *  past them doesn't store a size the board can't show (and that you'd have to drag back through). */
function boardLimit(layout: HTMLElement): number {
  const css = getComputedStyle(layout)
  const v = (name: string) => parseFloat(css.getPropertyValue(name)) || 0
  const pageWidth = layout.parentElement?.closest('.shell-page')?.clientWidth ?? window.innerWidth
  const byWidth = pageWidth - v('--panel-w') - v('--evalbar-w') - 12 - v('--gap') - 2 * v('--pad-x')
  const byHeight = window.innerHeight - v('--nav-h') - 2 * v('--pad-y') - 2 * v('--player-h') - 20
  return Math.max(MIN_BOARD, Math.min(byWidth, byHeight, MAX_BOARD))
}

function readBoardSize(): number | null {
  try {
    const n = Number(localStorage.getItem(BOARD_SIZE_KEY))
    return n >= MIN_BOARD && n <= MAX_BOARD ? n : null
  } catch {
    return null
  }
}

function saveBoardSize(set: (n: number | null) => void, n: number | null) {
  set(n)
  try {
    if (n) localStorage.setItem(BOARD_SIZE_KEY, String(n))
    else localStorage.removeItem(BOARD_SIZE_KEY)
  } catch {
    // Not remembered; fine.
  }
}
