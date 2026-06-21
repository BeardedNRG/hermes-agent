import { useCallback, useEffect, useState } from 'react'

import { Button } from '../../components/ui/button'
import { Codicon } from '../../components/ui/codicon'
import { ConfirmDialog } from '../../components/ui/confirm-dialog'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../components/ui/dialog'
import { Input } from '../../components/ui/input'
import { Loader } from '../../components/ui/loader'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select'
import { Textarea } from '../../components/ui/textarea'

import { buildScheduleString, DEFAULT_SCHEDULE_STATE, describeSchedule, SCHEDULE_STRINGS, type ScheduleBuilderState } from './schedule'
import { ScheduleBuilder } from './schedule-builder'

// Cron tab — full port of web/src/pages/CronPage.tsx (the version chosen over
// the desktop Ctrl+K overlay for its per-profile jobs, ScheduleBuilder edit UI,
// and delivery-target awareness). The overlay stays as quick-access; this is
// the full visible surface. Hits the same backend via the desktop bridge.

interface CronSchedule {
  kind?: string
  expr?: string
  display?: string
  minutes?: number
  run_at?: string
}

interface CronJob {
  id: string
  profile?: string | null
  profile_name?: string | null
  name?: string | null
  prompt?: string | null
  schedule?: CronSchedule
  schedule_display?: string | null
  enabled: boolean
  state?: string | null
  deliver?: string | null
  last_run_at?: string | null
  next_run_at?: string | null
}

interface DeliveryTarget {
  id: string
  name: string
  home_target_set: boolean
  home_env_var: string | null
}

interface ProfileInfo {
  name: string
}

const asText = (v: unknown): string => (typeof v === 'string' ? v : v == null ? '' : String(v))
const truncate = (v: string, n: number) => (v.length > n ? `${v.slice(0, n)}…` : v)
const jobName = (j: CronJob) => asText(j.name)
const jobPrompt = (j: CronJob) => asText(j.prompt)
const jobTitle = (j: CronJob) => jobName(j) || truncate(jobPrompt(j), 60) || j.id
const jobProfile = (j: CronJob) => asText(j.profile) || asText(j.profile_name) || 'default'
const jobKey = (j: CronJob) => `${jobProfile(j)}:${j.id}`
const profileLabel = (p: string) => (p === 'default' ? 'default' : p)
const jobState = (j: CronJob) => asText(j.state) || (j.enabled ? 'scheduled' : 'paused')
const scheduleText = (j: CronJob) => describeSchedule(j.schedule, asText(j.schedule_display) || j.schedule?.expr, SCHEDULE_STRINGS)

function formatTime(iso?: string | null): string {
  if (!iso) {return '—'}
  const d = new Date(iso)

  if (Number.isNaN(d.getTime())) {return iso}

  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

const STATE_TONE: Record<string, Tone> = {
  enabled: 'success',
  scheduled: 'success',
  running: 'success',
  paused: 'warning',
  error: 'danger',
  completed: 'neutral',
  disabled: 'neutral',
}

type Tone = 'success' | 'warning' | 'danger' | 'neutral'

const TONE_CLASS: Record<Tone, string> = {
  success: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400',
  warning: 'border-amber-500/30 bg-amber-500/10 text-amber-400',
  danger: 'border-destructive/30 bg-destructive/10 text-destructive',
  neutral: 'border-(--stroke-nous) bg-(--ui-bg-2) text-(--ui-text-secondary)',
}

function Pill({ tone = 'neutral', children }: { tone?: Tone; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[0.6875rem] font-medium ${TONE_CLASS[tone]}`}>
      {children}
    </span>
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

interface Flash {
  msg: string
  kind: 'success' | 'error'
}

export function CronJobsView() {
  const [jobs, setJobs] = useState<CronJob[]>([])
  const [profiles, setProfiles] = useState<ProfileInfo[]>([])
  const [targets, setTargets] = useState<DeliveryTarget[]>([{ id: 'local', name: 'Local', home_target_set: true, home_env_var: null }])
  const [selectedProfile, setSelectedProfile] = useState('all')
  const [loading, setLoading] = useState(true)
  const [flash, setFlash] = useState<Flash | null>(null)

  // Create modal
  const [createOpen, setCreateOpen] = useState(false)
  const [name, setName] = useState('')
  const [prompt, setPrompt] = useState('')
  const [deliver, setDeliver] = useState('local')
  const [schedule, setSchedule] = useState<ScheduleBuilderState>(DEFAULT_SCHEDULE_STATE)
  const [creating, setCreating] = useState(false)

  // Edit modal
  const [editJob, setEditJob] = useState<CronJob | null>(null)
  const [editName, setEditName] = useState('')
  const [editPrompt, setEditPrompt] = useState('')
  const [editSchedule, setEditSchedule] = useState('')
  const [editDeliver, setEditDeliver] = useState('local')
  const [saving, setSaving] = useState(false)

  const [deleteTarget, setDeleteTarget] = useState<CronJob | null>(null)

  const showFlash = useCallback((msg: string, kind: Flash['kind']) => {
    setFlash({ msg, kind })
    window.setTimeout(() => setFlash(null), 3000)
  }, [])

  const api = useCallback(<T,>(path: string, method = 'GET', body?: unknown) => {
    return window.hermesDesktop!.api<T>({ path, method, body })
  }, [])

  const loadJobs = useCallback(() => {
    api<CronJob[]>(`/api/cron/jobs?profile=${encodeURIComponent(selectedProfile)}`)
      .then(setJobs)
      .catch(() => showFlash('Failed to load cron jobs', 'error'))
      .finally(() => setLoading(false))
  }, [api, selectedProfile, showFlash])

  useEffect(() => {
    api<{ profiles: ProfileInfo[] }>('/api/profiles').then(r => setProfiles(r.profiles)).catch(() => {})
    api<{ targets: DeliveryTarget[] }>('/api/cron/delivery-targets')
      .then(r => setTargets(r.targets.length ? r.targets : [{ id: 'local', name: 'Local', home_target_set: true, home_env_var: null }]))
      .catch(() => {})
  }, [api])

  useEffect(() => {
    loadJobs()
  }, [loadJobs])

  const createProfile = selectedProfile === 'all' ? 'default' : selectedProfile

  const deliverLabel = (target: DeliveryTarget) => {
    const base = target.id === 'local' ? 'Local' : target.name

    return target.id !== 'local' && !target.home_target_set ? `${base} (needs home channel)` : base
  }

  const create = async () => {
    const scheduleString = buildScheduleString(schedule)

    if (!prompt.trim() || !scheduleString) {
      showFlash('Prompt & schedule required', 'error')

      return
    }

    setCreating(true)

    try {
      await api(`/api/cron/jobs?profile=${encodeURIComponent(createProfile)}`, 'POST', {
        prompt: prompt.trim(),
        schedule: scheduleString,
        name: name.trim() || undefined,
        deliver,
      })
      showFlash('Job created', 'success')
      setName('')
      setPrompt('')
      setDeliver('local')
      setSchedule(DEFAULT_SCHEDULE_STATE)
      setCreateOpen(false)
      loadJobs()
    } catch (e) {
      showFlash(`Failed to create: ${e}`, 'error')
    } finally {
      setCreating(false)
    }
  }

  const openEdit = (job: CronJob) => {
    setEditJob(job)
    setEditName(jobName(job))
    setEditPrompt(jobPrompt(job))
    setEditSchedule(asText(job.schedule?.expr) || asText(job.schedule_display) || '')
    setEditDeliver(asText(job.deliver) || 'local')
  }

  const saveEdit = async () => {
    if (!editJob) {return}

    if (!editPrompt.trim() || !editSchedule.trim()) {
      showFlash('Prompt & schedule required', 'error')

      return
    }

    setSaving(true)

    try {
      await api(`/api/cron/jobs/${encodeURIComponent(editJob.id)}?profile=${encodeURIComponent(jobProfile(editJob))}`, 'PUT', {
        updates: { prompt: editPrompt.trim(), schedule: editSchedule.trim(), name: editName.trim(), deliver: editDeliver },
      })
      showFlash('Job saved', 'success')
      setEditJob(null)
      loadJobs()
    } catch (e) {
      showFlash(`Failed to save: ${e}`, 'error')
    } finally {
      setSaving(false)
    }
  }

  const toggle = async (job: CronJob) => {
    const verb = job.enabled ? 'pause' : 'resume'

    try {
      await api(`/api/cron/jobs/${encodeURIComponent(job.id)}/${verb}?profile=${encodeURIComponent(jobProfile(job))}`, 'POST')
      loadJobs()
    } catch (e) {
      showFlash(`Error: ${e}`, 'error')
    }
  }

  const trigger = async (job: CronJob) => {
    try {
      await api(`/api/cron/jobs/${encodeURIComponent(job.id)}/trigger?profile=${encodeURIComponent(jobProfile(job))}`, 'POST')
      showFlash(`Triggered "${truncate(jobTitle(job), 30)}"`, 'success')
      loadJobs()
    } catch (e) {
      showFlash(`Error: ${e}`, 'error')
    }
  }

  const remove = async () => {
    if (!deleteTarget) {return}
    await api(`/api/cron/jobs/${encodeURIComponent(deleteTarget.id)}?profile=${encodeURIComponent(jobProfile(deleteTarget))}`, 'DELETE')
    showFlash(`Deleted "${truncate(jobTitle(deleteTarget), 30)}"`, 'success')
    loadJobs()
  }

  return (
    <div className="flex h-full min-w-0 flex-col gap-4 overflow-y-auto p-4 pt-(--titlebar-height)">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs text-(--ui-text-tertiary)">
          <Codicon name="watch" />
          <span className="font-semibold uppercase tracking-wider">Cron · scheduled jobs ({jobs.length})</span>
        </div>
        <div className="flex items-center gap-2">
          <Select onValueChange={setSelectedProfile} value={selectedProfile}>
            <SelectTrigger className="h-8 w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All profiles</SelectItem>
              {profiles.map(p => (
                <SelectItem key={p.name} value={p.name}>
                  {profileLabel(p.name)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={() => setCreateOpen(true)} size="sm">
            <Codicon name="add" />
            New job
          </Button>
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

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader className="text-2xl" />
        </div>
      ) : jobs.length === 0 ? (
        <div className="rounded-lg border border-(--stroke-nous) bg-(--ui-bg-1) py-10 text-center text-sm text-(--ui-text-tertiary)">
          No scheduled jobs.
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {jobs.map(job => {
            const deliverTo = asText(job.deliver)

            return (
              <div className="rounded-lg border border-(--stroke-nous) bg-(--ui-bg-1)" key={jobKey(job)}>
                <div className="flex items-start gap-4 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      <span className="truncate text-sm font-medium">{jobTitle(job)}</span>
                      <Pill tone={STATE_TONE[jobState(job)] ?? 'neutral'}>{jobState(job)}</Pill>
                      <Pill>{profileLabel(jobProfile(job))}</Pill>
                      {deliverTo && deliverTo !== 'local' && <Pill>{deliverTo}</Pill>}
                    </div>
                    {jobName(job) && jobPrompt(job) && (
                      <p className="mb-1 truncate text-xs text-(--ui-text-tertiary)">{truncate(jobPrompt(job), 100)}</p>
                    )}
                    <div className="flex flex-wrap items-center gap-4 text-xs text-(--ui-text-tertiary)">
                      <span className="font-mono">{scheduleText(job)}</span>
                      <span>last: {formatTime(job.last_run_at)}</span>
                      <span>next: {formatTime(job.next_run_at)}</span>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button aria-label="Trigger now" onClick={() => trigger(job)} size="icon" variant="ghost">
                      <Codicon name="run" />
                    </Button>
                    <Button onClick={() => toggle(job)} size="sm" variant="ghost">
                      {job.enabled ? 'Pause' : 'Resume'}
                    </Button>
                    <Button aria-label="Edit" onClick={() => openEdit(job)} size="icon" variant="ghost">
                      <Codicon name="edit" />
                    </Button>
                    <Button aria-label="Delete" className="text-destructive" onClick={() => setDeleteTarget(job)} size="icon" variant="ghost">
                      <Codicon name="trash" />
                    </Button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Create modal */}
      <Dialog onOpenChange={v => !v && setCreateOpen(false)} open={createOpen}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New scheduled job</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4">
            <Field label="Profile">
              <Select onValueChange={setSelectedProfile} value={createProfile}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {profiles.map(p => (
                    <SelectItem key={p.name} value={p.name}>
                      {profileLabel(p.name)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Name (optional)">
              <Input onChange={e => setName(e.target.value)} placeholder="e.g. morning-standup" value={name} />
            </Field>
            <Field label="Prompt">
              <Textarea className="min-h-20 font-mono" onChange={e => setPrompt(e.target.value)} placeholder="What should the agent do?" value={prompt} />
            </Field>
            <ScheduleBuilder onChange={setSchedule} value={schedule} />
            <Field label="Deliver to">
              <Select onValueChange={setDeliver} value={deliver}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {targets.map(target => (
                    <SelectItem key={target.id} value={target.id}>
                      {deliverLabel(target)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <div className="flex justify-end">
              <Button disabled={creating} onClick={create} size="sm">
                {creating ? 'Creating…' : 'Create'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit modal */}
      <Dialog onOpenChange={v => !v && setEditJob(null)} open={editJob !== null}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit job</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4">
            <Field label="Name (optional)">
              <Input onChange={e => setEditName(e.target.value)} placeholder="e.g. morning-standup" value={editName} />
            </Field>
            <Field label="Prompt">
              <Textarea className="min-h-20 font-mono" onChange={e => setEditPrompt(e.target.value)} value={editPrompt} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Schedule">
                <Input className="font-mono" onChange={e => setEditSchedule(e.target.value)} placeholder="0 9 * * 1-5" value={editSchedule} />
              </Field>
              <Field label="Deliver to">
                <Select onValueChange={setEditDeliver} value={editDeliver}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {targets.map(target => (
                      <SelectItem key={target.id} value={target.id}>
                        {deliverLabel(target)}
                      </SelectItem>
                    ))}
                    {!targets.some(target => target.id === editDeliver) && editDeliver && (
                      <SelectItem value={editDeliver}>{editDeliver}</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </Field>
            </div>
            <div className="flex justify-end">
              <Button disabled={saving} onClick={saveEdit} size="sm">
                {saving ? 'Saving…' : 'Save changes'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        confirmLabel="Delete"
        description={deleteTarget ? `"${truncate(jobTitle(deleteTarget), 40)}" will be removed.` : ''}
        destructive
        onClose={() => setDeleteTarget(null)}
        onConfirm={remove}
        open={!!deleteTarget}
        title="Delete scheduled job?"
      />
    </div>
  )
}
