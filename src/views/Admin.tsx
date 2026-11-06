import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent, type ReactNode } from 'react'
import { api } from '../api'
import { confirmDialog, notifySuccess } from '../dialogs'
import { go, parseAdminRoute, useHash, type AdminSection } from '../hash'
import { DetailHead, FormFooter } from './Page'
import { useClients, useTasks, useTypes, useUsers } from '../hooks'
import { currentStep, STATUS_LABEL, type Lookup, type Task, type User } from '../types'

const ALL = { month: '', owner: '', client: '', type: '' }

function PageHead({ section, back, title, children }: { section: AdminSection; back: string; title: ReactNode; children?: ReactNode }) {
  return (
    <DetailHead back={() => go(`/${section}`)} backLabel={`Back to ${back.toLowerCase()}`} title={title}>{children}</DetailHead>
  )
}

function Notice({ children }: { children: ReactNode }) {
  return <p className="muted pad">{children}</p>
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return <><dt>{label}</dt><dd>{children}</dd></>
}

function TaskTable({ tasks, empty, shows }: { tasks: Task[]; empty: string; shows: (t: Task) => ReactNode }) {
  const clients = useClients().data ?? []
  const clientName = (id: number | null) => clients.find((c) => c.id === id)?.name ?? '—'
  return (
    <div className="table-wrap">
      <table>
        <thead><tr><th>Task</th><th>Client</th><th>Month</th><th>Due</th><th>Status</th></tr></thead>
        <tbody>
          {tasks.map((t) => (
            <tr key={t.id}>
              <td><strong>{t.title}</strong></td>
              <td className="muted">{clientName(t.clientId)}</td>
              <td className="muted">{t.month}</td>
              <td className="muted">{t.dueDate ?? '—'}</td>
              <td>{shows(t)}</td>
            </tr>
          ))}
          {!tasks.length && <tr><td colSpan={5} className="muted">{empty}</td></tr>}
        </tbody>
      </table>
    </div>
  )
}

// --- People --------------------------------------------------------------------

type Role = 'admin' | 'member'
const statusBadge = (u: User) =>
  !u.active ? <span className="badge">Deactivated</span> : u.mustChangePassword ? <span className="badge todo">Not signed in yet</span> : <span className="badge done">Active</span>
const roleBadge = (u: User) => <span className={u.role === 'admin' ? 'badge active' : 'badge'}>{u.role === 'admin' ? 'Admin' : 'Member'}</span>

function useUserActions() {
  const qc = useQueryClient()
  const refresh = () => qc.invalidateQueries({ queryKey: ['users'] })
  const create = useMutation({
    mutationFn: (body: { name: string; email: string; role: Role }) => api<User>('/users', { body }),
    onSuccess: (u) => {
      refresh()
      notifySuccess('Account created. They sign in with the shared temporary password and are asked to change it.')
      go(`/users/${u.id}`)
    },
  })
  const patch = useMutation({
    mutationFn: (v: { id: number; body: object }) => api<User>(`/users/${v.id}`, { method: 'PATCH', body: v.body }),
    onSuccess: refresh,
  })
  return { create, patch }
}

function UserList({ me, users }: { me: User; users: User[] }) {
  const tasks = useTasks(ALL, 'all').data ?? []
  const open = (u: User) => tasks.filter((t) => t.steps.some((s) => s.userId === u.id && s.status !== 'done')).length
  return (
    <section>
      <div className="page-head">
        <p className="muted help">Only admins can add people. New people sign in with the shared temporary password and must choose their own at first sign-in.</p>
        <div className="head-actions"><button className="primary" onClick={() => go('/users/new')}>+ Add person</button></div>
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Person</th><th>Email</th><th>Role</th><th>Status</th><th>Open tasks</th><th className="right">Actions</th></tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className={u.active ? '' : 'inactive'}>
                <td>
                  <span className="avatar" style={{ background: u.colour }}>{u.initials}</span>{' '}
                  <button className="link inline" onClick={() => go(`/users/${u.id}`)}>{u.name}</button>
                  {u.id === me.id && <span className="muted"> (you)</span>}
                </td>
                <td className="muted">{u.email}</td>
                <td>{roleBadge(u)}</td>
                <td>{statusBadge(u)}</td>
                <td>{open(u)}</td>
                <td className="right">
                  <button className="link inline" onClick={() => go(`/users/${u.id}`)}>View</button>
                  <button className="link inline" onClick={() => go(`/users/${u.id}/edit`)}>Edit</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function NewUserForm() {
  const { create } = useUserActions()
  const [form, setForm] = useState({ name: '', email: '', role: 'member' as Role })
  return (
    <form className="card form-card" onSubmit={(e) => { e.preventDefault(); create.mutate(form) }}>
      <label>Full name<input placeholder="e.g. Aisha Khan" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required maxLength={100} /></label>
      <label>Work email<input placeholder="name@company.com" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required /></label>
      <label>Role
        <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>
          <option value="member">Member: works on tasks</option>
          <option value="admin">Admin: also manages people and lists</option>
        </select>
      </label>
      <FormFooter submitLabel="Create account" busy={create.isPending} onCancel={() => go('/users')} />
    </form>
  )
}

/** The profile card. The same card is the detail view and, with `editing`, the edit form. */
function UserCard({ user, me, editing, open, total }: { user: User; me: User; editing: boolean; open: number; total: number }) {
  const { patch } = useUserActions()
  const [form, setForm] = useState({ name: user.name, email: user.email, role: user.role as Role })
  const isSelf = user.id === me.id
  const submit = (e: FormEvent) => {
    e.preventDefault()
    const body: Partial<typeof form> = {}
    if (form.name.trim() !== user.name) body.name = form.name.trim()
    if (form.email.trim().toLowerCase() !== user.email) body.email = form.email.trim()
    if (!isSelf && form.role !== user.role) body.role = form.role
    if (!Object.keys(body).length) return go(`/users/${user.id}`)
    patch.mutate({ id: user.id, body }, { onSuccess: () => { notifySuccess('Changes saved'); go(`/users/${user.id}`) } })
  }
  return (
    <form id="user-form" className="card profile-card" onSubmit={submit}>
      <div className="profile">
        <span className="avatar xl" style={{ background: user.colour }}>{user.initials}</span>
        <div>
          <strong className="profile-name">{user.name}{isSelf && <span className="muted"> (you)</span>}</strong>
          <div className="muted">{user.email}</div>
        </div>
      </div>
      <dl className="facts">
        <Fact label="Full name">{editing ? <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required maxLength={100} autoFocus /> : user.name}</Fact>
        <Fact label="Work email">{editing ? <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required /> : user.email}</Fact>
        <Fact label="Role">
          {editing ? (
            <>
              <select value={form.role} disabled={isSelf} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>
                <option value="member">Member: works on tasks</option>
                <option value="admin">Admin: also manages people and lists</option>
              </select>
              {isSelf && <small className="muted"> You cannot change your own role.</small>}
            </>
          ) : roleBadge(user)}
        </Fact>
        <Fact label="Status">{statusBadge(user)}</Fact>
        <Fact label="Open tasks">{open}</Fact>
        <Fact label="Tasks in a flow">{total}</Fact>
      </dl>
      {editing && <FormFooter submitLabel="Save changes" busy={patch.isPending} onCancel={() => go(`/users/${user.id}`)} />}
    </form>
  )
}

function UserDetail({ user, me, editing }: { user: User; me: User; editing: boolean }) {
  const { patch } = useUserActions()
  const tasks = useTasks(ALL, 'all').data ?? []
  const mine = tasks.filter((t) => t.steps.some((s) => s.userId === user.id))
  const open = mine.filter((t) => t.steps.some((s) => s.userId === user.id && s.status !== 'done'))
  const isSelf = user.id === me.id
  const stepOf = (t: Task) => t.steps.find((s) => s.userId === user.id && s.status !== 'done') ?? t.steps.find((s) => s.userId === user.id)
  // Not offered on your own account: that would sign you out. Use "Change password" in the sidebar instead.
  const resetButton = !isSelf && (
    <button type="button" onClick={async () => (await confirmDialog({
      title: 'Reset password?', message: `${user.name} will be signed out and must sign in with the temporary password, then choose a new one.`, confirmLabel: 'Reset password',
    })) && patch.mutate({ id: user.id, body: { resetPassword: true } }, { onSuccess: () => notifySuccess('Password reset') })}>Reset password</button>
  )
  return (
    <>
      <PageHead section="users" back="All people" title={editing ? `Editing ${user.name}` : user.name}>
        {editing ? (
          <>
            {resetButton}
          </>
        ) : (
          <>
            <button className="primary" onClick={() => go(`/users/${user.id}/edit`)}>Edit</button>
            {!isSelf && (
              <>
                {resetButton}
                <button className="danger" onClick={async () => {
                  if (user.active && !(await confirmDialog({ title: 'Deactivate this person?', message: `${user.name} will be signed out and can no longer sign in. Their past tasks stay.`, confirmLabel: 'Deactivate', danger: true }))) return
                  patch.mutate({ id: user.id, body: { active: !user.active } })
                }}>{user.active ? 'Deactivate' : 'Reactivate'}</button>
              </>
            )}
          </>
        )}
      </PageHead>
      <UserCard key={editing ? 'edit' : 'view'} user={user} me={me} editing={editing} open={open.length} total={mine.length} />
      <h3 className="spaced">Tasks this person is part of</h3>
      <TaskTable tasks={mine} empty="No tasks yet." shows={(t) => {
        const s = stepOf(t)
        return <span className={`badge ${s?.status ?? ''}`}>{s ? STATUS_LABEL[s.status] : '—'}</span>
      }} />
    </>
  )
}

export function UsersView({ me }: { me: User }) {
  const route = parseAdminRoute(useHash())
  const users = useUsers()
  if (users.isLoading) return <Notice>Loading…</Notice>
  const list = users.data ?? []
  const found = 'id' in route ? list.find((u) => u.id === route.id) : undefined

  if (route.page === 'list') return <UserList me={me} users={list} />
  if (route.page === 'new') {
    return <><PageHead section="users" back="All people" title="Add a person" /><NewUserForm /></>
  }
  if (!found) return <><PageHead section="users" back="All people" title="Person not found" /><Notice>This person does not exist.</Notice></>
  return <UserDetail user={found} me={me} editing={route.page === 'edit'} />
}

// --- Clients and task types (same shape, one component) ------------------------

type LookupConfig = {
  section: Extract<AdminSection, 'clients' | 'types'>
  title: string; singular: string; path: string; queryKey: string; help: string
  field: 'clientId' | 'typeId'
}

function LookupView({ cfg, items }: { cfg: LookupConfig; items: Lookup[] }) {
  const { section, singular, title, path, queryKey, help, field } = cfg
  const qc = useQueryClient()
  const route = parseAdminRoute(useHash())
  const tasks = useTasks(ALL, 'all').data ?? []
  const lower = singular.toLowerCase()
  const refresh = () => qc.invalidateQueries({ queryKey: [queryKey] })
  const create = useMutation({
    mutationFn: (name: string) => api<Lookup>(path, { body: { name } }),
    onSuccess: (row) => { refresh(); notifySuccess(`${singular} added`); go(`/${section}/${row.id}`) },
  })
  const patch = useMutation({
    mutationFn: (v: { id: number; body: Partial<Lookup> }) => api<Lookup>(`${path}/${v.id}`, { method: 'PATCH', body: v.body }),
    onSuccess: refresh,
  })
  const tasksOf = (id: number) => tasks.filter((t) => t[field] === id)
  const found = 'id' in route ? items.find((i) => i.id === route.id) : undefined
  const badge = (i: Lookup) => <span className={i.active ? 'badge done' : 'badge'}>{i.active ? 'In use' : 'Hidden'}</span>

  if (route.page === 'list') {
    return (
      <section>
        <div className="page-head">
          <p className="muted help">{help}</p>
          <div className="head-actions"><button className="primary" onClick={() => go(`/${section}/new`)}>+ Add {lower}</button></div>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>{singular}</th><th>Tasks</th><th>Status</th><th className="right">Actions</th></tr></thead>
            <tbody>
              {items.map((i) => (
                <tr key={i.id} className={i.active ? '' : 'inactive'}>
                  <td><button className="link inline" onClick={() => go(`/${section}/${i.id}`)}>{i.name}</button></td>
                  <td>{tasksOf(i.id).length}</td>
                  <td>{badge(i)}</td>
                  <td className="right">
                    <button className="link inline" onClick={() => go(`/${section}/${i.id}`)}>View</button>
                    <button className="link inline" onClick={() => go(`/${section}/${i.id}/edit`)}>Edit</button>
                  </td>
                </tr>
              ))}
              {!items.length && <tr><td colSpan={4} className="muted">No {title.toLowerCase()} yet. Use “Add {lower}” to create the first one.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    )
  }

  if (route.page === 'new') {
    return (
      <>
        <PageHead section={section} back={`All ${title.toLowerCase()}`} title={`Add a ${lower}`} />
        <NewLookupForm singular={singular} busy={create.isPending} onCancel={() => go(`/${section}`)} onSave={(name) => create.mutate(name)} />
      </>
    )
  }

  if (!found) return <><PageHead section={section} back={`All ${title.toLowerCase()}`} title={`${singular} not found`} /><Notice>This {lower} does not exist.</Notice></>

  return (
    <LookupDetail
      key={found.id} cfg={cfg} item={found} editing={route.page === 'edit'} tasks={tasksOf(found.id)}
      busy={patch.isPending} badge={badge}
      onToggle={() => patch.mutate({ id: found.id, body: { active: !found.active } })}
      onSave={(body) => {
        if (!Object.keys(body).length) return go(`/${section}/${found.id}`)
        patch.mutate({ id: found.id, body }, { onSuccess: () => { notifySuccess('Changes saved'); go(`/${section}/${found.id}`) } })
      }}
    />
  )
}

/** One page for viewing and editing: Edit turns the details into fields, Save or Cancel turns them back. */
function LookupDetail({ cfg, item, editing, tasks, busy, badge, onToggle, onSave }: {
  cfg: LookupConfig; item: Lookup; editing: boolean; tasks: Task[]; busy: boolean
  badge: (i: Lookup) => ReactNode; onToggle: () => void; onSave: (body: Partial<Lookup>) => void
}) {
  const { section, singular, title } = cfg
  const [name, setName] = useState(item.name)
  const [active, setActive] = useState(item.active)
  const submit = (e: FormEvent) => {
    e.preventDefault()
    const body: Partial<Lookup> = {}
    if (name.trim() !== item.name) body.name = name.trim()
    if (active !== item.active) body.active = active
    onSave(body)
  }
  return (
    <>
      <PageHead section={section} back={`All ${title.toLowerCase()}`} title={editing ? `Editing ${item.name}` : item.name}>
        {editing ? (
          <>
          </>
        ) : (
          <>
            <button className="primary" onClick={() => go(`/${section}/${item.id}/edit`)}>Edit</button>
            <button onClick={onToggle}>{item.active ? 'Hide' : 'Show again'}</button>
          </>
        )}
      </PageHead>
      <form id="lookup-form" className="card profile-card" onSubmit={submit}>
        <dl className="facts">
          <Fact label={`${singular} name`}>{editing ? <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={100} autoFocus /> : item.name}</Fact>
          <Fact label="Status">
            {editing ? (
              <select value={active ? 'yes' : 'no'} onChange={(e) => setActive(e.target.value === 'yes')}>
                <option value="yes">In use: shown in the task form and filters</option>
                <option value="no">Hidden: old tasks keep it</option>
              </select>
            ) : badge(item)}
          </Fact>
          <Fact label="Tasks">{tasks.length}</Fact>
        </dl>
        {editing && <FormFooter submitLabel="Save changes" busy={busy} onCancel={() => { setName(item.name); setActive(item.active); go(`/${section}/${item.id}`) }} />}
        {!item.active && !editing && <p className="muted">Hidden {title.toLowerCase()} no longer appear in the task form or filters. Old tasks keep them.</p>}
      </form>
      <h3 className="spaced">Tasks</h3>
      <TaskTable tasks={tasks} empty={`No tasks use this ${singular.toLowerCase()} yet.`} shows={(t) => {
        const cur = currentStep(t)
        return cur ? <span className={`badge ${cur.status}`}>{STATUS_LABEL[cur.status]}</span> : <span className="badge done">Complete</span>
      }} />
    </>
  )
}

function NewLookupForm({ singular, busy, onSave, onCancel }: {
  singular: string; busy: boolean; onSave: (name: string) => void; onCancel: () => void
}) {
  const [name, setName] = useState('')
  return (
    <form className="card form-card" onSubmit={(e) => { e.preventDefault(); onSave(name.trim()) }}>
      <label>{singular} name<input value={name} onChange={(e) => setName(e.target.value)} required maxLength={100} autoFocus /></label>
      <FormFooter submitLabel={`Add ${singular.toLowerCase()}`} busy={busy} onCancel={onCancel} />
    </form>
  )
}

export function ClientsView() {
  const items = useClients().data ?? []
  return <LookupView items={items} cfg={{
    section: 'clients', title: 'Clients', singular: 'Client', path: '/clients', queryKey: 'clients', field: 'clientId',
    help: 'Clients appear in the task form and filters. Hide one to stop using it without losing old tasks.',
  }} />
}

export function TypesView() {
  const items = useTypes().data ?? []
  return <LookupView items={items} cfg={{
    section: 'types', title: 'Task types', singular: 'Task type', path: '/task-types', queryKey: 'types', field: 'typeId',
    help: 'Types such as Reel, Post or Blog. Hide one to stop using it without losing old tasks.',
  }} />
}
