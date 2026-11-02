import bcrypt from 'bcryptjs'
import { eq, ne } from 'drizzle-orm'
import * as XLSX from 'xlsx'
import { makeInitials, pickColour } from './auth'
import { getDb } from './db'
import { activity, clients, loginAttempts, sessions, taskSteps, taskTypes, tasks, templateSteps, templates, users } from './schema'

// Replaces ALL data except the admin account with the contents of "WebDigital Tasks.xlsx".
//   npm run db:load-webdigital -- --dry-run   (read the sheet and print what would be created; touches nothing)
//   npm run db:load-webdigital                (wipe everything except the admin, then load the sheet)
//
// Sheet layout: columns A-G = Month, Client, Mgr, Type (task name), Media, Topic, Remarks.
// Columns H-M (row 2 holds the names) = people; the number in a cell is that person's position in the flow.

const FILE = 'WebDigital Tasks.xlsx'
const FIRST_PERSON_COL = 7
const LAST_PERSON_COL = 12
const EMAIL_DOMAIN = 'emqube.com'

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
const titleCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase()

function parseMonth(v: string): string {
  const m = /^([A-Za-z]{3})[- ](\d{2})$/.exec(v.trim())
  const i = m ? MONTHS.indexOf(m[1].toLowerCase()) : -1
  if (!m || i < 0) throw new Error(`Cannot read month "${v}" (expected like Nov-26)`)
  return `20${m[2]}-${String(i + 1).padStart(2, '0')}`
}

interface Row { line: number; month: string; client: string; mgr: string; type: string; title: string; media: string; flow: string[] }

function readSheet() {
  const wb = XLSX.readFile(FILE)
  const grid = XLSX.utils.sheet_to_json<string[]>(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '', raw: false })
  const people: string[] = []
  for (let c = FIRST_PERSON_COL; c <= LAST_PERSON_COL; c++) people.push(String(grid[1][c]).trim())
  if (people.some((p) => !p)) throw new Error(`Expected 6 names in row 2, columns H-M, got ${JSON.stringify(people)}`)

  const rows: Row[] = []
  const problems: string[] = []
  grid.slice(2).forEach((r, i) => {
    const line = i + 3
    if (!r.slice(0, 5).some((x) => String(x).trim())) return // blank row
    const get = (c: number) => String(r[c] ?? '').trim()
    const topic = get(5)
    const ordered = people
      .map((name, k) => ({ name, n: Number(get(FIRST_PERSON_COL + k)) }))
      .filter((p) => get(FIRST_PERSON_COL + people.indexOf(p.name)) !== '')
    if (ordered.some((p) => !Number.isInteger(p.n) || p.n < 1)) problems.push(`Row ${line}: a flow number is not a whole number`)
    const nums = ordered.map((p) => p.n)
    if (new Set(nums).size !== nums.length) problems.push(`Row ${line}: two people share the same flow number`)
    ordered.sort((a, b) => a.n - b.n)
    try {
      rows.push({
        line, month: parseMonth(get(0)), client: get(1), mgr: get(2), type: get(3),
        title: topic ? `${get(3)} – ${topic}` : get(3), media: get(4), flow: ordered.map((p) => p.name),
      })
    } catch (e) { problems.push(`Row ${line}: ${(e as Error).message}`) }
    if (!get(1) || !get(3)) problems.push(`Row ${line}: missing client or task name`)
  })
  if (problems.length) throw new Error(`Problems in the sheet:\n  ${problems.join('\n  ')}`)
  return { people, rows }
}

// "Blog 1" -> "Blog", "Post 7" -> "Post", "G-Ads" stays.
const taskTypeOf = (type: string) => type.replace(/\s*\d+$/, '').trim()

async function main() {
  const { people, rows } = readSheet()
  const adminEmail = (process.env.ADMIN_EMAIL ?? 'mohammed@emqube.com').toLowerCase()
  const adminFirst = (process.env.ADMIN_NAME ?? 'Mohammed').split(/\s+/)[0].toUpperCase()
  const newPeople = people.filter((p) => p.toUpperCase() !== adminFirst)
  const clientNames = [...new Set(rows.map((r) => r.client))]
  const typeNames = [...new Set(rows.map((r) => taskTypeOf(r.type)))]

  console.log(`Sheet "${FILE}": ${rows.length} tasks`)
  console.log(`  Admin kept: ${adminEmail} (sheet column ${adminFirst})`)
  console.log(`  People to create: ${newPeople.map((p) => `${titleCase(p)} <${p.toLowerCase()}@${EMAIL_DOMAIN}>`).join(', ')}`)
  console.log(`  Clients (${clientNames.length}): ${clientNames.join(', ')}`)
  console.log(`  Task types (${typeNames.length}): ${typeNames.join(', ')}`)
  console.log(`  Tasks with no flow numbers: ${rows.filter((r) => !r.flow.length).length}`)
  if (process.argv.includes('--dry-run')) return console.log('Dry run: nothing was changed.')

  const temp = process.env.TEMP_PASSWORD
  if (!temp) throw new Error('TEMP_PASSWORD is not set')
  const hash = await bcrypt.hash(temp, 10)
  const db = getDb()

  await db.transaction(async (tx) => {
    const [admin] = await tx.select().from(users).where(eq(users.email, adminEmail))
    if (!admin) throw new Error(`Admin ${adminEmail} not found. Run npm run db:seed first.`)

    // Wipe everything except the admin (children first).
    await tx.delete(activity)
    await tx.delete(taskSteps)
    await tx.delete(tasks)
    await tx.delete(templateSteps)
    await tx.delete(templates)
    await tx.delete(loginAttempts)
    await tx.delete(sessions).where(ne(sessions.userId, admin.id))
    await tx.delete(users).where(ne(users.id, admin.id))
    await tx.delete(clients)
    await tx.delete(taskTypes)

    // Load
    const created = newPeople.length
      ? await tx.insert(users).values(newPeople.map((p, i) => ({
          name: titleCase(p), email: `${p.toLowerCase()}@${EMAIL_DOMAIN}`, passwordHash: hash,
          initials: makeInitials(titleCase(p)), colour: pickColour(i + 1), role: 'member' as const, mustChangePassword: true,
        }))).returning()
      : []
    const userId = new Map<string, number>([[adminFirst, admin.id], ...created.map((u) => [u.name.toUpperCase(), u.id] as [string, number])])
    const clientId = new Map((await tx.insert(clients).values(clientNames.map((name) => ({ name }))).returning()).map((c) => [c.name, c.id]))
    const typeId = new Map((await tx.insert(taskTypes).values(typeNames.map((name) => ({ name }))).returning()).map((t) => [t.name, t.id]))

    let rank = 0
    for (const r of rows) {
      rank += 10
      const [task] = await tx.insert(tasks).values({
        month: r.month, clientId: clientId.get(r.client)!, typeId: typeId.get(taskTypeOf(r.type))!, title: r.title,
        notes: r.mgr ? `Mgr: ${r.mgr}` : '', media: r.media, ownerId: admin.id, priorityRank: rank,
      }).returning()
      if (r.flow.length) {
        await tx.insert(taskSteps).values(r.flow.map((name, i) => ({
          taskId: task.id, userId: userId.get(name.toUpperCase())!, position: i + 1, status: i === 0 ? ('offered' as const) : ('waiting' as const),
        })))
      }
      await tx.insert(activity).values({ taskId: task.id, userId: admin.id, action: 'imported', detail: `${FILE} row ${r.line}` })
    }
  })
  console.log(`Done. Loaded ${rows.length} tasks. New people sign in with TEMP_PASSWORD and must change it.`)
}

main().then(() => process.exit(0), (e) => { console.error(e instanceof Error ? e.message : e); process.exit(1) })
