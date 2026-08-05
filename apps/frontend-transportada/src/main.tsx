/* Copyright (c) 2026 Ada Technology. MIT License. */
import { StrictMode, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { registerSW } from 'virtual:pwa-register'

import { BillingInvoiceDetailPage } from '@/modules/billing/pages/BillingInvoiceDetail.page'
import { BillingWorkspacePage } from '@/modules/billing/pages/BillingWorkspace.page'
import { parseBillingInvoiceRoute } from '@/modules/billing/shared/billingInvoiceRoute.service'
import { CteBatchWorkspacePage } from '@/modules/cte-batch/pages/CteBatchWorkspace.page'
import { CompanySettingsPage } from '@/modules/company-settings/pages/CompanySettings.page'
import { CteProfilesPage } from '@/modules/cte-profiles/pages/CteProfiles.page'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Icon } from '@/components/ui/icon'
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
import { parseMdfeManifestTripParameter } from '@/modules/mdfe-manifest/shared/mdfeManifestRoute.service'
import { NfeWorkspacePage } from '@/modules/nfe-workspace/pages/NfeWorkspace.page'
import { OperationsDashboardPage } from '@/modules/operations/pages/OperationsDashboard.page'
import { TripDetailPage } from '@/modules/trip/pages/TripDetail.page'
import { TripWorkspacePage } from '@/modules/trip/pages/TripWorkspace.page'
import { parseTripRoute } from '@/modules/trip/shared/tripRoute.service'
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
    | 'trip'
  label: string
}>

type NavigationGroup = Readonly<{
  key: 'administration' | 'fiscal' | 'operations'
  label: string
  items: readonly WorkspaceNavigationItem[]
}>

const WORKSPACE_NAVIGATION_ITEMS: readonly WorkspaceNavigationItem[] = [
  { href: '/', key: 'nfe', label: 'NF-e' },
  { href: '/freight', key: 'freight', label: 'Frete' },
  { href: '/cte-batches', key: 'cte-batch', label: 'CT-e' },
  { href: '/trips', key: 'trip', label: 'Viagens' },
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
      ['nfe', 'freight', 'cte-batch', 'trip', 'mdfe-manifest', 'billing'].includes(key),
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
  /** O detalhe da fatura é uma tela do faturamento: o menu continua marcando a mesma entrada. */
  if (parseBillingInvoiceRoute(window.location.pathname) !== null) return 'billing'
  if (window.location.pathname === '/billing') return 'billing'
  if (window.location.pathname === '/company-settings') return 'company-settings'
  if (window.location.pathname === '/cte-batches') return 'cte-batch'
  if (parseTripRoute(window.location.pathname) !== null) return 'trip'
  if (window.location.pathname === '/trips') return 'trip'
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
    storedWorkspace === 'freight' ||
    storedWorkspace === 'trip'
  ) {
    return storedWorkspace
  }

  return 'nfe'
}

function resolvePage(
  input: Readonly<{ path: string; search: string; workspace: WorkspaceNavigationItem['key'] }>,
): ReactNode {
  switch (input.workspace) {
    case 'billing': {
      const invoiceId = parseBillingInvoiceRoute(input.path)
      return invoiceId === null ? (
        <BillingWorkspacePage />
      ) : (
        <BillingInvoiceDetailPage invoiceId={invoiceId} />
      )
    }
    case 'company-settings':
      return <CompanySettingsPage />
    case 'cte-batch':
      return <CteBatchWorkspacePage />
    case 'cte-profiles':
      return <CteProfilesPage />
    case 'fleet':
      return <FleetWorkspacePage />
    case 'mdfe-manifest':
      return (
        <MdfeManifestWorkspacePage originTripId={parseMdfeManifestTripParameter(input.search)} />
      )
    case 'trip': {
      const tripId = parseTripRoute(input.path)
      return tripId === null ? <TripWorkspacePage /> : <TripDetailPage tripId={tripId} />
    }
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
  /** O workspace sozinho não distingue a lista do detalhe: a rota completa é quem decide a tela. */
  const [currentPath, setCurrentPath] = useState(() => window.location.pathname)
  /** A viagem de origem do MDF-e viaja na query string, fora do `pathname` que decide o workspace. */
  const [currentSearch, setCurrentSearch] = useState(() => window.location.search)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [pageTransitionPending, setPageTransitionPending] = useState(false)
  const [openGroups, setOpenGroups] = useState<Readonly<Record<NavigationGroup['key'], boolean>>>({
    administration: ['company-settings', 'cte-profiles', 'fleet'].includes(currentWorkspace),
    fiscal: ['nfe', 'freight', 'cte-batch', 'trip', 'mdfe-manifest', 'billing'].includes(
      currentWorkspace,
    ),
    operations: currentWorkspace === 'operations',
  })
  const [collapsedGroup, setCollapsedGroup] = useState<NavigationGroup['key'] | null>(null)
  const [sessionExpired, setSessionExpired] = useState(false)

  /** Reautenticar é navegação de página inteira: quem decide a hora é o usuário, não o token. */
  useEffect(() => {
    return getKeycloakAuthProvider().onSessionExpired(() => setSessionExpired(true))
  }, [])

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
      setCurrentPath(window.location.pathname)
      setCurrentSearch(window.location.search)
    }
    window.addEventListener('popstate', syncLocation)
    return () => window.removeEventListener('popstate', syncLocation)
  }, [])

  function navigateTo(item: WorkspaceNavigationItem): void {
    window.history.pushState({}, '', item.href)
    persistWorkspacePreference(item.key)
    setCurrentWorkspace(item.key)
    setCurrentPath(item.href)
    setCurrentSearch('')
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
                <Icon
                  className="workspace-nav-icon"
                  name={`workspace-${group.items[0]?.key ?? 'nfe'}`}
                />
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
                      <Icon className="workspace-nav-icon" name={`workspace-${item.key}`} />
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
        {sessionExpired ? (
          <div className="application-session-banner" role="alert">
            <span>Sua sessão expirou. Entre novamente para continuar de onde parou.</span>
            <Button
              onClick={() => {
                void getKeycloakAuthProvider().restartAuthentication()
              }}
              size="sm"
              type="button"
            >
              <Icon name="shield" />
              Entrar novamente
            </Button>
          </div>
        ) : null}
        <div className="application-page-transition" aria-busy={pageTransitionPending}>
          {pageTransitionPending ? (
            <PageTransitionSkeleton />
          ) : (
            resolvePage({ path: currentPath, search: currentSearch, workspace: currentWorkspace })
          )}
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
