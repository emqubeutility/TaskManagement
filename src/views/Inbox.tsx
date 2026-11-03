import { useEffect, useRef, useState } from 'react'
import { useInbox, useMessageActions, useUsers } from '../hooks'
import { Icon } from '../icons'
import type { Post, User } from '../types'
import { when } from './Messages'

/** The bell at the top right: messages that tag me. Unread ones are highlighted and counted until I mark them read. */
export function InboxBell({ me, onOpenMessages }: { me: User; onOpenMessages: () => void }) {
  const inbox = useInbox().data
  const users = useUsers().data ?? []
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const { read, readAll } = useMessageActions()

  useEffect(() => {
    if (!open) return
    const away = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false) }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', away)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc) }
  }, [open])

  const unread = inbox?.unread ?? 0
  const items = inbox?.items ?? []
  const who = (m: Post) => (m.authorId === me.id ? 'You' : users.find((u) => u.id === m.authorId)?.name ?? 'Someone')
  const isUnread = (m: Post) => m.mentions.some((x) => x.userId === me.id && !x.readAt)

  return (
    <div className="inbox" ref={box}>
      <button type="button" className="bell" onClick={() => setOpen(!open)} aria-label={`Messages, ${unread} unread`} aria-expanded={open}>
        <Icon name="bell" size={20} />
        {unread > 0 && <span className="bell-count">{unread > 99 ? '99+' : unread}</span>}
      </button>
      {open && (
        <div className="inbox-panel" role="dialog" aria-label="Messages">
          <div className="inbox-head">
            <strong>Tagged you</strong>
            <span className="muted">{unread ? `${unread} unread` : 'All read'}</span>
            <span className="spacer" />
            <button type="button" className="link" disabled={!unread || readAll.isPending} onClick={() => readAll.mutate()}>Mark all read</button>
          </div>
          <ul>
            {items.map((m) => (
              <li key={m.id} className={isUnread(m) ? 'msg unread' : 'msg'}>
                <button type="button" onClick={() => { if (isUnread(m)) read.mutate(m.id); setOpen(false); onOpenMessages() }}>
                  <span className="msg-top">
                    <strong>{who(m)}</strong>
                    <span className="muted">{m.kind === 'close' ? 'closed their step' : m.kind === 'handover' ? 'handed over' : 'tagged you'}</span>
                    <span className="muted msg-time">{when(m.createdAt)}</span>
                  </span>
                  {m.taskTitle && <span className="msg-task">{m.taskTitle}</span>}
                  <span className="msg-body">{m.body}</span>
                </button>
              </li>
            ))}
            {!items.length && <li className="muted empty">Nothing has tagged you yet</li>}
          </ul>
          <div className="inbox-foot"><button type="button" className="link" onClick={() => { setOpen(false); onOpenMessages() }}>Open all messages</button></div>
        </div>
      )}
    </div>
  )
}
