import bcrypt from 'bcryptjs'
import { eq, inArray } from 'drizzle-orm'
import { dubaiMonth, dubaiToday } from '../shared/dates'
import { makeInitials, pickColour } from './auth'
import { getDb } from './db'
import type { StepStatus } from './flow'
import { activity, clients, taskSteps, taskTypes, tasks, templateSteps, templates, users } from './schema'

// Sample data to try the flow end to end. Safe to run twice: it stops if the demo people already exist.
const DEMO_USERS = [
  { name: 'Aisha Khan', email: 'aisha@demo.example.com' }, // designer
  { name: 'Rahul Nair', email: 'rahul@demo.example.com' }, // video editor
  { name: 'Sara Ali', email: 'sara@demo.example.com' }, // copywriter
  { name: 'Omar Hassan', email: 'omar@demo.example.com' }, // social media / posting
]
const DEMO_CLIENTS = ['Al Noor Hotels', 'Gulf Fresh Foods', 'BlueOcean Logistics']

const daysFrom = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
const ago = (days: number) => new Date(Date.now() - days * 86_400_000)

async function main() {
  const db = getDb()
  const temp = process.env.TEMP_PASSWORD
  if (!temp) throw new Error('TEMP_PASSWORD is not set')
  const adminEmail = (process.env.ADMIN_EMAIL ?? 'mohammed@emqube.com').toLowerCase()

  const [admin] = await db.select().from(users).where(eq(users.email, adminEmail))
  if (!admin) throw new Error(`Admin ${adminEmail} not found. Run npm run db:seed first.`)
  const existing = await db.select({ id: users.id }).from(users).where(inArray(users.email, DEMO_USERS.map((u) => u.email)))
  if (existing.length) {
    console.log('Demo data already exists - nothing to do.')
    return
  }

  // People
  const hash = await bcrypt.hash(temp, 10)
  const [{ n }] = [{ n: (await db.select({ id: users.id }).from(users)).length }]
  const created = await db.insert(users).values(
    DEMO_USERS.map((u, i) => ({ ...u, passwordHash: hash, initials: makeInitials(u.name), colour: pickColour(n + i), role: 'member' as const, mustChangePassword: false })),
  ).returning()
  const [aisha, rahul, sara, omar] = created

  // Lists
  await db.insert(clients).values(DEMO_CLIENTS.map((name) => ({ name }))).onConflictDoNothing()
  await db.insert(taskTypes).values(['Reel', 'Post', 'Story', 'Carousel', 'Video', 'Blog'].map((name) => ({ name }))).onConflictDoNothing()
  const cl = Object.fromEntries((await db.select().from(clients)).map((c) => [c.name, c.id]))
  const ty = Object.fromEntries((await db.select().from(taskTypes)).map((t) => [t.name, t.id]))

  // Template
  const [tpl] = await db.insert(templates).values({ name: 'Copy → Design → Post', createdBy: admin.id }).returning()
  await db.insert(templateSteps).values([sara, aisha, omar].map((u, i) => ({ templateId: tpl.id, userId: u.id, position: i + 1 })))

  const month = dubaiMonth()
  const today = dubaiToday()
  let rank = 0

  type Flow = [typeof admin, StepStatus][]
  const add = async (t: {
    title: string; owner: typeof admin; client: string; type: string; due?: string | null; description?: string
    completedAt?: Date | null; flow: Flow; month?: string
  }) => {
    rank += 10
    const [task] = await db.insert(tasks).values({
      month: t.month ?? month, title: t.title, ownerId: t.owner.id, clientId: cl[t.client], typeId: ty[t.type],
      dueDate: t.due ?? null, description: t.description ?? '', priorityRank: rank, completedAt: t.completedAt ?? null,
      createdAt: ago(5),
    }).returning()
    if (t.flow.length) {
      await db.insert(taskSteps).values(t.flow.map(([u, status], i) => ({
        taskId: task.id, userId: u.id, position: i + 1, status,
        acceptedAt: ['todo', 'active', 'done'].includes(status) ? ago(3) : null,
        startedAt: ['active', 'done'].includes(status) ? ago(2) : null,
        closedAt: status === 'done' ? ago(1) : null,
      })))
    }
    await db.insert(activity).values({ taskId: task.id, userId: t.owner.id, action: 'created' })
  }

  // One task per interesting state
  await add({ title: 'Ramadan teaser reel', owner: admin, client: 'Al Noor Hotels', type: 'Reel', due: daysFrom(today, 3),
    description: '15s teaser, warm lighting, end card with booking link.',
    flow: [[sara, 'done'], [rahul, 'active'], [omar, 'waiting']] })
  await add({ title: 'Product launch carousel', owner: admin, client: 'Gulf Fresh Foods', type: 'Carousel', due: daysFrom(today, 5),
    description: '6 slides: problem, product, benefits, offer, testimonial, CTA.',
    flow: [[aisha, 'offered'], [omar, 'waiting']] })
  await add({ title: 'Weekly blog: UAE food trends', owner: sara, client: 'Gulf Fresh Foods', type: 'Blog', due: daysFrom(today, 7),
    flow: [[sara, 'todo'], [omar, 'waiting']] })
  await add({ title: 'Brand story video', owner: admin, client: 'BlueOcean Logistics', type: 'Video', due: daysFrom(today, 10),
    flow: [[sara, 'done'], [rahul, 'done'], [aisha, 'offered'], [omar, 'waiting']] })
  await add({ title: 'Eid greeting post (overdue)', owner: admin, client: 'Al Noor Hotels', type: 'Post', due: daysFrom(today, -2),
    flow: [[aisha, 'active'], [omar, 'waiting']] })
  await add({ title: 'Staff spotlight story (due today)', owner: aisha, client: 'BlueOcean Logistics', type: 'Story', due: today,
    flow: [[omar, 'offered']] })
  await add({ title: 'Office tour reel', owner: admin, client: 'Gulf Fresh Foods', type: 'Reel', due: daysFrom(today, 12),
    flow: [[rahul, 'offered'], [aisha, 'waiting'], [omar, 'waiting']] })
  await add({ title: 'Customer quote post (no flow yet)', owner: admin, client: 'Al Noor Hotels', type: 'Post', due: daysFrom(today, 14), flow: [] })
  await add({ title: 'Valentine’s offer post (done 2 days ago)', owner: admin, client: 'Al Noor Hotels', type: 'Post', due: daysFrom(today, -3),
    completedAt: ago(2), flow: [[sara, 'done'], [aisha, 'done'], [omar, 'done']] })
  await add({ title: 'Winter menu video (done 10 days ago)', owner: admin, client: 'Gulf Fresh Foods', type: 'Video', due: daysFrom(today, -12),
    completedAt: ago(10), flow: [[rahul, 'done'], [omar, 'done']] })

  console.log(`Demo data added for ${month}:`)
  console.log('  People: Aisha Khan, Rahul Nair, Sara Ali, Omar Hassan (password = TEMP_PASSWORD, e.g. aisha@demo.example.com)')
  console.log('  10 tasks in different flow states, 3 clients, 1 template')
}

main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1) })
