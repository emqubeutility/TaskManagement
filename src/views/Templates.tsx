import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { api } from '../api'
import { confirmDialog } from '../dialogs'
import { useTemplates } from '../hooks'
import type { User } from '../types'
import { Avatar, FlowEditor, PersonName } from './FlowEditor'

export function TemplatesView({ me }: { me: User }) {
  const qc = useQueryClient()
  const templates = useTemplates().data ?? []
  const [name, setName] = useState('')
  const [flow, setFlow] = useState<number[]>([])
  const done = () => qc.invalidateQueries({ queryKey: ['templates'] })

  const create = useMutation({
    mutationFn: () => api('/templates', { body: { name, userIds: flow } }),
    onSuccess: () => { setName(''); setFlow([]); done() },
  })
  const remove = useMutation({ mutationFn: (id: number) => api(`/templates/${id}`, { method: 'DELETE' }), onSuccess: done })

  return (
    <div className="two-col">
      <section>
        <h2>Saved flows</h2>
        {templates.map((t) => (
          <div className="card-task" key={t.id}>
            <div className="card-head">
              <strong>{t.name}</strong>
              {(me.role === 'admin' || t.createdBy === me.id) && (
                <button className="link" onClick={async () => (await confirmDialog({ title: 'Delete template?', message: `"${t.name}" will be removed. Tasks already using it are not affected.`, confirmLabel: 'Delete', danger: true })) && remove.mutate(t.id)}>Delete</button>
              )}
            </div>
            <p className="flow-line">
              {t.userIds.map((id, i) => <span key={i}><Avatar userId={id} size={20} /> <PersonName id={id} />{i < t.userIds.length - 1 ? ' → ' : ''}</span>)}
            </p>
          </div>
        ))}
        {!templates.length && <p className="muted">No templates yet.</p>}
      </section>
      <section>
        <h2>New template</h2>
        <form className="card" onSubmit={(e) => { e.preventDefault(); create.mutate() }}>
          <label>Name<input value={name} onChange={(e) => setName(e.target.value)} required maxLength={100} /></label>
          <FlowEditor value={flow} onChange={setFlow} />
          <button className="primary" disabled={!flow.length || create.isPending}>Save template</button>
        </form>
      </section>
    </div>
  )
}
