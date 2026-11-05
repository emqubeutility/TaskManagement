import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent } from 'react'
import { Icon, type IconName } from './icons'

// Themed replacements for alert / confirm / prompt. They work from anywhere (including
// non-React code such as the query client) because state lives in this module.

type ToastKind = 'success' | 'error' | 'info'
interface Toast { id: number; kind: ToastKind; message: string }

type Modal =
  | { type: 'confirm'; title: string; message?: string; confirmLabel: string; danger: boolean; resolve: (ok: boolean) => void }
  | { type: 'choice'; title: string; subject?: string; message?: string; choices: Choice[]; resolve: (value: string | null) => void }
  | { type: 'log'; title: string; subtitle?: string; logged: number; resolve: (value: { minutes: number; note: string } | null) => void }
  | { type: 'close'; title: string; subtitle?: string; from?: Person; to?: Person | null; startedAt: Date; sinceLabel: string; logged: number; endedAt: Date; minutes: number; commentLabel: string; commentPlaceholder: string; confirmLabel: string; resolve: (value: { minutes: number; comment: string } | null) => void }
  | { type: 'prompt'; title: string; message?: string; label: string; initial: string; confirmLabel: string; multiline: boolean; optional: boolean; resolve: (value: string | null) => void }

/** Someone shown as a small coloured badge in a dialog. */
export interface Person { name: string; initials: string; colour: string }

export interface Choice { value: string; label: string; description?: string; icon?: IconName; primary?: boolean }

interface State { toasts: Toast[]; modal: Modal | null }

let state: State = { toasts: [], modal: null }
let nextId = 1
const listeners = new Set<() => void>()
const set = (next: Partial<State>) => { state = { ...state, ...next }; listeners.forEach((l) => l()) }
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l) } }
const snapshot = () => state

export function notify(message: string, kind: ToastKind = 'info') {
  const id = nextId++
  set({ toasts: [...state.toasts, { id, kind, message }] })
  setTimeout(() => set({ toasts: state.toasts.filter((t) => t.id !== id) }), kind === 'error' ? 6000 : 4000)
}
export const notifySuccess = (m: string) => notify(m, 'success')
export const notifyError = (m: string) => notify(m, 'error')

export function confirmDialog(opts: { title: string; message?: string; confirmLabel?: string; danger?: boolean }): Promise<boolean> {
  return new Promise((resolve) => {
    set({ modal: { type: 'confirm', title: opts.title, message: opts.message, confirmLabel: opts.confirmLabel ?? 'Confirm', danger: !!opts.danger, resolve } })
  })
}

/** Resolves to the text (possibly empty when `optional`), or null if cancelled. */
export function promptDialog(opts: { title: string; label: string; message?: string; initial?: string; confirmLabel?: string; multiline?: boolean; optional?: boolean }): Promise<string | null> {
  return new Promise((resolve) => {
    set({ modal: { type: 'prompt', title: opts.title, message: opts.message, label: opts.label, initial: opts.initial ?? '', confirmLabel: opts.confirmLabel ?? 'Save', multiline: !!opts.multiline, optional: !!opts.optional, resolve } })
  })
}

/** A question with several buttons. Resolves to the chosen value, or null if cancelled. */
export function choiceDialog(opts: { title: string; subject?: string; message?: string; choices: Choice[] }): Promise<string | null> {
  return new Promise((resolve) => set({ modal: { type: 'choice', title: opts.title, subject: opts.subject, message: opts.message, choices: opts.choices, resolve } }))
}

/** Log some time part-way through a step. Resolves to the minutes and an optional note, or null if cancelled. */
export function logTimeDialog(opts: { title: string; subtitle?: string; logged: number }): Promise<{ minutes: number; note: string } | null> {
  return new Promise((resolve) => set({ modal: { type: 'log', title: opts.title, subtitle: opts.subtitle, logged: opts.logged, resolve } }))
}

/** Shows when the step started (or time was last logged) and is being closed, with the minutes to confirm or correct. Resolves to the minutes and an optional comment, or null if cancelled. */
export function closeDialog(opts: { title: string; subtitle?: string; from?: Person; to?: Person | null; startedAt: Date; sinceLabel?: string; logged?: number; commentLabel?: string; commentPlaceholder?: string; confirmLabel?: string }): Promise<{ minutes: number; comment: string } | null> {
  const endedAt = new Date()
  const minutes = Math.max(0, Math.round((endedAt.getTime() - opts.startedAt.getTime()) / 60_000))
  return new Promise((resolve) => set({
    modal: {
      type: 'close', title: opts.title, subtitle: opts.subtitle, from: opts.from, to: opts.to, startedAt: opts.startedAt, sinceLabel: opts.sinceLabel ?? 'Started', logged: opts.logged ?? 0, endedAt, minutes,
      commentLabel: opts.commentLabel ?? 'Note (optional)', commentPlaceholder: opts.commentPlaceholder ?? 'Anything they should check or know?', confirmLabel: opts.confirmLabel ?? 'Close task', resolve,
    },
  }))
}

const stamp = (d: Date) => d.toLocaleString('en-GB', { timeZone: 'Asia/Dubai', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

function useEscape(cancel: () => void) {
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); cancel() } }
    document.addEventListener('keydown', key, true)
    return () => document.removeEventListener('keydown', key, true)
  })
}

function ChoiceView({ modal }: { modal: Extract<Modal, { type: 'choice' }> }) {
  const [picked, setPicked] = useState(() => (modal.choices.find((c) => c.primary) ?? modal.choices[0]).value)
  const done = (v: string | null) => { set({ modal: null }); modal.resolve(v) }
  useEscape(() => done(null))
  const chosen = modal.choices.find((c) => c.value === picked) ?? modal.choices[0]
  return (
    <div className="overlay modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && done(null)}>
      <form className="dialog small-dialog choice-dialog" role="dialog" aria-modal="true" onSubmit={(e) => { e.preventDefault(); done(picked) }}>
        <h2>{modal.title}</h2>
        {(modal.subject || modal.message) && (
          <p className="modal-text choice-sub">{modal.subject && <strong>{modal.subject}</strong>}{modal.message && <span className="muted">{modal.subject ? ' · ' : ''}{modal.message}</span>}</p>
        )}
        <div className="choice-options" role="radiogroup">
          {modal.choices.map((c) => (
            <label key={c.value} className={picked === c.value ? 'option on' : 'option'}>
              <input type="radio" name="choice" value={c.value} checked={picked === c.value} onChange={() => setPicked(c.value)} />
              <span className="option-icon"><Icon name={c.icon ?? 'check'} size={18} /></span>
              <span className="option-text"><strong>{c.label}</strong>{c.description && <small>{c.description}</small>}</span>
              <span className="option-radio" aria-hidden="true" />
            </label>
          ))}
        </div>
        <div className="dialog-actions">
          <span className="spacer" />
          <button type="button" onClick={() => done(null)}>Cancel</button>
          <button className="primary" autoFocus>{chosen.label}</button>
        </div>
      </form>
    </div>
  )
}

function Stepper({ value, onChange, min = 0 }: { value: string; onChange: (v: string) => void; min?: number }) {
  const n = /^\d+$/.test(value) ? Number(value) : 0
  return (
    <div className="stepper">
      <button type="button" className="step-btn" aria-label="One minute less" disabled={n <= min} onClick={() => onChange(String(Math.max(min, n - 1)))}>−</button>
      <input type="number" min={min} max={100000} step={1} value={value} aria-label="Time spent in minutes" onChange={(e) => onChange(e.target.value)} autoFocus />
      <span className="muted">minutes</span>
      <button type="button" className="step-btn" aria-label="One minute more" onClick={() => onChange(String(n + 1))}>+</button>
    </div>
  )
}

function LogView({ modal }: { modal: Extract<Modal, { type: 'log' }> }) {
  const [minutes, setMinutes] = useState('30')
  const [note, setNote] = useState('')
  const valid = /^\d+$/.test(minutes) && Number(minutes) >= 1 && Number(minutes) <= 100_000
  const n = valid ? Number(minutes) : 0
  const done = (v: { minutes: number; note: string } | null) => { set({ modal: null }); modal.resolve(v) }
  useEscape(() => done(null))
  const submit = (e: FormEvent) => { e.preventDefault(); if (valid) done({ minutes: n, note: note.trim() }) }
  return (
    <div className="overlay modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && done(null)}>
      <form className="dialog small-dialog close-dialog" role="dialog" aria-modal="true" onSubmit={submit}>
        <h2>{modal.title}</h2>
        {modal.subtitle && <p className="muted modal-text">{modal.subtitle}</p>}
        <div className="time-field">
          <span className="time-heading">Time spent</span>
          <Stepper value={minutes} onChange={setMinutes} min={1} />
          <p className="muted modal-text">Logged so far: <strong>{modal.logged} min</strong> · after this <strong>{modal.logged + n} min</strong></p>
        </div>
        <label>Note (optional)
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={500} placeholder="What did you work on?" />
        </label>
        <div className="dialog-actions">
          <span className="spacer" />
          <button type="button" onClick={() => done(null)}>Cancel</button>
          <button className="primary" disabled={!valid}>Save time</button>
        </div>
      </form>
    </div>
  )
}

function Badge({ person }: { person: Person }) {
  return <span className="avatar" title={person.name} style={{ background: person.colour, width: 30, height: 30 }}>{person.initials}</span>
}

function CloseView({ modal }: { modal: Extract<Modal, { type: 'close' }> }) {
  const [minutes, setMinutes] = useState(String(modal.minutes))
  const [comment, setComment] = useState('')
  const valid = /^\d+$/.test(minutes) && Number(minutes) <= 100_000
  const n = valid ? Number(minutes) : 0
  const done = (v: { minutes: number; comment: string } | null) => { set({ modal: null }); modal.resolve(v) }
  useEscape(() => done(null))
  const submit = (e: FormEvent) => { e.preventDefault(); if (valid) done({ minutes: n, comment: comment.trim() }) }
  return (
    <div className="overlay modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && done(null)}>
      <form className="dialog small-dialog close-dialog" role="dialog" aria-modal="true" onSubmit={submit}>
        <h2>{modal.title}</h2>
        {modal.subtitle && <p className="muted modal-text">{modal.subtitle}</p>}
        <div className="handover-banner">
          {modal.from && <Badge person={modal.from} />}
          {modal.to ? (
            <>
              <Icon name="arrow-right" size={16} className="banner-arrow" />
              <Badge person={modal.to} />
              <span><strong>{modal.to.name}</strong> will get this to accept next</span>
            </>
          ) : <span>This is the last step, so the task will be complete</span>}
        </div>
        <div className="time-card">
          <div><span className="time-label">{modal.sinceLabel}</span><strong>{stamp(modal.startedAt)}</strong></div>
          <div><span className="time-label">Closing</span><strong>{stamp(modal.endedAt)}</strong></div>
          <div className="time-tracked"><span className="time-label">Tracked</span><strong>{modal.minutes} min</strong></div>
        </div>
        <div className="time-field">
          <span className="time-heading">Time spent</span>
          <Stepper value={minutes} onChange={setMinutes} />
          {modal.logged > 0 && <p className="muted modal-text">Already logged <strong>{modal.logged} min</strong> · total after closing <strong>{modal.logged + n} min</strong></p>}
        </div>
        <label>{modal.commentLabel}
          <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={3} maxLength={1000} placeholder={modal.commentPlaceholder} />
        </label>
        <div className="dialog-actions">
          <span className="spacer" />
          <button type="button" onClick={() => done(null)}>Cancel</button>
          <button className="primary" disabled={!valid}>{modal.confirmLabel}</button>
        </div>
      </form>
    </div>
  )
}

function ModalView({ modal }: { modal: Extract<Modal, { type: 'confirm' | 'prompt' }> }) {
  const [value, setValue] = useState(modal.type === 'prompt' ? modal.initial : '')
  const inputRef = useRef<HTMLInputElement & HTMLTextAreaElement>(null)

  const close = (result: boolean | string | null) => {
    set({ modal: null })
    if (modal.type === 'confirm') modal.resolve(result === true)
    else modal.resolve(typeof result === 'string' ? result : null)
  }
  const cancel = () => close(modal.type === 'confirm' ? false : null)

  // Select the starting text once, when the dialog opens. (Doing it on every render re-selected
  // the whole text after each keystroke, so the next letter replaced everything typed so far.)
  useEffect(() => { inputRef.current?.select() }, [])

  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); cancel() } }
    document.addEventListener('keydown', key, true)
    return () => document.removeEventListener('keydown', key, true)
  })

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (modal.type === 'confirm') return close(true)
    if (modal.optional || value.trim()) close(value.trim())
  }

  return (
    <div className="overlay modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && cancel()}>
      <form className="dialog small-dialog" role="dialog" aria-modal="true" onSubmit={submit}>
        <h2>{modal.title}</h2>
        {modal.message && <p className="muted modal-text">{modal.message}</p>}
        {modal.type === 'prompt' && (
          <label>{modal.label}
            {modal.multiline
              ? <textarea ref={inputRef} value={value} onChange={(e) => setValue(e.target.value)} autoFocus rows={4} maxLength={1000} />
              : <input ref={inputRef} value={value} onChange={(e) => setValue(e.target.value)} autoFocus maxLength={100} />}
          </label>
        )}
        <div className="dialog-actions">
          <span className="spacer" />
          <button type="button" onClick={cancel}>Cancel</button>
          <button className={modal.type === 'confirm' && modal.danger ? 'primary danger-solid' : 'primary'} autoFocus={modal.type === 'confirm'}>
            {modal.confirmLabel}
          </button>
        </div>
      </form>
    </div>
  )
}

export function DialogHost() {
  const { toasts, modal } = useSyncExternalStore(subscribe, snapshot)
  return (
    <>
      {modal && (modal.type === 'choice' ? <ChoiceView modal={modal} /> : modal.type === 'close' ? <CloseView modal={modal} /> : modal.type === 'log' ? <LogView modal={modal} /> : <ModalView modal={modal} />)}
      <div className="toasts" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.kind}`} onClick={() => set({ toasts: state.toasts.filter((x) => x.id !== t.id) })}>
            <span className="toast-icon"><Icon name={t.kind === 'success' ? 'check' : t.kind === 'error' ? 'alert' : 'info'} size={14} /></span>
            <span>{t.message}</span>
          </div>
        ))}
      </div>
    </>
  )
}
