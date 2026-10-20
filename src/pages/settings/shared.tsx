import type { ReactNode } from 'react'

/** A section's card: its heading and a line about it, then its rows. */
export function Section({ title, lead, children }: { title: string; lead?: ReactNode; children: ReactNode }) {
  return (
    <>
      <header className="settings-section-head">
        <h2>{title}</h2>
        {lead && <p>{lead}</p>}
      </header>
      {children}
    </>
  )
}

/** One setting: its name (and a line about it) at the left, its control at the right; `wide` puts the control underneath
 *  (a form being filled in, which names itself). */
export function Row({ label, hint, children, wide, tone }: { label?: ReactNode; hint?: ReactNode; children?: ReactNode; wide?: boolean; tone?: 'danger' }) {
  return (
    <div className={`settings-row ${wide ? 'wide' : ''} ${tone ?? ''}`}>
      {(label || hint) && (
        <div className="settings-row-text">
          {label && <span className="settings-row-label">{label}</span>}
          {hint && <span className="hint">{hint}</span>}
        </div>
      )}
      {children && <div className="settings-row-control">{children}</div>}
    </div>
  )
}
