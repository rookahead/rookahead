# Verdict Rulebook Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the classifier follow `docs/rulebook.md`: hard-to-find tracking, the new Legendary and Clutch rules, and graded bad theory.

**Architecture:** The review search already reports the engine's preferred move after every depth; we keep the moves it preferred up to depth 8 on each `PositionEval` (`early`). `classifyGame` in `src/lib/classify.ts` reads them to decide "hard to find", and its Legendary / Clutch / Theory branches change to the rulebook's rules. The sacrifice detector learns pawns and tells an exchange sacrifice apart.

**Tech Stack:** TypeScript, React 19, chess.js, Vitest.

**Spec:** `docs/rulebook.md`

## Global Constraints

- Branch `verdict-rules`. Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Rulebook numbers, as named constants in `src/lib/classify.ts`: `HARD_DEPTH = 2` (was 8; tuned, see ledger), only-good gap `LOSS_BANDS.inaccuracy` (0.10), second-best still winning `85`, level `HOLDS = 45`, holding `HOLDING = 30`, completely winning `97`, `LEGENDARY_LOSS = 0.035`, sacrifice `2` pawns, fast mate `N ≥ 2` / next-best `N + 3`, Oversight margin `5`.
- No position data saying when the engine settled (`early` missing: old sessions, shared links) counts as hard to find, so existing reviews grade as before.
- Share-link format v1 never changes (`src/lib/share.ts`); `early` is not added to links.
- The order verdicts are decided in: Forced → Theory → scale → Legendary → Clutch → Oversight.

## Review Focus

- A position whose search never reaches depth 8 (mate found at depth 3, node cap hit): `early` holds what was seen, the move counts as hard only if it's absent → test in Task 1.
- A book move that's an Oversight-level error (opponent blundered in the opening): graded, theory ends → test in Task 4.
- A mating sacrifice where the sacrificed piece was already hanging and other moves also win clearly: not Legendary (the hanging-again rule still applies on the mating route) → existing test `is not "brilliant" when already mating` must keep passing in Task 3.
- An ordinary pawn trade in the engine line (pawn taken, pawn taken back): not a sacrifice now that pawns count → test in Task 3.
- An only move that's obvious (the engine prefers it from depth 1): stays Best → test in Task 2.

---

### Task 1: Record the engine's early choices

**Files:**
- Modify: `src/lib/classify.ts` (constant, `ReviewedPosition`, helpers)
- Modify: `src/hooks/useAnalysis.ts:8-16` (`PositionEval`), `:216-236` (`evaluate`)
- Test: `src/lib/classify.test.ts`

**Interfaces:**
- Produces: `export const HARD_DEPTH = 8`; `ReviewedPosition.early?: string[]` and `PositionEval.early?: string[]` (UCI moves the engine preferred at some depth ≤ 8); `export function earlyChoice(result: { lines: { depth: number; pv: string[] }[] }): string | null` (the top line's first move when its depth ≤ `HARD_DEPTH`, else null); `export function hardToFind(position: ReviewedPosition, uci: string): boolean` (true when `early` is missing or doesn't include `uci`).

- [ ] **Step 1: Write the failing tests** in a new `describe('hard to find')`:

```ts
it('takes the top move only from shallow depths', () => {
  expect(earlyChoice({ lines: [{ depth: 8, pv: ['e2e4', 'e7e5'] }] })).toBe('e2e4')
  expect(earlyChoice({ lines: [{ depth: 9, pv: ['d2d4'] }] })).toBeNull()
  expect(earlyChoice({ lines: [] })).toBeNull()
})
it('is hard when the engine never preferred the move early', () => {
  const pos = { score: cp(0), bestMove: 'g1f3', pv: [], early: ['e2e4', 'd2d4'] }
  expect(hardToFind(pos, 'g1f3')).toBe(true)
  expect(hardToFind(pos, 'e2e4')).toBe(false)
  expect(hardToFind({ ...pos, early: undefined }, 'e2e4')).toBe(true) // no data: as before
  expect(hardToFind({ ...pos, early: [] }, 'e2e4')).toBe(true) // the search never got a shallow result
})
```

- [ ] **Step 2: Run** `npx vitest run src/lib/classify.test.ts` — FAIL (`earlyChoice` not exported).
- [ ] **Step 3: Implement** `HARD_DEPTH`, `early` on `ReviewedPosition`, `earlyChoice`, `hardToFind` in `classify.ts`.
- [ ] **Step 4: Collect in the review.** Add `early?: string[]` to `PositionEval` (doc comment: moves preferred up to `HARD_DEPTH`, for "hard to find"). In `evaluate`, per attempt create a `Set<string>`, pass `onUpdate: (r) => { const m = earlyChoice(r); if (m) early.add(m) }` to `eng.analyze`, and return `early: [...early]` with the entry. Terminal positions get no `early`.
- [ ] **Step 5: Run** `npx vitest run && npx tsc -b` — all pass.
- [ ] **Step 6: Commit** `Review keeps the moves Stockfish preferred up to depth 8, for "hard to find"`.

### Task 2: Clutch follows the rulebook

**Files:**
- Modify: `src/lib/classify.ts` (`classifyGame`, the `onlyGood` / `onlyMate` block and the `great` branch)
- Test: `src/lib/classify.test.ts`

**Interfaces:**
- Consumes: `hardToFind(before, node.uci)` from Task 1.
- Produces: `const HOLDING = 30` (module-private).

- [ ] **Step 1: Write the failing tests:**

```ts
it('calls an only move that holds a worse game "great"', () => {
  // −1.5 (36.5%) where the next-best is −5 (13.7%).
  const { line, evals } = game(['e2e4'], [{ score: cp(-150), bestMove: 'e2e4', second: cp(-500) }, { score: cp(-150) }])
  expect(classifyGame(line, evals).moves[line[1].id].cls).toBe('great')
})
it('does not call an obvious only move "great"', () => {
  const { line, evals } = game(['e2e4'], [{ score: cp(0), bestMove: 'e2e4', second: cp(-400), early: ['e2e4'] }, { score: cp(0) }])
  expect(classifyGame(line, evals).moves[line[1].id].cls).toBe('best')
})
// inside describe('mating lines'):
it('does not call the only fast mate "great" when the engine sees it at once', () => {
  const { line, evals } = game(['g2h3'], [{ score: mate(-5), bestMove: 'g2h3', second: mate(-9), early: ['g2h3'] }, { score: mate(-4) }], start)
  expect(classifyGame(line, evals).moves[line[1].id].cls).toBe('best')
})
```

Existing `does not call a move "great" when it only loses less` (−3 vs −9, 24.9%) must stay `best`.

- [ ] **Step 2: Run** — the new tests FAIL.
- [ ] **Step 3: Implement:** `onlyGood` uses `winAfter >= HOLDING` instead of `HOLDS`; Clutch needs `hard` (computed once per move as `hardToFind(before, node.uci)`) for both the only-good and the only-fast-mate route. Keep the recapture exclusion.
- [ ] **Step 4: Run** `npx vitest run` — all pass.
- [ ] **Step 5: Commit** `Clutch: must be hard to find, and holding a worse game (−2.3 or better) counts`.

### Task 3: Legendary follows the rulebook

**Files:**
- Modify: `src/lib/classify.ts` (`isSacrifice`, `acceptedSacrifice`, `offeredSacrifice`, the `brilliant` branch)
- Test: `src/lib/classify.test.ts`

**Interfaces:**
- Consumes: `hardToFind` (Task 1), `onlyGood`, `onlyMate`, `hard` (Task 2).
- Produces: `export type Sacrifice = 'material' | 'exchange'`; `export function sacrifice(beforeFen: string, afterFen: string, pv: string[], color: Color, expected = Infinity, stillHanging = false): Sacrifice | null`; `isSacrifice(...)` keeps its signature and returns `sacrifice(...) !== null`; `export const LEGENDARY_LOSS = 0.035`.

Rules for `sacrifice`: the accepted route counts any captured piece, pawns included, as long as the mover ends at least 2 down against the baseline and the next move doesn't take it straight back (the existing `down()` check). It's `'exchange'` when the only piece of ours taken in the line was a rook and the net material given up is under 3; the offered route is `'exchange'` when the hanging piece is a rook and its cheapest taker is a knight or bishop. Everything else that qualifies is `'material'`.

- [ ] **Step 1: Write / change the failing tests:**

```ts
// in 'detects sacrifices from the engine line': flip the pawn case
expect(isSacrifice('3q2k1/8/8/8/4P3/3P4/8/6K1 w - - 0 1', '3q2k1/8/8/8/3PP3/8/8/6K1 b - - 0 1', ['d8d4', 'g1h1', 'd4e4'], 'white')).toBe(true)

it('does not count a pawn trade as a sacrifice', () => {
  // 1.d4 d5 2.c4 dxc4 3.e3: the engine line takes c4 back.
  expect(isSacrifice('rnbqkbnr/ppp1pppp/8/8/2pP4/8/PP2PPPP/RNBQKBNR w KQkq - 0 3', 'rnbqkbnr/ppp1pppp/8/8/2pP4/4P3/PP3PPP/RNBQKBNR b KQkq - 0 3', ['g8f6', 'f1c4'], 'white')).toBe(false)
})

const EXCHANGE = '4k3/8/1n6/8/4P3/8/8/3RK3 w - - 0 1' // 1.Rd5 Nxd5 2.exd5: a rook for a knight
const EXCHANGE_AFTER = '4k3/8/1n6/3R4/4P3/8/8/4K3 b - - 1 1'
it('tells an exchange sacrifice apart', () => {
  expect(sacrifice(EXCHANGE, EXCHANGE_AFTER, ['b6d5', 'e4d5'], 'white')).toBe('exchange')
  expect(sacrifice('4k3/8/2n5/8/8/8/8/3RK3 w - - 0 1', '4k3/8/2n5/8/3R4/8/8/4K3 b - - 1 1', ['c6d4'], 'white')).toBe('material')
})

const ROOK_SAC = '6k1/8/8/4p3/8/8/8/3R2K1 w - - 0 1' // 1.Rd4 exd4
it('calls a hard sacrifice up to 3.5% short of the top move "brilliant"', () => {
  const at = (after: number) => (({ line, evals }) => classifyGame(line, evals).moves[line[1].id].cls)(game(['d1d4'], [{ score: cp(100), bestMove: 'd1d5' }, { score: cp(after), pv: ['e5d4'] }], ROOK_SAC))
  expect(at(70)).toBe('brilliant') // 2.7% short
  expect(at(55)).toBe('good') // 4.1% short
})
it('does not call an obvious sacrifice "brilliant"', () => {
  const { line, evals } = game(['d1d4'], [{ score: cp(100), bestMove: 'd1d4', early: ['d1d4'] }, { score: cp(100), pv: ['e5d4'] }], ROOK_SAC)
  expect(classifyGame(line, evals).moves[line[1].id].cls).toBe('best')
})
it('calls an exchange sacrifice "brilliant" only when it is the only good move', () => {
  const at = (second: number) => (({ line, evals }) => classifyGame(line, evals).moves[line[1].id].cls)(game(['d1d5'], [{ score: cp(100), bestMove: 'd1d5', second: cp(second) }, { score: cp(100), pv: ['b6d5', 'e4d5'] }], EXCHANGE))
  expect(at(90)).toBe('best')
  expect(at(-100)).toBe('brilliant')
})
it('calls a mating sacrifice "brilliant"', () => {
  // Morphy, 16.Qb8+ Nxb8 17.Rd8#
  const { line, evals } = game(['b3b8'], [{ score: mate(2), bestMove: 'b3b8', second: cp(400) }, { score: mate(1), pv: ['d7b8', 'd1d8'] }], morphyBeforeQb8)
  expect(classifyGame(line, evals).moves[line[1].id].cls).toBe('brilliant')
})
```

`morphyBeforeQb8`: play the Opera game (`OPERA` in `share.test.ts`) up to 15…Nxd7 with chess.js at the top of the test file and take `fen()`. `mate` is the helper already used in the file (`{ type: 'mate', value }`). The existing `a piece left hanging again` tests must keep passing (the mating route uses the same `stillHanging = onlyGood`).

- [ ] **Step 2: Run** — the new tests FAIL.
- [ ] **Step 3: Implement** `sacrifice` and the Legendary branch: `loss < LEGENDARY_LOSS && hard && winAfter >= HOLDS && kind && (kind !== 'exchange' || onlyGood) && winBefore < 97`, or the mating route `onlyMate && hard && kind`. Legendary replaces Best, Strong or Solid only (never Forced/Theory). Update the doc comments to say pawns count.
- [ ] **Step 4: Run** `npx vitest run` — all pass.
- [ ] **Step 5: Commit** `Legendary: up to 3.5% short of best, hard to find, pawn sacrifices count, exchange sacrifices only as the only good move, and mating sacrifices`.

### Task 4: Bad theory gets graded

**Files:**
- Modify: `src/lib/classify.ts` (`classifyGame`, the book branch)
- Test: `src/lib/classify.test.ts`

- [ ] **Step 1: Write the failing test:**

```ts
it('grades a book move that loses real ground, and ends theory there', () => {
  // all four positions in book; 1...e5 drops from 30 to 250 (a Mistake for Black)
  const { line, evals } = game(['e2e4', 'e7e5', 'g1f3', 'b8c6'], [cp(30), cp(30), cp(250), cp(250), cp(250)].map((score) => ({ score, bestMove: 'x' })))
  const report = classifyGame(line, evals, () => true)
  expect(line.slice(1).map((n) => report.moves[n.id].cls)).toEqual(['book', 'mistake', 'best', 'best'])
})
```

- [ ] **Step 2: Run** — FAIL (`book` for 1…e5).
- [ ] **Step 3: Implement:** compute the scale verdict before the book check; a book position whose scale verdict is `mistake` or `blunder` (Oversight is decided from those) leaves theory and goes through the normal path.
- [ ] **Step 4: Run** `npx vitest run && npx tsc -b && npx oxlint` — pass, no new warnings.
- [ ] **Step 5: Commit** `Theory: a book move that's a Mistake or worse gets graded, and theory ends there`.

### Task 5: Docs, check in the app, preview

**Files:**
- Modify: `README.md` (section "How moves are classified")

- [ ] **Step 1:** Replace the README section's verdict bullets with one line pointing to `docs/rulebook.md` as the source of truth, keeping the Accuracy bullet.
- [ ] **Step 2:** Run the dev server, load the Opera game (Load game → paste PGN), run a Standard review, and check: 16.Qb8+ is Legendary; no move the engine plays from depth 1 is Clutch; the summary table and move list render. Screenshot desktop dark + light.
- [ ] **Step 3: Commit** `README points to the rulebook`, push `verdict-rules`, and share the preview link https://verdict-rules.rookahead.pages.dev.
