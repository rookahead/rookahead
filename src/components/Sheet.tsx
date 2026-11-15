import { useEffect, useRef, type ReactNode } from 'react'

/** Mounted only while open, so every opening starts fresh. */
interface Props {
  title: string
  /** A quiet line under the title. */
  sub?: string
  onClose: () => void
  children: ReactNode
}

/** A short list of choices in a small dialog over the page, which goes when you pick or click outside. */
export function Sheet({ title, sub, onClose, children }: Props) {
  const dialog = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    dialog.current?.showModal()
  }, [])

  return (
    <dialog
      ref={dialog}
      className="dialog sheet"
      aria-label={title}
      onClose={() => {
        // Unmount once the closing fade (0.16s in index.css) has played.
        setTimeout(onClose, 160)
      }}
      onClick={(e) => {
        if (e.target === dialog.current) dialog.current.close()
      }}
    >
      <div className="sheet-inner">
        <header className="sheet-head">
          <h2>{title}</h2>
          {sub && <p className="muted">{sub}</p>}
        </header>
        {children}
      </div>
    </dialog>
  )
}
