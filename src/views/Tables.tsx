import { useState } from 'react'
import { dubaiToday } from '../../shared/dates'
import { useClients, useTasks, useTypes, useUsers } from '../hooks'
import { currentStep, STATUS_LABEL, type Filters, type Task, type User } from '../types'
import { Legend } from './Board'
import { PersonName } from './FlowEditor'
import { TaskDialog } from './TaskDialog'

function useLookupNames() {
  const clients = useClients().data ?? []
  const types = useTypes().data ?? []
  return {
    client: (id: number | null) => clients.find((c) => c.id === id)?.name ?? '',
    type: (id: number | null) => types.find((t) => t.id === id)?.name ?? '',
  }
}

/** The "Excel grid": one row per task, one column per person showing where they are in the flow. */
export function Tracker({ me, filters }: { me: User; filters: Filters }) {
  const { data: tasks = [], isLoading } = useTasks(filters, 'all')
  const users = (useUsers().data ?? []).filter((u) => u.active)
  const names = useLookupNames()
  const [editing, setEditing] = useState<Task | null>(null)
  const today = dubaiToday()

  if (isLoading) return <p className="muted pad">Loading…</p>
  return (
    <>
      <Legend />
      <p className="muted help">Read each row left to right: the colour in a person's column shows how far that person is with the task.</p>
      <div className="table-wrap">
        <table className="tracker">
          <thead>
            <tr>
              <th>Task</th><th>Client</th><th>Type</th><th>Owner</th><th>Due</th>
              {users.map((u) => <th key={u.id} className="person" title={u.name}>{u.initials}</th>)}
            </tr>
          </thead>
          <tbody>
            {tasks.map((t) => (
              <tr key={t.id}>
                <td><button className="link" onClick={() => setEditing(t)}>{t.title}</button></td>
                <td>{names.client(t.clientId)}</td>
                <td>{names.type(t.typeId)}</td>
                <td><PersonName id={t.ownerId} /></td>
                <td className={t.dueDate && !t.completedAt && t.dueDate < today ? 'bad-text' : ''}>{t.dueDate ?? ''}</td>
                {users.map((u) => {
                  const s = t.steps.find((x) => x.userId === u.id)
                  return <td key={u.id} className={s ? `cell ${s.status}` : 'cell'} title={s ? STATUS_LABEL[s.status] : ''}>{s ? STATUS_LABEL[s.status] : ''}</td>
                })}
              </tr>
            ))}
            {!tasks.length && <tr><td colSpan={5 + users.length} className="muted">No tasks match these filters</td></tr>}
          </tbody>
        </table>
      </div>
      {editing && <TaskDialog task={editing} me={me} defaultMonth={filters.month} onClose={() => setEditing(null)} />}
    </>
  )
}

export function ListView({ me, filters }: { me: User; filters: Filters }) {
  const { data: tasks = [], isLoading } = useTasks(filters, 'all')
  const names = useLookupNames()
  const [editing, setEditing] = useState<Task | null>(null)
  const [query, setQuery] = useState('')
  const today = dubaiToday()
  const shown = tasks.filter((t) => t.title.toLowerCase().includes(query.toLowerCase()))

  if (isLoading) return <p className="muted pad">Loading…</p>
  return (
    <>
      <div className="toolbar"><input placeholder="Search titles…" value={query} onChange={(e) => setQuery(e.target.value)} /></div>
      <ul className="list">
        {shown.map((t) => {
          const step = currentStep(t)
          const overdue = t.dueDate && !t.completedAt && t.dueDate < today
          return (
            <li key={t.id}>
              <button className="link title" onClick={() => setEditing(t)}>{t.title}</button>
              <span className="muted">{[names.client(t.clientId), names.type(t.typeId), t.month].filter(Boolean).join(' · ')}</span>
              <span className={overdue ? 'bad-text' : 'muted'}>{t.dueDate ? `Due ${t.dueDate}` : ''}</span>
              <span className="who">
                {step ? <><PersonName id={step.userId} /> <span className={`badge ${step.status}`}>{STATUS_LABEL[step.status]}</span></> : t.completedAt ? <span className="badge done">Complete</span> : <span className="muted">No flow</span>}
              </span>
            </li>
          )
        })}
        {!shown.length && <li className="muted">No tasks match. Try a different month or clear the filters.</li>}
      </ul>
      {editing && <TaskDialog task={editing} me={me} defaultMonth={filters.month} onClose={() => setEditing(null)} />}
    </>
  )
}
