import { useCallback, useEffect, useMemo, useState } from 'react'

import { Button } from '../../../components/ui/button'
import { Codicon } from '../../../components/ui/codicon'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../../components/ui/dialog'
import { Input } from '../../../components/ui/input'
import { Loader } from '../../../components/ui/loader'
import { Switch } from '../../../components/ui/switch'

// Config » Channels panel — messaging platforms, ported from
// web/src/pages/ChannelsPage.tsx. Enable/disable, test, and configure each
// channel's credentials (written to ~/.hermes/.env). The Telegram QR-onboarding
// convenience flow (depends on the qrcode package + telegram onboarding
// endpoints) is deferred; Telegram is still fully configurable via the standard
// Configure modal (bot token + allowed user IDs).

interface EnvVar {
  key: string
  required: boolean
  is_set: boolean
  redacted_value: string | null
  description: string
  prompt: string
  is_password: boolean
}

interface Platform {
  id: string
  name: string
  description: string
  docs_url: string
  enabled: boolean
  configured: boolean
  gateway_running: boolean
  state: string
  error_message: string | null
  env_vars: EnvVar[]
}

interface TestResult {
  ok: boolean
  state: string
  message: string
}

const STATE_BADGE: Record<string, { tone: Tone; label: string }> = {
  connected: { tone: 'success', label: 'Connected' },
  pending_restart: { tone: 'warning', label: 'Restart to apply' },
  gateway_stopped: { tone: 'warning', label: 'Gateway stopped' },
  disconnected: { tone: 'warning', label: 'Disconnected' },
  not_configured: { tone: 'neutral', label: 'Not configured' },
  disabled: { tone: 'neutral', label: 'Disabled' },
  fatal: { tone: 'danger', label: 'Error' },
}

const stateBadge = (state: string) => STATE_BADGE[state] ?? { tone: 'neutral' as Tone, label: state }

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

function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-lg border border-(--stroke-nous) bg-(--ui-bg-1) ${className ?? ''}`}>{children}</div>
}

interface Flash {
  msg: string
  kind: 'success' | 'error'
}

export function ChannelsPanel() {
  const [platforms, setPlatforms] = useState<Platform[]>([])
  const [loading, setLoading] = useState(true)
  const [flash, setFlash] = useState<Flash | null>(null)
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const [testingId, setTestingId] = useState<string | null>(null)
  const [restartNeeded, setRestartNeeded] = useState(false)
  const [restarting, setRestarting] = useState(false)

  const [editing, setEditing] = useState<Platform | null>(null)
  const [draftEnv, setDraftEnv] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  const showFlash = useCallback((msg: string, kind: Flash['kind']) => {
    setFlash({ msg, kind })
    window.setTimeout(() => setFlash(null), 3000)
  }, [])

  const api = useCallback(<T,>(path: string, method = 'GET', body?: unknown) => {
    return window.hermesDesktop!.api<T>({ path, method, body })
  }, [])

  const load = useCallback(
    () => api<{ platforms: Platform[] }>('/api/messaging/platforms').then(r => setPlatforms(r.platforms)).catch(() => {}),
    [api],
  )

  useEffect(() => {
    load().finally(() => setLoading(false))
  }, [load])

  const openConfig = (platform: Platform) => {
    const initial: Record<string, string> = {}
    platform.env_vars.forEach(v => {
      initial[v.key] = ''
    })
    setDraftEnv(initial)
    setEditing(platform)
  }

  const save = async () => {
    if (!editing) {return}
    const env: Record<string, string> = {}
    Object.entries(draftEnv).forEach(([k, v]) => {
      if (v.trim()) {env[k] = v.trim()}
    })

    if (Object.keys(env).length === 0) {
      showFlash('Nothing to save — fill in at least one field.', 'error')

      return
    }

    const missing = editing.env_vars.filter(v => v.required && !v.is_set && !env[v.key])

    if (missing.length > 0) {
      showFlash(`${missing[0].prompt || missing[0].key} is required`, 'error')

      return
    }

    setSaving(true)

    try {
      await api(`/api/messaging/platforms/${encodeURIComponent(editing.id)}`, 'PUT', { env, enabled: true })
      showFlash(`${editing.name} saved`, 'success')
      setEditing(null)
      setRestartNeeded(true)
      await load()
    } catch (e) {
      showFlash(`Failed to save: ${e}`, 'error')
    } finally {
      setSaving(false)
    }
  }

  const toggle = async (platform: Platform) => {
    const next = !platform.enabled
    setTogglingId(platform.id)

    try {
      await api(`/api/messaging/platforms/${encodeURIComponent(platform.id)}`, 'PUT', { enabled: next })
      setPlatforms(prev =>
        prev.map(p => (p.id === platform.id ? { ...p, enabled: next, state: next ? 'pending_restart' : 'disabled' } : p)),
      )
      setRestartNeeded(true)
    } catch (e) {
      showFlash(`Error: ${e}`, 'error')
    } finally {
      setTogglingId(null)
    }
  }

  const test = async (platform: Platform) => {
    setTestingId(platform.id)

    try {
      const res = await api<TestResult>(`/api/messaging/platforms/${encodeURIComponent(platform.id)}/test`, 'POST')
      showFlash(`${platform.name}: ${res.message}`, res.ok ? 'success' : 'error')
    } catch (e) {
      showFlash(`Error: ${e}`, 'error')
    } finally {
      setTestingId(null)
    }
  }

  const restart = async () => {
    setRestarting(true)

    try {
      await api('/api/gateway/restart', 'POST')
      showFlash('Gateway restarting…', 'success')
      setRestartNeeded(false)
      window.setTimeout(() => void load(), 4000)
    } catch (e) {
      showFlash(`Failed to restart: ${e}`, 'error')
    } finally {
      setRestarting(false)
    }
  }

  const configured = useMemo(() => platforms.filter(p => p.configured).length, [platforms])
  const gatewayRunning = platforms.length > 0 && platforms[0].gateway_running

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader className="text-2xl" />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
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

      {restartNeeded && (
        <Card className="border-amber-500/40">
          <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2 text-sm">
              <Codicon className="shrink-0 text-amber-400" name="warning" />
              <span>Changes are saved. Restart the gateway for them to take effect.</span>
            </div>
            <Button className="shrink-0" disabled={restarting} onClick={restart} size="sm">
              {restarting ? <Loader /> : <Codicon name="sync" />}
              {restarting ? 'Restarting…' : 'Restart now'}
            </Button>
          </div>
        </Card>
      )}

      {!gatewayRunning && !restartNeeded && (
        <Card>
          <div className="flex items-center gap-2 p-4 text-sm text-(--ui-text-secondary)">
            <Codicon className="shrink-0" name="debug-disconnect" />
            <span>
              The gateway is not running. Configure channels here, then start it with{' '}
              <code className="font-mono">hermes gateway start</code>.
            </span>
          </div>
        </Card>
      )}

      <p className="text-xs text-(--ui-text-tertiary)">
        {configured} of {platforms.length} channels configured. Credentials are written to{' '}
        <code className="font-mono">~/.hermes/.env</code>; the gateway connects each enabled channel on its next restart.
      </p>

      <div className="grid gap-3">
        {platforms.map(platform => {
          const badge = stateBadge(platform.state)
          const busy = togglingId === platform.id
          const icon = platform.state === 'connected' ? 'pass-filled' : platform.state === 'fatal' ? 'error' : 'broadcast'

          return (
            <Card key={platform.id}>
              <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-start gap-3">
                  <Codicon
                    className={`mt-0.5 shrink-0 ${
                      platform.state === 'connected'
                        ? 'text-emerald-400'
                        : platform.state === 'fatal'
                          ? 'text-destructive'
                          : 'text-(--ui-text-tertiary)'
                    }`}
                    name={icon}
                  />
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium">{platform.name}</span>
                      <Pill tone={badge.tone}>{badge.label}</Pill>
                    </div>
                    <span className="text-xs text-(--ui-text-tertiary)">{platform.description}</span>
                    {platform.error_message && <span className="text-xs text-destructive">{platform.error_message}</span>}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2 self-start sm:self-center">
                  {busy ? (
                    <Loader />
                  ) : (
                    <Switch aria-label={`Enable ${platform.name}`} checked={platform.enabled} onCheckedChange={() => void toggle(platform)} />
                  )}
                  <Button disabled={testingId === platform.id} onClick={() => test(platform)} size="sm" variant="ghost">
                    {testingId === platform.id ? <Loader /> : <Codicon name="plug" />}
                    Test
                  </Button>
                  <Button onClick={() => openConfig(platform)} size="sm">
                    <Codicon name="settings-gear" />
                    Configure
                  </Button>
                </div>
              </div>
            </Card>
          )
        })}
      </div>

      {/* Configure modal */}
      <Dialog onOpenChange={v => !v && setEditing(null)} open={editing !== null}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Configure {editing?.name}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="grid gap-4">
              {editing.docs_url && (
                <a
                  className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                  href={editing.docs_url}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  Setup guide <Codicon name="link-external" />
                </a>
              )}
              <p className="text-xs text-(--ui-text-tertiary)">{editing.description}</p>
              {editing.env_vars.map(field => (
                <div className="grid gap-1.5" key={field.key}>
                  <span className="text-xs text-(--ui-text-secondary)">
                    {field.prompt || field.key}
                    {field.required ? ' *' : ''}
                  </span>
                  {field.description && <span className="text-xs text-(--ui-text-tertiary)">{field.description}</span>}
                  <Input
                    onChange={e => setDraftEnv(prev => ({ ...prev, [field.key]: e.target.value }))}
                    placeholder={field.is_set ? field.redacted_value || '•••••• (set — leave blank to keep)' : field.key}
                    type={field.is_password ? 'password' : 'text'}
                    value={draftEnv[field.key] ?? ''}
                  />
                </div>
              ))}
              <div className="flex justify-end gap-2 pt-1">
                <Button onClick={() => setEditing(null)} size="sm" variant="ghost">
                  Cancel
                </Button>
                <Button disabled={saving} onClick={save} size="sm">
                  {saving ? 'Saving…' : 'Save & enable'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
