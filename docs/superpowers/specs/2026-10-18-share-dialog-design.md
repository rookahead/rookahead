# Share dialog (Link · PGN · FEN · Image · GIF · Embed): design

Date: 2026-10-18 · Status: approved in chat (user delegated spec sign-off)

## Goal

Replace the two inline Share buttons' copy-to-clipboard behaviour with one Share dialog, like Chess.com's:
a share link plus PGN, FEN, a board image, an animated GIF and an embeddable viewer. Every image, GIF and
embed carries Rookahead branding so shared content brings visitors back.

## Entry points

- Info card footer: **"Share game"** opens the dialog on *Whole game*.
- Coach card actions, far right: **"Share move"** opens it on *This move*.
- Button labels never change (fixes the "Link copied ✓" line wrap).

## Dialog

Built on the same `<dialog>` pattern and styles as `LoadGameDialog`.

**Link (always at the top)**
- Segmented switch: `Whole game | This move · 10. Nxb5!!`. "This move" is available when the current
  node is a main-line move (not the start); its label is the move number + SAN + annotation symbol.
- Read-only link field (the share link from the share-links spec, `&m=<ply>` for a move) with a copy icon
  button; after copying, the icon is replaced by "Copied ✓" for 2 s inside the field row.
- When `navigator.share` exists: a "Share…" button opening the system share sheet with the same text as before.

**Tabs:** PGN · FEN · Image · GIF · Embed (remembered per session while the dialog is open).

**PGN**
- Read-only textarea, copy icon, **Download .pgn** (file name `White_vs_Black_YYYY-MM-DD.pgn`, unsafe characters
  replaced by `_`; `rookahead-game.pgn` without names).
- ☑ Include review: NAGs after each reviewed move, Chess.com's codes: brilliant `$3`, great `$1`,
  inaccuracy `$6`, mistake `$2`, miss `$2`, blunder `$4`; nothing for other classes.
- ☐ Include clocks: `{[%clk h:mm:ss]}` (tenths kept when present, e.g. `0:00:09.7`) after moves that have a clock.
- Main line only. Headers: the game's headers in their original order; `SetUp`/`FEN` for custom starts.
  Result token at the end (`*` if unknown). Lines wrapped at 80 characters.

**FEN:** the current position's FEN in a read-only field with copy.

**Image**
- Preview of a PNG rendered client-side from the current position (or the shared move's position when the
  dialog is on *This move*; the current position otherwise).
- Layout (840 px wide): top player bar (name, rating) · board 8×8 in the user's board theme and orientation,
  last move highlighted with the theme's last-move colour, the move's classification badge on the
  destination square's top-right corner (as on the live board) · bottom player bar · footer
  `10. Nxb5!! Brilliant · rookahead.com` (or `Position · rookahead.com` at the start), Graphite dark colours.
- Pieces: the cburnett set the board uses. Badge: the same artwork as `ClassIcon`.
- **Download PNG** and, when `ClipboardItem` exists, **Copy image**.

**GIF**
- Animated GIF of the main line, same frame layout as Image at 480 px wide.
- Options: speed Slow 1.6 s / Normal 1 s / Fast 0.5 s per move; range Whole game / Last 10 moves
  (the 10 plies up to and including the dialog's move, or the game's end).
- Badges only on notable classes (brilliant, great, inaccuracy, mistake, miss, blunder) to keep the GIF calm;
  final frame held 3 s; the first frame is the position before the range.
- "Make GIF" → progress bar (frames encoded / total) → preview + **Download GIF**. Encoding in the browser with
  `gifenc` (MIT); it yields to the UI between frames.

**Embed**
- Viewer page at `rookahead.com/embed#<token>[&m=<ply>]` using the share-link token format.
- Shows board (view only), player bars, the move list with classification icons, ◀ ▶ |◀ ▶| buttons and
  arrow keys, and "Open full review on Rookahead ↗" linking to `rookahead.com/r#<token>[&m=…]` in a new tab.
  No engine, no settings, no storage. Dark Graphite theme, board theme Graphite.
- Responsive: ≥ 560 px wide → board left, move list right; narrower → stacked, move list hidden.
- Damaged/newer links show the same messages as the main app, centred.
- Embed tab: size Small 360×470 / Medium 640×420 / Large 840×560 (default Medium), a live preview iframe,
  and the `<iframe>` snippet with copy:
  `<iframe src="https://rookahead.com/embed#…" width="640" height="420" style="border:0;border-radius:8px" title="White vs Black · Rookahead" loading="lazy" allowfullscreen></iframe>`
- Headers: `/embed` keeps working inside other sites. Cloudflare `_headers` detaches COEP/COOP for `/embed*`
  (`! Cross-Origin-Embedder-Policy`, `! Cross-Origin-Opener-Policy`) and sets
  `Cross-Origin-Resource-Policy: cross-origin`. No `X-Frame-Options`.
- Built as a second Vite entry (`embed.html` → `src/embed/main.tsx`), reusing `Board`, `PlayerBar`, `MoveList`,
  the share codec and `withClasses`.

## Non-goals

Video export, custom GIF sizes, light-theme embeds, embed analytics.

## Testing

- Unit: PGN export (NAGs, clocks incl. tenths, custom FEN, result, wrapping, file names); GIF frame planning
  (range, timings, which frames get badges); image layout maths (square → pixel for both orientations);
  move-label for the switch.
- Browser (Playwright, preview build + preview deployment): dialog opens from both buttons on the right mode;
  copy link; PGN download contents contain `$3` on 10. Nxb5; PNG downloads and decodes to 840 px wide; GIF
  downloads, starts with `GIF89a`, frame count = range + 1; embed page renders from a token, steps with ▶,
  shows the damaged message for a bad token, and loads inside an iframe on a page from another origin;
  no page errors; desktop and phone.
