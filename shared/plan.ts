// The weekly / daily plan. A planned step is stored as a day (Today, Tomorrow) or a week (This week, Next week)
// by date, so the columns move forward by themselves: tomorrow's items are today's after midnight, with no job to run.
export type PlanColumn = 'today' | 'tomorrow' | 'week' | 'next'
export type PlanScope = 'day' | 'week'

export const PLAN_COLUMNS: { key: PlanColumn; label: string; hint: string }[] = [
  { key: 'today', label: 'Today', hint: 'What you will do today' },
  { key: 'tomorrow', label: 'Tomorrow', hint: 'Coming up next' },
  { key: 'week', label: 'This week', hint: 'Sometime before the week ends' },
  { key: 'next', label: 'Next week', hint: 'Lined up for next week' },
]

export function addDays(ymd: string, n: number): string {
  const d = new Date(`${ymd}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/** The Monday of the week a date falls in. */
export function weekStart(ymd: string): string {
  const dow = new Date(`${ymd}T00:00:00Z`).getUTCDay() // 0 = Sunday
  return addDays(ymd, -((dow + 6) % 7))
}

/** What to store when a step is put in a column. */
export function slotFor(column: PlanColumn, today: string): { scope: PlanScope; startDate: string } {
  switch (column) {
    case 'today': return { scope: 'day', startDate: today }
    case 'tomorrow': return { scope: 'day', startDate: addDays(today, 1) }
    case 'week': return { scope: 'week', startDate: weekStart(today) }
    case 'next': return { scope: 'week', startDate: addDays(weekStart(today), 7) }
  }
}

/** Which column a stored plan item shows in today, and whether it is left over from an earlier day or week. */
export function columnOf(scope: PlanScope, startDate: string, today: string): { column: PlanColumn; carried: boolean } {
  if (scope === 'day') {
    if (startDate <= today) return { column: 'today', carried: startDate < today }
    return { column: 'tomorrow', carried: false }
  }
  const thisWeek = weekStart(today)
  if (startDate <= thisWeek) return { column: 'week', carried: startDate < thisWeek }
  return { column: 'next', carried: false }
}
