export const SESSION_ROUTE_PREFIX = '/'
export const NEW_CHAT_ROUTE = '/'
export const SETTINGS_ROUTE = '/settings'
export const COMMAND_CENTER_ROUTE = '/command-center'
export const SKILLS_ROUTE = '/skills'
export const MESSAGING_ROUTE = '/messaging'
export const ARTIFACTS_ROUTE = '/artifacts'
export const CRON_ROUTE = '/cron'
export const PROFILES_ROUTE = '/profiles'
export const AGENTS_ROUTE = '/agents'
export const AGENT_CONFIG_ROUTE = '/agents/:agentId/config'
export const AGENT_DOWNLOADS_ROUTE = '/agents/:agentId/downloads'
// Merged dashboard admin pages render inline in the shell's own HashRouter,
// mounted by DesktopController as `panel/*`. Individual pages live at
// `${PANEL_ROUTE}/<page>` (e.g. /panel/analytics). No nested router.
export const PANEL_ROUTE = '/panel'

export const SESSIONS_ROUTE = '/sessions'
export const MODELS_ROUTE = '/models'
export const LOGS_ROUTE = '/logs'
export const PLUGINS_ROUTE = '/plugins'
export const MCP_ROUTE = '/mcp'
export const CHANNELS_ROUTE = '/channels'
export const WEBHOOKS_ROUTE = '/webhooks'
export const PAIRING_ROUTE = '/pairing'
export const CONFIG_ROUTE = '/config'
export const ENV_ROUTE = '/env'
export const SYSTEM_ROUTE = '/system'
export const DOCS_ROUTE = '/docs'
export const KANBAN_ROUTE = '/kanban'
export const ACHIEVEMENTS_ROUTE = '/achievements'

export type AppView =
  | 'agents'
  | 'artifacts'
  | 'chat'
  | 'command-center'
  | 'cron'
  | 'messaging'
  | 'panel'
  | 'profiles'
  | 'settings'
  | 'skills'

export type AppRouteId =
  | 'agents'
  | 'artifacts'
  | 'command-center'
  | 'cron'
  | 'messaging'
  | 'new'
  | 'panel'
  | 'profiles'
  | 'settings'
  | 'skills'

export interface AppRoute {
  id: AppRouteId
  path: string
  view: AppView
}

export const APP_ROUTES = [
  { id: 'new', path: NEW_CHAT_ROUTE, view: 'chat' },
  { id: 'settings', path: SETTINGS_ROUTE, view: 'settings' },
  { id: 'command-center', path: COMMAND_CENTER_ROUTE, view: 'command-center' },
  { id: 'skills', path: SKILLS_ROUTE, view: 'skills' },
  { id: 'messaging', path: MESSAGING_ROUTE, view: 'messaging' },
  { id: 'artifacts', path: ARTIFACTS_ROUTE, view: 'artifacts' },
  { id: 'cron', path: CRON_ROUTE, view: 'cron' },
  { id: 'profiles', path: PROFILES_ROUTE, view: 'profiles' },
  { id: 'agents', path: AGENTS_ROUTE, view: 'agents' },
  { id: 'panel', path: PANEL_ROUTE, view: 'panel' }
] as const satisfies readonly AppRoute[]

const APP_VIEW_BY_PATH = new Map<string, AppView>(APP_ROUTES.map(route => [route.path, route.view]))
const RESERVED_PATHS: ReadonlySet<string> = new Set(APP_ROUTES.map(route => route.path))

// Views that render as a full-screen modal card (OverlayView) over the shell.
// While one is open the app's titlebar control clusters must hide so they don't
// bleed over the overlay (they sit at a higher z-index than the overlay card).
export const OVERLAY_VIEWS: ReadonlySet<AppView> = new Set(['agents', 'command-center', 'cron', 'profiles', 'settings'])

export function isOverlayView(view: AppView): boolean {
  return OVERLAY_VIEWS.has(view)
}

export function isNewChatRoute(pathname: string): boolean {
  return pathname === NEW_CHAT_ROUTE
}

export function routeSessionId(pathname: string): string | null {
  if (!pathname.startsWith(SESSION_ROUTE_PREFIX) || RESERVED_PATHS.has(pathname)) {
    return null
  }

  const id = pathname.slice(SESSION_ROUTE_PREFIX.length)

  return id && !id.includes('/') ? decodeURIComponent(id) : null
}

export function sessionRoute(sessionId: string): string {
  return `${SESSION_ROUTE_PREFIX}${encodeURIComponent(sessionId)}`
}

export function appViewForPath(pathname: string): AppView {
  if (isNewChatRoute(pathname) || routeSessionId(pathname)) {
    return 'chat'
  }

  // Merged dashboard pages live under `${PANEL_ROUTE}/<page>` and render as a
  // single pane view. Match the whole subtree so sidebar/statusbar/titlebar
  // logic sees 'panel' instead of falling through to 'chat'.
  if (pathname === PANEL_ROUTE || pathname.startsWith(`${PANEL_ROUTE}/`)) {
    return 'panel'
  }

  return APP_VIEW_BY_PATH.get(pathname) ?? 'chat'
}

// ---------------------------------------------------------------------------
// PANEL hubs — the 13 flat dashboard pages are grouped into 5 ops-focused hubs.
// The sidebar shows one entry per hub (navigating to the hub's first page); a
// sub-tab bar inside the panel pane switches between a hub's pages. This is the
// single source of truth shared by the sidebar and the sub-tab bar. No JSX here
// (icons are mapped by id in the sidebar) so routes.ts stays import-light.
// ---------------------------------------------------------------------------
export interface PanelHubPage {
  id: string
  label: string
  path: string
}

export interface PanelHub {
  id: string
  label: string
  pages: readonly PanelHubPage[]
}

const panelPath = (page: string) => `${PANEL_ROUTE}/${page}`

export const PANEL_HUBS: readonly PanelHub[] = [
  { id: 'dashboard', label: 'Dashboard', pages: [{ id: 'analytics', label: 'Analytics', path: panelPath('analytics') }] },
  { id: 'models', label: 'Models', pages: [{ id: 'models', label: 'Models', path: panelPath('models') }] },
  {
    id: 'connections',
    label: 'Connections',
    pages: [
      { id: 'channels', label: 'Channels', path: panelPath('channels') },
      { id: 'webhooks', label: 'Webhooks', path: panelPath('webhooks') },
      { id: 'pairing', label: 'Pairing', path: panelPath('pairing') },
      { id: 'mcp', label: 'MCP', path: panelPath('mcp') }
    ]
  },
  {
    id: 'system',
    label: 'System',
    pages: [
      { id: 'logs', label: 'Logs', path: panelPath('logs') },
      { id: 'system', label: 'System', path: panelPath('system') },
      { id: 'plugins', label: 'Plugins', path: panelPath('plugins') }
    ]
  },
  {
    id: 'settings',
    label: 'Settings',
    pages: [
      { id: 'env', label: 'Keys', path: panelPath('env') },
      { id: 'config', label: 'Config', path: panelPath('config') },
      { id: 'docs', label: 'Docs', path: panelPath('docs') }
    ]
  }
] as const

export function panelHubForPath(pathname: string): PanelHub | undefined {
  return PANEL_HUBS.find(hub => hub.pages.some(page => pathname === page.path || pathname.startsWith(`${page.path}/`)))
}
