import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { LIVE_MS, POLL_MS, useFeed, useMessageActions, useTasks, useUsers } from '../hooks'
import { Icon } from '../icons'
import type { Post, User } from '../types'
import { Avatar } from './FlowEditor'
import { SearchSelect } from './SearchSelect'

const ALL = { month: '', owner: '', client: '', type: '' }
const DUBAI = { timeZone: 'Asia/Dubai' } as const

export const when = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', { ...DUBAI, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
export const clock = (iso: string) => new Date(iso).toLocaleTimeString('en-GB', { ...DUBAI, hour: '2-digit', minute: '2-digit' })

const dayKey = (d: Date) => d.toLocaleDateString('en-CA', DUBAI)
function dayLabel(iso: string) {
  const day = dayKey(new Date(iso))
  if (day === dayKey(new Date())) return 'Today'
  if (day === dayKey(new Date(Date.now() - 86_400_000))) return 'Yesterday'
  return new Date(iso).toLocaleDateString('en-GB', { ...DUBAI, day: 'numeric', month: 'short', year: 'numeric' })
}

/** For a chat list: the time today, "Yesterday", the weekday this week, otherwise the date. */
export function shortTime(iso: string) {
  const d = new Date(iso)
  if (dayKey(d) === dayKey(new Date())) return clock(iso)
  if (dayKey(d) === dayKey(new Date(Date.now() - 86_400_000))) return 'Yesterday'
  if (Date.now() - d.getTime() < 6 * 86_400_000) return d.toLocaleDateString('en-GB', { ...DUBAI, weekday: 'short' })
  return d.toLocaleDateString('en-GB', { ...DUBAI, day: 'numeric', month: 'short' })
}

const isUnreadFor = (p: Post, me: User) => p.mentions.some((m) => m.userId === me.id && !m.readAt)
const REF_CAPTION: Record<Post['kind'], string> = { note: 'Task', handover: 'Handed this over', close: 'Closed their step' }
const REF_ICON = { note: 'list', handover: 'arrow-right', close: 'check-circle' } as const

/** One chat message: mine on the right, everyone else's on the left. */
function Bubble({ post, me, first, last, showName, showTags, onOpenTask, onRead }: {
  post: Post; me: User; first: boolean; last: boolean; showName: boolean; showTags: boolean; onOpenTask?: (taskId: number) => void; onRead?: () => void
}) {
  const users = useUsers().data ?? []
  const mine = post.authorId === me.id
  const author = users.find((u) => u.id === post.authorId)
  const unread = isUnreadFor(post, me)
  const tags = showTags ? post.mentions : []
  const allRead = post.mentions.length > 0 && post.mentions.every((m) => m.readAt)
  const reference = post.taskId && (
    onOpenTask
      ? <button type="button" className="bubble-ref" onClick={() => onOpenTask(post.taskId!)} title="Open this task"><RefBody post={post} /></button>
      : <div className="bubble-ref"><RefBody post={post} /></div>
  )
  return (
    <li className={`chat-row ${mine ? 'mine' : 'theirs'}${first ? ' first' : ''}${last ? ' last' : ''}`}>
      {!mine && <span className="chat-avatar">{last && <Avatar userId={post.authorId} size={32} />}</span>}
      <div className={unread ? 'bubble unread' : 'bubble'}>
        {!mine && first && showName && <span className="bubble-name" style={{ color: author?.colour }}>{author?.name ?? 'Someone'}</span>}
        {reference}
        {!post.taskId && post.kind !== 'note' && <span className="bubble-kind">{REF_CAPTION[post.kind]}</span>}
        <p className="bubble-text">{post.body}</p>
        <span className="bubble-foot">
          <span className="bubble-tags">
            {tags.map((m) => <span key={m.userId} className="mention">@{m.userId === me.id ? 'You' : users.find((u) => u.id === m.userId)?.name ?? 'Someone'}</span>)}
          </span>
          {unread && onRead && <button type="button" className="link" onClick={onRead}>Mark read</button>}
          <span className="bubble-time">{clock(post.createdAt)}</span>
          {mine && <Icon name={allRead ? 'check-check' : 'check'} size={15} className={allRead ? 'receipt read' : 'receipt'} />}
        </span>
      </div>
    </li>
  )
}

/** The little task card at the top of a message: which task it is about, and what happened to it. */
function RefBody({ post }: { post: Post }) {
  return (
    <>
      <Icon name={REF_ICON[post.kind]} size={16} />
      <span className="ref-text"><strong>{post.taskTitle}</strong><small>{REF_CAPTION[post.kind]}</small></span>
    </>
  )
}

/** The bottom of a chat: tag a task, mention people, write, send. Enter sends, Shift+Enter starts a new line. */
function ChatComposer({ me, fixedTask, fixedMentions, allowPeople, allowTask, placeholder, privateChat }: {
  me: User; fixedTask?: number; fixedMentions?: number[]; allowPeople: boolean; allowTask: boolean; placeholder: string; privateChat: boolean
}) {
  const users = (useUsers().data ?? []).filter((u) => u.active)
  const tasks = useTasks(ALL, 'all').data ?? []
  const { post } = useMessageActions()
  const [body, setBody] = useState('')
  const [taskId, setTaskId] = useState('')
  const [mentions, setMentions] = useState<number[]>([])
  const name = (id: number) => users.find((u) => u.id === id)?.name ?? 'Someone'
  const taggedTask = tasks.find((t) => String(t.id) === taskId)

  const send = () => {
    if (!body.trim() || post.isPending) return
    post.mutate(
      { body: body.trim(), taskId: fixedTask ?? (taskId ? Number(taskId) : null), mentionIds: fixedMentions ?? mentions, private: privateChat },
      { onSuccess: () => { setBody(''); setMentions([]); setTaskId('') } },
    )
  }
  const onKey = (e: KeyboardEvent) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }

  return (
    <div className="chat-compose">
      {(allowTask || allowPeople) && (
        <div className="chat-tags">
          {allowTask && (
            <SearchSelect
              ariaLabel="Tag a task" placeholder="" searchPlaceholder="Search tasks…" placement="up"
              trigger={<><Icon name="list" size={14} /> Tag a task</>}
              value="" onChange={setTaskId}
              options={tasks.map((t) => ({ value: String(t.id), label: `${t.title} · ${t.month}` }))}
            />
          )}
          {allowPeople && (
            <SearchSelect
              ariaLabel="Mention a person" placeholder="" searchPlaceholder="Search people…" placement="up"
              trigger={<><span className="at">@</span> Mention</>}
              value="" onChange={(v) => v && setMentions([...mentions, Number(v)])}
              options={users.filter((u) => !mentions.includes(u.id) && u.id !== me.id).map((u) => ({ value: String(u.id), label: u.name }))}
            />
          )}
          {taggedTask && (
            <span className="mention removable"><Icon name="list" size={12} /> {taggedTask.title}
              <button type="button" aria-label="Remove task" onClick={() => setTaskId('')}><Icon name="x" size={12} /></button>
            </span>
          )}
          {mentions.map((id) => (
            <span key={id} className="mention removable">@{name(id)}
              <button type="button" aria-label={`Remove ${name(id)}`} onClick={() => setMentions(mentions.filter((m) => m !== id))}><Icon name="x" size={12} /></button>
            </span>
          ))}
        </div>
      )}
      <div className="chat-input">
        <textarea
          rows={Math.min(5, Math.max(1, body.split('\n').length))} value={body} maxLength={2000} placeholder={placeholder} aria-label="Message"
          onChange={(e) => setBody(e.target.value)} onKeyDown={onKey}
        />
        <button type="button" className="send-btn" aria-label="Send" title="Send (Enter)" disabled={!body.trim() || post.isPending} onClick={send}><Icon name="send" size={18} /></button>
      </div>
    </div>
  )
}

export interface ThreadProps {
  me: User
  /** Which messages to show: one task's, the ones that tag me, or the conversation with one person. Nothing = the whole team. */
  opts: { task?: number; mine?: boolean; with?: number }
  placeholder: string
  /** Fixed task / people every message from this chat is tagged with. */
  fixedTask?: number
  fixedMentions?: number[]
  allowPeople?: boolean
  allowTask?: boolean
  /** Show who wrote each message (a group chat) and who each one mentioned. Not needed in a one-to-one chat. */
  showTags?: boolean
  /** Mark messages to me as read a moment after they are on screen, like a chat app. Off: each shows a "Mark read" link. */
  autoRead?: boolean
  /** Check for new messages every few seconds (the Messages page) instead of every 20. */
  live?: boolean
  onOpenTask?: (taskId: number) => void
  empty: string
  className?: string
}

/** Messages as chat bubbles, oldest at the top and newest at the bottom, with the box to write underneath. */
export function ChatThread({ me, opts, placeholder, fixedTask, fixedMentions, allowPeople = false, allowTask = true, showTags = false, autoRead = false, live = false, onOpenTask, empty, className }: ThreadProps) {
  const feed = useFeed(opts, live ? LIVE_MS : POLL_MS).data
  const { read, readMany } = useMessageActions()
  // Personal messages only show in the one-to-one chat (and the bell), never in the team or a task thread.
  const items = useMemo(() => [...(feed?.items ?? [])].filter((p) => !p.isPrivate || opts.with !== undefined || opts.mine).reverse(), [feed, opts.with, opts.mine])
  const scroller = useRef<HTMLDivElement>(null)

  // Land on the newest message when the chat opens or a new one arrives.
  const newest = items.length ? items[items.length - 1].id : 0
  useLayoutEffect(() => {
    const el = scroller.current
    if (el) el.scrollTop = el.scrollHeight
  }, [newest, opts.task, opts.mine, opts.with])

  const unreadIds = items.filter((p) => isUnreadFor(p, me)).map((p) => p.id)
  const unreadKey = unreadIds.join(',')
  useEffect(() => {
    if (!autoRead || !unreadIds.length) return
    const t = setTimeout(() => readMany.mutate(unreadIds), 1800)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unreadKey, autoRead])

  const sameRun = (a: Post, b: Post) => a.authorId === b.authorId && dayKey(new Date(a.createdAt)) === dayKey(new Date(b.createdAt)) && Math.abs(Date.parse(b.createdAt) - Date.parse(a.createdAt)) <= 5 * 60_000

  return (
    <div className={className ? `chat ${className}` : 'chat'}>
      <div className="chat-scroll" ref={scroller}>
        <ol className="chat-list">
          {items.map((p, i) => {
            const prev = items[i - 1]
            const next = items[i + 1]
            const newDay = !prev || dayKey(new Date(prev.createdAt)) !== dayKey(new Date(p.createdAt))
            const first = !prev || !sameRun(prev, p)
            const last = !next || !sameRun(p, next)
            return (
              <li key={p.id} className="chat-item">
                {newDay && <div className="chat-day"><span>{dayLabel(p.createdAt)}</span></div>}
                <ol className="chat-list">
                  <Bubble post={p} me={me} first={first} last={last} showName={showTags} showTags={showTags} onOpenTask={onOpenTask} onRead={!autoRead ? () => read.mutate(p.id) : undefined} />
                </ol>
              </li>
            )
          })}
          {!items.length && <li className="chat-empty muted">{empty}</li>}
        </ol>
      </div>
      <ChatComposer me={me} fixedTask={fixedTask} fixedMentions={fixedMentions} allowPeople={allowPeople} allowTask={allowTask} placeholder={placeholder} privateChat={opts.with !== undefined} />
    </div>
  )
}

/** Everything said about one task, for the task dialog. */
export function TaskThread({ taskId, me }: { taskId: number; me: User }) {
  return (
    <ChatThread
      me={me} opts={{ task: taskId }} fixedTask={taskId} allowTask={false}
      placeholder="Write a message about this task…" empty="No messages about this task yet." className="chat-compact"
    />
  )
}
