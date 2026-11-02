// All "today" logic uses Dubai time so "due today" is right for the team.
const dubai = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dubai' })

/** YYYY-MM-DD in Dubai */
export const dubaiToday = (): string => dubai.format(new Date())

/** YYYY-MM in Dubai */
export const dubaiMonth = (): string => dubaiToday().slice(0, 7)

/** Move a YYYY-MM-DD date into another YYYY-MM, clamping the day (31 Jan -> 28 Feb). */
export function shiftDateToMonth(date: string, month: string): string {
  const [y, m] = month.split('-').map(Number)
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate()
  const day = Math.min(Number(date.slice(8, 10)), lastDay)
  return `${month}-${String(day).padStart(2, '0')}`
}
