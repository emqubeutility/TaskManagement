import { useState } from 'react'
import { useFeed, useMessageActions, useTasks, useUsers } from '../hooks'
import { Icon } from '../icons'
import type { Post, User } from '../types'
import { Avatar } from './FlowEditor'
import { SearchSelect } from './SearchSelect'

const ALL = { month: '', owner: '', client: '', type: '' }

export const when = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', { timeZone: 'Asia/Dubai', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

const KIND: Record<Post['kind'], string> = { note: 'posted', handover: 'handed over', close: 'closed their step' }

/** One message: who wrote it, the task it is tagged with, the people tagged, and the text. */
export function PostItem({ post, me, onOpenTask }: { post: Post; me: User; onOpenTask?: (taskId: number) => void }) {
  const users = useUsers().data ?? []
  const { read } = useMessageActions()
  const name = (id: number) => users.find((u) => u.id === id)?.name ?? 'Someone'
  const myTag = post.mentions.find((m) => m.userId === me.id)
  const unread = !!myTag && !myTag.readAt
  return (
    <li className={unread ? 'post unread' : 'post'}>
      <Avatar userId={post.authorId} size={32} />
      <div className="post-main">
        <div className="post-top">
          <strong>{post.authorId === me.id ? 'You' : name(post.authorId)}</strong>
          <span className="muted">{KIND[post.kind]}</span>
          <span className="muted post-time">{when(post.createdAt)}</span>
        </div>
        {(post.taskId || post.mentions.length > 0) && (
          <div className="post-tags">
            {post.taskId && (
              onOpenTask
                ? <button type="button" className="tag tag-task" onClick={() => onOpenTask(post.taskId!)} title="Open this task"><Icon name="list" size={12} /> {post.taskTitle}</button>
                : <span className="tag tag-task"><Icon name="list" size={12} /> {post.taskTitle}</span>
            )}
            {post.mentions.map((m) => (
              <span key={m.userId} className={m.userId === me.id ? 'tag tag-me' : 'tag'}>@{m.userId === me.id ? 'You' : name(m.userId)}</span>
            ))}
          </div>
        )}
        <p className="post-body">{post.body}</p>
        {unread && <button type="button" className="link" disabled={read.isPending} onClick={() => read.mutate(post.id)}>Mark as read</button>}
      </div>
    </li>
  )
}

/** Write a message. Tag it with people, and (unless the task is fixed) with a task. Not a <form>, so it can sit inside the task dialog. */
export function Composer({ me, fixedTask }: { me: User; fixedTask?: number }) {
  const users = (useUsers().data ?? []).filter((u) => u.active)
  const tasks = useTasks(ALL, 'all').data ?? []
  const { post } = useMessageActions()
  const [body, setBody] = useState('')
  const [taskId, setTaskId] = useState('')
  const [mentions, setMentions] = useState<number[]>([])
  const name = (id: number) => users.find((u) => u.id === id)?.name ?? 'Someone'

  const send = () => {
    if (!body.trim()) return
    post.mutate(
      { body: body.trim(), taskId: fixedTask ?? (taskId ? Number(taskId) : null), mentionIds: mentions },
      { onSuccess: () => { setBody(''); setMentions([]); if (!fixedTask) setTaskId('') } },
    )
  }

  return (
    <div className="composer card">
      <textarea
        rows={3} value={body} maxLength={2000} placeholder="Write a message…" aria-label="Message"
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); send() } }}
      />
      <div className="composer-tags">
        {!fixedTask && (
          <SearchSelect
            ariaLabel="Tag a task" placeholder="Tag a task (optional)…" searchPlaceholder="Search tasks…" clearable
            value={taskId} onChange={setTaskId}
            options={tasks.map((t) => ({ value: String(t.id), label: `${t.title} · ${t.month}` }))}
          />
        )}
        <SearchSelect
          ariaLabel="Tag a person" placeholder="Tag a person (optional)…" searchPlaceholder="Search people…"
          value="" onChange={(v) => v && setMentions([...mentions, Number(v)])}
          options={users.filter((u) => !mentions.includes(u.id)).map((u) => ({ value: String(u.id), label: u.id === me.id ? `${u.name} (you)` : u.name }))}
        />
      </div>
      {mentions.length > 0 && (
        <div className="post-tags">
          {mentions.map((id) => (
            <span key={id} className="tag tag-me">@{name(id)}
              <button type="button" className="tag-x" aria-label={`Remove ${name(id)}`} onClick={() => setMentions(mentions.filter((m) => m !== id))}><Icon name="x" size={12} /></button>
            </span>
          ))}
        </div>
      )}
      <div className="composer-actions">
        <span className="muted">Everyone can read this. Tagged people get it as unread. Ctrl+Enter sends.</span>
        <span className="spacer" />
        <button type="button" className="primary" disabled={!body.trim() || post.isPending} onClick={send}>Post message</button>
      </div>
    </div>
  )
}

/** Everything said about one task, for the task dialog. */
export function TaskThread({ taskId, me }: { taskId: number; me: User }) {
  const feed = useFeed({ task: taskId }).data
  const items = feed?.items ?? []
  return (
    <div className="thread">
      <Composer me={me} fixedTask={taskId} />
      <ul className="feed">
        {items.map((p) => <PostItem key={p.id} post={p} me={me} />)}
        {!items.length && <li className="muted empty">No messages about this task yet.</li>}
      </ul>
    </div>
  )
}
