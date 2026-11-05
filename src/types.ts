export type StepStatus = 'waiting' | 'offered' | 'todo' | 'active' | 'done'

export interface User {
  id: number
  name: string
  email: string
  initials: string
  colour: string
  role: 'admin' | 'member'
  active: boolean
  mustChangePassword: boolean
}

export interface Lookup { id: number; name: string; active: boolean }

export interface Step {
  id: number
  taskId: number
  userId: number
  position: number
  status: StepStatus
  acceptedAt: string | null
  startedAt: string | null
  closedAt: string | null
  minutes: number | null // time spent, set when the step is closed
}

/** Some time someone logged on a task, part-way through a step or when closing it. */
export interface TimeLog { id: number; taskId: number; stepId: number | null; userId: number; minutes: number; note: string; createdAt: string }

export interface Task {
  id: number
  month: string
  clientId: number | null
  typeId: number | null
  title: string
  description: string
  notes: string
  ownerId: number
  ownerIds: number[]
  dueDate: string | null
  media: string
  priorityRank: number
  version: number
  createdAt: string
  completedAt: string | null
  steps: Step[]
  timeLogs: TimeLog[]
}

/** A step in someone's plan: stored as a day or a week by date; see shared/plan.ts for the column it shows in. */
export interface PlanItem { id: number; taskId: number; stepId: number; scope: 'day' | 'week'; startDate: string; position: number }

export interface Template { id: number; name: string; createdBy: number | null; userIds: number[] }

/** A message in the team feed: visible to everyone, optionally tagged with a task and with people. */
export interface Post {
  id: number
  taskId: number | null
  taskTitle: string | null
  authorId: number
  kind: 'note' | 'handover' | 'close'
  body: string
  /** Sent in a one-to-one chat: only its author and the person it tags see it. */
  isPrivate: boolean
  createdAt: string
  mentions: { userId: number; readAt: string | null }[]
}
export interface Feed { unread: number; items: Post[] }

export interface Filters { month: string; owner: string; client: string; type: string }

export const STATUS_LABEL: Record<StepStatus, string> = {
  waiting: 'Waiting',
  offered: 'New',
  todo: 'To do',
  active: 'In progress',
  done: 'Done',
}

/** Total minutes logged on a task, across everyone who worked on it. */
export const totalMinutes = (t: Task) => (t.timeLogs ?? []).reduce((n, l) => n + l.minutes, 0)

/** Every owner of a task. They can all edit it. */
export const ownersOf = (t: Task) => (t.ownerIds?.length ? t.ownerIds : [t.ownerId])
export const isTaskOwner = (t: Task, userId: number) => ownersOf(t).includes(userId)

export const currentStep = (t: Task): Step | undefined =>
  [...t.steps].sort((a, b) => a.position - b.position).find((s) => s.status !== 'done')
