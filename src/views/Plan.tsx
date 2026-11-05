import { useState, type DragEvent } from 'react'
import { dubaiToday } from '../../shared/dates'
import { columnOf, PLAN_COLUMNS, type PlanColumn } from '../../shared/plan'
import { useClients, usePlan, usePlanActions, useTasks } from '../hooks'
import { Icon } from '../icons'
import { currentStep, STATUS_LABEL, type PlanItem, type Step, type Task, type User } from '../types'
import { Avatar } from './FlowEditor'
import { TaskDialog } from './TaskDialog'

const ALL = { month: '', owner: '', client: '', type: '' }
type Slot = PlanColumn | 'unplanned'

interface Entry { task: Task; step: Step; item?: PlanItem; slot: Slot; carried: boolean }

export const columnLabel = (c: PlanColumn) => PLAN_COLUMNS.find((x) => x.key === c)!.label

/** The "Plan for…" menu used on board cards. */
export function PlanSelect({ task, step, me, value, className }: { task: Task; step: Step; me: User; value: PlanColumn | ''; className?: string }) {
  const { set } = usePlanActions()
  return (
    <select
      className={className} value={value} aria-label="Plan this task"
      onChange={(e) => set.mutate({ stepId: step.id, taskId: task.id, userId: me.id, column: (e.target.value || null) as PlanColumn | null })}
    >
      <option value="">Plan for…</option>
      {PLAN_COLUMNS.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
      {value && <option value="">Remove from plan</option>}
    </select>
  )
}

function PlanCard({ entry, me, editable, onOpen }: { entry: Entry; me: User; editable: boolean; onOpen: () => void }) {
  const { task, step, slot, carried } = entry
  const clients = useClients().data ?? []
  const client = clients.find((c) => c.id === task.clientId)?.name
  const done = step.status === 'done'
  const spent = (task.timeLogs ?? []).filter((l) => l.stepId === step.id).reduce((n, l) => n + l.minutes, 0)
  const today = dubaiToday()
  const overdue = !!task.dueDate && !done && task.dueDate < today
  const dueToday = !!task.dueDate && !done && task.dueDate === today
  const draggable = editable && !done
  const onDragStart = (e: DragEvent) => { e.dataTransfer.setData('text/plain', String(step.id)); e.dataTransfer.effectAllowed = 'move' }
  return (
    <div className={`plan-card status-${step.status}${done ? ' is-done' : ''}`} draggable={draggable} onDragStart={draggable ? onDragStart : undefined}>
      <div className="plan-card-head">
        {done && <Icon name="check-circle" size={16} className="plan-tick" />}
        <button type="button" className="link title" onClick={onOpen}>{task.title}</button>
      </div>
      <div className="meta">
        <span className={`badge ${step.status}`}>{STATUS_LABEL[step.status]}</span>
        {client && <span className="chip">{client}</span>}
        {task.dueDate && <span className={overdue ? 'chip bad' : dueToday ? 'chip warn' : 'chip'}>{overdue ? 'Overdue · ' : dueToday ? 'Due today · ' : 'Due '}{task.dueDate.slice(5)}</span>}
        {spent > 0 && <span className="chip" title="Time you logged on this step">{spent} min</span>}
        {carried && <span className="chip warn" title="Planned for an earlier day or week and not finished">Carried over</span>}
      </div>
      {editable && !done && <PlanSelect task={task} step={step} me={me} value={slot === 'unplanned' ? '' : slot} className="plan-move" />}
    </div>
  )
}

/** The four plan columns (Today, Tomorrow, This week, Next week) for one person. Only that person can change it. */
export function PlanBoard({ owner, me }: { owner: User; me: User }) {
  const editable = owner.id === me.id
  const tasks = useTasks(ALL, 'board').data ?? []
  const plan = usePlan(owner.id).data ?? []
  const { set } = usePlanActions()
  const [open, setOpen] = useState<Task | null>(null)
  const [over, setOver] = useState<Slot | null>(null)
  const today = dubaiToday()

  const byStep = new Map(plan.map((p) => [p.stepId, p]))
  const entries: Entry[] = []
  for (const task of tasks) {
    const current = task.completedAt ? undefined : currentStep(task)
    for (const step of task.steps) {
      if (step.userId !== owner.id) continue
      const item = byStep.get(step.id)
      if (item) {
        const { column, carried } = columnOf(item.scope, item.startDate, today)
        entries.push({ task, step, item, slot: column, carried: carried && step.status !== 'done' })
      } else if (current?.id === step.id) entries.push({ task, step, slot: 'unplanned', carried: false })
    }
  }
  const inSlot = (slot: Slot) => entries.filter((e) => e.slot === slot)
    .sort((a, b) => Number(a.step.status === 'done') - Number(b.step.status === 'done') || (a.item?.startDate ?? '').localeCompare(b.item?.startDate ?? '') || (a.item?.position ?? 0) - (b.item?.position ?? 0))

  const drop = (slot: Slot, e: DragEvent) => {
    e.preventDefault()
    setOver(null)
    const stepId = Number(e.dataTransfer.getData('text/plain'))
    const entry = entries.find((x) => x.step.id === stepId)
    if (!entry || entry.slot === slot) return
    set.mutate({ stepId, taskId: entry.task.id, userId: owner.id, column: slot === 'unplanned' ? null : slot })
  }

  const slots: { slot: Slot; label: string; hint: string }[] = [
    ...(editable ? [{ slot: 'unplanned' as const, label: 'Not planned', hint: 'Your open tasks. Drag one into a day or week.' }] : []),
    ...PLAN_COLUMNS.map((c) => ({ slot: c.key as Slot, label: c.label, hint: c.hint })),
  ]

  return (
    <>
      <div className="board-head">
        <Avatar userId={owner.id} size={36} />
        <div>
          <h2>{editable ? 'Your plan' : `${owner.name.split(' ')[0]}'s plan`}</h2>
          <p className="muted">{editable ? 'Drag a task into a column, or use "Plan for…" on its card.' : 'Only they can change their plan.'}</p>
        </div>
      </div>
      <div className="board plan-board">
        {slots.map(({ slot, label, hint }) => {
          const list = inSlot(slot)
          const openCount = list.filter((e) => e.step.status !== 'done').length
          return (
            <section
              key={slot}
              className={`column plan-col${slot === 'unplanned' ? ' unplanned' : ''}${over === slot ? ' drop' : ''}`}
              onDragOver={editable ? (e) => { e.preventDefault(); setOver(slot) } : undefined}
              onDragLeave={editable ? () => setOver((s) => (s === slot ? null : s)) : undefined}
              onDrop={editable ? (e) => drop(slot, e) : undefined}
            >
              <h3>{label} <span className="count">{openCount}</span></h3>
              <p className="col-sub">{hint}</p>
              {list.map((e) => <PlanCard key={e.step.id} entry={e} me={me} editable={editable} onOpen={() => setOpen(e.task)} />)}
              {!list.length && <p className="muted empty">{slot === 'unplanned' ? 'Everything is planned' : editable ? 'Drop a task here' : 'Nothing planned'}</p>}
            </section>
          )
        })}
      </div>
      {open && <TaskDialog task={open} me={me} defaultMonth="" onClose={() => setOpen(null)} />}
    </>
  )
}
