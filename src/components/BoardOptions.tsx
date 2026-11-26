import type { Square } from 'chess.js'
import type { CSSProperties } from 'react'
import { SET_KNIGHTS } from '../pieceSets'
import { LAST_MOVE_COLORS, tintOf, tintParts, type BoardTheme, type LastMoveColor, type PieceSet, type Settings } from '../lib/settings'
import { playSound } from '../lib/sound'
import { Board, boardColors, BOARD_THEMES, lastMoveTint } from './Board'
import { OptionRow, Segmented, SwitchRow } from './controls'

interface Props {
  settings: Settings
  onChange: (patch: Partial<Settings>) => void
  /** A strip of board at the top that shows the choices as they're made (dialogs; Settings has a whole board beside). */
  preview?: boolean
  /** Playing the computer: adds the Premoves and queen switches, which only apply there. */
  play?: boolean
}

/** After 1.e4 e5 2.Nf3 Nc6: the top three ranks hold a full back rank and the last move (b8–c6). */
const STRIP_FEN = 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3'
const STRIP_MOVE: [Square, Square] = ['b8', 'c6']

/** The board's look, feel and sound: one set of controls for Settings → Board and the analysis dialog's Board tab. */
const PIECE_SETS: [PieceSet, string][] = [
  ['rookahead', 'Rookahead'],
  ['classic', 'Cburnett'],
]

export function BoardOptions({ settings, onChange, preview, play }: Props) {
  // Your board's squares, under the last-move swatches.
  const squares = boardColors(settings.boardTheme, settings.palette)
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

      {/* The pieces on every board: Rookahead's own, or the classic Lichess set (cburnett); each shown by its white knight. */}
      <OptionRow label="Pieces" hint="The set on every board.">
        <div className="piece-picks" role="radiogroup" aria-label="Pieces">
          {PIECE_SETS.map(([set, label]) => (
            <button key={set} role="radio" aria-checked={settings.pieceSet === set} className={`piece-pick ${settings.pieceSet === set ? 'active' : ''}`} onClick={() => onChange({ pieceSet: set })}>
              <img src={SET_KNIGHTS[set]} alt="" style={{ background: squares.light }} />
              {label}
            </button>
          ))}
        </div>
      </OptionRow>

      <SwitchRow label="Coordinates" hint="Files and ranks along the board’s edges." checked={settings.coordinates} onChange={(coordinates) => onChange({ coordinates })} />
      <SwitchRow
        label="Highlight last move"
        hint="Shows the move just played, on the square it left and the square it landed on."
        checked={settings.highlightLastMove}
        onChange={(highlightLastMove) => onChange({ highlightLastMove })}
      />
      {settings.highlightLastMove && (
        <OptionRow label="Colour">
          <div className="tint-swatches" role="radiogroup" aria-label="Last-move colour">
            {(Object.keys(LAST_MOVE_COLORS) as LastMoveColor[]).map((k) => {
              // Your own: the browser's colour picker, behind a swatch of its own.
              if (k === 'custom') {
                return (
                  <label key={k} className={`tint-swatch tint-own ${settings.lastMoveColor === k ? 'active' : ''}`} title="Your own colour">
                    <input
                      type="color"
                      aria-label="Your own colour"
                      value={tintParts(settings.lastMoveCustom).hex}
                      onClick={() => onChange({ lastMoveColor: 'custom' })}
                      onChange={(e) => onChange({ lastMoveColor: 'custom', lastMoveCustom: tintOf(e.target.value, 0.5) })}
                    />
                  </label>
                )
              }
              return (
                <button
                  key={k}
                  role="radio"
                  aria-checked={settings.lastMoveColor === k}
                  aria-label={LAST_MOVE_COLORS[k].label}
                  title={LAST_MOVE_COLORS[k].label}
                  className={`tint-swatch ${settings.lastMoveColor === k ? 'active' : ''}`}
                  // The colour over the board's own squares, as it will look.
                  style={{ '--tint': lastMoveTint(k, squares, undefined, settings.lastMoveStrength), '--sq-light': squares.light, '--sq-dark': squares.dark } as CSSProperties}
                  onClick={() => onChange({ lastMoveColor: k })}
                />
              )
            })}
          </div>
        </OptionRow>
      )}
      {settings.highlightLastMove && (
        <OptionRow label="Strength">
          <input
            className="tint-strength"
            type="range"
            min={20}
            max={90}
            step={5}
            aria-label="Last-move colour strength"
            value={Math.round(tintParts(lastMoveTint(settings.lastMoveColor, squares, settings.lastMoveCustom, settings.lastMoveStrength)).opacity * 100)}
            onChange={(e) => onChange({ lastMoveStrength: Number(e.target.value) / 100 })}
          />
        </OptionRow>
      )}
      <SwitchRow label="Show legal moves" hint="Dots on the squares a piece you pick up can go to." checked={settings.showLegalMoves} onChange={(showLegalMoves) => onChange({ showLegalMoves })} />
      {play && (
        <SwitchRow
          label="Premoves"
          hint="Queue your next move while the other side moves: in games and in puzzles."
          checked={settings.premoves}
          onChange={(premoves) => onChange({ premoves })}
        />
      )}
      {play && (
        <SwitchRow
          label="Always promote to queen"
          hint="Hold Alt as you promote to choose another piece."
          checked={settings.autoQueen}
          onChange={(autoQueen) => onChange({ autoQueen })}
        />
      )}
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
