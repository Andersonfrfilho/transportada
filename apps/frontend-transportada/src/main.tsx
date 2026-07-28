/* Copyright (c) 2026 Ada Technology. MIT License. */
import { StrictMode, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { registerSW } from 'virtual:pwa-register'

import { BillingWorkspacePage } from '@/modules/billing/pages/BillingWorkspace.page'
import { CteBatchWorkspacePage } from '@/modules/cte-batch/pages/CteBatchWorkspace.page'
import { CompanySettingsPage } from '@/modules/company-settings/pages/CompanySettings.page'
import { CteProfilesPage } from '@/modules/cte-profiles/pages/CteProfiles.page'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import '@/modules/shared/i18n/i18n.service'
import { FleetWorkspacePage } from '@/modules/fleet/pages/FleetWorkspace.page'
import { FreightWorkspacePage } from '@/modules/freight/pages/FreightWorkspace.page'
import { useAuthMeQuery } from '@/modules/identity/queries/useAuthMe.query'
import {
  getKeycloakAuthProvider,
  initializeKeycloakAuth,
} from '@/modules/identity/shared/KeycloakAuthProvider.provider'
import { isSmokeAuthBypassEnabled } from '@/modules/identity/shared/smokeAuthBypass.service'
import { MdfeManifestWorkspacePage } from '@/modules/mdfe-manifest/pages/MdfeManifestWorkspace.page'
import { NfeWorkspacePage } from '@/modules/nfe-workspace/pages/NfeWorkspace.page'
import { OperationsDashboardPage } from '@/modules/operations/pages/OperationsDashboard.page'
import '@/styles/index.css'

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, staleTime: 30_000 } },
})

if (!isSmokeAuthBypassEnabled()) {
  registerSW({ immediate: true })
}

const rootElement = document.getElementById('root')

if (rootElement === null) {
  throw new Error('FRONTEND_ROOT_MISSING')
}

const applicationRootElement = rootElement
const WORKSPACE_STORAGE_KEY = 'transportada.workspace'

type WorkspaceNavigationItem = Readonly<{
  href: string
  key:
    | 'billing'
    | 'company-settings'
    | 'cte-batch'
    | 'cte-profiles'
    | 'fleet'
    | 'freight'
    | 'mdfe-manifest'
    | 'nfe'
    | 'operations'
  label: string
}>

type NavigationGroup = Readonly<{
  key: 'administration' | 'fiscal' | 'operations'
  label: string
  items: readonly WorkspaceNavigationItem[]
}>

function WorkspaceIcon({ workspace }: Readonly<{ workspace: WorkspaceNavigationItem['key'] }>) {
  const paths: Record<WorkspaceNavigationItem['key'], string> = {
    billing:
      'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z M12 7v10 M15 9.5c-.7-1-1.7-1.5-3-1.5-1.7 0-3 1-0.8 3 1.7 0 3 .8 3 2.5s-1.3 3-3 3c-1.3 0-2.3-.5-3-1.5',
    'company-settings': 'M12 3 5 6v5c0 4.5 2.8 8.4 7 10 4.2-1.6 7-5.5 7-10V6l-7-3Z M9 12l2 2 4-5',
    'cte-batch': 'M7 4h10v3h3v13H4V7h3z M9 4h6 M8 11h8 M8 15h5',
    'cte-profiles': 'M5 4h9l5 5v11H5z M14 4v5h5 M8 13h8 M8 17h5 M9 9h2',
    fleet:
      'M4 8h9v7H4z M13 10h4l3 3v2h-7z M8 18a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z M17 18a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z M12 5.5a2 2 0 1 0-4 0',
    freight:
      'M3 7h11v10H3z M14 10h4l3 3v4h-7z M7 20a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z M17 20a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z',
    'mdfe-manifest':
      'M4 6h11v9H4z M15 9h3l2 3v3h-5z M8 19a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z M17 19a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z M7 9h5 M7 12h5',
    nfe: 'M6 3h9l3 3v15H6z M15 3v4h4 M9 11h6 M9 15h6',
    operations: 'M4 18V6 M4 18h16 M8 15v-3 M12 15V8 M16 15v-6',
  }
  return (
    <svg aria-hidden="true" className="workspace-nav-icon" viewBox="0 0 24 24">
      {paths[workspace].split(' M').map((path, index) => (
        <path d={`${index === 0 ? '' : 'M'}${path}`} key={`${workspace}-${index}`} />
      ))}
    </svg>
  )
}

const WORKSPACE_NAVIGATION_ITEMS: readonly WorkspaceNavigationItem[] = [
  { href: '/', key: 'nfe', label: 'NF-e' },
  { href: '/freight', key: 'freight', label: 'Frete' },
  { href: '/cte-batches', key: 'cte-batch', label: 'CT-e' },
  { href: '/mdfe-manifests', key: 'mdfe-manifest', label: 'MDF-e' },
  { href: '/billing', key: 'billing', label: 'Faturamento' },
  { href: '/operations', key: 'operations', label: 'Operações' },
  { href: '/company-settings', key: 'company-settings', label: 'Empresa' },
  { href: '/cte-profiles', key: 'cte-profiles', label: 'Perfis CT-e' },
  { href: '/fleet', key: 'fleet', label: 'Frota' },
]

const NAVIGATION_GROUPS: readonly NavigationGroup[] = [
  {
    key: 'fiscal',
    label: 'Fiscal',
    items: WORKSPACE_NAVIGATION_ITEMS.filter(({ key }) =>
      ['nfe', 'freight', 'cte-batch', 'mdfe-manifest', 'billing'].includes(key),
    ),
  },
  {
    key: 'operations',
    label: 'Operações',
    items: WORKSPACE_NAVIGATION_ITEMS.filter(({ key }) => key === 'operations'),
  },
  {
    key: 'administration',
    label: 'Administração',
    items: WORKSPACE_NAVIGATION_ITEMS.filter(({ key }) =>
      ['company-settings', 'cte-profiles', 'fleet'].includes(key),
    ),
  },
]

function persistWorkspacePreference(workspace: WorkspaceNavigationItem['key']): void {
  if (workspace === 'nfe') {
    sessionStorage.removeItem(WORKSPACE_STORAGE_KEY)
    return
  }

  sessionStorage.setItem(WORKSPACE_STORAGE_KEY, workspace)
}

function resolveCurrentWorkspace(): WorkspaceNavigationItem['key'] {
  if (window.location.pathname === '/billing') return 'billing'
  if (window.location.pathname === '/company-settings') return 'company-settings'
  if (window.location.pathname === '/cte-batches') return 'cte-batch'
  if (window.location.pathname === '/cte-profiles') return 'cte-profiles'
  if (window.location.pathname === '/fleet') return 'fleet'
  if (window.location.pathname === '/mdfe-manifests') return 'mdfe-manifest'
  if (window.location.pathname === '/operations') return 'operations'
  if (window.location.pathname === '/freight') return 'freight'

  const storedWorkspace = sessionStorage.getItem(WORKSPACE_STORAGE_KEY)
  if (
    storedWorkspace === 'billing' ||
    storedWorkspace === 'company-settings' ||
    storedWorkspace === 'cte-batch' ||
    storedWorkspace === 'cte-profiles' ||
    storedWorkspace === 'fleet' ||
    storedWorkspace === 'mdfe-manifest' ||
    storedWorkspace === 'operations' ||
    storedWorkspace === 'freight'
  ) {
    return storedWorkspace
  }

  return 'nfe'
}

function resolvePage(workspace: WorkspaceNavigationItem['key']): ReactNode {
  switch (workspace) {
    case 'billing':
      return <BillingWorkspacePage />
    case 'company-settings':
      return <CompanySettingsPage />
    case 'cte-batch':
      return <CteBatchWorkspacePage />
    case 'cte-profiles':
      return <CteProfilesPage />
    case 'fleet':
      return <FleetWorkspacePage />
    case 'mdfe-manifest':
      return <MdfeManifestWorkspacePage />
    case 'operations':
      return <OperationsDashboardPage />
    case 'freight':
      return <FreightWorkspacePage />
    default:
      return <NfeWorkspacePage />
  }
}

function ApplicationShell(): ReactNode {
  const authMeQuery = useAuthMeQuery()
  const [currentWorkspace, setCurrentWorkspace] = useState(resolveCurrentWorkspace)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [pageTransitionPending, setPageTransitionPending] = useState(false)
  const [openGroups, setOpenGroups] = useState<Readonly<Record<NavigationGroup['key'], boolean>>>({
    administration: ['company-settings', 'cte-profiles', 'fleet'].includes(currentWorkspace),
    fiscal: ['nfe', 'freight', 'cte-batch', 'mdfe-manifest', 'billing'].includes(currentWorkspace),
    operations: currentWorkspace === 'operations',
  })
  const [collapsedGroup, setCollapsedGroup] = useState<NavigationGroup['key'] | null>(null)

  useEffect(() => {
    function closeWithEscape(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        setSidebarOpen(false)
        setOpenGroups({ administration: true, fiscal: true, operations: true })
      }
    }
    window.addEventListener('keydown', closeWithEscape)
    return () => window.removeEventListener('keydown', closeWithEscape)
  }, [])

  useEffect(() => {
    function syncLocation(): void {
      setCurrentWorkspace(resolveCurrentWorkspace())
    }
    window.addEventListener('popstate', syncLocation)
    return () => window.removeEventListener('popstate', syncLocation)
  }, [])

  function navigateTo(item: WorkspaceNavigationItem): void {
    window.history.pushState({}, '', item.href)
    persistWorkspacePreference(item.key)
    setCurrentWorkspace(item.key)
    setPageTransitionPending(true)
    window.setTimeout(() => setPageTransitionPending(false), 180)
  }

  const toggleGroup = (key: NavigationGroup['key']) => {
    setOpenGroups((current) => ({ ...current, [key]: !current[key] }))
  }
  const userProfile = getKeycloakAuthProvider().getProfile()

  return (
    <div
      className={`application-shell${sidebarOpen ? ' application-shell-sidebar-open' : ' application-shell-sidebar-collapsed'}`}
    >
      <button
        aria-label="Fechar menu"
        className="sidebar-backdrop"
        type="button"
        onClick={() => setSidebarOpen(false)}
      />
      <aside className="application-sidebar" aria-label="Navegação principal">
        <div className="sidebar-brand">
          <Button
            aria-label={sidebarOpen ? 'Recolher menu' : 'Expandir menu'}
            className="sidebar-close-button"
            size="sm"
            title={sidebarOpen ? 'Recolher menu' : 'Expandir menu'}
            variant="ghost"
            onClick={() => {
              setSidebarOpen((current) => !current)
              setCollapsedGroup(null)
              setOpenGroups({ administration: true, fiscal: true, operations: true })
            }}
          >
            <span aria-hidden="true">{sidebarOpen ? '×' : '☰'}</span>
          </Button>
          <Badge variant="secondary">Transport stack</Badge>
          <strong>TransportAdA</strong>
          <span>PWA operacional modular</span>
        </div>
        <nav className="sidebar-navigation" aria-label="Módulos">
          {NAVIGATION_GROUPS.map((group) => (
            <section className="sidebar-group" key={group.key}>
              <button
                aria-expanded={sidebarOpen ? openGroups[group.key] : collapsedGroup === group.key}
                aria-label={group.label}
                className="sidebar-group-toggle"
                type="button"
                onClick={() => {
                  if (!sidebarOpen) {
                    setCollapsedGroup((current) => (current === group.key ? null : group.key))
                    return
                  }
                  toggleGroup(group.key)
                }}
              >
                <WorkspaceIcon workspace={group.items[0]?.key ?? 'nfe'} />
                <span>{group.label}</span>
                <span aria-hidden="true">{openGroups[group.key] ? '−' : '+'}</span>
              </button>
              {(sidebarOpen ? openGroups[group.key] : collapsedGroup === group.key) && (
                <div
                  className={`sidebar-group-items${sidebarOpen ? '' : ' sidebar-group-items-flyout'}`}
                >
                  {group.items.map((item) => (
                    <a
                      aria-label={item.label}
                      className={
                        item.key === currentWorkspace
                          ? 'sidebar-link sidebar-link-active'
                          : 'sidebar-link'
                      }
                      data-tooltip={item.label}
                      href={item.href}
                      key={item.key}
                      title={item.label}
                      onClick={(event) => {
                        event.preventDefault()
                        setCollapsedGroup(null)
                        navigateTo(item)
                      }}
                    >
                      <WorkspaceIcon workspace={item.key} />
                      <span>{item.label}</span>
                    </a>
                  ))}
                </div>
              )}
            </section>
          ))}
        </nav>
      </aside>
      <div className="application-main">
        <header className="application-header">
          <Card className="application-header-card">
            <CardHeader className="application-header-copy">
              <Button
                aria-label="Abrir navegação"
                className="mobile-sidebar-trigger"
                size="sm"
                title="Abrir navegação"
                variant="ghost"
                onClick={() => setSidebarOpen(true)}
              >
                <span aria-hidden="true">☰</span>
              </Button>
              <div>
                <CardTitle className="application-wordmark">
                  {WORKSPACE_NAVIGATION_ITEMS.find((item) => item.key === currentWorkspace)
                    ?.label ?? 'TransportAdA'}
                </CardTitle>
                <CardDescription>Workspace operacional</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="application-header-context">
              <span>TransportAdA</span>
              <span>Homologação</span>
              <div className="application-user-area" aria-label="Sessão do usuário">
                <span className="application-user-avatar" aria-hidden="true">
                  {userProfile.pictureUrl !== undefined ? (
                    <img className="application-user-photo" src={userProfile.pictureUrl} alt="" />
                  ) : (
                    userProfile.initials
                  )}
                </span>
                <span className="application-user-identity">
                  <span className="application-user-name">
                    {authMeQuery.isLoading ? 'Carregando' : userProfile.displayName}
                  </span>
                  {!authMeQuery.isLoading && userProfile.subtitle !== undefined ? (
                    <span className="application-user-subtitle">{userProfile.subtitle}</span>
                  ) : null}
                </span>
                <Button
                  aria-label="Sair"
                  className="application-logout-button"
                  size="sm"
                  title="Sair"
                  variant="ghost"
                  onClick={() => {
                    void getKeycloakAuthProvider().logout()
                  }}
                >
                  <span aria-hidden="true">↪</span>
                </Button>
              </div>
            </CardContent>
          </Card>
        </header>
        <div className="application-page-transition" aria-busy={pageTransitionPending}>
          {pageTransitionPending ? <PageTransitionSkeleton /> : resolvePage(currentWorkspace)}
        </div>
      </div>
    </div>
  )
}

function PageTransitionSkeleton(): ReactNode {
  return (
    <main className="page-transition-skeleton" aria-label="Carregando tela">
      <div className="skeleton-block skeleton-eyebrow" />
      <div className="skeleton-block skeleton-title" />
      <div className="skeleton-grid">
        <div className="skeleton-block skeleton-card" />
        <div className="skeleton-block skeleton-card" />
      </div>
    </main>
  )
}

async function bootstrapApplication(): Promise<void> {
  await initializeKeycloakAuth()

  createRoot(applicationRootElement).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <ApplicationShell />
      </QueryClientProvider>
    </StrictMode>,
  )
}

void bootstrapApplication()
