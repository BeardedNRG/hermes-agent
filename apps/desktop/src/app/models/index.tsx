import { useCallback, useEffect, useState } from 'react'

import { Button } from '../../components/ui/button'
import { Codicon } from '../../components/ui/codicon'
import { ConfirmDialog } from '../../components/ui/confirm-dialog'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../components/ui/dialog'
import { Loader } from '../../components/ui/loader'
import { SegmentedControl } from '../../components/ui/segmented-control'

import { type ModelOptionsResponse, ModelPicker } from './model-picker'

// Models tab — ported from web/src/pages/ModelsPage.tsx. Main-model + auxiliary
// task assignment (via the ported ModelPicker) plus per-model usage analytics
// (gated on dashboard.show_token_analytics).

// Must match _AUX_TASK_SLOTS in hermes_cli/web_server.py.
const AUX_TASKS = [
  { key: 'vision', label: 'Vision', hint: 'Image analysis' },
  { key: 'web_extract', label: 'Web Extract', hint: 'Page summarization' },
  { key: 'compression', label: 'Compression', hint: 'Context compaction' },
  { key: 'skills_hub', label: 'Skills Hub', hint: 'Skill search' },
  { key: 'approval', label: 'Approval', hint: 'Smart auto-approve' },
  { key: 'mcp', label: 'MCP', hint: 'MCP tool routing' },
  { key: 'title_generation', label: 'Title Gen', hint: 'Session titles' },
  { key: 'triage_specifier', label: 'Triage Specifier', hint: 'Kanban spec fleshing' },
  { key: 'kanban_decomposer', label: 'Kanban Decomposer', hint: 'Task decomposition' },
  { key: 'profile_describer', label: 'Profile Describer', hint: 'Auto profile descriptions' },
  { key: 'curator', label: 'Curator', hint: 'Skill-usage review' },
] as const

const PERIODS = [
  { id: '7', label: '7d' },
  { id: '30', label: '30d' },
  { id: '90', label: '90d' },
] as const

interface AuxTask {
  task: string
  provider: string
  model: string
}

interface AuxResponse {
  tasks: AuxTask[]
  main: { provider: string; model: string }
}

interface ModelEntry {
  model: string
  provider: string
  input_tokens: number
  output_tokens: number
  cache_read_tokens: number
  reasoning_tokens: number
  estimated_cost: number
  sessions: number
  api_calls: number
  tool_calls: number
  last_used_at: number
  avg_tokens_per_session: number
  capabilities: {
    supports_tools?: boolean
    supports_vision?: boolean
    supports_reasoning?: boolean
    context_window?: number
    max_output_tokens?: number
    model_family?: string
  }
}

interface ModelsResponse {
  models: ModelEntry[]
  totals: {
    distinct_models: number
    total_input: number
    total_output: number
    total_estimated_cost: number
    total_sessions: number
  }
}

const fmt = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1_000 ? `${(n / 1_000).toFixed(1)}K` : String(n))
const fmtCost = (n: number) => (n >= 1 ? `$${n.toFixed(2)}` : n >= 0.01 ? `$${n.toFixed(3)}` : n > 0 ? `$${n.toFixed(4)}` : '$0')
const shortName = (model: string) => (model.indexOf('/') > 0 ? model.slice(model.indexOf('/') + 1) : model)
const vendor = (model: string, fallback?: string) => (model.indexOf('/') > 0 ? model.slice(0, model.indexOf('/')) : fallback || '')

function timeAgo(epoch: number) {
  if (!epoch) {return ''}
  const mins = Math.floor((Date.now() - epoch * 1000) / 60_000)

  if (mins < 60) {return `${mins}m ago`}
  const hrs = Math.floor(mins / 60)

  if (hrs < 24) {return `${hrs}h ago`}

  return `${Math.floor(hrs / 24)}d ago`
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-(--stroke-nous) bg-(--ui-bg-2) px-2 py-0.5 text-[0.6875rem] font-medium text-(--ui-text-secondary)">
      {children}
    </span>
  )
}

function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-lg border border-(--stroke-nous) bg-(--ui-bg-1) ${className ?? ''}`}>{children}</div>
}

function SettingRow({ icon, title, detail, onChange, changeLabel }: { icon: string; title: string; detail: string; onChange: () => void; changeLabel: string }) {
  return (
    <div className="flex flex-col gap-2 rounded-md border border-(--stroke-nous) bg-(--ui-bg-2) px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 flex-1">
        <div className="mb-0.5 flex items-center gap-2">
          <Codicon className="text-(--ui-text-tertiary)" name={icon} />
          <span className="text-xs font-medium uppercase tracking-wider">{title}</span>
        </div>
        <div className="truncate font-mono text-xs text-(--ui-text-secondary)">{detail}</div>
      </div>
      <Button className="shrink-0 self-start sm:self-center" onClick={onChange} size="sm">
        {changeLabel}
      </Button>
    </div>
  )
}

const apiCall = <T,>(path: string, method = 'GET', body?: unknown) => window.hermesDesktop!.api<T>({ path, method, body })
const loadOptions = () => apiCall<ModelOptionsResponse>('/api/model/options')

const assign = (body: { scope: 'main' | 'auxiliary'; task: string; provider: string; model: string }) =>
  apiCall('/api/model/set', 'POST', body)

export function ModelsView() {
  const [days, setDays] = useState(30)
  const [data, setData] = useState<ModelsResponse | null>(null)
  const [aux, setAux] = useState<AuxResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showTokens, setShowTokens] = useState(false)
  const [picker, setPicker] = useState<{ scope: 'main' | 'auxiliary'; task: string; title: string } | null>(null)
  const [auxModalOpen, setAuxModalOpen] = useState(false)

  useEffect(() => {
    apiCall<{ dashboard?: { show_token_analytics?: boolean } }>('/api/config')
      .then(cfg => setShowTokens(cfg?.dashboard?.show_token_analytics === true))
      .catch(() => setShowTokens(false))
  }, [])

  const load = useCallback(() => {
    setLoading(true)
    setError(null)
    Promise.all([apiCall<ModelsResponse>(`/api/analytics/models?days=${days}`), apiCall<AuxResponse>('/api/model/auxiliary').catch(() => null)])
      .then(([models, auxData]) => {
        setData(models)
        setAux(auxData)
      })
      .catch(err => setError(String(err)))
      .finally(() => setLoading(false))
  }, [days])

  useEffect(() => {
    load()
  }, [load])

  const reloadAux = useCallback(() => {
    apiCall<AuxResponse>('/api/model/auxiliary').then(setAux).catch(() => {})
  }, [])

  const mainProv = aux?.main.provider ?? ''
  const mainModel = aux?.main.model ?? ''
  const auxOverrides = aux?.tasks.filter(a => a.provider && a.provider !== 'auto').length ?? 0

  return (
    <div className="flex h-full min-w-0 flex-col gap-6 overflow-y-auto p-4 pt-(--titlebar-height)">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 text-xs text-(--ui-text-tertiary)">
          <Codicon name="chip" />
          <span className="font-semibold uppercase tracking-wider">Models</span>
        </div>
        <div className="flex items-center gap-1.5">
          <SegmentedControl onChange={v => setDays(Number(v))} options={PERIODS} value={String(days)} />
          <Button aria-label="Refresh" disabled={loading} onClick={load} size="icon" variant="ghost">
            {loading ? <Loader /> : <Codicon name="refresh" />}
          </Button>
        </div>
      </div>

      {/* Settings + totals */}
      <div className="grid min-w-0 gap-4 lg:grid-cols-2">
        <Card>
          <div className="flex flex-col gap-3 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Codicon className="text-(--ui-text-tertiary)" name="settings-gear" />
              Model Settings
              <span className="text-xs font-normal text-(--ui-text-tertiary)">applies to new sessions</span>
            </div>
            <SettingRow
              changeLabel="Change"
              detail={`${mainProv || '(unset)'}${mainProv && mainModel ? ' · ' : ''}${mainModel || '(unset)'}`}
              icon="star-full"
              onChange={() => setPicker({ scope: 'main', task: '', title: 'Set Main Model' })}
              title="Main model"
            />
            <SettingRow
              changeLabel="Configure"
              detail={auxOverrides > 0 ? `${auxOverrides} override${auxOverrides > 1 ? 's' : ''} · ${AUX_TASKS.length - auxOverrides} auto` : `${AUX_TASKS.length} tasks · all auto`}
              icon="chip"
              onChange={() => setAuxModalOpen(true)}
              title="Auxiliary tasks"
            />
          </div>
        </Card>

        {data && (
          <Card>
            <div className="grid grid-cols-2 gap-x-6 gap-y-3 p-4 sm:grid-cols-3">
              {(showTokens
                ? [
                    { label: 'Models used', value: String(data.totals.distinct_models) },
                    { label: 'Total tokens', value: fmt(data.totals.total_input + data.totals.total_output) },
                    { label: 'Input', value: fmt(data.totals.total_input) },
                    { label: 'Output', value: fmt(data.totals.total_output) },
                    { label: 'Est. cost', value: fmtCost(data.totals.total_estimated_cost) },
                    { label: 'Sessions', value: String(data.totals.total_sessions) },
                  ]
                : [
                    { label: 'Models used', value: String(data.totals.distinct_models) },
                    { label: 'Sessions', value: String(data.totals.total_sessions) },
                  ]
              ).map(s => (
                <div key={s.label}>
                  <div className="text-lg font-semibold tabular-nums">{s.value}</div>
                  <div className="text-[0.6875rem] uppercase tracking-wider text-(--ui-text-tertiary)">{s.label}</div>
                </div>
              ))}
              {!showTokens && (
                <p className="col-span-full text-xs leading-relaxed text-(--ui-text-tertiary)">
                  Token & cost analytics are hidden — local counts exclude auxiliary calls and retries. Enable{' '}
                  <code className="font-mono">dashboard.show_token_analytics</code> in Config.
                </p>
              )}
            </div>
          </Card>
        )}
      </div>

      {loading && !data && (
        <div className="flex items-center justify-center py-16">
          <Loader className="text-2xl" />
        </div>
      )}
      {error && <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-center text-xs text-destructive">{error}</div>}

      {/* Model cards */}
      {data && data.models.length > 0 && (
        <div className="grid min-w-0 gap-3 lg:grid-cols-2">
          {data.models.map((entry, i) => (
            <ModelCard
              auxTasks={aux?.tasks ?? []}
              entry={entry}
              key={`${entry.provider}/${entry.model}`}
              main={aux?.main ?? null}
              onAssigned={reloadAux}
              rank={i + 1}
              showTokens={showTokens}
            />
          ))}
        </div>
      )}

      {picker && (
        <ModelPicker
          loader={loadOptions}
          onApply={async ({ provider, model }) => {
            await assign({ scope: picker.scope, task: picker.task, provider, model })
            reloadAux()
          }}
          onClose={() => setPicker(null)}
          title={picker.title}
        />
      )}

      {auxModalOpen && <AuxModal aux={aux} onClose={() => setAuxModalOpen(false)} onSaved={reloadAux} />}
    </div>
  )
}

function ModelCard({
  entry,
  rank,
  main,
  auxTasks,
  onAssigned,
  showTokens,
}: {
  entry: ModelEntry
  rank: number
  main: { provider: string; model: string } | null
  auxTasks: AuxTask[]
  onAssigned: () => void
  showTokens: boolean
}) {
  const provider = entry.provider || vendor(entry.model)
  const caps = entry.capabilities
  const isMain = !!main && main.provider === provider && main.model === entry.model
  const auxTask = auxTasks.find(a => a.provider === provider && a.model === entry.model)?.task ?? null

  return (
    <Card className={isMain ? 'ring-1 ring-primary/40' : ''}>
      <div className="flex flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs text-(--ui-text-tertiary)">#{rank}</span>
              <span className="truncate font-mono text-sm">{shortName(entry.model)}</span>
              {isMain && <Pill>main</Pill>}
              {auxTask && <Pill>aux · {auxTask}</Pill>}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-(--ui-text-secondary)">
              {provider && <Pill>{provider}</Pill>}
              {caps.context_window ? <span>{fmt(caps.context_window)} ctx</span> : null}
              {caps.max_output_tokens ? <span>{fmt(caps.max_output_tokens)} out</span> : null}
            </div>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            {showTokens ? (
              <div className="text-right">
                <div className="font-mono text-xs font-semibold">{fmt(entry.input_tokens + entry.output_tokens)}</div>
                <div className="text-[0.625rem] text-(--ui-text-tertiary)">tokens</div>
              </div>
            ) : (
              entry.sessions > 0 && (
                <div className="text-right">
                  <div className="font-mono text-xs font-semibold">{entry.sessions}</div>
                  <div className="text-[0.625rem] text-(--ui-text-tertiary)">sessions</div>
                </div>
              )
            )}
            <UseAsMenu isMain={isMain} model={entry.model} onAssigned={onAssigned} provider={provider} usingTask={auxTask} />
          </div>
        </div>

        {showTokens && (
          <div className="grid grid-cols-3 gap-2 text-xs">
            <Stat label="sessions" value={String(entry.sessions)} />
            <Stat label="avg/session" value={fmt(entry.avg_tokens_per_session)} />
            <Stat label="api calls" value={entry.api_calls > 0 ? fmt(entry.api_calls) : '—'} />
          </div>
        )}

        <div className="flex items-center justify-between border-t border-(--stroke-nous)/30 pt-2 text-xs text-(--ui-text-secondary)">
          <div className="flex items-center gap-3">
            {showTokens && entry.estimated_cost > 0 && <span>{fmtCost(entry.estimated_cost)}</span>}
            {showTokens && entry.tool_calls > 0 && <span>{entry.tool_calls} tool calls</span>}
          </div>
          {entry.last_used_at > 0 && <span>{timeAgo(entry.last_used_at)}</span>}
        </div>

        {(caps.supports_tools || caps.supports_vision || caps.supports_reasoning || caps.model_family) && (
          <div className="flex flex-wrap items-center gap-1.5">
            {caps.supports_tools && <Pill>Tools</Pill>}
            {caps.supports_vision && <Pill>Vision</Pill>}
            {caps.supports_reasoning && <Pill>Reasoning</Pill>}
            {caps.model_family && <Pill>{caps.model_family}</Pill>}
          </div>
        )}
      </div>
    </Card>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-center">
      <div className="font-mono font-semibold">{value}</div>
      <div className="text-[0.625rem] text-(--ui-text-tertiary)">{label}</div>
    </div>
  )
}

function UseAsMenu({
  provider,
  model,
  isMain,
  usingTask,
  onAssigned,
}: {
  provider: string
  model: string
  isMain: boolean
  usingTask: string | null
  onAssigned: () => void
}) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) {return}

    const onDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null

      if (target && !target.closest?.('[data-use-as-menu]')) {setOpen(false)}
    }

    window.addEventListener('mousedown', onDown)

    return () => window.removeEventListener('mousedown', onDown)
  }, [open])

  const doAssign = async (scope: 'main' | 'auxiliary', task: string) => {
    if (!provider || !model) {return}
    setBusy(true)

    try {
      await assign({ scope, task, provider, model })
      onAssigned()
      setOpen(false)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="relative" data-use-as-menu>
      <Button disabled={busy} onClick={() => setOpen(v => !v)} size="sm" variant="ghost">
        {busy ? <Loader /> : 'Use as'}
        <Codicon name="chevron-down" />
      </Button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 max-h-72 min-w-56 overflow-y-auto rounded-md border border-(--stroke-nous) bg-(--ui-bg-1) py-1 shadow-nous">
          <MenuItem current={isMain} label="Main model" onClick={() => doAssign('main', '')} />
          <div className="border-t border-(--stroke-nous)/50 px-3 py-1.5 text-[0.6875rem] uppercase tracking-wider text-(--ui-text-tertiary)">
            Auxiliary task
          </div>
          <MenuItem label="All auxiliary tasks" onClick={() => doAssign('auxiliary', '')} />
          {AUX_TASKS.map(t => (
            <MenuItem current={usingTask === t.key} key={t.key} label={t.label} onClick={() => doAssign('auxiliary', t.key)} />
          ))}
        </div>
      )}
    </div>
  )
}

function MenuItem({ label, current, onClick }: { label: string; current?: boolean; onClick: () => void }) {
  return (
    <button
      className="flex w-full items-center justify-between px-3 py-1.5 text-left text-xs hover:bg-(--ui-control-hover-background)"
      onClick={onClick}
      type="button"
    >
      <span>{label}</span>
      {current && <span className="text-primary">current</span>}
    </button>
  )
}

function AuxModal({ aux, onSaved, onClose }: { aux: AuxResponse | null; onSaved: () => void; onClose: () => void }) {
  const [picker, setPicker] = useState<string | null>(null)
  const [confirmReset, setConfirmReset] = useState(false)

  const resetAll = async () => {
    await assign({ scope: 'auxiliary', task: '__reset__', provider: '', model: '' })
    onSaved()
  }

  return (
    <Dialog onOpenChange={v => !v && onClose()} open>
      <DialogContent className="max-h-[80vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between gap-3 pr-6">
            <DialogTitle>Auxiliary Tasks</DialogTitle>
            <Button onClick={() => setConfirmReset(true)} size="sm" variant="ghost">
              Reset all to auto
            </Button>
          </div>
        </DialogHeader>
        <p className="text-xs text-(--ui-text-secondary)">
          Auxiliary tasks handle side-jobs like vision, search, and compression. <span className="font-mono">auto</span> means “use the main
          model”. Override per-task to use a cheap/fast model for a specific job.
        </p>
        <div className="flex flex-col gap-1">
          {AUX_TASKS.map(t => {
            const cur = aux?.tasks.find(a => a.task === t.key)
            const isAuto = !cur || cur.provider === 'auto' || !cur.provider

            return (
              <div className="flex items-center justify-between gap-3 rounded-md border border-(--stroke-nous)/40 bg-(--ui-bg-2)/50 px-3 py-2" key={t.key}>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className="text-xs font-medium">{t.label}</span>
                    <span className="text-xs text-(--ui-text-tertiary)">{t.hint}</span>
                  </div>
                  <div className="truncate font-mono text-xs text-(--ui-text-secondary)">
                    {isAuto ? 'auto (use main model)' : `${cur?.provider} · ${cur?.model || '(provider default)'}`}
                  </div>
                </div>
                <Button onClick={() => setPicker(t.key)} size="sm" variant="ghost">
                  Change
                </Button>
              </div>
            )
          })}
        </div>

        {picker && (
          <ModelPicker
            loader={loadOptions}
            onApply={async ({ provider, model }) => {
              await assign({ scope: 'auxiliary', task: picker, provider, model })
              onSaved()
            }}
            onClose={() => setPicker(null)}
            title={`Set Auxiliary: ${AUX_TASKS.find(t => t.key === picker)?.label ?? picker}`}
          />
        )}

        <ConfirmDialog
          confirmLabel="Reset all"
          description="Reset every auxiliary task to 'auto'? This overrides any per-task overrides you've set."
          destructive
          onClose={() => setConfirmReset(false)}
          onConfirm={resetAll}
          open={confirmReset}
          title="Reset auxiliary models?"
        />
      </DialogContent>
    </Dialog>
  )
}
