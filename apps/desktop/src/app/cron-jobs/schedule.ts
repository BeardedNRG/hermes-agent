// Schedule builder helpers for the Cron tab. Copied verbatim from
// web/src/lib/schedule.ts (pure, dependency-free) so the desktop port has no
// cross-package import. Mirrors the backend cron/jobs.py::parse_schedule grammar:
// duration ("30m"), interval ("every 30m"), 5-field cron ("0 9 * * *"), ISO ts.

export type ScheduleMode = 'interval' | 'daily' | 'weekly' | 'monthly' | 'once' | 'custom'

export type IntervalUnit = 'minutes' | 'hours' | 'days'

export const WEEKDAY_INDEXES = [0, 1, 2, 3, 4, 5, 6] as const
export type Weekday = (typeof WEEKDAY_INDEXES)[number]

export interface ScheduleBuilderState {
  mode: ScheduleMode
  intervalValue: number
  intervalUnit: IntervalUnit
  timeOfDay: string
  weekdays: Weekday[]
  dayOfMonth: number
  onceAt: string
  custom: string
}

export const DEFAULT_SCHEDULE_STATE: ScheduleBuilderState = {
  mode: 'interval',
  intervalValue: 30,
  intervalUnit: 'minutes',
  timeOfDay: '09:00',
  weekdays: [1, 2, 3, 4, 5],
  dayOfMonth: 1,
  onceAt: '',
  custom: '',
}

const UNIT_SUFFIX: Record<IntervalUnit, string> = { minutes: 'm', hours: 'h', days: 'd' }

export function buildScheduleString(state: ScheduleBuilderState): string {
  switch (state.mode) {
    case 'interval': {
      const n = Math.floor(state.intervalValue)

      if (!Number.isFinite(n) || n < 1) {return ''}

      return `every ${n}${UNIT_SUFFIX[state.intervalUnit]}`
    }

    case 'daily': {
      const parsed = parseTimeOfDay(state.timeOfDay)

      if (!parsed) {return ''}

      return `${parsed.minute} ${parsed.hour} * * *`
    }

    case 'weekly': {
      const parsed = parseTimeOfDay(state.timeOfDay)

      if (!parsed) {return ''}
      const days = state.weekdays.length === 0 ? '*' : [...state.weekdays].sort((a, b) => a - b).join(',')

      return `${parsed.minute} ${parsed.hour} * * ${days}`
    }

    case 'monthly': {
      const parsed = parseTimeOfDay(state.timeOfDay)

      if (!parsed) {return ''}
      const dom = Math.floor(state.dayOfMonth)

      if (!Number.isFinite(dom) || dom < 1 || dom > 31) {return ''}

      return `${parsed.minute} ${parsed.hour} ${dom} * *`
    }

    case 'once': {
      const v = state.onceAt.trim()

      if (!v) {return ''}

      return v.length === 16 ? `${v}:00` : v
    }

    case 'custom':
      return state.custom.trim()
  }
}

function parseTimeOfDay(value: string): { hour: number; minute: number } | null {
  if (!value || !/^\d{1,2}:\d{2}$/.test(value)) {return null}
  const [hh, mm] = value.split(':')
  const hour = parseInt(hh, 10)
  const minute = parseInt(mm, 10)

  if (!Number.isFinite(hour) || !Number.isFinite(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return null
  }

  return { hour, minute }
}

export interface ScheduleDescribeStrings {
  none: string
  everyMinutes: string
  everyHours: string
  everyDays: string
  dailyAt: string
  weeklyAt: string
  monthlyAt: string
  onceAt: string
  weekdaysShort: [string, string, string, string, string, string, string]
  ordinal: (day: number) => string
}

export interface ScheduleLike {
  kind?: string
  expr?: string
  minutes?: number
  run_at?: string
  display?: string
}

export function describeSchedule(
  schedule: ScheduleLike | undefined,
  fallbackDisplay: string | undefined,
  strings: ScheduleDescribeStrings,
): string {
  if (!schedule) {return fallbackDisplay || strings.none}

  if (schedule.kind === 'interval' && typeof schedule.minutes === 'number') {
    return describeInterval(schedule.minutes, strings)
  }

  if (schedule.kind === 'once' && schedule.run_at) {
    return strings.onceAt.replace('{time}', formatIsoLocal(schedule.run_at, false))
  }

  if (schedule.kind === 'cron' && schedule.expr) {
    const cronDesc = describeCronExpression(schedule.expr, strings)

    if (cronDesc) {return cronDesc}
  }

  if (fallbackDisplay) {
    const cronDesc = describeCronExpression(fallbackDisplay, strings)

    if (cronDesc) {return cronDesc}

    return fallbackDisplay
  }

  if (schedule.display) {return schedule.display}

  if (schedule.expr) {return schedule.expr}

  return strings.none
}

function describeInterval(minutes: number, strings: ScheduleDescribeStrings): string {
  if (minutes <= 0) {return strings.none}

  if (minutes % 1440 === 0) {return strings.everyDays.replace('{n}', String(minutes / 1440))}

  if (minutes % 60 === 0) {return strings.everyHours.replace('{n}', String(minutes / 60))}

  return strings.everyMinutes.replace('{n}', String(minutes))
}

function describeCronExpression(expr: string, strings: ScheduleDescribeStrings): string | null {
  const parts = expr.trim().split(/\s+/)

  if (parts.length !== 5) {return null}
  const [minField, hourField, domField, monField, dowField] = parts

  if (monField !== '*') {return null}

  const isLiteralOrList = (f: string) => /^\d+(,\d+)*$/.test(f) || /^\*$/.test(f)

  if (!isLiteralOrList(minField) || !isLiteralOrList(hourField)) {return null}

  if (!isLiteralOrList(domField) || !isLiteralOrList(dowField)) {return null}

  if (minField === '*' || hourField === '*') {return null}

  const minutes = minField.split(',').map(n => parseInt(n, 10))
  const hours = hourField.split(',').map(n => parseInt(n, 10))

  if (minutes.length !== 1 || hours.length !== 1) {return null}

  if (!Number.isFinite(minutes[0]) || !Number.isFinite(hours[0]) || hours[0] < 0 || hours[0] > 23 || minutes[0] < 0 || minutes[0] > 59) {
    return null
  }

  const time = `${pad2(hours[0])}:${pad2(minutes[0])}`

  const domAll = domField === '*'
  const dowAll = dowField === '*'

  if (domAll && dowAll) {return strings.dailyAt.replace('{time}', time)}

  if (domAll && !dowAll) {
    const days = dowField
      .split(',')
      .map(n => parseInt(n, 10))
      .filter(n => Number.isFinite(n) && n >= 0 && n <= 6) as Weekday[]

    if (days.length === 0) {return null}
    const labels = days.map(d => strings.weekdaysShort[d]).filter(Boolean).join(', ')

    return strings.weeklyAt.replace('{days}', labels).replace('{time}', time)
  }

  if (!domAll && dowAll) {
    const dom = parseInt(domField, 10)

    if (!Number.isFinite(dom) || dom < 1 || dom > 31) {return null}

    return strings.monthlyAt.replace('{day}', strings.ordinal(dom)).replace('{time}', time)
  }

  return null
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}

function formatIsoLocal(iso: string, includeSeconds: boolean): string {
  const d = new Date(iso)

  if (Number.isNaN(d.getTime())) {return iso}
  const yyyy = d.getFullYear()
  const mm = pad2(d.getMonth() + 1)
  const dd = pad2(d.getDate())
  const hh = pad2(d.getHours())
  const mi = pad2(d.getMinutes())

  if (includeSeconds) {return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${pad2(d.getSeconds())}`}

  return `${yyyy}-${mm}-${dd} ${hh}:${mi}`
}

export function englishOrdinal(day: number): string {
  const d = Math.floor(day)

  if (!Number.isFinite(d) || d < 1) {return String(day)}
  const lastTwo = d % 100

  if (lastTwo >= 11 && lastTwo <= 13) {return `${d}th`}

  switch (d % 10) {
    case 1:
      return `${d}st`

    case 2:
      return `${d}nd`

    case 3:
      return `${d}rd`

    default:
      return `${d}th`
  }
}

// English describe-strings bundle (web threaded these through i18n).
export const SCHEDULE_STRINGS: ScheduleDescribeStrings = {
  none: 'No schedule',
  everyMinutes: 'Every {n} min',
  everyHours: 'Every {n}h',
  everyDays: 'Every {n}d',
  dailyAt: 'Daily at {time}',
  weeklyAt: 'Weekly on {days} at {time}',
  monthlyAt: 'Monthly on the {day} at {time}',
  onceAt: 'Once at {time}',
  weekdaysShort: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
  ordinal: englishOrdinal,
}
