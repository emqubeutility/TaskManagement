import { lt, sql } from 'drizzle-orm'
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { authRoutes, clientRoutes, templateRoutes, typeRoutes, userRoutes } from './admin'
import { getDb } from './db'
import { sessions, tasks } from './schema'
import { messageRoutes } from './messages'
import { planRoutes } from './plan'
import { monthRoutes, taskRoutes } from './tasks'
import { timesheetRoutes } from './timesheet'

export const app = new Hono().basePath('/api')

app.get('/health', (c) => c.json({ ok: true }))
app.route('/auth', authRoutes)
app.route('/users', userRoutes)
app.route('/clients', clientRoutes)
app.route('/task-types', typeRoutes)
app.route('/templates', templateRoutes)
app.route('/tasks', taskRoutes)
app.route('/months', monthRoutes)
app.route('/messages', messageRoutes)
app.route('/plan', planRoutes)
app.route('/timesheet', timesheetRoutes)

// Daily Vercel Cron: completed tasks (with steps and history, via cascade) go a year after completion.
app.get('/cron/cleanup', async (c) => {
  const secret = process.env.CRON_SECRET
  if (!secret || c.req.header('authorization') !== `Bearer ${secret}`) return c.json({ error: 'Forbidden' }, 403)
  const db = getDb()
  const deleted = await db.delete(tasks).where(lt(tasks.completedAt, sql`now() - interval '1 year'`)).returning({ id: tasks.id })
  await db.delete(sessions).where(lt(sessions.expiresAt, new Date()))
  return c.json({ deletedTasks: deleted.length })
})

app.onError((err, c) => {
  if (err instanceof HTTPException) return c.json({ error: err.message }, err.status)
  console.error(err)
  return c.json({ error: 'Something went wrong on the server' }, 500)
})

app.notFound((c) => c.json({ error: 'Not found' }, 404))
