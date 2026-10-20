import { useEffect, useRef, type ReactNode } from 'react'
import { navigate } from '../lib/router'

/** Mounted only while open, so every opening starts fresh. */
interface Props {
  title: string
  onClose: () => void
  /** Between the title and the options: a tab bar. */
  top?: ReactNode
  children: ReactNode
}

/** The frame for a page's settings: title, options that scroll on their own, and the way to all settings.
 *  Changes apply as they're made, so there's no Save. */
export function SettingsDialog({ title, onClose, top, children }: Props) {
  const dialog = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    dialog.current?.showModal()
  }, [])

  return (
    <dialog
      ref={dialog}
      className="dialog options-dialog"
      onClose={() => {
        // Unmount once the closing fade (0.16s in index.css) has played.
        setTimeout(onClose, 160)
        requestAnimationFrame(() => (document.activeElement as HTMLElement | null)?.blur())
      }}
      onClick={(e) => {
        if (e.target === dialog.current) dialog.current.close()
      }}
    >
      <div className="dialog-inner">
        <header className="dialog-header">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={() => dialog.current?.close()} aria-label="Close">
            ✕
          </button>
        </header>
        {top}
        <div className="options-body">{children}</div>
        <footer className="options-foot">
          <button
            className="link-btn"
            onClick={() => {
              dialog.current?.close()
              navigate('/settings')
            }}
          >
            All settings ›
          </button>
        </footer>
      </div>
    </dialog>
  )
}
