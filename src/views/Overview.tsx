import { useState } from 'react'
import { dubaiToday } from '../../shared/dates'
import { useTasks, useUsers } from '../hooks'
import { currentStep, type Filters, type Task, type User } from '../types'
import { Avatar } from './FlowEditor'
import { Card } from './Board'
import { TaskDialog } from './TaskDialog'

const ALL: Filters = { month: '', owner: '', client: '', type: '' }

function Stat({ label, value, hint, tone }: { label: string; value: number; hint: string; tone?: 'bad' | 'warn' | 'ok' }) {
  return (
    <div className={`stat${tone ? ` ${tone}` : ''}`}>
      <span className="stat-label">{label}</span>
      <strong className="stat-value">{value}</strong>
      <span className="muted stat-hint">{hint}</span>
    </div>
  )
}

/** The home page: what needs me, what is late, and how busy everyone is. */
export function Overview({ me, goBoard }: { me: User; goBoard: () => void }) {
  const { data: tasks = [], isLoading } = useTasks(ALL, 'board')
  const users = (useUsers().data ?? []).filter((u) => u.active)
  const [editing, setEditing] = useState<Task | null>(null)
  const today = dubaiToday()

  if (isLoading) return <p className="muted pad">Loading…</p>

  const open = tasks.filter((t) => !t.completedAt && currentStep(t))
  const mine = open.filter((t) => currentStep(t)!.userId === me.id)
  const waitingForMe = mine.filter((t) => currentStep(t)!.status === 'offered')
  const overdue = open.filter((t) => t.dueDate && t.dueDate < today)
  const dueToday = open.filter((t) => t.dueDate === today)
  const inProgress = open.filter((t) => currentStep(t)!.status === 'active')
  const doneWeek = tasks.filter((t) => t.completedAt)
  const load = users.map((u) => ({ u, n: open.filter((t) => currentStep(t)!.userId === u.id).length }))
  const busiest = Math.max(1, ...load.map((l) => l.n))
  const byDue = (a: Task, b: Task) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999')

  return (
    <>
      <div className="stats">
        <Stat label="Waiting for you" value={waitingForMe.length} hint="Accept these to start" tone={waitingForMe.length ? 'warn' : undefined} />
        <Stat label="Overdue" value={overdue.length} hint="Past their due date" tone={overdue.length ? 'bad' : 'ok'} />
        <Stat label="Due today" value={dueToday.length} hint="Dubai time" />
        <Stat label="In progress" value={inProgress.length} hint="Being worked on now" />
        <Stat label="Completed" value={doneWeek.length} hint="In the last 7 days" tone="ok" />
      </div>

      <div className="overview-grid">
        <section>
          <h2>Your tasks <span className="count">{mine.length}</span></h2>
          <p className="muted help">Everything that is with you right now, soonest due first.</p>
          {mine.sort(byDue).map((t) => <Card key={t.id} task={t} me={me} index={0} count={1} onEdit={() => setEditing(t)} />)}
          {!mine.length && (
            <div className="empty-box">
              <strong>You're all caught up</strong>
              <span className="muted">Nothing is waiting on you. <button className="link inline" onClick={goBoard}>Open the board</button> to see the team's work.</span>
            </div>
          )}
        </section>

        <section>
          <h2>Needs attention <span className="count">{overdue.length}</span></h2>
          <p className="muted help">Overdue tasks across the whole team.</p>
          {overdue.sort(byDue).slice(0, 6).map((t) => <Card key={t.id} task={t} me={me} index={0} count={1} onEdit={() => setEditing(t)} />)}
          {!overdue.length && <div className="empty-box"><strong>Nothing is overdue</strong><span className="muted">Every open task is within its due date.</span></div>}

          <h2 className="spaced">Team workload</h2>
          <p className="muted help">Open tasks each person is holding.</p>
          <div className="card workload">
            {load.map(({ u, n }) => (
              <div className="load-row" key={u.id}>
                <Avatar userId={u.id} size={26} />
                <span className="load-name">{u.id === me.id ? 'You' : u.name}</span>
                <div className="load-bar"><span style={{ width: `${(n / busiest) * 100}%` }} /></div>
                <strong>{n}</strong>
              </div>
            ))}
          </div>
        </section>
      </div>
      {editing && <TaskDialog task={editing} me={me} defaultMonth="" onClose={() => setEditing(null)} />}
    </>
  )
}
