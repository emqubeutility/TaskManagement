import { zValidator } from '@hono/zod-validator'
import { and, eq, gt, ne, or, sql } from 'drizzle-orm'
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { z } from 'zod'
import { startOfWeek, weekDays, weeksIn } from '../shared/plan'
import { dubaiToday } from '../shared/dates'
import { requireAuth, type AppEnv } from './auth'
import { getDb } from './db'
import { planItems, taskSteps, timeEntries, timeLogs } from './schema'

// Each person plans their own steps by week of the month. Everyone can read anyone's plan (the Board shows it); only the owner changes it.
export const planRoutes = new Hono<AppEnv>()
planRoutes.use('*', requireAuth)

// A plan: steps not done yet, plus the ones closed in the last 45 days so a finished plan item stays visible, ticked off, in its month.
planRoutes.get('/', zValidator('query', z.object({ user: z.coerce.number().int().optional() })), async (c) => {
  const userId = c.req.valid('query').user ?? c.get('user').id
  const rows = await getDb()
    .select({
      id: planItems.id, taskId: planItems.taskId, stepId: planItems.stepId, scope: planItems.scope, startDate: planItems.startDate, position: planItems.position,
    })
    .from(planItems)
    .innerJoin(taskSteps, eq(taskSteps.id, planItems.stepId))
    .where(and(eq(planItems.userId, userId), or(ne(taskSteps.status, 'done'), gt(taskSteps.closedAt, sql`now() - interval '45 days'`))))
    .orderBy(planItems.startDate, planItems.position, planItems.id)
  return c.json(rows)
})

// Put a step in a week of a month, or take it out of the plan (slot null).
planRoutes.put('/', zValidator('json', z.object({
  stepId: z.number().int(),
  slot: z.object({ month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/), week: z.number().int().min(1).max(6), day: z.number().int().min(1).max(31).optional() }).nullable(),
  // Put it just before this step on that day; null puts it last. Left out, a moved step goes last.
  before: z.number().int().nullable().optional(),
  // The day (YYYY-MM-DD) of the plan entry being moved or removed, when the step is planned on more than one day; copy adds a day instead of moving.
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  copy: z.boolean().optional(),
  // Removing a day: also remove the timesheet entry and the time logged on that day.
  dropTime: z.boolean().optional(),
})), async (c) => {
  const me = c.get('user')
  const { stepId, slot, before, from, copy, dropTime } = c.req.valid('json')
  const db = getDb()
  const [step] = await db.select().from(taskSteps).where(eq(taskSteps.id, stepId))
  if (!step) throw new HTTPException(404, { message: 'That step no longer exists' })
  if (step.userId !== me.id) throw new HTTPException(403, { message: 'You can only plan your own steps' })
  // A day that is over is closed: nothing is added to it, moved off it, copied from it or removed from it.
  const today = dubaiToday()
  if (from && from < today) throw new HTTPException(409, { message: 'A past day cannot be changed' })
  if (slot === null) {
    await db.delete(planItems).where(and(eq(planItems.stepId, stepId), from ? eq(planItems.startDate, from) : undefined))
    if (dropTime && from) {
      const onDay = sql`(${timeLogs.createdAt} at time zone 'Asia/Dubai')::date = ${from}::date`
      const [{ total }] = await db.select({ total: sql<number>`coalesce(sum(${timeLogs.minutes}), 0)::int` }).from(timeLogs).where(and(eq(timeLogs.stepId, stepId), eq(timeLogs.userId, me.id), onDay))
      await db.delete(timeLogs).where(and(eq(timeLogs.stepId, stepId), eq(timeLogs.userId, me.id), onDay))
      if (total > 0) await db.update(taskSteps).set({ minutes: sql`greatest(0, coalesce(${taskSteps.minutes}, 0) - ${total})` }).where(eq(taskSteps.id, stepId))
      await db.delete(timeEntries).where(and(eq(timeEntries.stepId, stepId), eq(timeEntries.userId, me.id), eq(timeEntries.day, from)))
    }
    return c.json({ ok: true })
  }
  if (slot.week > weeksIn(slot.month)) throw new HTTPException(400, { message: `${slot.month} has no week ${slot.week}` })
  const range = weekDays(slot)
  if (slot.day !== undefined && (slot.day < range.from || slot.day > range.to)) throw new HTTPException(400, { message: 'That day is not in that week' })
  const startDate = startOfWeek(slot)
  if (slot.day !== undefined && startDate < today) throw new HTTPException(409, { message: 'A past day cannot be changed' })
  const scope = slot.day === undefined ? 'week' : 'day'
  const [{ next }] = await db.select({ next: sql<number>`coalesce(max(${planItems.position}), 0) + 1` }).from(planItems).where(eq(planItems.userId, me.id))
  const rows = await db.select().from(planItems).where(eq(planItems.stepId, stepId))
  const src = from ? rows.find((r) => r.startDate === from) : copy ? undefined : rows[0]
  const dst = rows.find((r) => r.startDate === startDate)
  if (copy) {
    if (!dst) await db.insert(planItems).values({ userId: me.id, taskId: step.taskId, stepId, scope, startDate, position: next })
  } else if (src && dst && src.id !== dst.id) {
    await db.delete(planItems).where(eq(planItems.id, src.id)) // it was already planned on that day: the two become one
  } else if (src && !dst) {
    await db.update(planItems).set({ scope, startDate, position: next }).where(eq(planItems.id, src.id))
  } else if (dst) {
    await db.update(planItems).set({ scope, position: next }).where(eq(planItems.id, dst.id))
  } else {
    await db.insert(planItems).values({ userId: me.id, taskId: step.taskId, stepId, scope, startDate, position: next })
  }
  if (before !== undefined) {
    // Number the day's tasks again with this one in its new place.
    const day = await db.select({ id: planItems.id, stepId: planItems.stepId }).from(planItems)
      .where(and(eq(planItems.userId, me.id), eq(planItems.startDate, startDate))).orderBy(planItems.position, planItems.id)
    const moved = day.find((r) => r.stepId === stepId)
    const others = day.filter((r) => r.stepId !== stepId)
    const at = before === null ? others.length : others.findIndex((r) => r.stepId === before)
    if (moved) others.splice(at < 0 ? others.length : at, 0, moved)
    for (const [i, r] of others.entries()) await db.update(planItems).set({ position: i + 1 }).where(eq(planItems.id, r.id))
  }
  return c.json({ ok: true })
})
