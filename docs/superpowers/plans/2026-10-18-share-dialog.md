# Share Dialog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One Share dialog with Link, PGN, FEN, Image, GIF and Embed.

**Architecture:** Pure helpers in `src/lib` (PGN export, frame planning, layout maths) are unit-tested; canvas rendering (`src/lib/render.ts`) and GIF encoding are lazy-loaded from the dialog; the embed viewer is a second Vite entry reusing existing components.

**Tech Stack:** React 19, TypeScript, chess.js, Canvas 2D, `gifenc@1.0.3` (new dependency, MIT), Vitest, Playwright (scratchpad).

**Spec:** `docs/superpowers/specs/2026-10-18-share-dialog-design.md`

## Global Constraints

- NAGs: brilliant `$3`, great `$1`, inaccuracy `$6`, mistake `$2`, miss `$2`, blunder `$4`.
- Image 840 px wide; GIF 480 px wide; GIF speeds 1.6 s / 1 s / 0.5 s; final frame 3 s; "Last 10 moves" = 10 plies.
- Embed sizes 360×470 / 640×420 / 840×560; side-by-side layout from 560 px.
- Footer copy: `<move label> <Class> · rookahead.com`, or `Position · rookahead.com`.
- Work on branch `share-dialog`; merge after the user tries the preview deployment.

## Review Focus

- A game with no review: dialog, PGN (no NAGs), image (no badge), GIF and embed must all still work. → Task 1/3/4 tests.
- Custom start position (FEN games, Black to move first): PGN numbering `1...`, image, GIF first frame. → Task 1 test, Task 3 frame test.
- Very long names in image/GIF bars: truncated with an ellipsis, never overflow. → Task 2 browser check.
- Huge games (150 plies) GIF: must finish without freezing the tab (yields between frames). → Task 3 browser check.
- Embed with `&m=` past the end of the game: clamps to the last move. → Task 4 test.

---

### Task 1: Dialog with Link, PGN and FEN

**Files:** Create `src/lib/pgn.ts`, `src/lib/pgn.test.ts`, `src/components/ShareDialog.tsx`; modify `src/App.tsx`, `src/lib/share.ts` (move label, optional class in `momentShareText`), `src/lib/share.test.ts`, `src/index.css`; delete `src/components/ShareButton.tsx`.

**Interfaces (produces):**
```ts
// pgn.ts
export function exportPgn(line: MoveNode[], headers: PgnHeaders, opts: { classes?: Record<string, MoveClass> | null; clocks: boolean }): string
export function pgnFileName(headers: PgnHeaders): string
export const NAGS: Partial<Record<MoveClass, string>>
// share.ts
export function moveLabel(ply: number, san: string, cls?: MoveClass): string   // "10. Nxb5!!"
export function momentShareText(ply: number, san: string, cls: MoveClass | undefined, headers: PgnHeaders): string
// ShareDialog.tsx
export type ShareMode = 'game' | 'move'
export function ShareDialog(props: { open: boolean; onClose: () => void; initialMode: ShareMode; line: MoveNode[]; currentNode: MoveNode; headers: PgnHeaders; orientation: Color; report: GameReport | null; evals: Record<string, PositionEval> | null; boardTheme: BoardTheme }): JSX.Element
```
- [ ] Tests first (`pgn.test.ts`): Opera game with classes → contains `10. Nxb5 $3 cxb5 $2`, ends with `1-0`, every line ≤ 80 chars; without classes no `$`; clocks `{[%clk 0:09:58]}` and tenths `{[%clk 0:00:09.7]}`; custom FEN start with Black to move → headers `SetUp "1"` + `FEN`, movetext starts `1... `; missing Result → ends `*`; `pgnFileName({White:'A b',Black:'C/d',Date:'2026.10.16'})` → `A_b_vs_C_d_2026-10-16.pgn`, `{}` → `rookahead-game.pgn`. Share tests: `moveLabel(19,'Nxb5','brilliant')` → `10. Nxb5!!`; `momentShareText(19,'Nxb5',undefined,players)` → `10. Nxb5 · Hikaru vs Bortnyk, on Rookahead`. Run → FAIL.
- [ ] Implement `pgn.ts` (own serializer; chess.js has no NAG output), share.ts additions; run → PASS.
- [ ] `ShareDialog` (Link + tabs; Image/GIF/Embed tabs render a placeholder until Tasks 2–4) replacing `ShareButton` in `App.tsx`: info card "Share game" and coach "Share move" (far right) open it. Copy feedback inside the link row.
- [ ] Verify: `npx tsc -b && npm test`; browser: both buttons open the right mode; copy works; PGN download contains `$3`. Commit "Add share dialog with link, PGN and FEN".

### Task 2: Image

**Files:** Create `src/lib/frame.ts` (pure layout), `src/lib/frame.test.ts`, `src/lib/render.ts` (canvas, lazy-loaded); modify `ShareDialog.tsx`.

**Interfaces:**
```ts
// frame.ts
export interface FrameSpec { fen: string; orientation: Color; lastMove?: [string, string]; cls?: MoveClass; top: { name: string; rating?: string }; bottom: { name: string; rating?: string }; caption: string; theme: { light: string; dark: string; lastMove: string } }
export function frameLayout(width: number): { bar: number; board: number; footer: number; height: number; square: number }
export function squareOrigin(square: string, orientation: Color, squareSize: number): { x: number; y: number }
// render.ts
export async function renderFrame(spec: FrameSpec, width: number): Promise<HTMLCanvasElement>
export async function canvasToPng(canvas: HTMLCanvasElement): Promise<Blob>
```
- [ ] Tests: `squareOrigin('a1','white',100)` → `{x:0,y:700}`; `('a1','black',100)` → `{x:700,y:0}`; `('h8','white',100)` → `{x:700,y:0}`; `frameLayout(840).board === 840` and height = bars + board + footer. Run → FAIL, implement, PASS.
- [ ] `render.ts`: pieces from the cburnett CSS via a hidden `.cg-wrap piece` element's computed `background-image`; badge = `ClassIcon` rendered with `renderToStaticMarkup` (lazy) into an SVG image; Geist via `document.fonts.load`; names ellipsized with `measureText`.
- [ ] Image tab: preview `<img>`, Download PNG, Copy image (`ClipboardItem`). Browser check: PNG is 840 wide, names of 60 chars stay inside the bar. Commit "Add board image export".

### Task 3: GIF

**Files:** Create `src/lib/gifPlan.ts`, `src/lib/gifPlan.test.ts`, `src/lib/gif.ts` (lazy, uses gifenc); modify `ShareDialog.tsx`, `package.json`.

**Interfaces:**
```ts
export type GifSpeed = 'slow' | 'normal' | 'fast'
export interface GifFrame { nodeIndex: number; delayMs: number; badge: boolean }
export function planGif(lineLength: number, opts: { speed: GifSpeed; range: 'game' | 'last10'; endIndex: number; notable: boolean[] }): GifFrame[]
export async function encodeGif(frames: HTMLCanvasElement[], delays: number[], onProgress: (done: number, total: number) => void): Promise<Blob>
```
- [ ] Tests: 34-node line, normal, game → 34 frames, first `nodeIndex 0`, delays 1000 except last 3000; last10 with endIndex 19 → nodeIndex 9…19 (11 frames); endIndex 3 → 0…3; fast → 500; badge only where `notable[i]`. FAIL → implement → PASS.
- [ ] `npm i gifenc@1.0.3`; `gif.ts` quantizes each frame (`quantize` 256 colours, `applyPalette`), `await new Promise(r => setTimeout(r))` between frames.
- [ ] GIF tab: speed + range, Make GIF, progress, preview, Download. Browser: file starts `GIF89a`; 150-ply game completes with the page responsive (progress updates). Commit "Add GIF export".

### Task 4: Embed

**Files:** Create `embed.html`, `src/embed/main.tsx`, `src/embed/EmbedApp.tsx`, `src/embed/embed.css`; modify `vite.config.ts` (second input), `public/_headers`, `src/components/Board.tsx` (`viewOnly?: boolean`), `ShareDialog.tsx`.

**Interfaces:** `export function embedUrl(token: string, ply: number | null, origin: string): string` and `export function iframeSnippet(url: string, size: 'small' | 'medium' | 'large', title: string): string` in `share.ts`.
- [ ] Tests: `embedUrl('1.abc',19,'https://rookahead.com')` → `https://rookahead.com/embed#1.abc&m=19`; `iframeSnippet(url,'medium','A vs B · Rookahead')` contains `width="640" height="420"` and the escaped title; a title with `"` and `<` is escaped. FAIL → implement → PASS.
- [ ] Embed app: decode hash with `parseShareHash`-style parsing for `/embed`; clamp `m` to the line; Board `viewOnly`; move list; nav buttons + arrow keys; open-in-Rookahead link; damaged / newer messages.
- [ ] `_headers`: `/embed*` detaches COEP/COOP, adds `Cross-Origin-Resource-Policy: cross-origin`.
- [ ] Embed tab: size, live iframe preview, snippet + copy.
- [ ] Browser: `/embed#<token>` renders and steps; bad token message; a `data:`/other-origin page with the iframe renders it. Commit "Add embeddable game viewer".

### Task 5: Ship to preview

- [ ] `npm run build:web`, lint, full suite, full Playwright run on desktop + phone; push `share-dialog`; rerun against `https://share-dialog.rookahead.pages.dev`; hand to the user.
