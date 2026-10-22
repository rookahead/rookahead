import type { Square } from 'chess.js'
import type { BoardTheme, Settings } from '../lib/settings'
import { playSound } from '../lib/sound'
import { Board, boardColors, BOARD_THEMES } from './Board'
import { OptionRow, Segmented, SwitchRow } from './controls'

interface Props {
  settings: Settings
  onChange: (patch: Partial<Settings>) => void
  /** A strip of board at the top that shows the choices as they're made (dialogs; Settings has a whole board beside). */
  preview?: boolean
}

/** After 1.e4 e5 2.Nf3 Nc6: the top three ranks hold a full back rank and the last move (b8–c6). */
const STRIP_FEN = 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3'
const STRIP_MOVE: [Square, Square] = ['b8', 'c6']

/** The board's look, feel and sound: one set of controls for Settings → Board and the analysis dialog's Board tab. */
export function BoardOptions({ settings, onChange, preview }: Props) {
  return (
    <div className="board-options">
      {preview && (
        <div className="board-strip" aria-hidden>
          <Board fen={STRIP_FEN} orientation="white" lastMove={STRIP_MOVE} shapes={[]} theme={settings.boardTheme} coordinates={settings.coordinates} onMove={() => {}} viewOnly />
        </div>
      )}
      <div className="board-swatches" role="radiogroup" aria-label="Board colours">
        {(['theme', ...Object.keys(BOARD_THEMES)] as BoardTheme[]).map((t) => {
          const c = boardColors(t, settings.palette)
          return (
            <button
              key={t}
              role="radio"
              aria-checked={settings.boardTheme === t}
              className={`board-swatch ${settings.boardTheme === t ? 'active' : ''}`}
              onClick={() => onChange({ boardTheme: t })}
            >
              <span className="board-swatch-squares" style={{ background: `conic-gradient(${c.dark} 0 25%, ${c.light} 0 50%, ${c.dark} 0 75%, ${c.light} 0)` }} />
              <span>{c.label}</span>
            </button>
          )
        })}
      </div>

      <SwitchRow label="Coordinates" hint="Files and ranks along the board’s edges." checked={settings.coordinates} onChange={(coordinates) => onChange({ coordinates })} />
      <SwitchRow label="Highlight last move" checked={settings.highlightLastMove} onChange={(highlightLastMove) => onChange({ highlightLastMove })} />
      <SwitchRow label="Show legal moves" hint="Dots on the squares a piece you pick up can go to." checked={settings.showLegalMoves} onChange={(showLegalMoves) => onChange({ showLegalMoves })} />
      <SwitchRow label="Move effects" hint="The board shakes when you step onto a Legendary move." checked={settings.moveEffects} onChange={(moveEffects) => onChange({ moveEffects })} />

      <OptionRow label="Piece animation">
        <Segmented
          label="Piece animation"
          value={settings.animation}
          options={[
            ['none', 'Off'],
            ['fast', 'Fast'],
            ['normal', 'Normal'],
            ['slow', 'Slow'],
          ]}
          onChange={(animation) => onChange({ animation })}
        />
      </OptionRow>

      <OptionRow label="Move sounds" hint="Pick one to hear it.">
        <Segmented
          label="Move sounds"
          value={settings.soundVolume}
          options={[
            [0, 'Off'],
            [0.35, 'Soft'],
            [0.7, 'Normal'],
            [1, 'Loud'],
          ]}
          onChange={(soundVolume) => {
            onChange({ soundVolume })
            playSound('move', soundVolume)
          }}
        />
      </OptionRow>

      <OptionRow label="Move notation" hint="How moves are written in the move list.">
        <Segmented
          label="Move notation"
          value={settings.notation}
          options={[
            ['figurine', '♞f3'],
            ['letter', 'Nf3'],
          ]}
          onChange={(notation) => onChange({ notation })}
        />
      </OptionRow>
    </div>
  )
}
