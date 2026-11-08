import { Chess } from 'chess.js'
import { explainMove, type CoachFacts, type ExplainInput } from './explain'
import type { Color } from './evaluation'
import { boardIdeas } from './ideas'
import { uciToMove } from './tree'

// The coach line under each move: a sentence or two in a coach's voice, made of the facts Explain finds
// (never a score, and no move numbers: the board shows the move). It talks to the player: their moves
// are "you", the other side's "your opponent". It praises a good move, says so when a move is a mistake,
// names the better one in words, and turns the opponent's mistake into what the player can take.
// For a game the player only watched (a famous game, a friend's), it names the sides instead.

type Cls = ExplainInput['cls']

/** A few ways to say each thing, picked by the move, so a long game doesn't repeat itself. */
const OPEN_MINE: Partial<Record<Cls, string[]>> = {
  brilliant: ['Brilliant!', 'What a shot!'],
  great: ['Clutch!', 'The only move, and you found it.'],
  inaccuracy: ['Not quite.', 'A small slip.'],
  mistake: ['Careful!', 'That’s a mistake.'],
  blunder: ['Ouch.', 'Oops, that’s a blunder.'],
  miss: ['So close!', 'You missed something.'],
}
const OPEN_THEIRS: Partial<Record<Cls, string[]>> = {
  brilliant: ['Wow, your opponent found a brilliant move.'],
  great: ['Your opponent found the only move.'],
  inaccuracy: ['A small slip by your opponent.'],
  mistake: ['Your opponent made a mistake.'],
  blunder: ['Your opponent blundered!'],
  miss: ['Your opponent let you off the hook.'],
}
/** The same, for a game the player watched: by the side's name. */
const OPEN_SIDE: Partial<Record<Cls, ((side: string) => string)[]>> = {
  brilliant: [(s) => `Brilliant from ${s}!`, (s) => `What a shot by ${s}!`],
  great: [(s) => `${s} finds the only move.`],
  inaccuracy: [(s) => `A small slip by ${s}.`],
  mistake: [(s) => `${s} makes a mistake.`, (s) => `A mistake by ${s}.`],
  blunder: [(s) => `${s} blunders!`, (s) => `A blunder by ${s}.`],
  miss: [(s) => `${s} misses the chance.`],
}
const PRAISE: Partial<Record<Cls, string[]>> = {
  best: ['Very nice.', 'Solid.', 'Nice.', 'Good stuff.'],
  excellent: ['Nice.', 'Good move.', 'Solid.'],
  good: ['Fine.', 'Not bad.'],
}

/** A light word after the opponent's ordinary move, now and then. */
const QUIP_THEIRS = ['Not bad.', 'Fair enough.', 'Simple stuff.', '', 'Let’s see what you do next.', '', 'Solid from them.', '']
/** After their mistake hands you something. */
const CHANCE_THEIRS: Partial<Record<Cls, string[]>> = {
  blunder: ['Their loss, your gain.', 'Take it!'],
  mistake: ['Make them pay.', 'Don’t let it go.'],
}

const WRONG: readonly Cls[] = ['inaccuracy', 'mistake', 'miss', 'blunder']
const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w'
const CLASSIC = ['e4', 'd4', 'c4', 'Nf3']
/** "Forks the king…", "Takes back…": a sentence that starts with what the move does. */
const startsWithVerb = (s: string) => /^[A-Z][a-z]+s\b/.test(s) && !/^(This|Its|Nothing)\b/.test(s)
const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1)
/** "Takes back the pawn" → "take back the pawn": the verb as "you" would say it. */
const yourVerb = (s: string) =>
  s.replace(/^(\w+?)(ies|es|s)\b/, (_, stem: string, end: string) => (end === 'ies' ? `${stem}y` : end === 'es' && /(sh|ch|x|ss)$/.test(stem) ? stem : end === 'es' ? `${stem}e` : stem))
/** An idea's sentence as a clause: "Develops the knight." → "develops the knight". */
const clause = (s: string) => lower(s.split(':')[0].replace(/\.$/, ''))

/**
 * A move in words, the way a coach says it: "take back the pawn", "take the knight on d5 with the queen",
 * "bring the queen to g3", "push the pawn to d5", "castle". With "with check" when it is.
 */
export function moveWords(fen: string, uci: string, previous?: string): string {
  const chess = new Chess(fen)
  let m
  try {
    m = chess.move(uciToMove(uci))
  } catch {
    return uci
  }
  const name = (p: string) => ({ p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' })[p]!
  const check = chess.inCheck() ? ' with check' : ''
  if (m.isKingsideCastle() || m.isQueensideCastle()) return `castle${check}`
  if (m.captured) {
    // Which piece takes back is often the whole point (h-pawn, not f-pawn).
    if (previous?.slice(2, 4) === m.to) return `take back the ${name(m.captured)} with the ${m.piece === 'p' ? `${m.from[0]}-pawn` : name(m.piece)}${check}`
    const what = m.captured === 'p' ? `the ${m.to} pawn` : `the ${name(m.captured)} on ${m.to}`
    return `take ${what}${m.piece === 'p' ? '' : ` with the ${name(m.piece)}`}${check}`
  }
  if (m.promotion) return `promote the pawn to a ${name(m.promotion)}${check}`
  return m.piece === 'p' ? `push the pawn to ${m.to}${check}` : `bring the ${name(m.piece)} to ${m.to}${check}`
}

/** "22.Qf5+ forces …g6" → "Qf5+ forces g6": no move numbers, which only beginners' eyes trip on. */
const plain = (s: string) => s.replace(/\b\d+(\.|…)(?=[KQRBNOa-h])/g, '').replace(/…(?=[KQRBNOa-h])/g, '')

/**
 * Who the line talks to. `mine`: the player made the move. `watching`: the player was neither side, so
 * the sides go by name; `side` made the move and `other` replies.
 */
interface Voice {
  mine: boolean
  watching: boolean
  side: string
  other: string
}

/** Explain says "your" to whoever moved: the player's own, the opponent's ("their"), or a side's. */
const owner = (v: Voice, text: string) =>
  v.mine ? text : v.watching ? text.replace(/\b[Yy]our\b/g, `${v.side}’s`) : text.replace(/\byour\b/g, 'their')

/** Clearly lost after the move (by three pawns or more, or getting mated): praise would ring false. */
function behind(input: ExplainInput): boolean {
  const s = input.reply.score
  const sign = input.fenBefore.split(' ')[1] === 'w' ? 1 : -1
  return s.type === 'mate' ? s.value * sign < 0 : s.value * sign <= -300
}

/**
 * The coach line for a reviewed move, talking to the player who has `you`'s pieces, or (`you` null) to
 * someone who watched the game. `opening` is the named line the move reaches, if it reaches one
 * ("Caro-Kann Defense: Advance Variation").
 */
export function coachLine(input: ExplainInput, you: Color | null, opening?: string): string | null {
  const facts = explainMove(input)?.coach
  if (!facts) return null
  const white = input.fenBefore.split(' ')[1] === 'w'
  const v: Voice = { mine: you === (white ? 'white' : 'black'), watching: you === null, side: white ? 'White' : 'Black', other: white ? 'Black' : 'White' }
  const ply = (Number(input.fenBefore.split(' ')[5]) || 1) * 2 + (white ? 0 : 1)
  const pick = <T,>(list?: T[]): T | '' => (list?.length ? list[ply % list.length] : '')
  const opener = (cls: Cls) => {
    const f = v.watching ? pick(OPEN_SIDE[cls]) : null
    return f ? f(v.side) : v.watching ? '' : pick((v.mine ? OPEN_MINE : OPEN_THEIRS)[cls])
  }
  const say = (...parts: (string | undefined | null | false)[]) => parts.filter(Boolean).join(' ')

  if (WRONG.includes(input.cls)) {
    const line = wrongLine(facts, input, v, pick, opener)
    return line && plain(line)
  }
  // "Classic" is said once a game, on the very first move, when it's one of the well-known ones.
  if (input.fenBefore.startsWith(START) && CLASSIC.includes(input.san)) {
    const centre = input.san === 'e4' || input.san === 'd4' ? ', straight for the centre' : ''
    return v.mine ? `A classic ${input.san}${centre}.` : `${v.watching ? 'White' : 'Your opponent'} opens with a classic ${input.san}${centre}.`
  }
  const line = goodLine(facts, input, v, pick, opener, say)
  // A book move that reaches a named line says which.
  return plain(opening && input.cls === 'book' ? say(line, `This is the ${opening}.`) : (line ?? '')) || null
}

type Pick = <T>(list?: T[]) => T | ''

function wrongLine(facts: CoachFacts, input: ExplainInput, v: Voice, pick: Pick, open: (cls: Cls) => string): string | null {
  const { own, allows, chance, better, shot, mate, gives, mates } = facts
  const { mine, watching } = v
  const cls = input.cls
  const opener = mate
    ? mine ? 'You had mate!' : watching ? `${v.side} missed mate!` : 'Your opponent missed mate!'
    : shot ? (mine ? 'You had a winning shot!' : watching ? `${v.side} missed a winning shot!` : 'Your opponent missed a winning shot!') : open(cls)
  // The better move in words: "Your better option was to take back the pawn, which…"
  const point = better?.point
  const words = better && moveWords(input.fenBefore, better.uci, input.previous)
  // Said already by the words ("take back the pawn" / "take the a4 pawn" / "bring the knight to c3"):
  // no "which takes back", "which wins the a4 pawn", "which develops the knight" after it.
  const repeats = !point || /^(takes back|develops)/.test(point) || (point.startsWith('wins') && words?.startsWith('take') && point.includes(better!.uci.slice(2, 4)))
  const why = repeats ? '' : point.startsWith('then ') ? `: ${point.slice(5)}` : `, which ${point}`
  const betterText = words ? `${mine ? 'Your' : watching ? `${v.side}’s` : 'Their'} better option was to ${words}${why}.` : null
  // Their mistake is the player's chance, told as theirs to take: "You can win the knight on d5 now."
  // And how, when it's a tactic worth naming: "…now: Qxc3+ forks their king and rook."
  const how = allows?.match(/^(\S+) (forks|skewers|pins) ([^,.]+)/)
  const taker = watching ? v.other : 'You'
  const yours = !mine && (mates || gives) ? (mates ? `${taker} ${watching ? 'has' : 'have'} mate now!` : `${taker} can win ${gives} now${how ? `: ${how[1]} ${how[2]} ${owner(v, how[3])}` : ''}.`) : null
  const theirs = mine && !own && (mates || gives) ? (mates ? 'That allows mate.' : `That hands them ${gives}.`) : null
  if (yours) return [opener, own && owner(v, own), yours, !watching && pick(CHANCE_THEIRS[cls])].filter(Boolean).join(' ')
  // What was missed, said as missed (unless the opener already says it): "They missed dxe5, which wins the e5 pawn."
  const missed = chance && !shot && !mate ? missedWords(chance, mine ? 'You' : watching && !opener ? v.side : 'They') : chance
  // At most two facts after the opener: what was there (or what it allows), and what the move did.
  const parts = missed ? [missed, own] : own ? [own, allows ? `Now ${allows}` : betterText] : [theirs ?? (allows ? `Now ${allows}` : null), betterText]
  // Explain says "your" to whoever moved; on the opponent's move, those pieces are theirs.
  const body = parts.filter((x): x is string => Boolean(x)).map((x) => owner(v, x))
  return body.length ? [opener, ...body].filter(Boolean).join(' ') : null
}

/** "2.dxe5 wins the e5 pawn." → "You missed 2.dxe5, which wins the e5 pawn." */
function missedWords(chance: string, who: string): string {
  const m = chance.match(/^(\S+?)(,)? (.*)$/)
  if (!m) return chance
  const [, move, comma, rest] = m
  who = `${who} missed`
  return comma ? `${who} ${move}, and ${rest.replace(/^then /, '')}` : `${who} ${move}, which ${rest}`
}

function goodLine(facts: CoachFacts, input: ExplainInput, v: Voice, pick: Pick, open: (cls: Cls) => string, say: (...p: (string | undefined | null | false)[]) => string): string | null {
  const { idea, also } = facts
  const { mine, watching } = v
  if (!idea) return null
  if (idea === 'Checkmate.') return mine ? 'Checkmate! Well played.' : 'Checkmate.'
  // Lost anyway: no "Nice." on top of "nothing saves the king".
  const lost = /^(Nothing saves|Takes the \w+, but nothing saves)/.test(idea) || behind(input)
  // "7.Bxf7+ gives up the bishop…" is told as what you do: "You give up the bishop…".
  // The first sentence is the idea; what follows in Explain (where it leaves things) isn't for the coach.
  let text = idea.split('. ')[0].replace(/\.$/, '').replace(/^\S*\d\S* (?=[a-z]+s\b)/, '').replace(/^[a-z]/, (c) => c.toUpperCase())
  if (watching) text = owner(v, text)
  // A capture is often more than a capture: "takes back the pawn and develops the knight".
  if (/^Takes (back )?the [^,:]+$/.test(text) && !also) {
    const kind = (t: string) => t.split(' ')[0]
    const [more] = boardIdeas(input.fenBefore, input.uci, input.reply.pv).filter((i) => i.weight >= 6 && kind(i.text) !== 'Takes' && kind(i.text) !== 'Saves')
    if (more) text += ` and ${clause(more.text)}`
  }
  const verb = startsWithVerb(text)
  const opener = open(input.cls)
  // After "Your opponent found the only move.", it's "They get out of check", not "Your opponent" twice.
  const them = opener ? 'They' : watching ? v.side : 'Your opponent'
  if (verb) text = mine || opener ? `${mine ? 'You' : them} ${yourVerb(lower(text)).replace(/ and (\w+?)(ies|es|s)\b/, (m) => ` and ${yourVerb(m.slice(5))}`)}` : `${them} ${lower(text)}`
  // A quip only after a plain move of theirs: not after "…but Nxg4 still wins the bishop".
  const plainMove = !also && !/\b(but|wins|mate)\b/.test(text) && input.cls !== 'forced'
  // Watching, a good move is praised whoever made it; the quips talk to a player.
  const praise = (mine || watching) && !opener && !lost ? pick(PRAISE[input.cls]) : !mine && !watching && !opener && plainMove ? pick(QUIP_THEIRS) : ''
  return say(opener, `${text}.`, also, praise)
}

/** The coach's face for a moment. */
export type RookMood = 'neutral' | 'pleased' | 'proud' | 'ouch' | 'shocked' | 'thinking'

/**
 * How the coach reacts to a move, as the player's coach: proud of their brilliant or clutch move,
 * pleased with a good one, wincing at their mistake, thinking over a chance they missed, and wide-eyed
 * when the opponent blunders (or finds something brilliant). The opponent's ordinary moves get no face.
 * Watching a game (`mine` null), it's on no one's side: wide-eyed at the big moments, nothing else.
 */
export function coachMood(cls: Cls, mine: boolean | null, mates = false): RookMood {
  if (mine === null) return mates || ['brilliant', 'great', 'mistake', 'blunder', 'miss'].includes(cls) ? 'shocked' : 'neutral'
  if (mates) return mine ? 'proud' : 'ouch'
  if (mine) {
    if (cls === 'brilliant' || cls === 'great') return 'proud'
    if (cls === 'mistake' || cls === 'blunder') return 'ouch'
    if (cls === 'inaccuracy' || cls === 'miss') return 'thinking'
    return cls === 'forced' ? 'neutral' : 'pleased'
  }
  if (cls === 'blunder' || cls === 'mistake' || cls === 'miss' || cls === 'brilliant' || cls === 'great') return 'shocked'
  if (cls === 'inaccuracy') return 'pleased'
  return 'neutral'
}

/**
 * The coach's word on the whole game, for the top of the summary: one line, by the result and how it
 * ended, said to the player (`you`), or to someone who watched it (null). Its face goes with it.
 */
export function gameQuip(
  result: string | undefined,
  termination: string | undefined,
  you: Color | null,
  moments: GameMoments = {},
): { line: string; mood: RookMood } {
  const told = gameLine(result, termination, you)
  // One fact worth keeping, said as the coach would: the player's legendary move, else where it turned.
  const { legendary, turning } = moments
  const more = legendary
    ? `And ${legendary} was legendary!`
    : turning
      ? you === null
        ? `${turning.san} was the turning point.`
        : turning.mine
          ? `It slipped at ${turning.san}.`
          : `Their ${turning.san} was the turning point.`
      : ''
  return { line: more ? `${told.line} ${more}` : told.line, mood: told.mood }
}

/** The game's big moments, for the coach's word on it (SAN, no move numbers). */
export interface GameMoments {
  /** The player's own legendary move (watching, either side's). */
  legendary?: string
  /** The costliest real error, and whose it was. */
  turning?: { san: string; mine: boolean }
}

function gameLine(result: string | undefined, termination: string | undefined, you: Color | null): { line: string; mood: RookMood } {
  const how = (termination ?? '').toLowerCase()
  if (you === null && (result === '1-0' || result === '0-1')) {
    const [winner, loser] = result === '1-0' ? ['White', 'Black'] : ['Black', 'White']
    if (how.includes('checkmate')) return { line: `${winner} wins by checkmate. Let’s see how.`, mood: 'pleased' }
    if (how.includes('resign')) return { line: `${loser} resigned. Let’s see why.`, mood: 'pleased' }
    if (how.includes('time')) return { line: `${winner} wins on time. Let’s see how it went.`, mood: 'pleased' }
    return { line: `${winner} wins. Let’s see how.`, mood: 'pleased' }
  }
  const won = result === (you === 'white' ? '1-0' : '0-1')
  const lost = result === (you === 'white' ? '0-1' : '1-0')
  if (won) {
    if (how.includes('checkmate')) return { line: 'Checkmate, and a pretty one. Nice job!', mood: 'proud' }
    if (how.includes('resign')) return { line: 'They resigned. Well played!', mood: 'proud' }
    if (how.includes('time')) return { line: 'You won on time. A win’s a win!', mood: 'pleased' }
    return { line: 'A win. Nice job!', mood: 'proud' }
  }
  if (lost) {
    if (how.includes('checkmate')) return { line: 'Checkmated, ouch. Let’s see where it went wrong.', mood: 'ouch' }
    if (how.includes('time')) return { line: 'Lost on time. Let’s see where the minutes went.', mood: 'ouch' }
    return { line: 'A tough one. Let’s see where it slipped.', mood: 'ouch' }
  }
  if (result === '1/2-1/2') return { line: 'A draw. Let’s see who let it go.', mood: 'thinking' }
  return { line: 'Let’s go through the game.', mood: 'neutral' }
}
