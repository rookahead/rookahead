import type { Square } from 'chess.js'
import { Board } from '../../components/Board'
import { BoardOptions } from '../../components/BoardOptions'
import type { Settings } from '../../lib/settings'
import { Section } from './shared'

/** The Italian, just after Black's bishop came to c5: pieces of every kind and a last move to show off. */
const PREVIEW_FEN = 'r1bqk1nr/pppp1ppp/2n5/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4'
const PREVIEW_MOVE: [Square, Square] = ['f8', 'c5']

/** The board's colours, coordinates, animation and sounds, beside a board that shows them as you choose. */
export function BoardSection({ settings, onChange }: { settings: Settings; onChange: (patch: Partial<Settings>) => void }) {
  return (
    <Section title="Board" lead="How the board looks and sounds everywhere: analysis, puzzles and play.">
      <div className="board-settings">
        <BoardOptions settings={settings} onChange={onChange} />
        <div className="board-preview" aria-hidden>
          <Board fen={PREVIEW_FEN} orientation="white" lastMove={PREVIEW_MOVE} shapes={[]} theme={settings.boardTheme} coordinates={settings.coordinates} onMove={() => {}} viewOnly />
        </div>
      </div>
    </Section>
  )
}
