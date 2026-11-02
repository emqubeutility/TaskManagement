import { useUsers } from '../hooks'

export function Avatar({ userId, size = 24 }: { userId: number; size?: number }) {
  const u = useUsers().data?.find((x) => x.id === userId)
  if (!u) return <span className="avatar" style={{ width: size, height: size }}>?</span>
  return <span className="avatar" title={u.name} style={{ background: u.colour, width: size, height: size }}>{u.initials}</span>
}

/** Ordered list of people. `locked` people (already finished) are shown but cannot change. */
export function FlowEditor({ value, onChange, locked = [], disabled = false }: {
  value: number[]
  onChange: (ids: number[]) => void
  locked?: number[]
  disabled?: boolean
}) {
  const users = (useUsers().data ?? []).filter((u) => u.active)
  const move = (i: number, d: -1 | 1) => {
    const next = [...value]
    ;[next[i], next[i + d]] = [next[i + d], next[i]]
    onChange(next)
  }
  return (
    <div className="flow-editor">
      <ol>
        {locked.map((id, i) => (
          <li key={`l${i}`} className="locked"><Avatar userId={id} /> <PersonName id={id} /> <span className="muted">done</span></li>
        ))}
        {value.map((id, i) => (
          <li key={`${id}-${i}`}>
            <Avatar userId={id} /> <PersonName id={id} />
            {!disabled && (
              <span className="row-actions">
                <button type="button" className="icon" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move earlier">↑</button>
                <button type="button" className="icon" disabled={i === value.length - 1} onClick={() => move(i, 1)} aria-label="Move later">↓</button>
                <button type="button" className="icon" onClick={() => onChange(value.filter((_, j) => j !== i))} aria-label="Remove">✕</button>
              </span>
            )}
          </li>
        ))}
        {!value.length && !locked.length && <li className="muted">No one yet</li>}
      </ol>
      {!disabled && (
        <select value="" onChange={(e) => e.target.value && onChange([...value, Number(e.target.value)])}>
          <option value="">+ Add a person…</option>
          {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
      )}
    </div>
  )
}

export function PersonName({ id }: { id: number }) {
  return <>{useUsers().data?.find((u) => u.id === id)?.name ?? 'Unknown'}</>
}
