import { useIsFetching, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Fragment, useEffect, useState, type FormEvent } from 'react'
import { dubaiMonth } from '../shared/dates'
import { api, ApiError } from './api'
import { confirmDialog, notifySuccess } from './dialogs'
import { Icon, type IconName } from './icons'
import { go, sectionOf, useHash, type AdminSection } from './hash'
import { ClientsView, TypesView, UsersView } from './views/Admin'
import { Board } from './views/Board'
import { InboxBell } from './views/Inbox'
import { MessagesView, type Convo } from './views/MessagesPage'
import { Overview } from './views/Overview'
import { PlanBoard } from './views/Plan'
import { FilterBar } from './views/FilterBar'
import { ImportView } from './views/Import'
import { ListView, Tracker } from './views/Tables'
import { TemplatesView } from './views/Templates'
import type { Filters, User } from './types'

type Tab = 'overview' | 'board' | 'plan' | 'tracker' | 'list' | 'messages' | 'templates' | 'import' | 'admin' | 'clients' | 'types'

const SECTION_TAB: Record<AdminSection, Tab> = { users: 'admin', clients: 'clients', types: 'types' }

const SUBTITLE: Record<Tab, string> = {
  overview: 'What needs you today, what is late, and how busy the team is.',
  board: 'Every task, in the column of the person who has it now.',
  plan: 'Plan your steps for today, tomorrow, this week and next week.',
  tracker: 'A grid of every task and where each person is in its flow.',
  list: 'All tasks as a searchable list.',
  messages: 'Chat with the team or one person. Tag a task to link a message to it.',
  templates: 'Reusable flows: the same people in the same order.',
  import: 'Bring tasks in from Excel, or copy a whole month forward.',
  admin: 'Add people, reset passwords and choose who is an admin.',
  clients: 'The clients that tasks are filed under.',
  types: 'The kinds of content a task can be, such as Reel or Post.',
}

function LoginArt() {
  // Soft green shapes in the bottom-left corner, behind the page.
  return (
    <svg className="login-art" viewBox="0 0 330 260" aria-hidden="true">
      <circle cx="70" cy="250" r="120" fill="#cdeed8" />
      <circle cx="40" cy="270" r="110" fill="#3fbf6c" />
      <path d="M-4 168c8-26 24-40 44-46-2 26-12 44-34 54z" fill="#bfe6cc" />
      <path d="M-8 196c2-20 12-34 28-40 0 20-8 34-22 44z" fill="#8fd3a8" />
    </svg>
  )
}

function Login() {
  const qc = useQueryClient()
  const [error, setError] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const login = useMutation({
    mutationFn: (v: { email: string; password: string; remember: boolean }) => api<User>('/auth/login', { body: v }),
    onSuccess: (u) => qc.setQueryData(['me'], u),
    onError: (e) => setError(e.message),
  })
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    setError('')
    login.mutate({ email: String(f.get('email')), password: String(f.get('password')), remember: f.get('remember') === 'on' })
  }
  const forgot = () => confirmDialog({
    title: 'Forgot your password?',
    message: 'Ask an admin to reset it for you (Admin / Users, then Reset password). You will get a temporary password and choose a new one when you sign in.',
    confirmLabel: 'Got it',
  })
  return (
    <div className="login-page">
      <LoginArt />
      <section className="login-hero">
        <Brand />
        <h1>Plan. Track. Deliver.<br /><span>Together.</span></h1>
        <p>Manage your projects, track progress, collaborate with your team and achieve your goals — all in one place.</p>
        <div className="hero-points">
          {([['checks', 'Organize', 'Your work'], ['users', 'Collaborate', 'With your team'], ['chart', 'Track', 'Progress'], ['target', 'Achieve', 'Your goals']] as const).map(([i, a, b]) => (
            <div key={a}><span className="hero-icon"><Icon name={i} size={22} /></span><strong>{a}</strong><small>{b}</small></div>
          ))}
        </div>
      </section>
      <form className="login-card" onSubmit={submit}>
        <h2>Welcome back</h2>
        <p className="muted">Sign in to your account</p>
        <label>Email address
          <span className="field"><Icon name="mail" size={18} /><input name="email" type="email" autoComplete="username" placeholder="you@emqube.com" required autoFocus /></span>
        </label>
        <label>Password
          <span className="field">
            <Icon name="lock" size={18} />
            <input name="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" placeholder="Enter your password" required />
            <button type="button" className="field-btn" aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword(!showPassword)}>
              <Icon name={showPassword ? 'eye-off' : 'eye'} size={18} />
            </button>
          </span>
        </label>
        <div className="login-row">
          <label className="check"><input name="remember" type="checkbox" defaultChecked /> Remember me</label>
          <button type="button" className="link forgot" onClick={forgot}>Forgot password?</button>
        </div>
        {error && <p className="error">{error}</p>}
        <button className="primary big with-icon" disabled={login.isPending}>Sign in <Icon name="forward" /></button>
        <p className="secure"><Icon name="shield" size={16} /> Your data is secure with us</p>
      </form>
    </div>
  )
}

function Brand() {
  return (
    <img className="brand-logo" src="/emqube-logo.svg" alt="emQube - Powered by Thought" width={193} height={76} />
  )
}

// Forced at first sign-in (no onClose), or opened voluntarily from the sidebar (onClose = cancel/done).
function ChangePassword({ user, onClose }: { user: User; onClose?: () => void }) {
  const qc = useQueryClient()
  const [error, setError] = useState('')
  const change = useMutation({
    mutationFn: (v: { currentPassword: string; newPassword: string }) => api('/auth/change-password', { body: v }),
    onSuccess: () => {
      qc.setQueryData(['me'], { ...user, mustChangePassword: false })
      if (onClose) { onClose(); notifySuccess('Password changed') }
    },
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
        <h2>{onClose ? 'Change your password' : 'Choose your password'}</h2>
        <p className="muted">{onClose ? 'Enter your current password, then a new one.' : `Hi ${user.name}. Replace the temporary password before you continue.`}</p>
        <label>{onClose ? 'Current password' : 'Temporary password'}<input name="currentPassword" type="password" required autoComplete="current-password" /></label>
        <label>New password (8+ characters)<input name="newPassword" type="password" minLength={8} required autoComplete="new-password" /></label>
        <label>Repeat new password<input name="confirm" type="password" minLength={8} required autoComplete="new-password" /></label>
        {error && <p className="error">{error}</p>}
        <button className="primary big" disabled={change.isPending}>Save password</button>
        {onClose && <button type="button" className="link" onClick={onClose}>Cancel</button>}
      </form>
    </div>
  )
}

/** Who am I signed in as, with the way to change my password. */
function ProfilePopup({ me, onClose, onChangePassword }: { me: User; onClose: () => void; onChangePassword: () => void }) {
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', key)
    return () => document.removeEventListener('keydown', key)
  }, [onClose])
  return (
    <div className="overlay modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog small-dialog" role="dialog" aria-modal="true" aria-label="My profile">
        <div className="profile">
          <span className="avatar xl" style={{ background: me.colour }}>{me.initials}</span>
          <div>
            <strong className="profile-name">{me.name}</strong>
            <div className="muted">{me.email}</div>
          </div>
        </div>
        <dl className="facts">
          <dt>Full name</dt><dd>{me.name}</dd>
          <dt>Work email</dt><dd>{me.email}</dd>
          <dt>Role</dt><dd><span className={me.role === 'admin' ? 'badge active' : 'badge'}>{me.role === 'admin' ? 'Admin' : 'Member'}</span></dd>
          <dt>Password</dt><dd><button type="button" className="link" onClick={onChangePassword}>Change password</button></dd>
        </dl>
        <div className="dialog-actions">
          <span className="spacer" />
          <button type="button" onClick={onClose}>Close</button>
          <button type="button" className="primary" onClick={onChangePassword}>Change password</button>
        </div>
      </div>
    </div>
  )
}

/** Reloads everything on screen now, instead of waiting for the next automatic refresh. */
function RefreshButton() {
  const qc = useQueryClient()
  const busy = useIsFetching() > 0
  return (
    <button type="button" className="bell refresh" onClick={() => qc.invalidateQueries()} aria-label="Refresh" title="Refresh">
      <Icon name="refresh" size={19} className={busy ? 'spin' : undefined} />
    </button>
  )
}

const ADMIN_TABS: Tab[] = ['admin', 'clients', 'types']

function Shell({ me }: { me: User }) {
  const qc = useQueryClient()
  const [mainTab, setMainTab] = useState<Tab>('overview')
  const section = sectionOf(useHash())
  // Admin pages live in the URL hash (#/users/12/edit); every other tab is plain state.
  const tab: Tab = me.role === 'admin' && section ? SECTION_TAB[section] : mainTab
  const setTab = (k: Tab) => {
    const adminSection = (Object.keys(SECTION_TAB) as AdminSection[]).find((s) => SECTION_TAB[s] === k)
    if (adminSection) return go(`/${adminSection}`)
    setMainTab(k)
    go('')
  }
  const [changingPassword, setChangingPassword] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  // The left menu can shrink to icons. Remembered in this browser only.
  const [menuCollapsed, setMenuCollapsed] = useState(() => {
    try { return localStorage.getItem('cf_menu_collapsed') === '1' } catch { return false }
  })
  const toggleMenu = () => {
    const next = !menuCollapsed
    setMenuCollapsed(next)
    try { localStorage.setItem('cf_menu_collapsed', next ? '1' : '0') } catch { /* storage unavailable: it just won't be remembered */ }
  }
  const [filters, setFilters] = useState<Filters>({ month: dubaiMonth(), owner: '', client: '', type: '' })
  const logout = useMutation({
    mutationFn: () => api('/auth/logout', { method: 'POST', body: {} }),
    // Even if the server says 401 (session already gone) the person asked to leave, so always end on the sign-in page.
    // Keep the 'me' query itself (App is watching it) and drop everything else so no stale data or polling survives.
    onError: () => {},
    onSettled: () => {
      go('')
      qc.setQueryData(['me'], null)
      qc.removeQueries({ predicate: (q) => q.queryKey[0] !== 'me' })
    },
  })

  const tabs: [Tab, string, IconName][] = [
    ['overview', 'Overview', 'grid'], ['board', 'Board', 'board'], ['tracker', 'Tracker', 'table'], ['list', 'List', 'list'],
    ['messages', 'Messages', 'message'], ['templates', 'Templates', 'layers'], ['import', 'Import / Clone', 'upload'],
  ]
  if (me.role === 'admin') tabs.push(['admin', 'Admin / Users', 'users'], ['clients', 'Clients', 'briefcase'], ['types', 'Task types', 'tag'])
  const [adminOpen, setAdminOpen] = useState(false)
  // Which chat the Messages tab shows. The bell opens it on the person who wrote.
  const [convo, setConvo] = useState<Convo>({ kind: 'team' })
  const openChat = (personId?: number) => { setConvo(personId ? { kind: 'person', id: personId } : { kind: 'team' }); setTab('messages') }
  const signOut = async () => {
    if (await confirmDialog({ title: 'Sign out?', message: 'You will need to sign in again to continue.', confirmLabel: 'Sign out' })) logout.mutate()
  }
  const filtered = tab === 'board' || tab === 'tracker' || tab === 'list'
  const title = tabs.find(([k]) => k === tab)![1]

  if (changingPassword) return <ChangePassword user={me} onClose={() => setChangingPassword(false)} />

  return (
    <div className={menuCollapsed ? 'shell menu-collapsed' : 'shell'}>
      <aside className="sidebar">
        <div className="side-top">
          {!menuCollapsed && <Brand />}
          <button type="button" className="menu-toggle" onClick={toggleMenu} aria-label={menuCollapsed ? 'Expand menu' : 'Collapse menu'} title={menuCollapsed ? 'Expand menu' : 'Collapse menu'}>
            <Icon name="panel" size={18} />
          </button>
        </div>
        <nav>
          {tabs.filter(([k]) => !ADMIN_TABS.includes(k)).map(([k, label, icon]) => (
            <button key={k} className={tab === k ? 'nav-item active' : 'nav-item'} onClick={() => setTab(k)} title={label}>
              <span className="nav-icon"><Icon name={icon} /></span><span className="nav-text">{label}</span>
            </button>
          ))}
          {me.role === 'admin' && (menuCollapsed ? (
            tabs.filter(([k]) => ADMIN_TABS.includes(k)).map(([k, label, icon]) => (
              <button key={k} className={tab === k ? 'nav-item active' : 'nav-item'} onClick={() => setTab(k)} title={label}>
                <span className="nav-icon"><Icon name={icon} /></span><span className="nav-text">{label}</span>
              </button>
            ))
          ) : (
            <>
              <button className={ADMIN_TABS.includes(tab) ? 'nav-item group-active' : 'nav-item'} aria-expanded={adminOpen || ADMIN_TABS.includes(tab)} onClick={() => setAdminOpen(!(adminOpen || ADMIN_TABS.includes(tab)))}>
                <span className="nav-icon"><Icon name="sliders" /></span><span className="nav-text">Administration</span>
                <Icon name="next" size={16} className={adminOpen || ADMIN_TABS.includes(tab) ? 'nav-chev open' : 'nav-chev'} />
              </button>
              {(adminOpen || ADMIN_TABS.includes(tab)) && tabs.filter(([k]) => ADMIN_TABS.includes(k)).map(([k, label, icon]) => (
                <button key={k} className={tab === k ? 'nav-item sub active' : 'nav-item sub'} onClick={() => setTab(k)}>
                  <span className="nav-icon"><Icon name={icon} size={16} /></span><span className="nav-text">{label}</span>
                </button>
              ))}
            </>
          ))}
        </nav>
        <div className="side-account">
          <div className="side-user">
            <button type="button" className="profile-btn" title="My profile" aria-label="My profile" onClick={() => setProfileOpen(true)}>
              <span className="avatar big soft">{me.name.charAt(0).toUpperCase()}</span>
              <span className="who-name"><strong>{me.name}</strong><small>{me.role === 'admin' ? 'Admin' : 'Employee'}</small></span>
            </button>
            <span className="side-actions">
              <button type="button" className="side-btn" title="My profile" aria-label="My profile" onClick={() => setProfileOpen(true)}><Icon name="user" size={18} /></button>
              <button type="button" className="side-btn signout" title="Sign out" aria-label="Sign out" disabled={logout.isPending} onClick={signOut}><Icon name="logout" size={18} /></button>
            </span>
          </div>
        </div>
      </aside>
      {profileOpen && <ProfilePopup me={me} onClose={() => setProfileOpen(false)} onChangePassword={() => { setProfileOpen(false); setChangingPassword(true) }} />}
      <div className={tab === 'messages' ? 'content content-chat' : 'content'}>
      {tab !== 'messages' && <div className="topbar">{(tab === 'board' || tab === 'plan') && <RefreshButton />}<InboxBell me={me} onOpenChat={openChat} /></div>}
      {tab !== 'messages' && <h1 className="page-title">{tab === 'overview' ? `Hello, ${me.name.split(' ')[0]}` : title}</h1>}
      {tab !== 'messages' && <p className="page-sub">{SUBTITLE[tab]}</p>}
      {filtered && <FilterBar filters={filters} onChange={setFilters} />}
      <main>
        {tab === 'overview' && <Overview me={me} goBoard={() => setTab('board')} />}
        {tab === 'board' && <Board me={me} filters={filters} />}
        {tab === 'plan' && <PlanBoard owner={me} me={me} />}
        {tab === 'tracker' && <Tracker me={me} filters={filters} />}
        {tab === 'list' && <ListView me={me} filters={filters} />}
        {tab === 'messages' && <MessagesView me={me} convo={convo} onConvo={setConvo} />}
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
