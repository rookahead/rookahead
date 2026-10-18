import { Chess } from 'chess.js'
import { describe, expect, it } from 'vitest'
import type { PositionEval } from '../hooks/useAnalysis'
import { classifyGame, withClasses, type MoveClass } from './classify'
import { checkmatedScore } from './evaluation'
import { clampPly, CLASS_CODES, decodeShare, embedUrl, encodeShare, fromSharedGame, gameShareText, iframeSnippet, momentShareText, moveLabel, parseEmbedHash, parseShareHash, shareUrl, toSharedGame, type SharedGame } from './share'
import { mainline, treeFromPgn } from './tree'
import type { Score } from './uci'

const cp = (value: number): Score => ({ type: 'cp', value })
const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
const OPERA = 'e4 e5 Nf3 d6 d4 Bg4 dxe5 Bxf3 Qxf3 dxe5 Bc4 Nf6 Qb3 Qe7 Nc3 c6 Bg5 b5 Nxb5 cxb5 Bxb5+ Nbd7 O-O-O Rd8 Rxd7 Rxd7 Rd1 Qe6 Bxd7+ Nxd7 Qb8+ Nxb8 Rd8#'

const roundTrip = async (g: SharedGame) => decodeShare(await encodeShare(g))

/** UCI moves of a SAN game, plus the legal alternatives seen along the way. */
function uciGame(sans: string[], startFen = START) {
  const chess = new Chess(startFen)
  const moves: string[] = []
  const alternatives: string[] = []
  for (const san of sans) {
    alternatives.push(chess.moves({ verbose: true }).at(-1)!.lan)
    moves.push(chess.move(san).lan)
  }
  return { moves, alternatives }
}

/** A reviewed game with fixed, varied review data. */
function reviewedOpera(): SharedGame {
  const { moves, alternatives } = uciGame(OPERA.split(' '))
  const classes: MoveClass[] = moves.map((_, i) => CLASS_CODES[i % CLASS_CODES.length])
  const scores: Score[] = [cp(25), ...moves.map((_, i) => cp(((i * 37) % 900) - 300))]
  scores[scores.length - 1] = checkmatedScore('black')
  return {
    startFen: START,
    moves,
    headers: { White: 'Morphy', Black: 'Duke & Count', WhiteElo: '2690', Result: '1-0', Date: '1858.11.02', Link: 'https://www.chess.com/game/live/1' },
    orientation: 'white',
    review: {
      depth: 16,
      scores,
      bestMoves: moves.map((m, i) => (i % 5 === 4 ? null : i % 2 ? alternatives[i] : m)),
      classes,
    },
  }
}

/** Bytes → "1.<base64url>" after deflate-raw, for hand-built (possibly bad) records. */
async function token(bytes: number[]) {
  const stream = new Blob([new Uint8Array(bytes)]).stream().pipeThrough(new CompressionStream('deflate-raw'))
  const packed = new Uint8Array(await new Response(stream).arrayBuffer())
  return '1.' + btoa(String.fromCharCode(...packed)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** A legal game of exactly `plies` moves, picked by a seeded generator. */
function longGame(plies: number): string[] {
  for (let seed = 1; ; seed++) {
    let s = seed
    const chess = new Chess()
    const moves: string[] = []
    while (moves.length < plies && !chess.isGameOver()) {
      s = (s * 1103515245 + 12345) % 2 ** 31
      const legal = chess.moves({ verbose: true })
      moves.push(chess.move(legal[s % legal.length]).lan)
    }
    if (moves.length === plies) return moves
  }
}

describe('share codec', () => {
  it('round-trips a reviewed game', async () => {
    const g = reviewedOpera()
    expect(new Set(g.review!.classes).size).toBe(11)
    expect(await roundTrip(g)).toEqual(g)
  })

  it('round-trips a game without a review', async () => {
    const { review: _review, ...g } = reviewedOpera()
    const out = await roundTrip(g)
    expect(out).toEqual(g)
    expect('review' in out).toBe(false)
  })

  it('round-trips a custom start FEN with an underpromotion', async () => {
    const g: SharedGame = { startFen: '8/4P3/8/8/8/8/k7/4K3 w - - 0 1', moves: ['e7e8n'], headers: {}, orientation: 'white' }
    expect(await roundTrip(g)).toEqual(g)
  })

  it('round-trips mate scores and clamps huge centipawn scores', async () => {
    const { moves } = uciGame(['e4', 'e5', 'Nf3'])
    const g: SharedGame = {
      startFen: START,
      moves,
      headers: {},
      orientation: 'white',
      review: { depth: 12, scores: [{ type: 'mate', value: 3 }, { type: 'mate', value: -2 }, checkmatedScore('white'), cp(20000)], bestMoves: [null, null, null], classes: ['best', 'best', 'best'] },
    }
    const out = await roundTrip(g)
    expect(out).toEqual({ ...g, review: { ...g.review!, scores: [{ type: 'mate', value: 3 }, { type: 'mate', value: -2 }, checkmatedScore('white'), cp(15000)] } })
    const black = { ...g, review: { ...g.review!, scores: [cp(0), cp(0), cp(0), checkmatedScore('black')] } }
    expect(await roundTrip(black)).toEqual(black)
  })

  it('round-trips non-ASCII names and caps long headers', async () => {
    const g: SharedGame = { startFen: START, moves: [], headers: { White: 'Ýmir 🐉', Termination: 'x'.repeat(150) }, orientation: 'white' }
    expect(await roundTrip(g)).toEqual({ ...g, headers: { White: 'Ýmir 🐉', Termination: 'x'.repeat(100) } })
  })

  it('keeps a black orientation', async () => {
    const g: SharedGame = { ...reviewedOpera(), orientation: 'black' }
    expect(await roundTrip(g)).toEqual(g)
  })

  it('keeps a 150-ply reviewed game under 2000 characters', async () => {
    const moves = longGame(150)
    const g: SharedGame = {
      startFen: START,
      moves,
      headers: { White: 'Someone', Black: 'Someone else', Link: 'https://www.chess.com/game/live/123456789012' },
      orientation: 'white',
      review: {
        depth: 16,
        scores: [cp(20), ...moves.map((_, i) => cp(((i * 53) % 700) - 350))],
        bestMoves: moves.map((m, i) => (i % 3 ? m : null)),
        classes: moves.map((_, i) => CLASS_CODES[(i * 7) % 11]),
      },
    }
    const t = await encodeShare(g)
    expect(shareUrl(t, null, 'https://rookahead.com').length).toBeLessThan(2000)
    expect(await decodeShare(t)).toEqual(g)
  })

  it('rejects damaged payloads without throwing', async () => {
    const good = await encodeShare(reviewedOpera())
    const bad = [
      '1.',
      '1.!!!',
      good.slice(0, -10),
      // Header "{}", one ply whose move index (250) is out of range, no review.
      await token([2, 123, 125, 1, 250, 0]),
      // A valid record followed by a stray byte.
      await token([2, 123, 125, 1, 0, 0, 7]),
    ]
    for (const t of bad) expect(await decodeShare(t)).toEqual({ error: 'damaged' })
  })

  it('asks for a refresh on a newer format version', async () => {
    const good = await encodeShare(reviewedOpera())
    expect(await decodeShare('2.' + good.slice(2))).toEqual({ error: 'newer-version' })
  })
})

describe('parseShareHash', () => {
  it('reads the token and the moment', () => {
    expect(parseShareHash('/r', '#1.abc&m=12')).toEqual({ token: '1.abc', ply: 12 })
    expect(parseShareHash('/r/', '#1.abc')).toEqual({ token: '1.abc', ply: null })
  })

  it('ignores trailing junk from chat apps', () => {
    expect(parseShareHash('/r', '#1.abc&m=12).')).toEqual({ token: '1.abc', ply: 12 })
    expect(parseShareHash('/r', '#1.abc. ')).toEqual({ token: '1.abc', ply: null })
  })

  it('ignores anything that is not a share link', () => {
    expect(parseShareHash('/r', '')).toBeNull()
    expect(parseShareHash('/r', '#hello')).toBeNull()
    expect(parseShareHash('/', '#1.abc')).toBeNull()
  })
})

describe('shareUrl', () => {
  it('builds whole-game and moment links', () => {
    expect(shareUrl('1.abc', null, 'https://rookahead.com')).toBe('https://rookahead.com/r#1.abc')
    expect(shareUrl('1.abc', 41, 'https://rookahead.com')).toBe('https://rookahead.com/r#1.abc&m=41')
  })
})

describe('game conversion', () => {
  const pgn = `[White "Morphy"]\n[Black "Duke & Count"]\n[Result "1-0"]\n[Link "https://www.chess.com/game/live/1"]\n\n${OPERA} 1-0`
  const { tree, headers } = treeFromPgn(pgn)
  const line = mainline(tree)
  const evals: Record<string, PositionEval> = {}
  line.forEach((node, i) => {
    const next = line[i + 1]
    evals[node.fen] = { score: cp(((i * 41) % 500) - 120), bestMove: next ? (i % 3 ? next.uci! : null) : null, pv: next?.uci ? [next.uci] : [], depth: 16 }
  })

  it('keeps the review through a link', async () => {
    const report = classifyGame(line, evals)
    const decoded = await decodeShare(await encodeShare(toSharedGame(line, headers, 'black', { evals, report, depth: 16 })))
    if ('error' in decoded) throw new Error(decoded.error)
    const back = fromSharedGame(decoded)
    const backLine = mainline(back.tree)

    expect(backLine.map((n) => n.fen)).toEqual(line.map((n) => n.fen))
    expect(back.orientation).toBe('black')
    expect(back.headers).toMatchObject({ White: 'Morphy', Black: 'Duke & Count', Result: '1-0', Link: 'https://www.chess.com/game/live/1' })
    expect(Object.values(back.evals).every((e) => e.depth === 16)).toBe(true)

    const rebuilt = withClasses(classifyGame(backLine, back.evals), back.classes!)
    expect(rebuilt.accuracy).toEqual(report.accuracy)
    backLine.slice(1).forEach((node, i) => expect(rebuilt.moves[node.id].cls).toBe(report.moves[line[i + 1].id].cls))
    expect(rebuilt.counts).toEqual(report.counts)
  })

  it('shares only the moves without a review', () => {
    expect(toSharedGame(line, headers, 'white', null).review).toBeUndefined()
  })

  it('shares only the moves when the review is incomplete', () => {
    const partial = { ...evals }
    delete partial[line[5].fen]
    const report = classifyGame(line, partial)
    expect(toSharedGame(line, headers, 'white', { evals: partial, report, depth: 16 }).review).toBeUndefined()
  })

  it('opens a custom start position with its FEN header', () => {
    const shared: SharedGame = { startFen: '8/4P3/8/8/8/8/k7/4K3 w - - 0 1', moves: ['e7e8q'], headers: {}, orientation: 'white' }
    const back = fromSharedGame(shared)
    expect(back.headers).toEqual({ SetUp: '1', FEN: '8/4P3/8/8/8/8/k7/4K3 w - - 0 1' })
    expect(back.classes).toBeNull()
    expect(mainline(back.tree)).toHaveLength(2)
  })
})

describe('share text', () => {
  const players = { White: 'Hikaru', Black: 'Bortnyk' }

  it('describes a brilliant moment', () => {
    expect(momentShareText(40, 'Nxc4', 'brilliant', players)).toBe('20… Nxc4!! Brilliant · Hikaru vs Bortnyk, reviewed on Rookahead')
  })

  it('annotates only the classes that have a symbol', () => {
    expect(momentShareText(9, 'Qb3', 'great', players)).toBe('5. Qb3! Great · Hikaru vs Bortnyk, reviewed on Rookahead')
    expect(momentShareText(10, 'f6', 'inaccuracy', players)).toBe('5… f6?! Inaccuracy · Hikaru vs Bortnyk, reviewed on Rookahead')
    expect(momentShareText(10, 'f6', 'mistake', players)).toBe('5… f6? Mistake · Hikaru vs Bortnyk, reviewed on Rookahead')
    expect(momentShareText(10, 'f6', 'miss', players)).toBe('5… f6? Miss · Hikaru vs Bortnyk, reviewed on Rookahead')
    expect(momentShareText(10, 'f6', 'blunder', players)).toBe('5… f6?? Blunder · Hikaru vs Bortnyk, reviewed on Rookahead')
    expect(momentShareText(9, 'e4', 'best', players)).toBe('5. e4 Best · Hikaru vs Bortnyk, reviewed on Rookahead')
  })

  it('describes a move without a review', () => {
    expect(momentShareText(19, 'Nxb5', undefined, players)).toBe('10. Nxb5 · Hikaru vs Bortnyk, on Rookahead')
  })

  it('labels a move for the share switch', () => {
    expect(moveLabel(19, 'Nxb5', 'brilliant')).toBe('10. Nxb5!!')
    expect(moveLabel(20, 'cxb5', 'best')).toBe('10… cxb5')
    expect(moveLabel(20, 'cxb5')).toBe('10… cxb5')
  })

  it('describes a whole game', () => {
    expect(gameShareText(players, { white: 86.6, black: 81.6 })).toBe('Hikaru vs Bortnyk: accuracy 87 vs 82, reviewed on Rookahead')
    expect(gameShareText(players, null)).toBe('Hikaru vs Bortnyk, reviewed on Rookahead')
    expect(gameShareText({}, null)).toBe('White vs Black, reviewed on Rookahead')
  })
})

describe('embed', () => {
  it('builds embed links', () => {
    expect(embedUrl('1.abc', 19, 'https://rookahead.com')).toBe('https://rookahead.com/embed#1.abc&m=19')
    expect(embedUrl('1.abc', null, 'https://rookahead.com')).toBe('https://rookahead.com/embed#1.abc')
  })

  it('reads embed links', () => {
    expect(parseEmbedHash('/embed', '#1.abc&m=4')).toEqual({ token: '1.abc', ply: 4 })
    expect(parseEmbedHash('/embed.html', '#1.abc')).toEqual({ token: '1.abc', ply: null })
    expect(parseEmbedHash('/r', '#1.abc')).toBeNull()
    expect(parseEmbedHash('/embed', '')).toBeNull()
  })

  it('writes iframe code for each size', () => {
    const url = 'https://rookahead.com/embed#1.abc'
    expect(iframeSnippet(url, 'small', 'A vs B · Rookahead')).toContain('width="360" height="470"')
    const medium = iframeSnippet(url, 'medium', 'A vs B · Rookahead')
    expect(medium).toBe(`<iframe src="${url}" width="640" height="420" style="border:0;border-radius:8px" title="A vs B · Rookahead" loading="lazy" allowfullscreen></iframe>`)
    expect(iframeSnippet(url, 'large', 'x')).toContain('width="840" height="560"')
  })

  it('escapes the title', () => {
    expect(iframeSnippet('https://x/embed#1.a', 'medium', 'Bob "the" <King> & co')).toContain('title="Bob &quot;the&quot; &lt;King&gt; &amp; co"')
  })

  it('clamps a moment past the end of the game', () => {
    expect(clampPly(19, 34)).toBe(19)
    expect(clampPly(99, 34)).toBe(33)
    expect(clampPly(null, 34)).toBeNull()
  })
})
