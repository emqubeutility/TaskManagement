import { useMemo, useState } from 'react'
import { LIVE_MS, useFeed, useTasks, useUsers } from '../hooks'
import { Icon } from '../icons'
import type { Post, Task, User } from '../types'
import { ChatThread, shortTime } from './Chat'
import { Avatar } from './FlowEditor'
import { SearchSelect } from './SearchSelect'
import { TaskDialog } from './TaskDialog'

const ALL = { month: '', owner: '', client: '', type: '' }

/** Which chat is open: the whole team, or one person. */
export type Convo = { kind: 'team' } | { kind: 'person'; id: number }
type Filter = 'all' | 'unread' | 'mentions'

interface Row { key: string; convo: Convo; name: string; last?: Post; unread: number; mentioned: boolean; text: string }

const isUnreadFor = (p: Post, me: User) => p.mentions.some((m) => m.userId === me.id && !m.readAt)

/** The Messages tab: a searchable list of chats on the left and the open chat on the right. */
export function MessagesView({ me, convo, onConvo }: { me: User; convo: Convo; onConvo: (c: Convo) => void }) {
  const users = (useUsers().data ?? []).filter((u) => u.active)
  const others = users.filter((u) => u.id !== me.id)
  const posts = useFeed({}, LIVE_MS).data?.items ?? []
  const inbox = useFeed({ mine: true }, LIVE_MS).data
  const tasks = useTasks(ALL, 'all').data ?? []
  const [open, setOpen] = useState<Task | null>(null)
  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')
  const nameOf = (id: number) => users.find((u) => u.id === id)?.name ?? 'Someone'

  const preview = (p: Post, group: boolean) => {
    const prefix = p.kind === 'handover' ? 'Handed over: ' : p.kind === 'close' ? 'Closed step: ' : ''
    const who = p.authorId === me.id ? 'You: ' : group ? `${nameOf(p.authorId).split(' ')[0]}: ` : ''
    return `${who}${prefix}${p.body}`
  }

  // Every chat as a row: the team, then each person with the last message between us. The feed is newest first.
  const rows = useMemo<Row[]>(() => {
    const teamPosts = posts.filter((p) => !p.isPrivate)
    const team: Row = {
      key: 'team', convo: { kind: 'team' }, name: 'Team', last: teamPosts[0], unread: 0,
      mentioned: (inbox?.items.length ?? 0) > 0, text: teamPosts.map((p) => `${p.taskTitle ?? ''} ${p.body}`).join(' '),
    }
    const people = others.map<Row>((u) => {
      const between = posts.filter((p) => (p.authorId === me.id && p.mentions.some((m) => m.userId === u.id)) || (p.authorId === u.id && p.mentions.some((m) => m.userId === me.id)))
      return {
        key: `p${u.id}`, convo: { kind: 'person', id: u.id }, name: u.name, last: between[0],
        unread: between.filter((p) => p.authorId === u.id && isUnreadFor(p, me)).length,
        mentioned: between.some((p) => p.authorId === u.id),
        text: between.map((p) => `${p.taskTitle ?? ''} ${p.body}`).join(' '),
      }
    })
    // Newest chat first; chats with no messages yet go last, by name.
    people.sort((a, b) => (b.last ? Date.parse(b.last.createdAt) : 0) - (a.last ? Date.parse(a.last.createdAt) : 0) || a.name.localeCompare(b.name))
    return [team, ...people]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [posts, inbox, users.length, me.id])

  const needle = query.trim().toLowerCase()
  const shown = rows.filter((r) =>
    (filter === 'all' || (filter === 'unread' ? r.unread > 0 : r.mentioned)) &&
    (!needle || r.name.toLowerCase().includes(needle) || r.text.toLowerCase().includes(needle)))

  const person = convo.kind === 'person' ? users.find((u) => u.id === convo.id) : undefined
  const isActive = (r: Row) => (convo.kind === 'team' ? r.key === 'team' : r.key === `p${convo.id}`)
  const openTask = (id: number) => setOpen(tasks.find((t) => t.id === id) ?? null)

  return (
    <>
      <div className="chat-page">
        <aside className="convo-pane" aria-label="Chats">
          <div className="convo-head">
            <h2>Messages</h2>
            <SearchSelect
              ariaLabel="New message" placeholder="" searchPlaceholder="Message someone…" align="right"
              trigger={<Icon name="edit" size={18} />}
              value="" onChange={(v) => v && onConvo({ kind: 'person', id: Number(v) })}
              options={others.map((u) => ({ value: String(u.id), label: u.name }))}
            />
          </div>
          <label className="convo-search">
            <Icon name="search" size={16} />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search people or tasks" aria-label="Search chats" />
          </label>
          <div className="convo-filters" role="tablist">
            {(['all', 'unread', 'mentions'] as const).map((f) => (
              <button key={f} type="button" role="tab" aria-selected={filter === f} className={filter === f ? 'filter on' : 'filter'} onClick={() => setFilter(f)}>
                {f === 'all' ? 'All' : f === 'unread' ? 'Unread' : 'Mentions'}
              </button>
            ))}
          </div>
          <div className="convo-list">
            {shown.map((r) => (
              <button type="button" key={r.key} className={isActive(r) ? 'convo active' : 'convo'} onClick={() => onConvo(r.convo)}>
                {r.convo.kind === 'team' ? <span className="convo-icon team"><Icon name="users" size={18} /></span> : <Avatar userId={r.convo.id} size={40} />}
                <span className="convo-text">
                  <span className="convo-top"><strong>{r.name}</strong>{r.last && <time>{shortTime(r.last.createdAt)}</time>}</span>
                  <span className="convo-bottom">
                    <span className="preview">{r.last ? preview(r.last, r.convo.kind === 'team') : r.convo.kind === 'team' ? 'Everyone can read these' : 'No messages yet'}</span>
                    {r.unread > 0 && <span className="count count-new">{r.unread}</span>}
                  </span>
                </span>
              </button>
            ))}
            {!shown.length && <p className="muted convo-empty">{needle ? 'No chats match.' : filter === 'unread' ? 'No unread messages.' : 'Nothing here yet.'}</p>}
          </div>
        </aside>

        <section className="chat-main">
          <header className="chat-head">
            {person ? <Avatar userId={person.id} size={40} /> : <span className="convo-icon team"><Icon name="users" size={20} /></span>}
            <div className="chat-head-text">
              <h2>{person ? person.name : 'Team'}</h2>
              <p className="muted">{person ? 'Only you two see this chat' : `${users.length} members · everyone can read these`}</p>
            </div>
            {!person && (
              <span className="member-stack" aria-label="Members">
                {users.slice(0, 4).map((u) => <Avatar key={u.id} userId={u.id} size={30} />)}
              </span>
            )}
          </header>
          {/* key: a fresh thread (and scroll position) for each chat */}
          <ChatThread
            key={convo.kind === 'person' ? `p${convo.id}` : 'team'}
            me={me}
            opts={convo.kind === 'person' ? { with: convo.id } : {}}
            fixedMentions={convo.kind === 'person' ? [convo.id] : undefined}
            allowPeople={convo.kind === 'team'}
            showTags={convo.kind === 'team'}
            autoRead
            live
            onOpenTask={openTask}
            placeholder={convo.kind === 'person' ? `Message ${person?.name.split(' ')[0] ?? ''}…` : 'Message the team…'}
            empty={convo.kind === 'person' ? 'No messages yet. Say hello.' : 'No messages yet. Write the first one below.'}
            className="chat-page-thread"
          />
        </section>
      </div>
      {open && <TaskDialog task={open} me={me} defaultMonth="" onClose={() => setOpen(null)} />}
    </>
  )
}
