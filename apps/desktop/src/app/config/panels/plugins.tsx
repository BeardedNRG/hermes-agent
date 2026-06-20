import { useCallback, useEffect, useState } from 'react'

import { Button } from '../../../components/ui/button'
import { Codicon } from '../../../components/ui/codicon'
import { ConfirmDialog } from '../../../components/ui/confirm-dialog'
import { Input } from '../../../components/ui/input'
import { Loader } from '../../../components/ui/loader'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../components/ui/select'
import { Switch } from '../../../components/ui/switch'

// Config » Plugins panel — ported from web/src/pages/PluginsPage.tsx. Memory /
// context-engine provider selection, install-from-identifier, and per-plugin
// enable/disable/update/visibility/remove. Dashboard-tab cross-links and orphan
// dashboard plugins (web-only routing concepts) are intentionally omitted.

const MEMORY_BUILTIN = '__hermes_memory_builtin__'

interface ProviderOption {
  name: string
  description: string
}

interface Providers {
  memory_provider: string
  memory_options: ProviderOption[]
  context_engine: string
  context_options: ProviderOption[]
}

interface PluginRow {
  name: string
  version: string
  description: string
  source: string
  runtime_status: 'disabled' | 'enabled' | 'inactive'
  has_dashboard_manifest: boolean
  can_remove: boolean
  can_update_git: boolean
  auth_required: boolean
  auth_command: string
  user_hidden: boolean
}

interface HubResponse {
  plugins: PluginRow[]
  providers: Providers
}

const pluginPath = (name: string) => name.split('/').map(encodeURIComponent).join('/')

type Tone = 'success' | 'danger' | 'neutral'

function Pill({ tone = 'neutral', children }: { tone?: Tone; children: React.ReactNode }) {
  const cls =
    tone === 'success'
      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
      : tone === 'danger'
        ? 'border-destructive/30 bg-destructive/10 text-destructive'
        : 'border-(--stroke-nous) bg-(--ui-bg-2) text-(--ui-text-secondary)'

  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[0.6875rem] font-medium ${cls}`}>
      {children}
    </span>
  )
}

function Card({ children, dim }: { children: React.ReactNode; dim?: boolean }) {
  return <div className={`rounded-lg border border-(--stroke-nous) bg-(--ui-bg-1) ${dim ? 'opacity-70' : ''}`}>{children}</div>
}

function CardHead({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="border-b border-(--stroke-nous) px-4 py-3">
      <div className="text-sm font-semibold">{title}</div>
      {hint && <p className="mt-0.5 text-xs text-(--ui-text-tertiary)">{hint}</p>}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid min-w-0 gap-1.5">
      <span className="text-xs text-(--ui-text-secondary)">{label}</span>
      {children}
    </div>
  )
}

interface Flash {
  msg: string
  kind: 'success' | 'error'
}

export function PluginsPanel() {
  const [hub, setHub] = useState<HubResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [flash, setFlash] = useState<Flash | null>(null)

  const [installId, setInstallId] = useState('')
  const [installForce, setInstallForce] = useState(false)
  const [installEnable, setInstallEnable] = useState(true)
  const [installBusy, setInstallBusy] = useState(false)
  const [rescanBusy, setRescanBusy] = useState(false)
  const [memorySel, setMemorySel] = useState(MEMORY_BUILTIN)
  const [contextSel, setContextSel] = useState('compressor')
  const [providerBusy, setProviderBusy] = useState(false)
  const [rowBusy, setRowBusy] = useState<string | null>(null)
  const [removeTarget, setRemoveTarget] = useState<string | null>(null)

  const showFlash = useCallback((msg: string, kind: Flash['kind']) => {
    setFlash({ msg, kind })
    window.setTimeout(() => setFlash(null), 3000)
  }, [])

  const api = useCallback(<T,>(path: string, method = 'GET', body?: unknown) => {
    return window.hermesDesktop!.api<T>({ path, method, body })
  }, [])

  const loadHub = useCallback(() => {
    return api<HubResponse>('/api/dashboard/plugins/hub')
      .then(h => {
        setHub(h)
        setMemorySel(h.providers.memory_provider || MEMORY_BUILTIN)
        setContextSel(h.providers.context_engine || 'compressor')
      })
      .catch(() => showFlash('Failed to load plugins', 'error'))
  }, [api, showFlash])

  useEffect(() => {
    setLoading(true)
    void loadHub().finally(() => setLoading(false))
  }, [loadHub])

  const onInstall = async () => {
    const id = installId.trim()

    if (!id) {
      showFlash('Enter a plugin identifier (owner/repo or URL)', 'error')

      return
    }

    setInstallBusy(true)

    try {
      const r = await api<{ plugin_name?: string; warnings?: string[]; missing_env?: string[] }>(
        '/api/dashboard/agent-plugins/install',
        'POST',
        { identifier: id, force: installForce, enable: installEnable },
      )

      showFlash(`${r.plugin_name ?? id} installed`, 'success')
      setInstallId('')
      await loadHub()
    } catch (e) {
      showFlash(e instanceof Error ? e.message : 'Install failed', 'error')
    } finally {
      setInstallBusy(false)
    }
  }

  const onRescan = async () => {
    setRescanBusy(true)

    try {
      const rc = await api<{ count: number }>('/api/dashboard/plugins/rescan')
      showFlash(`Rescanned (${rc.count})`, 'success')
      await loadHub()
    } catch (e) {
      showFlash(e instanceof Error ? e.message : 'Rescan failed', 'error')
    } finally {
      setRescanBusy(false)
    }
  }

  const onSaveProviders = async () => {
    setProviderBusy(true)

    try {
      await api('/api/dashboard/plugin-providers', 'PUT', {
        memory_provider: memorySel === MEMORY_BUILTIN ? '' : memorySel,
        context_engine: contextSel,
      })
      showFlash('Saved providers', 'success')
      await loadHub()
    } catch (e) {
      showFlash(e instanceof Error ? e.message : 'Save failed', 'error')
    } finally {
      setProviderBusy(false)
    }
  }

  const runRow = async (name: string, fn: () => Promise<unknown>) => {
    setRowBusy(name)

    try {
      await fn()
      await loadHub()
    } catch (e) {
      showFlash(e instanceof Error ? e.message : 'Failed', 'error')
    } finally {
      setRowBusy(null)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader className="text-2xl" />
      </div>
    )
  }

  const rows = hub?.plugins ?? []
  const providers = hub?.providers

  return (
    <div className="flex flex-col gap-6">
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

      {/* Providers */}
      {providers && (
        <Card>
          <CardHead hint="Swap the memory backend and context engine the agent uses." title="Providers" />
          <div className="flex flex-col gap-6 px-4 py-4">
            <div className="grid max-w-full gap-6 sm:grid-cols-2">
              <Field label="Memory provider">
                <Select onValueChange={setMemorySel} value={memorySel}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={MEMORY_BUILTIN}>(built-in)</SelectItem>
                    {providers.memory_options.map(o => (
                      <SelectItem key={o.name} value={o.name}>
                        {o.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Context engine">
                <Select onValueChange={setContextSel} value={contextSel}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="compressor">compressor</SelectItem>
                    {providers.context_options
                      .filter(o => o.name !== 'compressor')
                      .map(o => (
                        <SelectItem key={o.name} value={o.name}>
                          {o.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>
            <Button className="w-fit" disabled={providerBusy} onClick={onSaveProviders} size="sm">
              {providerBusy ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </Card>
      )}

      {/* Install */}
      <Card>
        <CardHead hint="Install an agent plugin from a GitHub repo or URL." title="Install" />
        <div className="flex flex-col gap-4 px-4 py-4">
          <Field label="Identifier">
            <Input
              className="font-mono lowercase"
              onChange={e => setInstallId(e.target.value)}
              placeholder="owner/repo or https://..."
              spellCheck={false}
              value={installId}
            />
          </Field>
          <div className="flex flex-wrap items-center gap-8">
            <label className="flex items-center gap-3 text-xs text-(--ui-text-secondary)">
              <Switch checked={installForce} onCheckedChange={setInstallForce} />
              Force reinstall
            </label>
            <label className="flex items-center gap-3 text-xs text-(--ui-text-secondary)">
              <Switch checked={installEnable} onCheckedChange={setInstallEnable} />
              Enable after install
            </label>
          </div>
          <div className="flex items-center gap-2">
            <Button className="w-fit" disabled={installBusy} onClick={onInstall} size="sm">
              {installBusy ? 'Installing…' : 'Install'}
            </Button>
            <Button disabled={rescanBusy} onClick={onRescan} size="sm" variant="ghost">
              {rescanBusy ? <Loader /> : <Codicon name="refresh" />}
              Rescan
            </Button>
          </div>
        </div>
      </Card>

      {/* Installed list */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-(--ui-text-secondary)">
          <Codicon name="extensions" />
          Installed plugins ({rows.length})
        </div>
        {rows.length === 0 ? (
          <Card>
            <div className="py-8 text-center text-sm text-(--ui-text-tertiary)">No plugins installed.</div>
          </Card>
        ) : (
          rows.map(row => {
            const busy = rowBusy === row.name

            const statusTone: Tone =
              row.runtime_status === 'enabled' ? 'success' : row.runtime_status === 'disabled' ? 'danger' : 'neutral'

            return (
              <Card dim={busy} key={row.name}>
                <div className="flex flex-col gap-3 px-4 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                      <span className="truncate font-semibold">{row.name}</span>
                      <Pill>src: {row.source}</Pill>
                      <Pill>v{row.version || '—'}</Pill>
                      <Pill tone={statusTone}>{row.runtime_status}</Pill>
                      {row.auth_required && <Pill tone="danger">auth required</Pill>}
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center gap-1">
                      {row.runtime_status === 'enabled' ? (
                        <Button
                          disabled={busy}
                          onClick={() => runRow(row.name, () => api(`/api/dashboard/agent-plugins/${pluginPath(row.name)}/disable`, 'POST'))}
                          size="sm"
                          variant="ghost"
                        >
                          Disable
                        </Button>
                      ) : (
                        <Button
                          disabled={busy}
                          onClick={() => runRow(row.name, () => api(`/api/dashboard/agent-plugins/${pluginPath(row.name)}/enable`, 'POST'))}
                          size="sm"
                          variant="ghost"
                        >
                          Enable
                        </Button>
                      )}
                      {row.can_update_git && (
                        <Button
                          disabled={busy}
                          onClick={() => runRow(row.name, () => api(`/api/dashboard/agent-plugins/${pluginPath(row.name)}/update`, 'POST'))}
                          size="sm"
                          variant="ghost"
                        >
                          Update
                        </Button>
                      )}
                      {row.has_dashboard_manifest && (
                        <Button
                          aria-label={row.user_hidden ? 'Show in sidebar' : 'Hide from sidebar'}
                          disabled={busy}
                          onClick={() => runRow(row.name, () => api(`/api/dashboard/plugins/${pluginPath(row.name)}/visibility`, 'POST', { hidden: !row.user_hidden }))}
                          size="icon"
                          variant="ghost"
                        >
                          <Codicon name={row.user_hidden ? 'eye-closed' : 'eye'} />
                        </Button>
                      )}
                      {row.can_remove && (
                        <Button
                          aria-label="Remove"
                          className="text-destructive"
                          disabled={busy}
                          onClick={() => setRemoveTarget(row.name)}
                          size="icon"
                          variant="ghost"
                        >
                          <Codicon name="trash" />
                        </Button>
                      )}
                    </div>
                  </div>
                  {row.description && <p className="text-xs text-(--ui-text-secondary)">{row.description}</p>}
                  {row.auth_required && row.auth_command && (
                    <code className="block rounded border border-(--stroke-nous) bg-(--ui-bg-2) px-3 py-2 font-mono text-xs text-(--ui-text-secondary)">
                      {row.auth_command}
                    </code>
                  )}
                </div>
              </Card>
            )
          })
        )}
      </div>

      <ConfirmDialog
        confirmLabel="Remove"
        description={removeTarget ? `This will remove the "${removeTarget}" plugin from your agent.` : ''}
        destructive
        onClose={() => setRemoveTarget(null)}
        onConfirm={async () => {
          const name = removeTarget

          if (!name) {return}
          await runRow(name, () => api(`/api/dashboard/agent-plugins/${pluginPath(name)}`, 'DELETE'))
        }}
        open={!!removeTarget}
        title="Remove plugin?"
      />
    </div>
  )
}
