import { useEffect, useRef, type ReactNode } from 'react'

/** Mounted only while open, so every opening starts fresh. */
interface Props {
  title: string
  children: ReactNode
  /** The confirming button's label, e.g. "Resign". */
  confirm: string
  /** Say no: e.g. "Keep playing". */
  cancel?: string
  /** The confirming button in the danger colour (for something that can't be undone). */
  danger?: boolean
  onConfirm: () => void
  onClose: () => void
}

/** Asks before doing something final. Confirming closes the dialog first, then acts once it has faded. */
export function ConfirmDialog({ title, children, confirm, cancel = 'Cancel', danger, onConfirm, onClose }: Props) {
  const dialog = useRef<HTMLDialogElement>(null)
  const confirmed = useRef(false)

  useEffect(() => {
    dialog.current?.showModal()
  }, [])

  return (
    <dialog
      ref={dialog}
      className="dialog confirm-dialog"
      onClose={() => {
        // Act (or just unmount) once the closing fade (0.16s in index.css) has played.
        setTimeout(confirmed.current ? onConfirm : onClose, 160)
        requestAnimationFrame(() => (document.activeElement as HTMLElement | null)?.blur())
      }}
      onClick={(e) => {
        if (e.target === dialog.current) dialog.current.close()
      }}
    >
      <div className="dialog-inner">
        <header className="dialog-header">
          <h2>{title}</h2>
        </header>
        <div className="confirm-body">{children}</div>
        <footer className="confirm-actions">
          <button className="btn big ghost" onClick={() => dialog.current?.close()} autoFocus>
            {cancel}
          </button>
          <button
            className={`btn big ${danger ? 'danger-btn' : 'primary'}`}
            onClick={() => {
              confirmed.current = true
              dialog.current?.close()
            }}
          >
            {confirm}
          </button>
        </footer>
      </div>
    </dialog>
  )
}
