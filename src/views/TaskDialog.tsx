import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { api } from '../api'
import { confirmDialog } from '../dialogs'
import { useClients, useTemplates, useTypes, useUsers } from '../hooks'
import { isTaskOwner, STATUS_LABEL, totalMinutes, type Task, type User } from '../types'
import { Icon } from '../icons'
import { Avatar, FlowEditor, PersonName } from './FlowEditor'
import { TaskThread, when } from './Chat'
import { DatePicker, MonthPicker } from './Pickers'

interface ActivityRow { id: number; action: string; detail: string; createdAt: string; userId: number | null }

/** How an activity row reads: who did what, with the detail shown as a pill, a quote or plain text. */
const ACTIVITY: Record<string, { verb: string; tone: string }> = {
  created: { verb: 'created the task', tone: 'grey' },
  imported: { verb: 'imported the task', tone: 'grey' },
  accept: { verb: 'accepted the task', tone: 'blue' },
  start: { verb: 'started working', tone: 'blue' },
  close: { verb: 'closed their step', tone: 'green' },
  'logged time': { verb: 'logged time', tone: 'amber' },
  comment: { verb: 'left a note', tone: 'purple' },
  passed: { verb: 'handed it over', tone: 'purple' },
  'circled back': { verb: 'sent it for a circle back', tone: 'purple' },
  edited: { verb: 'edited the task', tone: 'grey' },
  'flow edited': { verb: 'changed the flow', tone: 'grey' },
}

export function TaskDialog({ task, me, defaultMonth, onClose }: { task?: Task; me: User; defaultMonth: string; onClose: () => void }) {
  const qc = useQueryClient()
  const users = useUsers().data ?? []
  const clients = (useClients().data ?? []).filter((c) => c.active || c.id === task?.clientId)
  const types = (useTypes().data ?? []).filter((t) => t.active || t.id === task?.typeId)
  const templates = useTemplates().data ?? []

  const canEditFlow = !task || me.role === 'admin' || isTaskOwner(task, me.id)
  const doneIds = task?.steps.filter((s) => s.status === 'done').map((s) => s.userId) ?? []
  const openIds = task?.steps.filter((s) => s.status !== 'done').map((s) => s.userId) ?? []

  const [form, setForm] = useState({
    title: task?.title ?? '',
    month: task?.month ?? (defaultMonth || new Date().toISOString().slice(0, 7)),
    clientId: task?.clientId ? String(task.clientId) : '',
    typeId: task?.typeId ? String(task.typeId) : '',
    dueDate: task?.dueDate ?? '',
    media: task?.media ?? '',
    description: task?.description ?? '',
    notes: task?.notes ?? '',
    ownerId: String(task?.ownerId ?? me.id),
  })
  const [flow, setFlowState] = useState<number[]>(task ? openIds : [me.id]) // a new task starts with its owner as the first person
  // On a new task the owner is the first person in the flow, until an admin picks someone else by hand.
  const [ownerPicked, setOwnerPicked] = useState(false)
  const setFlow = (next: number[]) => {
    setFlowState(next)
    if (!task && me.role === 'admin' && !ownerPicked && next.length) setForm((f) => ({ ...f, ownerId: String(next[0]) }))
  }
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }))

  const activity = useQuery({
    queryKey: ['activity', task?.id],
    queryFn: () => api<ActivityRow[]>(`/tasks/${task!.id}/activity`),
    enabled: !!task,
  })

  const save = useMutation({
    mutationFn: async () => {
      const fields = {
        title: form.title,
        month: form.month,
        clientId: form.clientId ? Number(form.clientId) : null,
        typeId: form.typeId ? Number(form.typeId) : null,
        dueDate: form.dueDate || null,
        media: form.media,
        description: form.description,
        notes: form.notes,
      }
      if (!task) {
        return api('/tasks', { body: { ...fields, flow, ...(me.role === 'admin' ? { ownerId: Number(form.ownerId) } : {}) } })
      }
      const ownerChanged = me.role === 'admin' && Number(form.ownerId) !== task.ownerId
      let updated = await api<Task>(`/tasks/${task.id}`, {
        method: 'PATCH',
        body: { ...fields, version: task.version, ...(ownerChanged ? { ownerId: Number(form.ownerId) } : {}) },
      })
      if (canEditFlow && JSON.stringify(flow) !== JSON.stringify(openIds)) {
        updated = await api<Task>(`/tasks/${task.id}/flow`, { method: 'PUT', body: { version: updated.version, userIds: flow } })
      }
      return updated
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['tasks'] }); qc.invalidateQueries({ queryKey: ['months'] }); onClose() },
  })

  const remove = useMutation({
    mutationFn: () => api(`/tasks/${task!.id}`, { method: 'DELETE' }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['tasks'] }); onClose() },
  })

  const submit = (e: FormEvent) => { e.preventDefault(); save.mutate() }

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="dialog" onSubmit={submit}>
        <h2>{task ? 'Edit task' : 'New task'}</h2>
        <p className="muted help">{task ? 'Change the details, or the people in its flow.' : 'Fill in the details, then choose who works on it and in what order.'}</p>
        <label>Title<input value={form.title} onChange={set('title')} required maxLength={300} autoFocus /></label>
        <div className="grid2">
          <label>Month<MonthPicker value={form.month} onChange={(v) => setForm((f) => ({ ...f, month: v }))} required /></label>
          <label>Due date<DatePicker value={form.dueDate} onChange={(v) => setForm((f) => ({ ...f, dueDate: v }))} /></label>
          <label>Client
            <select value={form.clientId} onChange={set('clientId')}>
              <option value="">—</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <label>Type
            <select value={form.typeId} onChange={set('typeId')}>
              <option value="">—</option>
              {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </label>
          <label>Media<input value={form.media} onChange={set('media')} placeholder="Link or file name" /></label>
          <label>Owner
            {me.role === 'admin' ? (
              <select value={form.ownerId} onChange={(e) => { setOwnerPicked(true); set('ownerId')(e) }}>
                {users.filter((u) => u.active).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            ) : (
              <input value={users.find((u) => u.id === Number(form.ownerId))?.name ?? ''} disabled />
            )}
          </label>
        </div>
        <label>Description<textarea rows={4} value={form.description} onChange={set('description')} /></label>
        <label>Notes<textarea rows={2} value={form.notes} onChange={set('notes')} /></label>

        <fieldset>
          <legend>Flow: who works on it, in order</legend>
          <p className="muted help">The first person receives the task. When they close their step it goes to the next person.</p>
          {canEditFlow && templates.length > 0 && (
            <select value="" onChange={(e) => {
              const t = templates.find((x) => x.id === Number(e.target.value))
              if (t) setFlow(t.userIds)
            }}>
              <option value="">Start from a template…</option>
              {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          )}
          <FlowEditor value={flow} onChange={setFlow} locked={doneIds} disabled={!canEditFlow} allowRepeat />
          {!canEditFlow && <p className="muted">Only an owner or an admin can change the flow.</p>}
        </fieldset>

        {task && task.timeLogs.length > 0 && (
          <section className="panel time-panel">
            <div className="panel-head">
              <h3>Time spent</h3>
              <span className="time-total">{totalMinutes(task)} <small>min</small></span>
            </div>
            <div className="time-people">
              {[...task.timeLogs.reduce((m, l) => m.set(l.userId, (m.get(l.userId) ?? 0) + l.minutes), new Map<number, number>())].map(([id, mins]) => (
                <span key={id} className="time-person"><Avatar userId={id} size={22} /><PersonName id={id} /><strong>{mins} min</strong></span>
              ))}
            </div>
            <table className="time-table">
              <thead>
                <tr><th>Date</th><th>Person</th><th>Step</th><th className="num">Minutes</th><th>Note</th></tr>
              </thead>
              <tbody>
                {[...task.timeLogs].reverse().map((l) => {
                  const ordered = [...task.steps].sort((a, b) => a.position - b.position)
                  const at = ordered.findIndex((s) => s.id === l.stepId)
                  return (
                    <tr key={l.id}>
                      <td className="muted nowrap">{when(l.createdAt)}</td>
                      <td><span className="time-who"><Avatar userId={l.userId} size={22} /><PersonName id={l.userId} /></span></td>
                      <td className="muted nowrap">{at >= 0 ? `Step ${at + 1}` : '–'}</td>
                      <td className="num"><span className="pill">{l.minutes} min</span></td>
                      <td className="time-note">{l.note || <span className="muted">–</span>}</td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr><td colSpan={3}>Total</td><td className="num"><strong>{totalMinutes(task)} min</strong></td><td /></tr>
              </tfoot>
            </table>
          </section>
        )}

        {task && (
          <fieldset>
            <legend>Messages about this task</legend>
            <TaskThread taskId={task.id} me={me} />
          </fieldset>
        )}

        {task && (
          <details className="panel history-panel">
            <summary>History <span className="count">{activity.data?.length ?? 0}</span></summary>
            <ol className="timeline">
              {activity.data?.map((a) => {
                const kind = ACTIVITY[a.action] ?? { verb: a.action, tone: 'grey' }
                const to = a.action === 'passed' || a.action === 'circled back' ? users.find((u) => u.id === Number(/user (\d+)/.exec(a.detail)?.[1]))?.name : undefined
                return (
                  <li key={a.id} className={`tl-${kind.tone}`}>
                    <span className="tl-dot" />
                    <div className="tl-body">
                      <span>
                        <strong>{a.userId ? <PersonName id={a.userId} /> : 'System'}</strong> {kind.verb}
                        {to && <> to <strong>{to}</strong></>}
                        {(a.action === 'close' || a.action === 'logged time') && a.detail && <> <span className="pill">{a.detail}</span></>}
                        {(a.action === 'edited' || a.action === 'imported') && a.detail && <span className="muted"> · {a.detail}</span>}
                      </span>
                      {a.action === 'comment' && a.detail && <q className="tl-quote">{a.detail}</q>}
                    </div>
                    <span className="muted when">{when(a.createdAt)}</span>
                  </li>
                )
              })}
            </ol>
            <div className="step-chain" aria-label="Where the task is in its flow">
              {[...task.steps].sort((a, b) => a.position - b.position).map((s, i) => (
                <span key={s.id} className="chain-item">
                  {i > 0 && <Icon name="arrow-right" size={14} className="chain-arrow" />}
                  <Avatar userId={s.userId} size={22} /><PersonName id={s.userId} /> <span className={`badge ${s.status}`}>{STATUS_LABEL[s.status]}</span>
                </span>
              ))}
            </div>
          </details>
        )}

        <div className="dialog-actions">
          {task && canEditFlow && (
            <button type="button" className="danger" onClick={async () => (await confirmDialog({ title: 'Delete this task?', message: 'The task, its flow and its history are removed for good.', confirmLabel: 'Delete', danger: true })) && remove.mutate()}>Delete</button>
          )}
          <span className="spacer" />
          <button type="button" onClick={onClose}>Cancel</button>
          <button className="primary" disabled={save.isPending}>{task ? 'Save' : 'Create'}</button>
        </div>
      </form>
    </div>
  )
}
