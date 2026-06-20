import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { Button } from '../../components/ui/button'
import { Codicon } from '../../components/ui/codicon'
import { ConfirmDialog } from '../../components/ui/confirm-dialog'
import { Input } from '../../components/ui/input'
import { Loader } from '../../components/ui/loader'

import { AutoField } from './auto-field'
import { getNestedValue, setNestedValue } from './nested'

// Config schema editor — ported from web/src/pages/ConfigPage.tsx. Drives the
// backend /api/config + /api/config/schema|defaults|raw endpoints through the
// desktop IPC bridge. Form mode (category sidebar + AutoField) and raw YAML mode.

type SchemaMap = Record<string, Record<string, unknown>>

interface StatusResponse {
  config_path?: string
}

// Codicon names per config category (default 'question' for unknown).
const CATEGORY_ICON: Record<string, string> = {
  general: 'settings-gear',
  agent: 'robot',
  terminal: 'terminal',
  display: 'symbol-color',
  delegation: 'organization',
  memory: 'database',
  compression: 'archive',
  security: 'lock',
  browser: 'globe',
  voice: 'mic',
  tts: 'unmute',
  stt: 'record',
  logging: 'output',
  discord: 'comment-discussion',
  auxiliary: 'tools',
  bedrock: 'cloud',
  curator: 'sparkle',
  kanban: 'layout',
  model_catalog: 'book',
  openrouter: 'arrow-swap',
  sessions: 'history',
  tool_loop_guardrails: 'shield',
  tool_output: 'output',
  updates: 'sync',
}

const catIcon = (cat: string) => CATEGORY_ICON[cat] ?? 'question'

function prettyCat(cat: string): string {
  return cat.charAt(0).toUpperCase() + cat.slice(1).replace(/_/g, ' ')
}

interface Flash {
  msg: string
  kind: 'success' | 'error'
}

export function ConfigPanel() {
  const [config, setConfig] = useState<Record<string, unknown> | null>(null)
  const [schema, setSchema] = useState<SchemaMap | null>(null)
  const [categoryOrder, setCategoryOrder] = useState<string[]>([])
  const [defaults, setDefaults] = useState<Record<string, unknown> | null>(null)
  const [saving, setSaving] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [yamlMode, setYamlMode] = useState(false)
  const [yamlText, setYamlText] = useState('')
  const [yamlLoading, setYamlLoading] = useState(false)
  const [yamlSaving, setYamlSaving] = useState(false)
  const [configPath, setConfigPath] = useState<string | null>(null)
  const [activeCategory, setActiveCategory] = useState('')
  const [confirmReset, setConfirmReset] = useState(false)
  const [flash, setFlash] = useState<Flash | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const showFlash = useCallback((msg: string, kind: Flash['kind']) => {
    setFlash({ msg, kind })
    window.setTimeout(() => setFlash(null), 3000)
  }, [])

  const api = useCallback(<T,>(path: string, method = 'GET', body?: unknown) => {
    return window.hermesDesktop!.api<T>({ path, method, body })
  }, [])

  useEffect(() => {
    api<Record<string, unknown>>('/api/config').then(setConfig).catch(() => {})
    api<{ fields: SchemaMap; category_order: string[] }>('/api/config/schema')
      .then(resp => {
        setSchema(resp.fields)
        setCategoryOrder(resp.category_order ?? [])
      })
      .catch(() => {})
    api<Record<string, unknown>>('/api/config/defaults').then(setDefaults).catch(() => {})
    api<StatusResponse>('/api/status').then(r => setConfigPath(r.config_path ?? null)).catch(() => {})
  }, [api])

  // First category becomes active once the schema loads.
  useEffect(() => {
    if (categoryOrder.length > 0 && !activeCategory) {setActiveCategory(categoryOrder[0])}
  }, [categoryOrder, activeCategory])

  // Pull raw YAML lazily on first switch into YAML mode.
  useEffect(() => {
    if (!yamlMode) {return}
    setYamlLoading(true)
    api<{ yaml: string }>('/api/config/raw')
      .then(resp => setYamlText(resp.yaml))
      .catch(() => showFlash('Failed to load raw config', 'error'))
      .finally(() => setYamlLoading(false))
  }, [yamlMode, api, showFlash])

  const categories = useMemo(() => {
    if (!schema) {return []}
    const allCats = [...new Set(Object.values(schema).map(s => String(s.category ?? 'general')))]
    const ordered = categoryOrder.filter(c => allCats.includes(c))
    const extra = allCats.filter(c => !categoryOrder.includes(c)).sort()

    return [...ordered, ...extra]
  }, [schema, categoryOrder])

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {}

    if (!schema) {return counts}

    for (const s of Object.values(schema)) {
      const cat = String(s.category ?? 'general')
      counts[cat] = (counts[cat] || 0) + 1
    }

    return counts
  }, [schema])

  const isSearching = searchQuery.trim().length > 0
  const lowerSearch = searchQuery.toLowerCase()

  const searchMatchedFields = useMemo<[string, Record<string, unknown>][]>(() => {
    if (!isSearching || !schema) {return []}

    return Object.entries(schema).filter(([key, s]) => {
      const label = key.split('.').pop() ?? key
      const humanLabel = label.replace(/_/g, ' ')

      return (
        key.toLowerCase().includes(lowerSearch) ||
        humanLabel.toLowerCase().includes(lowerSearch) ||
        String(s.category ?? '').toLowerCase().includes(lowerSearch) ||
        String(s.description ?? '').toLowerCase().includes(lowerSearch)
      )
    })
  }, [isSearching, lowerSearch, schema])

  const activeFields = useMemo<[string, Record<string, unknown>][]>(() => {
    if (!schema || isSearching) {return []}

    return Object.entries(schema).filter(([, s]) => String(s.category ?? 'general') === activeCategory)
  }, [schema, activeCategory, isSearching])

  const handleSave = async () => {
    if (!config) {return}
    setSaving(true)

    try {
      await api('/api/config', 'PUT', { config })
      showFlash('Config saved', 'success')
    } catch (e) {
      showFlash(`Failed to save: ${e}`, 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleYamlSave = async () => {
    setYamlSaving(true)

    try {
      await api('/api/config/raw', 'PUT', { yaml_text: yamlText })
      showFlash('YAML config saved', 'success')
      api<Record<string, unknown>>('/api/config').then(setConfig).catch(() => {})
    } catch (e) {
      showFlash(`Failed to save YAML: ${e}`, 'error')
    } finally {
      setYamlSaving(false)
    }
  }

  const executeReset = () => {
    if (!defaults || !config) {return}
    const scopedFields = isSearching ? searchMatchedFields : activeFields

    if (scopedFields.length === 0) {return}
    const scopeLabel = isSearching ? 'search results' : prettyCat(activeCategory)
    let next: Record<string, unknown> = config

    for (const [key] of scopedFields) {
      next = setNestedValue(next, key, getNestedValue(defaults, key))
    }

    setConfig(next)
    showFlash(`Reset ${scopeLabel} to defaults`, 'success')
  }

  const handleExport = () => {
    if (!config) {return}
    const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'hermes-config.json'
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]

    if (!file) {return}
    const reader = new FileReader()

    reader.onload = () => {
      try {
        setConfig(JSON.parse(reader.result as string))
        showFlash('Config imported', 'success')
      } catch {
        showFlash('Invalid JSON file', 'error')
      }
    }

    reader.readAsText(file)
  }

  if (!config || !schema) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader className="text-2xl" />
      </div>
    )
  }

  const renderFields = (fields: [string, Record<string, unknown>][], showCategory = false) => {
    let lastSection = ''
    let lastCat = ''

    return fields.map(([key, s]) => {
      const parts = key.split('.')
      const section = parts.length > 1 ? parts[0] : ''
      const cat = String(s.category ?? 'general')
      const showCatBadge = showCategory && cat !== lastCat
      const showSection = !showCategory && section && section !== lastSection && section !== activeCategory
      lastSection = section
      lastCat = cat

      return (
        <div key={key}>
          {showCatBadge && (
            <div className="flex items-center gap-2 pb-2 pt-4 first:pt-0">
              <Codicon className="text-(--ui-text-tertiary)" name={catIcon(cat)} />
              <span className="text-xs font-semibold uppercase tracking-wider text-(--ui-text-secondary)">
                {prettyCat(cat)}
              </span>
              <div className="flex-1 border-t border-(--stroke-nous)" />
            </div>
          )}
          {showSection && (
            <div className="flex items-center gap-2 pb-2 pt-4 first:pt-0">
              <span className="text-xs font-semibold uppercase tracking-wider text-(--ui-text-tertiary)">
                {section.replace(/_/g, ' ')}
              </span>
              <div className="flex-1 border-t border-(--stroke-nous)" />
            </div>
          )}
          <div className="py-1">
            <AutoField
              onChange={v => setConfig(setNestedValue(config, key, v))}
              schema={s}
              schemaKey={key}
              value={getNestedValue(config, key)}
            />
          </div>
        </div>
      )
    })
  }

  const resetScopeLabel = isSearching ? 'search results' : prettyCat(activeCategory)
  const scopedCount = (isSearching ? searchMatchedFields : activeFields).length

  return (
    <div className="flex flex-col gap-4">
      {/* Toolbar */}
      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-2 sm:flex-1">
          <Codicon className="shrink-0 text-(--ui-text-tertiary)" name="settings-gear" />
          <code className="min-w-0 flex-1 break-words bg-(--ui-bg-2) px-2 py-0.5 text-xs text-(--ui-text-secondary)">
            {configPath ?? '~/.hermes/config.yaml'}
          </code>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 sm:shrink-0">
          {!yamlMode && (
            <div className="relative w-full sm:w-56">
              <Codicon className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-(--ui-text-tertiary)" name="search" />
              <Input
                className="h-8 pl-8 pr-7"
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search"
                value={searchQuery}
              />
              {searchQuery && (
                <button
                  aria-label="Clear"
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 text-(--ui-text-tertiary) hover:text-foreground"
                  onClick={() => setSearchQuery('')}
                  type="button"
                >
                  <Codicon name="close" />
                </button>
              )}
            </div>
          )}

          <Button aria-label="Export config" onClick={handleExport} size="icon" variant="ghost">
            <Codicon name="cloud-download" />
          </Button>
          <Button aria-label="Import config" onClick={() => fileInputRef.current?.click()} size="icon" variant="ghost">
            <Codicon name="cloud-upload" />
          </Button>
          <input accept=".json" className="hidden" onChange={handleImport} ref={fileInputRef} type="file" />

          {!yamlMode && (
            <Button
              aria-label={`Reset ${resetScopeLabel}`}
              disabled={scopedCount === 0}
              onClick={() => setConfirmReset(true)}
              size="icon"
              variant="ghost"
            >
              <Codicon name="discard" />
            </Button>
          )}

          <div className="mx-1 h-5 w-px bg-(--stroke-nous)" />

          <Button onClick={() => setYamlMode(!yamlMode)} size="sm" variant={yamlMode ? 'default' : 'ghost'}>
            <Codicon name={yamlMode ? 'list-selection' : 'code'} />
            {yamlMode ? 'Form' : 'YAML'}
          </Button>

          {yamlMode ? (
            <Button disabled={yamlSaving} onClick={handleYamlSave} size="sm">
              {yamlSaving ? 'Saving…' : 'Save'}
            </Button>
          ) : (
            <Button disabled={saving} onClick={handleSave} size="sm">
              {saving ? 'Saving…' : 'Save'}
            </Button>
          )}
        </div>
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

      {yamlMode ? (
        <div className="rounded-lg border border-(--stroke-nous) bg-(--ui-bg-1)">
          <div className="flex items-center gap-2 border-b border-(--stroke-nous) px-4 py-3">
            <Codicon className="text-(--ui-text-tertiary)" name="file-code" />
            <span className="text-sm font-medium">Raw YAML</span>
          </div>
          {yamlLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader className="text-xl" />
            </div>
          ) : (
            <textarea
              className="flex min-h-[600px] w-full bg-transparent px-4 py-3 font-mono text-sm leading-relaxed focus-visible:outline-none"
              onChange={e => setYamlText(e.target.value)}
              spellCheck={false}
              value={yamlText}
            />
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-4 sm:flex-row">
          {/* Category sidebar */}
          <aside className="sm:w-56 sm:shrink-0">
            <div className="flex flex-col rounded-lg border border-(--stroke-nous) bg-(--ui-bg-1) sm:sticky sm:top-4">
              <div className="hidden items-center gap-2 border-b border-(--stroke-nous) px-3 py-2 sm:flex">
                <Codicon className="size-3 text-(--ui-text-tertiary)" name="filter" />
                <span className="text-xs uppercase tracking-wider text-(--ui-text-secondary)">Sections</span>
              </div>
              <div className="flex gap-1 overflow-x-auto p-2 sm:max-h-[calc(100vh-16rem)] sm:flex-col sm:gap-px sm:overflow-y-auto">
                {categories.map(cat => {
                  const isActive = !isSearching && activeCategory === cat

                  return (
                    <button
                      className={`flex items-center gap-2 whitespace-nowrap rounded-md px-2 py-1 text-xs transition-colors ${
                        isActive
                          ? 'bg-(--ui-control-active-background) text-foreground'
                          : 'text-(--ui-text-secondary) hover:bg-(--ui-control-hover-background) hover:text-foreground'
                      }`}
                      key={cat}
                      onClick={() => {
                        setSearchQuery('')
                        setActiveCategory(cat)
                      }}
                      type="button"
                    >
                      <Codicon className="size-3.5 shrink-0" name={catIcon(cat)} />
                      <span className="flex-1 truncate text-left">{prettyCat(cat)}</span>
                      <span className="tabular-nums text-(--ui-text-tertiary)">{categoryCounts[cat] || 0}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          </aside>

          {/* Field panel */}
          <div className="min-w-0 flex-1">
            <div className="rounded-lg border border-(--stroke-nous) bg-(--ui-bg-1)">
              <div className="flex items-center justify-between border-b border-(--stroke-nous) px-4 py-3">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Codicon name={isSearching ? 'search' : catIcon(activeCategory)} />
                  {isSearching ? 'Search results' : prettyCat(activeCategory)}
                </div>
                <span className="text-xs tabular-nums text-(--ui-text-tertiary)">
                  {scopedCount} field{scopedCount !== 1 ? 's' : ''}
                </span>
              </div>
              <div className="grid gap-2 px-4 py-4">
                {isSearching ? (
                  searchMatchedFields.length === 0 ? (
                    <p className="py-8 text-center text-sm text-(--ui-text-secondary)">
                      No fields match “{searchQuery}”.
                    </p>
                  ) : (
                    renderFields(searchMatchedFields, true)
                  )
                ) : (
                  renderFields(activeFields)
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        confirmLabel="Reset to defaults"
        description={`This will reset ${scopedCount} field(s) to their default values.`}
        destructive
        onClose={() => setConfirmReset(false)}
        onConfirm={executeReset}
        open={confirmReset}
        title={`Reset ${resetScopeLabel}?`}
      />
    </div>
  )
}
