import type { ReactNode } from 'react'
import { Icon } from '../icons'

/** Header of a detail, add or edit page: round back button, title and a short line, with page actions on the right. */
export function DetailHead({ back, backLabel, title, sub, children }: {
  back: () => void; backLabel: string; title: ReactNode; sub?: ReactNode; children?: ReactNode
}) {
  return (
    <div className="detail-head">
      <button type="button" className="back-btn" onClick={back} aria-label={backLabel} title={backLabel}><Icon name="back" size={18} /></button>
      <div className="detail-title">
        <h2>{title}</h2>
        {sub && <p className="muted">{sub}</p>}
      </div>
      {children && <div className="head-actions">{children}</div>}
    </div>
  )
}

/** Bottom bar of a form card: Cancel and the main button, aligned right. Goes inside the card. */
export function FormFooter({ submitLabel, busy, disabled, onCancel }: {
  submitLabel: string; busy?: boolean; disabled?: boolean; onCancel: () => void
}) {
  return (
    <div className="template-footer">
      <button type="button" onClick={onCancel}>Cancel</button>
      <button className="primary" disabled={busy || disabled}>{submitLabel}</button>
    </div>
  )
}
