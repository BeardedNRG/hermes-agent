import { useCallback, useEffect, useMemo, useState } from 'react'

import { Button } from '../../components/ui/button'
import { Codicon } from '../../components/ui/codicon'
import { Loader } from '../../components/ui/loader'
import { SegmentedControl } from '../../components/ui/segmented-control'

// ─── Types (mirrors web/src/lib/api.ts) ────────────────────────────────────

interface AnalyticsDailyEntry {
  day: string
  input_tokens: number
  output_tokens: number
  sessions: number
}

interface AnalyticsModelEntry {
  model: string
  input_tokens: number
  output_tokens: number
  sessions: number
}

interface AnalyticsSkillEntry {
  skill: string
  view_count: number
  manage_count: number
  total_count: number
  last_used_at: number | null
}

interface AnalyticsResponse {
  daily: AnalyticsDailyEntry[]
  by_model: AnalyticsModelEntry[]
  totals: {
    total_input: number
    total_output: number
    total_sessions: number
    total_api_calls: number
  }
  skills: {
    top_skills: AnalyticsSkillEntry[]
  }
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function fmt(n: number): string {
  if (n >= 1_000_000) {return `${(n / 1_000_000).toFixed(1)}M`}

  if (n >= 1_000) {return `${(n / 1_000).toFixed(1)}K`}

  return String(n)
}

function fmtDate(day: string): string {
  try {
    const d = new Date(day + 'T00:00:00')

    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  } catch {
    return day
  }
}

function timeAgo(epochMs: number): string {
  const diffMs = Date.now() - epochMs * 1000
  const mins = Math.floor(diffMs / 60_000)

  if (mins < 60) {return `${mins}m ago`}
  const hrs = Math.floor(mins / 60)

  if (hrs < 24) {return `${hrs}h ago`}

  return `${Math.floor(hrs / 24)}d ago`
}

// ─── Sorting ───────────────────────────────────────────────────────────────

function useTableSort<T>(data: T[], defaultKey: keyof T & string, defaultDir: 'asc' | 'desc' = 'desc') {
  const [sortKey, setSortKey] = useState<string>(defaultKey)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>(defaultDir)

  const sorted = useMemo(() => {
    return [...data].sort((a, b) => {
      const av = a[sortKey as keyof T]
      const bv = b[sortKey as keyof T]

      if (av === null || av === undefined) {return 1}

      if (bv === null || bv === undefined) {return -1}

      if (av === bv) {return 0}
      const cmp = av > bv ? 1 : -1

      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [data, sortKey, sortDir])

  const toggle = useCallback(
    (key: string) => {
      if (key === sortKey) {setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))}
      else { setSortKey(key); setSortDir('desc') }
    },
    [sortKey],
  )

  return { sorted, sortKey, sortDir, toggle }
}

function SortTh({
  label, col, sortKey, sortDir, toggle, className,
}: {
  label: string; col: string; sortKey: string; sortDir: 'asc' | 'desc'
  toggle: (k: string) => void; className?: string
}) {
  const active = col === sortKey

  return (
    <th className={`cursor-pointer select-none ${className ?? ''}`} onClick={() => toggle(col)}>
      <span className="inline-flex items-center gap-1 px-1 -mx-1 py-0.5 rounded hover:bg-(--ui-control-hover-background) transition-colors">
        {label}
        <Codicon
          className="size-3 opacity-50"
          name={active ? (sortDir === 'asc' ? 'arrow-up' : 'arrow-down') : 'arrow-swap'}
        />
      </span>
    </th>
  )
}

// ─── Card shell ────────────────────────────────────────────────────────────

function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-lg border border-(--stroke-nous) bg-(--ui-bg-1) ${className ?? ''}`}>
      {children}
    </div>
  )
}

function CardHead({ icon, title }: { icon: string; title: string }) {
  return (
    <div className="flex items-center gap-2 border-b border-(--stroke-nous) px-4 py-3">
      <Codicon className="size-4 text-(--ui-text-tertiary)" name={icon} />
      <span className="text-xs font-semibold uppercase tracking-wider text-(--ui-text-secondary)">{title}</span>
    </div>
  )
}

// ─── Bar chart ─────────────────────────────────────────────────────────────

const H = 120

function TokenBarChart({ daily }: { daily: AnalyticsDailyEntry[] }) {
  if (daily.length === 0) {return null}
  const max = Math.max(...daily.map(d => d.input_tokens + d.output_tokens), 1)

  return (
    <Card>
      <CardHead icon="graph-line" title="Daily Token Usage" />
      <div className="flex items-center gap-4 px-4 pt-3 text-xs text-(--ui-text-tertiary)">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-sm" style={{ backgroundColor: 'var(--series-input-token, #6366f1)' }} />
          Input
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-sm" style={{ backgroundColor: 'var(--series-output-token, #22d3ee)' }} />
          Output
        </span>
      </div>
      <div className="px-4 pb-4 pt-3">
        <div className="flex items-end gap-[2px]" style={{ height: H }}>
          {daily.map(d => {
            const total = d.input_tokens + d.output_tokens
            const inputH = Math.round((d.input_tokens / max) * H)
            const outputH = Math.round((d.output_tokens / max) * H)

            return (
              <div className="group relative flex min-w-0 flex-1 flex-col justify-end" key={d.day} style={{ height: H }}>
                <div className="absolute bottom-full left-1/2 z-10 mb-2 hidden -translate-x-1/2 pointer-events-none group-hover:block">
                  <div className="rounded border border-(--stroke-nous) bg-(--ui-bg-2) px-2.5 py-1.5 text-xs shadow-nous whitespace-nowrap">
                    <div className="font-medium">{fmtDate(d.day)}</div>
                    <div className="text-(--ui-text-secondary)">In: {fmt(d.input_tokens)}</div>
                    <div className="text-(--ui-text-secondary)">Out: {fmt(d.output_tokens)}</div>
                    <div>Total: {fmt(total)}</div>
                  </div>
                </div>
                <div className="w-full" style={{ backgroundColor: 'color-mix(in srgb, var(--series-input-token, #6366f1) 70%, transparent)', height: Math.max(inputH, total > 0 ? 1 : 0) }} />
                <div className="w-full" style={{ backgroundColor: 'color-mix(in srgb, var(--series-output-token, #22d3ee) 70%, transparent)', height: Math.max(outputH, d.output_tokens > 0 ? 1 : 0) }} />
              </div>
            )
          })}
        </div>
        <div className="mt-2 flex justify-between text-xs text-(--ui-text-tertiary)">
          <span>{daily.length > 0 ? fmtDate(daily[0].day) : ''}</span>
          {daily.length > 2 && <span>{fmtDate(daily[Math.floor(daily.length / 2)].day)}</span>}
          <span>{daily.length > 1 ? fmtDate(daily[daily.length - 1].day) : ''}</span>
        </div>
      </div>
    </Card>
  )
}

// ─── Tables ────────────────────────────────────────────────────────────────

const tbl = 'w-full text-xs'
const thead = 'border-b border-(--stroke-nous) text-(--ui-text-tertiary)'
const trow = 'border-b border-(--stroke-nous)/50 hover:bg-(--ui-control-hover-background)/30 transition-colors'

function DailyTable({ daily }: { daily: AnalyticsDailyEntry[] }) {
  const { sorted, sortKey, sortDir, toggle } = useTableSort(daily, 'day', 'desc')

  if (daily.length === 0) {return null}
  const sh = { sortKey, sortDir, toggle }

  return (
    <Card>
      <CardHead icon="pulse" title="Daily Breakdown" />
      <div className="overflow-x-auto px-4 py-3">
        <table className={tbl}>
          <thead><tr className={thead}>
            <SortTh className="text-left py-1.5 pr-4 font-medium" col="day" label="Date" {...sh} />
            <SortTh className="text-right py-1.5 px-4 font-medium" col="sessions" label="Sessions" {...sh} />
            <SortTh className="text-right py-1.5 px-4 font-medium" col="input_tokens" label="Input" {...sh} />
            <SortTh className="text-right py-1.5 pl-4 font-medium" col="output_tokens" label="Output" {...sh} />
          </tr></thead>
          <tbody>
            {sorted.map(d => (
              <tr className={trow} key={d.day}>
                <td className="py-1.5 pr-4 font-medium">{fmtDate(d.day)}</td>
                <td className="text-right py-1.5 px-4 text-(--ui-text-secondary)">{d.sessions}</td>
                <td className="text-right py-1.5 px-4" style={{ color: 'var(--series-input-token, #6366f1)' }}>{fmt(d.input_tokens)}</td>
                <td className="text-right py-1.5 pl-4" style={{ color: 'var(--series-output-token, #22d3ee)' }}>{fmt(d.output_tokens)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

function ModelTable({ models }: { models: AnalyticsModelEntry[] }) {
  const { sorted, sortKey, sortDir, toggle } = useTableSort(models, 'input_tokens', 'desc')

  if (models.length === 0) {return null}
  const sh = { sortKey, sortDir, toggle }

  return (
    <Card>
      <CardHead icon="chip" title="Per-Model Breakdown" />
      <div className="overflow-x-auto px-4 py-3">
        <table className={tbl}>
          <thead><tr className={thead}>
            <SortTh className="text-left py-1.5 pr-4 font-medium" col="model" label="Model" {...sh} />
            <SortTh className="text-right py-1.5 px-4 font-medium" col="sessions" label="Sessions" {...sh} />
            <SortTh className="text-right py-1.5 pl-4 font-medium" col="input_tokens" label="Tokens" {...sh} />
          </tr></thead>
          <tbody>
            {sorted.map(m => (
              <tr className={trow} key={m.model}>
                <td className="py-1.5 pr-4 font-mono">{m.model}</td>
                <td className="text-right py-1.5 px-4 text-(--ui-text-secondary)">{m.sessions}</td>
                <td className="text-right py-1.5 pl-4">
                  <span style={{ color: 'var(--series-input-token, #6366f1)' }}>{fmt(m.input_tokens)}</span>
                  {' / '}
                  <span style={{ color: 'var(--series-output-token, #22d3ee)' }}>{fmt(m.output_tokens)}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

function SkillTable({ skills }: { skills: AnalyticsSkillEntry[] }) {
  const { sorted, sortKey, sortDir, toggle } = useTableSort(skills, 'total_count', 'desc')

  if (skills.length === 0) {return null}
  const sh = { sortKey, sortDir, toggle }

  return (
    <Card>
      <CardHead icon="lightbulb" title="Top Skills" />
      <div className="overflow-x-auto px-4 py-3">
        <table className={tbl}>
          <thead><tr className={thead}>
            <SortTh className="text-left py-1.5 pr-4 font-medium" col="skill" label="Skill" {...sh} />
            <SortTh className="text-right py-1.5 px-4 font-medium" col="view_count" label="Loads" {...sh} />
            <SortTh className="text-right py-1.5 px-4 font-medium" col="manage_count" label="Edits" {...sh} />
            <SortTh className="text-right py-1.5 px-4 font-medium" col="total_count" label="Total" {...sh} />
            <SortTh className="text-right py-1.5 pl-4 font-medium" col="last_used_at" label="Last Used" {...sh} />
          </tr></thead>
          <tbody>
            {sorted.map(s => (
              <tr className={trow} key={s.skill}>
                <td className="py-1.5 pr-4 font-mono">{s.skill}</td>
                <td className="text-right py-1.5 px-4 text-(--ui-text-secondary)">{s.view_count}</td>
                <td className="text-right py-1.5 px-4 text-(--ui-text-secondary)">{s.manage_count}</td>
                <td className="text-right py-1.5 px-4">{s.total_count}</td>
                <td className="text-right py-1.5 pl-4 text-(--ui-text-tertiary)">
                  {s.last_used_at ? timeAgo(s.last_used_at) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

// ─── Main view ─────────────────────────────────────────────────────────────

const PERIODS = [
  { label: '7d', days: 7 },
  { label: '30d', days: 30 },
  { label: '90d', days: 90 },
] as const

export function AnalyticsView() {
  const [days, setDays] = useState(30)
  const [data, setData] = useState<AnalyticsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showTokens, setShowTokens] = useState<boolean | null>(null)

  useEffect(() => {
    window.hermesDesktop!
      .api<{ dashboard?: { show_token_analytics?: boolean } }>({ path: '/api/config' })
      .then(cfg => setShowTokens(cfg?.dashboard?.show_token_analytics === true))
      .catch(() => setShowTokens(false))
  }, [])

  const load = useCallback(() => {
    if (!showTokens) {return}
    setLoading(true)
    setError(null)
    window.hermesDesktop!
      .api<AnalyticsResponse>({ path: `/api/analytics/usage?days=${days}` })
      .then(setData)
      .catch(err => setError(String(err)))
      .finally(() => setLoading(false))
  }, [days, showTokens])

  useEffect(() => { load() }, [load])

  return (
    <div className="flex h-full min-w-0 flex-col gap-4 overflow-y-auto p-4 pt-(--titlebar-height)">

      {/* Header row */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 text-xs text-(--ui-text-tertiary)">
          <Codicon name="graph-line" />
          <span className="font-semibold uppercase tracking-wider">Analytics</span>
        </div>
        <div className="flex items-center gap-1.5">
          <SegmentedControl
            onChange={v => setDays(Number(v))}
            options={PERIODS.map(p => ({ id: String(p.days), label: p.label }))}
            value={String(days)}
          />
          <Button
            aria-label="Refresh"
            disabled={loading || showTokens === false}
            onClick={load}
            size="icon"
            variant="ghost"
          >
            {loading ? <Loader /> : <Codicon name="refresh" />}
          </Button>
        </div>
      </div>

      {/* Token analytics hidden warning */}
      {showTokens === false && (
        <Card>
          <div className="px-6 py-10 text-sm text-(--ui-text-secondary)">
            <p className="mb-2 font-semibold text-foreground">Token analytics hidden</p>
            <p className="mb-2">
              Local token counts exclude auxiliary calls, retries, and cache writes — they diverge from provider billing.
              Check your provider dashboard (OpenRouter, Anthropic, etc.) for actual usage.
            </p>
            <p>
              To re-enable: set <code className="font-mono text-xs">dashboard.show_token_analytics: true</code> in Config.
            </p>
          </div>
        </Card>
      )}

      {/* Loading spinner (initial) */}
      {showTokens && loading && !data && (
        <div className="flex items-center justify-center py-20">
          <Loader className="text-2xl" />
        </div>
      )}

      {/* Error */}
      {showTokens && error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive text-center">
          {error}
        </div>
      )}

      {/* Data */}
      {showTokens && data && (
        <>
          {/* Totals + chart row */}
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <div className="grid grid-cols-2 divide-x divide-(--stroke-nous) divide-y divide-(--stroke-nous)">
                {[
                  { label: 'Total Tokens', value: fmt(data.totals.total_input + data.totals.total_output) },
                  { label: 'Input', value: fmt(data.totals.total_input) },
                  { label: 'Output', value: fmt(data.totals.total_output) },
                  { label: 'Sessions', value: String(data.totals.total_sessions) },
                  { label: 'API Calls', value: String(data.totals.total_api_calls ?? 0) },
                  { label: 'Avg / day', value: `${(data.totals.total_sessions / days).toFixed(1)}` },
                ].map(stat => (
                  <div className="flex flex-col gap-0.5 px-4 py-3" key={stat.label}>
                    <span className="text-[0.6875rem] uppercase tracking-wide text-(--ui-text-tertiary)">{stat.label}</span>
                    <span className="text-lg font-semibold tabular-nums">{stat.value}</span>
                  </div>
                ))}
              </div>
            </Card>
            <TokenBarChart daily={data.daily} />
          </div>

          <DailyTable daily={data.daily} />
          <ModelTable models={data.by_model} />
          <SkillTable skills={data.skills.top_skills} />
        </>
      )}

      {/* Empty state */}
      {data &&
        data.daily.length === 0 &&
        data.by_model.length === 0 &&
        data.skills.top_skills.length === 0 && (
          <Card>
            <div className="flex flex-col items-center py-10 text-(--ui-text-secondary)">
              <Codicon className="mb-3 size-8 opacity-40" name="graph-line" />
              <p className="text-sm font-medium">No usage data</p>
              <p className="mt-1 text-xs text-(--ui-text-tertiary)">Start a session to see analytics here.</p>
            </div>
          </Card>
        )}
    </div>
  )
}
