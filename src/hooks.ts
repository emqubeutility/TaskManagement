import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from './api'
import { startOfWeek, type PlanSlot } from '../shared/plan'
import type { Feed, Filters, Lookup, PlanItem, Task, Template, TimeEntry, User } from './types'

export const POLL_MS = 20_000
/** How often an open Messages page checks for new messages. */
export const LIVE_MS = 4_000

/** Someone's plan: the steps they put in a week of a month. */
export const usePlan = (userId: number) => useQuery({ queryKey: ['plan', userId], queryFn: () => api<PlanItem[]>('/plan?user=' + userId), refetchInterval: POLL_MS })
/** Move a step to a week of a month (or out of the plan with null). The card moves on screen straight away. */
export function usePlanActions() {
  const qc = useQueryClient()
  const set = useMutation({
    mutationFn: (v: { stepId: number; taskId: number; userId: number; slot: PlanSlot | null; before?: number | null; from?: string; copy?: boolean; dropTime?: boolean }) => api('/plan', { method: 'PUT', body: { stepId: v.stepId, slot: v.slot, before: v.before, from: v.from, copy: v.copy, dropTime: v.dropTime } }),
    onMutate: async (v) => {
      const key = ['plan', v.userId]
      await qc.cancelQueries({ queryKey: key })
      const before = qc.getQueryData<PlanItem[]>(key)
      const target0 = v.slot ? startOfWeek(v.slot) : ''
      // Moving takes the entry on the day it came from (or the step's only one) out; copying keeps it. The day it lands on is replaced.
      const rest = (before ?? []).filter((p) => !(p.stepId === v.stepId && (v.slot === null ? (!v.from || p.startDate === v.from) : p.startDate === target0 || (!v.copy && (v.from ? p.startDate === v.from : true)))))
      const old = (before ?? []).find((p) => p.stepId === v.stepId && (!v.from || p.startDate === v.from))
      // Just before another step: a little under its position, so the card lands there at once.
      const target = v.before != null ? (before ?? []).find((p) => p.stepId === v.before) : undefined
      const position = target ? target.position - 0.5 : Date.now()
      qc.setQueryData<PlanItem[]>(key, v.slot ? [...rest, { id: v.copy ? -Date.now() : old?.id ?? -v.stepId, taskId: v.taskId, stepId: v.stepId, position, scope: v.slot.day === undefined ? 'week' as const : 'day' as const, startDate: startOfWeek(v.slot) }] : rest)
      return { key, before }
    },
    onError: (_e, _v, ctx) => { if (ctx) qc.setQueryData(ctx.key, ctx.before) },
    onSettled: (_d, _e, v) => { qc.invalidateQueries({ queryKey: ['plan'] }); if (v.dropTime) { qc.invalidateQueries({ queryKey: ['timesheet'] }); qc.invalidateQueries({ queryKey: ['tasks'] }) } },
  })
  return { set }
}
/** My timesheet: the last 30 days and anything still open. */
export const useTimesheet = () => useQuery({ queryKey: ['timesheet'], queryFn: () => api<TimeEntry[]>('/timesheet'), refetchInterval: POLL_MS })
/** Timesheet actions refresh the timesheet and the board (starting or completing moves the task between stages). */
export function useTimesheetActions() {
  const qc = useQueryClient()
  const refresh = () => { qc.invalidateQueries({ queryKey: ['timesheet'] }); qc.invalidateQueries({ queryKey: ['tasks'] }) }
  const run = <V,>(fn: (v: V) => Promise<unknown>) => ({ mutationFn: fn, onSettled: refresh })
  return {
    add: useMutation(run((v: { stepId: number; day?: string }) => api('/timesheet', { body: v }))),
    start: useMutation(run((id: number) => api(`/timesheet/${id}/start`, { body: {} }))),
    pause: useMutation(run((v: { id: number; minutes: number; note?: string }) => api(`/timesheet/${v.id}/pause`, { body: { minutes: v.minutes, note: v.note || undefined } }))),
    end: useMutation(run((v: { id: number; complete: boolean; minutes: number; note?: string; comment?: string }) => api(`/timesheet/${v.id}/end`, { body: { complete: v.complete, minutes: v.minutes, note: v.note || undefined, comment: v.comment || undefined } }))),
    move: useMutation(run((v: { id: number; day: string }) => api(`/timesheet/${v.id}/move`, { body: { day: v.day } }))),
    copy: useMutation(run((v: { id: number; day: string }) => api(`/timesheet/${v.id}/copy`, { body: { day: v.day } }))),
    remove: useMutation(run((id: number) => api(`/timesheet/${id}`, { method: 'DELETE' }))),
  }
}
export const useUsers = () => useQuery({ queryKey: ['users'], queryFn: () => api<User[]>('/users'), staleTime: 60_000 })
export const useClients = () => useQuery({ queryKey: ['clients'], queryFn: () => api<Lookup[]>('/clients'), staleTime: 60_000 })
export const useTypes = () => useQuery({ queryKey: ['types'], queryFn: () => api<Lookup[]>('/task-types'), staleTime: 60_000 })
export const useTemplates = () => useQuery({ queryKey: ['templates'], queryFn: () => api<Template[]>('/templates') })
/** The message feed. `task` limits it to one task's thread; `mine` to posts that tag me. */
export function useFeed(opts: { task?: number; mine?: boolean; with?: number } = {}, pollMs = POLL_MS) {
  const p = new URLSearchParams()
  if (opts.task) p.set('task', String(opts.task))
  if (opts.mine) p.set('mine', '1')
  if (opts.with) p.set('with', String(opts.with))
  return useQuery({ queryKey: ['messages', opts], queryFn: () => api<Feed>(`/messages?${p}`), refetchInterval: pollMs })
}
/** Posts that tag me: what the bell and the task cards show until I mark them read. */
export const useInbox = () => useFeed({ mine: true })
export function useMessageActions() {
  const qc = useQueryClient()
  const refresh = () => qc.invalidateQueries({ queryKey: ['messages'] })
  // Marking read shows straight away; the refetch afterwards confirms it with the server.
  const read = useMutation({
    mutationFn: (id: number) => api(`/messages/${id}/read`, { body: {} }),
    onSuccess: (_d, id) => {
      const now = new Date().toISOString()
      qc.setQueriesData<Feed>({ queryKey: ['messages'] }, (feed) => {
        if (!feed) return feed
        const wasUnread = feed.items.some((p) => p.id === id && p.mentions.some((m) => !m.readAt))
        return {
          unread: wasUnread ? Math.max(0, feed.unread - 1) : feed.unread,
          items: feed.items.map((p) => (p.id === id ? { ...p, mentions: p.mentions.map((m) => (m.readAt ? m : { ...m, readAt: now })) } : p)),
        }
      })
      refresh()
    },
  })
  const readMany = useMutation({ mutationFn: (ids: number[]) => api('/messages/read-many', { body: { ids } }), onSuccess: refresh })
  const readAll = useMutation({ mutationFn: () => api('/messages/read-all', { body: {} }), onSuccess: refresh })
  const post = useMutation({
    mutationFn: (v: { body: string; taskId?: number | null; mentionIds: number[]; private?: boolean }) => api('/messages', { body: v }),
    onSuccess: refresh,
  })
  return { read, readMany, readAll, post }
}
/** Minutes logged per person (for one month, or all time). */
export const useTimeTotals = (month: string) =>
  useQuery({ queryKey: ['tasks', 'time', month], queryFn: () => api<{ userId: number; minutes: number; steps: number }[]>(`/tasks/time${month ? `?month=${month}` : ''}`), refetchInterval: POLL_MS })
export const useMonths = () => useQuery({ queryKey: ['months'], queryFn: () => api<string[]>('/tasks/months'), refetchInterval: POLL_MS })

export function useTasks(filters: Filters, scope: 'board' | 'all') {
  const p = new URLSearchParams({ scope })
  if (filters.month) p.set('month', filters.month)
  if (filters.owner) p.set('owner', filters.owner)
  if (filters.client) p.set('client', filters.client)
  if (filters.type) p.set('type', filters.type)
  // The board refreshes itself every 20 seconds; viewing is enough, no websockets.
  return useQuery({ queryKey: ['tasks', scope, filters], queryFn: () => api<Task[]>(`/tasks?${p}`), refetchInterval: POLL_MS })
}

/** Accept / start / close / pass / reorder - all refresh the board afterwards. */
export function useTaskActions() {
  const qc = useQueryClient()
  const refresh = () => qc.invalidateQueries({ queryKey: ['tasks'] })
  const act = useMutation({
    mutationFn: (v: { task: Task; action: 'accept' | 'start' | 'close'; then?: 'start' | 'close'; minutes?: number; comment?: string }) =>
      api(`/tasks/${v.task.id}/${v.action}`, { body: { version: v.task.version, comment: v.comment || undefined, then: v.then, minutes: v.minutes } }),
    onSettled: refresh,
  })
  const pass = useMutation({
    mutationFn: (v: { task: Task; toUserId: number; comment?: string; mode?: 'handover' | 'circle' }) =>
      api(`/tasks/${v.task.id}/pass`, { body: { version: v.task.version, toUserId: v.toUserId, comment: v.comment || undefined, mode: v.mode } }),
    onSettled: refresh,
  })
  const logTime = useMutation({
    mutationFn: (v: { task: Task; minutes: number; note?: string }) => api(`/tasks/${v.task.id}/log`, { body: { minutes: v.minutes, note: v.note || undefined } }),
    onSettled: refresh,
  })
  const reorder = useMutation({
    mutationFn: (taskIds: number[]) => api('/tasks/reorder', { body: { taskIds } }),
    onSettled: refresh,
  })
  return { act, pass, logTime, reorder, refresh }
}
