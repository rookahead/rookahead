import type { ReactNode } from 'react'

/** A row of choices, one of them picked. */
export function Segmented<T extends string | number>({ value, options, onChange, label }: { value: T; options: [T, string][]; onChange: (v: T) => void; label?: string }) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map(([v, text]) => (
        <button key={String(v)} type="button" role="radio" aria-checked={v === value} className={v === value ? 'active' : ''} onClick={() => onChange(v)}>
          {text}
        </button>
      ))}
    </div>
  )
}

/** An on/off setting: its name (and a line about it) with a switch at the right. */
export function SwitchRow({ label, hint, checked, onChange }: { label: string; hint?: ReactNode; checked: boolean; onChange: (on: boolean) => void }) {
  return (
    <label className="switch-row">
      <span className="switch-row-text">
        <span>{label}</span>
        {hint && <span className="hint">{hint}</span>}
      </span>
      <span className="switch">
        <input type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        <span className="switch-track" />
      </span>
    </label>
  )
}

/** A setting whose control sits at the right of its name (the control wraps under it on narrow screens). */
export function OptionRow({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="option-row">
      <span className="option-row-text">
        <span>{label}</span>
        {hint && <span className="hint">{hint}</span>}
      </span>
      <div className="option-row-control">{children}</div>
    </div>
  )
}
