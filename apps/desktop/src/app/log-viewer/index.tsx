import { useCallback, useEffect, useRef, useState } from 'react'

import { Button } from '../../components/ui/button'
import { Codicon } from '../../components/ui/codicon'
import { Loader } from '../../components/ui/loader'
import { LogView } from '../../components/ui/log-view'
import { SegmentedControl } from '../../components/ui/segmented-control'
import { Switch } from '../../components/ui/switch'

// Ported from the web dashboard's LogsPage. Same backend endpoint (/api/logs),
// rewired to the desktop IPC bridge (window.hermesDesktop.api) and desktop UI
// primitives. v1 uses inline English strings — i18n keys are a follow-up.

const FILES = ['agent', 'errors', 'gateway'] as const
const LEVELS = ['ALL', 'DEBUG', 'INFO', 'WARNING', 'ERROR'] as const
const COMPONENTS = ['all', 'gateway', 'agent', 'tools', 'cli', 'cron'] as const
const LINE_COUNTS = ['50', '100', '200', '500'] as const

type LogFile = (typeof FILES)[number]
type LogLevel = (typeof LEVELS)[number]
type LogComponent = (typeof COMPONENTS)[number]
type LineCount = (typeof LINE_COUNTS)[number]

interface LogsResponse {
  file: string
  lines: string[]
}

const AUTO_REFRESH_MS = 5000

function classifyLine(line: string): 'error' | 'warning' | 'info' | 'debug' {
  const upper = line.toUpperCase()
  if (upper.includes('ERROR') || upper.includes('CRITICAL') || upper.includes('FATAL')) return 'error'
  if (upper.includes('WARNING') || upper.includes('WARN')) return 'warning'
  if (upper.includes('DEBUG')) return 'debug'
  return 'info'
}

const LINE_CLASS: Record<string, string> = {
  error: 'text-destructive',
  warning: 'text-(--ui-text-primary) font-medium',
  info: 'text-(--ui-text-secondary)',
  debug: 'text-(--ui-text-tertiary)'
}

const toOptions = <T extends string>(values: readonly T[]) => values.map(v => ({ id: v, label: v.toUpperCase() }))

export function LogsView() {
  const [file, setFile] = useState<LogFile>('agent')
  const [level, setLevel] = useState<LogLevel>('ALL')
  const [component, setComponent] = useState<LogComponent>('all')
  const [lineCount, setLineCount] = useState<LineCount>('100')
  const [autoRefresh, setAutoRefresh] = useState(false)
  const [lines, setLines] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  const fetchLogs = useCallback(async () => {
    setLoading(true)
    setError(null)
    const params = new URLSearchParams()
    params.set('file', file)
    params.set('lines', lineCount)
    if (level !== 'ALL') params.set('level', level)
    if (component !== 'all') params.set('component', component)
    try {
      const resp = await window.hermesDesktop!.api<LogsResponse>({
        path: `/api/logs?${params.toString()}`,
        method: 'GET'
      })
      setLines(resp.lines)
      setTimeout(() => bottomRef.current?.scrollIntoView(), 50)
    } catch (err) {
      setError(String(err))
    } finally {
      setLoading(false)
    }
  }, [file, lineCount, level, component])

  useEffect(() => {
    void fetchLogs()
  }, [fetchLogs])

  useEffect(() => {
    if (!autoRefresh) return
    const interval = setInterval(() => void fetchLogs(), AUTO_REFRESH_MS)
    return () => clearInterval(interval)
  }, [autoRefresh, fetchLogs])

  return (
    <div className="flex h-full min-w-0 flex-col gap-4 p-4 pt-(--titlebar-height)">
      <div className="flex min-w-0 flex-wrap items-end gap-x-6 gap-y-3">
        <Field label="File">
          <SegmentedControl options={toOptions(FILES)} value={file} onChange={setFile} />
        </Field>
        <Field label="Level">
          <SegmentedControl options={toOptions(LEVELS)} value={level} onChange={setLevel} />
        </Field>
        <Field label="Component">
          <SegmentedControl options={toOptions(COMPONENTS)} value={component} onChange={setComponent} />
        </Field>
        <Field label="Lines">
          <SegmentedControl
            options={LINE_COUNTS.map(n => ({ id: n, label: n }))}
            value={lineCount}
            onChange={setLineCount}
          />
        </Field>
        <div className="ml-auto flex items-center gap-3">
          <label className="flex cursor-pointer items-center gap-2 text-xs text-(--ui-text-secondary)">
            <span>Auto-refresh</span>
            <Switch checked={autoRefresh} onCheckedChange={setAutoRefresh} aria-label="Auto-refresh logs" />
          </label>
          {autoRefresh && (
            <span className="flex items-center gap-1 text-xs text-(--ui-text-tertiary)">
              <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-current" />
              Live
            </span>
          )}
          <Button aria-label="Refresh logs" disabled={loading} onClick={() => void fetchLogs()} size="icon" variant="ghost">
            {loading ? <Loader /> : <Codicon name="refresh" />}
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-2 text-xs text-(--ui-text-tertiary)">
        <Codicon name="output" />
        <span>{file}.log</span>
      </div>

      {error && <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">{error}</div>}

      <LogView className="min-h-0 flex-1">
        {lines.length === 0 && !loading ? (
          <div className="py-8 text-center text-(--ui-text-tertiary)">No log lines.</div>
        ) : (
          lines.map((line, i) => (
            <div key={i} className={`${LINE_CLASS[classifyLine(line)]} -mx-1 px-1`}>
              {line}
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </LogView>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-1.5">
      <span className="text-[0.6875rem] uppercase tracking-wide text-(--ui-text-tertiary)">{label}</span>
      {children}
    </div>
  )
}
