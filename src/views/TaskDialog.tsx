import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { api } from '../api'
import { confirmDialog } from '../dialogs'
import { useClients, useTemplates, useTypes, useUsers } from '../hooks'
import { STATUS_LABEL, type Task, type User } from '../types'
import { FlowEditor, PersonName } from './FlowEditor'
import { TaskThread } from './Messages'
import { DatePicker, MonthPicker } from './Pickers'

interface ActivityRow { id: number; action: string; detail: string; createdAt: string; userId: number | null }

export function TaskDialog({ task, me, defaultMonth, onClose }: { task?: Task; me: User; defaultMonth: string; onClose: () => void }) {
  const qc = useQueryClient()
  const users = useUsers().data ?? []
  const clients = (useClients().data ?? []).filter((c) => c.active || c.id === task?.clientId)
  const types = (useTypes().data ?? []).filter((t) => t.active || t.id === task?.typeId)
  const templates = useTemplates().data ?? []

  const canEditFlow = !task || me.role === 'admin' || task.ownerId === me.id
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
  const [flow, setFlow] = useState<number[]>(openIds)
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
              <select value={form.ownerId} onChange={set('ownerId')}>
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
          <FlowEditor value={flow} onChange={setFlow} locked={doneIds} disabled={!canEditFlow} />
          {!canEditFlow && <p className="muted">Only the owner or an admin can change the flow.</p>}
        </fieldset>

        {task && (
          <fieldset>
            <legend>Messages about this task</legend>
            <TaskThread taskId={task.id} me={me} />
          </fieldset>
        )}

        {task && (
          <details>
            <summary>History: who did what ({activity.data?.length ?? 0})</summary>
            <ul className="history">
              {activity.data?.map((a) => (
                <li key={a.id}>
                  <span className="muted">{new Date(a.createdAt).toLocaleString('en-GB', { timeZone: 'Asia/Dubai' })}</span>{' '}
                  {a.userId ? <PersonName id={a.userId} /> : 'System'} — {a.action}{a.detail ? ` (${a.detail})` : ''}
                </li>
              ))}
            </ul>
            <p className="muted">Steps: {task.steps.map((s) => STATUS_LABEL[s.status]).join(' → ') || 'none'}</p>
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
