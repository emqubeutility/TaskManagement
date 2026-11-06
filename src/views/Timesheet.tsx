import { useEffect, useState } from 'react'
import { dubaiToday } from '../../shared/dates'
import { choiceDialog, closeDialog, logTimeDialog } from '../dialogs'
import { useTimesheet, useTimesheetActions } from '../hooks'
import { Icon } from '../icons'
import type { Task, TimeEntry } from '../types'

const LABEL: Record<TimeEntry['status'], string> = { ready: 'Ready', running: 'Running', paused: 'Paused', ended: 'Ended', abandoned: 'Abandoned' }
const clock = (ms: number) => { const m = Math.max(0, Math.floor(ms / 60_000)); return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}` }
const minutesSince = (iso: string | null, now: number) => (iso ? Math.max(0, Math.round((now - Date.parse(iso)) / 60_000)) : 0)

/** Asks which day an abandoned entry goes to, and whether to move it there or copy it. */
function AgainDialog({ title, today, onPick, onCancel }: { title: string; today: string; onPick: (mode: 'move' | 'copy', day: string) => void; onCancel: () => void }) {
  const [on, setOn] = useState(today)
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onCancel()
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [onCancel])
  const ok = /^\d{4}-\d{2}-\d{2}$/.test(on) && on >= today
  return (
    <div className="overlay modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <form className="dialog small-dialog" role="dialog" aria-modal="true" onSubmit={(e) => e.preventDefault()}>
        <h2>Add this entry again</h2>
        <p className="muted modal-text"><strong>{title}</strong> was left running and abandoned, so no time was counted.</p>
        <label>Day<input type="date" value={on} min={today} onChange={(e) => setOn(e.target.value)} /></label>
        <p className="muted modal-text"><strong>Move</strong> puts this entry on that day. <strong>Copy</strong> keeps it as a record and adds a new one.</p>
        <div className="dialog-actions">
          <span className="spacer" />
          <button type="button" onClick={onCancel}>Cancel</button>
          <button type="button" disabled={!ok} onClick={() => onPick('copy', on)}>Copy</button>
          <button type="button" className="primary" disabled={!ok} onClick={() => onPick('move', on)}>Move</button>
        </div>
      </form>
    </div>
  )
}

/**
 * The timer on a planned task. Start moves the task to In progress (and adds it to my timesheet); Pause logs the time and it
 * stays In progress; End either completes my step or only logs the time. A timer left running past its day is abandoned.
 */
export function useTimer(tasks: Task[]) {
  const today = dubaiToday()
  const entries = useTimesheet().data ?? []
  const ts = useTimesheetActions()
  const [now, setNow] = useState(() => Date.now())
  const [again, setAgain] = useState<TimeEntry | null>(null)
  const running = entries.some((e) => e.status === 'running')
  useEffect(() => {
    if (!running) return
    setNow(Date.now())
    const t = setInterval(() => setNow(Date.now()), 15_000)
    return () => clearInterval(t)
  }, [running])
  const busy = Object.values(ts).some((m) => m.isPending)
  const titleOf = (e: { taskId: number }) => tasks.find((t) => t.id === e.taskId)?.title ?? 'Task'

  /** The entry a card shows: one still open, else an abandoned one that was not redone. An ended one means a fresh Start. */
  const forStep = (stepId: number) => {
    const all = entries.filter((e) => e.stepId === stepId)
    const open = all.find((e) => e.status === 'running') ?? all.find((e) => e.status === 'paused' || e.status === 'ready')
    if (open) return open
    const last = all.reduce<TimeEntry | undefined>((m, e) => (!m || e.id > m.id ? e : m), undefined)
    return last?.status === 'abandoned' ? last : undefined
  }
  const start = async (stepId: number, entry?: TimeEntry) => {
    try {
      const id = entry?.id ?? ((await ts.add.mutateAsync({ stepId })) as TimeEntry).id
      ts.start.mutate(id)
    } catch { /* the error is shown as a message */ }
  }
  const pause = async (e: TimeEntry) => {
    const r = await logTimeDialog({ title: 'Pause and log time', subtitle: titleOf(e), logged: e.minutes, initial: minutesSince(e.runStartedAt, Date.now()) })
    if (r) ts.pause.mutate({ id: e.id, minutes: r.minutes, note: r.note })
  }
  const end = async (e: TimeEntry) => {
    const pick = await choiceDialog({
      title: 'End this task?', subject: titleOf(e), message: 'Do you want to complete the task, or only log the time?',
      choices: [
        { value: 'complete', label: 'Yes, complete the task', icon: 'check-circle', primary: true, description: 'Closes your step and passes the task on. It leaves In progress.' },
        { value: 'log', label: 'No, only log the time', icon: 'refresh', description: 'The task stays in In progress.' },
      ],
    })
    if (!pick) return
    if (pick === 'complete') {
      const r = await closeDialog({
        title: 'Complete this task?', subtitle: titleOf(e), startedAt: e.runStartedAt ? new Date(e.runStartedAt) : new Date(), sinceLabel: 'Started',
        logged: e.minutes, confirmLabel: 'Complete task', commentLabel: 'Note for the next person (optional)',
      })
      if (r) ts.end.mutate({ id: e.id, complete: true, minutes: r.minutes, comment: r.comment })
    } else if (e.status === 'paused') {
      ts.end.mutate({ id: e.id, complete: false, minutes: 0 }) // the time was logged when it was paused
    } else {
      const r = await logTimeDialog({ title: 'Log time', subtitle: titleOf(e), logged: e.minutes, initial: minutesSince(e.runStartedAt, Date.now()) })
      if (r) ts.end.mutate({ id: e.id, complete: false, minutes: r.minutes, note: r.note })
    }
  }
  const dialog = again && (
    <AgainDialog
      title={titleOf(again)} today={today} onCancel={() => setAgain(null)}
      onPick={(mode, day) => { (mode === 'move' ? ts.move : ts.copy).mutate({ id: again.id, day }); setAgain(null) }}
    />
  )
  return { entries, forStep, start, pause, end, setAgain, busy, now, dialog }
}

export type Timer = ReturnType<typeof useTimer>

/** Start / Pause / End on a task card. */
export function TimerControls({ stepId, timer }: { stepId: number; timer: Timer }) {
  const e = timer.forStep(stepId)
  const { busy } = timer
  const logged = e ? e.minutes + (e.status === 'running' ? minutesSince(e.runStartedAt, timer.now) : 0) : 0
  return (
    <div className={'plan-timer' + (e ? ' ts-' + e.status : '')}>
      {e && e.status !== 'ready' && (
        <span className="ts-meta">
          <span className={'badge ts-badge ts-badge-' + e.status}>{LABEL[e.status]}</span>
          {e.status === 'running' && e.runStartedAt && <span className="ts-clock">{clock(timer.now - Date.parse(e.runStartedAt))}</span>}
          {e.status !== 'abandoned' && logged > 0 && <span className="muted">{logged} min</span>}
        </span>
      )}
      <div className="ts-actions">
        {(!e || e.status === 'ready' || e.status === 'paused') && <button type="button" className="primary" disabled={busy} onClick={() => timer.start(stepId, e)}><Icon name="play" size={13} /> {e?.status === 'paused' ? 'Resume' : 'Start'}</button>}
        {e?.status === 'running' && <button type="button" disabled={busy} onClick={() => timer.pause(e)}>Pause</button>}
        {(e?.status === 'running' || e?.status === 'paused') && <button type="button" disabled={busy} onClick={() => timer.end(e)}>End</button>}
        {e?.status === 'abandoned' && <button type="button" disabled={busy} onClick={() => timer.setAgain(e)}>Move or copy</button>}
      </div>
    </div>
  )
}
