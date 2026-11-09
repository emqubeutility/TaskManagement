import { useMemo, useState } from 'react'
import { slotOf } from '../../shared/plan'
import { choiceDialog, promptDialog } from '../dialogs'
import { dubaiMonth, dubaiToday } from '../../shared/dates'
import { useClients, useInbox, useMessageActions, usePlan,  useTaskActions, useTasks, useTypes, useUsers } from '../hooks'
import { currentStep, isTaskOwner, STATUS_LABEL, totalMinutes, type Filters, type StepStatus, type Task, type User } from '../types'
import { Icon } from '../icons'
import { Avatar } from './FlowEditor'
import { dueText as dueDay, PlanBoard, slotText } from './Plan'
import { TaskDialog } from './TaskDialog'

const UNASSIGNED = 'none'

const LEGEND: [StepStatus, string][] = [
  ['offered', 'Waiting for accept'],
  ['todo', 'Accepted, not started yet'],
  ['active', 'Being worked on right now'],
  ['done', 'Finished and passed on'],
]

/** Explains what each status colour means. */
export function Legend() {
  return (
    <div className="legend" aria-label="Status guide">
      {LEGEND.map(([s, text]) => (
        <span key={s} className="legend-item" title={text}><span className={`badge ${s}`}>{STATUS_LABEL[s]}</span><span className="muted">{text}</span></span>
      ))}
    </div>
  )
}

/** 2026-11-06 -> "Fri 6 Nov" */
const planDay = (ymd: string) => {
  const d = new Date(`${ymd}T00:00:00Z`)
  return `${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getUTCDay()]} ${d.getUTCDate()} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getUTCMonth()]}`
}

export function Card({ task, me, index, count, onEdit, move }: {
  task: Task; me: User; index: number; count: number; onEdit: () => void; move?: (d: -1 | 1) => void
}) {
  const { act, pass } = useTaskActions()
  const users = useUsers().data ?? []
  const clientName = (useClients().data ?? []).find((c) => c.id === task.clientId)?.name
  const step = currentStep(task)
  const mine = step?.userId === me.id
  // Where this step sits in my plan, if I planned it.
  const planItem = (usePlan(me.id).data ?? []).find((p) => p.stepId === step?.id)
  const planned = planItem ? slotOf(planItem.startDate) : null
  const holder = users.find((u) => u.id === step?.userId)
  const canReorder = !!move && !!step && (me.role === 'admin' || isTaskOwner(task, me.id) || mine)
  const overdue = !!task.dueDate && !task.completedAt && task.dueDate < dubaiToday()
  const dueToday = task.dueDate === dubaiToday() && !task.completedAt
  const busy = act.isPending || pass.isPending
  const ordered = [...task.steps].sort((a, b) => a.position - b.position)
  const doneCount = ordered.filter((s) => s.status === 'done').length
  const spent = totalMinutes(task)

  // Notes sent to me about this task stay at the top of the card until I mark them read.
  const { read } = useMessageActions()
  const notes = (useInbox().data?.items ?? []).filter((p) => p.taskId === task.id && p.mentions.some((m) => m.userId === me.id && !m.readAt))

  const handOver = async (toUserId: number) => {
    const to = users.find((u) => u.id === toUserId)
    const name = to?.name ?? 'them'
    const mode = await choiceDialog({
      title: 'Pass this task on', subject: task.title, message: `To ${name}`,
      choices: [
        { value: 'handover', label: 'Hand over', icon: 'arrow-right', primary: true, description: `${name} takes your place in the flow. You are out of it.` },
        { value: 'circle', label: 'Circle back', icon: 'refresh', description: `${name} goes first, then it comes back to you. The rest of the flow stays the same.` },
      ],
    })
    if (!mode) return
    const circle = mode === 'circle'
    const note = await promptDialog({
      title: circle ? `Circle back via ${name}` : `Hand over to ${name}`,
      message: circle ? `"${task.title}" goes to ${name} first, then back to you.` : `"${task.title}" goes to ${name} to accept.`,
      label: 'Message for them (optional)', confirmLabel: circle ? 'Circle back' : 'Hand over', multiline: true, optional: true,
    })
    if (note !== null) pass.mutate({ task, toUserId, comment: note, mode: circle ? 'circle' : 'handover' })
  }
  // Starting, pausing and ending a task is done in the timesheet on the Plan tab; here a task is only accepted or passed on.
  const acceptTask = () => act.mutate({ task, action: 'accept' })

  const hint = !step ? '' : mine
    ? { offered: 'Your turn: accept this task to take it on.', todo: '', active: '', waiting: '', done: '' }[step.status]
    : `With ${holder?.name ?? 'someone'} · ${STATUS_LABEL[step.status].toLowerCase()}`

  return (
    <div className={`card-task status-${step?.status ?? 'done'}${mine ? ' mine' : ''}`}>
      {notes.map((m) => (
        <div className="card-note" key={m.id}>
          <div className="card-note-head">
            <Icon name="bell" size={14} />
            <div className="card-note-text">
              <strong>{m.authorId === me.id ? 'You' : users.find((u) => u.id === m.authorId)?.name ?? 'Someone'}</strong>
            </div>
            <button type="button" className="link" disabled={read.isPending} onClick={() => read.mutate(m.id)}>Mark as read</button>
          </div>
          <p className="card-note-body" tabIndex={0}>{m.body}</p>
        </div>
      ))}
      <div className="card-head">
        <button className="link title" onClick={onEdit}>{task.title}</button>
        {canReorder && (
          <span className="row-actions">
            <button className="icon" disabled={index === 0} onClick={() => move!(-1)} aria-label="Move up" title="Higher priority"><Icon name="up" size={14} /></button>
            <button className="icon" disabled={index === count - 1} onClick={() => move!(1)} aria-label="Move down" title="Lower priority"><Icon name="down" size={14} /></button>
          </span>
        )}
      </div>
      <div className="meta">
        {clientName && <span className="chip client-chip" title="Client">{clientName}</span>}
        {task.dueDate && (
          <span className={overdue ? 'chip bad' : dueToday ? 'chip warn' : 'chip'}>
            {dueToday ? 'Due today' : `${overdue ? 'Overdue ' : 'Due '}${dueDay(task.dueDate)}`}
          </span>
        )}
        {spent > 0 && <span className="chip" title="Total time logged on this task">{spent} min</span>}
        {mine && planned && <span className="chip plan-chip" title="In your plan"><Icon name="calendar" size={11} /> {slotText(planned, dubaiMonth())}{planItem && ` · ${planDay(planItem.startDate)}`}</span>}
      </div>
      {ordered.length > 0 && (
        <div className="progress" title={`${doneCount} of ${ordered.length} steps done`}>
          <div className="progress-bar"><span style={{ width: `${(doneCount / ordered.length) * 100}%` }} /></div>
          <div className="flow-dots">
            {ordered.map((s) => (
              <span key={s.id} className={`dot ${s.status}`} title={`${users.find((u) => u.id === s.userId)?.name}: ${STATUS_LABEL[s.status]}${s.minutes != null ? ` · ${s.minutes} min` : ''}`}>
                {users.find((u) => u.id === s.userId)?.initials}
              </span>
            ))}
            <span className="muted step-count">{task.completedAt ? 'Complete' : `Step ${Math.min(doneCount + 1, ordered.length)} of ${ordered.length}`}</span>
          </div>
        </div>
      )}
      {step && hint && <p className={mine ? 'hint mine-hint' : 'hint'}>{hint}</p>}
      {step && (
        <>
        {mine && step.status === 'offered' && (
          <div className="card-actions">
          {mine && step.status === 'offered' && <button className="primary" disabled={busy} onClick={acceptTask}>Accept</button>}
          </div>
        )}
        <div className="card-secondary">
          <select
            value=""
            disabled={busy}
            onChange={(e) => e.target.value && handOver(Number(e.target.value))}
            aria-label="Hand this task to someone else"
          >
            <option value="">Pass on…</option>
            {users.filter((u) => u.active && u.id !== step.userId).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </div>
        </>
      )}
    </div>
  )
}

const STAGE_GUIDE: [StepStatus, string, string][] = [
  ['offered', 'Yet to accept', 'Waiting for accept'],
  ['todo', 'Accepted', 'Accepted, not started yet'],
  ['active', 'In progress', 'Being worked on right now'],
  ['done', 'Done', 'Steps you closed in the last 7 days'],
  ['done', 'Completed', 'Finished Task (shown to its owner only)'],
]

const STAGES: { status: StepStatus; label: string }[] = [
  { status: 'active', label: 'In progress' },
]

export function Board({ me, filters, mode, onMode }: { me: User; filters: Filters; mode: 'stages' | 'plan'; onMode: (m: 'stages' | 'plan') => void }) {
  const tasksQ = useTasks(filters, 'board')
  const users = (useUsers().data ?? []).filter((u) => u.active)
  const { reorder } = useTaskActions()
  const [editing, setEditing] = useState<Task | 'new' | null>(null)
  const [selected, setSelected] = useState<string>(String(me.id))
  // The To do column has two tabs: tasks sent to the person that they have not accepted yet, and the ones they accepted.
  const [todoTab, setTodoTab] = useState<'offered' | 'todo'>('todo')

  // When the newest unread message tagged to me was posted, per task.
  // In progress and Accepted follow the plan: what is planned for today first (in the order set on the Plan page), then what is planned
  // on other days of this week (by day), then the rest as they were. Only the tasks planned for today can be moved up or down here.
  const planned = usePlan(Number(selected) || me.id).data
  const planGroups = (list: Task[]) => {
    const byStep = new Map<number, (typeof planned & object)[number]>()
    const today0 = dubaiToday()
    for (const p of planned ?? []) {
      const have = byStep.get(p.stepId)
      // A step planned on several days: today's counts, otherwise the earliest.
      if (!have || (have.startDate !== today0 && (p.startDate === today0 || p.startDate < have.startDate))) byStep.set(p.stepId, p)
    }
    const today = dubaiToday()
    const now = slotOf(today)
    const itemOf = (t: Task) => byStep.get(currentStep(t)?.id ?? -1)
    const inDay: Task[] = [], inWeek: Task[] = [], rest: Task[] = []
    for (const t of list) {
      const item = itemOf(t)
      const sl = item ? slotOf(item.startDate) : null
      if (item?.startDate === today) inDay.push(t)
      else if (item && sl && sl.month === now.month && sl.week === now.week) inWeek.push(t)
      else rest.push(t)
    }
    const pos = (t: Task) => itemOf(t)?.position ?? 0
    inDay.sort((a, b) => pos(a) - pos(b))
    inWeek.sort((a, b) => itemOf(a)!.startDate.localeCompare(itemOf(b)!.startDate) || pos(a) - pos(b))
    return { inDay, inWeek, rest }
  }
  // In progress is one list in plan order, no groups.
  const renderPlanned = (list: Task[]) => {
    const { inDay, inWeek, rest } = planGroups(list)
    return [...inDay, ...inWeek, ...rest].map((t) => <Card key={t.id} task={t} me={me} index={0} count={1} onEdit={() => setEditing(t)} />)
  }
  const inbox = useInbox().data
  const latestMessage = useMemo(() => {
    const by = new Map<number, number>()
    for (const p of inbox?.items ?? []) {
      if (p.taskId === null || !p.mentions.some((m) => m.userId === me.id && !m.readAt)) continue
      by.set(p.taskId, Math.max(by.get(p.taskId) ?? 0, Date.parse(p.createdAt)))
    }
    return by
  }, [inbox, me.id])

  const { unassigned, held } = useMemo(() => {
    const held = new Map<number, Task[]>()
    const unassigned: Task[] = []
    for (const t of tasksQ.data ?? []) {
      if (t.completedAt) continue
      const step = currentStep(t)
      if (!step) unassigned.push(t)
      else held.set(step.userId, [...(held.get(step.userId) ?? []), t])
    }
    return { unassigned, held }
  }, [tasksQ.data])

  const move = (list: Task[], i: number, d: -1 | 1) => {
    const ids = list.map((t) => t.id)
    ;[ids[i], ids[i + d]] = [ids[i + d], ids[i]]
    reorder.mutate(ids)
  }

  // Tasks with an unread message for me are pinned to the top, newest message first; the arrows only reorder the others.
  const renderTasks = (list: Task[], canMove: boolean) => {
    const pinned = list.filter((t) => latestMessage.has(t.id)).sort((a, b) => (latestMessage.get(b.id) ?? 0) - (latestMessage.get(a.id) ?? 0))
    const rest = list.filter((t) => !latestMessage.has(t.id))
    return (
      <>
        {pinned.map((t) => <Card key={t.id} task={t} me={me} index={0} count={1} onEdit={() => setEditing(t)} />)}
        {rest.map((t, i) => <Card key={t.id} task={t} me={me} index={i} count={rest.length} onEdit={() => setEditing(t)} move={canMove ? (d) => move(rest, i, d) : undefined} />)}
      </>
    )
  }

  const member = users.find((u) => String(u.id) === selected)
  const mine = member ? held.get(member.id) ?? [] : []
  const isMe = member?.id === me.id
  // Done is private: only the person themself sees the steps they closed in the last 7 days.
  const weekAgo = Date.now() - 7 * 24 * 3600 * 1000
  const done = isMe ? (tasksQ.data ?? []).filter((t) => t.steps.some((s) => s.userId === me.id && s.status === 'done' && s.closedAt && Date.parse(s.closedAt) > weekAgo)) : []
  // Completed: whole tasks that are finished. Only the owner of the task sees them, and only on their own view.
  const completed = isMe ? (tasksQ.data ?? []).filter((t) => t.completedAt && isTaskOwner(t, me.id)) : []

  return (
    <>
      <div className="toolbar">
        <button className="primary" onClick={() => setEditing('new')}>+ New task</button>
        <div className="seg" role="tablist" aria-label="Board view">
          <button type="button" role="tab" aria-selected={mode === 'stages'} className={mode === 'stages' ? 'on' : ''} onClick={() => onMode('stages')}>Stages</button>
          <button type="button" role="tab" aria-selected={mode === 'plan'} className={mode === 'plan' ? 'on' : ''} onClick={() => onMode('plan')}><Icon name="calendar" size={14} /> Plan</button>
        </div>
        <span className="spacer" />
        {tasksQ.isFetching && <span className="muted">Refreshing…</span>}
        {tasksQ.isError && <span className="error">Could not load tasks: {tasksQ.error.message}</span>}
      </div>
      {mode === 'plan' ? <PlanBoard owner={me} me={me} withNew={false} filters={filters} /> : <div className="board-layout">
        <aside className="board-side">
          <button type="button" className={selected === UNASSIGNED ? 'side-pick active' : 'side-pick'} onClick={() => setSelected(UNASSIGNED)} title="Tasks with no people in their flow yet">
            <span className="side-name">No flow yet</span><span className="count">{unassigned.length}</span>
          </button>
          <p className="side-label">Members</p>
          {[...users].sort((a, b) => Number(b.id === me.id) - Number(a.id === me.id)).map((u) => (
            <button type="button" key={u.id} className={selected === String(u.id) ? 'side-pick active' : 'side-pick'} onClick={() => setSelected(String(u.id))}>
              <Avatar userId={u.id} size={28} />
              <span className="side-name">{u.id === me.id ? 'You' : u.name}</span>
              <span className="count">{held.get(u.id)?.length ?? 0}</span>
            </button>
          ))}
        </aside>
        <div className="board-main">
          {selected === UNASSIGNED ? (
            <>
              <div className="board-head">
                <div><h2>No flow yet</h2><p className="muted">{unassigned.length} tasks · add people to a task's flow to start it</p></div>
              </div>
              <div className="board">
                <section className="column">
                  {renderTasks(unassigned, false)}
                  {!unassigned.length && <p className="muted empty">Every task has a flow</p>}
                </section>
              </div>
            </>
          ) : member && (
            <>
              <div className="board-head">
                <Avatar userId={member.id} size={36} />
                <div>
                  <h2>{isMe ? 'Your tasks' : `${member.name.split(' ')[0]}'s tasks`}</h2>
                  <p className="muted">{mine.length} tasks across all stages</p>
                </div>
                <div className="board-legend" aria-label="Stage guide">
                  {STAGE_GUIDE.map(([status, label, text]) => (
                    <div key={label}><span className={`badge ${status}`}>{label}</span><span className="muted">{text}</span></div>
                  ))}
                </div>
              </div>
              <div className="board">
                {(() => {
                  // Newest first, so a task just added to me is at the top.
                  const toAccept = mine.filter((t) => currentStep(t)?.status === 'offered').sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id - a.id)
                  const accepted = mine.filter((t) => currentStep(t)?.status === 'todo')
                  const list = todoTab === 'offered' ? toAccept : accepted
                  return (
                    <section className="column todo-column">
                      <div className="col-head">
                      <h3><span className="badge todo">To do</span></h3>
                      <div className="seg col-tabs" role="tablist" aria-label="To do tasks">
                        <button type="button" role="tab" aria-selected={todoTab === 'offered'} className={todoTab === 'offered' ? 'on' : ''} onClick={() => setTodoTab('offered')}>Yet to accept <span className="tab-count">{toAccept.length}</span></button>
                        <button type="button" role="tab" aria-selected={todoTab === 'todo'} className={todoTab === 'todo' ? 'on' : ''} onClick={() => setTodoTab('todo')}>Accepted <span className="tab-count">{accepted.length}</span></button>
                      </div>
                      </div>
                      {todoTab === 'todo' ? renderPlanned(list) : renderTasks(list, false)}
                      {!list.length && <p className="muted empty">{todoTab === 'offered' ? 'Nothing waiting to be accepted' : 'Nothing accepted yet'}</p>}
                    </section>
                  )
                })()}
                {STAGES.map((s) => {
                  const list = mine.filter((t) => currentStep(t)?.status === s.status)
                  return (
                    <section className="column" key={s.status}>
                      <h3><span className={`badge ${s.status}`}>{s.label}</span> <span className="count">{list.length}</span></h3>
                      {s.status === 'active' ? renderPlanned(list) : renderTasks(list, true)}
                      {!list.length && <p className="muted empty">Nothing here</p>}
                    </section>
                  )
                })}
                {isMe && <section className="column">
                  <h3><span className="badge done">Done</span> <span className="count">{done.length}</span></h3>
                  <p className="col-sub">Steps you closed in the last 7 days</p>
                  {renderTasks(done, false)}
                  {!done.length && <p className="muted empty">Nothing finished this week</p>}
                </section>}
                {isMe && <section className="column">
                  <h3><span className="badge done">Completed</span> <span className="count">{completed.length}</span></h3>
                  <p className="col-sub">Tasks you own that are fully finished</p>
                  {renderTasks(completed, false)}
                  {!completed.length && <p className="muted empty">No completed tasks yet</p>}
                </section>}
              </div>
            </>
          )}
        </div>
      </div>}
      {editing && (
        <TaskDialog
          task={editing === 'new' ? undefined : editing}
          me={me}
          defaultMonth={filters.month}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  )
}
