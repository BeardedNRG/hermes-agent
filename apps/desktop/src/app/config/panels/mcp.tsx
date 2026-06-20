import { useCallback, useEffect, useState } from 'react'

import { Button } from '../../../components/ui/button'
import { Codicon } from '../../../components/ui/codicon'
import { ConfirmDialog } from '../../../components/ui/confirm-dialog'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../../components/ui/dialog'
import { Input } from '../../../components/ui/input'
import { Loader } from '../../../components/ui/loader'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../components/ui/select'
import { Textarea } from '../../../components/ui/textarea'

// Config » MCP panel — ported from web/src/pages/McpPage.tsx. Manage MCP
// servers (add http/stdio, test, enable/disable, delete) and install from the
// Nous-approved catalog (prompting for required env when needed).

type Transport = 'http' | 'stdio'

interface McpServer {
  name: string
  transport: 'http' | 'stdio' | 'unknown'
  url: string | null
  command: string | null
  args: string[]
  env: Record<string, string>
  enabled: boolean
}

interface McpTestResult {
  ok: boolean
  error?: string
  tools: { name: string; description: string }[]
}

interface RequiredEnv {
  name: string
  prompt: string
  required: boolean
}

interface McpCatalogEntry {
  name: string
  description: string
  source: string
  transport: 'http' | 'stdio'
  required_env: RequiredEnv[]
  installed: boolean
  enabled: boolean
}

interface McpDiagnostic {
  name: string
  kind: string
  message: string
}

const parseArgs = (raw: string) => raw.split(/[\s,]+/).map(s => s.trim()).filter(Boolean)

function parseEnv(raw: string): Record<string, string> {
  const env: Record<string, string> = {}
  raw
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean)
    .forEach(line => {
      const idx = line.indexOf('=')

      if (idx === -1) {return}
      const key = line.slice(0, idx).trim()

      if (key) {env[key] = line.slice(idx + 1).trim()}
    })

  return env
}

function Pill({ tone = 'neutral', children }: { tone?: 'success' | 'warning' | 'neutral'; children: React.ReactNode }) {
  const cls =
    tone === 'success'
      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
      : tone === 'warning'
        ? 'border-amber-500/30 bg-amber-500/10 text-amber-400'
        : 'border-(--stroke-nous) bg-(--ui-bg-2) text-(--ui-text-secondary)'

  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[0.6875rem] font-medium ${cls}`}>
      {children}
    </span>
  )
}

const transportTone = (t: string): 'success' | 'warning' | 'neutral' =>
  t === 'http' ? 'success' : t === 'stdio' ? 'warning' : 'neutral'

function Card({ children, dim }: { children: React.ReactNode; dim?: boolean }) {
  return <div className={`rounded-lg border border-(--stroke-nous) bg-(--ui-bg-1) ${dim ? 'opacity-60' : ''}`}>{children}</div>
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <span className="text-xs text-(--ui-text-secondary)">{label}</span>
      {children}
    </div>
  )
}

interface Flash {
  msg: string
  kind: 'success' | 'error'
}

export function McpPanel() {
  const [servers, setServers] = useState<McpServer[]>([])
  const [catalog, setCatalog] = useState<McpCatalogEntry[]>([])
  const [diagnostics, setDiagnostics] = useState<McpDiagnostic[]>([])
  const [loading, setLoading] = useState(true)
  const [flash, setFlash] = useState<Flash | null>(null)
  const [restartNote, setRestartNote] = useState<string | null>(null)

  const [testing, setTesting] = useState<string | null>(null)
  const [testResults, setTestResults] = useState<Record<string, McpTestResult>>({})
  const [togglingName, setTogglingName] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)

  // Add-server modal
  const [addOpen, setAddOpen] = useState(false)
  const [name, setName] = useState('')
  const [transport, setTransport] = useState<Transport>('http')
  const [url, setUrl] = useState('')
  const [command, setCommand] = useState('')
  const [args, setArgs] = useState('')
  const [env, setEnv] = useState('')
  const [creating, setCreating] = useState(false)

  // Catalog install-env modal
  const [installEntry, setInstallEntry] = useState<McpCatalogEntry | null>(null)
  const [installEnv, setInstallEnv] = useState<Record<string, string>>({})
  const [installingName, setInstallingName] = useState<string | null>(null)

  const showFlash = useCallback((msg: string, kind: Flash['kind']) => {
    setFlash({ msg, kind })
    window.setTimeout(() => setFlash(null), 3000)
  }, [])

  const api = useCallback(<T,>(path: string, method = 'GET', body?: unknown) => {
    return window.hermesDesktop!.api<T>({ path, method, body })
  }, [])

  const loadServers = useCallback(
    () => api<{ servers: McpServer[] }>('/api/mcp/servers').then(r => setServers(r.servers)).catch(() => {}),
    [api],
  )

  const loadCatalog = useCallback(
    () =>
      api<{ entries: McpCatalogEntry[]; diagnostics: McpDiagnostic[] }>('/api/mcp/catalog')
        .then(r => {
          setCatalog(r.entries)
          setDiagnostics(r.diagnostics)
        })
        .catch(() => {}),
    [api],
  )

  useEffect(() => {
    Promise.all([loadServers(), loadCatalog()]).finally(() => setLoading(false))
  }, [loadServers, loadCatalog])

  const resetAddForm = () => {
    setName('')
    setUrl('')
    setCommand('')
    setArgs('')
    setEnv('')
    setTransport('http')
  }

  const create = async () => {
    if (!name.trim()) {return showFlash('Name required', 'error')}

    if (transport === 'http' && !url.trim()) {return showFlash('URL required', 'error')}

    if (transport === 'stdio' && !command.trim()) {return showFlash('Command required', 'error')}
    setCreating(true)

    try {
      const body: Record<string, unknown> = { name: name.trim() }

      if (transport === 'http') {
        body.url = url.trim()
      } else {
        body.command = command.trim()
        const argList = parseArgs(args)

        if (argList.length) {body.args = argList}
      }

      const envMap = parseEnv(env)

      if (Object.keys(envMap).length) {body.env = envMap}
      await api('/api/mcp/servers', 'POST', body)
      showFlash('Server added', 'success')
      resetAddForm()
      setAddOpen(false)
      loadServers()
    } catch (e) {
      showFlash(`Failed to add: ${e}`, 'error')
    } finally {
      setCreating(false)
    }
  }

  const test = async (server: McpServer) => {
    setTesting(server.name)

    try {
      const result = await api<McpTestResult>(`/api/mcp/servers/${encodeURIComponent(server.name)}/test`, 'POST')
      setTestResults(prev => ({ ...prev, [server.name]: result }))
      showFlash(result.ok ? `${server.name}: ${result.tools.length} tool(s)` : `${server.name}: ${result.error ?? 'Failed'}`, result.ok ? 'success' : 'error')
    } catch (e) {
      showFlash(`Error: ${e}`, 'error')
    } finally {
      setTesting(null)
    }
  }

  const toggleEnabled = async (server: McpServer) => {
    const next = !server.enabled
    setTogglingName(server.name)

    try {
      await api(`/api/mcp/servers/${encodeURIComponent(server.name)}/enabled`, 'PUT', { enabled: next })
      setServers(prev => prev.map(s => (s.name === server.name ? { ...s, enabled: next } : s)))
      setRestartNote('Enable/disable takes effect on the next gateway restart.')
    } catch (e) {
      showFlash(`Error: ${e}`, 'error')
    } finally {
      setTogglingName(null)
    }
  }

  const remove = async () => {
    if (!deleteTarget) {return}
    await api(`/api/mcp/servers/${encodeURIComponent(deleteTarget)}`, 'DELETE')
    showFlash(`Deleted "${deleteTarget}"`, 'success')
    setTestResults(prev => {
      const next = { ...prev }
      delete next[deleteTarget]

      return next
    })
    loadServers()
  }

  const runInstall = async (entry: McpCatalogEntry, envMap: Record<string, string>) => {
    setInstallingName(entry.name)

    try {
      const res = await api<{ background: boolean }>('/api/mcp/catalog/install', 'POST', {
        name: entry.name,
        env: envMap,
        enable: true,
      })

      showFlash(res.background ? 'Installing in background…' : `Installed "${entry.name}"`, 'success')
      setInstallEntry(null)
      setInstallEnv({})
      await Promise.all([loadServers(), loadCatalog()])
    } catch (e) {
      showFlash(`Failed to install: ${e}`, 'error')
    } finally {
      setInstallingName(null)
    }
  }

  const onInstallClick = (entry: McpCatalogEntry) => {
    if (entry.required_env.length > 0) {
      const initial: Record<string, string> = {}
      entry.required_env.forEach(item => {
        initial[item.name] = ''
      })
      setInstallEnv(initial)
      setInstallEntry(entry)
    } else {
      void runInstall(entry, {})
    }
  }

  const submitInstall = () => {
    if (!installEntry) {return}
    const missing = installEntry.required_env.filter(item => item.required && !(installEnv[item.name] ?? '').trim())

    if (missing.length > 0) {return showFlash(`${missing[0].prompt} required`, 'error')}
    const envMap: Record<string, string> = {}
    Object.entries(installEnv).forEach(([k, v]) => {
      if (v.trim()) {envMap[k] = v.trim()}
    })
    void runInstall(installEntry, envMap)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader className="text-2xl" />
      </div>
    )
  }

  const diagByName: Record<string, McpDiagnostic[]> = {}
  diagnostics.forEach(d => {
    ;(diagByName[d.name] ??= []).push(d)
  })

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-end">
        <Button onClick={() => setAddOpen(true)} size="sm">
          <Codicon name="add" />
          Add server
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

      {/* Servers */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-(--ui-text-secondary)">
          <Codicon name="server-process" />
          Your MCP servers ({servers.length})
        </div>
        {restartNote && <p className="text-xs text-amber-400">{restartNote}</p>}
        {servers.length === 0 ? (
          <Card>
            <div className="py-8 text-center text-sm text-(--ui-text-tertiary)">No MCP servers configured.</div>
          </Card>
        ) : (
          servers.map(server => {
            const envCount = Object.keys(server.env ?? {}).length
            const result = testResults[server.name]

            return (
              <Card dim={!server.enabled} key={server.name}>
                <div className="flex items-start gap-4 px-4 py-4">
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex items-center gap-2">
                      <span className="truncate text-sm font-medium">{server.name}</span>
                      <Pill tone={transportTone(server.transport)}>{server.transport}</Pill>
                      {!server.enabled && <Pill>disabled</Pill>}
                    </div>
                    <div className="flex items-center gap-4 text-xs text-(--ui-text-tertiary)">
                      <span className="truncate font-mono">
                        {server.transport === 'http'
                          ? server.url ?? '—'
                          : [server.command, ...(server.args ?? [])].filter(Boolean).join(' ') || '—'}
                      </span>
                      {envCount > 0 && <span>{envCount} env var{envCount === 1 ? '' : 's'}</span>}
                    </div>
                    {result && (
                      <div className="mt-2 text-xs">
                        {result.ok ? (
                          <p className="text-emerald-400">
                            {result.tools.length === 0 ? 'Connected — no tools' : `Tools: ${result.tools.map(t => t.name).join(', ')}`}
                          </p>
                        ) : (
                          <p className="text-destructive">{result.error ?? 'Connection failed'}</p>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button disabled={togglingName === server.name} onClick={() => toggleEnabled(server)} size="sm" variant="ghost">
                      {togglingName === server.name ? <Loader /> : <Codicon name="circle-large-outline" />}
                      {server.enabled ? 'Disable' : 'Enable'}
                    </Button>
                    <Button aria-label="Test connection" disabled={testing === server.name} onClick={() => test(server)} size="icon" variant="ghost">
                      {testing === server.name ? <Loader /> : <Codicon name="zap" />}
                    </Button>
                    <Button aria-label="Delete" className="text-destructive" onClick={() => setDeleteTarget(server.name)} size="icon" variant="ghost">
                      <Codicon name="trash" />
                    </Button>
                  </div>
                </div>
              </Card>
            )
          })
        )}
      </div>

      {/* Catalog */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-(--ui-text-secondary)">
          <Codicon name="package" />
          Catalog ({catalog.length})
        </div>
        <p className="text-xs text-(--ui-text-tertiary)">Browse Nous-approved MCP servers and install with one click.</p>
        {catalog.length === 0 ? (
          <Card>
            <div className="py-8 text-center text-sm text-(--ui-text-tertiary)">No catalog entries available.</div>
          </Card>
        ) : (
          catalog.map(entry => {
            const entryDiags = diagByName[entry.name] ?? []
            const isInstalling = installingName === entry.name

            return (
              <Card key={entry.name}>
                <div className="flex items-start gap-4 px-4 py-4">
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      <span className="truncate text-sm font-medium">{entry.name}</span>
                      <Pill tone={transportTone(entry.transport)}>{entry.transport}</Pill>
                      <Pill>{entry.source === 'official' ? 'official' : entry.source}</Pill>
                      {entry.installed && <Pill tone="success">installed</Pill>}
                      {entry.installed && !entry.enabled && <Pill>disabled</Pill>}
                    </div>
                    {entry.description && <p className="text-xs text-(--ui-text-tertiary)">{entry.description}</p>}
                    {entryDiags.map((d, i) => (
                      <p className="mt-1 text-xs text-amber-400" key={`${entry.name}-diag-${i}`}>
                        {d.message}
                      </p>
                    ))}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {entry.installed ? (
                      <Pill tone="success">installed</Pill>
                    ) : (
                      <Button disabled={isInstalling} onClick={() => onInstallClick(entry)} size="sm">
                        {isInstalling ? 'Installing…' : 'Install'}
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            )
          })
        )}
      </div>

      {/* Add-server modal */}
      <Dialog onOpenChange={v => !v && setAddOpen(false)} open={addOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add MCP server</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4">
            <Field label="Name">
              <Input onChange={e => setName(e.target.value)} placeholder="my-server" value={name} />
            </Field>
            <Field label="Transport">
              <Select onValueChange={v => setTransport(v as Transport)} value={transport}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="http">HTTP/SSE</SelectItem>
                  <SelectItem value="stdio">stdio</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            {transport === 'http' ? (
              <Field label="URL">
                <Input onChange={e => setUrl(e.target.value)} placeholder="https://example.com/mcp" value={url} />
              </Field>
            ) : (
              <>
                <Field label="Command">
                  <Input onChange={e => setCommand(e.target.value)} placeholder="npx" value={command} />
                </Field>
                <Field label="Args">
                  <Input onChange={e => setArgs(e.target.value)} placeholder="-y @modelcontextprotocol/server-foo" value={args} />
                </Field>
              </>
            )}
            <Field label="Environment (KEY=VALUE per line)">
              <Textarea className="min-h-20 font-mono" onChange={e => setEnv(e.target.value)} placeholder={'API_KEY=secret\nDEBUG=1'} value={env} />
            </Field>
            <div className="flex justify-end">
              <Button disabled={creating} onClick={create} size="sm">
                {creating ? 'Adding…' : 'Add'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Catalog install-env modal */}
      <Dialog onOpenChange={v => !v && setInstallEntry(null)} open={installEntry !== null}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Install {installEntry?.name}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4">
            <p className="text-xs text-(--ui-text-tertiary)">This MCP requires the following values to be configured.</p>
            {installEntry?.required_env.map(item => (
              <Field key={item.name} label={`${item.prompt}${item.required ? ' *' : ''}`}>
                <Input
                  onChange={e => setInstallEnv(prev => ({ ...prev, [item.name]: e.target.value }))}
                  placeholder={item.name}
                  type="password"
                  value={installEnv[item.name] ?? ''}
                />
              </Field>
            ))}
            <div className="flex justify-end">
              <Button disabled={installingName === installEntry?.name} onClick={submitInstall} size="sm">
                {installingName === installEntry?.name ? 'Installing…' : 'Install'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        confirmLabel="Remove"
        description={deleteTarget ? `"${deleteTarget}" will be removed.` : ''}
        destructive
        onClose={() => setDeleteTarget(null)}
        onConfirm={remove}
        open={!!deleteTarget}
        title="Remove MCP server?"
      />
    </div>
  )
}
