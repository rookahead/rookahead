# Home shell: design

Date: 2026-10-18 · Status: approved in chat (mockup https://claude.ai/artifact/6vo5dNwD5BrzirSmSje9tN; user delegated spec sign-off)

## Goal

Turn Rookahead from a single analysis board into an app with a home dashboard, a sidebar and room for Play,
Puzzles and Games. This step builds the shell and a home page with **only what works today**: your recent
Chess.com games with review and accuracy, and the ways into the analysis board.

## Routes

| Path | Page |
|---|---|
| `/` | Home |
| `/analysis` | The current analysis board |
| `/r#…` | Share links: open in Analysis, then the address becomes `/analysis` |
| `/embed`, `/about`, `/privacy` | Unchanged (separate pages) |

A tiny History-API router (no dependency). Internal links navigate without reloading, so the engine,
settings and loaded game survive moving between pages. Cloudflare Pages already serves `index.html` for
unknown paths.

## Layout

- **Desktop (≥ 1000 px): a floating sidebar panel**, inset 12 px, rounded 22 px, a shade lighter than the
  page, sticky at full window height (the user card is always visible).
  - Top: the Rookahead logo and name = home (no Home item).
  - Items: Play, Puzzles, Analysis, Games. Pages not built yet show a small "Soon" tag and aren't links.
  - Bottom: the **user card** (letter avatar, Chess.com username, rapid rating, settings gear), then
    About · Privacy · GitHub.
  - On the Analysis page the sidebar is a **76 px icon rail** (logo, item icons, avatar, gear) so the board
    keeps its size; a button expands it, and the choice is remembered.
- **Phone (< 1000 px):** a top bar (logo = home, avatar = settings) and a **bottom tab bar** with the four
  items. The analysis page keeps its pinned move controls above the tab bar.
- The old top nav goes. The Analysis page gets a slim header in its place: "Analysis" on the left,
  New board and Load game on the right (same height as the old nav, so the board size is unchanged).
- Settings open from the gear (desktop: a popover above the user card; phone: from the avatar).

## User card and identity

There are no accounts. The "user" is the Chess.com username saved in settings.
- With a username: name, and rating from `api.chess.com/pub/player/<u>/stats` (rapid, else blitz, else
  bullet; cached for the session). Avatar = the name's first letter (Chess.com avatar images can't load on an
  isolated page).
- Guest: "Guest" with an "Add Chess.com username" action opening a small dialog.

## Review cache

`localStorage["rookahead.reviews.v1"]`: `{ [gameKey]: { token, accuracy, brilliant, at } }`
- `gameKey` = the game's Chess.com URL (`Link` header), else `pgn:` + a hash of the main-line moves.
- `token` = the share-link token (game + review, ~0.5 KB), `accuracy`/`brilliant` = per colour.
- Saved whenever a review finishes. At most 300 entries; the oldest go first. Storage errors are ignored.

## Home page

- **Welcome line:** "Welcome back, <username>" / "Welcome to Rookahead".
- **Stats row** (only when the user has reviewed games): your average accuracy over your last 10 reviewed
  games, games reviewed, your brilliant moves. Computed from the cache for the saved username.
- **Recent games** (Chess.com, newest first, 10 shown + "Show more" to 30): time control, players with
  ratings and colour, result from your side (Won/Lost/Draw), accuracy (yours / theirs) when reviewed,
  moves, date, and a **Review** (not reviewed: opens Analysis and starts the review) or **Open** (cached:
  opens instantly with the cached review) button.
- **Right column:**
  - The **teal accent card**: "Review your latest game" with the latest unreviewed game (opponent, result,
    time) and a Review button; when everything is reviewed, the latest game's accuracy and Open.
  - **Analysis board** (empty board) and **Load a game** (opens Analysis with the Load dialog).
- **Guest:** in place of games and stats, a card asking for a Chess.com username (input + Save), plus the
  two quick cards. Errors from Chess.com (unknown user, network) show inline with Retry.
- Phone: accent card first, quick cards, then a compact game list.
- Look: the mockup's tonal cards (no borders, 18–20 px radius) on the app's theme tokens, so light mode
  works; one accent (teal) via `--accent-card` / `--accent` tokens.

## Out of scope

Play, Puzzles, Games pages, daily puzzle, puzzle goal, "mistakes to fix" (later steps); moving the sponsor
card (stays on Analysis).

## Testing

Unit: route matching; review-cache save/limit/eviction/corrupt storage; gameKey; move counting from PGN;
home stats from cache entries; Chess.com rating pick. Browser (desktop + phone, preview build then preview
deployment): `/` home as guest → save username → games list; Review → analysis reviews → back home shows
accuracy and Open; Open loads instantly with the same accuracy; share link `/r#…` opens in analysis;
sidebar rail on analysis + expand; phone tab bar; settings from gear/avatar; no page errors.
