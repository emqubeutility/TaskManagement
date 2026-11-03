import { useSyncExternalStore } from 'react'

// The admin pages (people, clients, task types) use the URL hash as their address, e.g. #/users/12/edit,
// so the browser's Back button and a refreshed page both land where the person was.
const subscribe = (cb: () => void) => {
  window.addEventListener('hashchange', cb)
  return () => window.removeEventListener('hashchange', cb)
}
const read = () => window.location.hash.replace(/^#/, '')

export const useHash = () => useSyncExternalStore(subscribe, read)
export const go = (path: string) => { window.location.hash = path }

export type AdminSection = 'users' | 'clients' | 'types'
export const ADMIN_SECTIONS: AdminSection[] = ['users', 'clients', 'types']

export const sectionOf = (hash: string): AdminSection | undefined =>
  ADMIN_SECTIONS.find((s) => hash === `/${s}` || hash.startsWith(`/${s}/`))

export type AdminRoute = { page: 'list' } | { page: 'new' } | { page: 'detail'; id: number } | { page: 'edit'; id: number }

export function parseAdminRoute(hash: string): AdminRoute {
  const [, , a, b] = hash.split('/')
  if (a === 'new') return { page: 'new' }
  const id = Number(a)
  if (Number.isInteger(id) && id > 0) return b === 'edit' ? { page: 'edit', id } : { page: 'detail', id }
  return { page: 'list' }
}
