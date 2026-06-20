import { useCallback, useEffect, useState } from 'react'

import { Button } from '../../../components/ui/button'
import { Codicon } from '../../../components/ui/codicon'
import { ConfirmDialog } from '../../../components/ui/confirm-dialog'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../../components/ui/dialog'
import { Input } from '../../../components/ui/input'
import { Loader } from '../../../components/ui/loader'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../components/ui/select'
import { Switch } from '../../../components/ui/switch'
import { Textarea } from '../../../components/ui/textarea'

// Config » Hooks panel — incoming webhook subscriptions, ported from
// web/src/pages/WebhooksPage.tsx. (Distinct from System's shell hooks.) Create,
// enable/disable, delete; the create flow reveals the signing secret once.

interface WebhookRoute {
  name: string
  description: string
  events: string[]
  deliver: string
  deliver_only: boolean
  prompt: string
  url: string
  enabled: boolean
}

interface WebhooksResponse {
  enabled: boolean
  base_url: string
  subscriptions: WebhookRoute[]
}

const DELIVER_OPTIONS = ['log', 'telegram', 'discord', 'slack', 'email', 'github_comment'] as const

function Pill({ tone = 'neutral', children }: { tone?: 'neutral' | 'warning'; children: React.ReactNode }) {
  const cls =
    tone === 'warning'
      ? 'border-amber-500/30 bg-amber-500/10 text-amber-400'
      : 'border-(--stroke-nous) bg-(--ui-bg-2) text-(--ui-text-secondary)'

  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[0.6875rem] font-medium ${cls}`}>
      {children}
    </span>
  )
}

function Card({ children, dim }: { children: React.ReactNode; dim?: boolean }) {
  return (
    <div className={`rounded-lg border border-(--stroke-nous) bg-(--ui-bg-1) ${dim ? 'opacity-60' : ''}`}>{children}</div>
  )
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)

  return (
    <Button
      aria-label="Copy"
      onClick={() => {
        navigator.clipboard
          .writeText(value)
          .then(() => {
            setCopied(true)
            window.setTimeout(() => setCopied(false), 1500)
          })
          .catch(() => {})
      }}
      size="icon"
      variant="ghost"
    >
      <Codicon name={copied ? 'check' : 'copy'} />
    </Button>
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

export function HooksPanel() {
  const [data, setData] = useState<WebhooksResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [flash, setFlash] = useState<Flash | null>(null)
  const [togglingName, setTogglingName] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)

  // Create modal
  const [modalOpen, setModalOpen] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [events, setEvents] = useState('')
  const [deliver, setDeliver] = useState('log')
  const [deliverOnly, setDeliverOnly] = useState(false)
  const [prompt, setPrompt] = useState('')
  const [creating, setCreating] = useState(false)
  const [created, setCreated] = useState<{ url: string; secret: string } | null>(null)

  const showFlash = useCallback((msg: string, kind: Flash['kind']) => {
    setFlash({ msg, kind })
    window.setTimeout(() => setFlash(null), 3000)
  }, [])

  const api = useCallback(<T,>(path: string, method = 'GET', body?: unknown) => {
    return window.hermesDesktop!.api<T>({ path, method, body })
  }, [])

  const load = useCallback(() => {
    api<WebhooksResponse>('/api/webhooks')
      .then(setData)
      .catch(() => showFlash('Failed to load webhooks', 'error'))
      .finally(() => setLoading(false))
  }, [api, showFlash])

  useEffect(() => {
    load()
  }, [load])

  const resetForm = () => {
    setName('')
    setDescription('')
    setEvents('')
    setDeliver('log')
    setDeliverOnly(false)
    setPrompt('')
  }

  const openCreate = () => {
    setCreated(null)
    resetForm()
    setModalOpen(true)
  }

  const create = async () => {
    if (!name.trim()) {
      showFlash('Name required', 'error')

      return
    }

    setCreating(true)

    try {
      const eventsList = events.split(',').map(e => e.trim()).filter(Boolean)

      const res = await api<{ url: string; secret: string }>('/api/webhooks', 'POST', {
        name: name.trim(),
        description: description.trim() || undefined,
        events: eventsList.length ? eventsList : undefined,
        deliver,
        deliver_only: deliverOnly,
        prompt: prompt.trim() || undefined,
      })

      showFlash('Webhook created', 'success')
      setCreated({ url: res.url, secret: res.secret })
      load()
    } catch (e) {
      showFlash(`Failed to create: ${e}`, 'error')
    } finally {
      setCreating(false)
    }
  }

  const toggleEnabled = async (subName: string, nextEnabled: boolean) => {
    setTogglingName(subName)

    try {
      await api(`/api/webhooks/${encodeURIComponent(subName)}/enabled`, 'PUT', { enabled: nextEnabled })
      showFlash(nextEnabled ? `Enabled "${subName}"` : `Disabled "${subName}"`, 'success')
      load()
    } catch (e) {
      showFlash(`Error: ${e}`, 'error')
    } finally {
      setTogglingName(null)
    }
  }

  const remove = async () => {
    if (!deleteTarget) {return}
    await api(`/api/webhooks/${encodeURIComponent(deleteTarget)}`, 'DELETE')
    showFlash(`Deleted "${deleteTarget}"`, 'success')
    load()
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader className="text-2xl" />
      </div>
    )
  }

  const enabled = data?.enabled ?? false
  const subscriptions = data?.subscriptions ?? []

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-(--ui-text-tertiary)">
          Disabled webhooks reject incoming events; the gateway hot-reloads changes (no restart).
        </p>
        <Button disabled={!enabled} onClick={openCreate} size="sm">
          <Codicon name="add" />
          New subscription
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

      {!enabled && (
        <Card>
          <div className="flex items-start gap-3 px-4 py-6 text-sm">
            <Codicon className="shrink-0 text-amber-400" name="warning" />
            <div className="flex flex-col gap-1">
              <span className="font-medium">Webhook platform disabled</span>
              <span className="text-(--ui-text-secondary)">
                Enable the webhook platform in your messaging settings before creating subscriptions.
              </span>
            </div>
          </div>
        </Card>
      )}

      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-(--ui-text-secondary)">
        <Codicon name="link" />
        Subscriptions ({subscriptions.length})
      </div>

      {subscriptions.length === 0 ? (
        <Card>
          <div className="py-8 text-center text-sm text-(--ui-text-tertiary)">No webhook subscriptions yet.</div>
        </Card>
      ) : (
        subscriptions.map(sub => (
          <Card dim={!sub.enabled} key={sub.name}>
            <div className="flex items-start gap-4 px-4 py-4">
              <div className="min-w-0 flex-1">
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <span className="truncate text-sm font-medium">{sub.name}</span>
                  <Pill>{sub.deliver}</Pill>
                  {sub.deliver_only && <Pill>deliver only</Pill>}
                  {!sub.enabled && <Pill tone="warning">disabled</Pill>}
                </div>
                {sub.description && <p className="mb-2 text-xs text-(--ui-text-tertiary)">{sub.description}</p>}
                <div className="mb-2 flex flex-wrap items-center gap-1">
                  {sub.events.length === 0 ? <Pill>(all)</Pill> : sub.events.map(evt => <Pill key={evt}>{evt}</Pill>)}
                </div>
                <div className="flex items-center gap-2 text-xs text-(--ui-text-tertiary)">
                  <span className="min-w-0 flex-1 truncate font-mono">{sub.url}</span>
                  <CopyButton value={sub.url} />
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Button
                  disabled={togglingName === sub.name}
                  onClick={() => toggleEnabled(sub.name, !sub.enabled)}
                  size="sm"
                  variant="ghost"
                >
                  {sub.enabled ? 'Disable' : 'Enable'}
                </Button>
                <Button
                  aria-label="Delete"
                  className="text-destructive"
                  onClick={() => setDeleteTarget(sub.name)}
                  size="icon"
                  variant="ghost"
                >
                  <Codicon name="trash" />
                </Button>
              </div>
            </div>
          </Card>
        ))
      )}

      {/* Create modal */}
      <Dialog onOpenChange={v => !v && setModalOpen(false)} open={modalOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>New subscription</DialogTitle>
          </DialogHeader>

          {created ? (
            <div className="grid gap-4">
              <p className="text-sm text-(--ui-text-secondary)">
                Subscription created. Copy the secret now — it is only shown once.
              </p>
              <Field label="Webhook URL">
                <div className="flex items-center gap-2 rounded-md border border-(--stroke-nous) bg-(--ui-bg-2) px-3 py-2">
                  <span className="min-w-0 flex-1 truncate font-mono text-xs">{created.url}</span>
                  <CopyButton value={created.url} />
                </div>
              </Field>
              <Field label="Secret (shown once)">
                <div className="flex items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2">
                  <span className="min-w-0 flex-1 truncate font-mono text-xs">{created.secret}</span>
                  <CopyButton value={created.secret} />
                </div>
              </Field>
              <div className="flex justify-end">
                <Button onClick={() => setModalOpen(false)} size="sm">
                  Done
                </Button>
              </div>
            </div>
          ) : (
            <div className="grid gap-4">
              <Field label="Name">
                <Input onChange={e => setName(e.target.value)} placeholder="e.g. github-push" value={name} />
              </Field>
              <Field label="Description">
                <Input
                  onChange={e => setDescription(e.target.value)}
                  placeholder="What this webhook does (optional)"
                  value={description}
                />
              </Field>
              <Field label="Events">
                <Input
                  onChange={e => setEvents(e.target.value)}
                  placeholder="comma-separated, leave empty for all"
                  value={events}
                />
              </Field>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Deliver to">
                  <Select onValueChange={setDeliver} value={deliver}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DELIVER_OPTIONS.map(o => (
                        <SelectItem key={o} value={o}>
                          {o}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Deliver only">
                  <label className="flex h-9 items-center gap-2 text-sm text-(--ui-text-secondary)">
                    <Switch checked={deliverOnly} onCheckedChange={setDeliverOnly} />
                    Skip the agent
                  </label>
                </Field>
              </div>
              <Field label="Prompt">
                <Textarea
                  className="min-h-20"
                  onChange={e => setPrompt(e.target.value)}
                  placeholder="Instructions for the agent when this webhook fires (optional)"
                  value={prompt}
                />
              </Field>
              <div className="flex justify-end">
                <Button disabled={creating} onClick={create} size="sm">
                  {creating ? 'Creating…' : 'Create'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        confirmLabel="Delete"
        description={deleteTarget ? `"${deleteTarget}" will be permanently removed.` : ''}
        destructive
        onClose={() => setDeleteTarget(null)}
        onConfirm={remove}
        open={!!deleteTarget}
        title="Delete webhook?"
      />
    </div>
  )
}
