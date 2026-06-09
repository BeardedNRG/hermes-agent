import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'

import { panelHubForPath } from './routes'

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

// Sub-tab bar for the current PANEL hub. The sidebar navigates between the 5
// hubs; this strip switches pages WITHIN a multi-page hub (Connections, System,
// Settings). Single-page hubs (Dashboard, Models) render no strip.
function PanelSubTabs() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const hub = panelHubForPath(pathname)

  if (!hub || hub.pages.length < 2) {
    return null
  }

  return (
    <nav className="mb-3 flex shrink-0 flex-wrap items-center gap-1 border-b border-(--ui-stroke-tertiary) pb-2">
      {hub.pages.map(page => {
        const active = pathname === page.path || pathname.startsWith(`${page.path}/`)

        return (
          <button
            className={
              active
                ? 'rounded-md border border-(--ui-stroke-tertiary) bg-(--ui-control-active-background) px-3 py-1 text-[0.8125rem] font-medium text-foreground'
                : 'rounded-md border border-transparent px-3 py-1 text-[0.8125rem] font-medium text-(--ui-text-secondary) transition-colors hover:bg-(--ui-control-hover-background) hover:text-foreground'
            }
            key={page.id}
            onClick={() => navigate(page.path)}
            type="button"
          >
            {page.label}
          </button>
        )
      })}
    </nav>
  )
}

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
              <PanelSubTabs />
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
