import { useEffect, useRef, type RefObject } from 'react'

/** Room between the column's edge and the handle, px. */
const GAP = 6
/** How long the handle stays after the column stops moving, ms. */
const LINGER_MS = 900
/** The shortest it gets, px, so a long column's handle can still be caught. */
const MIN_H = 32

/**
 * A thin handle beside a column that scrolls by itself: it shows only while the column moves (or while you hold or
 * point at it), then fades. Drag it to scroll. It draws nothing when the column fits.
 */
export function ScrollHandle({ target }: { target: RefObject<HTMLElement | null> }) {
  const thumb = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = target.current
    const t = thumb.current
    if (!el || !t) return
    let hide = 0
    let held = false
    let startY = 0
    let startTop = 0
    const place = () => {
      const box = el.getBoundingClientRect()
      const room = el.scrollHeight - el.clientHeight
      if (room <= 1) return false
      const h = Math.max(MIN_H, (el.clientHeight / el.scrollHeight) * box.height)
      t.style.left = `${box.right + GAP}px`
      t.style.top = `${box.top + (el.scrollTop / room) * (box.height - h)}px`
      t.style.height = `${h}px`
      return true
    }
    const show = () => {
      clearTimeout(hide)
      if (!place()) return t.classList.remove('on')
      t.classList.add('on')
      if (!held && !t.matches(':hover')) hide = window.setTimeout(() => t.classList.remove('on'), LINGER_MS)
    }
    const follow = () => t.classList.contains('on') && place()
    const down = (e: PointerEvent) => {
      e.preventDefault()
      held = true
      startY = e.clientY
      startTop = el.scrollTop
      t.setPointerCapture(e.pointerId)
      t.classList.add('held')
      clearTimeout(hide)
    }
    const move = (e: PointerEvent) => {
      if (!held) return
      const track = el.getBoundingClientRect().height - t.offsetHeight
      el.scrollTop = startTop + ((e.clientY - startY) * (el.scrollHeight - el.clientHeight)) / Math.max(1, track)
    }
    const up = () => {
      held = false
      t.classList.remove('held')
      show()
    }
    const enter = () => clearTimeout(hide)
    el.addEventListener('scroll', show, { passive: true })
    window.addEventListener('scroll', follow, { passive: true })
    window.addEventListener('resize', follow)
    t.addEventListener('pointerdown', down)
    t.addEventListener('pointermove', move)
    t.addEventListener('pointerup', up)
    t.addEventListener('pointercancel', up)
    t.addEventListener('pointerenter', enter)
    t.addEventListener('pointerleave', show)
    return () => {
      clearTimeout(hide)
      el.removeEventListener('scroll', show)
      window.removeEventListener('scroll', follow)
      window.removeEventListener('resize', follow)
      t.removeEventListener('pointerdown', down)
      t.removeEventListener('pointermove', move)
      t.removeEventListener('pointerup', up)
      t.removeEventListener('pointercancel', up)
      t.removeEventListener('pointerenter', enter)
      t.removeEventListener('pointerleave', show)
    }
  }, [target])
  return <div ref={thumb} className="scroll-handle" aria-hidden />
}
