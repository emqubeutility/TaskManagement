import { zValidator } from '@hono/zod-validator'
import { and, eq, gt, ne, or, sql } from 'drizzle-orm'
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { z } from 'zod'
import { dubaiToday } from '../shared/dates'
import { slotFor } from '../shared/plan'
import { requireAuth, type AppEnv } from './auth'
import { getDb } from './db'
import { planItems, taskSteps } from './schema'

// Each person plans their own steps. Everyone can read anyone's plan (the Board shows it); only the owner changes it.
export const planRoutes = new Hono<AppEnv>()
planRoutes.use('*', requireAuth)

// A plan: steps not done yet, plus the ones closed in the last day so a finished plan item stays visible, ticked off.
planRoutes.get('/', zValidator('query', z.object({ user: z.coerce.number().int().optional() })), async (c) => {
  const userId = c.req.valid('query').user ?? c.get('user').id
  const rows = await getDb()
    .select({
      id: planItems.id, taskId: planItems.taskId, stepId: planItems.stepId, scope: planItems.scope, startDate: planItems.startDate, position: planItems.position,
    })
    .from(planItems)
    .innerJoin(taskSteps, eq(taskSteps.id, planItems.stepId))
    .where(and(eq(planItems.userId, userId), or(ne(taskSteps.status, 'done'), gt(taskSteps.closedAt, sql`now() - interval '1 day'`))))
    .orderBy(planItems.startDate, planItems.position, planItems.id)
  return c.json(rows)
})

// Put a step in a column, or take it out of the plan (column null).
planRoutes.put('/', zValidator('json', z.object({
  stepId: z.number().int(),
  column: z.enum(['today', 'tomorrow', 'week', 'next']).nullable(),
})), async (c) => {
  const me = c.get('user')
  const { stepId, column } = c.req.valid('json')
  const db = getDb()
  const [step] = await db.select().from(taskSteps).where(eq(taskSteps.id, stepId))
  if (!step) throw new HTTPException(404, { message: 'That step no longer exists' })
  if (step.userId !== me.id) throw new HTTPException(403, { message: 'You can only plan your own steps' })
  if (column === null) {
    await db.delete(planItems).where(eq(planItems.stepId, stepId))
    return c.json({ ok: true })
  }
  if (step.status === 'done') throw new HTTPException(409, { message: 'This step is already done' })
  const { scope, startDate } = slotFor(column, dubaiToday())
  const [{ next }] = await db.select({ next: sql<number>`coalesce(max(${planItems.position}), 0) + 1` }).from(planItems).where(eq(planItems.userId, me.id))
  await db
    .insert(planItems)
    .values({ userId: me.id, taskId: step.taskId, stepId, scope, startDate, position: next })
    .onConflictDoUpdate({ target: planItems.stepId, set: { scope, startDate, position: next } })
  return c.json({ ok: true })
})
