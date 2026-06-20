import { useCallback, useEffect, useState } from 'react'

import { Button } from '../../../components/ui/button'
import { Codicon } from '../../../components/ui/codicon'
import { ConfirmDialog } from '../../../components/ui/confirm-dialog'
import { Input } from '../../../components/ui/input'
import { Loader } from '../../../components/ui/loader'

// Config » Keys panel — pooled API credentials, ported from the credential-pool
// section of web/src/pages/SystemPage.tsx. Add keys per provider so the agent
// rotates through them; remove individual entries.

interface PoolEntry {
  index: number
  label: string | null
  auth_type: string | null
  last_status: string | null
  token_preview: string
}

interface PoolProvider {
  provider: string
  entries: PoolEntry[]
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-(--stroke-nous) bg-(--ui-bg-2) px-2 py-0.5 text-[0.6875rem] font-medium text-(--ui-text-secondary)">
      {children}
    </span>
  )
}

function Card({ children }: { children: React.ReactNode }) {
  return <div className="rounded-lg border border-(--stroke-nous) bg-(--ui-bg-1)">{children}</div>
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

export function KeysPanel() {
  const [pool, setPool] = useState<PoolProvider[]>([])
  const [loading, setLoading] = useState(true)
  const [flash, setFlash] = useState<Flash | null>(null)

  const [provider, setProvider] = useState('openrouter')
  const [apiKey, setApiKey] = useState('')
  const [label, setLabel] = useState('')
  const [adding, setAdding] = useState(false)
  const [removeTarget, setRemoveTarget] = useState<{ provider: string; index: number } | null>(null)

  const showFlash = useCallback((msg: string, kind: Flash['kind']) => {
    setFlash({ msg, kind })
    window.setTimeout(() => setFlash(null), 3000)
  }, [])

  const api = useCallback(<T,>(path: string, method = 'GET', body?: unknown) => {
    return window.hermesDesktop!.api<T>({ path, method, body })
  }, [])

  const load = useCallback(
    () => api<{ providers: PoolProvider[] }>('/api/credentials/pool').then(r => setPool(r.providers)).catch(() => {}),
    [api],
  )

  useEffect(() => {
    load().finally(() => setLoading(false))
  }, [load])

  const add = async () => {
    if (!provider.trim() || !apiKey.trim()) {
      showFlash('Provider and API key required', 'error')

      return
    }

    setAdding(true)

    try {
      await api('/api/credentials/pool', 'POST', {
        provider: provider.trim(),
        api_key: apiKey.trim(),
        label: label.trim() || undefined,
      })
      showFlash('Credential added', 'success')
      setApiKey('')
      setLabel('')
      await load()
    } catch (e) {
      showFlash(`Failed to add credential: ${e}`, 'error')
    } finally {
      setAdding(false)
    }
  }

  const remove = async () => {
    if (!removeTarget) {return}
    await api(`/api/credentials/pool/${encodeURIComponent(removeTarget.provider)}/${removeTarget.index}`, 'DELETE')
    showFlash('Credential removed', 'success')
    await load()
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader className="text-2xl" />
      </div>
    )
  }

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

      {/* Add */}
      <Card>
        <div className="flex flex-col gap-4 px-4 py-4">
          <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-4">
            <Field label="Provider">
              <Input onChange={e => setProvider(e.target.value)} placeholder="openrouter" value={provider} />
            </Field>
            <div className="sm:col-span-2">
              <Field label="API key">
                <Input onChange={e => setApiKey(e.target.value)} placeholder="sk-…" type="password" value={apiKey} />
              </Field>
            </div>
            <Field label="Label">
              <Input onChange={e => setLabel(e.target.value)} placeholder="optional" value={label} />
            </Field>
          </div>
          <div className="flex justify-end">
            <Button disabled={adding} onClick={add} size="sm">
              {adding ? 'Adding…' : 'Add key'}
            </Button>
          </div>
        </div>
      </Card>

      {/* Pool */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-(--ui-text-secondary)">
          <Codicon name="key" />
          Credential pool
        </div>
        {pool.length === 0 ? (
          <Card>
            <div className="py-8 text-center text-sm text-(--ui-text-tertiary)">
              No pooled credentials. Add one above to enable key rotation.
            </div>
          </Card>
        ) : (
          pool.map(prov => (
            <div className="flex flex-col gap-2" key={prov.provider}>
              <span className="text-[0.6875rem] uppercase tracking-wider text-(--ui-text-tertiary)">{prov.provider}</span>
              {prov.entries.map(entry => (
                <Card key={`${prov.provider}-${entry.index}`}>
                  <div className="flex items-center gap-3 px-3 py-2">
                    <span className="text-sm font-medium">{entry.label || `key ${entry.index + 1}`}</span>
                    <span className="font-mono text-xs text-(--ui-text-tertiary)">{entry.token_preview}</span>
                    {entry.auth_type && <Pill>{entry.auth_type}</Pill>}
                    {entry.last_status && <Pill>{entry.last_status}</Pill>}
                    <Button
                      aria-label="Remove credential"
                      className="ml-auto text-destructive"
                      onClick={() => setRemoveTarget({ provider: prov.provider, index: entry.index })}
                      size="icon"
                      variant="ghost"
                    >
                      <Codicon name="trash" />
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          ))
        )}
      </div>

      <ConfirmDialog
        confirmLabel="Remove"
        description="Remove this pooled API key? The agent will no longer rotate through it."
        destructive
        onClose={() => setRemoveTarget(null)}
        onConfirm={remove}
        open={!!removeTarget}
        title="Remove credential?"
      />
    </div>
  )
}
