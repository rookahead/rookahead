import { useEffect, useRef, useState } from 'react'
import { CLASS_INFO, type MoveClass } from '../lib/classify'
import { NOTE_MAX, type Opinion } from '../lib/reports'
import { ClassIcon } from './ClassIcon'
import { San } from './San'

/** Mounted only while open, so every opening starts fresh. */
interface Props {
  /** "12." or "12…" */
  moveNumber: string
  san: string
  verdict: MoveClass
  /** Sends the report; resolves to an error message, or null once it's in. */
  onSend: (opinion: Opinion, note: string) => Promise<string | null>
  onClose: () => void
}

const OPINIONS: [Opinion, string][] = [
  ['harsh', 'Too harsh'],
  ['generous', 'Too generous'],
  ['other', 'Something else'],
]

/** "Report this verdict": what's wrong with it in one tap, a note if they like, then a thank-you. */
export function ReportDialog({ moveNumber, san, verdict, onSend, onClose }: Props) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [opinion, setOpinion] = useState<Opinion | null>(null)
  const [note, setNote] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  useEffect(() => {
    dialog.current?.showModal()
  }, [])

  const close = () => dialog.current?.close()
  const send = async () => {
    if (!opinion || sending) return
    setSending(true)
    setError(null)
    const problem = await onSend(opinion, note)
    setSending(false)
    if (problem) setError(problem)
    else setSent(true)
  }

  return (
    <dialog
      ref={dialog}
      className="dialog confirm-dialog report-dialog"
      onClose={() => {
        // Unmount once the closing fade (0.16s in index.css) has played.
        setTimeout(onClose, 160)
        requestAnimationFrame(() => (document.activeElement as HTMLElement | null)?.blur())
      }}
      onClick={(e) => {
        if (e.target === dialog.current) close()
      }}
    >
      <div className="dialog-inner">
        <header className="dialog-header">
          <h2>{sent ? 'Thanks for the report' : 'Report this verdict'}</h2>
        </header>
        <div className="report-move">
          <ClassIcon cls={verdict} size={22} />
          <span className="report-move-name">
            <span className="muted">{moveNumber}</span> <San san={san} />
          </span>
          <span className="report-verdict" style={{ color: CLASS_INFO[verdict].color }}>
            {CLASS_INFO[verdict].label}
          </span>
        </div>
        {sent ? (
          <>
            <p className="confirm-body">Every report gets read. They’re how the verdicts get better.</p>
            <footer className="confirm-actions single">
              <button className="btn big primary" onClick={close} autoFocus>
                Done
              </button>
            </footer>
          </>
        ) : (
          <>
            <div className="report-body">
              <div className="filter-chips" role="radiogroup" aria-label="What’s wrong with it">
                {OPINIONS.map(([id, label]) => (
                  <button key={id} className={`filter-chip all ${opinion === id ? 'on' : ''}`} role="radio" aria-checked={opinion === id} onClick={() => setOpinion(id)}>
                    {label}
                  </button>
                ))}
              </div>
              <textarea
                className="input report-note"
                value={note}
                maxLength={NOTE_MAX}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Anything to add? (optional) e.g. “It’s a real sacrifice: the knight can’t be taken back.”"
                aria-label="Note"
                rows={3}
              />
              {error && <p className="form-error">{error}</p>}
            </div>
            <footer className="confirm-actions">
              <button className="btn big ghost" onClick={close}>
                Cancel
              </button>
              <button className="btn big primary" onClick={send} disabled={!opinion || sending}>
                {sending ? 'Sending…' : 'Send report'}
              </button>
            </footer>
          </>
        )}
      </div>
    </dialog>
  )
}
