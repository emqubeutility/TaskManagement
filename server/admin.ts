import { zValidator } from '@hono/zod-validator'
import bcrypt from 'bcryptjs'
import { and, asc, eq, gt, inArray, sql } from 'drizzle-orm'
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { z } from 'zod'
import { createSession, destroySession, makeInitials, pickColour, publicUser, requireAdmin, requireAuth, type AppEnv } from './auth'
import { getDb } from './db'
import { clients, loginAttempts, sessions, taskTypes, templateSteps, templates, users } from './schema'

const tempPassword = () => {
  const p = process.env.TEMP_PASSWORD
  if (!p) throw new HTTPException(500, { message: 'TEMP_PASSWORD is not configured on the server' })
  return p
}
const hash = (p: string) => bcrypt.hash(p, 10)
const idParam = (id: string) => {
  const n = Number(id)
  if (!Number.isInteger(n)) throw new HTTPException(400, { message: 'Bad id' })
  return n
}

// --- auth ----------------------------------------------------------------------

const MAX_FAILURES = 5
const WINDOW_MINUTES = 15

export const authRoutes = new Hono<AppEnv>()

authRoutes.post('/login', zValidator('json', z.object({ email: z.string().email(), password: z.string().min(1) })), async (c) => {
  const db = getDb()
  const email = c.req.valid('json').email.toLowerCase()
  const { password } = c.req.valid('json')
  const ip = c.req.header('x-forwarded-for')?.split(',')[0].trim() ?? 'local'
  const key = `${email}|${ip}`

  const [attempt] = await db.select().from(loginAttempts).where(
    and(eq(loginAttempts.key, key), gt(loginAttempts.windowStart, new Date(Date.now() - WINDOW_MINUTES * 60_000))),
  )
  if (attempt && attempt.count >= MAX_FAILURES) {
    throw new HTTPException(429, { message: `Too many failed attempts. Try again in ${WINDOW_MINUTES} minutes.` })
  }

  const [user] = await db.select().from(users).where(eq(users.email, email))
  // Compare even for unknown emails so response time does not reveal which accounts exist.
  const ok = await bcrypt.compare(password, user?.passwordHash ?? '$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidi')
  if (!user || !user.active || !ok) {
    await db.execute(sql`
      insert into login_attempts (key, count, window_start) values (${key}, 1, now())
      on conflict (key) do update set
        count = case when login_attempts.window_start > now() - interval '15 minutes' then login_attempts.count + 1 else 1 end,
        window_start = case when login_attempts.window_start > now() - interval '15 minutes' then login_attempts.window_start else now() end`)
    throw new HTTPException(401, { message: 'Wrong email or password' })
  }
  await db.delete(loginAttempts).where(eq(loginAttempts.key, key))
  await createSession(c, user.id)
  return c.json(publicUser(user))
})

authRoutes.post('/logout', requireAuth, async (c) => {
  await destroySession(c)
  return c.json({ ok: true })
})

authRoutes.get('/me', requireAuth, (c) => c.json(publicUser(c.get('user'))))

authRoutes.post(
  '/change-password',
  requireAuth,
  zValidator('json', z.object({ currentPassword: z.string(), newPassword: z.string().min(8).max(200) })),
  async (c) => {
    const user = c.get('user')
    const { currentPassword, newPassword } = c.req.valid('json')
    if (!(await bcrypt.compare(currentPassword, user.passwordHash))) throw new HTTPException(400, { message: 'Current password is wrong' })
    if (newPassword === process.env.TEMP_PASSWORD) throw new HTTPException(400, { message: 'Choose a password different from the temporary one' })
    await getDb().update(users).set({ passwordHash: await hash(newPassword), mustChangePassword: false }).where(eq(users.id, user.id))
    return c.json({ ok: true })
  },
)

// --- users ---------------------------------------------------------------------

export const userRoutes = new Hono<AppEnv>()
userRoutes.use('*', requireAuth)

userRoutes.get('/', async (c) => {
  const rows = await getDb().select().from(users).orderBy(asc(users.name))
  return c.json(rows.map(publicUser))
})

userRoutes.post(
  '/',
  requireAdmin,
  zValidator('json', z.object({ name: z.string().trim().min(1).max(100), email: z.string().email(), role: z.enum(['admin', 'member']).default('member') })),
  async (c) => {
    const db = getDb()
    const { name, email, role } = c.req.valid('json')
    const [dupe] = await db.select({ id: users.id }).from(users).where(eq(users.email, email.toLowerCase()))
    if (dupe) throw new HTTPException(409, { message: 'That email already has an account' })
    const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(users)
    const [created] = await db
      .insert(users)
      .values({
        name,
        email: email.toLowerCase(),
        passwordHash: await hash(tempPassword()),
        initials: makeInitials(name),
        colour: pickColour(n),
        role,
        mustChangePassword: true,
      })
      .returning()
    return c.json(publicUser(created), 201)
  },
)

userRoutes.patch(
  '/:id',
  requireAdmin,
  zValidator('json', z.object({
    name: z.string().trim().min(1).max(100).optional(),
    email: z.string().email().optional(),
    role: z.enum(['admin', 'member']).optional(),
    active: z.boolean().optional(),
    resetPassword: z.boolean().optional(),
  })),
  async (c) => {
    const db = getDb()
    const id = idParam(c.req.param('id'))
    const { resetPassword, ...rest } = c.req.valid('json')
    const me = c.get('user')
    if (id === me.id && (rest.active === false || rest.role === 'member')) {
      throw new HTTPException(400, { message: 'You cannot deactivate or demote your own account' })
    }
    const patch: Partial<typeof users.$inferInsert> = { ...rest }
    if (rest.name) patch.initials = makeInitials(rest.name)
    if (rest.email) {
      patch.email = rest.email.toLowerCase()
      const [dupe] = await db.select({ id: users.id }).from(users).where(eq(users.email, patch.email))
      if (dupe && dupe.id !== id) throw new HTTPException(409, { message: 'That email already has an account' })
    }
    if (resetPassword) {
      patch.passwordHash = await hash(tempPassword())
      patch.mustChangePassword = true
    }
    if (!Object.keys(patch).length) throw new HTTPException(400, { message: 'Nothing to change' })
    const [updated] = await db.update(users).set(patch).where(eq(users.id, id)).returning()
    if (!updated) throw new HTTPException(404, { message: 'User not found' })
    if (rest.active === false || resetPassword) await db.delete(sessions).where(eq(sessions.userId, id))
    return c.json(publicUser(updated))
  },
)

// --- clients and task types (same shape, so one factory) -----------------------

function lookupRoutes(table: typeof clients | typeof taskTypes, label: string) {
  const r = new Hono<AppEnv>()
  r.use('*', requireAuth)
  r.get('/', async (c) => c.json(await getDb().select().from(table).orderBy(asc(table.name))))
  r.post('/', requireAdmin, zValidator('json', z.object({ name: z.string().trim().min(1).max(100) })), async (c) => {
    const { name } = c.req.valid('json')
    const [dupe] = await getDb().select({ id: table.id }).from(table).where(sql`lower(${table.name}) = ${name.toLowerCase()}`)
    if (dupe) throw new HTTPException(409, { message: `${label} "${name}" already exists` })
    const [row] = await getDb().insert(table).values({ name }).returning()
    return c.json(row, 201)
  })
  r.patch('/:id', requireAdmin, zValidator('json', z.object({ name: z.string().trim().min(1).max(100).optional(), active: z.boolean().optional() })), async (c) => {
    const patch = c.req.valid('json')
    if (!Object.keys(patch).length) throw new HTTPException(400, { message: 'Nothing to change' })
    const [row] = await getDb().update(table).set(patch).where(eq(table.id, idParam(c.req.param('id')))).returning()
    if (!row) throw new HTTPException(404, { message: `${label} not found` })
    return c.json(row)
  })
  return r
}
export const clientRoutes = lookupRoutes(clients, 'Client')
export const typeRoutes = lookupRoutes(taskTypes, 'Task type')

// --- templates -----------------------------------------------------------------

export const templateRoutes = new Hono<AppEnv>()
templateRoutes.use('*', requireAuth)

templateRoutes.get('/', async (c) => {
  const db = getDb()
  const list = await db.select().from(templates).orderBy(asc(templates.name))
  const steps = list.length
    ? await db.select().from(templateSteps).where(inArray(templateSteps.templateId, list.map((t) => t.id))).orderBy(asc(templateSteps.position))
    : []
  return c.json(list.map((t) => ({ ...t, userIds: steps.filter((s) => s.templateId === t.id).map((s) => s.userId) })))
})

templateRoutes.post('/', zValidator('json', z.object({ name: z.string().trim().min(1).max(100), userIds: z.array(z.number().int()).min(1).max(30) })), async (c) => {
  const { name, userIds } = c.req.valid('json')
  const me = c.get('user')
  const db = getDb()
  const [dupe] = await db.select({ id: templates.id }).from(templates).where(eq(templates.name, name))
  if (dupe) throw new HTTPException(409, { message: 'A template with that name exists' })
  const id = await db.transaction(async (tx) => {
    const [t] = await tx.insert(templates).values({ name, createdBy: me.id }).returning()
    await tx.insert(templateSteps).values(userIds.map((userId, i) => ({ templateId: t.id, userId, position: i + 1 })))
    return t.id
  })
  return c.json({ id, name, userIds }, 201)
})

templateRoutes.delete('/:id', async (c) => {
  const me = c.get('user')
  const id = idParam(c.req.param('id'))
  const [t] = await getDb().select().from(templates).where(eq(templates.id, id))
  if (!t) throw new HTTPException(404, { message: 'Template not found' })
  if (me.role !== 'admin' && t.createdBy !== me.id) throw new HTTPException(403, { message: 'Only the creator or an admin can delete this' })
  await getDb().delete(templates).where(eq(templates.id, id))
  return c.json({ ok: true })
})
