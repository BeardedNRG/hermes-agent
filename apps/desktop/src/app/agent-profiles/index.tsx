import { useCallback, useEffect, useRef, useState } from 'react'

import { Button } from '../../components/ui/button'
import { Checkbox } from '../../components/ui/checkbox'
import { Codicon } from '../../components/ui/codicon'
import { ConfirmDialog } from '../../components/ui/confirm-dialog'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../components/ui/dialog'
import { Input } from '../../components/ui/input'
import { Loader } from '../../components/ui/loader'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select'
import { Textarea } from '../../components/ui/textarea'

// Agents tab — full port of web/src/pages/ProfilesPage.tsx, reframed (per the
// merge ledger) as role-based agent profiles: orchestrator / strategist /
// coder, etc. Includes the ProfileBuilder create flow and the
// "what is this profile good at? routes kanban tasks by role" description with
// auto-generate. The desktop native Profiles overlay is left untouched; this is
// the full visible tab. Hits the same backend via the desktop bridge.

const PROFILE_NAME_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/
const MODEL_SEP = ' '

interface ProfileInfo {
  name: string
  path: string
  is_default: boolean
  model: string | null
  provider: string | null
  has_env: boolean
  skill_count: number
  gateway_running: boolean
  description: string
  description_auto: boolean
  has_alias: boolean
}

interface ActiveProfileInfo {
  active: string
  current: string
}

interface ModelChoice {
  provider: string
  model: string
  label: string
}

interface Flash {
  msg: string
  kind: 'success' | 'error'
}

function Pill({ tone = 'neutral', children }: { tone?: 'active' | 'review' | 'neutral'; children: React.ReactNode }) {
  const cls =
    tone === 'active'
      ? 'border-primary/40 bg-primary/10 text-primary'
      : tone === 'review'
        ? 'border-amber-500/30 bg-amber-500/10 text-amber-400'
        : 'border-(--stroke-nous) bg-(--ui-bg-2) text-(--ui-text-secondary)'

  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[0.6875rem] font-medium ${cls}`}>
      {children}
    </span>
  )
}

const api = <T,>(path: string, method = 'GET', body?: unknown) => window.hermesDesktop!.api<T>({ path, method, body })
const enc = encodeURIComponent

export function AgentProfilesView() {
  const [profiles, setProfiles] = useState<ProfileInfo[]>([])
  const [activeInfo, setActiveInfo] = useState<ActiveProfileInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [flash, setFlash] = useState<Flash | null>(null)
  const [modelChoices, setModelChoices] = useState<ModelChoice[] | null>(null)
  const modelLoading = useRef(false)
  const [settingActive, setSettingActive] = useState<string | null>(null)
  const [menuOpen, setMenuOpen] = useState<string | null>(null)

  // Inline editors keyed by profile name
  const [editDesc, setEditDesc] = useState<string | null>(null)
  const [descText, setDescText] = useState('')
  const [descBusy, setDescBusy] = useState(false)
  const [editSoul, setEditSoul] = useState<string | null>(null)
  const [soulText, setSoulText] = useState('')
  const [soulBusy, setSoulBusy] = useState(false)
  const [editModel, setEditModel] = useState<string | null>(null)
  const [modelChoice, setModelChoice] = useState('')
  const [renaming, setRenaming] = useState<string | null>(null)
  const [renameTo, setRenameTo] = useState('')

  // Create modal
  const [createOpen, setCreateOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [cloneFromDefault, setCloneFromDefault] = useState(true)
  const [cloneAll, setCloneAll] = useState(false)
  const [noSkills, setNoSkills] = useState(false)
  const [newDesc, setNewDesc] = useState('')
  const [newModel, setNewModel] = useState('')
  const [creating, setCreating] = useState(false)

  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)

  const showFlash = useCallback((msg: string, kind: Flash['kind']) => {
    setFlash({ msg, kind })
    window.setTimeout(() => setFlash(null), 3000)
  }, [])

  const load = useCallback(() => {
    Promise.all([api<{ profiles: ProfileInfo[] }>('/api/profiles'), api<ActiveProfileInfo>('/api/profiles/active').catch(() => null)])
      .then(([res, active]) => {
        setProfiles(res.profiles)
        setActiveInfo(active)
      })
      .catch(e => showFlash(`Error: ${e}`, 'error'))
      .finally(() => setLoading(false))
  }, [showFlash])

  useEffect(() => {
    load()
  }, [load])

  const loadModels = useCallback(() => {
    if (modelChoices !== null || modelLoading.current) {return}
    modelLoading.current = true
    api<{ providers?: { slug: string; name: string; models?: string[] }[] }>('/api/model/options')
      .then(res => {
        const flat: ModelChoice[] = []

        for (const prov of res.providers ?? []) {
          for (const m of prov.models ?? []) {flat.push({ provider: prov.slug, model: m, label: `${prov.name} · ${m}` })}
        }

        setModelChoices(flat)
      })
      .catch(() => setModelChoices([]))
      .finally(() => {
        modelLoading.current = false
      })
  }, [modelChoices])

  useEffect(() => {
    if (createOpen || editModel) {loadModels()}
  }, [createOpen, editModel, loadModels])

  useEffect(() => {
    if (!menuOpen) {return}

    const onDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null

      if (target && !target.closest?.('[data-profile-menu]')) {setMenuOpen(null)}
    }

    window.addEventListener('mousedown', onDown)

    return () => window.removeEventListener('mousedown', onDown)
  }, [menuOpen])

  const isActive = (p: ProfileInfo) =>
    activeInfo != null && (activeInfo.active === p.name || (activeInfo.active === 'default' && p.is_default))

  const setActive = async (p: ProfileInfo) => {
    setSettingActive(p.name)

    try {
      await api('/api/profiles/active', 'POST', { name: p.name })
      showFlash(`Active profile set: ${p.name}`, 'success')
      load()
    } catch (e) {
      showFlash(`Error: ${e}`, 'error')
    } finally {
      setSettingActive(null)
    }
  }

  const create = async () => {
    const name = newName.trim()

    if (!name) {return showFlash('Name required', 'error')}

    if (!PROFILE_NAME_RE.test(name)) {return showFlash('Invalid name: lowercase a-z, 0-9, _ or -', 'error')}
    setCreating(true)

    try {
      const cloning = cloneAll || cloneFromDefault
      const picked = newModel ? modelChoices?.find(c => `${c.provider}${MODEL_SEP}${c.model}` === newModel) : undefined

      const res = await api<{ model_set?: boolean }>('/api/profiles', 'POST', {
        name,
        clone_from_default: cloneAll ? false : cloneFromDefault,
        clone_all: cloneAll,
        no_skills: cloning ? false : noSkills,
        description: newDesc.trim() || undefined,
        provider: picked?.provider,
        model: picked?.model,
      })

      showFlash(`Created: ${name}`, 'success')

      if (picked && res.model_set === false) {showFlash('Profile created, but the model could not be saved — set it from the editor.', 'error')}
      setNewName('')
      setNewDesc('')
      setNoSkills(false)
      setCloneAll(false)
      setCloneFromDefault(true)
      setNewModel('')
      setCreateOpen(false)
      load()
    } catch (e) {
      showFlash(`Error: ${e}`, 'error')
    } finally {
      setCreating(false)
    }
  }

  const submitRename = async (from: string) => {
    const target = renameTo.trim()

    if (!target || target === from) {
      setRenaming(null)

      return
    }

    if (!PROFILE_NAME_RE.test(target)) {return showFlash('Invalid name', 'error')}

    try {
      await api(`/api/profiles/${enc(from)}`, 'PATCH', { new_name: target })
      showFlash(`Renamed: ${from} → ${target}`, 'success')
      setRenaming(null)
      setRenameTo('')
      load()
    } catch (e) {
      showFlash(`Error: ${e}`, 'error')
    }
  }

  const openDesc = (p: ProfileInfo) => {
    setMenuOpen(null)
    setEditDesc(p.name)
    setDescText(p.description || '')
  }

  const saveDesc = async (name: string) => {
    setDescBusy(true)

    try {
      await api(`/api/profiles/${enc(name)}/description`, 'PUT', { description: descText.trim() })
      showFlash('Description saved', 'success')
      setEditDesc(null)
      load()
    } catch (e) {
      showFlash(`Error: ${e}`, 'error')
    } finally {
      setDescBusy(false)
    }
  }

  const autoDescribe = async (name: string) => {
    setDescBusy(true)

    try {
      const res = await api<{ description?: string }>(`/api/profiles/${enc(name)}/describe-auto`, 'POST', { overwrite: true })

      if (res.description) {setDescText(res.description)}
      showFlash('Description generated', 'success')
    } catch (e) {
      showFlash(`Could not generate: ${e}`, 'error')
    } finally {
      setDescBusy(false)
    }
  }

  const openSoul = async (p: ProfileInfo) => {
    setMenuOpen(null)
    setEditSoul(p.name)
    setSoulText('')

    try {
      const res = await api<{ content: string }>(`/api/profiles/${enc(p.name)}/soul`)
      setSoulText(res.content || '')
    } catch {
      /* leave blank */
    }
  }

  const saveSoul = async (name: string) => {
    setSoulBusy(true)

    try {
      await api(`/api/profiles/${enc(name)}/soul`, 'PUT', { content: soulText })
      showFlash('SOUL saved', 'success')
      setEditSoul(null)
    } catch (e) {
      showFlash(`Error: ${e}`, 'error')
    } finally {
      setSoulBusy(false)
    }
  }

  const openModel = (p: ProfileInfo) => {
    setMenuOpen(null)
    setEditModel(p.name)
    setModelChoice(p.provider && p.model ? `${p.provider}${MODEL_SEP}${p.model}` : '')
  }

  const saveModel = async (name: string) => {
    const picked = modelChoices?.find(c => `${c.provider}${MODEL_SEP}${c.model}` === modelChoice)

    if (!picked) {return}

    try {
      await api(`/api/profiles/${enc(name)}/model`, 'PUT', { provider: picked.provider, model: picked.model })
      showFlash('Model updated', 'success')
      setEditModel(null)
      load()
    } catch (e) {
      showFlash(`Error: ${e}`, 'error')
    }
  }

  const copyCommand = async (name: string) => {
    setMenuOpen(null)

    try {
      const res = await api<{ command: string }>(`/api/profiles/${enc(name)}/setup-command`)
      await navigator.clipboard.writeText(res.command)
      showFlash('Setup command copied', 'success')
    } catch (e) {
      showFlash(`Error: ${e}`, 'error')
    }
  }

  const remove = async () => {
    if (!deleteTarget) {return}
    await api(`/api/profiles/${enc(deleteTarget)}`, 'DELETE')
    showFlash(`Deleted: ${deleteTarget}`, 'success')
    load()
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader className="text-2xl" />
      </div>
    )
  }

  return (
    <div className="flex h-full min-w-0 flex-col gap-4 overflow-y-auto p-4 pt-(--titlebar-height)">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs text-(--ui-text-tertiary)">
          <Codicon name="organization" />
          <span className="font-semibold uppercase tracking-wider">Agents · profiles ({profiles.length})</span>
        </div>
        <Button onClick={() => setCreateOpen(true)} size="sm">
          <Codicon name="add" />
          New agent
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

      <div className="flex flex-col gap-2">
        {profiles.map(p => {
          const active = isActive(p)

          return (
            <div className={`rounded-lg border bg-(--ui-bg-1) ${active ? 'border-primary/40' : 'border-(--stroke-nous)'}`} key={p.name}>
              <div className="flex items-start gap-4 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    {renaming === p.name ? (
                      <Input
                        autoFocus
                        className="h-7 w-44"
                        onBlur={() => submitRename(p.name)}
                        onChange={e => setRenameTo(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && submitRename(p.name)}
                        value={renameTo}
                      />
                    ) : (
                      <span className="truncate text-sm font-medium">{p.name}</span>
                    )}
                    {active && <Pill tone="active">active</Pill>}
                    {p.is_default && <Pill>default</Pill>}
                    {p.has_alias && <Pill>alias</Pill>}
                    {p.description_auto && p.description && <Pill tone="review">review</Pill>}
                    {p.gateway_running && <Pill tone="active">gateway</Pill>}
                  </div>
                  <p className="mb-1 text-xs text-(--ui-text-secondary)">{p.description || <span className="text-(--ui-text-tertiary) italic">No description</span>}</p>
                  <div className="flex flex-wrap items-center gap-3 text-xs text-(--ui-text-tertiary)">
                    <span className="font-mono">{p.provider && p.model ? `${p.provider} · ${p.model}` : 'inherits model'}</span>
                    <span>{p.skill_count} skill{p.skill_count === 1 ? '' : 's'}</span>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {!active && (
                    <Button disabled={settingActive === p.name} onClick={() => setActive(p)} size="sm" variant="ghost">
                      {settingActive === p.name ? <Loader /> : null}
                      Set active
                    </Button>
                  )}
                  <div className="relative" data-profile-menu>
                    <Button aria-label="Actions" onClick={() => setMenuOpen(menuOpen === p.name ? null : p.name)} size="icon" variant="ghost">
                      <Codicon name="ellipsis" />
                    </Button>
                    {menuOpen === p.name && (
                      <div className="absolute right-0 top-full z-50 mt-1 min-w-48 rounded-md border border-(--stroke-nous) bg-(--ui-bg-1) py-1 shadow-nous">
                        <MenuItem icon="edit" label="Edit description" onClick={() => openDesc(p)} />
                        <MenuItem icon="book" label="Edit SOUL" onClick={() => openSoul(p)} />
                        <MenuItem icon="chip" label="Change model" onClick={() => openModel(p)} />
                        <MenuItem
                          icon="rename"
                          label="Rename"
                          onClick={() => {
                            setMenuOpen(null)
                            setRenaming(p.name)
                            setRenameTo(p.name)
                          }}
                        />
                        <MenuItem icon="copy" label="Copy setup command" onClick={() => copyCommand(p.name)} />
                        {!p.is_default && (
                          <MenuItem
                            danger
                            icon="trash"
                            label="Delete"
                            onClick={() => {
                              setMenuOpen(null)
                              setDeleteTarget(p.name)
                            }}
                          />
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Inline editors */}
              {editDesc === p.name && (
                <Editor onCancel={() => setEditDesc(null)}>
                  <Textarea
                    className="min-h-16"
                    onChange={e => setDescText(e.target.value)}
                    placeholder="What is this agent good at? Used to route kanban tasks by role."
                    value={descText}
                  />
                  <div className="flex justify-end gap-2">
                    <Button disabled={descBusy} onClick={() => autoDescribe(p.name)} size="sm" variant="ghost">
                      {descBusy ? <Loader /> : <Codicon name="sparkle" />}
                      Auto-generate
                    </Button>
                    <Button disabled={descBusy} onClick={() => saveDesc(p.name)} size="sm">
                      Save
                    </Button>
                  </div>
                </Editor>
              )}
              {editSoul === p.name && (
                <Editor onCancel={() => setEditSoul(null)}>
                  <Textarea className="min-h-40 font-mono" onChange={e => setSoulText(e.target.value)} placeholder="SOUL.md — the agent's persona / system prompt…" value={soulText} />
                  <div className="flex justify-end">
                    <Button disabled={soulBusy} onClick={() => saveSoul(p.name)} size="sm">
                      {soulBusy ? 'Saving…' : 'Save SOUL'}
                    </Button>
                  </div>
                </Editor>
              )}
              {editModel === p.name && (
                <Editor onCancel={() => setEditModel(null)}>
                  <ModelSelect choices={modelChoices} onChange={setModelChoice} value={modelChoice} />
                  <div className="flex justify-end">
                    <Button disabled={!modelChoice} onClick={() => saveModel(p.name)} size="sm">
                      Save model
                    </Button>
                  </div>
                </Editor>
              )}
            </div>
          )
        })}
      </div>

      {/* Create / ProfileBuilder modal */}
      <Dialog onOpenChange={v => !v && setCreateOpen(false)} open={createOpen}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New agent profile</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4">
            <Field label="Name">
              <Input autoFocus onChange={e => setNewName(e.target.value)} placeholder="orchestrator" value={newName} />
            </Field>
            <Field label="Description (optional) — routes kanban tasks by role">
              <Textarea className="min-h-16" onChange={e => setNewDesc(e.target.value)} placeholder="e.g. Plans and decomposes multi-step work into subagent tasks." value={newDesc} />
            </Field>
            <Field label="Model (optional)">
              <ModelSelect choices={modelChoices} inheritLabel onChange={setNewModel} value={newModel} />
            </Field>
            <label className="flex items-center gap-2 text-xs text-(--ui-text-secondary)">
              <Checkbox checked={cloneFromDefault} onCheckedChange={v => setCloneFromDefault(v === true)} />
              Clone from default profile
            </label>
            <details className="rounded-md border border-(--stroke-nous) px-3 py-2">
              <summary className="cursor-pointer text-xs text-(--ui-text-secondary)">Advanced options</summary>
              <div className="mt-2 flex flex-col gap-2">
                <label className="flex items-center gap-2 text-xs text-(--ui-text-secondary)">
                  <Checkbox checked={cloneAll} onCheckedChange={v => setCloneAll(v === true)} />
                  Clone everything (memories, sessions, skills, state)
                </label>
                <label className="flex items-center gap-2 text-xs text-(--ui-text-secondary)">
                  <Checkbox checked={noSkills} onCheckedChange={v => setNoSkills(v === true)} />
                  Don't seed bundled skills
                </label>
              </div>
            </details>
            <div className="flex justify-end">
              <Button disabled={creating} onClick={create} size="sm">
                {creating ? 'Creating…' : 'Create agent'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        confirmLabel="Delete"
        description={deleteTarget ? `Profile "${deleteTarget}" and its config will be removed.` : ''}
        destructive
        onClose={() => setDeleteTarget(null)}
        onConfirm={remove}
        open={!!deleteTarget}
        title="Delete agent profile?"
      />
    </div>
  )
}

function MenuItem({ label, icon, danger, onClick }: { label: string; icon: string; danger?: boolean; onClick: () => void }) {
  return (
    <button
      className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-(--ui-control-hover-background) ${danger ? 'text-destructive' : ''}`}
      onClick={onClick}
      type="button"
    >
      <Codicon name={icon} />
      {label}
    </button>
  )
}

function Editor({ children, onCancel }: { children: React.ReactNode; onCancel: () => void }) {
  return (
    <div className="flex flex-col gap-2 border-t border-(--stroke-nous) px-4 py-3">
      {children}
      <button className="self-start text-xs text-(--ui-text-tertiary) hover:text-foreground" onClick={onCancel} type="button">
        Cancel
      </button>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <span className="text-xs text-(--ui-text-secondary)">{label}</span>
      {children}
    </div>
  )
}

function ModelSelect({
  choices,
  value,
  onChange,
  inheritLabel,
}: {
  choices: ModelChoice[] | null
  value: string
  onChange: (v: string) => void
  inheritLabel?: boolean
}) {
  const INHERIT = '__inherit__'

  if (choices === null) {
    return <div className="text-xs text-(--ui-text-tertiary)">Loading models…</div>
  }

  if (choices.length === 0) {
    return <div className="text-xs text-(--ui-text-tertiary)">No authenticated providers — set a key first.</div>
  }

  return (
    <Select onValueChange={v => onChange(v === INHERIT ? '' : v)} value={value || INHERIT}>
      <SelectTrigger className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {inheritLabel && <SelectItem value={INHERIT}>Inherit from clone / default</SelectItem>}
        {choices.map(c => (
          <SelectItem key={`${c.provider}${MODEL_SEP}${c.model}`} value={`${c.provider}${MODEL_SEP}${c.model}`}>
            {c.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
