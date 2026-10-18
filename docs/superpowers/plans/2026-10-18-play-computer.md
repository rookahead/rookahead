# Play vs Computer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/play` against Stockfish at 8 levels with takebacks and hints; finished games saved and listed on Home.

**Architecture:** Pure modules (`levels`, `clock`, `playGame`, `games`) carry the rules and are unit-tested; `Engine` gains per-search strength options; `pages/Play.tsx` composes them with the existing Board/PlayerBar/MoveList; Home reads the games store.

**Tech Stack:** React 19, TypeScript, chess.js, Stockfish 19 (shared engine), Vitest, Playwright (scratchpad).

**Spec:** `docs/superpowers/specs/2026-10-18-play-computer-design.md`

## Global Constraints

- Levels/ratings/settings/delays exactly as the spec's table. Clocks: Untimed, 10+0, 10+5, 15+10.
- Storage keys: `rookahead.play.v1` (game in progress), `rookahead.games.v1` (≤ 200 finished, newest first), `rookahead.playSetup.v1` (last setup).
- Draw accepted only if |eval| ≤ 30 cp at depth 14 and ≥ 30 plies.
- No eval bar / engine lines / arrows during a game except the hint arrow.

## Review Focus

- Takeback while the computer is thinking: its search must be cancelled and its reply never applied. → Task 3 browser check.
- Promotion by the player and by the computer (UCI with promotion piece). → Task 2 unit test (applyUci), Task 3 browser check.
- Reload mid-game resumes the exact position, clocks and counts. → Task 3 browser check.
- The computer's turn when the page is hidden (navigating to Home): it must still move, or move on return. → Task 3 browser check.
- Corrupt `rookahead.games.v1`: Home still renders. → Task 1 unit test.

---

### Task 1: Pure modules
Files: `src/lib/levels.ts`, `src/lib/clock.ts`, `src/lib/playGame.ts`, `src/lib/games.ts` + tests.
Produces:
```ts
export interface Level { level: number; rating: number; strength: { skill?: number; elo?: number }; depth?: number; movetime?: number; delay: [number, number] }
export const LEVELS: Level[]
export type ClockSetting = 'none' | '600+0' | '600+5' | '900+10'
export interface ClockState { white: number; black: number; running: Color | null; since: number | null; increment: number }  // ms
export function startClock(setting: ClockSetting): ClockState | null
export function remaining(c: ClockState, color: Color, now: number): number
export function press(c: ClockState, mover: Color, now: number): ClockState   // stops mover's time, adds increment, starts the other
export function pause(c: ClockState, now: number): ClockState
export function flagged(c: ClockState, now: number): Color | null
export type Outcome = { result: '1-0' | '0-1' | '1/2-1/2'; reason: 'checkmate' | 'stalemate' | 'insufficient material' | 'threefold repetition' | 'fifty-move rule' | 'timeout' | 'resignation' | 'agreement' }
export function outcomeOf(fen: string, history: string[]): Outcome | null        // from the position (chess.js)
export function takebackPlies(movesPlayed: number, playerColor: Color, startTurn: Color): number  // 1 or 2 (0 = nothing to take back)
export function acceptsDraw(scoreCp: number | null, mate: boolean, plies: number): boolean
export function playPgn(moves: string[], meta: { color: Color; level: number; clock: ClockSetting; outcome: Outcome | null; date: Date }): string
// games.ts
export interface PlayedGame { id: string; pgn: string; result: 'win' | 'loss' | 'draw'; reason: Outcome['reason']; color: Color; level: number; clock: ClockSetting; takebacks: number; hints: number; endedAt: number }
export function loadGames(storage?: Storage): PlayedGame[]
export function saveGame(game: PlayedGame, storage?: Storage): void
```
- [ ] Tests first (each function, edge cases: increment, flag, pause; mate/stalemate/threefold/insufficient; takeback 0/1/2; draw rule; PGN headers + result; store order/limit/corrupt). FAIL → implement → PASS. Commit.

### Task 2: Engine strength options
Files: `src/engine/Engine.ts`, `src/engine/Engine.test.ts`.
- [ ] Test (fake worker): a request with `strength: { elo: 1600 }` sends `setoption name UCI_LimitStrength value true` and `UCI_Elo value 1600` before `go`; `{ skill: 3 }` sends `Skill Level value 3` (and LimitStrength false); a following request without strength restores `UCI_LimitStrength value false` and `Skill Level value 20`; unchanged options aren't resent. FAIL → implement → PASS. Commit.

### Task 3: Play page
Files: `src/pages/Play.tsx`, `src/components/PlaySetup.tsx`, `src/components/GamePanel.tsx`, `src/components/ResultCard.tsx`; `src/lib/router.ts` (route 'play'), `src/lib/nav.ts` (Play path), `src/App.tsx`, `src/index.css`.
- [ ] Router: `/play` → 'play' (test). Shell renders Play (kept mounted like Analysis once visited, `active` prop).
- [ ] Setup → game: state machine per spec; computer move loop (delay, strength, cancel on takeback/abort); hint; draw; resign confirm; clocks with a 250 ms tick only while timed; outcome detection; result card; save to games store; resume.
- [ ] Browser checks as in the spec (incl. Review Focus). Commit.

### Task 4: Home recent games
Files: `src/pages/Home.tsx`, `src/index.css`.
- [ ] List from `loadGames()`; accuracy via `loadReviews()[gameKey(...)]`; Review/Open as before (session hand-off). Browser check. Commit.

### Task 5: Calibration + preview
- [ ] Playwright calibration (levels n vs n+1, 4 fast games each, colours alternating): each higher level scores ≥ 50%; adjust the table if not. Push `play-computer`, run suites on the preview, hand to the user.
