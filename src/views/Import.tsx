import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import * as XLSX from 'xlsx'
import { api } from '../api'
import { notifySuccess } from '../dialogs'
import { useClients, useMonths, useTypes, useUsers } from '../hooks'
import { MonthPicker } from './Pickers'

// Expected sheet columns (header names, any order, case-insensitive):
// Month | Client | Type | Title | Owner | Due Date | Media | Notes | Flow (people separated by commas, in order)
interface Row {
  line: number
  title: string
  payload?: Record<string, unknown>
  problems: string[]
}

const norm = (v: unknown) => String(v ?? '').trim()
const key = (v: unknown) => norm(v).toLowerCase()

function toMonth(v: unknown): string {
  if (v instanceof Date) return v.toISOString().slice(0, 7)
  const s = norm(v)
  if (/^\d{4}-\d{2}/.test(s)) return s.slice(0, 7)
  const d = new Date(`1 ${s}`)
  return Number.isNaN(d.getTime()) ? '' : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function toDay(v: unknown): string | null {
  if (v instanceof Date) return v.toISOString().slice(0, 10)
  const s = norm(v)
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null
}

export function ImportView() {
  const qc = useQueryClient()
  const users = useUsers().data ?? []
  const clients = useClients().data ?? []
  const types = useTypes().data ?? []
  const months = useMonths().data ?? []
  const [rows, setRows] = useState<Row[]>([])
  const [fileName, setFileName] = useState('')
  const [cloneFrom, setCloneFrom] = useState('')
  const [cloneTo, setCloneTo] = useState('')
  const refresh = () => { qc.invalidateQueries({ queryKey: ['tasks'] }); qc.invalidateQueries({ queryKey: ['months'] }) }

  async function readFile(file: File) {
    setFileName(file.name)
    // The file is read here in the browser; only the finished rows go to the server.
    const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true })
    const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[wb.SheetNames[0]], { defval: '' })
    const parsed = raw.map((r, i): Row => {
      const get = (name: string) => r[Object.keys(r).find((k) => k.trim().toLowerCase() === name) ?? '']
      const problems: string[] = []
      const title = norm(get('title'))
      const month = toMonth(get('month'))
      if (!title) problems.push('Missing title')
      if (!month) problems.push('Month not recognised')

      const clientName = norm(get('client'))
      const client = clients.find((c) => key(c.name) === key(clientName))
      if (clientName && !client) problems.push(`Unknown client "${clientName}"`)
      const typeName = norm(get('type'))
      const type = types.find((t) => key(t.name) === key(typeName))
      if (typeName && !type) problems.push(`Unknown type "${typeName}"`)
      const ownerName = norm(get('owner'))
      const owner = users.find((u) => key(u.name) === key(ownerName) || key(u.email) === key(ownerName))
      if (ownerName && !owner) problems.push(`Unknown owner "${ownerName}"`)

      const flow = norm(get('flow')).split(/[,>→]/).map((s) => s.trim()).filter(Boolean).map((n) => {
        const u = users.find((x) => x.active && (key(x.name) === key(n) || key(x.email) === key(n) || key(x.initials) === key(n)))
        if (!u) problems.push(`Unknown person "${n}" in flow`)
        return u?.id
      })
      const dueRaw = get('due date')
      const dueDate = toDay(dueRaw)
      if (norm(dueRaw) && !dueDate) problems.push('Due date not recognised')

      return {
        line: i + 2, title, problems,
        payload: problems.length ? undefined : {
          month, title, clientId: client?.id ?? null, typeId: type?.id ?? null, ownerId: owner?.id,
          dueDate, media: norm(get('media')), notes: norm(get('notes')), flow: flow as number[],
        },
      }
    })
    setRows(parsed)
  }

  const valid = rows.filter((r) => r.payload)
  const doImport = useMutation({
    mutationFn: () => api<{ created: number }>('/months/import', { body: { rows: valid.map((r) => r.payload) } }),
    onSuccess: (r) => { notifySuccess(`${r.created} tasks created`); setRows([]); setFileName(''); refresh() },
  })
  const clone = useMutation({
    mutationFn: () => api<{ created: number }>('/months/clone', { body: { from: cloneFrom, to: cloneTo } }),
    onSuccess: (r) => { notifySuccess(`${r.created} tasks copied to ${cloneTo} (descriptions left blank)`); refresh() },
  })

  return (
    <div className="two-col">
      <section>
        <h2>Import from Excel</h2>
        <p className="muted">Columns: Month, Client, Type, Title, Owner, Due Date, Media, Notes, Flow (names separated by commas, in order). Nothing is created until you confirm the preview.</p>
        <input type="file" accept=".xlsx,.xls,.csv" onChange={(e) => e.target.files?.[0] && readFile(e.target.files[0])} />
        {rows.length > 0 && (
          <>
            <h3>{fileName}: {valid.length} ready, {rows.length - valid.length} with problems</h3>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Row</th><th>Title</th><th>Status</th></tr></thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.line}>
                      <td>{r.line}</td><td>{r.title}</td>
                      <td className={r.problems.length ? 'bad-text' : ''}>{r.problems.join('; ') || 'OK'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button className="primary" disabled={!valid.length || doImport.isPending} onClick={() => doImport.mutate()}>
              Import {valid.length} tasks{rows.length !== valid.length ? ' (problem rows are skipped)' : ''}
            </button>
          </>
        )}
      </section>
      <section>
        <h2>Clone a month</h2>
        <p className="muted">Copies title, client, type, owner, notes, media, due day and flow. Descriptions start blank and every flow starts again from its first person.</p>
        <form className="card" onSubmit={(e) => { e.preventDefault(); clone.mutate() }}>
          <label>Copy from
            <select value={cloneFrom} onChange={(e) => setCloneFrom(e.target.value)} required>
              <option value="">Choose…</option>
              {months.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </label>
          <label>Into month<MonthPicker value={cloneTo} onChange={setCloneTo} required /></label>
          <button className="primary" disabled={clone.isPending}>Clone</button>
        </form>
      </section>
    </div>
  )
}
