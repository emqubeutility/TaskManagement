import { zValidator } from '@hono/zod-validator'
import { and, asc, desc, eq, gt, inArray, isNull, max, or, sql, type SQL } from 'drizzle-orm'
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { z } from 'zod'
import { shiftDateToMonth } from '../shared/dates'
import { requireAuth, type AppEnv } from './auth'
import { getDb, type DbLike, type Tx } from './db'
import { canEditFlow, currentStep, transition, type Action } from './flow'
import { activity, taskSteps, tasks, users, type Task, type User } from './schema'

const month = z.string().regex(/^\d{4}-\d{2}$/)
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

export const taskInput = z.object({
  month,
  clientId: z.number().int().nullable().optional(),
  typeId: z.number().int().nullable().optional(),
  title: z.string().trim().min(1).max(300),
  description: z.string().max(10_000).default(''),
  notes: z.string().max(10_000).default(''),
  ownerId: z.number().int().optional(),
  dueDate: day.nullable().optional(),
  media: z.string().max(500).default(''),
  flow: z.array(z.number().int()).max(30).default([]),
})
export type TaskInput = z.infer<typeof taskInput>

const log = (db: DbLike, taskId: number, userId: number | null, action: string, detail = '') =>
  db.insert(activity).values({ taskId, userId, action, detail })

/** Tasks with their flow steps attached. */
export async function loadTasks(db: DbLike, where?: SQL) {
  const rows = await db.select().from(tasks).where(where).orderBy(asc(tasks.priorityRank), asc(tasks.id))
  if (!rows.length) return []
  const steps = await db
    .select()
    .from(taskSteps)
    .where(inArray(taskSteps.taskId, rows.map((r) => r.id)))
    .orderBy(asc(taskSteps.position))
  return rows.map((t) => ({ ...t, steps: steps.filter((s) => s.taskId === t.id) }))
}

async function loadOne(db: DbLike, id: number) {
  const [t] = await loadTasks(db, eq(tasks.id, id))
  if (!t) throw new HTTPException(404, { message: 'Task not found' })
  return t
}

async function assertActiveUsers(db: DbLike, ids: number[]) {
  if (!ids.length) return
  const found = await db.select({ id: users.id }).from(users).where(and(inArray(users.id, ids), eq(users.active, true)))
  if (found.length !== new Set(ids).size) throw new HTTPException(400, { message: 'The flow contains an unknown or inactive person' })
}

export async function createTask(db: DbLike, input: TaskInput, actor: User) {
  const ownerId = actor.role === 'admin' && input.ownerId ? input.ownerId : actor.id
  await assertActiveUsers(db, [...input.flow, ownerId])
  const [{ top }] = await db.select({ top: max(tasks.priorityRank) }).from(tasks)
  const [task] = await db
    .insert(tasks)
    .values({
      month: input.month,
      clientId: input.clientId ?? null,
      typeId: input.typeId ?? null,
      title: input.title,
      description: input.description,
      notes: input.notes,
      ownerId,
      dueDate: input.dueDate ?? null,
      media: input.media,
      priorityRank: (top ?? 0) + 10,
    })
    .returning()
  if (input.flow.length) {
    await db.insert(taskSteps).values(
      input.flow.map((userId, i) => ({ taskId: task.id, userId, position: i + 1, status: i === 0 ? ('offered' as const) : ('waiting' as const) })),
    )
  }
  await log(db, task.id, actor.id, 'created')
  return task
}

/**
 * Runs a change on a task under its version number. If someone else changed the task
 * since the caller loaded it, nothing is written and the caller gets a 409.
 */
async function mutate(taskId: number, version: number, fn: (tx: Tx, task: Task, steps: (typeof taskSteps.$inferSelect)[]) => Promise<void>, patch: Partial<Task> = {}) {
  const db = getDb()
  return db.transaction(async (tx) => {
    const [task] = await tx
      .update(tasks)
      .set({ ...patch, version: sql`${tasks.version} + 1` })
      .where(and(eq(tasks.id, taskId), eq(tasks.version, version)))
      .returning()
    if (!task) {
      const [exists] = await tx.select({ id: tasks.id }).from(tasks).where(eq(tasks.id, taskId))
      if (!exists) throw new HTTPException(404, { message: 'Task not found' })
      throw new HTTPException(409, { message: 'Someone just changed this. The board has been refreshed.' })
    }
    const steps = await tx.select().from(taskSteps).where(eq(taskSteps.taskId, taskId)).orderBy(asc(taskSteps.position))
    await fn(tx, task, steps)
    return loadOne(tx, taskId)
  })
}

const versioned = z.object({ version: z.number().int() })
const idParam = (c: { req: { param: (k: string) => string } }) => {
  const id = Number(c.req.param('id'))
  if (!Number.isInteger(id)) throw new HTTPException(400, { message: 'Bad id' })
  return id
}

export const taskRoutes = new Hono<AppEnv>()
taskRoutes.use('*', requireAuth)

// --- reading -------------------------------------------------------------------

const listQuery = z.object({
  month: month.optional(),
  owner: z.coerce.number().int().optional(),
  client: z.coerce.number().int().optional(),
  type: z.coerce.number().int().optional(),
  scope: z.enum(['board', 'all']).default('all'),
})

taskRoutes.get('/', zValidator('query', listQuery), async (c) => {
  const q = c.req.valid('query')
  const conds: (SQL | undefined)[] = [
    q.month ? eq(tasks.month, q.month) : undefined,
    q.owner ? eq(tasks.ownerId, q.owner) : undefined,
    q.client ? eq(tasks.clientId, q.client) : undefined,
    q.type ? eq(tasks.typeId, q.type) : undefined,
    // The board only shows completed tasks for 7 days.
    q.scope === 'board' ? or(isNull(tasks.completedAt), gt(tasks.completedAt, sql`now() - interval '7 days'`)) : undefined,
  ]
  return c.json(await loadTasks(getDb(), and(...conds)))
})

taskRoutes.get('/months', async (c) => {
  const rows = await getDb().selectDistinct({ month: tasks.month }).from(tasks).orderBy(desc(tasks.month))
  return c.json(rows.map((r) => r.month))
})

taskRoutes.get('/:id/activity', async (c) => {
  const rows = await getDb()
    .select({ id: activity.id, action: activity.action, detail: activity.detail, createdAt: activity.createdAt, userId: activity.userId })
    .from(activity)
    .where(eq(activity.taskId, idParam(c)))
    .orderBy(desc(activity.createdAt), desc(activity.id))
  return c.json(rows)
})

// --- create / edit -------------------------------------------------------------

taskRoutes.post('/', zValidator('json', taskInput), async (c) => {
  const user = c.get('user')
  const input = c.req.valid('json')
  const db = getDb()
  const id = await db.transaction(async (tx) => (await createTask(tx, input, user)).id)
  return c.json(await loadOne(db, id), 201)
})

const patchInput = z.object({
  version: z.number().int(),
  month: month.optional(),
  clientId: z.number().int().nullable().optional(),
  typeId: z.number().int().nullable().optional(),
  title: z.string().trim().min(1).max(300).optional(),
  description: z.string().max(10_000).optional(),
  notes: z.string().max(10_000).optional(),
  dueDate: day.nullable().optional(),
  media: z.string().max(500).optional(),
  ownerId: z.number().int().optional(),
})

taskRoutes.patch('/:id', zValidator('json', patchInput), async (c) => {
  const user = c.get('user')
  const { version, ownerId, ...fields } = c.req.valid('json')
  const id = idParam(c)
  const patch: Partial<Task> = { ...fields }
  if (ownerId !== undefined) {
    if (user.role !== 'admin') throw new HTTPException(403, { message: 'Only an admin can change the owner' })
    patch.ownerId = ownerId
  }
  const updated = await mutate(id, version, async (tx, task, steps) => {
    const involved = task.ownerId === user.id || user.role === 'admin' || steps.some((s) => s.userId === user.id)
    if (!involved) throw new HTTPException(403, { message: 'You are not part of this task' })
    await log(tx, id, user.id, 'edited', Object.keys(fields).join(', '))
  }, patch)
  return c.json(updated)
})

taskRoutes.delete('/:id', async (c) => {
  const user = c.get('user')
  const id = idParam(c)
  const [task] = await getDb().select().from(tasks).where(eq(tasks.id, id))
  if (!task) throw new HTTPException(404, { message: 'Task not found' })
  if (!canEditFlow(user, task)) throw new HTTPException(403, { message: 'Only the owner or an admin can delete a task' })
  await getDb().delete(tasks).where(eq(tasks.id, id))
  return c.json({ ok: true })
})

// --- flow actions --------------------------------------------------------------

for (const action of ['accept', 'start', 'close'] as Action[]) {
  taskRoutes.post(`/:id/${action}`, zValidator('json', versioned), async (c) => {
    const user = c.get('user')
    const id = idParam(c)
    const updated = await mutate(id, c.req.valid('json').version, async (tx, task, steps) => {
      const result = transition(steps, action, user.id)
      if (!result.ok) throw new HTTPException(result.status, { message: result.error })
      const now = new Date()
      for (const u of result.updates) {
        await tx.update(taskSteps).set({ status: u.status, ...(u.stamp ? { [u.stamp]: now } : {}) }).where(eq(taskSteps.id, u.id))
      }
      if (result.completed) await tx.update(tasks).set({ completedAt: now }).where(eq(tasks.id, task.id))
      await log(tx, id, user.id, action)
    })
    return c.json(updated)
  })
}

taskRoutes.post('/:id/pass', zValidator('json', versioned.extend({ toUserId: z.number().int() })), async (c) => {
  const user = c.get('user')
  const { version, toUserId } = c.req.valid('json')
  const id = idParam(c)
  const updated = await mutate(id, version, async (tx, _task, steps) => {
    const current = currentStep(steps)
    if (!current) throw new HTTPException(409, { message: 'This task is already complete' })
    if (current.userId === toUserId) throw new HTTPException(400, { message: 'It is already with that person' })
    await assertActiveUsers(tx, [toUserId])
    await tx
      .update(taskSteps)
      .set({ userId: toUserId, status: 'offered', acceptedAt: null, startedAt: null })
      .where(eq(taskSteps.id, current.id))
    await log(tx, id, user.id, 'passed', `to user ${toUserId}`)
  })
  return c.json(updated)
})

taskRoutes.put('/:id/flow', zValidator('json', versioned.extend({ userIds: z.array(z.number().int()).max(30) })), async (c) => {
  const user = c.get('user')
  const { version, userIds } = c.req.valid('json')
  const id = idParam(c)
  const updated = await mutate(id, version, async (tx, task, steps) => {
    if (!canEditFlow(user, task)) throw new HTTPException(403, { message: 'Only the owner or an admin can edit the flow' })
    await assertActiveUsers(tx, userIds)

    const done = steps.filter((s) => s.status === 'done')
    const oldCurrent = currentStep(steps)
    await tx.delete(taskSteps).where(and(eq(taskSteps.taskId, id), sql`${taskSteps.status} <> 'done'`))

    const base = done.length ? Math.max(...done.map((s) => s.position)) : 0
    if (userIds.length) {
      await tx.insert(taskSteps).values(
        userIds.map((userId, i) => {
          // Keep progress if the same person is still first in line.
          const keep = i === 0 && oldCurrent?.userId === userId
          return {
            taskId: id,
            userId,
            position: base + i + 1,
            status: i === 0 ? (keep ? oldCurrent!.status : ('offered' as const)) : ('waiting' as const),
            acceptedAt: keep ? oldCurrent!.acceptedAt : null,
            startedAt: keep ? oldCurrent!.startedAt : null,
          }
        }),
      )
    }
    const complete = done.length > 0 && userIds.length === 0
    await tx.update(tasks).set({ completedAt: complete ? new Date() : null }).where(eq(tasks.id, id))
    await log(tx, id, user.id, 'flow edited')
  })
  return c.json(updated)
})

// --- priority ------------------------------------------------------------------

taskRoutes.post('/reorder', zValidator('json', z.object({ taskIds: z.array(z.number().int()).min(1).max(500) })), async (c) => {
  const user = c.get('user')
  const { taskIds } = c.req.valid('json')
  const db = getDb()
  await db.transaction(async (tx) => {
    const rows = await loadTasks(tx, inArray(tasks.id, taskIds))
    if (rows.length !== taskIds.length) throw new HTTPException(404, { message: 'Task not found' })
    for (const t of rows) {
      const holder = currentStep(t.steps)?.userId
      if (user.role !== 'admin' && t.ownerId !== user.id && holder !== user.id) {
        throw new HTTPException(403, { message: 'You can only reorder your own tasks' })
      }
    }
    // Hand the existing ranks back out in the new order so other columns are untouched.
    const ranks = rows.map((t) => t.priorityRank).sort((a, b) => a - b)
    const distinct = new Set(ranks).size === ranks.length
    const useRanks = distinct ? ranks : taskIds.map((_, i) => (i + 1) * 10)
    for (const [i, id] of taskIds.entries()) {
      await tx.update(tasks).set({ priorityRank: useRanks[i] }).where(eq(tasks.id, id))
    }
  })
  return c.json({ ok: true })
})

// --- clone a month -------------------------------------------------------------

export const monthRoutes = new Hono<AppEnv>()
monthRoutes.use('*', requireAuth)

monthRoutes.post('/clone', zValidator('json', z.object({ from: month, to: month })), async (c) => {
  const user = c.get('user')
  const { from, to } = c.req.valid('json')
  if (from === to) throw new HTTPException(400, { message: 'Pick two different months' })
  const db = getDb()
  const created = await db.transaction(async (tx) => {
    const [existing] = await tx.select({ id: tasks.id }).from(tasks).where(eq(tasks.month, to)).limit(1)
    if (existing) throw new HTTPException(409, { message: `${to} already has tasks` })
    const source = await loadTasks(tx, eq(tasks.month, from))
    for (const t of source) {
      await createTask(tx, {
        month: to,
        clientId: t.clientId,
        typeId: t.typeId,
        title: t.title,
        description: '', // a cloned month starts afresh
        notes: t.notes,
        ownerId: t.ownerId,
        dueDate: t.dueDate ? shiftDateToMonth(t.dueDate, to) : null,
        media: t.media,
        flow: t.steps.map((s) => s.userId),
      }, user)
    }
    return source.length
  })
  return c.json({ created })
})

monthRoutes.post('/import', zValidator('json', z.object({ rows: z.array(taskInput).min(1).max(1000) })), async (c) => {
  const user = c.get('user')
  const { rows } = c.req.valid('json')
  const created = await getDb().transaction(async (tx) => {
    for (const row of rows) await createTask(tx, row, user)
    return rows.length
  })
  return c.json({ created }, 201)
})
