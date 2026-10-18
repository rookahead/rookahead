# Share Links Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Share a reviewed game, or one moment of it, as a `rookahead.com/r#1.<payload>` link that opens instantly with the sharer's exact verdicts.

**Architecture:** A pure codec (`src/lib/share.ts`) packs the main line, headers and review into a versioned binary record, deflate-compressed and base64url-encoded into the URL fragment. `App.tsx` decodes it on start-up into a game tree plus review evals plus the shipped classes, which override the classifier's verdicts via `withClasses`. A `ShareButton` component handles the share sheet / clipboard.

**Tech Stack:** React 19, TypeScript, chess.js, Vitest (node env), browser `CompressionStream('deflate-raw')`, Playwright (scratchpad only, for browser checks and the preview image).

**Spec:** `docs/superpowers/specs/2026-10-18-share-links-design.md`

## Global Constraints

- Link: `https://rookahead.com/r#1.<payload>`; moment adds `&m=<ply>` (main-line ply, 1 = White's first move).
- Format version `1`; every future decoder must keep decoding version 1.
- Moves and best moves are indices into the position's legal moves **sorted by UCI string**; best move 255 = none.
- Class codes, fixed forever: 0 brilliant · 1 great · 2 best · 3 excellent · 4 good · 5 book · 6 inaccuracy · 7 mistake · 8 miss · 9 blunder · 10 forced.
- Scores White POV; cp clamped to ±15000; mate N → ±(20000+|N|), positive when White mates; finished mate: +20000 = Black mated, −20000 = White mated.
- Header JSON keys: `w` White, `b` Black, `wr` WhiteElo, `br` BlackElo, `r` Result, `d` Date, `t` TimeControl, `x` Termination, `u` Link, `f` start FEN (non-standard start only), `o` `"b"` when the board faced Black. Strings capped at 100 chars.
- No new runtime dependencies. Work on branch `share-links`; merge to `main` only after the user approves the preview deployment and the preview card.
- Copy: banner "Shared review · Review your own games →"; errors "This share link is incomplete or damaged" and "Refresh to open this link"; button "Share", then "Link copied ✓" for 2 s.

## Review Focus

- Opening a link while another game's review is still running: the old run must not write into the shared review (reset before hydrating). → Task 4 browser check.
- Refresh after opening a shared game: the sharer's classes must survive (session stores them). → Task 4 browser check.
- A link with trailing junk from chat apps (`…&m=12).`, a trailing period, whitespace): must still open. → Task 1 `parseShareHash` test.
- `/r` with no or garbage fragment: normal app, no banner, no error. → Task 1 test.
- Promotions and underpromotions (`e7e8n`): must round-trip through the sorted-index encoding. → Task 1 test.

---

### Task 1: Share codec

**Files:**
- Create: `src/lib/share.ts`
- Test: `src/lib/share.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface SharedReview {
    depth: number
    scores: Score[]                // n + 1, White POV
    bestMoves: (string | null)[]   // n, UCI best move in the position before each move
    classes: MoveClass[]           // n
  }
  export interface SharedGame {
    startFen: string
    moves: string[]                // UCI main line
    headers: PgnHeaders            // PGN names: White, Black, WhiteElo, BlackElo, Result, Date, TimeControl, Termination, Link
    orientation: Color
    review?: SharedReview
  }
  export type ShareError = 'damaged' | 'newer-version'
  export const SHARE_VERSION = 1
  export const CLASS_CODES: MoveClass[]  // index = code
  export async function encodeShare(game: SharedGame): Promise<string>                 // "1.<base64url>"
  export async function decodeShare(token: string): Promise<SharedGame | { error: ShareError }>
  export function parseShareHash(pathname: string, hash: string): { token: string; ply: number | null } | null
  export function shareUrl(token: string, ply: number | null, origin: string): string  // `${origin}/r#${token}` (+ `&m=${ply}`)
  ```

- [ ] **Step 1: Write the failing tests** in `src/lib/share.test.ts` (build fixtures with chess.js; `roundTrip = async g => decodeShare(await encodeShare(g))`):
  - `round-trips a reviewed game`: Morphy's Opera game (17 moves), random-but-fixed cp scores, some best moves `null`, classes covering all 11 codes; `expect(await roundTrip(g)).toEqual(g)`.
  - `round-trips a game without a review`: `review` undefined in → undefined out.
  - `round-trips a custom start FEN`: start `8/4P3/8/8/8/8/k7/4K3 w - - 0 1`, moves `['e7e8n']` (underpromotion), headers include no `FEN` key; `startFen` survives.
  - `round-trips mate scores`: scores `{type:'mate',value:3}`, `{type:'mate',value:-2}`, `checkmatedScore('white')`, `checkmatedScore('black')`, cp `20000` clamps to `15000`.
  - `round-trips non-ASCII names and caps long headers`: `White: 'Ýmir 🐉'`; a 150-char `Termination` decodes to its first 100 chars.
  - `orientation black survives`.
  - `keeps a 150-ply game under 2000 characters`: random legal game of 150 plies with review; `shareUrl(token, null, 'https://rookahead.com').length < 2000` and round trip equal.
  - `rejects damaged payloads`: `'1.'`, `'1.!!!'`, the valid token with its last 10 chars cut, a valid token with one move index byte set to 250 (re-encode by hand via the exported helpers or by flipping a byte before compression) → each `{ error: 'damaged' }`. Must not throw.
  - `rejects newer versions`: `'2.' + payload` → `{ error: 'newer-version' }`.
  - `parseShareHash`: `('/r', '#1.abc&m=12')` → `{token:'1.abc', ply:12}`; `('/r', '#1.abc')` → ply `null`; `('/r', '#1.abc&m=12).')` → ply 12; `('/r', '#1.abc. ')` → token `'1.abc'`; `('/r', '')`, `('/r', '#hello')`, `('/', '#1.abc')` → `null`.
- [ ] **Step 2: Run** `npx vitest run src/lib/share.test.ts` — expect FAIL (module not found).
- [ ] **Step 3: Implement `src/lib/share.ts`.** Layout exactly as the spec's "Binary record (version 1)" table. Unsigned LEB128 varints; zigzag for scores. Sorted legal moves: `new Chess(fen).moves({ verbose: true }).map(m => m.lan).sort()` (chess.js `lan` is UCI with promotion). Compression: `new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'))` → `new Response(...).arrayBuffer()`. base64url via `btoa`/`atob` with `+/` ↔ `-_` and padding stripped. Decoding replays every move with chess.js; any out-of-range index, class code > 10, short read or leftover bytes → `'damaged'`; any thrown error inside decode → `'damaged'`. `parseShareHash` matches `/^#(\d+)\.([A-Za-z0-9_-]+)(?:&m=(\d+))?/` only when `pathname` is `/r` (or `/r/`).
- [ ] **Step 4: Run** `npx vitest run src/lib/share.test.ts` — expect PASS; then `npm test` — all pass.
- [ ] **Step 5: Commit** `git add src/lib/share.ts src/lib/share.test.ts && git commit -m "Add share link codec"`.

### Task 2: Game ⇄ shared-game conversion and class overrides

**Files:**
- Modify: `src/lib/share.ts` (add conversions)
- Modify: `src/lib/classify.ts` (add `withClasses`)
- Test: `src/lib/share.test.ts`, `src/lib/classify.test.ts`

**Interfaces:**
- Consumes: Task 1 types.
- Produces:
  ```ts
  // classify.ts — replaces each listed move's class and recounts; accuracy untouched
  export function withClasses(report: GameReport, classes: Record<string, MoveClass>): GameReport
  // share.ts
  export function toSharedGame(line: MoveNode[], headers: PgnHeaders, orientation: Color,
    review: { evals: Record<string, PositionEval>; report: GameReport; depth: number } | null): SharedGame
  export function fromSharedGame(shared: SharedGame): {
    tree: GameTree; headers: PgnHeaders; orientation: Color
    evals: Record<string, PositionEval>          // keyed by FEN; pv = bestMove ? [bestMove] : []
    classes: Record<string, MoveClass> | null    // keyed by node id
  }
  ```
- [ ] **Step 1: Write failing tests:**
  - classify.test: `withClasses(report, {})` deep-equals `report`; overriding one `best` move to `brilliant` moves one count from `best` to `brilliant` for that colour and leaves `accuracy` identical.
  - share.test `toSharedGame → fromSharedGame keeps the review`: build a tree with `treeFromPgn` (Opera game), fabricate evals for every main-line FEN, `report = classifyGame(line, evals)`; convert out and back; `classifyGame(newLine, newEvals)` accuracy equals the original accuracy, `withClasses(that, classes)` gives every node the original `cls`, and headers `White/Black/Result/Link` survive.
  - share.test: `toSharedGame(..., null)` has no `review`; `toSharedGame` with `review.status`-incomplete evals (one FEN missing) also omits `review`.
- [ ] **Step 2: Run** `npx vitest run` — expect the new tests to FAIL.
- [ ] **Step 3: Implement.** `toSharedGame` reads only the main line passed in, takes `startFen` from `line[0].fen`, maps `report.moves[node.id].cls` and `evals[parent.fen].bestMove`; `fromSharedGame` builds the tree with `createTree` + `addMove`, sets `SetUp`/`FEN` headers only for a non-standard start, and sets each eval's `depth` to `review.depth`.
- [ ] **Step 4: Run** `npm test` — PASS.
- [ ] **Step 5: Commit** `git commit -am "Convert games to and from share links"` (add new files if any).

### Task 3: Share button and share text

**Files:**
- Create: `src/components/ShareButton.tsx`
- Modify: `src/lib/share.ts` (text builders), `src/index.css` (only if the button needs a width rule so "Link copied ✓" doesn't jump)
- Test: `src/lib/share.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export function momentShareText(ply: number, san: string, cls: MoveClass, headers: PgnHeaders): string
  export function gameShareText(headers: PgnHeaders, accuracy: Record<Color, number | null> | null): string
  // ShareButton.tsx
  export function ShareButton(props: { getUrl: () => Promise<string>; text: string; className?: string }): JSX.Element
  ```
- [ ] **Step 1: Write failing tests:**
  - `momentShareText(40, 'Nxc4', 'brilliant', {White:'Hikaru', Black:'Bortnyk'})` → `'20… Nxc4!! Brilliant · Hikaru vs Bortnyk, reviewed on Rookahead'`.
  - annotations: great `!`, inaccuracy `?!`, mistake `?`, miss `?`, blunder `??`; best → `'5. e4 Best · …'` (no annotation). Label = `CLASS_INFO[cls].label`.
  - `gameShareText({White:'Hikaru',Black:'Bortnyk'}, {white:86.6, black:81.6})` → `'Hikaru vs Bortnyk: accuracy 87 vs 82, reviewed on Rookahead'`; with `null` → `'Hikaru vs Bortnyk, reviewed on Rookahead'`; missing names → `White vs Black`.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement** the text builders, then `ShareButton`: renders `<button className={`btn ${className}`}>` with a share icon and "Share". On click: `const url = await getUrl()`; if `navigator.share` exists and `matchMedia('(pointer: coarse)').matches` → `navigator.share({ title: 'Rookahead', text, url })` (ignore `AbortError`); else `navigator.clipboard.writeText(url)` → label "Link copied ✓" for 2000 ms; on clipboard failure → `window.prompt('Copy this link', url)`.
- [ ] **Step 4: Run** `npm test` and `npx tsc -b` — PASS / no errors.
- [ ] **Step 5: Commit** `git commit -am "Add share button and share text"` (add new files).

### Task 4: Wire sharing and opening into the app

**Files:**
- Create: `src/components/ShareBanner.tsx`
- Modify: `src/App.tsx` (session, start-up decode, report override, buttons, banner), `src/index.css` (banner styles, Graphite look: surface-2 card, hairline border, muted text, one text button and a close icon)

**Interfaces:**
- Consumes: Task 1 `parseShareHash`, `decodeShare`, `encodeShare`, `shareUrl`; Task 2 `toSharedGame`, `fromSharedGame`, `withClasses`; Task 3 `ShareButton`, text builders.
- Produces: `ShareBanner(props: { kind: 'shared' | 'damaged' | 'newer-version'; onLoadGame: () => void; onClose: () => void })`.

- [ ] **Step 1: Session + override.** Add `sharedClasses: Record<string, MoveClass> | null` state. `report = withClasses(classifyGame(...), sharedClasses)` when set. `Session` gains optional `classes?: MoveClass[]` (main-line order, `null` entries skipped); `restoreSession` maps them back to node ids. `loadGame`, the New board action and `runReview` set `sharedClasses` to `null`. `restoreSession` returns `null` when `parseShareHash(location.pathname, location.hash)` matches, so the old game never flashes.
- [ ] **Step 2: Open on start-up.** One effect on mount: parse → `decodeShare` → on success `cancelReview()`/`resetReview()`, then set game, orientation, `hydrateReview(evals)` (only when the link has a review), `sharedClasses`, tab `review`, and either `setStepping(true)` + current node `line[min(ply, n)]` or the summary; a link without a review follows `settings.autoReview` like `loadGame`. On error: empty board + banner of that kind. Always `history.replaceState(null, '', '/')`. Banner state clears on `loadGame` / New board.
- [ ] **Step 3: Buttons.** Summary CTA: `ShareButton` beside "Start review" with `gameShareText(headers, report.accuracy)`. Step-through coach (`stepCoach`, reviewed main-line moves only): `ShareButton` with `momentShareText(node.ply - line[0].ply, node.san, currentReview.cls, headers)` and ply `node.ply - line[0].ply`. `getUrl` = `encodeShare(toSharedGame(line, headers, orientation, review.status === 'done' && report ? { evals: review.evals, report, depth: <depth of the evals: first eval's depth> } : null))` then `shareUrl(token, ply, location.origin)`. The banner renders at the top of the `.panel` aside.
- [ ] **Step 4: Verify.** `npx tsc -b && npm run lint && npm test` clean (existing two lint warnings allowed). Then `npm run build:web`, `npx vite preview --port 4173`, and a Playwright script (scratchpad) that, on desktop 1440×900 and Pixel 7:
  1. loads the Opera game PGN, waits for the review, clicks the summary Share → reads the clipboard (grant `clipboard-read`/`clipboard-write`; on the phone profile stub `navigator.share` to capture the URL);
  2. opens that URL in a fresh context: banner text "Shared review · Review your own games →", accuracy numbers equal the sharer's, class counts equal, address bar is `/`;
  3. steps to move 10 (Nxb5), clicks the coach Share, opens it fresh: lands on 10. Nxb5 with the Brilliant verdict;
  4. reloads that page: classes and accuracy unchanged (Review Focus: refresh);
  5. starts a review of another PGN, opens a share link mid-review: shared counts are intact after 30 s (Review Focus: running review);
  6. opens `/r#1.garbage` → "This share link is incomplete or damaged", no console errors; opens `/r` → normal app, no banner.
  Expected: all assertions pass, no page errors.
- [ ] **Step 5: Commit** `git add -A && git commit -m "Share reviewed games and moments as links"`.

### Task 5: Preview card, meta tags, preview deployment

**Files:**
- Create: `scripts/og-image.html` (template, kept for regeneration), `public/og.png` (1200×630)
- Modify: `index.html`

- [ ] **Step 1: Make the image.** `scripts/og-image.html` at 1200×630: Graphite dark background, the rook logo from `public/favicon.svg`, "Rookahead" in Geist, "Free chess game review · Stockfish 19 · No sign-up", and a partial board in the Graphite board colours with a Brilliant badge (`CLASS_INFO.brilliant.color`) on one piece. Render with Playwright `page.screenshot({ path: 'public/og.png' })` at deviceScaleFactor 1. Check the PNG is ≤ 300 KB.
- [ ] **Step 2: Meta tags** in `index.html`: `og:title` "Rookahead · Free chess game review", `og:description` = the existing meta description, `og:image` `https://rookahead.com/og.png`, `og:image:width` 1200, `og:image:height` 630, `og:url` `https://rookahead.com/`, `og:type` `website`, `twitter:card` `summary_large_image`.
- [ ] **Step 3: Commit and push the branch:** `git add -A && git commit -m "Add link preview card" && git push -u origin share-links`.
- [ ] **Step 4: Verify the preview deployment** at `https://share-links.rookahead.pages.dev`: `curl -sI …/r` returns 200 with the COOP/COEP headers; `…/og.png` is `image/png`; rerun the Task 4 Playwright script against it.
- [ ] **Step 5: Hand to the user** with the preview URL and the image; merge to `main` (`git checkout main && git merge --ff-only share-links && git push`) only after they approve, then rerun the script against `https://rookahead.com`.
