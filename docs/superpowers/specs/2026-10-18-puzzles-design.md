# Puzzles: design

Date: 2026-10-18 · Status: approved in chat (rated puzzles + daily puzzle + Learn from your mistakes;
themes, streak and Storm later)

## Goal

A reason to come back every day: rated tactics puzzles from Lichess's free database, one daily
puzzle on Home, and "Learn from your mistakes" puzzles made from your own reviewed games. No
backend: puzzles are static files on Cloudflare Pages, progress lives in this browser.

## Navigation

- The sidebar / tab-bar **Puzzles** item becomes a link to `/puzzles` (no "Soon").
- `/puzzles` = rated puzzles, `/puzzles/daily` = today's puzzle, `/puzzles/mistakes` = your mistakes.
  The page has three tabs for them: **Rated · Daily · Your mistakes**.
- Unlike Play, the page doesn't stay mounted: everything is in the store, so a rated puzzle that hasn't
  counted yet comes back after a trip elsewhere, and Your mistakes picks up newly reviewed games.
- Phones: status, buttons and move controls sit right under the board; tabs and stats follow.

## Puzzle data

Source: `lichess_db_puzzle.csv.zst` (CC0, database.lichess.org). `scripts/build-puzzles.mjs` (run
by hand, output committed) keeps puzzles with RatingDeviation ≤ 90, Popularity ≥ 85, NbPlays ≥ 300,
then per 100-point band (ratings below 400 go into 400, 2800+ into 2800) the 8 000 with the most plays,
about 190k in all.

Output in `public/puzzle-data/`:

- `index.json`: `{ version: 1, bands: { "400": 16, "500": 16, … } }`: shard count per band.
- `<band>-<n>.txt`: 500 puzzles per shard, one per line, shuffled:
  `id fen-with-underscores moves rating themes` (space-separated; FEN spaces become `_`, moves are
  UCI joined with `,`, themes joined with `,`). About 50 KB each, ~20 KB over the wire.
- `daily.txt`: 1 000 puzzles rated 1300–2000 with Popularity ≥ 95, in a fixed shuffled order.
  Day *n* (days since 2026-01-01, UTC) shows line `n mod 1000`.

The `.txt` type is served compressed by Cloudflare. Same-origin fetches, so COEP doesn't interfere.

## Solving (Lichess rules)

- A puzzle's FEN is the position *before* the opponent's last move. That move (`moves[0]`) plays
  itself after a short pause; you play the side to move after it. The board faces your side.
- Your moves must match the solution; after each correct move the reply plays itself (300 ms).
  On the last move, any move that checkmates is also accepted.
- A wrong move is shown, then taken back after a moment. The puzzle counts as **failed** (rating
  goes down once); you can keep trying (no further rating change), **View solution** (plays the rest
  out) or **Skip**.
- Solved / failed: a result strip with the rating change, the puzzle's rating and themes
  ("Fork · Middlegame"), **Next puzzle**, **Analyse** (opens the final position's game in Analysis
  as a fresh board, from the puzzle's start FEN with the solution as the moves) and a link to the
  puzzle on lichess.org (attribution).
- Status line, as in Play: "Your turn: find the best move for White", "Correct, keep going",
  "Solved!", "Not the move", "Solution shown".
- Move navigation (first/prev/next/last, flip) like Play; arrow keys step through what's been played.

## Rated mode

- Puzzle rating: starts 1500, Elo update against the puzzle's rating with
  K = 60 for your first 10 puzzles, 32 up to 50, then 16. Shown as "1532 (+14)".
- Picking: band = your rating ± up to 150 (random offset, so it's not always the same band),
  clamped to the bands that exist; a random shard, then the first puzzle in it you haven't seen.
  Seen ids: last 3 000 kept.
- Stats in the panel: rating, puzzles solved / played, current streak of solved puzzles.
- Storage: `rookahead.puzzles.v1` = `{ rating, played, solved, streak, seen: string[], current?: {id, line} }`.
  The puzzle in progress (its line) is saved so a refresh doesn't skip it; an unfinished rated
  puzzle that was left with a wrong move stays failed.

## Daily puzzle

- `/puzzles/daily` shows today's puzzle (UTC day). Unrated. Solving marks the day done
  (`daily: { day, result }` in the same store).
- Home: a **Daily puzzle** card in the side column, above Analysis board: a small static board of
  the position (after the opponent's move), "White to play · 1650", **Solve** (or "Solved ✓" with
  "Next one tomorrow").

## Learn from your mistakes

- Source: the review cache (`rookahead.reviews.v1`). Each entry's token is decoded; for every main-line
  move by *your* side (the side the board faced, `orientation`) classed **mistake, miss or blunder**
  with a known best move, the position before it becomes a puzzle. Id = `<game key>#<ply>`.
- Shown: "You played **Nf6** here (Blunder). Find a better move." with the board facing your side and
  the game ("vs Level 4 · Oct 18") under it.
- Checking: the engine's best move is always right. Any other move is checked with the engine
  (depth 14, single thread from the app's shared engine): it's right if its expected-point loss
  versus the stored best score is under the **good** band (0.05), i.e. it wouldn't have been an
  Inaccuracy or worse. While checking: "Checking…". A wrong move is taken back with the eval it
  leads to ("That's −1.2. Try again"), unlimited tries, **Show the move** reveals it.
- Solved puzzles leave the queue (`mistakes: { solved: string[] }`); the tab shows how many are
  left ("12 to go"). Order: newest game first, in game order.
- Empty state: "Review a game and your mistakes turn into puzzles here." with **Load a game** and
  **Play the computer**.
- One move per mistake puzzle (no forced continuation); afterwards "The best move was **Bxe5**
  (+2.1); you played Nf6 (−3.4)" and **Next mistake** / **Open game** (Analysis with the saved review).

## Components

- `src/lib/puzzles.ts`: puzzle line parsing, the solving state machine (pure: given a puzzle and the
  moves played, what's next), Elo update, picking a band/shard.
- `src/lib/puzzleStore.ts`: the localStorage store.
- `src/lib/puzzleData.ts`: fetches `index.json`, shards (cached in memory) and the daily line.
- `src/lib/mistakes.ts`: builds mistake puzzles from cached reviews; the move check.
- `src/pages/Puzzles.tsx`: page, tabs, board + panel (reuses Board, PlayerBar-free layout, MoveList-
  style navigation, `play-layout` family of styles).
- `src/components/MiniBoard.tsx`: static board for the Home card (CSS grid of squares + piece SVGs).

## Errors

- Data fetch fails: "Couldn't load puzzles. Check your connection." with **Retry**.
- A corrupt line or an illegal move in data: skip to another puzzle silently.
- Mistakes need the engine only to check non-best moves; until it's ready they wait ("Checking…").

## Testing

Unit: line parsing; solver state machine (correct, wrong, mate alternative on the last move, opponent
replies, view solution); Elo update and K schedule; band picking and clamping; store load/save with
bad data; daily index by date; mistake extraction from a decoded share game (side, classes, best move
present); move-check threshold. Manual: preview branch on phones and desktop, light and dark.

## Round 2 (user feedback, 2026-10-18): Sprint, feedback, streaks

User: no Rush/Storm-style mode; finishing a puzzle shows hardly any sign; make streaks prominent
("a big thing for users"); something like Lichess's puzzle screen, not a copy.

- **Puzzle Sprint** (`/puzzles/sprint`, tab between Rated and Daily): our own timed mode. Modes
  **3 min**, **5 min**, **Survival** (no clock). Puzzle *n* (0-based) is rated about 600 + 60·n (max 2800),
  so it starts easy and climbs. A wrong move ends that puzzle as a strike (×); three strikes or the clock
  ends the run. Replies are quicker than in Rated. Score = puzzles solved; best per mode saved
  (`sprintBest`), "New best!" when beaten. End screen: score, best, the run's puzzles as ✓/✗ chips
  (rating, link to Lichess), **Play again**, **Change mode**. Unrated.
- **Feedback block** in place of the one-line status: a big icon (your side's king on your turn, green
  check for right moves and solved, red cross for wrong), a title ("Your turn", "Best move!",
  "Not the move", "Solved!") and a line under it ("+25 · 4 in a row"). A ✓/✗ badge pops on the board
  square of the move. Sounds: a bright two-note on solve, a low note on a wrong move.
- **Streaks:** *day streak* = consecutive UTC days (as for the daily) with at least one
  puzzle solved in any mode (`days: { last, count, best }`); shown with a flame on the Puzzles panel and the
  Home daily card. Rated shows three tiles: **in a row** (flame), **best run**, **day streak**.
- **Rated extras:** session chips under the board (+25 / −21 per puzzle this visit, green/red);
  **Jump to next puzzle** switch (next one 1 s after a clean solve); **Difficulty** Easiest −600 /
  Easier −300 / Normal / Harder +300 / Hardest +600 on the puzzle pick (rating maths unchanged);
  **Hint** circles the piece to move and counts the puzzle as failed. Prefs in `prefs`.
