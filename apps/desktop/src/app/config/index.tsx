import { useState } from 'react'

import { Codicon } from '../../components/ui/codicon'
import { Tabs, TabsList, TabsTrigger } from '../../components/ui/tabs'

import { ConfigPanel } from './config-panel'
import { HooksPanel } from './panels/hooks'
import { PairingPanel } from './panels/pairing'

// Config umbrella: one nav surface consolidating Config + Plugins, MCP,
// Channels, Hooks, Pairing & Keys (per the dashboard merge plan). Config is
// the first ported panel; the rest land here in follow-up increments.

type SubTab = 'config' | 'plugins' | 'mcp' | 'channels' | 'hooks' | 'pairing' | 'keys'

const SUB_TABS: { id: SubTab; label: string; icon: string }[] = [
  { id: 'config', label: 'Config', icon: 'settings-gear' },
  { id: 'plugins', label: 'Plugins', icon: 'extensions' },
  { id: 'mcp', label: 'MCP', icon: 'plug' },
  { id: 'channels', label: 'Channels', icon: 'broadcast' },
  { id: 'hooks', label: 'Hooks', icon: 'link' },
  { id: 'pairing', label: 'Pairing', icon: 'key' },
  { id: 'keys', label: 'Keys', icon: 'lock' },
]

function StubPanel({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-24 text-(--ui-text-tertiary)">
      <Codicon className="size-7 opacity-40" name="tools" />
      <p className="text-sm font-medium">{label} — porting in progress</p>
      <p className="text-xs">This panel moves into the Config umbrella in an upcoming build.</p>
    </div>
  )
}

export function ConfigView() {
  const [tab, setTab] = useState<SubTab>('config')

  return (
    <div className="flex h-full min-w-0 flex-col gap-4 overflow-y-auto p-4 pt-(--titlebar-height)">
      <div className="flex items-center gap-2 text-xs text-(--ui-text-tertiary)">
        <Codicon name="settings-gear" />
        <span className="font-semibold uppercase tracking-wider">Configuration</span>
      </div>

      <Tabs onValueChange={v => setTab(v as SubTab)} value={tab}>
        <TabsList className="flex-wrap">
          {SUB_TABS.map(t => (
            <TabsTrigger key={t.id} value={t.id}>
              <Codicon name={t.icon} />
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <div className="min-w-0 flex-1">
        {tab === 'config' ? (
          <ConfigPanel />
        ) : tab === 'pairing' ? (
          <PairingPanel />
        ) : tab === 'hooks' ? (
          <HooksPanel />
        ) : (
          <StubPanel label={SUB_TABS.find(t => t.id === tab)?.label ?? ''} />
        )}
      </div>
    </div>
  )
}
