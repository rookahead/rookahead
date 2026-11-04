import { explainMove, type CoachFacts, type ExplainInput } from './explain'
import type { Color } from './evaluation'
import { boardIdeas } from './ideas'

// The coach line under each move: a sentence or two in a coach's voice, made of the facts Explain finds
// (never a score). It talks to the player: their moves are "you", the other side's "your opponent". It
// praises a good move, says so when a move is a mistake, and names the better one.

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
const PRAISE: Partial<Record<Cls, string[]>> = {
  best: ['Very nice.', 'Solid.', 'Nice.', 'Good stuff.'],
  excellent: ['Nice.', 'Good move.', 'Solid.'],
  good: ['Fine.', 'Not bad.'],
  book: ['A classic.', 'Book stuff.'],
}

const WRONG: readonly Cls[] = ['inaccuracy', 'mistake', 'miss', 'blunder']
/** "Forks the king…", "Takes back…": a sentence that starts with what the move does. */
const startsWithVerb = (s: string) => /^[A-Z][a-z]+s\b/.test(s) && !/^(This|Its|Nothing)\b/.test(s)
const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1)
/** "Takes back the pawn" → "take back the pawn": the verb as "you" would say it. */
const yourVerb = (s: string) =>
  s.replace(/^(\w+?)(ies|es|s)\b/, (_, stem: string, end: string) => (end === 'ies' ? `${stem}y` : end === 'es' && /(sh|ch|x|ss)$/.test(stem) ? stem : end === 'es' ? `${stem}e` : stem))
/** An idea's sentence as a clause: "Develops the knight." → "develops the knight". */
const clause = (s: string) => lower(s.split(':')[0].replace(/\.$/, ''))

/** Clearly lost after the move (by three pawns or more, or getting mated): praise would ring false. */
function behind(input: ExplainInput): boolean {
  const s = input.reply.score
  const sign = input.fenBefore.split(' ')[1] === 'w' ? 1 : -1
  return s.type === 'mate' ? s.value * sign < 0 : s.value * sign <= -300
}

/** The coach line for a reviewed move, talking to the player who has `you`'s pieces. */
export function coachLine(input: ExplainInput, you: Color): string | null {
  const facts = explainMove(input)?.coach
  if (!facts) return null
  const mine = (input.fenBefore.split(' ')[1] === 'w' ? 'white' : 'black') === you
  const ply = (Number(input.fenBefore.split(' ')[5]) || 1) * 2 + (input.fenBefore.split(' ')[1] === 'b' ? 1 : 0)
  const pick = (list?: string[]) => (list?.length ? list[ply % list.length] : '')
  const say = (...parts: (string | undefined | null | false)[]) => parts.filter(Boolean).join(' ')

  if (WRONG.includes(input.cls)) return wrongLine(facts, mine, input.cls, pick)
  return goodLine(facts, input, mine, pick, say)
}

function wrongLine(facts: CoachFacts, mine: boolean, cls: Cls, pick: (l?: string[]) => string): string | null {
  const { own, allows, chance, better, shot } = facts
  const { mate } = facts
  const opener = mate
    ? mine ? 'You had mate!' : 'Your opponent missed mate!'
    : shot ? (mine ? 'You had a winning shot!' : 'Your opponent missed a winning shot!') : pick((mine ? OPEN_MINE : OPEN_THEIRS)[cls])
  // "then 21…hxg5 wins the knight" reads as what follows the move, not as what the move does.
  const point = better?.point
  const why = !point ? '' : point.startsWith('then ') ? `: ${point.slice(5)}` : mine ? `, which ${point}` : `: it ${point}`
  const betterText = better ? (mine ? `Your better option was ${better.move}${why}.` : `${better.move} was better${why}.`) : null
  // What was missed, said as missed (unless the opener already says it): "They missed 2.dxe5, which wins the e5 pawn."
  const missed = chance && !shot && !mate ? missedWords(chance, mine) : chance
  // At most two facts after the opener: what was there (or what it allows), and what the move did.
  const parts = missed ? [missed, own] : own ? [own, allows ? `Now ${allows}` : betterText] : [allows ? `Now ${allows}` : null, betterText]
  // Explain says "your" to whoever moved; on the opponent's move, those pieces are theirs.
  const body = parts.filter((x): x is string => Boolean(x)).map((x) => (mine ? x : x.replace(/\byour\b/g, 'their')))
  return body.length ? [opener, ...body].filter(Boolean).join(' ') : null
}

/** "2.dxe5 wins the e5 pawn." → "You missed 2.dxe5, which wins the e5 pawn." */
function missedWords(chance: string, mine: boolean): string {
  const m = chance.match(/^(\S+?)(,)? (.*)$/)
  if (!m) return chance
  const [, move, comma, rest] = m
  const who = mine ? 'You missed' : 'They missed'
  return comma ? `${who} ${move}, and ${rest.replace(/^then /, '')}` : `${who} ${move}, which ${rest}`
}

function goodLine(facts: CoachFacts, input: ExplainInput, mine: boolean, pick: (l?: string[]) => string, say: (...p: (string | undefined | null | false)[]) => string): string | null {
  const { idea, also } = facts
  if (!idea) return null
  if (idea === 'Checkmate.') return mine ? 'Checkmate! Well played.' : 'Checkmate.'
  // Lost anyway: no "Nice." on top of "nothing saves the king".
  const lost = /^(Nothing saves|Takes the \w+, but nothing saves)/.test(idea) || behind(input)
  // "7.Bxf7+ gives up the bishop…" is told as what you do: "You give up the bishop…".
  // The first sentence is the idea; what follows in Explain (where it leaves things) isn't for the coach.
  let text = idea.split('. ')[0].replace(/\.$/, '').replace(/^\S*\d\S* (?=[a-z]+s\b)/, '').replace(/^[a-z]/, (c) => c.toUpperCase())
  // A capture is often more than a capture: "takes back the pawn and develops the knight".
  if (/^Takes (back )?the [^,:]+$/.test(text) && !also) {
    const kind = (t: string) => t.split(' ')[0]
    const [more] = boardIdeas(input.fenBefore, input.uci, input.reply.pv).filter((i) => i.weight >= 6 && kind(i.text) !== 'Takes' && kind(i.text) !== 'Saves')
    if (more) text += ` and ${clause(more.text)}`
  }
  const verb = startsWithVerb(text)
  const opener = pick((mine ? OPEN_MINE : OPEN_THEIRS)[input.cls])
  // After "Your opponent found the only move.", it's "They get out of check", not "Your opponent" twice.
  const them = opener ? 'They' : 'Your opponent'
  if (verb) text = mine || opener ? `${mine ? 'You' : them} ${yourVerb(lower(text)).replace(/ and (\w+?)(ies|es|s)\b/, (m) => ` and ${yourVerb(m.slice(5))}`)}` : `${them} ${lower(text)}`
  const praise = mine && !opener && !lost ? pick(PRAISE[input.cls]) : ''
  return say(opener, `${text}.`, also, praise)
}
