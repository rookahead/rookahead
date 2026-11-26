import { Chessground } from '@lichess-org/chessground'
import type { Api } from '@lichess-org/chessground/api'
import { dragNewPiece } from '@lichess-org/chessground/drag'
import type { Key, Piece, Role } from '@lichess-org/chessground/types'
import { Chess, DEFAULT_POSITION, validateFen, type Square } from 'chess.js'
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react'
import { boardColors, boardImage } from '../components/Board'
import { writePosition } from '../components/LoadGameDialog'
import { PageHeader } from '../components/PageHeader'
import { PieceIcon } from '../components/PieceIcon'
import { useBoardPrefs } from '../lib/boardPrefs'
import type { Settings } from '../lib/settings'

const START = DEFAULT_POSITION.split(' ')[0]
const EMPTY = '8/8/8/8/8/8/8/8'
const ROLES: Role[] = ['king', 'queen', 'rook', 'bishop', 'knight', 'pawn']
type Color = 'white' | 'black'
/** What a click on the board does: move pieces about, take one off, or put this piece down. */
type Tool = 'move' | 'delete' | Piece
type Castle = 'K' | 'Q' | 'k' | 'q'
const CASTLES: { id: Castle; label: string; king: string; rook: string; piece: string }[] = [
  { id: 'K', label: 'White O-O', king: 'e1', rook: 'h1', piece: 'K' },
  { id: 'Q', label: 'White O-O-O', king: 'e1', rook: 'a1', piece: 'K' },
  { id: 'k', label: 'Black O-O', king: 'e8', rook: 'h8', piece: 'k' },
  { id: 'q', label: 'Black O-O-O', king: 'e8', rook: 'a8', piece: 'k' },
]

/** The piece on each square of a FEN's board part, as a map. */
function squares(board: string): Map<string, string> {
  const out = new Map<string, string>()
  board.split('/').forEach((row, r) => {
    let f = 0
    for (const ch of row) {
      if (/\d/.test(ch)) f += Number(ch)
      else out.set(`${'abcdefgh'[f++]}${8 - r}`, ch)
    }
  })
  return out
}

/** Castling a side may still have: its king and that rook on their starting squares. */
function canCastle(board: string, c: (typeof CASTLES)[number]): boolean {
  const at = squares(board)
  return at.get(c.king) === c.piece && at.get(c.rook) === (c.piece === 'K' ? 'R' : 'r')
}

/** What's wrong with a position, in words, or null when it can be played from. */
function problem(fen: string): string | null {
  const board = fen.split(' ')[0]
  const rows = board.split('/')
  if (/p/i.test(rows[0]) || /p/i.test(rows[7])) return 'Pawns can’t stand on the first or last rank.'
  const ok = validateFen(fen)
  if (!ok.ok) {
    const why = (ok.error ?? '').replace(/^Invalid FEN: /, '')
    if (/missing (white|black) king/.test(why)) return `Each side needs a king (${why.includes('white') ? 'White' : 'Black'} has none).`
    if (/too many/.test(why)) return 'Each side can have only one king.'
    return `That position can’t be played: ${why}.`
  }
  // The side not to move can't be in check: it would be taken next move.
  const chess = new Chess(fen)
  const turn = fen.split(' ')[1] as 'w' | 'b'
  const other = turn === 'w' ? 'b' : 'w'
  const king = [...squares(board)].find(([, p]) => p === (other === 'w' ? 'K' : 'k'))?.[0] as Square | undefined
  if (king && chess.isAttacked(king, turn)) return `${other === 'w' ? 'White' : 'Black'} is in check, but it’s ${turn === 'w' ? 'White' : 'Black'} to move.`
  return null
}

interface Props {
  settings: Settings
  /** The position is in the session: show it in Analysis. */
  onOpenAnalysis: () => void
}

/**
 * The board editor (Tools → Board editor): set up any position piece by piece, say who's to move and who can
 * still castle, and open it on the analysis board. Its FEN is always there to copy, or to paste one in.
 */
export function EditorPage({ settings, onOpenAnalysis }: Props) {
  const { palette } = useBoardPrefs()
  const el = useRef<HTMLDivElement>(null)
  const api = useRef<Api | null>(null)
  const [board, setBoard] = useState(START)
  const [turn, setTurn] = useState<'w' | 'b'>('w')
  const [castles, setCastles] = useState<Record<Castle, boolean>>({ K: true, Q: true, k: true, q: true })
  const [orientation, setOrientation] = useState<Color>('white')
  const [tool, setTool] = useState<Tool>('move')
  // The FEN box while it's being typed in; null shows the board's own.
  const [typed, setTyped] = useState<string | null>(null)

  const castling = CASTLES.filter((c) => castles[c.id] && canCastle(board, c))
    .map((c) => c.id)
    .join('')
  const fen = `${board} ${turn} ${castling || '-'} - 0 1`
  const wrong = problem(fen)

  // The tool, read by the board's events (set up once).
  const toolNow = useRef(tool)
  toolNow.current = tool

  useLayoutEffect(() => {
    if (!el.current) return
    api.current = Chessground(el.current, {
      fen: START,
      orientation: 'white',
      coordinates: true,
      ranksPosition: 'left',
      animation: { enabled: true, duration: 120 },
      movable: { free: true, color: 'both', showDests: false },
      premovable: { enabled: false },
      draggable: { showGhost: true, deleteOnDropOff: true },
      highlight: { lastMove: false, check: false },
      events: {
        change: () => setBoard(api.current?.getFen() ?? EMPTY),
        // A piece or the eraser picked: a click puts it down or takes one off, instead of picking a piece up.
        select: (key: Key) => {
          const a = api.current
          const t = toolNow.current
          if (!a || t === 'move') return
          a.setPieces(new Map([[key, t === 'delete' ? undefined : { ...t }]]))
          a.selectSquare(null)
          setBoard(a.getFen())
        },
      },
    })
    return () => {
      api.current?.destroy()
      api.current = null
    }
  }, [])

  // With a piece or the eraser in hand, pieces on the board aren't picked up.
  useEffect(() => {
    const moving = tool === 'move'
    api.current?.set({ movable: { color: moving ? 'both' : undefined }, draggable: { enabled: moving } })
  }, [tool])

  useEffect(() => {
    api.current?.set({ orientation })
  }, [orientation])

  /** Puts a whole board on (from the buttons or the FEN box). */
  const setPosition = (next: string) => {
    api.current?.set({ fen: next })
    setBoard(next)
  }

  /** A FEN typed or pasted in: used as soon as it reads as one. */
  const onTyped = (text: string) => {
    setTyped(text)
    const parts = text.trim().split(/\s+/)
    if (parts[0].split('/').length !== 8 || !/^[1-8pnbrqkPNBRQK/]+$/.test(parts[0])) return
    setPosition(parts[0])
    if (parts[1] === 'w' || parts[1] === 'b') setTurn(parts[1])
    if (parts[2]) setCastles({ K: parts[2].includes('K'), Q: parts[2].includes('Q'), k: parts[2].includes('k'), q: parts[2].includes('q') })
  }

  // A spare piece: clicked, it's the one a click on the board puts down; dragged, it goes where it's dropped.
  const grab = (piece: Piece) => (e: PointerEvent) => {
    setTool(piece)
    if (api.current && e.button === 0) dragNewPiece(api.current.state, { ...piece }, e.nativeEvent as unknown as MouseEvent, true)
  }

  const analyse = () => {
    if (wrong) return
    if (!writePosition(fen)) onOpenAnalysis()
  }

  const colors = boardColors(settings.boardTheme, palette)
  const style = { '--board-image': boardImage(colors.light, colors.dark), '--sq-light': colors.light, '--sq-dark': colors.dark } as CSSProperties
  const same = (p: Piece) => typeof tool === 'object' && tool.role === p.role && tool.color === p.color
  const spares = (color: Color) => (
    <div className="editor-spares" role="group" aria-label={`${color === 'white' ? 'White' : 'Black'} pieces`}>
      {ROLES.map((role) => (
        <button key={role} className={`editor-spare ${same({ role, color }) ? 'active' : ''}`} onPointerDown={grab({ role, color })} aria-label={`${color} ${role}`} title={`${color === 'white' ? 'White' : 'Black'} ${role}`}>
          <PieceIcon role={role} color={color} />
        </button>
      ))}
    </div>
  )

  return (
    <div className="editor-page">
      <PageHeader phoneOnly back="/board" phoneTitle="Board editor" />
      <main className="editor-layout">
        <div className="board editor-board" style={style}>
          <div ref={el} className="board-cg" />
        </div>
        <aside className="editor-panel">
          <header className="editor-title">
            <h1>Board editor</h1>
            <p>Drag pieces on, or pick one and click squares. Drag a piece off the board to take it away.</p>
          </header>

          <section className="editor-section">
            <div className="editor-tools" role="group" aria-label="What a click does">
              <button className={`editor-tool ${tool === 'move' ? 'active' : ''}`} onClick={() => setTool('move')} title="Move pieces">
                <svg viewBox="0 0 24 24" aria-hidden>
                  <path d="M5 3l14 7.5-6.2 1.7L10 19z" />
                </svg>
                Move
              </button>
              <button className={`editor-tool ${tool === 'delete' ? 'active' : ''}`} onClick={() => setTool('delete')} title="Take pieces off">
                <svg viewBox="0 0 24 24" aria-hidden>
                  <path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13" />
                </svg>
                Erase
              </button>
            </div>
            {spares('white')}
            {spares('black')}
          </section>

          <section className="editor-section">
            <h2>To move</h2>
            <div className="segmented">
              <button className={turn === 'w' ? 'active' : ''} onClick={() => setTurn('w')}>
                White
              </button>
              <button className={turn === 'b' ? 'active' : ''} onClick={() => setTurn('b')}>
                Black
              </button>
            </div>
          </section>

          <section className="editor-section">
            <h2>Castling</h2>
            <div className="editor-castles">
              {CASTLES.map((c) => {
                const possible = canCastle(board, c)
                return (
                  <label key={c.id} className={possible ? '' : 'off'}>
                    <input type="checkbox" checked={possible && castles[c.id]} disabled={!possible} onChange={(e) => setCastles({ ...castles, [c.id]: e.target.checked })} />
                    {c.label}
                  </label>
                )
              })}
            </div>
          </section>

          <section className="editor-section">
            <h2>FEN</h2>
            <input
              className="editor-fen"
              value={typed ?? fen}
              onChange={(e) => onTyped(e.target.value)}
              onBlur={() => setTyped(null)}
              onFocus={(e) => e.currentTarget.select()}
              spellCheck={false}
              aria-label="FEN"
            />
          </section>

          <div className="editor-buttons">
            <button className="btn ghost small" onClick={() => setPosition(START)}>
              Starting position
            </button>
            <button className="btn ghost small" onClick={() => setPosition(EMPTY)}>
              Clear board
            </button>
            <button className="btn ghost small" onClick={() => setOrientation(orientation === 'white' ? 'black' : 'white')}>
              Flip board
            </button>
          </div>

          {wrong && <p className="editor-wrong">{wrong}</p>}
          <button className="btn primary big" disabled={Boolean(wrong)} onClick={analyse}>
            Analyse this position
          </button>
        </aside>
      </main>
    </div>
  )
}
