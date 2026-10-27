/**
 * Boards line up with the screen's pixels, so a highlighted square has no hairline of the square under it
 * along its edge: their size is a multiple of --board-step (index.css) and Board.tsx nudges each board's
 * corner onto --pixel-unit. The unit is the smallest whole number of CSS pixels that is also whole screen
 * pixels: 1 at 100% or 200%, 4 at 125% (5 screen pixels), 2 at 150%. Odd zooms that need more than 4 make
 * do with the nearest. While a board is dragged by its corner it follows the pointer freely instead, and
 * settles onto the grid when it's let go: a BOARD_SETTLE event tells the boards when. (Resizing the window
 * steps the board instead: freeing it there would jump it a step at the start and end of every resize.)
 */

const RESIZING = 'board-resizing'
export const BOARD_SETTLE = 'board-settle'

let unit = 1

const root = () => document.documentElement

function apply() {
  const free = root().classList.contains(RESIZING)
  root().style.setProperty('--pixel-unit', `${unit}px`)
  // 1/64px: the browser's own layout step, so the board follows every pixel of the drag.
  root().style.setProperty('--board-step', free ? '0.015625px' : `${8 * unit}px`)
}

/** Is a board being resized? Then it isn't snapped to the grid. */
export const boardResizing = () => root().classList.contains(RESIZING)

/** The board's corner handle is dragged, or let go. */
export function setBoardResizing(on: boolean) {
  if (boardResizing() === on) return
  root().classList.toggle(RESIZING, on)
  apply()
  if (!on) window.dispatchEvent(new Event(BOARD_SETTLE))
}

/** Works out the unit for the display's scale, and again whenever the zoom changes. */
export function startPixelGrid() {
  const measure = () => {
    const dpr = devicePixelRatio
    unit = [1, 2, 3, 4].find((n) => Math.abs(dpr * n - Math.round(dpr * n)) < 0.01) ?? 1 / dpr
    apply()
    matchMedia(`(resolution: ${dpr}dppx)`).addEventListener('change', measure, { once: true })
  }
  measure()
}
