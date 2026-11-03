import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent } from 'react'
import { Icon } from './icons'

// Themed replacements for alert / confirm / prompt. They work from anywhere (including
// non-React code such as the query client) because state lives in this module.

type ToastKind = 'success' | 'error' | 'info'
interface Toast { id: number; kind: ToastKind; message: string }

type Modal =
  | { type: 'confirm'; title: string; message?: string; confirmLabel: string; danger: boolean; resolve: (ok: boolean) => void }
  | { type: 'prompt'; title: string; message?: string; label: string; initial: string; confirmLabel: string; multiline: boolean; optional: boolean; resolve: (value: string | null) => void }

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

function ModalView({ modal }: { modal: Modal }) {
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
      {modal && <ModalView modal={modal} />}
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
