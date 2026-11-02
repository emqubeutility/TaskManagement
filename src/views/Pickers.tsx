import { useEffect, useRef, useState, type ReactNode } from 'react'
import { dubaiMonth, dubaiToday } from '../../shared/dates'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']
const pad = (n: number) => String(n).padStart(2, '0')

function Popover({ display, placeholder, value, required, children, render }: {
  display: string; placeholder: string; value: string; required?: boolean
  children?: never
  render: (close: () => void) => ReactNode
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const down = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false) } }
    document.addEventListener('mousedown', down)
    document.addEventListener('keydown', key)
    return () => { document.removeEventListener('mousedown', down); document.removeEventListener('keydown', key) }
  }, [open])

  return (
    <div className="picker" ref={ref}>
      <button type="button" className="picker-trigger" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className={display ? '' : 'placeholder'}>{display || placeholder}</span>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <rect x="3" y="4" width="18" height="18" rx="3" /><path d="M16 2v4M8 2v4M3 10h18" />
        </svg>
      </button>
      {/* Lets the browser's normal "please fill this in" check work for required pickers. */}
      {required && <input className="sr-required" tabIndex={-1} required value={value} onChange={() => {}} aria-hidden />}
      {open && (
        // preventDefault stops clicks on empty popover space from re-triggering the surrounding <label>.
        <div className="popover" onClick={(e) => e.preventDefault()}>{render(() => setOpen(false))}</div>
      )}
    </div>
  )
}

function Nav({ title, onPrev, onNext }: { title: string; onPrev: () => void; onNext: () => void }) {
  return (
    <div className="pop-nav">
      <button type="button" className="icon" onClick={onPrev} aria-label="Previous">‹</button>
      <strong>{title}</strong>
      <button type="button" className="icon" onClick={onNext} aria-label="Next">›</button>
    </div>
  )
}

/** value and onChange use YYYY-MM-DD ('' when empty). */
export function DatePicker({ value, onChange, required }: { value: string; onChange: (v: string) => void; required?: boolean }) {
  const today = dubaiToday()
  const seed = value || today
  const [view, setView] = useState({ y: Number(seed.slice(0, 4)), m: Number(seed.slice(5, 7)) - 1 })

  const shift = (d: number) => setView(({ y, m }) => {
    const n = m + d
    return { y: y + Math.floor(n / 12), m: ((n % 12) + 12) % 12 }
  })
  const offset = (new Date(Date.UTC(view.y, view.m, 1)).getUTCDay() + 6) % 7
  const days = new Date(Date.UTC(view.y, view.m + 1, 0)).getUTCDate()
  const cells = [...Array<null>(offset).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)]
  const iso = (d: number) => `${view.y}-${pad(view.m + 1)}-${pad(d)}`
  const display = value ? `${Number(value.slice(8, 10))} ${MONTHS[Number(value.slice(5, 7)) - 1]} ${value.slice(0, 4)}` : ''

  return (
    <Popover display={display} placeholder="Select date" value={value} required={required} render={(close) => (
      <>
        <Nav title={`${MONTHS_LONG[view.m]} ${view.y}`} onPrev={() => shift(-1)} onNext={() => shift(1)} />
        <div className="cal-grid">
          {WEEKDAYS.map((w) => <span key={w} className="cal-head">{w}</span>)}
          {cells.map((d, i) => d === null ? <span key={`e${i}`} /> : (
            <button
              type="button" key={d}
              className={`cal-day${iso(d) === value ? ' selected' : ''}${iso(d) === today ? ' today' : ''}`}
              onClick={() => { onChange(iso(d)); close() }}
            >{d}</button>
          ))}
        </div>
        <div className="pop-foot">
          <button type="button" className="link" onClick={() => { onChange(''); close() }}>Clear</button>
          <button type="button" className="link" onClick={() => { onChange(today); close() }}>Today</button>
        </div>
      </>
    )} />
  )
}

/** value and onChange use YYYY-MM ('' when empty). */
export function MonthPicker({ value, onChange, required }: { value: string; onChange: (v: string) => void; required?: boolean }) {
  const thisMonth = dubaiMonth()
  const [year, setYear] = useState(Number((value || thisMonth).slice(0, 4)))
  const display = value ? `${MONTHS_LONG[Number(value.slice(5, 7)) - 1]} ${value.slice(0, 4)}` : ''

  return (
    <Popover display={display} placeholder="Select month" value={value} required={required} render={(close) => (
      <>
        <Nav title={String(year)} onPrev={() => setYear((y) => y - 1)} onNext={() => setYear((y) => y + 1)} />
        <div className="month-grid">
          {MONTHS.map((name, i) => {
            const v = `${year}-${pad(i + 1)}`
            return (
              <button
                type="button" key={name}
                className={`cal-day${v === value ? ' selected' : ''}${v === thisMonth ? ' today' : ''}`}
                onClick={() => { onChange(v); close() }}
              >{name}</button>
            )
          })}
        </div>
        <div className="pop-foot">
          <button type="button" className="link" onClick={() => { onChange(''); close() }}>Clear</button>
          <button type="button" className="link" onClick={() => { onChange(thisMonth); close() }}>This month</button>
        </div>
      </>
    )} />
  )
}
