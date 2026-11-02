import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Fragment, useState, type FormEvent } from 'react'
import { dubaiMonth } from '../shared/dates'
import { api, ApiError } from './api'
import { ClientsView, TypesView, UsersView } from './views/Admin'
import { Board } from './views/Board'
import { Overview } from './views/Overview'
import { FilterBar } from './views/FilterBar'
import { ImportView } from './views/Import'
import { ListView, Tracker } from './views/Tables'
import { TemplatesView } from './views/Templates'
import type { Filters, User } from './types'

type Tab = 'overview' | 'board' | 'tracker' | 'list' | 'templates' | 'import' | 'admin' | 'clients' | 'types'

const SUBTITLE: Record<Tab, string> = {
  overview: 'What needs you today, what is late, and how busy the team is.',
  board: 'Every task, in the column of the person who has it now.',
  tracker: 'A grid of every task and where each person is in its flow.',
  list: 'All tasks as a searchable list.',
  templates: 'Reusable flows: the same people in the same order.',
  import: 'Bring tasks in from Excel, or copy a whole month forward.',
  admin: 'Add people, reset passwords and choose who is an admin.',
  clients: 'The clients that tasks are filed under.',
  types: 'The kinds of content a task can be, such as Reel or Post.',
}

function Login() {
  const qc = useQueryClient()
  const [error, setError] = useState('')
  const login = useMutation({
    mutationFn: (v: { email: string; password: string }) => api<User>('/auth/login', { body: v }),
    onSuccess: (u) => qc.setQueryData(['me'], u),
    onError: (e) => setError(e.message),
  })
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    setError('')
    login.mutate({ email: String(f.get('email')), password: String(f.get('password')) })
  }
  return (
    <div className="login-page">
      <section className="login-hero">
        <Brand />
        <h1>Plan. Track. Deliver.<br /><span>Together.</span></h1>
        <p>Run every piece of content from idea to posting. Each task moves through your team, one accept, start and close at a time.</p>
        <div className="hero-points">
          {[['☑', 'Organize', 'Your work'], ['👥', 'Collaborate', 'With your team'], ['📊', 'Track', 'Progress'], ['◎', 'Achieve', 'Your goals']].map(([i, a, b]) => (
            <div key={a}><span className="hero-icon">{i}</span><strong>{a}</strong><small>{b}</small></div>
          ))}
        </div>
      </section>
      <form className="login-card" onSubmit={submit}>
        <h2>Welcome back</h2>
        <p className="muted">Sign in to your account</p>
        <label>Email address<input name="email" type="email" autoComplete="username" required autoFocus /></label>
        <label>Password<input name="password" type="password" autoComplete="current-password" required /></label>
        {error && <p className="error">{error}</p>}
        <button className="primary big" disabled={login.isPending}>Sign in →</button>
        <p className="secure">🛡 Your data is secure with us</p>
      </form>
    </div>
  )
}

function Brand() {
  return (
    <img className="brand-logo" src="/emqube-logo.svg" alt="emQube - Powered by Thought" width={193} height={76} />
  )
}

function ChangePassword({ user }: { user: User }) {
  const qc = useQueryClient()
  const [error, setError] = useState('')
  const change = useMutation({
    mutationFn: (v: { currentPassword: string; newPassword: string }) => api('/auth/change-password', { body: v }),
    onSuccess: () => qc.setQueryData(['me'], { ...user, mustChangePassword: false }),
    onError: (e) => setError(e.message),
  })
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    if (f.get('newPassword') !== f.get('confirm')) return setError('The new passwords do not match')
    setError('')
    change.mutate({ currentPassword: String(f.get('currentPassword')), newPassword: String(f.get('newPassword')) })
  }
  return (
    <div className="center-card">
      <form className="login-card" onSubmit={submit}>
        <h2>Choose your password</h2>
        <p className="muted">Hi {user.name}. Replace the temporary password before you continue.</p>
        <label>Temporary password<input name="currentPassword" type="password" required autoComplete="current-password" /></label>
        <label>New password (8+ characters)<input name="newPassword" type="password" minLength={8} required autoComplete="new-password" /></label>
        <label>Repeat new password<input name="confirm" type="password" minLength={8} required autoComplete="new-password" /></label>
        {error && <p className="error">{error}</p>}
        <button className="primary big" disabled={change.isPending}>Save password</button>
      </form>
    </div>
  )
}

function Shell({ me }: { me: User }) {
  const qc = useQueryClient()
  const [tab, setTab] = useState<Tab>('overview')
  const [filters, setFilters] = useState<Filters>({ month: dubaiMonth(), owner: '', client: '', type: '' })
  const logout = useMutation({
    mutationFn: () => api('/auth/logout', { method: 'POST', body: {} }),
    onSuccess: () => { qc.clear(); qc.setQueryData(['me'], null) },
  })

  const tabs: [Tab, string, string][] = [
    ['overview', 'Overview', '⌂'], ['board', 'Board', '▦'], ['tracker', 'Tracker', '▤'], ['list', 'List', '☰'],
    ['templates', 'Templates', '❖'], ['import', 'Import / Clone', '⇪'],
  ]
  if (me.role === 'admin') tabs.push(['admin', 'Admin / Users', '⚙'], ['clients', 'Clients', '◫'], ['types', 'Task types', '⌗'])
  const filtered = tab === 'board' || tab === 'tracker' || tab === 'list'
  const title = tabs.find(([k]) => k === tab)![1]

  return (
    <div className="shell">
      <aside className="sidebar">
        <Brand />
        <nav>
          {tabs.map(([k, label, icon]) => (
            <Fragment key={k}>
              {k === 'admin' && <span className="nav-label">Manage</span>}
              <button className={tab === k ? 'nav-item active' : 'nav-item'} onClick={() => setTab(k)}>
                <span className="nav-icon">{icon}</span>{label}
              </button>
            </Fragment>
          ))}
        </nav>
        <div className="side-user">
          <span className="avatar big" style={{ background: me.colour }}>{me.initials}</span>
          <span className="who-name"><strong>{me.name}</strong><small>{me.role === 'admin' ? 'Admin' : 'Team member'}</small></span>
          <button className="link" onClick={() => logout.mutate()} title="Sign out">⎋</button>
        </div>
      </aside>
      <div className="content">
      <h1 className="page-title">{tab === 'overview' ? `Hello, ${me.name.split(' ')[0]}` : title}</h1>
      <p className="page-sub">{SUBTITLE[tab]}</p>
      {filtered && <FilterBar filters={filters} onChange={setFilters} />}
      <main>
        {tab === 'overview' && <Overview me={me} goBoard={() => setTab('board')} />}
        {tab === 'board' && <Board me={me} filters={filters} />}
        {tab === 'tracker' && <Tracker me={me} filters={filters} />}
        {tab === 'list' && <ListView me={me} filters={filters} />}
        {tab === 'templates' && <TemplatesView me={me} />}
        {tab === 'import' && <ImportView />}
        {tab === 'admin' && me.role === 'admin' && <UsersView me={me} />}
        {tab === 'clients' && me.role === 'admin' && <ClientsView />}
        {tab === 'types' && me.role === 'admin' && <TypesView />}
      </main>
      </div>
    </div>
  )
}

export default function App() {
  const me = useQuery({
    queryKey: ['me'],
    queryFn: () => api<User | null>('/auth/me').catch((e) => { if (e instanceof ApiError && e.status === 401) return null; throw e }),
    staleTime: Infinity,
  })
  if (me.isLoading) return <p className="muted pad">Loading…</p>
  if (me.isError) return <p className="error pad">Could not reach the server: {me.error.message}</p>
  if (!me.data) return <Login />
  if (me.data.mustChangePassword) return <ChangePassword user={me.data} />
  return <Shell me={me.data} />
}
