import {
  pgTable, pgEnum, serial, text, integer, boolean, timestamp, date, index, primaryKey, unique,
} from 'drizzle-orm/pg-core'

import { sql } from 'drizzle-orm'

export const roleEnum = pgEnum('role', ['admin', 'member'])
export const stepStatusEnum = pgEnum('step_status', ['waiting', 'offered', 'todo', 'active', 'done'])

const ts = (name: string) => timestamp(name, { withTimezone: true })

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  initials: text('initials').notNull(),
  colour: text('colour').notNull(),
  role: roleEnum('role').notNull().default('member'),
  active: boolean('active').notNull().default(true),
  mustChangePassword: boolean('must_change_password').notNull().default(true),
  createdAt: ts('created_at').notNull().defaultNow(),
})

export const sessions = pgTable('sessions', {
  id: text('id').primaryKey(), // sha256 of the cookie token
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: ts('expires_at').notNull(),
})

export const loginAttempts = pgTable('login_attempts', {
  key: text('key').primaryKey(),
  count: integer('count').notNull().default(0),
  windowStart: ts('window_start').notNull().defaultNow(),
})

export const clients = pgTable('clients', {
  id: serial('id').primaryKey(),
  name: text('name').notNull().unique(),
  active: boolean('active').notNull().default(true),
})

export const taskTypes = pgTable('task_types', {
  id: serial('id').primaryKey(),
  name: text('name').notNull().unique(),
  active: boolean('active').notNull().default(true),
})

export const tasks = pgTable('tasks', {
  id: serial('id').primaryKey(),
  month: text('month').notNull(), // YYYY-MM
  clientId: integer('client_id').references(() => clients.id),
  typeId: integer('type_id').references(() => taskTypes.id),
  title: text('title').notNull(),
  description: text('description').notNull().default(''),
  notes: text('notes').notNull().default(''),
  ownerId: integer('owner_id').notNull().references(() => users.id), // the first owner
  ownerIds: integer('owner_ids').array().notNull().default(sql`'{}'::integer[]`), // every owner; they can all edit the task
  dueDate: date('due_date', { mode: 'string' }),
  media: text('media').notNull().default(''),
  priorityRank: integer('priority_rank').notNull().default(0),
  version: integer('version').notNull().default(1),
  createdAt: ts('created_at').notNull().defaultNow(),
  completedAt: ts('completed_at'),
}, (t) => [index('tasks_month_idx').on(t.month), index('tasks_completed_idx').on(t.completedAt)])

export const taskSteps = pgTable('task_steps', {
  id: serial('id').primaryKey(),
  taskId: integer('task_id').notNull().references(() => tasks.id, { onDelete: 'cascade' }),
  userId: integer('user_id').notNull().references(() => users.id),
  position: integer('position').notNull(),
  status: stepStatusEnum('status').notNull().default('waiting'),
  acceptedAt: ts('accepted_at'),
  startedAt: ts('started_at'),
  closedAt: ts('closed_at'),
  minutes: integer('minutes'), // time spent on this step, set when it is closed
}, (t) => [index('task_steps_task_idx').on(t.taskId)])

// Time logged on a task: part-way through a step, and when it is closed. Kept with the person who logged it,
// so it stays theirs even if the step is later handed to someone else.
export const timeLogs = pgTable('time_logs', {
  id: serial('id').primaryKey(),
  taskId: integer('task_id').notNull().references(() => tasks.id, { onDelete: 'cascade' }),
  stepId: integer('step_id').references(() => taskSteps.id, { onDelete: 'set null' }), // empty if the step was later replaced by a flow edit
  userId: integer('user_id').notNull().references(() => users.id),
  minutes: integer('minutes').notNull(),
  note: text('note').notNull().default(''),
  createdAt: ts('created_at').notNull().defaultNow(),
}, (t) => [index('time_logs_task_idx').on(t.taskId)])

// The weekly / daily plan: a person's step put in Today, Tomorrow, This week or Next week.
// scope 'day' + date = that day; scope 'week' + date = the Monday of that week.
export const planItems = pgTable('plan_items', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  taskId: integer('task_id').notNull().references(() => tasks.id, { onDelete: 'cascade' }),
  stepId: integer('step_id').notNull().references(() => taskSteps.id, { onDelete: 'cascade' }),
  scope: text('scope').notNull(),
  startDate: date('start_date', { mode: 'string' }).notNull(),
  position: integer('position').notNull().default(0),
}, (t) => [index('plan_items_user_idx').on(t.userId), unique('plan_items_step_day_unique').on(t.stepId, t.startDate)]) // a step can be planned on several days, once on each

// The timesheet: a person's own record of working on a task. An entry is ready, running, paused or ended; a running one
// that is still running when its day ends is abandoned. Time itself is kept in time_logs, as before.
export const timeEntries = pgTable('time_entries', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  taskId: integer('task_id').notNull().references(() => tasks.id, { onDelete: 'cascade' }),
  stepId: integer('step_id').notNull().references(() => taskSteps.id, { onDelete: 'cascade' }),
  day: date('day', { mode: 'string' }).notNull(),
  status: text('status').notNull().default('ready'), // ready | running | paused | ended | abandoned
  runStartedAt: ts('run_started_at'),
  minutes: integer('minutes').notNull().default(0),
  createdAt: ts('created_at').notNull().defaultNow(),
}, (t) => [index('time_entries_user_idx').on(t.userId, t.day)])

export const templates = pgTable('templates', {
  id: serial('id').primaryKey(),
  name: text('name').notNull().unique(),
  createdBy: integer('created_by').references(() => users.id),
})

export const templateSteps = pgTable('template_steps', {
  id: serial('id').primaryKey(),
  templateId: integer('template_id').notNull().references(() => templates.id, { onDelete: 'cascade' }),
  userId: integer('user_id').notNull().references(() => users.id),
  position: integer('position').notNull(),
})

export const activity = pgTable('activity', {
  id: serial('id').primaryKey(),
  taskId: integer('task_id').notNull().references(() => tasks.id, { onDelete: 'cascade' }),
  userId: integer('user_id').references(() => users.id),
  action: text('action').notNull(),
  detail: text('detail').notNull().default(''),
  createdAt: ts('created_at').notNull().defaultNow(),
}, (t) => [index('activity_task_idx').on(t.taskId)])

// The team's message feed. Every post is visible to everyone; it may be tagged with a task and with people.
// kind: 'note' (written by hand), 'handover' or 'close' (the optional comment on those actions).
export const posts = pgTable('posts', {
  id: serial('id').primaryKey(),
  taskId: integer('task_id').references(() => tasks.id, { onDelete: 'cascade' }),
  authorId: integer('author_id').notNull().references(() => users.id),
  kind: text('kind').notNull().default('note'),
  body: text('body').notNull(),
  // Written in a one-to-one chat: only the author and the people it tags can see it, never the team thread.
  isPrivate: boolean('is_private').notNull().default(false),
  createdAt: ts('created_at').notNull().defaultNow(),
}, (t) => [index('posts_task_idx').on(t.taskId), index('posts_created_idx').on(t.createdAt)])

// A tagged person. readAt null = they have not marked it read yet; that is what the bell counts.
export const postMentions = pgTable('post_mentions', {
  postId: integer('post_id').notNull().references(() => posts.id, { onDelete: 'cascade' }),
  userId: integer('user_id').notNull().references(() => users.id),
  readAt: ts('read_at'),
}, (t) => [primaryKey({ columns: [t.postId, t.userId] }), index('post_mentions_user_idx').on(t.userId, t.readAt)])

export type User = typeof users.$inferSelect
export type Task = typeof tasks.$inferSelect
export type TaskStep = typeof taskSteps.$inferSelect
