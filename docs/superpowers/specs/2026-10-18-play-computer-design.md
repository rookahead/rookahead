# Play vs computer: design

Date: 2026-10-18 · Status: approved in chat (levels now, characters later; "friendly" assists)

## Goal

Play a game against Stockfish at eight strength levels, on this device, then review it in one click.
Finished games fill "My recent games" on Home.

## Setup (`/play`)

- The sidebar/tab-bar **Play** item becomes a link (no "Soon").
- Setup card (tonal cards, no borders): **Level 1–8** tiles with approximate ratings, **Your colour**
  (White / Random / Black, default Random), **Clock** (Untimed / 10+0 / 10+5 / 15+10, default Untimed),
  and a teal **Start game** button. The last choices are remembered.

## Levels

| Level | ≈ Rating | Engine settings | Think delay |
|---|---|---|---|
| 1 | 400 | Skill Level 0, depth 1 | 0.6–1.4 s |
| 2 | 700 | Skill Level 2, depth 2 | 0.6–1.4 s |
| 3 | 1000 | Skill Level 4, depth 3 | 0.7–1.6 s |
| 4 | 1300 | Skill Level 6, depth 5 | 0.8–1.8 s |
| 5 | 1600 | Skill Level 9, movetime 400 ms | 0.8–2.0 s |
| 6 | 1900 | Skill Level 12, movetime 500 ms | 0.9–2.2 s |
| 7 | 2200 | Skill Level 16, movetime 700 ms | 1.0–2.4 s |
| 8 | 2600 | Skill Level 20, movetime 900 ms | 1.0–2.6 s |

The delay is the total time before the computer moves (search time included), chosen at random in the
range; under a clock it never exceeds 5% of the computer's remaining time. Ratings are approximate; a
calibration run checks that each level beats the one below more often than not. (Calibrated: the first table used UCI_Elo from level 4, but at these think times Elo 1320–1600 lost to Skill 6, so every level now uses Skill Level; each scores ≥ 5/6 against the one below.)

## Game screen

- Same board, player bars and layout family as Analysis. The computer's bar: "Rookahead · Level 4 ·
  ~1300"; yours: "You". Clocks show on both bars when timed.
- Game panel: move list, then **Takeback**, **Hint**, **Offer draw**, **Resign**.
- **No eval bar, no engine lines, no arrows** except a hint.
- **Takeback:** undoes your last move (and the computer's reply if it has moved; cancels its search if
  not). Not possible before your first move. Counted.
- **Hint:** the best move for you as an arrow (full-strength search, depth 16) until you move. Counted.
- **Offer draw:** the computer accepts when the position is level (|eval| ≤ 0.30 at depth 14) and at least
  30 plies have been played; otherwise "Declined".
- **Resign:** asks for confirmation.
- Game ends on checkmate, stalemate, insufficient material, threefold repetition, 50-move rule, running
  out of time (a loss for the side whose clock hits zero), resignation or an agreed draw.
- Move sounds as in Analysis. Promotion via the existing picker.
- **Resume:** the game in progress is saved after every move (`rookahead.play.v1`); opening `/play`
  continues it. Clocks resume from their saved times (time away isn't charged).

## End of game

A result card over the panel: the outcome ("You won by checkmate", "Draw by repetition", …), counts
("2 takebacks · 1 hint"), and **Review this game** (Analysis, reviewing on arrival), **Rematch** (same settings;
a fresh random colour when the colour choice was Random), **New game** (back to setup).

## Games store

`localStorage["rookahead.games.v1"]`: newest first, at most 200:
`{ id, pgn, result: 'win'|'loss'|'draw', reason, color, level, clock, takebacks, hints, endedAt }`.
The PGN has headers Event "Rookahead · vs computer", White/Black ("You", "Rookahead Level 4"), Date,
Result, TimeControl ("-" untimed, "600+5" style), Termination.

## Home

"My recent games" lists the stored games (10, Show more): opponent ("Level 4 · ~1300"), your colour,
result, moves, date, takebacks/hints when used, your accuracy when reviewed (review cache by gameKey),
and **Review** / **Open**. Empty state unchanged when none.

## Engine

`AnalyzeRequest` gains `strength?: { skill?: number; elo?: number }`. The worker sets
`UCI_LimitStrength`/`UCI_Elo` and `Skill Level` per search and restores full strength for searches
without it (only sending options that changed). The computer and hints share the app's engine; Analysis
stays paused while Play is showing.

## Testing

Unit: level table; clock (ticking, increment, flag, pause/resume); game helpers (outcome from chess.js
positions, takeback plies, draw acceptance, PGN headers); games store (order, limit, corrupt storage);
engine strength options sent/restored (fake worker). Browser: setup → game → takeback → hint → resign →
result → Review lands in Analysis; game saved and listed on Home with Review; resume after reload;
timed game shows clocks; phone layout; calibration run (adjacent levels, a few fast games each).
