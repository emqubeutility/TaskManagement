import { useClients, useMonths, useTypes, useUsers } from '../hooks'
import type { Filters } from '../types'

/** `planView`: the Plan tab has its own month and person, so only client and type are offered. */
export function FilterBar({ filters, onChange, planView }: { filters: Filters; onChange: (f: Filters) => void; planView?: boolean }) {
  const months = useMonths().data ?? []
  const users = useUsers().data ?? []
  const clients = useClients().data ?? []
  const types = useTypes().data ?? []
  const set = (k: keyof Filters) => (e: React.ChangeEvent<HTMLSelectElement>) => onChange({ ...filters, [k]: e.target.value })
  const monthOptions = [...new Set([filters.month, ...months].filter(Boolean))].sort().reverse()

  return (
    <div className="filters">
      {!planView && <label>Month
        <select value={filters.month} onChange={set('month')}>
          <option value="">All months</option>
          {monthOptions.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
      </label>}
      {!planView && <label>Owner
        <select value={filters.owner} onChange={set('owner')}>
          <option value="">Anyone</option>
          {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
      </label>}
      <label>Client
        <select value={filters.client} onChange={set('client')}>
          <option value="">All clients</option>
          {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </label>
      <label>Type
        <select value={filters.type} onChange={set('type')}>
          <option value="">All types</option>
          {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </label>
      <button className="link" onClick={() => onChange({ month: filters.month, owner: '', client: '', type: '' })}>Clear</button>
    </div>
  )
}
