import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from './api'
import type { Feed, Filters, Lookup, Task, Template, User } from './types'

export const POLL_MS = 20_000

export const useUsers = () => useQuery({ queryKey: ['users'], queryFn: () => api<User[]>('/users'), staleTime: 60_000 })
export const useClients = () => useQuery({ queryKey: ['clients'], queryFn: () => api<Lookup[]>('/clients'), staleTime: 60_000 })
export const useTypes = () => useQuery({ queryKey: ['types'], queryFn: () => api<Lookup[]>('/task-types'), staleTime: 60_000 })
export const useTemplates = () => useQuery({ queryKey: ['templates'], queryFn: () => api<Template[]>('/templates') })
/** The message feed. `task` limits it to one task's thread; `mine` to posts that tag me. */
export function useFeed(opts: { task?: number; mine?: boolean } = {}) {
  const p = new URLSearchParams()
  if (opts.task) p.set('task', String(opts.task))
  if (opts.mine) p.set('mine', '1')
  return useQuery({ queryKey: ['messages', opts], queryFn: () => api<Feed>(`/messages?${p}`), refetchInterval: POLL_MS })
}
/** Posts that tag me: what the bell and the task cards show until I mark them read. */
export const useInbox = () => useFeed({ mine: true })
export function useMessageActions() {
  const qc = useQueryClient()
  const refresh = () => qc.invalidateQueries({ queryKey: ['messages'] })
  const read = useMutation({ mutationFn: (id: number) => api(`/messages/${id}/read`, { body: {} }), onSuccess: refresh })
  const readAll = useMutation({ mutationFn: () => api('/messages/read-all', { body: {} }), onSuccess: refresh })
  const post = useMutation({
    mutationFn: (v: { body: string; taskId?: number | null; mentionIds: number[] }) => api('/messages', { body: v }),
    onSuccess: refresh,
  })
  return { read, readAll, post }
}
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
    mutationFn: (v: { task: Task; action: 'accept' | 'start' | 'close'; comment?: string }) =>
      api(`/tasks/${v.task.id}/${v.action}`, { body: { version: v.task.version, comment: v.comment || undefined } }),
    onSettled: refresh,
  })
  const pass = useMutation({
    mutationFn: (v: { task: Task; toUserId: number; comment?: string }) =>
      api(`/tasks/${v.task.id}/pass`, { body: { version: v.task.version, toUserId: v.toUserId, comment: v.comment || undefined } }),
    onSettled: refresh,
  })
  const reorder = useMutation({
    mutationFn: (taskIds: number[]) => api('/tasks/reorder', { body: { taskIds } }),
    onSettled: refresh,
  })
  return { act, pass, reorder, refresh }
}
