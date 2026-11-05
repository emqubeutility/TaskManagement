import { useEffect, useMemo, useRef, useState } from 'react'
import { useInbox, useMessageActions, useUsers } from '../hooks'
import { Icon } from '../icons'
import type { Post, User } from '../types'
import { Avatar } from './FlowEditor'
import { clock, when } from './Chat'

const PREVIEW: Record<Post['kind'], string> = { note: '', handover: 'Handed over · ', close: 'Closed their step · ' }

/** The bell at the top right: who has written to me, like a chat list. Click a person to open the chat with them. */
export function InboxBell({ me, onOpenChat }: { me: User; onOpenChat: (personId?: number) => void }) {
  const inbox = useInbox().data
  const users = useUsers().data ?? []
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const { readAll } = useMessageActions()

  useEffect(() => {
    if (!open) return
    const away = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false) }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', away)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc) }
  }, [open])

  const unread = inbox?.unread ?? 0

  // One row per person, newest conversation first. The feed is newest first, so the first post seen is the latest.
  const chats = useMemo(() => {
    const by = new Map<number, { last: Post; unread: number }>()
    for (const p of inbox?.items ?? []) {
      if (p.authorId === me.id) continue
      const e = by.get(p.authorId)
      const n = p.mentions.some((x) => x.userId === me.id && !x.readAt) ? 1 : 0
      if (e) e.unread += n
      else by.set(p.authorId, { last: p, unread: n })
    }
    return [...by.entries()]
  }, [inbox, me.id])

  const go = (id?: number) => { setOpen(false); onOpenChat(id) }

  return (
    <div className="inbox" ref={box}>
      <button type="button" className="bell" onClick={() => setOpen(!open)} aria-label={`Messages, ${unread} unread`} aria-expanded={open}>
        <Icon name="bell" size={20} />
        {unread > 0 && <span className="bell-count">{unread > 99 ? '99+' : unread}</span>}
      </button>
      {open && (
        <div className="inbox-panel" role="dialog" aria-label="Messages">
          <div className="inbox-head">
            <strong>Messages</strong>
            <span className="muted">{unread ? `${unread} unread` : 'All read'}</span>
            <span className="spacer" />
            <button type="button" className="link" disabled={!unread || readAll.isPending} onClick={() => readAll.mutate()}>Mark all read</button>
          </div>
          <ul className="chat-rows">
            {chats.map(([id, { last, unread: n }]) => {
              const name = users.find((u) => u.id === id)?.name ?? 'Someone'
              return (
                <li key={id}>
                  <button type="button" className={n ? 'chat-row-btn unread' : 'chat-row-btn'} onClick={() => go(id)}>
                    <Avatar userId={id} size={40} />
                    <span className="chat-row-main">
                      <span className="chat-row-top"><strong>{name}</strong><span className="muted chat-row-time" title={when(last.createdAt)}>{clock(last.createdAt)}</span></span>
                      <span className="chat-row-preview">{PREVIEW[last.kind]}{last.taskTitle ? <em>{last.taskTitle}: </em> : null}{last.body}</span>
                    </span>
                    {n > 0 && <span className="count count-new">{n}</span>}
                  </button>
                </li>
              )
            })}
            {!chats.length && <li className="muted empty">Nobody has written to you yet</li>}
          </ul>
          <div className="inbox-foot"><button type="button" className="link" onClick={() => go()}>Open Messages</button></div>
        </div>
      )}
    </div>
  )
}
