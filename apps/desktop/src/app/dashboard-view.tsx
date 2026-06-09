import { Navigate, Route, Routes } from 'react-router-dom'

import { PageHeaderProvider } from '@dash/contexts/PageHeaderProvider'
import { SystemActionsProvider } from '@dash/contexts/SystemActions'
import { I18nProvider as DashI18nProvider } from '@dash/i18n'
import { exposePluginSDK } from '@dash/plugins'
import { ThemeProvider as DashThemeProvider } from '@dash/themes'

import AnalyticsPage from '@dash/pages/AnalyticsPage'
import ChannelsPage from '@dash/pages/ChannelsPage'
import ConfigPage from '@dash/pages/ConfigPage'
import DocsPage from '@dash/pages/DocsPage'
import EnvPage from '@dash/pages/EnvPage'
import GroupChatComingSoon from '@dash/pages/GroupChatComingSoon'
import LogsPage from '@dash/pages/LogsPage'
import McpPage from '@dash/pages/McpPage'
import ModelsPage from '@dash/pages/ModelsPage'
import PairingPage from '@dash/pages/PairingPage'
import PluginsPage from '@dash/pages/PluginsPage'
import SystemPage from '@dash/pages/SystemPage'
import WebhooksPage from '@dash/pages/WebhooksPage'

import '@dash/index.css'
import '@dash/panel-skin.css'

// Full merge: dashboard admin pages render INLINE in the desktop shell's own
// router (HashRouter) and main pane — NOT a nested app, NOT a second router.
// (The earlier MemoryRouter approach crashed with "Router inside Router".)
// We provide the dashboard's own i18n/theme/system-action/page-header contexts
// here, then a relative <Routes> for the panel pages. The desktop sidebar owns
// navigation to /panel/<x>; the dashboard's own sidebar is not used.
//
// Skips pages the desktop already has natively (Sessions/Chat/Skills/Cron/
// Profiles). Plugin-defined dashboard pages are not wired yet (TODO).
//
// exposePluginSDK() once on module load so plugin bundles can resolve the SDK.
exposePluginSDK()

export function DashboardView() {
  return (
    <DashI18nProvider>
      <DashThemeProvider lockedTheme="default">
        <SystemActionsProvider>
          <PageHeaderProvider pluginTabs={[]}>
            <div
              data-hermes-panel
              className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto px-3 pt-2 sm:px-6 sm:pt-4 lg:pt-6"
            >
              <Routes>
                <Route index element={<Navigate replace to="analytics" />} />
                <Route path="analytics" element={<AnalyticsPage />} />
                <Route path="models" element={<ModelsPage />} />
                <Route path="logs" element={<LogsPage />} />
                <Route path="mcp" element={<McpPage />} />
                <Route path="channels" element={<ChannelsPage />} />
                <Route path="webhooks" element={<WebhooksPage />} />
                <Route path="pairing" element={<PairingPage />} />
                <Route path="env" element={<EnvPage />} />
                <Route path="config" element={<ConfigPage />} />
                <Route path="system" element={<SystemPage />} />
                <Route path="plugins" element={<PluginsPage />} />
                <Route path="docs" element={<DocsPage />} />
                <Route path="group-chat" element={<GroupChatComingSoon />} />
                <Route path="*" element={<Navigate replace to="analytics" />} />
              </Routes>
            </div>
          </PageHeaderProvider>
        </SystemActionsProvider>
      </DashThemeProvider>
    </DashI18nProvider>
  )
}
