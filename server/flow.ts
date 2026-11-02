// Pure flow rules - no database access, so they are easy to test.

export type StepStatus = 'waiting' | 'offered' | 'todo' | 'active' | 'done'

export interface StepLike {
  id: number
  userId: number
  position: number
  status: StepStatus
}

export type Action = 'accept' | 'start' | 'close'

const TRANSITIONS: Record<Action, { from: StepStatus; to: StepStatus; stamp: 'acceptedAt' | 'startedAt' | 'closedAt' }> = {
  accept: { from: 'offered', to: 'todo', stamp: 'acceptedAt' },
  start: { from: 'todo', to: 'active', stamp: 'startedAt' },
  close: { from: 'active', to: 'done', stamp: 'closedAt' },
}

export interface StepUpdate {
  id: number
  status: StepStatus
  stamp?: 'acceptedAt' | 'startedAt' | 'closedAt'
}

export type TransitionResult =
  | { ok: true; updates: StepUpdate[]; completed: boolean }
  | { ok: false; status: 403 | 409; error: string }

const sorted = <T extends StepLike>(steps: T[]) => [...steps].sort((a, b) => a.position - b.position)

/** The step the task is currently waiting on: the first one that is not done. */
export function currentStep<T extends StepLike>(steps: T[]): T | undefined {
  return sorted(steps).find((s) => s.status !== 'done')
}

export function transition(steps: StepLike[], action: Action, userId: number): TransitionResult {
  const current = currentStep(steps)
  if (!current) return { ok: false, status: 409, error: 'This task is already complete' }
  if (current.userId !== userId) return { ok: false, status: 403, error: 'Only the person holding this task can do that' }

  const t = TRANSITIONS[action]
  if (current.status !== t.from) {
    return { ok: false, status: 409, error: `You cannot ${action} a task that is ${current.status}` }
  }

  const updates: StepUpdate[] = [{ id: current.id, status: t.to, stamp: t.stamp }]
  let completed = false
  if (action === 'close') {
    const next = sorted(steps).find((s) => s.position > current.position && s.status !== 'done')
    if (next) updates.push({ id: next.id, status: 'offered' })
    else completed = true
  }
  return { ok: true, updates, completed }
}

/** Can this user edit the flow of a task? Owner or admin only. */
export const canEditFlow = (user: { id: number; role: string }, task: { ownerId: number }) =>
  user.role === 'admin' || user.id === task.ownerId
