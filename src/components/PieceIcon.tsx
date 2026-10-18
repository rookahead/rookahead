import { useEffect, useRef } from 'react'

/**
 * A piece image using Chessground's piece set. Its CSS targets
 * `.cg-wrap piece.<role>.<color>`, and React warns about unknown tags like
 * <piece>, so the element is created imperatively.
 */
export function PieceIcon({ role, color }: { role: string; color: 'white' | 'black' }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const piece = document.createElement('piece')
    piece.className = `${role} ${color}`
    ref.current?.replaceChildren(piece)
  }, [role, color])
  return <div className="cg-wrap piece-icon" ref={ref} aria-hidden />
}
