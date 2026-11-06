// The monthly plan. A month is cut into calendar weeks, Monday to Sunday. A month that starts mid-week begins with a
// short W1 (the 1st to the first Sunday), and the last week ends on the last day of the month, so a month has 4 to 6
// weeks. A planned step is stored by a date in its week, so it always lands in the right week of its month.
export interface PlanSlot { month: string; week: number; /** A chosen day inside the week; without it the plan is for the whole week. */ day?: number }

const pad = (n: number) => String(n).padStart(2, '0')
const daysIn = (month: string) => {
  const [y, m] = month.split('-').map(Number)
  return new Date(Date.UTC(y, m, 0)).getUTCDate()
}

/** Weekday of the 1st of a month, counting from Monday: 0 is Monday, 6 is Sunday. */
const firstDow = (month: string): number => (new Date(`${month}-01T00:00:00Z`).getUTCDay() + 6) % 7

/** The week (1 up to 6) a day of a month falls in. Weeks run Monday to Sunday. */
export const weekOfDay = (month: string, day: number): number => Math.floor((day - 1 + firstDow(month)) / 7) + 1

/** How many weeks a month has: 4 to 6. */
export const weeksIn = (month: string): number => weekOfDay(month, daysIn(month))

export const weekLabel = (week: number): string => `W${week}`

/** The date that is stored: the chosen day, or the first day of the week. */
export const startOfWeek = ({ month, week, day }: PlanSlot): string => `${month}-${pad(day ?? weekDays({ month, week }).from)}`

/** The month and week a stored date belongs to. */
export const slotOf = (startDate: string): PlanSlot => ({ month: startDate.slice(0, 7), week: weekOfDay(startDate.slice(0, 7), Number(startDate.slice(8, 10))) })

/** The days a week covers, e.g. { from: 6, to: 12 }. */
export const weekDays = ({ month, week }: PlanSlot): { from: number; to: number } => ({ from: Math.max(1, (week - 1) * 7 - firstDow(month) + 1), to: Math.min(daysIn(month), week * 7 - firstDow(month)) })

/** The day a task dropped into a week gets: today when today is in that week, otherwise the week's first day. */
export function defaultDay(slot: PlanSlot, today: string): number {
  const d = weekDays(slot)
  const t = Number(today.slice(8, 10))
  return today.slice(0, 7) === slot.month && t >= d.from && t <= d.to ? t : d.from
}

export const shiftMonth = (month: string, n: number): string => {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1 + n, 1))
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
export const monthShort = (month: string): string => MONTHS[Number(month.slice(5, 7)) - 1]
export const monthName = (month: string): string => `${monthShort(month)} ${month.slice(0, 4)}`
