import { describe, expect, it } from 'vitest'
import { boardIdeas } from './ideas'

const top = (fen: string, uci: string, line: string[] = []) => boardIdeas(fen, uci, line)[0]?.text
const all = (fen: string, uci: string, line: string[] = []) => boardIdeas(fen, uci, line).map((i) => i.text)

describe('what a quiet move does', () => {
  it('names a pin', () => {
    // The Opera Game, 3…Bg4.
    expect(top('rnbqkbnr/ppp2ppp/3p4/4p3/3PP3/5N2/PPP2PPP/RNBQKB1R b KQkq - 0 3', 'c8g4')).toBe('Pins the knight on f3 to the queen.')
  })

  it('names a half-open file and what the rook aims at', () => {
    // Fischer–Spassky, 1972 game 6, 11.Rc1.
    expect(top('rn3rk1/p1p1qpp1/1p5p/3p4/3P4/4PN2/PP3PPP/R2QKB1R w KQ - 0 11', 'a1c1')).toBe('Takes the half-open c-file, aiming at the c7 pawn.')
  })

  it('names a new passed pawn', () => {
    // The same game, 20…d4.
    expect(top('6k1/r2nq1p1/p3p2p/2pp4/4P3/Q7/PP2BPPP/2R2RK1 b - - 0 20', 'd5d4')).toBe('Makes a passed pawn on d4: no pawn can stop it any more.')
  })

  it('names a fork, unless the forking piece can simply be taken', () => {
    expect(top('r3k3/8/8/3N4/8/8/8/4K3 w - - 0 1', 'd5c7')).toBe('Forks the king and the rook on a8: both can’t be saved.')
    expect(all('r2qk3/8/8/3N4/8/8/8/4K3 w - - 0 1', 'd5c7').some((t) => t.startsWith('Forks'))).toBe(false)
  })

  it('names the move it prepares, from the engine line', () => {
    // The bishop leaves e2, and the queen gets to h5.
    expect(all('4k3/p7/8/8/8/8/4B3/3QK3 w - - 0 1', 'e2c4', ['a7a6', 'd1h5'])).toContain('Prepares 2.Qh5, with check: the bishop clears the way.')
  })
})
