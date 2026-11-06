import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { api } from '../api'
import { confirmDialog, notifySuccess } from '../dialogs'
import { useTemplates, useUsers } from '../hooks'
import { Icon } from '../icons'
import { DetailHead, FormFooter } from './Page'
import type { Template, User } from '../types'
import { Avatar, FlowEditor, PersonName } from './FlowEditor'

type Page = { page: 'list' } | { page: 'new' } | { page: 'edit'; id: number }

const canChange = (me: User, t: Template) => me.role === 'admin' || t.createdBy === me.id

function Flow({ ids }: { ids: number[] }) {
  return (
    <span className="flow-line">
      {ids.map((id, i) => (
        <span key={i} className="flow-step"><Avatar userId={id} size={20} /> <PersonName id={id} />{i < ids.length - 1 && <Icon name="forward" size={14} className="flow-arrow" />}</span>
      ))}
    </span>
  )
}

export function TemplatesView({ me }: { me: User }) {
  const qc = useQueryClient()
  const query = useTemplates()
  const users = useUsers().data ?? []
  const templates = query.data ?? []
  const [view, setView] = useState<Page>({ page: 'list' })
  const back = () => setView({ page: 'list' })
  const refresh = () => qc.invalidateQueries({ queryKey: ['templates'] })

  const create = useMutation({
    mutationFn: (v: { name: string; userIds: number[] }) => api('/templates', { body: v }),
    onSuccess: () => { refresh(); notifySuccess('Template added'); back() },
  })
  const update = useMutation({
    mutationFn: (v: { id: number; name: string; userIds: number[] }) => api(`/templates/${v.id}`, { method: 'PUT', body: { name: v.name, userIds: v.userIds } }),
    onSuccess: () => { refresh(); notifySuccess('Changes saved'); back() },
  })
  const remove = useMutation({ mutationFn: (id: number) => api(`/templates/${id}`, { method: 'DELETE' }), onSuccess: refresh })
  const askRemove = async (t: Template) => {
    if (await confirmDialog({ title: 'Delete template?', message: `"${t.name}" will be removed. Tasks already using it are not affected.`, confirmLabel: 'Delete', danger: true })) remove.mutate(t.id)
  }

  const nameOf = (id: number | null) => users.find((u) => u.id === id)?.name ?? '—'
  if (view.page === 'new') {
    return (
      <>
        <Head title="Add a template" sub="Save a flow once, then reuse it on any task." />
        <TemplateForm key="new" submitLabel="Add template" busy={create.isPending} onCancel={back} error={create.error?.message} onSave={(name, userIds) => create.mutate({ name, userIds })} />
      </>
    )
  }

  if (view.page === 'edit') {
    const t = templates.find((x) => x.id === view.id)
    if (query.isLoading) return <p className="muted pad">Loading…</p>
    if (!t) return <><Head title="Template not found" /><p className="muted pad">This template does not exist.</p></>
    if (!canChange(me, t)) return <><Head title={t.name} /><p className="muted pad">Only the person who made this template or an admin can edit it.</p></>
    return (
      <>
        <Head title={`Editing ${t.name}`} sub={`Created by ${nameOf(t.createdBy)}. Tasks already using it are not changed.`} />
        <TemplateForm key={t.id} initial={t} submitLabel="Save changes" busy={update.isPending} onCancel={back} error={update.error?.message} onSave={(name, userIds) => update.mutate({ id: t.id, name, userIds })} />
      </>
    )
  }

  return (
    <section>
      <div className="page-head">
        <p className="muted help">A template is a saved flow: the same people in the same order. Pick one in a task to fill its flow in one go.</p>
        <div className="head-actions"><button className="primary" onClick={() => setView({ page: 'new' })}>+ Add template</button></div>
      </div>
      {query.isError && <p className="error">Could not load templates: {query.error.message}</p>}
      <div className="table-wrap">
        <table>
          <thead><tr><th>Template</th><th>Flow</th><th>People</th><th>Created by</th><th className="right">Actions</th></tr></thead>
          <tbody>
            {templates.map((t) => (
              <tr key={t.id}>
                <td><strong>{t.name}</strong></td>
                <td><Flow ids={t.userIds} /></td>
                <td>{t.userIds.length}</td>
                <td className="muted">{nameOf(t.createdBy)}</td>
                <td className="right">
                  {canChange(me, t) ? (
                    <>
                      <button className="link inline" onClick={() => setView({ page: 'edit', id: t.id })}>Edit</button>
                      <button className="link inline" disabled={remove.isPending} onClick={() => askRemove(t)}>Delete</button>
                    </>
                  ) : <span className="muted">—</span>}
                </td>
              </tr>
            ))}
            {!templates.length && !query.isLoading && <tr><td colSpan={5} className="muted">No templates yet. Use “Add template” to create the first one.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  )

  function Head({ title, sub }: { title: string; sub?: string }) {
    return (
      <DetailHead back={back} backLabel="Back to all templates" title={title} sub={sub} />
    )
  }
}

function TemplateForm({ initial, submitLabel, busy, error, onSave, onCancel }: {
  initial?: Template; submitLabel: string; busy: boolean; error?: string
  onSave: (name: string, userIds: number[]) => void; onCancel: () => void
}) {
  const [name, setName] = useState(initial?.name ?? '')
  const [flow, setFlow] = useState<number[]>(initial?.userIds ?? [])
  const submit = (e: FormEvent) => { e.preventDefault(); onSave(name.trim(), flow) }
  return (
    <form id="template-form" className="card template-card" onSubmit={submit}>
      <label>Template name<input value={name} onChange={(e) => setName(e.target.value)} required maxLength={100} autoFocus /></label>
      <p className="form-label">Flow <span className="muted">(people in the order they work on a task)</span></p>
      <FlowEditor value={flow} onChange={setFlow} />
      {error && <p className="error">{error}</p>}
      <FormFooter submitLabel={submitLabel} busy={busy} onCancel={onCancel} />
    </form>
  )
}
