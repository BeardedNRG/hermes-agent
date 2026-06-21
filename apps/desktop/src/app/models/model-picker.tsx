import { useEffect, useMemo, useRef, useState } from 'react'

import { Button } from '../../components/ui/button'
import { Codicon } from '../../components/ui/codicon'
import { Dialog, DialogContent } from '../../components/ui/dialog'
import { Input } from '../../components/ui/input'
import { Loader } from '../../components/ui/loader'

// Standalone two-stage model picker (provider → model), ported from
// web/src/components/ModelPickerDialog.tsx. Substring filter replaces the web
// build's fuzzy-rank dependency. Always persists globally (config.yaml).

interface ModelOptionProvider {
  name: string
  slug: string
  models?: string[]
  total_models?: number
  is_current?: boolean
  warning?: string
}

export interface ModelOptionsResponse {
  model?: string
  provider?: string
  providers?: ModelOptionProvider[]
}

interface Props {
  loader: () => Promise<ModelOptionsResponse>
  onApply: (args: { provider: string; model: string }) => Promise<void> | void
  onClose: () => void
  title?: string
}

export function ModelPicker({ loader, onApply, onClose, title = 'Switch Model' }: Props) {
  const [providers, setProviders] = useState<ModelOptionProvider[]>([])
  const [currentModel, setCurrentModel] = useState('')
  const [currentProviderSlug, setCurrentProviderSlug] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedSlug, setSelectedSlug] = useState('')
  const [selectedModel, setSelectedModel] = useState('')
  const [query, setQuery] = useState('')
  const [applying, setApplying] = useState(false)
  const closedRef = useRef(false)

  useEffect(() => {
    closedRef.current = false
    loader()
      .then(r => {
        if (closedRef.current) {return}
        const next = r?.providers ?? []
        setProviders(next)
        setCurrentModel(String(r?.model ?? ''))
        setCurrentProviderSlug(String(r?.provider ?? ''))
        setSelectedSlug((next.find(p => p.is_current) ?? next[0])?.slug ?? '')
        setLoading(false)
      })
      .catch(e => {
        if (closedRef.current) {return}
        setError(e instanceof Error ? e.message : String(e))
        setLoading(false)
      })

    return () => {
      closedRef.current = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const q = query.trim().toLowerCase()
  const selectedProvider = useMemo(() => providers.find(p => p.slug === selectedSlug) ?? null, [providers, selectedSlug])
  const allModels = useMemo(() => selectedProvider?.models ?? [], [selectedProvider])

  const filteredProviders = useMemo(() => {
    if (!q) {return providers}

    return providers.filter(p => `${p.name} ${p.slug} ${(p.models ?? []).join(' ')}`.toLowerCase().includes(q))
  }, [providers, q])

  const filteredModels = useMemo(() => {
    if (!q) {return allModels}

    return allModels.filter(m => m.toLowerCase().includes(q))
  }, [allModels, q])

  const canConfirm = !!selectedProvider && !!selectedModel && !applying

  const confirm = async () => {
    if (!selectedProvider || !selectedModel || applying) {return}
    setApplying(true)

    try {
      await onApply({ provider: selectedProvider.slug, model: selectedModel })
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setApplying(false)
    }
  }

  return (
    <Dialog onOpenChange={v => !v && onClose()} open>
      <DialogContent className="flex max-h-[80vh] w-full max-w-3xl flex-col gap-0 p-0">
        <div className="border-b border-(--stroke-nous) p-4">
          <h2 className="text-sm font-semibold">{title}</h2>
          <p className="mt-1 font-mono text-xs text-(--ui-text-tertiary)">
            current: {currentModel || '(unknown)'}
            {currentProviderSlug && ` · ${currentProviderSlug}`}
          </p>
        </div>

        <div className="border-b border-(--stroke-nous) p-3">
          <div className="relative">
            <Codicon className="absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-(--ui-text-tertiary)" name="search" />
            <Input autoFocus className="h-8 pl-7" onChange={e => setQuery(e.target.value)} placeholder="Filter providers and models…" value={query} />
          </div>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-[200px_1fr] overflow-hidden">
          {/* Providers */}
          <div className="overflow-y-auto border-r border-(--stroke-nous)">
            {loading && (
              <div className="flex items-center gap-2 p-4 text-xs text-(--ui-text-tertiary)">
                <Loader /> loading…
              </div>
            )}
            {error && <div className="p-4 text-xs text-destructive">{error}</div>}
            {!loading && !error && filteredProviders.length === 0 && (
              <div className="p-4 text-xs italic text-(--ui-text-tertiary)">no matches</div>
            )}
            {filteredProviders.map(p => {
              const active = p.slug === selectedSlug

              return (
                <button
                  className={`flex w-full items-start gap-1.5 border-l-2 px-3 py-2 text-left text-xs transition-colors ${
                    active
                      ? 'border-l-primary bg-(--ui-control-active-background)'
                      : 'border-l-transparent hover:bg-(--ui-control-hover-background)'
                  }`}
                  key={p.slug}
                  onClick={() => {
                    setSelectedSlug(p.slug)
                    setSelectedModel('')
                  }}
                  type="button"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate font-medium">{p.name}</span>
                      {p.is_current && <span className="shrink-0 text-primary">current</span>}
                    </div>
                    <div className="truncate font-mono text-(--ui-text-tertiary)">
                      {p.slug} · {p.total_models ?? p.models?.length ?? 0} models
                    </div>
                  </div>
                </button>
              )
            })}
          </div>

          {/* Models */}
          <div className="overflow-y-auto">
            {!selectedProvider ? (
              <div className="p-4 text-xs italic text-(--ui-text-tertiary)">pick a provider →</div>
            ) : (
              <>
                {selectedProvider.warning && (
                  <div className="border-b border-(--stroke-nous) p-3 text-xs text-destructive">{selectedProvider.warning}</div>
                )}
                {filteredModels.length === 0 ? (
                  <div className="p-4 text-xs italic text-(--ui-text-tertiary)">
                    {allModels.length ? 'no models match your filter' : 'no models listed for this provider'}
                  </div>
                ) : (
                  filteredModels.map(m => {
                    const active = m === selectedModel
                    const isCurrent = m === currentModel && selectedProvider.slug === currentProviderSlug

                    return (
                      <button
                        className={`flex w-full items-center gap-2 px-3 py-1.5 text-left font-mono text-xs transition-colors ${
                          active ? 'bg-(--ui-control-active-background)' : 'hover:bg-(--ui-control-hover-background)'
                        }`}
                        key={m}
                        onClick={() => setSelectedModel(m)}
                        onDoubleClick={() => {
                          setSelectedModel(m)
                          window.setTimeout(confirm, 0)
                        }}
                        type="button"
                      >
                        <Codicon className={`size-3 shrink-0 ${active ? 'text-primary' : 'opacity-0'}`} name="check" />
                        <span className="flex-1 truncate">{m}</span>
                        {isCurrent && <span className="shrink-0 text-primary">current</span>}
                      </button>
                    )
                  })
                )}
              </>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-(--stroke-nous) p-3">
          <span className="text-xs text-(--ui-text-tertiary)">Saves to config.yaml — applies to new sessions.</span>
          <div className="ml-auto flex items-center gap-2">
            <Button disabled={applying} onClick={onClose} size="sm" variant="ghost">
              Cancel
            </Button>
            <Button disabled={!canConfirm} onClick={confirm} size="sm">
              {applying ? <Loader /> : 'Switch'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
