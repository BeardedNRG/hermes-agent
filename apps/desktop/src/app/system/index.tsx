import { useCallback, useEffect, useRef, useState } from 'react'

import { Button } from '../../components/ui/button'
import { Codicon } from '../../components/ui/codicon'
import { ConfirmDialog } from '../../components/ui/confirm-dialog'
import { Loader } from '../../components/ui/loader'

// System monitoring tab — ported from web/src/pages/SystemPage.tsx. Scoped to
// the status + lifecycle core: host stats, version/update, Nous Portal, skill
// curator, gateway lifecycle, checkpoints, plus a poller for backgrounded
// admin actions. Credential pool → Config » Keys; shell hooks → Config » Hooks
// (kept out of here to avoid duplicating those umbrella panels).

interface SystemStats {
  os: string
  os_release: string
  arch: string
  hostname: string
  python_version: string
  python_impl: string
  hermes_version: string
  cpu_count: number | null
  psutil: boolean
  cpu_percent?: number
  load_avg?: number[]
  uptime_seconds?: number
  memory?: { total: number; used: number; percent: number }
  disk?: { total: number; used: number; percent: number }
}

interface UpdateCheckResponse {
  current_version: string
  behind: number | null
  update_available: boolean
  can_apply: boolean
  update_command: string
  message: string | null
}

interface CuratorStatus {
  enabled: boolean
  paused: boolean
  interval_hours: number | null
  last_run_at: string | null
}

interface PortalFeature {
  label: string
  state: string
}

interface PortalStatus {
  logged_in: boolean
  provider: string
  subscription_url: string
  features: PortalFeature[]
}

interface CheckpointsResponse {
  sessions: { session: string; files: number; bytes: number }[]
  total_bytes: number
}

interface StatusResponse {
  gateway_running: boolean
  gateway_state: string | null
  gateway_pid: number | null
}

interface ActionResponse {
  name: string
  ok: boolean
  error?: string
  message?: string
}

interface ActionStatusResponse {
  exit_code: number | null
  lines: string[]
  name: string
  running: boolean
}

function formatBytes(n: number): string {
  if (n < 1024) {return `${n} B`}

  if (n < 1024 * 1024) {return `${(n / 1024).toFixed(1)} KB`}

  if (n < 1024 * 1024 * 1024) {return `${(n / (1024 * 1024)).toFixed(1)} MB`}

  return `${(n / (1024 * 1024 * 1024)).toFixed(1)} GB`
}

function formatDuration(seconds: number): string {
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  const m = Math.floor((seconds % 3600) / 60)

  if (d > 0) {return `${d}d ${h}h ${m}m`}

  if (h > 0) {return `${h}h ${m}m`}

  return `${m}m`
}

type Tone = 'success' | 'warning' | 'danger' | 'neutral'

const TONE_CLASS: Record<Tone, string> = {
  success: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400',
  warning: 'border-amber-500/30 bg-amber-500/10 text-amber-400',
  danger: 'border-destructive/30 bg-destructive/10 text-destructive',
  neutral: 'border-(--stroke-nous) bg-(--ui-bg-2) text-(--ui-text-secondary)',
}

function Pill({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[0.6875rem] font-medium ${TONE_CLASS[tone]}`}>
      {children}
    </span>
  )
}

function Card({ children }: { children: React.ReactNode }) {
  return <div className="rounded-lg border border-(--stroke-nous) bg-(--ui-bg-1)">{children}</div>
}

function Section({ icon, title, children }: { icon: string; title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-(--ui-text-secondary)">
        <Codicon name={icon} />
        {title}
      </div>
      {children}
    </section>
  )
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[0.6875rem] uppercase tracking-wider text-(--ui-text-tertiary)">{label}</div>
      <div className="text-sm">{children}</div>
    </div>
  )
}

// Polls /api/actions/<name>/status until the spawned process exits.
function ActionLogViewer({ action, onClose }: { action: string; onClose: () => void }) {
  const [lines, setLines] = useState<string[]>([])
  const [running, setRunning] = useState(true)
  const [exitCode, setExitCode] = useState<number | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    let cancelled = false

    const poll = async () => {
      try {
        const st = await window.hermesDesktop!.api<ActionStatusResponse>({
          path: `/api/actions/${encodeURIComponent(action)}/status?lines=400`,
        })

        if (cancelled) {return}
        setLines(st.lines)
        setRunning(st.running)
        setExitCode(st.exit_code)

        if (st.running) {timer.current = setTimeout(poll, 1200)}
      } catch {
        if (!cancelled) {setRunning(false)}
      }
    }

    void poll()

    return () => {
      cancelled = true

      if (timer.current) {clearTimeout(timer.current)}
    }
  }, [action])

  return (
    <Card>
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          <Codicon className="text-(--ui-text-tertiary)" name="terminal" />
          <span className="font-mono text-sm">{action}</span>
          {running ? (
            <Pill tone="warning">running</Pill>
          ) : (
            <Pill tone={exitCode === 0 ? 'success' : 'danger'}>{exitCode === 0 ? 'done' : `exit ${exitCode}`}</Pill>
          )}
        </div>
        <Button aria-label="Close log" onClick={onClose} size="icon" variant="ghost">
          <Codicon name="close" />
        </Button>
      </div>
      <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words border-t border-(--stroke-nous) px-4 py-3 font-mono text-xs text-(--ui-text-secondary)">
        {lines.length ? lines.join('\n') : 'Starting…'}
      </pre>
    </Card>
  )
}

interface Flash {
  msg: string
  kind: 'success' | 'error'
}

export function SystemView() {
  const [status, setStatus] = useState<StatusResponse | null>(null)
  const [stats, setStats] = useState<SystemStats | null>(null)
  const [curator, setCurator] = useState<CuratorStatus | null>(null)
  const [portal, setPortal] = useState<PortalStatus | null>(null)
  const [checkpoints, setCheckpoints] = useState<CheckpointsResponse | null>(null)
  const [updateInfo, setUpdateInfo] = useState<UpdateCheckResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [checkingUpdate, setCheckingUpdate] = useState(false)
  const [activeAction, setActiveAction] = useState<string | null>(null)
  const [updateConfirmOpen, setUpdateConfirmOpen] = useState(false)
  const [stopConfirmOpen, setStopConfirmOpen] = useState(false)
  const [pruneConfirmOpen, setPruneConfirmOpen] = useState(false)
  const [flash, setFlash] = useState<Flash | null>(null)

  const showFlash = useCallback((msg: string, kind: Flash['kind']) => {
    setFlash({ msg, kind })
    window.setTimeout(() => setFlash(null), 3000)
  }, [])

  const api = useCallback(<T,>(path: string, method = 'GET', body?: unknown) => {
    return window.hermesDesktop!.api<T>({ path, method, body })
  }, [])

  const loadAll = useCallback(() => {
    Promise.allSettled([
      api<StatusResponse>('/api/status'),
      api<SystemStats>('/api/system/stats'),
      api<CuratorStatus>('/api/curator'),
      api<PortalStatus>('/api/portal'),
      api<CheckpointsResponse>('/api/ops/checkpoints'),
      api<UpdateCheckResponse>('/api/hermes/update/check'),
    ])
      .then(([s, st, cur, prt, cp, upd]) => {
        if (s.status === 'fulfilled') {setStatus(s.value)}

        if (st.status === 'fulfilled') {setStats(st.value)}

        if (cur.status === 'fulfilled') {setCurator(cur.value)}

        if (prt.status === 'fulfilled') {setPortal(prt.value)}

        if (cp.status === 'fulfilled') {setCheckpoints(cp.value)}

        if (upd.status === 'fulfilled') {setUpdateInfo(upd.value)}
      })
      .finally(() => setLoading(false))
  }, [api])

  useEffect(() => {
    loadAll()
  }, [loadAll])

  const runGateway = async (verb: 'start' | 'stop' | 'restart') => {
    try {
      const resp = await api<ActionResponse>(`/api/gateway/${verb}`, 'POST')
      setActiveAction(resp.name)
      showFlash(`Gateway ${verb} started`, 'success')
      window.setTimeout(loadAll, 3000)
    } catch (e) {
      showFlash(`Gateway ${verb} failed: ${e}`, 'error')
    }
  }

  const toggleCurator = async () => {
    if (!curator) {return}

    try {
      await api('/api/curator/paused', 'PUT', { paused: !curator.paused })
      showFlash(curator.paused ? 'Curator resumed' : 'Curator paused', 'success')
      loadAll()
    } catch (e) {
      showFlash(`Curator toggle failed: ${e}`, 'error')
    }
  }

  const runCurator = async () => {
    try {
      const resp = await api<ActionResponse>('/api/curator/run', 'POST')
      setActiveAction(resp.name)
      showFlash('Curator review started', 'success')
    } catch (e) {
      showFlash(`Curator run failed: ${e}`, 'error')
    }
  }

  const checkForUpdate = async () => {
    setCheckingUpdate(true)

    try {
      const info = await api<UpdateCheckResponse>('/api/hermes/update/check?force=true')
      setUpdateInfo(info)
      showFlash(
        info.update_available
          ? info.behind && info.behind > 0
            ? `Update available — ${info.behind} commit(s) behind`
            : 'Update available'
          : "You're on the latest version",
        'success',
      )
    } catch (e) {
      showFlash(`Update check failed: ${e}`, 'error')
    } finally {
      setCheckingUpdate(false)
    }
  }

  const applyUpdate = async () => {
    const resp = await api<ActionResponse>('/api/hermes/update', 'POST')

    if (!resp.ok && resp.error === 'docker_update_unsupported') {
      showFlash(resp.message ?? "Updates don't apply inside Docker.", 'error')

      return
    }

    setActiveAction(resp.name ?? 'hermes-update')
    showFlash('Update started', 'success')
  }

  const pruneCheckpoints = async () => {
    const resp = await api<ActionResponse>('/api/ops/checkpoints/prune', 'POST')
    setActiveAction(resp.name)
    showFlash('Checkpoint prune started', 'success')
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader className="text-2xl" />
      </div>
    )
  }

  const gatewayRunning = status?.gateway_running

  return (
    <div className="flex h-full min-w-0 flex-col gap-6 overflow-y-auto p-4 pt-(--titlebar-height)">
      <div className="flex items-center gap-2 text-xs text-(--ui-text-tertiary)">
        <Codicon name="server-environment" />
        <span className="font-semibold uppercase tracking-wider">System</span>
        <Button aria-label="Refresh" className="ml-auto" onClick={loadAll} size="icon" variant="ghost">
          <Codicon name="refresh" />
        </Button>
      </div>

      {flash && (
        <div
          className={`rounded-md border px-3 py-2 text-xs ${
            flash.kind === 'error'
              ? 'border-destructive/30 bg-destructive/10 text-destructive'
              : 'border-(--stroke-nous) bg-(--ui-bg-2) text-(--ui-text-secondary)'
          }`}
        >
          {flash.msg}
        </div>
      )}

      {activeAction && <ActionLogViewer action={activeAction} onClose={() => setActiveAction(null)} />}

      {/* Host */}
      <Section icon="vm" title="Host">
        <Card>
          <div className="grid grid-cols-2 gap-x-6 gap-y-3 px-4 py-4 sm:grid-cols-3">
            <Stat label="OS">{stats?.os} {stats?.os_release}</Stat>
            <Stat label="Arch">{stats?.arch}</Stat>
            <Stat label="Host"><span className="truncate">{stats?.hostname}</span></Stat>
            <Stat label="Python">{stats?.python_impl} {stats?.python_version}</Stat>
            <Stat label="Hermes">
              <span className="flex items-center gap-2">
                v{stats?.hermes_version}
                {updateInfo &&
                  (updateInfo.update_available ? (
                    <Pill tone="warning">{updateInfo.behind && updateInfo.behind > 0 ? `${updateInfo.behind} behind` : 'update'}</Pill>
                  ) : updateInfo.behind === 0 ? (
                    <Pill tone="success">latest</Pill>
                  ) : null)}
              </span>
            </Stat>
            <Stat label="CPU">
              {stats?.cpu_count ?? '—'} cores
              {typeof stats?.cpu_percent === 'number' ? ` · ${stats.cpu_percent.toFixed(0)}%` : ''}
            </Stat>
            {stats?.memory && (
              <Stat label="Memory">
                {formatBytes(stats.memory.used)} / {formatBytes(stats.memory.total)} ({stats.memory.percent}%)
              </Stat>
            )}
            {stats?.disk && (
              <Stat label="Disk">
                {formatBytes(stats.disk.used)} / {formatBytes(stats.disk.total)} ({stats.disk.percent}%)
              </Stat>
            )}
            {typeof stats?.uptime_seconds === 'number' && <Stat label="Uptime">{formatDuration(stats.uptime_seconds)}</Stat>}
            {stats?.load_avg && stats.load_avg.length >= 3 && (
              <Stat label="Load avg">{stats.load_avg.map(n => n.toFixed(2)).join(' / ')}</Stat>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2 border-t border-(--stroke-nous) px-4 py-3">
            <Button disabled={checkingUpdate} onClick={checkForUpdate} size="sm" variant="ghost">
              {checkingUpdate ? <Loader /> : <Codicon name="sync" />}
              Check for updates
            </Button>
            {updateInfo?.update_available && updateInfo.can_apply && (
              <Button onClick={() => setUpdateConfirmOpen(true)} size="sm">
                <Codicon name="cloud-download" />
                Update now
              </Button>
            )}
            {updateInfo && !updateInfo.can_apply && updateInfo.update_available && (
              <span className="text-xs text-(--ui-text-tertiary)">
                Update with <span className="font-mono">{updateInfo.update_command}</span>
              </span>
            )}
            {!stats?.psutil && (
              <span className="text-xs text-(--ui-text-tertiary)">
                Install the <span className="font-mono">psutil</span> extra for CPU/memory/disk metrics.
              </span>
            )}
          </div>
        </Card>
      </Section>

      {/* Gateway */}
      <Section icon="server-process" title="Gateway">
        <Card>
          <div className="flex items-center justify-between px-4 py-4">
            <div className="flex items-center gap-3">
              <Pill tone={gatewayRunning ? 'success' : 'neutral'}>{gatewayRunning ? 'running' : 'stopped'}</Pill>
              <span className="text-sm text-(--ui-text-secondary)">
                {status?.gateway_state ?? '—'}
                {status?.gateway_pid ? ` · pid ${status.gateway_pid}` : ''}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Button disabled={gatewayRunning} onClick={() => runGateway('start')} size="sm">
                <Codicon name="play" />
                Start
              </Button>
              <Button onClick={() => runGateway('restart')} size="sm" variant="ghost">
                <Codicon name="sync" />
                Restart
              </Button>
              <Button disabled={!gatewayRunning} onClick={() => setStopConfirmOpen(true)} size="sm" variant="ghost">
                <Codicon name="debug-stop" />
                Stop
              </Button>
            </div>
          </div>
        </Card>
      </Section>

      {/* Portal */}
      <Section icon="globe" title="Nous Portal">
        <Card>
          <div className="flex flex-col gap-3 px-4 py-4">
            <div className="flex items-center gap-3">
              <Pill tone={portal?.logged_in ? 'success' : 'neutral'}>{portal?.logged_in ? 'logged in' : 'not logged in'}</Pill>
              {portal?.provider && <span className="text-sm text-(--ui-text-secondary)">provider: {portal.provider}</span>}
              <a
                className="ml-auto text-xs text-primary underline"
                href={portal?.subscription_url || 'https://portal.nousresearch.com/manage-subscription'}
                rel="noreferrer"
                target="_blank"
              >
                Manage subscription
              </a>
            </div>
            {portal?.features && portal.features.length > 0 && (
              <div className="flex flex-col gap-1 border-t border-(--stroke-nous) pt-3">
                <span className="text-[0.6875rem] uppercase tracking-wider text-(--ui-text-tertiary)">Tool Gateway routing</span>
                {portal.features.map(f => (
                  <div className="flex items-center justify-between text-sm" key={f.label}>
                    <span>{f.label}</span>
                    <span className="text-(--ui-text-tertiary)">{f.state}</span>
                  </div>
                ))}
              </div>
            )}
            {!portal?.logged_in && (
              <p className="text-xs text-(--ui-text-tertiary)">
                Log in with <span className="font-mono">hermes portal</span>.
              </p>
            )}
          </div>
        </Card>
      </Section>

      {/* Curator */}
      <Section icon="sparkle" title="Skill curator">
        <Card>
          <div className="flex items-center justify-between px-4 py-4">
            <div className="flex items-center gap-3">
              <Pill tone={curator?.paused ? 'warning' : curator?.enabled ? 'success' : 'neutral'}>
                {curator?.paused ? 'paused' : curator?.enabled ? 'active' : 'disabled'}
              </Pill>
              <span className="text-sm text-(--ui-text-secondary)">
                {curator?.interval_hours ? `every ${curator.interval_hours}h` : ''}
                {curator?.last_run_at ? ` · last run ${new Date(curator.last_run_at).toLocaleString()}` : ' · never run'}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Button onClick={toggleCurator} size="sm" variant="ghost">
                {curator?.paused ? 'Resume' : 'Pause'}
              </Button>
              <Button onClick={runCurator} size="sm" variant="ghost">
                <Codicon name="play" />
                Run now
              </Button>
            </div>
          </div>
        </Card>
      </Section>

      {/* Checkpoints */}
      <Section icon="database" title="Checkpoints">
        <Card>
          <div className="flex items-center justify-between px-4 py-4">
            <span className="text-sm text-(--ui-text-secondary)">
              {checkpoints?.sessions.length ?? 0} session(s) · {formatBytes(checkpoints?.total_bytes ?? 0)}
            </span>
            <Button
              disabled={!checkpoints?.sessions.length}
              onClick={() => setPruneConfirmOpen(true)}
              size="sm"
              variant="ghost"
            >
              <Codicon name="trash" />
              Prune
            </Button>
          </div>
        </Card>
      </Section>

      <ConfirmDialog
        confirmLabel="Update now"
        description={
          updateInfo && updateInfo.behind && updateInfo.behind > 0
            ? `Runs 'hermes update' and pulls ${updateInfo.behind} new commit(s). The gateway restarts when it finishes.`
            : "Runs 'hermes update' and restarts the gateway when it finishes."
        }
        onClose={() => setUpdateConfirmOpen(false)}
        onConfirm={applyUpdate}
        open={updateConfirmOpen}
        title="Update Hermes?"
      />
      <ConfirmDialog
        confirmLabel="Stop gateway"
        description="The agent stops processing until you start it again."
        destructive
        onClose={() => setStopConfirmOpen(false)}
        onConfirm={() => runGateway('stop')}
        open={stopConfirmOpen}
        title="Stop the gateway?"
      />
      <ConfirmDialog
        confirmLabel="Prune"
        description="Delete the rollback checkpoint shadow store? Existing /rollback points will be lost."
        destructive
        onClose={() => setPruneConfirmOpen(false)}
        onConfirm={pruneCheckpoints}
        open={pruneConfirmOpen}
        title="Prune checkpoints?"
      />
    </div>
  )
}
