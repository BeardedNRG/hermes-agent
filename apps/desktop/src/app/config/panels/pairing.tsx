import { useCallback, useEffect, useState } from 'react'

import { Button } from '../../../components/ui/button'
import { Codicon } from '../../../components/ui/codicon'
import { ConfirmDialog } from '../../../components/ui/confirm-dialog'
import { Loader } from '../../../components/ui/loader'

// Config » Pairing panel — ported from web/src/pages/PairingPage.tsx. Approve or
// revoke the platform users (Discord/Telegram/etc.) allowed to message the agent.

interface PairingUser {
  platform: string
  user_id: string
  user_name?: string
  code?: string
  age_minutes?: number
}

interface PairingResponse {
  pending: PairingUser[]
  approved: PairingUser[]
}

const userKey = (u: PairingUser) => `${u.platform}:${u.user_id}`
const userLabel = (u: PairingUser) => u.user_name || u.user_id

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

interface Flash {
  msg: string
  kind: 'success' | 'error'
}

export function PairingPanel() {
  const [pending, setPending] = useState<PairingUser[]>([])
  const [approved, setApproved] = useState<PairingUser[]>([])
  const [loading, setLoading] = useState(true)
  const [approving, setApproving] = useState<string | null>(null)
  const [clearConfirm, setClearConfirm] = useState(false)
  const [revokeTarget, setRevokeTarget] = useState<PairingUser | null>(null)
  const [flash, setFlash] = useState<Flash | null>(null)

  const showFlash = useCallback((msg: string, kind: Flash['kind']) => {
    setFlash({ msg, kind })
    window.setTimeout(() => setFlash(null), 3000)
  }, [])

  const api = useCallback(<T,>(path: string, method = 'GET', body?: unknown) => {
    return window.hermesDesktop!.api<T>({ path, method, body })
  }, [])

  const load = useCallback(() => {
    api<PairingResponse>('/api/pairing')
      .then(res => {
        setPending(res.pending)
        setApproved(res.approved)
      })
      .catch(() => showFlash('Failed to load pairing requests', 'error'))
      .finally(() => setLoading(false))
  }, [api, showFlash])

  useEffect(() => {
    load()
  }, [load])

  const approve = async (user: PairingUser) => {
    if (!user.code) {
      showFlash('Missing pairing code', 'error')

      return
    }

    setApproving(userKey(user))

    try {
      await api('/api/pairing/approve', 'POST', { platform: user.platform, code: user.code })
      showFlash(`Approved "${userLabel(user)}"`, 'success')
      load()
    } catch (e) {
      showFlash(`Error: ${e}`, 'error')
    } finally {
      setApproving(null)
    }
  }

  const clearPending = async () => {
    const res = await api<{ cleared: number }>('/api/pairing/clear-pending', 'POST')
    showFlash(`Cleared ${res.cleared} pending request(s)`, 'success')
    load()
  }

  const revoke = async () => {
    if (!revokeTarget) {return}
    await api('/api/pairing/revoke', 'POST', { platform: revokeTarget.platform, user_id: revokeTarget.user_id })
    showFlash(`Revoked "${userLabel(revokeTarget)}"`, 'success')
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
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-end">
        <Button disabled={pending.length === 0} onClick={() => setClearConfirm(true)} size="sm" variant="ghost">
          <Codicon name="trash" />
          Clear pending
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

      {/* Pending */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-(--ui-text-secondary)">
          <Codicon name="organization" />
          Pending requests ({pending.length})
        </div>
        {pending.length === 0 ? (
          <Card>
            <div className="py-8 text-center text-sm text-(--ui-text-tertiary)">No pending pairing requests</div>
          </Card>
        ) : (
          pending.map(user => {
            const key = userKey(user)

            return (
              <Card key={key}>
                <div className="flex items-start gap-4 px-4 py-4">
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex items-center gap-2">
                      <Pill>{user.platform}</Pill>
                      {user.code && <span className="font-mono text-sm">{user.code}</span>}
                    </div>
                    <div className="flex items-center gap-4 text-xs text-(--ui-text-tertiary)">
                      <span className="truncate">{user.user_id}</span>
                      {user.user_name && <span className="truncate">{user.user_name}</span>}
                      {typeof user.age_minutes === 'number' && <span>{user.age_minutes}m ago</span>}
                    </div>
                  </div>
                  <Button
                    disabled={approving === key || !user.code}
                    onClick={() => approve(user)}
                    size="sm"
                  >
                    {approving === key ? <Loader /> : <Codicon name="check" />}
                    Approve
                  </Button>
                </div>
              </Card>
            )
          })
        )}
      </div>

      {/* Approved */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-(--ui-text-secondary)">
          <Codicon name="verified" />
          Approved users ({approved.length})
        </div>
        {approved.length === 0 ? (
          <Card>
            <div className="py-8 text-center text-sm text-(--ui-text-tertiary)">No approved users</div>
          </Card>
        ) : (
          approved.map(user => {
            const key = userKey(user)

            return (
              <Card key={key}>
                <div className="flex items-start gap-4 px-4 py-4">
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex items-center gap-2">
                      <Pill>{user.platform}</Pill>
                      <span className="truncate text-sm font-medium">{user.user_id}</span>
                    </div>
                    {user.user_name && <div className="truncate text-xs text-(--ui-text-tertiary)">{user.user_name}</div>}
                  </div>
                  <Button
                    aria-label="Revoke"
                    className="text-destructive"
                    onClick={() => setRevokeTarget(user)}
                    size="icon"
                    variant="ghost"
                  >
                    <Codicon name="close" />
                  </Button>
                </div>
              </Card>
            )
          })
        )}
      </div>

      <ConfirmDialog
        confirmLabel="Clear"
        description={`Clear all ${pending.length} pending pairing request(s)?`}
        destructive
        onClose={() => setClearConfirm(false)}
        onConfirm={clearPending}
        open={clearConfirm}
        title="Clear pending requests?"
      />
      <ConfirmDialog
        confirmLabel="Revoke"
        description={
          revokeTarget ? `"${userLabel(revokeTarget)}" will lose access. This cannot be undone.` : ''
        }
        destructive
        onClose={() => setRevokeTarget(null)}
        onConfirm={revoke}
        open={!!revokeTarget}
        title="Revoke access?"
      />
    </div>
  )
}
