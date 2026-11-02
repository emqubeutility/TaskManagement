import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { api } from '../api'
import { confirmDialog, notifySuccess, promptDialog } from '../dialogs'
import { useClients, useTypes, useUsers } from '../hooks'
import type { Lookup, User } from '../types'

function LookupAdmin({ title, singular, path, queryKey, items, help }: {
  title: string; singular: string; path: string; queryKey: string; items: Lookup[]; help: string
}) {
  const qc = useQueryClient()
  const [name, setName] = useState('')
  const refresh = () => qc.invalidateQueries({ queryKey: [queryKey] })
  const add = useMutation({ mutationFn: () => api(path, { body: { name } }), onSuccess: () => { setName(''); refresh(); notifySuccess(`${singular} added`) } })
  const patch = useMutation({
    mutationFn: (v: { id: number; body: Partial<Lookup> }) => api(`${path}/${v.id}`, { method: 'PATCH', body: v.body }),
    onSuccess: refresh,
  })
  return (
    <section>
      <p className="muted help">{help}</p>
      <div className="table-wrap">
        <table>
          <thead><tr><th>{singular}</th><th>Status</th><th className="right">Actions</th></tr></thead>
          <tbody>
            {items.map((i) => (
              <tr key={i.id} className={i.active ? '' : 'inactive'}>
                <td><strong>{i.name}</strong></td>
                <td><span className={i.active ? 'badge done' : 'badge'}>{i.active ? 'In use' : 'Hidden'}</span></td>
                <td className="right">
                  <button className="link inline" onClick={async () => {
                    const n = await promptDialog({ title: `Rename ${singular.toLowerCase()}`, label: 'New name', initial: i.name })
                    if (n) patch.mutate({ id: i.id, body: { name: n } })
                  }}>Rename</button>
                  <button className="link inline" onClick={() => patch.mutate({ id: i.id, body: { active: !i.active } })}>{i.active ? 'Hide' : 'Show again'}</button>
                </td>
              </tr>
            ))}
            {!items.length && <tr><td colSpan={3} className="muted">No {title.toLowerCase()} yet. Add the first one below.</td></tr>}
          </tbody>
        </table>
      </div>
      <form className="inline-form add-row" onSubmit={(e) => { e.preventDefault(); add.mutate() }}>
        <input placeholder={`New ${singular.toLowerCase()} name`} value={name} onChange={(e) => setName(e.target.value)} required maxLength={100} />
        <button className="primary">+ Add {singular.toLowerCase()}</button>
      </form>
    </section>
  )
}

function UsersAdmin({ me }: { me: User }) {
  const qc = useQueryClient()
  const users = useUsers().data ?? []
  const [form, setForm] = useState({ name: '', email: '', role: 'member' as 'admin' | 'member' })
  const refresh = () => qc.invalidateQueries({ queryKey: ['users'] })
  const add = useMutation({
    mutationFn: () => api('/users', { body: form }),
    onSuccess: () => {
      setForm({ name: '', email: '', role: 'member' })
      refresh()
      notifySuccess('Account created. They sign in with the shared temporary password and are asked to change it.')
    },
  })
  const patch = useMutation({
    mutationFn: (v: { id: number; body: object }) => api(`/users/${v.id}`, { method: 'PATCH', body: v.body }),
    onSuccess: refresh,
  })

  return (
    <section>
      <p className="muted help">Only admins can add people. New people sign in with the shared temporary password and must choose their own at first sign-in.</p>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Person</th><th>Email</th><th>Role</th><th>Status</th><th className="right">Actions</th></tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className={u.active ? '' : 'inactive'}>
                <td><span className="avatar" style={{ background: u.colour }}>{u.initials}</span> <strong>{u.name}</strong>{u.id === me.id && <span className="muted"> (you)</span>}</td>
                <td className="muted">{u.email}</td>
                <td><span className={u.role === 'admin' ? 'badge active' : 'badge'}>{u.role === 'admin' ? 'Admin' : 'Member'}</span></td>
                <td>
                  {!u.active ? <span className="badge">Deactivated</span> : u.mustChangePassword ? <span className="badge todo">Not signed in yet</span> : <span className="badge done">Active</span>}
                </td>
                <td className="right">
                  <button className="link inline" onClick={async () => {
                    const email = await promptDialog({ title: `Change ${u.name}'s email`, label: 'Email address', initial: u.email, confirmLabel: 'Save email' })
                    if (email && email !== u.email) patch.mutate({ id: u.id, body: { email } })
                  }}>Edit email</button>
                  <button className="link inline" onClick={async () => (await confirmDialog({
                    title: 'Reset password?', message: `${u.name} will be signed out and must sign in with the temporary password, then choose a new one.`, confirmLabel: 'Reset password',
                  })) && patch.mutate({ id: u.id, body: { resetPassword: true } })}>Reset password</button>
                  {u.id !== me.id && (
                    <>
                      <button className="link inline" onClick={async () => (await confirmDialog({
                        title: u.role === 'admin' ? 'Make a member?' : 'Make an admin?',
                        message: u.role === 'admin' ? `${u.name} will no longer manage people, clients or task types.` : `${u.name} will be able to add people and manage clients and task types.`,
                        confirmLabel: 'Change role',
                      })) && patch.mutate({ id: u.id, body: { role: u.role === 'admin' ? 'member' : 'admin' } })}>{u.role === 'admin' ? 'Make member' : 'Make admin'}</button>
                      <button className="link inline" onClick={async () => {
                        if (u.active && !(await confirmDialog({ title: 'Deactivate this person?', message: `${u.name} will be signed out and can no longer sign in. Their past tasks stay.`, confirmLabel: 'Deactivate', danger: true }))) return
                        patch.mutate({ id: u.id, body: { active: !u.active } })
                      }}>{u.active ? 'Deactivate' : 'Reactivate'}</button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3 className="spaced">Add a person</h3>
      <form className="card add-user" onSubmit={(e) => { e.preventDefault(); add.mutate() }}>
        <label>Full name<input placeholder="e.g. Aisha Khan" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></label>
        <label>Work email<input placeholder="name@company.com" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required /></label>
        <label>Role
          <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as 'admin' | 'member' })}>
            <option value="member">Member: works on tasks</option>
            <option value="admin">Admin: also manages people and lists</option>
          </select>
        </label>
        <button className="primary">Create account</button>
      </form>
    </section>
  )
}

export const UsersView = UsersAdmin

export function ClientsView() {
  const items = useClients().data ?? []
  return <LookupAdmin title="Clients" singular="Client" path="/clients" queryKey="clients" items={items} help="Clients appear in the task form and filters. Hide one to stop using it without losing old tasks." />
}

export function TypesView() {
  const items = useTypes().data ?? []
  return <LookupAdmin title="Task types" singular="Task type" path="/task-types" queryKey="types" items={items} help="Types such as Reel, Post or Blog. Hide one to stop using it without losing old tasks." />
}
