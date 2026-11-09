import { useEffect, useRef, useState, type DragEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { dubaiMonth, dubaiToday } from '../../shared/dates'
import { defaultDay, monthName, monthShort, shiftMonth, slotOf, weekDays, weekLabel, weekOfDay, weeksIn, type PlanSlot } from '../../shared/plan'
import { choiceDialog } from '../dialogs'
import { useClients, usePlan, usePlanActions, useTaskActions, useTasks, useTypes } from '../hooks'
import { Icon } from '../icons'
import { currentStep, STATUS_LABEL, type PlanItem, type Step, type Task, type User } from '../types'
import { Avatar } from './FlowEditor'
import { TaskDialog } from './TaskDialog'
import { TimerControls, useTimer } from './Timesheet'

const ALL = { month: '', owner: '', client: '', type: '' }
/** Asks which day of a week a task goes to. */
function DayPicker({ title, slot, today, initial, planned, onConfirm, onRemove, onCancel }: {
  title: string; slot: PlanSlot; today: string; initial: number; planned: boolean
  onConfirm: (day: number) => void; onRemove: () => void; onCancel: () => void
}) {
  const [day, setDay] = useState(initial)
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onCancel()
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [onCancel])
  const r = weekDays(slot)
  const days = Array.from({ length: r.to - r.from + 1 }, (_, i) => r.from + i)
  const todayDay = today.slice(0, 7) === slot.month ? Number(today.slice(8)) : 0
  const label = (d: number) => `${DOW[dowOf(slot.month, d)]} ${d} ${monthShort(slot.month)}`
  const isPast = (d: number) => `${slot.month}-${String(d).padStart(2, '0')}` < today
  return (
    <div className="overlay modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <form className="dialog small-dialog day-dialog" role="dialog" aria-modal="true" onSubmit={(e) => { e.preventDefault(); if (!isPast(day)) onConfirm(day) }}>
        <h2>{planned ? 'Move to' : 'Plan for'} {weekLabel(slot.week)} · {r.from}–{r.to} {monthShort(slot.month)}</h2>
        <p className="muted modal-text"><strong>{title}</strong></p>
        <span className="time-heading">Day</span>
        <div className="day-chips" role="radiogroup" aria-label="Day of the week">
          {days.map((d) => (
            <button key={d} type="button" role="radio" aria-checked={d === day} disabled={isPast(d)} className={`day-chip${d === day ? ' on' : ''}${d === todayDay ? ' now' : ''}`} onClick={() => setDay(d)}>
              <small>{DOW[dowOf(slot.month, d)]}</small><strong>{d}</strong>{d === todayDay && <em>Now</em>}
            </button>
          ))}
        </div>
        <p className="muted modal-text">Will move to <strong>{label(day)}</strong></p>
        <div className="dialog-actions">
          {planned && <button type="button" className="danger" onClick={onRemove}><Icon name="x" size={14} /> Remove from plan</button>}
          <span className="spacer" />
          <button type="button" onClick={onCancel}>Cancel</button>
          <button className="primary" autoFocus disabled={isPast(day)}>{planned ? 'Move' : 'Plan'}</button>
        </div>
      </form>
    </div>
  )
}

type Slot = number | 'unplanned' // a week number, or the pool of steps not planned yet

interface Entry {
  task: Task; step: Step; item?: PlanItem; slot: Slot
  /** Planned in an earlier month and not finished: it comes back into the pool of this month. */
  from?: PlanSlot
}

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
/** 2026-11-12 -> "12th" */
export const dueText = (ymd: string) => {
  const n = Number(ymd.slice(8, 10))
  const suffix = n % 100 >= 11 && n % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th'
  return `${n}${suffix}`
}
const dowOf = (month: string, day: number) => new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1, day)).getUTCDay()

/** "W2", or "W2 Oct" when it is not in the month being looked at. */
export const slotText = (s: PlanSlot, month: string) => weekLabel(s.week) + (s.month === month ? '' : ` ${monthShort(s.month)}`)

const keyOf = (s: PlanSlot) => `${s.month}:${s.week}`
const REMOVE = 'remove'
const parse = (v: string): PlanSlot => {
  const s = { month: v.slice(0, 7), week: Number(v.slice(8)) }
  return { ...s, day: defaultDay(s, dubaiToday()) }
}

/** The week menu on a card. Without `label` it is "Plan for…"; with one (e.g. "Move or remove") the menu acts like a button. */
export function PlanSelect({ task, step, me, value, month = dubaiMonth(), label, className, onPick }: {
  task: Task; step: Step; me: User; value: PlanSlot | null; month?: string; label?: string; className?: string
  /** When given, choosing a week calls this (so the page can ask for the day) instead of saving at once. */
  onPick?: (slot: PlanSlot) => void
}) {
  const { set } = usePlanActions()
  // Without an onPick, a chosen week asks for the day in a popup here before anything moves.
  const [asking, setAsking] = useState<PlanSlot | null>(null)
  const weeks = Array.from({ length: weeksIn(month) }, (_, i) => ({ month, week: i + 1 }))
  const extra = value && value.month !== month ? value : null // planned in another month: keep it selectable so the menu shows it
  // The closed box shows just the week ("W3"); the list shows each week with its dates.
  const shortText = value && !label ? weekLabel(value.week) : null
  return (
    <span className={shortText ? 'plan-select-wrap' : 'plan-select-bare'}>
    <select
      className={className} value={value && !label ? keyOf(value) : ''} aria-label="Plan this task"
      onChange={(e) => {
        const v = e.target.value
        if (!v) return
        if (v !== REMOVE && onPick) onPick(parse(v))
        else if (v !== REMOVE) setAsking(parse(v))
        else set.mutate({ stepId: step.id, taskId: task.id, userId: me.id, slot: v === REMOVE ? null : parse(v) })
      }}
    >
      <option value="">{label ?? 'Plan for…'}</option>
      {extra && <option value={keyOf(extra)}>{slotText(extra, month)} ({monthName(extra.month)})</option>}
      {weeks.map((w) => {
        const d = weekDays(w)
        return <option key={w.week} value={keyOf(w)}>{weekLabel(w.week)} · {d.from}–{d.to} {monthShort(month)}</option>
      })}
      {value && <option value={REMOVE}>Remove from plan</option>}
    </select>
    {shortText && <span className="plan-select-shown">{shortText}</span>}
    {asking && (
      <DayPicker
        title={task.title} slot={asking} today={dubaiToday()} planned={!!value}
        initial={value && value.day && value.month === asking.month && value.week === asking.week ? value.day : defaultDay(asking, dubaiToday())}
        onCancel={() => setAsking(null)}
        onRemove={() => { set.mutate({ stepId: step.id, taskId: task.id, userId: me.id, slot: null }); setAsking(null) }}
        onConfirm={(day) => { set.mutate({ stepId: step.id, taskId: task.id, userId: me.id, slot: { ...asking, day } }); setAsking(null) }}
      />
    )}
    </span>
  )
}

/** The three-dot menu on a planned card. */
function CardMenu({ onMove, onCopy, onRemove }: { onMove: () => void; onCopy: () => void; onRemove: () => void }) {
  const [open, setOpen] = useState(false)
  // The list is placed on the screen (fixed) so the column's own scrolling cannot cut it off; near the bottom it opens upwards.
  const [at, setAt] = useState<{ right: number; top?: number; bottom?: number }>({ right: 0 })
  const ref = useRef<HTMLSpanElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const toggle = () => {
    if (!open && ref.current) {
      const r = ref.current.getBoundingClientRect()
      setAt({ right: window.innerWidth - r.right, ...(r.bottom + 150 > window.innerHeight ? { bottom: window.innerHeight - r.top + 4 } : { top: r.bottom + 4 }) })
    }
    setOpen((o) => !o)
  }
  useEffect(() => {
    if (!open) return
    const close = () => setOpen(false)
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    const away = (e: MouseEvent) => { const t = e.target as Node; if (!ref.current?.contains(t) && !listRef.current?.contains(t)) setOpen(false) }
    const key = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', away)
    window.addEventListener('keydown', key)
    return () => { document.removeEventListener('mousedown', away); window.removeEventListener('keydown', key); window.removeEventListener('scroll', close, true); window.removeEventListener('resize', close) }
  }, [open])
  const pick = (fn: () => void) => () => { setOpen(false); fn() }
  return (
    <span className="card-menu" ref={ref}>
      <button type="button" className="icon card-menu-btn" aria-label="More actions" aria-haspopup="menu" aria-expanded={open} onClick={toggle}>⋮</button>
      {open && createPortal(
        <div className="card-menu-list" role="menu" style={at} ref={listRef}>
          <button type="button" role="menuitem" onClick={pick(onMove)}>Move…</button>
          <button type="button" role="menuitem" onClick={pick(onCopy)}>Copy…</button>
          <button type="button" role="menuitem" className="danger" onClick={pick(onRemove)}>Remove from plan</button>
        </div>,
        document.body,
      )}
    </span>
  )
}

/** Asks the week and the day to move a planned task to, or to copy it to. */
function PlanTo({ title, mode, month, initial, today, onConfirm, onCancel }: {
  title: string; mode: 'move' | 'copy'; month: string; initial: PlanSlot; today: string
  onConfirm: (slot: PlanSlot) => void; onCancel: () => void
}) {
  const [week, setWeek] = useState(initial.week)
  const [day, setDay] = useState(initial.day ?? defaultDay(initial, today))
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onCancel()
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [onCancel])
  const weeks = Array.from({ length: weeksIn(month) }, (_, i) => i + 1)
  const r = weekDays({ month, week })
  const days = Array.from({ length: r.to - r.from + 1 }, (_, i) => r.from + i)
  const todayDay = today.slice(0, 7) === month ? Number(today.slice(8)) : 0
  const isPast = (d: number) => `${month}-${String(d).padStart(2, '0')}` < today
  const pickWeek = (w: number) => { setWeek(w); setDay(defaultDay({ month, week: w }, today)) }
  const label = `${DOW[dowOf(month, day)]} ${day} ${monthShort(month)}`
  return (
    <div className="overlay modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <form className="dialog small-dialog day-dialog" role="dialog" aria-modal="true" onSubmit={(e) => { e.preventDefault(); if (!isPast(day)) onConfirm({ month, week, day }) }}>
        <h2>{mode === 'move' ? 'Move to' : 'Copy to'}</h2>
        <p className="muted modal-text"><strong>{title}</strong></p>
        <span className="time-heading">Week</span>
        <div className="week-chips" role="radiogroup" aria-label="Week">
          {weeks.map((w) => { const d = weekDays({ month, week: w }); return (
            <button key={w} type="button" role="radio" aria-checked={w === week} className={`day-chip${w === week ? ' on' : ''}`} onClick={() => pickWeek(w)}>
              <strong>{weekLabel(w)}</strong><small>{d.from}–{d.to} {monthShort(month)}</small>
            </button>
          ) })}
        </div>
        <span className="time-heading">Day</span>
        <div className="day-chips" role="radiogroup" aria-label="Day">
          {days.map((d) => (
            <button key={d} type="button" role="radio" aria-checked={d === day} disabled={isPast(d)} className={`day-chip${d === day ? ' on' : ''}${d === todayDay ? ' now' : ''}`} onClick={() => setDay(d)}>
              <small>{DOW[dowOf(month, d)]}</small><strong>{d}</strong>{d === todayDay && <em>Now</em>}
            </button>
          ))}
        </div>
        <p className="muted modal-text">Will {mode === 'move' ? 'move' : 'copy'} to <strong>{label}</strong></p>
        <div className="dialog-actions">
          <span className="spacer" />
          <button type="button" onClick={onCancel}>Cancel</button>
          <button className="primary" autoFocus disabled={isPast(day)}>{mode === 'move' ? 'Move' : 'Copy'}</button>
        </div>
      </form>
    </div>
  )
}

interface Reorder { mark: { id: number; after: boolean } | null; over: (e: DragEvent, entry: Entry) => void; drop: (e: DragEvent, entry: Entry) => void; leave: () => void }

function PlanCard({ entry, me, month, editable, onOpen, onPlan, reorder, timer, menu }: { entry: Entry; me: User; month: string; editable: boolean; onOpen: () => void; onPlan: (entry: Entry, slot: PlanSlot) => void; reorder?: Reorder; timer?: ReactNode; menu?: ReactNode }) {
  const { task, step, slot } = entry
  const done = step.status === 'done'
  const today = dubaiToday()
  const overdue = !!task.dueDate && !done && task.dueDate < today
  const dueToday = !!task.dueDate && !done && task.dueDate === today
  const draggable = editable // a finished task can still be moved: it keeps the day it was planned for
  const onDragStart = (e: DragEvent) => {
    e.dataTransfer.setData('text/plain', `${step.id}:${entry.item?.startDate ?? ''}`); e.dataTransfer.effectAllowed = 'move'
    const card = e.currentTarget as HTMLElement
    // The picture that follows the pointer is taken now, so it gets the highlighted look; right after, the card left behind becomes a faded placeholder.
    card.classList.add('drag-pick')
    setTimeout(() => { card.classList.remove('drag-pick'); card.classList.add('is-dragging') }, 0)
  }
  const onDragEnd = (e: DragEvent) => (e.currentTarget as HTMLElement).classList.remove('is-dragging', 'drag-pick')
  const clientName = (useClients().data ?? []).find((c) => c.id === task.clientId)?.name
  const typeName = (useTypes().data ?? []).find((t) => t.id === task.typeId)?.name
  return (
    <div
      className={`plan-card status-${step.status}${done ? ' is-done' : ''}${reorder?.mark?.id === step.id ? (reorder.mark.after ? ' mark-after' : ' mark-before') : ''}`}
      draggable={draggable} onDragStart={draggable ? onDragStart : undefined} onDragEnd={draggable ? onDragEnd : undefined}
      onDragOver={reorder && editable ? (e) => reorder.over(e, entry) : undefined}
      onDragLeave={reorder && editable ? reorder.leave : undefined}
      onDrop={reorder && editable ? (e) => reorder.drop(e, entry) : undefined}
    >
      <div className="plan-card-head">
        {draggable && <span className="plan-grip" aria-hidden="true" title="Drag to plan">⠿</span>}
        {done && <Icon name="check-circle" size={16} className="plan-tick" />}
        <button type="button" className="link title" title={task.title} onClick={onOpen}>{task.title}</button>
        {menu}
      </div>
      <div className="plan-status-row">
        <span className={`badge ${step.status}`}>{STATUS_LABEL[step.status]}</span>
        {task.dueDate
          ? <span className={overdue ? 'plan-due bad' : dueToday ? 'plan-due warn' : 'plan-due'}>{dueToday ? 'Due today' : `${overdue ? 'Overdue ' : 'Due '}${dueText(task.dueDate)}`}</span>
          : slot === 'unplanned' && <span className="plan-due">No due date</span>}
      </div>
      {(clientName || typeName) && (
        <div className="plan-tags">
          {clientName && <span className="chip client-chip" title="Client">{clientName}</span>}
          {typeName && <span className="chip" title="Type">{typeName}</span>}
        </div>
      )}
      {timer}
    </div>
  )
}

/** The month plan for one person: pick a week, then drop tasks on its days. Only that person can change it. */
export function PlanBoard({ owner, me, withNew = true, filters }: { owner: User; me: User; withNew?: boolean; filters?: { client: string; type: string } }) {
  const editable = owner.id === me.id
  const allTasks = useTasks(ALL, 'board').data ?? []
  const clients = useClients().data ?? []
  const types = useTypes().data ?? []
  // Inside the Board the page's own Client and Type filters are used; on the Plan page they sit in the toolbar here.
  const [ownClient, setClientId] = useState('')
  const [ownType, setTypeId] = useState('')
  const clientId = filters ? filters.client : ownClient
  const typeId = filters ? filters.type : ownType
  const [adding, setAdding] = useState(false)
  const tasks = allTasks.filter((t) => (!clientId || t.clientId === Number(clientId)) && (!typeId || t.typeId === Number(typeId)))
  const plan = usePlan(owner.id).data ?? []
  const { set } = usePlanActions()
  const { act } = useTaskActions()
  const timer = useTimer(tasks)
  const [open, setOpen] = useState<Task | null>(null)
  const [over, setOver] = useState<string | null>(null) // 'unplanned', 'w2' (a week tab) or 'd8' (a day)
  const [month, setMonth] = useState(dubaiMonth())
  // The Waiting list list can be folded away to give the days more room. Open by default.
  const [poolOpen, setPoolOpen] = useState(true)
  const today = dubaiToday()
  const thisMonth = dubaiMonth()
  const todayDay = Number(today.slice(8, 10))
  const weekNow = (m: string) => (m === thisMonth ? weekOfDay(m, todayDay) : 1)
  const [week, setWeek] = useState(weekNow(month))
  useEffect(() => { setWeek(weekNow(month)) }, [month]) // eslint-disable-line react-hooks/exhaustive-deps

  const entries: Entry[] = []
  for (const task of tasks) {
    const current = task.completedAt ? undefined : currentStep(task)
    for (const step of task.steps) {
      if (step.userId !== owner.id) continue
      // A step can be planned on several days (a copy), each one a card.
      const items = plan.filter((p) => p.stepId === step.id)
      if (!items.length) { if (current?.id === step.id) entries.push({ task, step, slot: 'unplanned' }); continue }
      const here = items.filter((p) => slotOf(p.startDate).month === month)
      for (const item of here) entries.push({ task, step, item, slot: slotOf(item.startDate).week })
      const earlier = items.find((p) => slotOf(p.startDate).month < month)
      if (!here.length && earlier && step.status !== 'done') entries.push({ task, step, item: earlier, slot: 'unplanned', from: slotOf(earlier.startDate) })
    }
  }
  const order = (a: Entry, b: Entry) => Number(a.step.status === 'done') - Number(b.step.status === 'done')
    || Number(!!b.from) - Number(!!a.from)
    || a.task.month.localeCompare(b.task.month)
    || (a.task.dueDate ?? '9999').localeCompare(b.task.dueDate ?? '9999')
    || (a.item?.position ?? 0) - (b.item?.position ?? 0)
  // Not planned yet, in three lists.
  const pool = entries.filter((e) => e.slot === 'unplanned').sort(order)
  const poolGroups = ([['offered', 'Yet to accept'], ['todo', 'Accepted'], ['active', 'In progress']] as const)
    .map(([status, label]) => ({ status, label, list: pool.filter((e) => e.step.status === status) }))
    .filter((g) => g.list.length)
  // Inside a day the person's own order counts (done ones last).
  const byPosition = (a: Entry, b: Entry) => Number(a.step.status === 'done') - Number(b.step.status === 'done') || (a.item?.position ?? 0) - (b.item?.position ?? 0) || (a.item?.id ?? 0) - (b.item?.id ?? 0)
  const dayList = (d: number) => inWeek(week).filter((e) => dayOf(e) === d).sort(byPosition)
  const dayOf = (e: Entry) => Number(e.item!.startDate.slice(8))
  const inWeek = (w: number) => entries.filter((e) => e.slot === w)
  // Counts tasks planned up to today: a task planned for a later day is not late yet.
  const openIn = (w: number) => new Set(inWeek(w).filter((e) => e.step.status !== 'done' && e.item!.startDate <= today).map((e) => e.step.id)).size

  // Dropping on a week (or choosing one in a menu) asks which day of it, before anything moves.
  const [asking, setAsking] = useState<{ entry: Entry; slot: PlanSlot } | null>(null)
  const ask = (entry: Entry, slot: PlanSlot) => setAsking({ entry, slot })
  const planTo = (stepId: number, slot: PlanSlot | null, before?: number | null, from?: string, copy?: boolean, dropTime?: boolean) => {
    const entry = entries.find((x) => x.step.id === stepId)
    if (entry) set.mutate({ stepId, taskId: entry.task.id, userId: owner.id, slot, before, from, copy, dropTime })
  }
  // Taking a day out of the plan: if the timesheet has an entry for it, say that its time log goes too.
  const removeDay = async (entry: Entry) => {
    const day = entry.item!.startDate
    // Only time that was really spent counts: a timer running now, or minutes already logged. An empty entry is not a log.
    const logged = timer.entries.some((x) => x.stepId === entry.step.id && x.day === day && (x.status === 'running' || x.minutes > 0))
    if (logged) {
      const ok = await choiceDialog({
        title: 'Remove from plan?', subject: entry.task.title,
        message: 'Your time log for this day will also be removed. Is this OK?',
        choices: [{ value: 'ok', label: 'Yes, remove it and the time log', icon: 'x', primary: true }],
      })
      if (!ok) return
    }
    planTo(entry.step.id, null, undefined, day, undefined, logged)
  }
  // Move or copy from the card's three-dot menu: asks the week and the day.
  const [relocating, setRelocating] = useState<{ entry: Entry; mode: 'move' | 'copy' } | null>(null)
  // Dragging a card over another one shows a line above or below it; dropping puts it there, on that day.
  const [mark, setMark] = useState<{ id: number; after: boolean } | null>(null)
  const isAfter = (e: DragEvent) => { const r = e.currentTarget.getBoundingClientRect(); return e.clientY > r.top + r.height / 2 }
  const cardOver = (e: DragEvent, entry: Entry) => { e.preventDefault(); e.stopPropagation(); setOver(null); setMark({ id: entry.step.id, after: isAfter(e) }) }
  const cardDrop = (e: DragEvent, entry: Entry) => {
    e.preventDefault(); e.stopPropagation()
    const after = isAfter(e)
    setMark(null); setOver(null)
    const { id, from } = dragged(e)
    if (!id || id === entry.step.id) return
    const d = dayOf(entry)
    const list = dayList(d).filter((x) => x.step.id !== id)
    const i = list.findIndex((x) => x.step.id === entry.step.id)
    planTo(id, { month, week, day: d }, after ? (list[i + 1]?.step.id ?? null) : entry.step.id, from)
  }
  // What is being dragged: a step, and the day it was planned on (none when it came from the waiting list).
  const dragged = (e: DragEvent) => { const [id, from] = e.dataTransfer.getData('text/plain').split(':'); return { id: Number(id), from: from || undefined } }
  const dropped = (e: DragEvent) => { e.preventDefault(); setOver(null); return dragged(e) }
  const allowDrop = (key: string) => editable ? { onDragOver: (e: DragEvent) => { e.preventDefault(); setOver(key) }, onDragLeave: () => setOver((s) => (s === key ? null : s)) } : {}

  const weeks = Array.from({ length: weeksIn(month) }, (_, i) => i + 1)
  const range = weekDays({ month, week })
  const days = Array.from({ length: range.to - range.from + 1 }, (_, i) => range.from + i)
  const plannedCount = inWeek(week).length

  return (
    <>
      {!filters && editable && (
        <div className="toolbar plan-toolbar">
          {withNew && editable && <button type="button" className="primary" onClick={() => setAdding(true)}>+ New task</button>}
          <label className="plan-filter">Client
            <select value={clientId} onChange={(e) => setClientId(e.target.value)}>
              <option value="">All clients</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <label className="plan-filter">Type
            <select value={typeId} onChange={(e) => setTypeId(e.target.value)}>
              <option value="">All types</option>
              {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </label>
          {(clientId || typeId) && <button type="button" className="link" onClick={() => { setClientId(''); setTypeId('') }}>Clear</button>}
        </div>
      )}
      <div className="board-head">
        <Avatar userId={owner.id} size={36} />
        <div>
          <h2>{editable ? 'Your plan' : `${owner.name.split(' ')[0]}'s plan`}</h2>
          <p className="muted">{editable ? 'Drag a task onto a week, then drop it on a day.' : 'Only they can change their plan.'}</p>
        </div>
        <div className="plan-nav">
          <button type="button" className="icon" onClick={() => setMonth(shiftMonth(month, -1))} aria-label="Previous month"><Icon name="back" size={14} /></button>
          <strong>{monthName(month)}</strong>
          <button type="button" className="icon" onClick={() => setMonth(shiftMonth(month, 1))} aria-label="Next month"><Icon name="next" size={14} /></button>
          {month !== thisMonth && <button type="button" onClick={() => setMonth(thisMonth)}>This month</button>}
        </div>
      </div>

      <div className="week-tabs" role="tablist" aria-label="Weeks of the month">
        {weeks.map((w) => {
          const d = weekDays({ month, week: w })
          const now = month === thisMonth && todayDay >= d.from && todayDay <= d.to
          const n = openIn(w) // not done yet: started or not
          // Only for this week and weeks that are over; a week still to come has nothing left undone yet.
          const begun = `${month}-${String(d.from).padStart(2, '0')}` <= today
          return (
            <button
              key={w} type="button" role="tab" aria-selected={w === week}
              className={`week-tab${w === week ? ' on' : ''}${over === `w${w}` ? ' drop' : ''}`}
              onClick={() => setWeek(w)}
              {...allowDrop(`w${w}`)}
              onDrop={editable ? (e) => { const { id, from } = dropped(e); setWeek(w); const entry = entries.find((x) => x.step.id === id && x.item?.startDate === from); if (entry) ask(entry, { month, week: w }) } : undefined}
            >
              <span className="week-tab-main">
                <span className="week-tab-top"><strong>{weekLabel(w)}</strong>{now && <span className="chip plan-chip">This week</span>}</span>
                <small>{d.from}–{d.to} {monthShort(month)}</small>
              </span>
              {begun && <span className={n ? 'week-incomplete on' : 'week-incomplete'} title="Planned tasks not finished yet"><strong>{n}</strong><small>incomplete</small></span>}
            </button>
          )
        })}
      </div>

      <div className={editable && poolOpen ? 'plan-layout' : 'plan-layout alone'}>
        {editable && poolOpen && (
          <section
            className={`plan-pool${over === 'unplanned' ? ' drop' : ''}`}
            {...allowDrop('unplanned')}
            onDrop={(e) => { const { id, from } = dropped(e); planTo(id, null, undefined, from) }}
          >
            <div className="pool-head">
              <h3>Waiting list <span className="count">{pool.length}</span></h3>
              <button type="button" className="pool-hide" onClick={() => setPoolOpen(false)} aria-label="Hide the waiting list">Hide</button>
            </div>
            <p className="col-sub">Tasks not planned yet, including other months.</p>
            {poolGroups.map((g) => (
              <div key={g.status} className="pool-group">
                <h4>{g.label} <span className="count">{g.list.length}</span></h4>
                {g.list.map((e) => <PlanCard key={`${e.step.id}-${e.item?.id ?? 'p'}`} entry={e} me={me} month={month} editable onOpen={() => setOpen(e.task)} onPlan={ask}
                  timer={g.status === 'offered' ? <button type="button" className="primary plan-accept" onClick={() => act.mutate({ task: e.task, action: 'accept' })}>Accept</button> : undefined} />)}
              </div>
            ))}
            {!pool.length && <p className="muted empty">Everything is planned</p>}
          </section>
        )}
        <section className="plan-week">
          <div className="plan-week-head">
        {editable && !poolOpen && (
          <button type="button" className="pool-show" onClick={() => setPoolOpen(true)}><Icon name="list" size={14} /> Show waiting list <span className="count">{pool.length}</span></button>
        )}
            <h3>Week {week} <span className="muted plan-week-sub">{range.from}–{range.to} {monthShort(month)} · {plannedCount} {plannedCount === 1 ? 'task' : 'tasks'} planned</span></h3>
          </div>
          <div className="day-cols" style={{ ['--days' as string]: days.length }}>
            {days.map((d) => {
              const list = dayList(d)
              const isToday = month === thisMonth && d === todayDay
              const past = `${month}-${String(d).padStart(2, '0')}` < today // a day that is over cannot be changed
              const canEdit = editable && !past
              return (
                <div key={d} className="day-col">
                  <div className={`day-head${isToday ? ' today' : ''}`}><small>{DOW[dowOf(month, d)]}</small><strong>{d}</strong></div>
                  <div
                    className={`day-drop${over === `d${d}` ? ' drop' : ''}`}
                    {...(past ? {} : allowDrop(`d${d}`))}
                    onDrop={canEdit ? (e) => { const { id, from } = dropped(e); planTo(id, { month, week, day: d }, undefined, from) } : undefined}
                  >
                    {list.map((e) => <PlanCard key={`${e.step.id}-${e.item?.id}`} entry={e} me={me} month={month} editable={canEdit} onOpen={() => setOpen(e.task)} onPlan={ask}
                      menu={canEdit ? <CardMenu onMove={() => setRelocating({ entry: e, mode: 'move' })} onCopy={() => setRelocating({ entry: e, mode: 'copy' })} onRemove={() => removeDay(e)} /> : undefined}
                      reorder={{ mark, over: cardOver, drop: cardDrop, leave: () => setMark(null) }}
                      timer={!canEdit || e.step.status === 'done' || e.item!.startDate > today ? undefined
                        : e.step.status === 'offered' ? <button type="button" className="primary plan-accept" onClick={() => act.mutate({ task: e.task, action: 'accept' })}>Accept</button>
                        : <TimerControls stepId={e.step.id} timer={timer} />} />)}
                    {!list.length && <p className="muted empty">{canEdit ? 'Drop here' : '—'}</p>}
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      </div>
      {asking && (() => {
        const { entry, slot } = asking
        const itemSlot = entry.item ? slotOf(entry.item.startDate) : null
        const sameWeek = !!itemSlot && itemSlot.month === slot.month && itemSlot.week === slot.week
        return (
          <DayPicker
            title={entry.task.title} slot={slot} today={today} planned={entry.slot !== 'unplanned'}
            initial={sameWeek ? Number(entry.item!.startDate.slice(8)) : defaultDay(slot, today)}
            onCancel={() => setAsking(null)}
            onRemove={() => { setAsking(null); if (entry.item) removeDay(entry); else planTo(entry.step.id, null) }}
            onConfirm={(day) => { planTo(entry.step.id, { ...slot, day }, undefined, entry.item?.startDate); setAsking(null) }}
          />
        )
      })()}
      {relocating && (
        <PlanTo
          title={relocating.entry.task.title} mode={relocating.mode} month={month} today={today}
          initial={{ month, week: relocating.entry.slot as number, day: Number(relocating.entry.item!.startDate.slice(8)) }}
          onCancel={() => setRelocating(null)}
          onConfirm={(slot) => { planTo(relocating.entry.step.id, slot, undefined, relocating.entry.item!.startDate, relocating.mode === 'copy'); setRelocating(null) }}
        />
      )}
      {timer.dialog}
      {(timer.busy || act.isPending) && <div className="page-loader" role="status" aria-label="Working"><span className="page-loader-ring" /></div>}
      {open && <TaskDialog task={open} me={me} defaultMonth="" onClose={() => setOpen(null)} />}
      {adding && <TaskDialog me={me} defaultMonth="" onClose={() => setAdding(false)} />}
    </>
  )
}
