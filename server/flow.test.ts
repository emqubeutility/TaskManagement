import { describe, expect, it } from 'vitest'
import { canEditFlow, currentStep, transition, type StepLike } from './flow'

const flow = (): StepLike[] => [
  { id: 1, userId: 10, position: 1, status: 'offered' },
  { id: 2, userId: 20, position: 2, status: 'waiting' },
]

describe('transition', () => {
  it('lets the holder accept, then start, then close', () => {
    const steps = flow()
    const accept = transition(steps, 'accept', 10)
    expect(accept).toMatchObject({ ok: true, completed: false })
    steps[0].status = 'todo'
    expect(transition(steps, 'start', 10)).toMatchObject({ ok: true })
    steps[0].status = 'active'
    const close = transition(steps, 'close', 10)
    expect(close).toMatchObject({ ok: true, completed: false })
    if (close.ok) expect(close.updates).toContainEqual({ id: 2, status: 'offered' })
  })

  it('rejects anyone who does not hold the task', () => {
    expect(transition(flow(), 'accept', 20)).toMatchObject({ ok: false, status: 403 })
  })

  it('rejects out-of-order actions', () => {
    expect(transition(flow(), 'close', 10)).toMatchObject({ ok: false, status: 409 })
    expect(transition(flow(), 'start', 10)).toMatchObject({ ok: false, status: 409 })
  })

  it('completes the task when the last step closes', () => {
    const steps: StepLike[] = [
      { id: 1, userId: 10, position: 1, status: 'done' },
      { id: 2, userId: 20, position: 2, status: 'active' },
    ]
    expect(transition(steps, 'close', 20)).toMatchObject({ ok: true, completed: true })
  })

  it('refuses actions on a finished task', () => {
    const steps: StepLike[] = [{ id: 1, userId: 10, position: 1, status: 'done' }]
    expect(transition(steps, 'accept', 10)).toMatchObject({ ok: false, status: 409 })
  })
})

describe('helpers', () => {
  it('finds the current step by position', () => {
    expect(currentStep(flow())?.id).toBe(1)
  })
  it('only owner or admin edits the flow', () => {
    expect(canEditFlow({ id: 1, role: 'member' }, { ownerId: 1 })).toBe(true)
    expect(canEditFlow({ id: 2, role: 'member' }, { ownerId: 1 })).toBe(false)
    expect(canEditFlow({ id: 2, role: 'admin' }, { ownerId: 1 })).toBe(true)
  })
  it('every listed owner can edit the flow', () => {
    const task = { ownerId: 5, ownerIds: [5, 7] }
    expect(canEditFlow({ id: 5, role: 'member' }, task)).toBe(true)
    expect(canEditFlow({ id: 7, role: 'member' }, task)).toBe(true)
    expect(canEditFlow({ id: 6, role: 'member' }, task)).toBe(false)
  })
})
