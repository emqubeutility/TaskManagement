import { useMemo, useState } from 'react'
import { choiceDialog, closeDialog, logTimeDialog, promptDialog } from '../dialogs'
import { dubaiToday } from '../../shared/dates'
import { useClients, useInbox, useMessageActions, useTaskActions, useTasks, useTimeTotals, useTypes, useUsers } from '../hooks'
import { currentStep, isTaskOwner, STATUS_LABEL, totalMinutes, type Filters, type StepStatus, type Task, type User } from '../types'
import { Icon } from '../icons'
import { Avatar } from './FlowEditor'
import { TaskDialog } from './TaskDialog'

const UNASSIGNED = 'none'

const LEGEND: [StepStatus, string][] = [
  ['offered', 'Sent to the person, waiting for accept'],
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

export function Card({ task, me, index, count, onEdit, move }: {
  task: Task; me: User; index: number; count: number; onEdit: () => void; move?: (d: -1 | 1) => void
}) {
  const { act, pass, logTime } = useTaskActions()
  const users = useUsers().data ?? []
  const clients = useClients().data ?? []
  const types = useTypes().data ?? []
  const step = currentStep(task)
  const mine = step?.userId === me.id
  const holder = users.find((u) => u.id === step?.userId)
  const canReorder = !!move && !!step && (me.role === 'admin' || isTaskOwner(task, me.id) || mine)
  const overdue = !!task.dueDate && !task.completedAt && task.dueDate < dubaiToday()
  const dueToday = task.dueDate === dubaiToday() && !task.completedAt
  const busy = act.isPending || pass.isPending || logTime.isPending
  const client = clients.find((c) => c.id === task.clientId)?.name
  const type = types.find((t) => t.id === task.typeId)?.name
  const ordered = [...task.steps].sort((a, b) => a.position - b.position)
  const doneCount = ordered.filter((s) => s.status === 'done').length
  const spent = totalMinutes(task)
  // Time this person already logged on their current step, and when they last did.
  const stepLogs = step ? (task.timeLogs ?? []).filter((l) => l.stepId === step.id) : []
  const loggedSoFar = stepLogs.reduce((n, l) => n + l.minutes, 0)
  const lastLogged = stepLogs.length ? stepLogs[stepLogs.length - 1].createdAt : null

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
  // Closing shows the start and close times and the minutes, which the person can correct.
  const askClose = (startedAt: string | null) => {
    const next = step ? ordered.find((s) => s.position > step.position && s.status !== 'done') : undefined
    const badge = (id: number | undefined) => {
      const u = users.find((x) => x.id === id)
      return u ? { name: u.name, initials: u.initials, colour: u.colour } : undefined
    }
    const nextName = users.find((u) => u.id === next?.userId)?.name
    return closeDialog({
      title: 'Close this task?',
      subtitle: `${task.title}${step ? ` · Step ${ordered.indexOf(step) + 1} of ${ordered.length}` : ''}`,
      from: badge(step?.userId), to: badge(next?.userId),
      startedAt: lastLogged ? new Date(lastLogged) : startedAt ? new Date(startedAt) : new Date(),
      sinceLabel: lastLogged ? 'Last logged' : 'Started', logged: loggedSoFar,
      commentLabel: nextName ? `Note for ${nextName} (optional)` : 'Note (optional)',
      confirmLabel: nextName ? 'Close & hand over' : 'Close task',
    })
  }
  const logTimeNow = async () => {
    const r = await logTimeDialog({ title: 'Log time', subtitle: task.title, logged: loggedSoFar })
    if (r) logTime.mutate({ task, minutes: r.minutes, note: r.note })
  }
  const closeTask = async () => {
    const r = await askClose(step?.startedAt ?? null)
    if (r) act.mutate({ task, action: 'close', minutes: r.minutes, comment: r.comment })
  }
  // "Ethics Site Design Work · handed over by Abdulla · due today"
  const before = step ? [...ordered].reverse().find((s) => s.position < step.position) : undefined
  const dueText = !task.dueDate ? '' : overdue ? 'overdue' : dueToday ? 'due today' : `due ${task.dueDate.slice(5)}`
  const contextLine = (withFrom: boolean) => [withFrom && before ? `handed over by ${users.find((u) => u.id === before.userId)?.name ?? 'someone'}` : '', dueText].filter(Boolean).join(' · ')
  const acceptTask = async () => {
    const pick = await choiceDialog({
      title: 'Accept this task?', subject: task.title, message: contextLine(true),
      choices: [
        { value: 'accept', label: 'Accept', icon: 'check', primary: true, description: "Move it to your To do. Start when you're ready." },
        { value: 'start', label: 'Accept & Start', icon: 'play', description: 'Move it to In progress. Your time is tracked from now.' },
        { value: 'close', label: 'Accept & Close', icon: 'check-circle', description: 'Already done? Close your step and pass it on.' },
      ],
    })
    if (!pick) return
    if (pick === 'close') {
      const r = await askClose(null)
      if (r) act.mutate({ task, action: 'accept', then: 'close', minutes: r.minutes, comment: r.comment })
    } else act.mutate({ task, action: 'accept', then: pick === 'start' ? 'start' : undefined })
  }
  const startTask = async () => {
    const pick = await choiceDialog({
      title: 'Start this task?', subject: task.title, message: contextLine(false),
      choices: [
        { value: 'start', label: 'Start', icon: 'play', primary: true, description: 'Move it to In progress. Your time is tracked from now.' },
        { value: 'close', label: 'Start & Close', icon: 'check-circle', description: 'Already done? Close your step and pass it on.' },
      ],
    })
    if (!pick) return
    if (pick === 'close') {
      const r = await askClose(null)
      if (r) act.mutate({ task, action: 'start', then: 'close', minutes: r.minutes, comment: r.comment })
    } else act.mutate({ task, action: 'start' })
  }

  const hint = !step ? '' : mine
    ? { offered: 'Your turn: accept this task to take it on.', todo: 'You accepted it. Start when you begin.', active: 'You are working on it. Close it when finished.', waiting: '', done: '' }[step.status]
    : `With ${holder?.name ?? 'someone'} · ${STATUS_LABEL[step.status].toLowerCase()}`

  return (
    <div className={`card-task status-${step?.status ?? 'done'}${mine ? ' mine' : ''}`}>
      {notes.map((m) => (
        <div className="card-note" key={m.id}>
          <Icon name="bell" size={14} />
          <div className="card-note-text">
            <strong>{m.authorId === me.id ? 'You' : users.find((u) => u.id === m.authorId)?.name ?? 'Someone'}</strong>
            <span className="muted"> {m.kind === 'close' ? 'closed their step' : m.kind === 'handover' ? 'handed this over' : 'tagged you'}</span>
            <p>{m.body}</p>
          </div>
          <button type="button" className="link" disabled={read.isPending} onClick={() => read.mutate(m.id)}>Mark as read</button>
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
        {client && <span className="chip">{client}</span>}
        {type && <span className="chip">{type}</span>}
        {task.dueDate && (
          <span className={overdue ? 'chip bad' : dueToday ? 'chip warn' : 'chip'}>
            {overdue ? 'Overdue · ' : dueToday ? 'Due today · ' : 'Due '}{task.dueDate.slice(5)}
          </span>
        )}
        {spent > 0 && <span className="chip" title="Total time logged on this task">{spent} min</span>}
      </div>
      {task.description && <p className="desc">{task.description}</p>}
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
      {step && <p className={mine ? 'hint mine-hint' : 'hint'}>{hint}</p>}
      {step && (
        <>
        {mine && step.status !== 'waiting' && step.status !== 'done' && (
          <div className="card-actions">
          {mine && step.status === 'offered' && <button className="primary" disabled={busy} onClick={acceptTask}>Accept</button>}
          {mine && step.status === 'todo' && <button className="primary" disabled={busy} onClick={startTask}>Start</button>}
          {mine && step.status === 'active' && <button className="primary" disabled={busy} onClick={closeTask}>Close</button>}
          {mine && step.status === 'active' && <button disabled={busy} onClick={logTimeNow} title="Log some time now and close it later">Log time</button>}
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
  ['offered', 'New', 'Sent to the person, waiting for accept'],
  ['todo', 'To do', 'Accepted, not started yet'],
  ['active', 'In progress', 'Being worked on right now'],
  ['done', 'Done', 'Steps you closed in the last 7 days'],
  ['done', 'Completed', 'Finished Task (shown to its owner only)'],
]

const STAGES: { status: StepStatus; label: string }[] = [
  { status: 'offered', label: 'New' },
  { status: 'todo', label: 'To do' },
  { status: 'active', label: 'In progress' },
]

export function Board({ me, filters }: { me: User; filters: Filters }) {
  const tasksQ = useTasks(filters, 'board')
  const users = (useUsers().data ?? []).filter((u) => u.active)
  const { reorder } = useTaskActions()
  const [editing, setEditing] = useState<Task | 'new' | null>(null)
  const [selected, setSelected] = useState<string>(String(me.id))

  // When the newest unread message tagged to me was posted, per task.
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
  const logged = useTimeTotals(filters.month).data?.find((t) => t.userId === member?.id)?.minutes ?? 0
  // Done is private: only the person themself sees the steps they closed in the last 7 days.
  const weekAgo = Date.now() - 7 * 24 * 3600 * 1000
  const done = isMe ? (tasksQ.data ?? []).filter((t) => t.steps.some((s) => s.userId === me.id && s.status === 'done' && s.closedAt && Date.parse(s.closedAt) > weekAgo)) : []
  // Completed: whole tasks that are finished. Only the owner of the task sees them, and only on their own view.
  const completed = isMe ? (tasksQ.data ?? []).filter((t) => t.completedAt && isTaskOwner(t, me.id)) : []

  return (
    <>
      <div className="toolbar">
        <button className="primary" onClick={() => setEditing('new')}>+ New task</button>
        <span className="spacer" />
        {tasksQ.isFetching && <span className="muted">Refreshing…</span>}
        {tasksQ.isError && <span className="error">Could not load tasks: {tasksQ.error.message}</span>}
      </div>
      <div className="board-layout">
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
                  <p className="muted">{mine.length} tasks across all stages{logged > 0 && ` · ${logged} min logged${filters.month ? ` in ${filters.month}` : ''}`}</p>
                </div>
                <div className="board-legend" aria-label="Stage guide">
                  {STAGE_GUIDE.map(([status, label, text]) => (
                    <div key={label}><span className={`badge ${status}`}>{label}</span><span className="muted">{text}</span></div>
                  ))}
                </div>
              </div>
              <div className="board">
                {STAGES.map((s) => {
                  const list = mine.filter((t) => currentStep(t)?.status === s.status)
                  return (
                    <section className="column" key={s.status}>
                      <h3><span className={`badge ${s.status}`}>{s.label}</span> <span className="count">{list.length}</span></h3>
                      {renderTasks(list, true)}
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
      </div>
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
