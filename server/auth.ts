import { createHash, randomBytes } from 'node:crypto'
import { and, eq, gt } from 'drizzle-orm'
import type { Context } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import { createMiddleware } from 'hono/factory'
import { HTTPException } from 'hono/http-exception'
import { getDb } from './db'
import { sessions, users, type User } from './schema'

export type AppEnv = { Variables: { user: User } }

const COOKIE = 'cf_session'
const SESSION_DAYS = 14
const isProd = () => process.env.NODE_ENV === 'production' || !!process.env.VERCEL

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex')

export async function createSession(c: Context, userId: number) {
  const token = randomBytes(32).toString('base64url')
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000)
  await getDb().insert(sessions).values({ id: hashToken(token), userId, expiresAt })
  setCookie(c, COOKIE, token, {
    httpOnly: true,
    secure: isProd(),
    sameSite: 'Lax',
    path: '/',
    expires: expiresAt,
  })
}

export async function destroySession(c: Context) {
  const token = getCookie(c, COOKIE)
  if (token) await getDb().delete(sessions).where(eq(sessions.id, hashToken(token)))
  deleteCookie(c, COOKIE, { path: '/' })
}

const ALLOWED_BEFORE_PASSWORD_CHANGE = ['/auth/me', '/auth/logout', '/auth/change-password']

export const requireAuth = createMiddleware<AppEnv>(async (c, next) => {
  const token = getCookie(c, COOKIE)
  if (!token) throw new HTTPException(401, { message: 'Please sign in' })

  const [row] = await getDb()
    .select({ user: users })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.id, hashToken(token)), gt(sessions.expiresAt, new Date()), eq(users.active, true)))
  if (!row) throw new HTTPException(401, { message: 'Please sign in' })

  if (row.user.mustChangePassword && !ALLOWED_BEFORE_PASSWORD_CHANGE.some((p) => c.req.path.endsWith(p))) {
    throw new HTTPException(403, { message: 'You must change your password first' })
  }
  c.set('user', row.user)
  await next()
})

export const requireAdmin = createMiddleware<AppEnv>(async (c, next) => {
  if (c.get('user').role !== 'admin') throw new HTTPException(403, { message: 'Admin only' })
  await next()
})

export const publicUser = (u: User) => ({
  id: u.id,
  name: u.name,
  email: u.email,
  initials: u.initials,
  colour: u.colour,
  role: u.role,
  active: u.active,
  mustChangePassword: u.mustChangePassword,
})

const COLOURS = ['#2563eb', '#db2777', '#16a34a', '#d97706', '#7c3aed', '#0891b2', '#dc2626', '#4d7c0f', '#9333ea', '#0f766e']
export const pickColour = (seed: number) => COLOURS[seed % COLOURS.length]
export const makeInitials = (name: string) => {
  const words = name.trim().split(/\s+/).filter(Boolean)
  // One-word names get two letters so people like Shibin and Surya do not both show "S".
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return words.slice(0, 2).map((w) => w[0].toUpperCase()).join('') || '?'
}
