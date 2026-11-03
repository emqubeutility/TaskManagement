import { useMemo, useState } from 'react'
import { promptDialog } from '../dialogs'
import { dubaiToday } from '../../shared/dates'
import { useClients, useInbox, useMessageActions, useTaskActions, useTasks, useTypes, useUsers } from '../hooks'
import { currentStep, STATUS_LABEL, type Filters, type StepStatus, type Task, type User } from '../types'
import { Icon } from '../icons'
import { Avatar } from './FlowEditor'
import { TaskDialog } from './TaskDialog'

const RECENT_DONE = 'done'
const UNASSIGNED = 'none'

const LEGEND: [StepStatus, string][] = [
  ['offered', 'Sent to the person, waiting for them to accept'],
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
  const { act, pass } = useTaskActions()
  const users = useUsers().data ?? []
  const clients = useClients().data ?? []
  const types = useTypes().data ?? []
  const step = currentStep(task)
  const mine = step?.userId === me.id
  const holder = users.find((u) => u.id === step?.userId)
  const canReorder = !!move && !!step && (me.role === 'admin' || task.ownerId === me.id || mine)
  const overdue = !!task.dueDate && !task.completedAt && task.dueDate < dubaiToday()
  const dueToday = task.dueDate === dubaiToday() && !task.completedAt
  const busy = act.isPending || pass.isPending
  const client = clients.find((c) => c.id === task.clientId)?.name
  const type = types.find((t) => t.id === task.typeId)?.name
  const ordered = [...task.steps].sort((a, b) => a.position - b.position)
  const doneCount = ordered.filter((s) => s.status === 'done').length

  // Notes sent to me about this task stay at the top of the card until I mark them read.
  const { read } = useMessageActions()
  const notes = (useInbox().data?.items ?? []).filter((p) => p.taskId === task.id && p.mentions.some((m) => m.userId === me.id && !m.readAt))

  const handOver = async (toUserId: number) => {
    const to = users.find((u) => u.id === toUserId)
    const note = await promptDialog({
      title: `Hand over to ${to?.name ?? 'this person'}`, message: `"${task.title}" goes to ${to?.name ?? 'them'} to accept.`,
      label: 'Message for them (optional)', confirmLabel: 'Hand over', multiline: true, optional: true,
    })
    if (note !== null) pass.mutate({ task, toUserId, comment: note })
  }
  const closeTask = async () => {
    const next = step ? ordered.find((s) => s.position > step.position && s.status !== 'done') : undefined
    const nextName = users.find((u) => u.id === next?.userId)?.name
    const note = await promptDialog({
      title: 'Close this task?', message: nextName ? `It goes to ${nextName} to accept next.` : 'This is the last step, so the task will be complete.',
      label: nextName ? `Comment for ${nextName} (optional)` : 'Comment (optional)', confirmLabel: 'Close task', multiline: true, optional: true,
    })
    if (note !== null) act.mutate({ task, action: 'close', comment: note })
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
      </div>
      {task.description && <p className="desc">{task.description}</p>}
      {ordered.length > 0 && (
        <div className="progress" title={`${doneCount} of ${ordered.length} steps done`}>
          <div className="progress-bar"><span style={{ width: `${(doneCount / ordered.length) * 100}%` }} /></div>
          <div className="flow-dots">
            {ordered.map((s) => (
              <span key={s.id} className={`dot ${s.status}`} title={`${users.find((u) => u.id === s.userId)?.name}: ${STATUS_LABEL[s.status]}`}>
                {users.find((u) => u.id === s.userId)?.initials}
              </span>
            ))}
            <span className="muted step-count">{task.completedAt ? 'Complete' : `Step ${Math.min(doneCount + 1, ordered.length)} of ${ordered.length}`}</span>
          </div>
        </div>
      )}
      {step && <p className={mine ? 'hint mine-hint' : 'hint'}>{hint}</p>}
      {step && (
        <div className="card-actions">
          {mine && step.status === 'offered' && <button className="primary" disabled={busy} onClick={() => act.mutate({ task, action: 'accept' })}>Accept</button>}
          {mine && step.status === 'todo' && <button className="primary" disabled={busy} onClick={() => act.mutate({ task, action: 'start' })}>Start</button>}
          {mine && step.status === 'active' && <button className="primary" disabled={busy} onClick={closeTask}>Close</button>}
          <select
            value=""
            disabled={busy}
            onChange={(e) => e.target.value && handOver(Number(e.target.value))}
            aria-label="Hand this task to someone else"
          >
            <option value="">Hand over to…</option>
            {users.filter((u) => u.active && u.id !== step.userId).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </div>
      )}
    </div>
  )
}

export function Board({ me, filters }: { me: User; filters: Filters }) {
  const tasksQ = useTasks(filters, 'board')
  const users = (useUsers().data ?? []).filter((u) => u.active)
  const { reorder } = useTaskActions()
  const [editing, setEditing] = useState<Task | 'new' | null>(null)
  const [onlyMine, setOnlyMine] = useState(false)
  // Which people's "Tasks to accept" groups are folded. Remembered in this browser only.
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() => {
    try { return JSON.parse(localStorage.getItem('cf_folded_accept') ?? '{}') } catch { return {} }
  })
  const toggleFolded = (key: string) => {
    const next = { ...collapsed, [key]: !collapsed[key] }
    setCollapsed(next)
    try { localStorage.setItem('cf_folded_accept', JSON.stringify(next)) } catch { /* storage unavailable: fold state just won't persist */ }
  }

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

  const columns = useMemo(() => {
    const by = new Map<string, Task[]>()
    for (const t of tasksQ.data ?? []) {
      const step = currentStep(t)
      const key = t.completedAt ? RECENT_DONE : step ? String(step.userId) : UNASSIGNED
      by.set(key, [...(by.get(key) ?? []), t])
    }
    return by
  }, [tasksQ.data])

  const move = (list: Task[], i: number, d: -1 | 1) => {
    const ids = list.map((t) => t.id)
    ;[ids[i], ids[i + d]] = [ids[i + d], ids[i]]
    reorder.mutate(ids)
  }

  const renderColumn = (key: string, title: React.ReactNode, sub: string) => {
    const list = columns.get(key) ?? []
    const isPerson = key !== RECENT_DONE && key !== UNASSIGNED
    // A task with an unread message for me is pinned to the top of its group; the arrows only reorder the others.
    const card = (t: Task, i: number) => (
      <Card key={t.id} task={t} me={me} index={i} count={list.length} onEdit={() => setEditing(t)} move={isPerson && !latestMessage.has(t.id) ? (d) => move(list, i, d) : undefined} />
    )
    // Newest message first.
    const newestFirst = (a: readonly [Task, number], b: readonly [Task, number]) => (latestMessage.get(b[0].id) ?? 0) - (latestMessage.get(a[0].id) ?? 0)
    // In a person's column, tasks still waiting for them to accept sit in a group that can be folded away.
    const entries = list.map((t, i) => [t, i] as const)
    const withMessage = isPerson ? entries.filter(([t]) => latestMessage.has(t.id)).sort(newestFirst) : []
    const others = isPerson ? entries.filter(([t]) => !latestMessage.has(t.id)) : entries
    const toAccept = isPerson ? others.filter(([t]) => currentStep(t)?.status === 'offered') : []
    const rest = isPerson ? others.filter(([t]) => currentStep(t)?.status !== 'offered') : others
    const folded = !!collapsed[key]
    return (
      <section className={`column${key === String(me.id) ? ' my-column' : ''}`} key={key}>
        <h3>{title} <span className="count">{list.length}</span></h3>
        <p className="col-sub">{sub}</p>
        {withMessage.map(([t, i]) => card(t, i))}
        {toAccept.length > 0 && (
          <div className="accept-group">
            <button type="button" className="accept-head" aria-expanded={!folded} onClick={() => toggleFolded(key)}>
              <Icon name="chevron" size={16} className={folded ? 'chev folded' : 'chev'} />
              <span>Tasks to accept</span>
              <span className="count">{toAccept.length}</span>
            </button>
            {!folded && toAccept.map(([t, i]) => card(t, i))}
          </div>
        )}
        {rest.map(([t, i]) => card(t, i))}
        {!list.length && <p className="muted empty">{key === RECENT_DONE ? 'Nothing finished this week' : 'No tasks right now'}</p>}
      </section>
    )
  }

  const visibleUsers = onlyMine ? users.filter((u) => u.id === me.id) : users

  return (
    <>
      <div className="toolbar">
        <button className="primary" onClick={() => setEditing('new')}>+ New task</button>
        <label className="check"><input type="checkbox" checked={onlyMine} onChange={(e) => setOnlyMine(e.target.checked)} /> Show only my column</label>
        <span className="spacer" />
        {tasksQ.isFetching && <span className="muted">Refreshing…</span>}
        {tasksQ.isError && <span className="error">Could not load tasks: {tasksQ.error.message}</span>}
      </div>
      <Legend />
      <p className="muted help">Each column is a person. A task sits in the column of whoever has it now, and moves along when they close their step.</p>
      <div className="board">
        {!onlyMine && columns.has(UNASSIGNED) && renderColumn(UNASSIGNED, 'No flow yet', 'Add people to its flow to start it')}
        {visibleUsers.map((u) => renderColumn(String(u.id), <><Avatar userId={u.id} size={22} /> {u.id === me.id ? 'You' : u.name}</>, u.id === me.id ? 'Tasks waiting on you' : `Tasks with ${u.name.split(' ')[0]}`))}
        {!onlyMine && renderColumn(RECENT_DONE, <><Icon name="check" size={14} /> Completed</>, 'Finished in the last 7 days')}
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
