import { useState } from 'react'

import { Codicon } from '../../components/ui/codicon'
import { Tabs, TabsList, TabsTrigger } from '../../components/ui/tabs'

import { ConfigPanel } from './config-panel'
import { ChannelsPanel } from './panels/channels'
import { EnvPanel } from './panels/env'
import { HooksPanel } from './panels/hooks'
import { KeysPanel } from './panels/keys'
import { McpPanel } from './panels/mcp'
import { PairingPanel } from './panels/pairing'
import { PluginsPanel } from './panels/plugins'

// Config umbrella: one nav surface consolidating Config + Plugins, MCP,
// Channels, Hooks, Pairing, Keys & Env (per the dashboard merge plan).

type SubTab = 'config' | 'plugins' | 'mcp' | 'channels' | 'hooks' | 'pairing' | 'keys' | 'env'

const SUB_TABS: { id: SubTab; label: string; icon: string; Panel: () => React.JSX.Element }[] = [
  { id: 'config', label: 'Config', icon: 'settings-gear', Panel: ConfigPanel },
  { id: 'plugins', label: 'Plugins', icon: 'extensions', Panel: PluginsPanel },
  { id: 'mcp', label: 'MCP', icon: 'plug', Panel: McpPanel },
  { id: 'channels', label: 'Channels', icon: 'broadcast', Panel: ChannelsPanel },
  { id: 'hooks', label: 'Hooks', icon: 'link', Panel: HooksPanel },
  { id: 'pairing', label: 'Pairing', icon: 'key', Panel: PairingPanel },
  { id: 'keys', label: 'Keys', icon: 'lock', Panel: KeysPanel },
  { id: 'env', label: 'Env', icon: 'symbol-key', Panel: EnvPanel },
]

export function ConfigView() {
  const [tab, setTab] = useState<SubTab>('config')
  const ActivePanel = (SUB_TABS.find(t => t.id === tab) ?? SUB_TABS[0]).Panel

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
        <ActivePanel />
      </div>
    </div>
  )
}
