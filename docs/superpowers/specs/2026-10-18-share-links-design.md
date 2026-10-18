# Share links: design

Date: 2026-10-18 · Status: approved in chat, awaiting spec review

## Goal

Let a player share a reviewed game, or one moment of it ("20… Nxc4!! Brilliant"), as a link that opens
instantly on rookahead.com with exactly the verdicts the sharer saw. Shared links are Rookahead's main free
growth channel, so every opened link should also invite the visitor to review their own games.

Version 1 has **no backend**: the game and its review travel inside the link. Game-specific preview images
and short links (`/r/<id>`) are a later version.

## Non-goals (v1)

- Per-game preview images, short links, link storage or view counts.
- Sharing side variations (only the main line is shared).
- Any change to the phone layout beyond placing the new buttons (the phone app gets its own design later).

## Link format

```
https://rookahead.com/r#1.<payload>            whole game
https://rookahead.com/r#1.<payload>&m=<ply>    a moment: opens on main-line ply <ply> (1 = White's first move)
```

- `1.` is the **format version**. Links are permanent once posted, so every future version keeps decoding
  every older one. A decoder that meets a higher version than it knows shows "Refresh to open this link".
- The payload lives in the **fragment**, which browsers never send to a server: shared games stay private
  and the static host needs no changes.
- The path is **`/r`** so Cloudflare Web Analytics counts shared-link visits separately from the homepage.
  Cloudflare Pages already serves `index.html` for unknown paths, and all assets use absolute URLs, so
  `/r` loads the normal app. (Verify on the live site; add a `_redirects` rewrite only if needed.)
- `<payload>` = base64url (no padding) of the **deflate-raw** compression of the binary record below,
  using the browser's built-in `CompressionStream` / `DecompressionStream` (no new dependency).

### Binary record (version 1)

All integers are unsigned LEB128 varints unless noted; signed values are zigzag-encoded varints.

| Field | Encoding |
|---|---|
| Header block length | varint, then that many bytes of UTF-8 JSON with short keys (below) |
| Ply count `n` | varint |
| Moves | `n` bytes: each move's index in the position's **legal moves sorted by UCI string** |
| Has review | 1 byte: 0 or 1. When 0 the record ends here |
| Review depth | varint (shown in the engine panel for shipped evals) |
| Scores | `n + 1` signed varints, White's point of view, one per main-line position (start included) |
| Best moves | `n` bytes: index (same sorted order) of the engine's best move in the position before each move; 255 = none |
| Classes | `n` 4-bit codes, two per byte, high nibble first |

- **Sorted legal moves** make move indices independent of chess.js's move-generation order, so a library
  update can never break old links.
- **Scores:** centipawns are clamped to ±15000. A mate in N is stored as `±(20000 + |N|)`, positive when
  White mates. A finished checkmate (`{ type: 'mate', value: 0, mated }`, from `checkmatedScore`) is stored
  as exactly `+20000` when Black is mated and `-20000` when White is mated, and decodes back with `mated` set.
- **Class codes** (fixed forever; new classes get new codes):
  0 brilliant · 1 great · 2 best · 3 excellent · 4 good · 5 book · 6 inaccuracy · 7 mistake · 8 miss ·
  9 blunder · 10 forced.
- **Header JSON keys:** `w`/`b` player names, `wr`/`br` ratings, `r` result, `d` date, `t` time control,
  `x` termination, `u` source game URL, `f` starting FEN (only when the game doesn't start from the
  standard position), `o` orientation (`"b"` when the board faced Black; omitted for White). Missing
  headers are omitted. Each string is capped at 100 characters.

Expected size: about 400–800 characters for a 40–55 move game (measured with real Chess.com games and
this layout). A 150-move game must still produce a working link; test for it.

## What the link reproduces

- The board, moves and PGN headers (names, ratings, result, date, time control, Chess.com link).
- The review: each move's class, the eval bar and graph (from the shipped scores), the coach's "best was …"
  (from the shipped best moves), and accuracy and counts recomputed from the shipped scores with the same
  formulas, so they match the sharer's numbers.
- The shipped classes are used as-is and are **not re-classified**: the recipient sees exactly what the
  sharer saw even if the classifier is tuned later.
- A link made before the review finished carries only the moves; the recipient's browser then reviews it
  normally (respecting their "review automatically" setting).

## Sharing UI

- **Whole game:** a "Share" button beside "Start review" on the review summary.
- **One moment:** a "Share" button in the coach card's actions while stepping through, beside "Next move".
  It links to the current main-line ply. (Not shown on side-variation moves.)
- **Phones** (where `navigator.share` exists and the device is touch-first): open the system share sheet
  with a title, text and URL. **Computers:** copy the URL to the clipboard and change the button label to
  "Link copied ✓" for 2 seconds. If the clipboard is unavailable, show the link in a `window.prompt` so it can be copied by hand.
- **Share text:**
  - Moment: `20… Nxc4!! Brilliant · Hikaru vs Bortnyk, reviewed on Rookahead`
    (classification annotation `!!`, `!`, `?!`, `?`, `??` only where one applies).
  - Game: `Hikaru vs Bortnyk: accuracy 87 vs 82, reviewed on Rookahead`
    (just `Hikaru vs Bortnyk, reviewed on Rookahead` without a review).

## Opening a link

1. On start-up, if the path is `/r` and the fragment holds a payload, decode it before restoring the saved
   session. The shared game replaces the board like "Load game" does (the visitor's previous session is
   overwritten, as with any load).
2. Load the game, apply the shipped review (status "done"), set the orientation, and open on ply `m` in
   step-through mode, or on the review summary when there is no `m`.
3. Replace the address with `/` (`history.replaceState`), so a refresh or a later "Load game" doesn't bring
   the shared game back. The saved session keeps the game itself **and the shipped classes**, so a refresh
   still shows the sharer's verdicts. Starting a new review, loading a game or a new board drops them.
4. Show a banner above the panel: "Shared review · Review your own games →". Its action opens Load game;
   it has a close button; it disappears when the visitor loads or starts another game.
5. **Errors never crash the app.** A payload that fails to decompress, decode or replay legally shows
   "This share link is incomplete or damaged" in the banner on an empty board. An unknown higher version
   shows "Refresh to open this link".

## Preview card

- A static 1200×630 `public/og.png` in the Graphite style: rook logo, "Rookahead", the line
  "Free chess game review · Stockfish 19 · No sign-up", and a board fragment with a Brilliant badge.
  Rendered from an HTML template with Playwright, kept in the repo as a PNG. The user approves the image
  before it ships.
- `index.html` gets `og:title`, `og:description`, `og:image` (absolute `https://rookahead.com/og.png`),
  `og:url`, `og:type`, and `twitter:card` = `summary_large_image`.

## Code layout

- `src/lib/share.ts`: `encodeShare(...)` / `decodeShare(link)`, varints, sorted move indices, class
  codes. Pure functions apart from the compression streams.
- `src/lib/share.test.ts`: round trips and error cases.
- A function that builds a `GameReport` from a line, shipped scores and classes, reusing `moveAccuracy`
  and the counting logic from `classify.ts` (no duplicated formulas).
- `App.tsx`: open-from-link on start-up, the banner, the share actions. A small `ShareButton` component
  holds the share-sheet / clipboard / "Link copied" behaviour.

## Testing

- Unit: encode → decode returns identical moves, headers, scores, best moves and classes, for
  - a normal reviewed game,
  - a game with no review,
  - a game from a custom FEN,
  - games ending in checkmate (mate scores), stalemate and resignation,
  - a 150-move game (also assert the link length stays under 2,000 characters),
  - non-ASCII player names.
- Unit: truncated, altered and empty payloads, an illegal move index and an unknown version all return a
  typed error instead of throwing.
- Unit: the rebuilt report's accuracy and counts equal `classifyGame`'s for the same evals and classes.
- Browser (Playwright, production build): share from the summary and from a moment, open the copied link in
  a fresh context, and check the board, classes, accuracy, banner and cleaned address; on desktop and a
  phone viewport; then once more on the live site.

## Rollout

Build on a `share-links` branch. Cloudflare Pages deploys branches to a preview address
(`share-links.rookahead.pages.dev`), where the user tries it and approves the preview card; then merge to
`main`.

## Later (v2, not in this spec)

Short links and per-game preview images via a Cloudflare Pages Function and KV storage, at
`rookahead.com/r/<id>`. The `/r` path chosen here leaves room for that.
