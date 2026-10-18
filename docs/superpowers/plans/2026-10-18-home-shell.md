# Home Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Home dashboard at `/`, analysis at `/analysis`, a sidebar/tab-bar shell, and a review cache that feeds accuracy into the home page.

**Architecture:** `App` becomes the shell (settings, engine, router, layout); the current `App` body becomes `pages/Analysis.tsx`. Pure helpers (routing, review cache, home stats, Chess.com rating) live in `src/lib` with unit tests. Home hands a game to Analysis through the saved session (the path a refresh already uses), so Analysis needs no new loading code.

**Tech Stack:** React 19, TypeScript, Vitest, Playwright (scratchpad).

**Spec:** `docs/superpowers/specs/2026-10-18-home-shell-design.md`

## Global Constraints

- Routes: `/` home, `/analysis` analysis, `/r#…` share → analysis (address becomes `/analysis`).
- Sidebar 248 px, inset 12 px, radius 22 px, sticky full height; rail 76 px on Analysis; phone < 1000 px: top bar + bottom tab bar.
- Nav items: Play, Puzzles, Analysis, Games; unbuilt ones show "Soon" and are not links. Logo = home.
- Review cache key `rookahead.reviews.v1`, max 300 entries, oldest evicted.
- Accent tokens `--accent-card` (dark `#123d37`), `--accent` (`#22c3a6`), with light-theme values.
- Branch `home-shell`; merge after the user tries the preview.

## Review Focus

- Navigating Home ↔ Analysis must not restart the engine or lose the loaded game. → Task 2 browser check.
- A game reviewed from Home and then opened again shows the same accuracy (cache round trip). → Task 4 browser check.
- Share links still open (they now go through the router). → Task 2 browser check.
- Chess.com unknown user / network error on Home: inline message, no crash. → Task 4 browser check.
- Corrupt `rookahead.reviews.v1` in storage: Home still renders. → Task 1 unit test.

---

### Task 1: Pure helpers

**Files:** Create `src/lib/router.ts`, `src/lib/reviewCache.ts`, `src/lib/home.ts` (+ `.test.ts` for each).
**Produces:**
```ts
// router.ts
export type Route = 'home' | 'analysis'
export function routeFor(pathname: string): Route              // '/' → home; '/analysis', '/r', '/r/' → analysis; anything else → home
export function navigate(path: string): void                   // pushState + notify
export function useRoute(): Route
// reviewCache.ts
export interface CachedReview { token: string; white: string; black: string; accuracy: Record<Color, number | null>; brilliant: Record<Color, number>; at: number }
export function gameKey(headers: PgnHeaders, line: MoveNode[]): string   // Link URL if chess.com, else 'pgn:' + hash of UCI moves
export function loadReviews(storage?: Storage): Record<string, CachedReview>
export function saveReview(key: string, entry: CachedReview, storage?: Storage): void   // keeps ≤ 300, evicts oldest `at`
// home.ts
export function movesInPgn(pgn: string): number                // full moves, ignoring headers and comments
export function homeStats(reviews: CachedReview[], username: string): { avgAccuracy: number | null; reviewed: number; brilliant: number } | null
export function pickRating(stats: unknown): { rating: number; kind: 'rapid' | 'blitz' | 'bullet' } | null
```
- [ ] Tests first: routes incl. `/analysis/` and `/r`; cache round trip, 301st entry evicts the oldest, corrupt JSON → `{}`, storage that throws → no throw; gameKey for chess.com Link vs PGN (same moves → same key); `movesInPgn` on a Chess.com PGN with clocks = 33 for the Opera game; `homeStats` only counts games the user played, last 10 by `at`, case-insensitive name, null when none; `pickRating` rapid > blitz > bullet, null when none. Run → FAIL. Implement → PASS. Commit.

### Task 2: Shell and routing

**Files:** Create `src/pages/Analysis.tsx` (today's App body), `src/components/Sidebar.tsx`, `src/components/TabBar.tsx`, `src/components/PageHeader.tsx`; rewrite `src/App.tsx` as the shell; move session helpers to `src/lib/session.ts`; `src/index.css`.
- [ ] `App`: owns `useSettings`, `useEngine`, route, settings popover state, sidebar collapsed state (`rookahead.sidebar` in localStorage); renders Sidebar (desktop) or top bar + TabBar (phone, `useMediaQuery('(max-width: 999px)')`) and the page.
- [ ] `Analysis` receives `{ settings, updateSettings, engine, status }`; its TopNav is replaced by `PageHeader` ("Analysis", New board, Load game); `/r` handling unchanged except the address becomes `/analysis`. Delete `TopNav.tsx`.
- [ ] Session: `src/lib/session.ts` exports `SESSION_KEY`, `Session` (adds optional `review?: boolean`), `readSession()`, `writeSession(s)`; Analysis starts a review on mount when the restored session has `review: true` (then clears the flag).
- [ ] Analysis saves to the review cache when a review finishes (`gameKey`, `encodeShare` token, accuracy, brilliant counts).
- [ ] Verify: tsc, lint, tests; browser: `/analysis` works as before incl. board size at 1440×900 within 10 px of today's; `/r#…` opens; rail ↔ expanded; phone tab bar; engine status not reloaded after Home → Analysis → Home → Analysis. Commit.

### Task 3: User card

**Files:** Create `src/components/UserCard.tsx`, `src/components/UsernameDialog.tsx`; `src/lib/chesscom.ts` (`fetchRating(username)` using `pickRating`).
- [ ] Card with letter avatar, name, rating (or "Guest" + "Add Chess.com username"), gear → settings. Rail mode: avatar + gear only. Dialog saves `settings.chesscomUser`. Browser: guest → add name → card shows name and rating. Commit.

### Task 4: Home page

**Files:** Create `src/pages/Home.tsx`, `src/components/RecentGames.tsx`; `src/index.css`.
- [ ] Welcome, stats row (`homeStats`), recent games table (fetchRecentGames 30, show 10, Show more), accent card (latest unreviewed), Analysis board + Load a game cards, guest card, phone layout. Review/Open write the session (`review: true` unless cached; cached → evals/classes from the token via `fromSharedGame`) and `navigate('/analysis')`. Load a game → `/analysis` with the Load dialog open (session flag `load: true`).
- [ ] Browser: as in the spec's testing section. Commit.

### Task 5: Preview

- [ ] Build, all suites, push `home-shell`, rerun browser checks on `https://home-shell.rookahead.pages.dev`, hand to the user.
