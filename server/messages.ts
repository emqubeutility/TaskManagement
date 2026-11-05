import { zValidator } from '@hono/zod-validator'
import { and, desc, eq, inArray, isNull, or, sql } from 'drizzle-orm'
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { z } from 'zod'
import { requireAuth, type AppEnv } from './auth'
import { getDb } from './db'
import { postMentions, posts, tasks, users } from './schema'

// The team's message feed. Everyone can read every post; posts can be tagged with a task and with people,
// and a tagged person has it as unread until they mark it read.
export const messageRoutes = new Hono<AppEnv>()
messageRoutes.use('*', requireAuth)

const feedQuery = z.object({
  task: z.coerce.number().int().optional(), // only posts tagged with this task
  mine: z.enum(['1']).optional(), // only posts that tag me
  with: z.coerce.number().int().optional(), // the conversation between me and this person
})

messageRoutes.get('/', zValidator('query', feedQuery), async (c) => {
  const db = getDb()
  const me = c.get('user').id
  const q = c.req.valid('query')

  const mentionedMe = db.select({ id: postMentions.postId }).from(postMentions).where(eq(postMentions.userId, me))
  const mentionedThem = (id: number) => db.select({ id: postMentions.postId }).from(postMentions).where(eq(postMentions.userId, id))
  const rows = await db
    .select({
      id: posts.id, taskId: posts.taskId, taskTitle: tasks.title, authorId: posts.authorId,
      kind: posts.kind, body: posts.body, isPrivate: posts.isPrivate, createdAt: posts.createdAt,
    })
    .from(posts)
    .leftJoin(tasks, eq(tasks.id, posts.taskId))
    .where(and(
      // A private (one-to-one) message is only for its author and the people it tags.
      or(eq(posts.isPrivate, false), eq(posts.authorId, me), inArray(posts.id, mentionedMe)),
      q.task ? eq(posts.taskId, q.task) : undefined,
      q.mine ? inArray(posts.id, mentionedMe) : undefined,
      // A conversation with someone: what I wrote that tags them, and what they wrote that tags me.
      q.with ? or(and(eq(posts.authorId, me), inArray(posts.id, mentionedThem(q.with))), and(eq(posts.authorId, q.with), inArray(posts.id, mentionedMe))) : undefined,
    ))
    .orderBy(desc(posts.createdAt), desc(posts.id))
    .limit(100)
  const tags = rows.length
    ? await db.select().from(postMentions).where(inArray(postMentions.postId, rows.map((r) => r.id)))
    : []
  const [{ unread }] = await db
    .select({ unread: sql<number>`count(*)::int` })
    .from(postMentions)
    .where(and(eq(postMentions.userId, me), isNull(postMentions.readAt)))
  return c.json({
    unread,
    items: rows.map((r) => ({ ...r, mentions: tags.filter((t) => t.postId === r.id).map((t) => ({ userId: t.userId, readAt: t.readAt })) })),
  })
})

messageRoutes.post(
  '/',
  zValidator('json', z.object({
    body: z.string().trim().min(1).max(2000),
    taskId: z.number().int().nullable().optional(),
    mentionIds: z.array(z.number().int()).max(30).default([]),
    private: z.boolean().default(false),
  })),
  async (c) => {
    const db = getDb()
    const me = c.get('user').id
    const { body, taskId, mentionIds, private: isPrivate } = c.req.valid('json')
    const tagged = [...new Set(mentionIds)]
    if (isPrivate && !tagged.length) throw new HTTPException(400, { message: 'A private message needs a person to send it to' })
    if (taskId) {
      const [t] = await db.select({ id: tasks.id }).from(tasks).where(eq(tasks.id, taskId))
      if (!t) throw new HTTPException(404, { message: 'Task not found' })
    }
    if (tagged.length) {
      const found = await db.select({ id: users.id }).from(users).where(and(inArray(users.id, tagged), eq(users.active, true)))
      if (found.length !== tagged.length) throw new HTTPException(400, { message: 'One of the tagged people is unknown or inactive' })
    }
    const id = await db.transaction(async (tx) => {
      const [post] = await tx.insert(posts).values({ taskId: taskId ?? null, authorId: me, kind: 'note', body, isPrivate }).returning({ id: posts.id })
      if (tagged.length) await tx.insert(postMentions).values(tagged.map((userId) => ({ postId: post.id, userId })))
      return post.id
    })
    return c.json({ id }, 201)
  },
)

messageRoutes.post('/read-all', async (c) => {
  await getDb().update(postMentions).set({ readAt: new Date() }).where(and(eq(postMentions.userId, c.get('user').id), isNull(postMentions.readAt)))
  return c.json({ ok: true })
})

messageRoutes.post('/read-many', zValidator('json', z.object({ ids: z.array(z.number().int()).min(1).max(200) })), async (c) => {
  await getDb().update(postMentions).set({ readAt: new Date() })
    .where(and(inArray(postMentions.postId, c.req.valid('json').ids), eq(postMentions.userId, c.get('user').id), isNull(postMentions.readAt)))
  return c.json({ ok: true })
})

messageRoutes.post('/:id/read', async (c) => {
  const id = Number(c.req.param('id'))
  if (!Number.isInteger(id)) throw new HTTPException(400, { message: 'Bad id' })
  await getDb().update(postMentions).set({ readAt: new Date() })
    .where(and(eq(postMentions.postId, id), eq(postMentions.userId, c.get('user').id), isNull(postMentions.readAt)))
  return c.json({ ok: true })
})
