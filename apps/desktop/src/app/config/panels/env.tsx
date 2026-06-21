import { useCallback, useEffect, useMemo, useState } from 'react'

import { Button } from '../../../components/ui/button'
import { Codicon } from '../../../components/ui/codicon'
import { ConfirmDialog } from '../../../components/ui/confirm-dialog'
import { Input } from '../../../components/ui/input'
import { Loader } from '../../../components/ui/loader'

// Config » Env panel — per-provider API-key / environment-variable manager,
// ported from web/src/pages/EnvPage.tsx. Distinct from Keys (rotation pool) and
// Config (config.yaml): this edits ~/.hermes/.env, grouped by provider. The web
// page's OAuthProvidersCard is omitted (separate OAuth flow).

interface EnvVarInfo {
  is_set: boolean
  redacted_value: string | null
  description: string
  url: string | null
  category: string
  is_password: boolean
}

const PROVIDER_GROUPS: { prefix: string; name: string; priority: number }[] = [
  { prefix: 'NOUS_', name: 'Nous Portal', priority: 0 },
  { prefix: 'ANTHROPIC_', name: 'Anthropic', priority: 1 },
  { prefix: 'DASHSCOPE_', name: 'DashScope (Qwen)', priority: 2 },
  { prefix: 'HERMES_QWEN_', name: 'DashScope (Qwen)', priority: 2 },
  { prefix: 'DEEPSEEK_', name: 'DeepSeek', priority: 3 },
  { prefix: 'GOOGLE_', name: 'Gemini', priority: 4 },
  { prefix: 'GEMINI_', name: 'Gemini', priority: 4 },
  { prefix: 'GLM_', name: 'GLM / Z.AI', priority: 5 },
  { prefix: 'ZAI_', name: 'GLM / Z.AI', priority: 5 },
  { prefix: 'Z_AI_', name: 'GLM / Z.AI', priority: 5 },
  { prefix: 'HF_', name: 'Hugging Face', priority: 6 },
  { prefix: 'KIMI_', name: 'Kimi / Moonshot', priority: 7 },
  { prefix: 'MINIMAX_CN_', name: 'MiniMax (China)', priority: 9 },
  { prefix: 'MINIMAX_', name: 'MiniMax', priority: 8 },
  { prefix: 'OPENCODE_GO_', name: 'OpenCode Go', priority: 10 },
  { prefix: 'OPENCODE_ZEN_', name: 'OpenCode Zen', priority: 11 },
  { prefix: 'OPENROUTER_', name: 'OpenRouter', priority: 12 },
  { prefix: 'XIAOMI_', name: 'Xiaomi MiMo', priority: 13 },
]

const providerGroup = (key: string) => PROVIDER_GROUPS.find(g => key.startsWith(g.prefix))?.name ?? 'Other'
const providerPriority = (name: string) => PROVIDER_GROUPS.find(g => g.name === name)?.priority ?? 99

interface Group {
  name: string
  priority: number
  entries: [string, EnvVarInfo][]
  hasAnySet: boolean
}

interface Flash {
  msg: string
  kind: 'success' | 'error'
}

export function EnvPanel() {
  const [vars, setVars] = useState<Record<string, EnvVarInfo>>({})
  const [loading, setLoading] = useState(true)
  const [flash, setFlash] = useState<Flash | null>(null)
  const [edits, setEdits] = useState<Record<string, string>>({})
  const [revealed, setRevealed] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState<string | null>(null)
  const [clearTarget, setClearTarget] = useState<string | null>(null)

  const showFlash = useCallback((msg: string, kind: Flash['kind']) => {
    setFlash({ msg, kind })
    window.setTimeout(() => setFlash(null), 3000)
  }, [])

  const api = useCallback(<T,>(path: string, method = 'GET', body?: unknown) => {
    return window.hermesDesktop!.api<T>({ path, method, body })
  }, [])

  const load = useCallback(
    () => api<Record<string, EnvVarInfo>>('/api/env').then(setVars).catch(() => showFlash('Failed to load env vars', 'error')),
    [api, showFlash],
  )

  useEffect(() => {
    load().finally(() => setLoading(false))
  }, [load])

  const groups = useMemo<Group[]>(() => {
    const byName = new Map<string, Group>()

    for (const [key, info] of Object.entries(vars)) {
      const name = providerGroup(key)
      let g = byName.get(name)

      if (!g) {
        g = { name, priority: providerPriority(name), entries: [], hasAnySet: false }
        byName.set(name, g)
      }

      g.entries.push([key, info])

      if (info.is_set) {g.hasAnySet = true}
    }

    return [...byName.values()].sort((a, b) => a.priority - b.priority || a.name.localeCompare(b.name))
  }, [vars])

  const save = async (key: string) => {
    const value = edits[key]

    if (value === undefined || !value.trim()) {
      showFlash('Value required', 'error')

      return
    }

    setSaving(key)

    try {
      await api('/api/env', 'PUT', { key, value: value.trim() })
      showFlash(`${key} saved`, 'success')
      setEdits(prev => {
        const next = { ...prev }
        delete next[key]

        return next
      })
      await load()
    } catch (e) {
      showFlash(`Failed to save: ${e}`, 'error')
    } finally {
      setSaving(null)
    }
  }

  const reveal = async (key: string) => {
    if (revealed[key]) {
      setRevealed(prev => {
        const next = { ...prev }
        delete next[key]

        return next
      })

      return
    }

    try {
      const res = await api<{ value: string }>('/api/env/reveal', 'POST', { key })
      setRevealed(prev => ({ ...prev, [key]: res.value }))
    } catch (e) {
      showFlash(`Failed to reveal: ${e}`, 'error')
    }
  }

  const clear = async () => {
    if (!clearTarget) {return}
    await api('/api/env', 'DELETE', { key: clearTarget })
    showFlash(`${clearTarget} cleared`, 'success')
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
    <div className="flex flex-col gap-4">
      <p className="text-xs text-(--ui-text-tertiary)">
        Provider API keys live in <code className="font-mono">~/.hermes/.env</code>. Set a key to enable that provider.
      </p>

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

      {groups.map(group => (
        <div className="flex flex-col gap-1.5" key={group.name}>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-(--ui-text-secondary)">
            <Codicon name="key" />
            {group.name}
            {group.hasAnySet && <span className="rounded-full bg-emerald-500/10 px-1.5 text-[0.625rem] text-emerald-400">active</span>}
          </div>
          <div className="rounded-lg border border-(--stroke-nous) bg-(--ui-bg-1)">
            {group.entries.map(([key, info], i) => {
              const isEditing = edits[key] !== undefined
              const isRevealed = !!revealed[key]
              const busy = saving === key

              return (
                <div
                  className={`flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between ${
                    i > 0 ? 'border-t border-(--stroke-nous)/50' : ''
                  }`}
                  key={key}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs">{key}</span>
                      {info.is_set && !isEditing && <Codicon className="size-3 text-emerald-400" name="pass-filled" />}
                    </div>
                    {info.description && <span className="text-xs text-(--ui-text-tertiary)">{info.description}</span>}
                    {info.is_set && !isEditing && (
                      <div className="font-mono text-xs text-(--ui-text-secondary)">
                        {isRevealed ? revealed[key] : info.redacted_value ?? '••••••'}
                      </div>
                    )}
                  </div>

                  <div className="flex shrink-0 items-center gap-1.5">
                    {isEditing ? (
                      <>
                        <Input
                          autoFocus
                          className="h-7 w-48"
                          onChange={e => setEdits(prev => ({ ...prev, [key]: e.target.value }))}
                          placeholder={key}
                          type={info.is_password ? 'password' : 'text'}
                          value={edits[key]}
                        />
                        <Button disabled={busy} onClick={() => save(key)} size="sm">
                          {busy ? <Loader /> : 'Save'}
                        </Button>
                        <Button
                          aria-label="Cancel"
                          onClick={() =>
                            setEdits(prev => {
                              const next = { ...prev }
                              delete next[key]

                              return next
                            })
                          }
                          size="icon"
                          variant="ghost"
                        >
                          <Codicon name="close" />
                        </Button>
                      </>
                    ) : info.is_set ? (
                      <>
                        <Button aria-label="Reveal" onClick={() => reveal(key)} size="icon" variant="ghost">
                          <Codicon name={isRevealed ? 'eye-closed' : 'eye'} />
                        </Button>
                        <Button onClick={() => setEdits(prev => ({ ...prev, [key]: '' }))} size="sm" variant="ghost">
                          Edit
                        </Button>
                        <Button aria-label="Clear" className="text-destructive" onClick={() => setClearTarget(key)} size="icon" variant="ghost">
                          <Codicon name="trash" />
                        </Button>
                      </>
                    ) : (
                      <>
                        {info.url && (
                          <a className="inline-flex items-center gap-1 text-xs text-primary hover:underline" href={info.url} rel="noreferrer" target="_blank">
                            Get key <Codicon name="link-external" />
                          </a>
                        )}
                        <Button onClick={() => setEdits(prev => ({ ...prev, [key]: '' }))} size="sm" variant="ghost">
                          Set
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ))}

      <ConfirmDialog
        confirmLabel="Clear"
        description={clearTarget ? `Remove ${clearTarget} from .env?` : ''}
        destructive
        onClose={() => setClearTarget(null)}
        onConfirm={clear}
        open={!!clearTarget}
        title="Clear environment variable?"
      />
    </div>
  )
}
