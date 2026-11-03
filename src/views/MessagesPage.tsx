import { useState } from 'react'
import { useFeed, useTasks } from '../hooks'
import type { Task, User } from '../types'
import { Composer, PostItem } from './Messages'
import { TaskDialog } from './TaskDialog'

const ALL = { month: '', owner: '', client: '', type: '' }

/** The Messages tab: the whole team's feed, with a box to write a new message. */
export function MessagesView({ me }: { me: User }) {
  const [only, setOnly] = useState<'all' | 'mine'>('all')
  const feed = useFeed({ mine: only === 'mine' }).data
  const tasks = useTasks(ALL, 'all').data ?? []
  const [open, setOpen] = useState<Task | null>(null)
  const items = feed?.items ?? []
  return (
    <>
      <Composer me={me} />
      <div className="toolbar">
        <button type="button" className={only === 'all' ? 'chip-btn on' : 'chip-btn'} onClick={() => setOnly('all')}>All messages</button>
        <button type="button" className={only === 'mine' ? 'chip-btn on' : 'chip-btn'} onClick={() => setOnly('mine')}>
          Tagged me{feed && feed.unread > 0 ? ` (${feed.unread} unread)` : ''}
        </button>
      </div>
      <ul className="feed">
        {items.map((p) => <PostItem key={p.id} post={p} me={me} onOpenTask={(id) => setOpen(tasks.find((t) => t.id === id) ?? null)} />)}
        {!items.length && <li className="muted empty">{only === 'mine' ? 'Nothing has tagged you yet.' : 'No messages yet. Write the first one above.'}</li>}
      </ul>
      {open && <TaskDialog task={open} me={me} defaultMonth="" onClose={() => setOpen(null)} />}
    </>
  )
}
