import { useCallback } from 'react'

import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select'

import {
  buildScheduleString,
  type IntervalUnit,
  type ScheduleBuilderState,
  type ScheduleMode,
  type Weekday,
  WEEKDAY_INDEXES,
} from './schedule'

// Human-readable schedule picker for cron create/edit. Ported from
// web/src/components/ScheduleBuilder.tsx with i18n strings inlined to English
// and desktop UI primitives. Fully controlled; parent owns the state and the
// derived schedule string (via buildScheduleString).

const WEEKDAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const nativeFieldClass =
  'flex h-9 w-full rounded-md border border-(--stroke-nous) bg-(--ui-bg-2) px-3 py-2 font-mono text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring'

function Label({ children }: { children: React.ReactNode }) {
  return <span className="text-xs text-(--ui-text-secondary)">{children}</span>
}

interface Props {
  value: ScheduleBuilderState
  onChange: (state: ScheduleBuilderState) => void
}

export function ScheduleBuilder({ value, onChange }: Props) {
  const update = useCallback(
    (patch: Partial<ScheduleBuilderState>) => onChange({ ...value, ...patch }),
    [onChange, value],
  )

  const toggleWeekday = useCallback(
    (day: Weekday) => {
      const present = value.weekdays.includes(day)
      update({ weekdays: present ? value.weekdays.filter(d => d !== day) : [...value.weekdays, day] })
    },
    [update, value.weekdays],
  )

  return (
    <div className="grid gap-3">
      <div className="grid gap-1.5">
        <Label>Schedule</Label>
        <Select onValueChange={v => update({ mode: v as ScheduleMode })} value={value.mode}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="interval">Interval</SelectItem>
            <SelectItem value="daily">Daily</SelectItem>
            <SelectItem value="weekly">Weekly</SelectItem>
            <SelectItem value="monthly">Monthly</SelectItem>
            <SelectItem value="once">Once</SelectItem>
            <SelectItem value="custom">Custom</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {value.mode === 'interval' && (
        <div className="grid grid-cols-[1fr_1.4fr] gap-3">
          <div className="grid gap-1.5">
            <Label>Every</Label>
            <Input
              max={9999}
              min={1}
              onChange={e => {
                const n = parseInt(e.target.value, 10)
                update({ intervalValue: Number.isFinite(n) && n > 0 ? n : 1 })
              }}
              type="number"
              value={String(value.intervalValue)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label>Unit</Label>
            <Select onValueChange={v => update({ intervalUnit: v as IntervalUnit })} value={value.intervalUnit}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="minutes">Minutes</SelectItem>
                <SelectItem value="hours">Hours</SelectItem>
                <SelectItem value="days">Days</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      {value.mode === 'daily' && (
        <div className="grid gap-1.5">
          <Label>Time of day</Label>
          <input className={nativeFieldClass} onChange={e => update({ timeOfDay: e.target.value })} type="time" value={value.timeOfDay} />
        </div>
      )}

      {value.mode === 'weekly' && (
        <>
          <div className="grid gap-1.5">
            <Label>Weekdays</Label>
            <div aria-label="Weekdays" className="flex flex-wrap gap-1.5" role="group">
              {WEEKDAY_INDEXES.map(d => {
                const isOn = value.weekdays.includes(d)

                return (
                  <Button
                    aria-pressed={isOn}
                    className="min-w-10 font-mono text-xs uppercase"
                    key={d}
                    onClick={() => toggleWeekday(d)}
                    size="sm"
                    variant={isOn ? 'default' : 'ghost'}
                  >
                    {WEEKDAYS_SHORT[d]}
                  </Button>
                )
              })}
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label>Time of day</Label>
            <input className={nativeFieldClass} onChange={e => update({ timeOfDay: e.target.value })} type="time" value={value.timeOfDay} />
          </div>
        </>
      )}

      {value.mode === 'monthly' && (
        <div className="grid grid-cols-[1fr_1fr] gap-3">
          <div className="grid gap-1.5">
            <Label>Day of month</Label>
            <Input
              max={31}
              min={1}
              onChange={e => {
                const n = parseInt(e.target.value, 10)
                update({ dayOfMonth: Number.isFinite(n) && n >= 1 && n <= 31 ? n : 1 })
              }}
              type="number"
              value={String(value.dayOfMonth)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label>Time of day</Label>
            <input className={nativeFieldClass} onChange={e => update({ timeOfDay: e.target.value })} type="time" value={value.timeOfDay} />
          </div>
        </div>
      )}

      {value.mode === 'once' && (
        <div className="grid gap-1.5">
          <Label>Run at</Label>
          <input className={nativeFieldClass} onChange={e => update({ onceAt: e.target.value })} type="datetime-local" value={value.onceAt} />
        </div>
      )}

      {value.mode === 'custom' && (
        <div className="grid gap-1.5">
          <Label>Cron expression</Label>
          <Input className="font-mono" onChange={e => update({ custom: e.target.value })} placeholder="0 9 * * 1-5" value={value.custom} />
          <p className="text-xs text-(--ui-text-tertiary)">5-field cron, interval (every 30m), or ISO timestamp.</p>
        </div>
      )}

      <p className="text-xs text-(--ui-text-tertiary)">
        <span className="opacity-70">Preview: </span>
        <span className="font-mono text-(--ui-text-secondary)">{buildScheduleString(value) || '(incomplete)'}</span>
      </p>
    </div>
  )
}
