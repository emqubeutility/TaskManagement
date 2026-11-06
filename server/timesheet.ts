import { zValidator } from '@hono/zod-validator'
import { and, asc, desc, eq, gte, inArray, lt, or, sql } from 'drizzle-orm'
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { z } from 'zod'
import { dubaiToday } from '../shared/dates'
import { requireAuth, type AppEnv } from './auth'
import { getDb, type DbLike } from './db'
import { currentStep } from './flow'
import { activity, taskSteps, tasks, timeEntries, timeLogs } from './schema'
import { flowStep } from './tasks'

// Each person keeps their own timesheet: an entry per task they work on, with a timer (Start, Pause, End).
// Starting an entry starts the task (it moves to In progress); pausing logs the time and the task stays In progress;
// ending either completes the person's step or only logs the time. A timer still running when its day ends is abandoned.
export const timesheetRoutes = new Hono<AppEnv>()
timesheetRoutes.use('*', requireAuth)

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const idParam = (c: { req: { param: (n: string) => string } }) => {
  const id = Number(c.req.param('id'))
  if (!Number.isInteger(id)) throw new HTTPException(400, { message: 'Bad id' })
  return id
}
const OPEN = ['ready', 'running', 'paused']

/** A timer still running on a day that is over is abandoned, with no time counted. Done lazily, whenever the sheet is read or changed. */
async function abandonStale(db: DbLike, userId: number) {
  await db.update(timeEntries).set({ status: 'abandoned', runStartedAt: null })
    .where(and(eq(timeEntries.userId, userId), eq(timeEntries.status, 'running'), lt(timeEntries.day, dubaiToday())))
}

async function mine(db: DbLike, userId: number, id: number) {
  await abandonStale(db, userId)
  const [entry] = await db.select().from(timeEntries).where(and(eq(timeEntries.id, id), eq(timeEntries.userId, userId)))
  if (!entry) throw new HTTPException(404, { message: 'That timesheet entry no longer exists' })
  return entry
}

/** The entry's step must still be the one the person holds. */
async function heldStep(db: DbLike, userId: number, stepId: number) {
  const [step] = await db.select().from(taskSteps).where(eq(taskSteps.id, stepId))
  if (!step) throw new HTTPException(404, { message: 'That step no longer exists' })
  const steps = await db.select().from(taskSteps).where(eq(taskSteps.taskId, step.taskId))
  const current = currentStep(steps)
  if (!current || current.id !== step.id || step.userId !== userId) throw new HTTPException(409, { message: 'You no longer hold this task' })
  return step
}

async function addTime(db: DbLike, userId: number, taskId: number, stepId: number, minutes: number, note?: string) {
  if (minutes <= 0) return
  await db.insert(timeLogs).values({ taskId, stepId, userId, minutes, note: note ?? '' })
  await db.update(taskSteps).set({ minutes: sql`coalesce(${taskSteps.minutes}, 0) + ${minutes}` }).where(eq(taskSteps.id, stepId))
  await db.insert(activity).values({ taskId, userId, action: 'logged time', detail: `${minutes} min` })
}

const entryRow = {
  id: timeEntries.id, taskId: timeEntries.taskId, stepId: timeEntries.stepId, day: timeEntries.day,
  status: timeEntries.status, runStartedAt: timeEntries.runStartedAt, minutes: timeEntries.minutes,
}

// The last 30 days, plus anything still open.
timesheetRoutes.get('/', async (c) => {
  const me = c.get('user')
  const db = getDb()
  await abandonStale(db, me.id)
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10)
  const rows = await db.select(entryRow).from(timeEntries)
    .where(and(eq(timeEntries.userId, me.id), or(gte(timeEntries.day, since), inArray(timeEntries.status, OPEN))))
    .orderBy(desc(timeEntries.day), asc(timeEntries.id))
  return c.json(rows)
})

async function addEntry(db: DbLike, userId: number, stepId: number, on: string) {
  const step = await heldStep(db, userId, stepId)
  if (step.status !== 'todo' && step.status !== 'active') throw new HTTPException(409, { message: 'Accept the task first' })
  const [dup] = await db.select({ id: timeEntries.id }).from(timeEntries)
    .where(and(eq(timeEntries.userId, userId), eq(timeEntries.stepId, stepId), eq(timeEntries.day, on), inArray(timeEntries.status, OPEN)))
  if (dup) throw new HTTPException(409, { message: 'This task is already in the timesheet for that day' })
  const [row] = await db.insert(timeEntries).values({ userId, taskId: step.taskId, stepId, day: on }).returning(entryRow)
  return row
}

timesheetRoutes.post('/', zValidator('json', z.object({ stepId: z.number().int(), day: day.optional() })), async (c) => {
  const me = c.get('user')
  const { stepId, day: on = dubaiToday() } = c.req.valid('json')
  if (on < dubaiToday()) throw new HTTPException(400, { message: 'A timesheet entry cannot be added to a past day' })
  const db = getDb()
  await abandonStale(db, me.id)
  return c.json(await addEntry(db, me.id, stepId, on), 201)
})

// Start (or carry on after a pause). One timer at a time. Starting a task that was only accepted moves it to In progress.
timesheetRoutes.post('/:id/start', async (c) => {
  const me = c.get('user')
  const db = getDb()
  const entry = await mine(db, me.id, idParam(c))
  if (entry.status !== 'ready' && entry.status !== 'paused') throw new HTTPException(409, { message: `A ${entry.status} entry cannot be started` })
  const today = dubaiToday()
  if (entry.day > today) throw new HTTPException(409, { message: 'This entry is for a later day' })
  const [running] = await db.select({ id: timeEntries.id }).from(timeEntries).where(and(eq(timeEntries.userId, me.id), eq(timeEntries.status, 'running')))
  if (running) throw new HTTPException(409, { message: 'Another timer is running. Pause or end it first.' })
  const step = await heldStep(db, me.id, entry.stepId)
  if (step.status === 'todo') {
    const [task] = await db.select({ version: tasks.version }).from(tasks).where(eq(tasks.id, entry.taskId))
    await flowStep(entry.taskId, task.version, me.id, ['start'])
  }
  const [row] = await db.update(timeEntries).set({ status: 'running', runStartedAt: new Date(), day: today }).where(eq(timeEntries.id, entry.id)).returning(entryRow)
  return c.json(row)
})

const minutesIn = z.number().int().min(0).max(100_000)

// Pause: the minutes are logged and the task stays In progress.
timesheetRoutes.post('/:id/pause', zValidator('json', z.object({ minutes: minutesIn, note: z.string().trim().max(500).optional() })), async (c) => {
  const me = c.get('user')
  const { minutes, note } = c.req.valid('json')
  const db = getDb()
  const entry = await mine(db, me.id, idParam(c))
  if (entry.status !== 'running') throw new HTTPException(409, { message: 'Only a running timer can be paused' })
  const row = await db.transaction(async (tx) => {
    await addTime(tx, me.id, entry.taskId, entry.stepId, minutes, note)
    const [r] = await tx.update(timeEntries).set({ status: 'paused', runStartedAt: null, minutes: entry.minutes + minutes }).where(eq(timeEntries.id, entry.id)).returning(entryRow)
    return r
  })
  return c.json(row)
})

// End: complete the task (close my step and pass it on) or only log the time (the task stays In progress).
timesheetRoutes.post('/:id/end', zValidator('json', z.object({
  complete: z.boolean(), minutes: minutesIn, note: z.string().trim().max(500).optional(), comment: z.string().trim().max(1000).optional(),
})), async (c) => {
  const me = c.get('user')
  const { complete, minutes, note, comment } = c.req.valid('json')
  const db = getDb()
  const entry = await mine(db, me.id, idParam(c))
  if (entry.status !== 'running' && entry.status !== 'paused') throw new HTTPException(409, { message: 'Start the timer before ending it' })
  const step = await heldStep(db, me.id, entry.stepId)
  if (complete) {
    if (step.status !== 'active') throw new HTTPException(409, { message: 'This task is not in progress' })
    const [task] = await db.select({ version: tasks.version }).from(tasks).where(eq(tasks.id, entry.taskId))
    await flowStep(entry.taskId, task.version, me.id, ['close'], { minutes, note: comment })
  } else {
    await addTime(db, me.id, entry.taskId, entry.stepId, minutes, note)
  }
  const [row] = await db.update(timeEntries).set({ status: 'ended', runStartedAt: null, minutes: entry.minutes + minutes }).where(eq(timeEntries.id, entry.id)).returning(entryRow)
  return c.json(row)
})

// An abandoned entry can be moved to a day, or copied there (the abandoned one stays as a record).
timesheetRoutes.post('/:id/move', zValidator('json', z.object({ day })), async (c) => {
  const me = c.get('user')
  const { day: on } = c.req.valid('json')
  const db = getDb()
  const entry = await mine(db, me.id, idParam(c))
  if (entry.status !== 'abandoned') throw new HTTPException(409, { message: 'Only an abandoned entry can be moved' })
  if (on < dubaiToday()) throw new HTTPException(400, { message: 'Pick today or a later day' })
  await heldStep(db, me.id, entry.stepId)
  const [dup] = await db.select({ id: timeEntries.id }).from(timeEntries)
    .where(and(eq(timeEntries.userId, me.id), eq(timeEntries.stepId, entry.stepId), eq(timeEntries.day, on), inArray(timeEntries.status, OPEN)))
  if (dup) throw new HTTPException(409, { message: 'This task is already in the timesheet for that day' })
  const [row] = await db.update(timeEntries).set({ day: on, status: 'ready', runStartedAt: null, minutes: 0 }).where(eq(timeEntries.id, entry.id)).returning(entryRow)
  return c.json(row)
})

timesheetRoutes.post('/:id/copy', zValidator('json', z.object({ day })), async (c) => {
  const me = c.get('user')
  const { day: on } = c.req.valid('json')
  const db = getDb()
  const entry = await mine(db, me.id, idParam(c))
  if (on < dubaiToday()) throw new HTTPException(400, { message: 'Pick today or a later day' })
  return c.json(await addEntry(db, me.id, entry.stepId, on), 201)
})

// Take back an entry that was never started.
timesheetRoutes.delete('/:id', async (c) => {
  const me = c.get('user')
  const db = getDb()
  const entry = await mine(db, me.id, idParam(c))
  if (entry.status !== 'ready') throw new HTTPException(409, { message: 'Only an entry that was not started can be removed' })
  await db.delete(timeEntries).where(eq(timeEntries.id, entry.id))
  return c.json({ ok: true })
})
