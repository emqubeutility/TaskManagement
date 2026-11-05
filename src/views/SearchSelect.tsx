import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Icon } from '../icons'

export interface SearchOption { value: string; label: string }

/** A dropdown with a search box: type to narrow the list, arrows and Enter to pick, Escape to close. */
export function SearchSelect({ options, value, onChange, placeholder, searchPlaceholder = 'Search…', clearable = false, ariaLabel, placement = 'down', trigger, align = 'left' }: {
  options: SearchOption[]
  value: string
  onChange: (value: string) => void
  placeholder: string
  searchPlaceholder?: string
  clearable?: boolean
  ariaLabel: string
  /** Which way the list opens. Use 'up' when the dropdown sits at the bottom of its container. */
  placement?: 'down' | 'up'
  /** Show a small pill (or any content) as the button instead of the select-style box. */
  trigger?: ReactNode
  /** Which edge the list lines up with when `trigger` is used. */
  align?: 'left' | 'right'
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const box = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  const needle = query.trim().toLowerCase()
  const shown = options.filter((o) => o.label.toLowerCase().includes(needle))
  const selected = options.find((o) => o.value === value)

  const close = () => { setOpen(false); setQuery('') }
  const pick = (o: SearchOption) => { onChange(o.value); close() }

  useEffect(() => {
    if (!open) return
    const away = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) close() }
    document.addEventListener('mousedown', away)
    return () => document.removeEventListener('mousedown', away)
  }, [open])

  useEffect(() => { setActive(0) }, [query, open])
  useEffect(() => { listRef.current?.children[active]?.scrollIntoView({ block: 'nearest' }) }, [active])

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, shown.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)) }
    else if (e.key === 'Enter') { e.preventDefault(); if (shown[active]) pick(shown[active]) }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close() }
  }

  return (
    <div className={trigger ? 'ss ss-pill' : 'ss'} ref={box}>
      <button type="button" className={trigger ? 'pill-trigger' : 'ss-btn'} aria-label={ariaLabel} aria-expanded={open} onClick={() => setOpen(!open)}>
        {trigger ?? (
          <>
            <span className={selected ? 'ss-value' : 'ss-value muted'}>{selected ? selected.label : placeholder}</span>
            {clearable && selected && (
              <span className="ss-clear" role="button" aria-label="Clear" onClick={(e) => { e.stopPropagation(); onChange('') }}><Icon name="x" size={14} /></span>
            )}
            <Icon name="chevron" size={16} className="ss-chev" />
          </>
        )}
      </button>
      {open && (
        <div className={`${placement === 'up' ? 'ss-pop up' : 'ss-pop'}${trigger && align === 'right' ? ' right' : ''}`}>
          <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={onKey} placeholder={searchPlaceholder} aria-label="Search" />
          <ul ref={listRef} role="listbox">
            {shown.map((o, i) => (
              <li key={o.value} role="option" aria-selected={o.value === value} className={`${i === active ? 'active' : ''}${o.value === value ? ' chosen' : ''}`}
                onMouseEnter={() => setActive(i)} onMouseDown={(e) => { e.preventDefault(); pick(o) }}>
                {o.label}
              </li>
            ))}
            {!shown.length && <li className="muted ss-empty">No match</li>}
          </ul>
        </div>
      )}
    </div>
  )
}
