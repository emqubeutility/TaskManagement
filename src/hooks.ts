import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from './api'
import type { Filters, Lookup, Task, Template, User } from './types'

export const POLL_MS = 20_000

export const useUsers = () => useQuery({ queryKey: ['users'], queryFn: () => api<User[]>('/users'), staleTime: 60_000 })
export const useClients = () => useQuery({ queryKey: ['clients'], queryFn: () => api<Lookup[]>('/clients'), staleTime: 60_000 })
export const useTypes = () => useQuery({ queryKey: ['types'], queryFn: () => api<Lookup[]>('/task-types'), staleTime: 60_000 })
export const useTemplates = () => useQuery({ queryKey: ['templates'], queryFn: () => api<Template[]>('/templates') })
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
    mutationFn: (v: { task: Task; action: 'accept' | 'start' | 'close' }) =>
      api(`/tasks/${v.task.id}/${v.action}`, { body: { version: v.task.version } }),
    onSettled: refresh,
  })
  const pass = useMutation({
    mutationFn: (v: { task: Task; toUserId: number }) =>
      api(`/tasks/${v.task.id}/pass`, { body: { version: v.task.version, toUserId: v.toUserId } }),
    onSettled: refresh,
  })
  const reorder = useMutation({
    mutationFn: (taskIds: number[]) => api('/tasks/reorder', { body: { taskIds } }),
    onSettled: refresh,
  })
  return { act, pass, reorder, refresh }
}
