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
}

export interface Task {
  id: number
  month: string
  clientId: number | null
  typeId: number | null
  title: string
  description: string
  notes: string
  ownerId: number
  dueDate: string | null
  media: string
  priorityRank: number
  version: number
  createdAt: string
  completedAt: string | null
  steps: Step[]
}

export interface Template { id: number; name: string; createdBy: number | null; userIds: number[] }

export interface Filters { month: string; owner: string; client: string; type: string }

export const STATUS_LABEL: Record<StepStatus, string> = {
  waiting: 'Waiting',
  offered: 'New',
  todo: 'To do',
  active: 'In progress',
  done: 'Done',
}

export const currentStep = (t: Task): Step | undefined =>
  [...t.steps].sort((a, b) => a.position - b.position).find((s) => s.status !== 'done')
