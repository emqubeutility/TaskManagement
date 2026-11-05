import { useUsers } from '../hooks'
import { Icon } from '../icons'

export function Avatar({ userId, size = 24 }: { userId: number; size?: number }) {
  const u = useUsers().data?.find((x) => x.id === userId)
  if (!u) return <span className="avatar" style={{ width: size, height: size }}>?</span>
  return <span className="avatar" title={u.name} style={{ background: u.colour, width: size, height: size }}>{u.initials}</span>
}

/** Ordered list of people. `locked` people (already finished) are shown but cannot change. */
export function FlowEditor({ value, onChange, locked = [], disabled = false, allowRepeat = false }: {
  value: number[]
  onChange: (ids: number[]) => void
  locked?: number[]
  disabled?: boolean
  /** A person may come back later in the flow (not twice in a row). Off for templates, where each person appears once. */
  allowRepeat?: boolean
}) {
  const previous = value.length ? value[value.length - 1] : locked[locked.length - 1]
  const users = (useUsers().data ?? []).filter((u) => u.active && (allowRepeat
    ? u.id !== previous
    : !value.includes(u.id) && !locked.includes(u.id)))
  const move = (i: number, d: -1 | 1) => {
    const next = [...value]
    ;[next[i], next[i + d]] = [next[i + d], next[i]]
    onChange(next)
  }
  return (
    <div className="flow-editor">
      <ol>
        {locked.map((id, i) => (
          <li key={`l${i}`} className="locked"><span className="step-no">{i + 1}</span><Avatar userId={id} /><span className="grow"><PersonName id={id} /></span> <span className="muted">done</span></li>
        ))}
        {value.map((id, i) => (
          <li key={`${id}-${i}`}>
            <span className="step-no">{locked.length + i + 1}</span><Avatar userId={id} /><span className="grow"><PersonName id={id} /></span>
            {!disabled && (
              <span className="row-actions">
                <button type="button" className="icon" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move earlier"><Icon name="up" size={14} /></button>
                <button type="button" className="icon" disabled={i === value.length - 1} onClick={() => move(i, 1)} aria-label="Move later"><Icon name="down" size={14} /></button>
                <button type="button" className="icon" onClick={() => onChange(value.filter((_, j) => j !== i))} aria-label="Remove"><Icon name="x" size={14} /></button>
              </span>
            )}
          </li>
        ))}
        {!value.length && !locked.length && <li className="muted">No one yet</li>}
      </ol>
      {!disabled && (
        <select value="" onChange={(e) => e.target.value && onChange([...value, Number(e.target.value)])}>
          <option value="">{users.length ? '+ Add a person…' : allowRepeat ? 'Nobody else to add' : 'Everyone is already added'}</option>
          {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
      )}
    </div>
  )
}

export function PersonName({ id }: { id: number }) {
  return <>{useUsers().data?.find((u) => u.id === id)?.name ?? 'Unknown'}</>
}
