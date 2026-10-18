# Rookahead

A chess analysis board running **Stockfish 19** in the browser, multi-threaded, with the full NNUE network.

- Live analysis of any position: up to 5 engine lines, best-move arrows, eval bar
- Game review: every move graded with Rookahead's verdicts (Genius, Only move, Precise, Sharp, Solid, Theory, Slip, Error, Oversight, Blunder, Forced),
  accuracy per player, an eval graph marking the key moments, and a step-through mode with commentary
- Paste a PGN / FEN, or import recent games by username
- Play your own moves on the board to explore side variations (promote or delete them later)
- Clocks from the PGN, keyboard navigation, board themes, and the session survives a refresh
- Move sounds (synthesised in the browser, no audio files) and animated pieces, verdicts and summary

## Running it

```bash
npm install     # also copies the Stockfish builds into public/engine/
npm run dev     # http://localhost:5173
```

Requires Node 20+. It starts on the **Lite** engine, a 2 MB network that loads instantly (still far stronger than any human).
Pick **Full** in Settings for the strongest analysis: that downloads the ~100 MB network once, and the browser caches it after that.

### Multi-threading

Multi-threaded WASM needs `SharedArrayBuffer`, which browsers only allow on *cross-origin isolated* pages.
The dev and preview servers send the required headers (see `vite.config.ts`):

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

If you host the built `dist/` elsewhere, send those two headers too, or the app falls back to a single thread.

## How moves are classified

Each move is measured in *expected points*: the mover's win chance before (with the engine's best move) and after.
The loss bands follow Chess.com's published thresholds — excellent < 2%, good < 5%, inaccuracy < 10%, mistake < 20%,
blunder beyond that. On top of those (`src/lib/classify.ts`):

- **Theory** (internally `book`) — the position is in the opening book (Lichess's CC0 opening list, `src/data/openings.json`)
- **Only move** (internally `great`) — the engine's move, and the second-best move is at least 15% worse
- **Genius** (internally `brilliant`) — a (near-)best move that gives up at least two pawns of material the engine's line doesn't win straight back
- **Oversight** (internally `miss`) — your opponent just made a mistake, you were winning, and you let most of it go
- **Accuracy** — Lichess's open formula (volatility-weighted and harmonic means of per-move accuracy)

To rebuild the opening book: `node scripts/build-openings.mjs <dir with a.tsv … e.tsv>` from
https://github.com/lichess-org/chess-openings.

## Keyboard

| Key | Action |
| --- | --- |
| ← / → | Previous / next move |
| ↑ / Home | Start of the game |
| ↓ / End | End of the current line |
| F | Flip the board |
| L | Toggle the engine |
| Space | Play through the moves |

## Scripts

| Command | |
| --- | --- |
| `npm run dev` | Dev server |
| `npm run build` | Type-check and build to `dist/` |
| `npm run preview` | Serve the build (with isolation headers) |
| `npm test` | Unit tests (Vitest) |
| `npm run lint` | Lint (oxlint) |

Set `localStorage.setItem('rookahead.debug', '1')` in the browser console to log all UCI traffic.

## Layout

```
src/
  engine/Engine.ts        Stockfish worker wrapper: UCI, one-search-at-a-time queue, cancellation
  hooks/useAnalysis.ts    Live analysis (with per-position cache) and full-game review
  hooks/useEngine.ts      Engine lifecycle
  lib/tree.ts             Game tree (main line + variations), PGN import/export
  lib/uci.ts              UCI "info" line parser
  lib/evaluation.ts       Score conversion, win %, formatting
  lib/chesscom.ts         Chess.com public API client
  components/             Board (Chessground), eval bar & graph, move list, engine lines, dialogs
```

## Licences

Rookahead is free software under the **GNU General Public License v3.0 or later** (see `LICENSE`).

It builds on Stockfish.js (GPL-3.0) and Chessground (GPL-3.0-or-later), so anyone serving the app must also offer its source under the GPL.
The opening book comes from Lichess's chess-openings (CC0) and the Geist fonts are under the SIL Open Font License.
