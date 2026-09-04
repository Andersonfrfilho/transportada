/* Copyright (c) 2026 Ada Technology. MIT License. */
import { NotificationBell, NotificationProvider } from '@adatechnology/notification-ui'
import '@adatechnology/notification-ui/styles.css'
import { StrictMode, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { registerSW } from 'virtual:pwa-register'

import { COPY_FEEDBACK_MILLISECONDS } from '@/modules/shared/clipboard.constant'
import { BillingInvoiceDetailPage } from '@/modules/billing/pages/BillingInvoiceDetail.page'
import { BillingWorkspacePage } from '@/modules/billing/pages/BillingWorkspace.page'
import { parseBillingInvoiceRoute } from '@/modules/billing/shared/billingInvoiceRoute.service'
import { CteBatchWorkspacePage } from '@/modules/cte-batch/pages/CteBatchWorkspace.page'
import { CompanySettingsPage } from '@/modules/company-settings/pages/CompanySettings.page'
import { CteProfilesPage } from '@/modules/cte-profiles/pages/CteProfiles.page'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Icon } from '@/components/ui/icon'
import { Skeleton } from '@/components/ui/skeleton'
import { getDeploymentEnvironment } from '@/modules/shared/deploymentEnvironment.service'
import { applyColorTheme, readStoredColorTheme } from '@/modules/shared/colorTheme.service'
import { useColorTheme } from '@/modules/shared/useColorTheme.hook'
import { applyEnvironmentBadge } from '@/modules/shared/environmentBadge.service'
import { ApplicationFooter } from '@/modules/foundation/components/ApplicationFooter.component'
import { EnvironmentBanner } from '@/modules/foundation/components/EnvironmentBanner.component'
import '@/modules/shared/i18n/i18n.service'
import { DeliveryClientWorkspacePage } from '@/modules/delivery-clients/pages/DeliveryClientWorkspace.page'
import { ExtraChargeWorkspacePage } from '@/modules/extra-charges/pages/ExtraChargeWorkspace.page'
import { FinancialResultsWorkspacePage } from '@/modules/trip-financials/pages/FinancialResultsWorkspace.page'
import { DriverTripWorkspacePage } from '@/modules/driver-trip/pages/DriverTripWorkspace.page'
import {
  DRIVER_TRIP_PATH,
  isFieldOnlyUser,
} from '@/modules/driver-trip/shared/driverWorkspace.service'
import { FleetWorkspacePage } from '@/modules/fleet/pages/FleetWorkspace.page'
import { FreightWorkspacePage } from '@/modules/freight/pages/FreightWorkspace.page'
import { FirstAccessPage } from '@/modules/identity/pages/FirstAccess.page'
import { LoginIdentifierPage } from '@/modules/identity/pages/LoginIdentifier.page'
import { PasswordResetPage } from '@/modules/identity/pages/PasswordReset.page'
import { AccessProfilesPage } from './modules/identity/pages/AccessProfiles.page'
import { UserAdministrationPage } from '@/modules/identity/pages/UserAdministration.page'
import { useAuthMeQuery, type FiscalEnvironment } from '@/modules/identity/queries/useAuthMe.query'
import { useCompanyUserPicture } from '@/modules/identity/hooks/useCompanyUserPicture.hook'
import {
  getKeycloakAuthProvider,
  initializeKeycloakAuth,
} from '@/modules/identity/shared/KeycloakAuthProvider.provider'
import { isSmokeAuthBypassEnabled } from '@/modules/identity/shared/smokeAuthBypass.service'
import { MdfeManifestWorkspacePage } from '@/modules/mdfe-manifest/pages/MdfeManifestWorkspace.page'
import { parseMdfeManifestTripParameter } from '@/modules/mdfe-manifest/shared/mdfeManifestRoute.service'
import { NfeWorkspacePage } from '@/modules/nfe-workspace/pages/NfeWorkspace.page'
import { NfseInvoiceWorkspacePage } from '@/modules/nfse-invoice/pages/NfseInvoiceWorkspace.page'
import { parseNfseInvoiceParameter } from '@/modules/nfse-invoice/shared/nfseInvoiceRoute.service'
import { NotificationSettingsPage } from '@/modules/notification/pages/NotificationSettings.page'
import { NotificationWorkspacePage } from '@/modules/notification/pages/NotificationWorkspace.page'
import { NOTIFICATION_SETTINGS_HREF } from '@/modules/notification/shared/notificationCatalog.constant'
import { getNotificationClient } from '@/modules/notification/shared/notificationClient.service'
import { NOTIFICATION_THEME_CLASS } from '@/modules/notification/shared/notificationTheme.constant'
import notificationStyles from '@/modules/notification/styles/notification.module.css'
import { OperationsDashboardPage } from '@/modules/operations/pages/OperationsDashboard.page'
import { TripDetailPage } from '@/modules/trip/pages/TripDetail.page'
import { TripWorkspacePage } from '@/modules/trip/pages/TripWorkspace.page'
import { TripOccurrencesWorkspacePage } from '@/modules/trip/pages/TripOccurrencesWorkspace.page'
import { parseTripRoute } from '@/modules/trip/shared/tripRoute.service'
import '@/styles/index.css'

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, staleTime: 30_000 } },
})

const deploymentEnvironment = getDeploymentEnvironment()

applyEnvironmentBadge({ document, environment: deploymentEnvironment })
applyColorTheme({
  document,
  theme: readStoredColorTheme(typeof window === 'undefined' ? null : window.localStorage),
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
    | 'delivery-clients'
    | 'driver-trip'
    | 'extra-charges'
    | 'trip-financials'
    | 'fleet'
    | 'freight'
    | 'mdfe-manifest'
    | 'nfe'
    | 'nfse-invoice'
    | 'notification'
    | 'operations'
    | 'trip'
    | 'trip-occurrences'
    | 'access-profiles'
    | 'users'
  label: string
}>

type NavigationGroup = Readonly<{
  key: 'administration' | 'fiscal' | 'identity' | 'operations' | 'registries'
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
  { href: '/nfse-invoices', key: 'nfse-invoice', label: 'NFS-e' },
  { href: '/operations', key: 'operations', label: 'Operações' },
  { href: '/ocorrencias', key: 'trip-occurrences', label: 'Ocorrências' },
  { href: '/company-settings', key: 'company-settings', label: 'Empresa' },
  { href: '/usuarios', key: 'users', label: 'Acessos' },
  { href: '/papeis', key: 'access-profiles', label: 'Papéis e grupos' },
  { href: '/cte-profiles', key: 'cte-profiles', label: 'Perfis CT-e' },
  { href: '/fleet', key: 'fleet', label: 'Frota' },
  { href: '/clientes', key: 'delivery-clients', label: 'Clientes' },
  { href: '/repasses', key: 'extra-charges', label: 'Repasses' },
  { href: '/resultados', key: 'trip-financials', label: 'Resultados' },
  // Fora dos grupos: quem é do campo não navega por menu — ele abre o produto e já está na viagem.
  { href: DRIVER_TRIP_PATH, key: 'driver-trip', label: 'Minha viagem' },
  // Fora dos grupos do menu de propósito: a porta de entrada é o sino do cabeçalho, e a entrada
  // existe aqui só para o título da tela sair certo quando a rota abre.
  { href: '/notificacoes', key: 'notification', label: 'Notificações' },
]

const NAVIGATION_GROUPS: readonly NavigationGroup[] = [
  {
    key: 'fiscal',
    label: 'Fiscal',
    items: WORKSPACE_NAVIGATION_ITEMS.filter(({ key }) =>
      [
        'nfe',
        'freight',
        'cte-batch',
        'trip',
        'mdfe-manifest',
        'billing',
        'extra-charges',
        'trip-financials',
        'nfse-invoice',
      ].includes(key),
    ),
  },
  {
    key: 'operations',
    label: 'Operações',
    items: WORKSPACE_NAVIGATION_ITEMS.filter(({ key }) =>
      ['operations', 'trip-occurrences'].includes(key),
    ),
  },
  {
    key: 'registries',
    label: 'Cadastros',
    items: WORKSPACE_NAVIGATION_ITEMS.filter(({ key }) =>
      ['fleet', 'delivery-clients', 'cte-profiles'].includes(key),
    ),
  },
  /**
   * Identidade é categoria própria, e não um item dentro de "Administração": são duas telas com o
   * mesmo assunto e a mesma permissão, e empilhá-las numa só fazia o que se usa todo dia — a
   * listagem — ficar embaixo do que se consulta uma vez por mês.
   */
  {
    key: 'identity',
    label: 'Usuários',
    items: WORKSPACE_NAVIGATION_ITEMS.filter(({ key }) =>
      ['users', 'access-profiles'].includes(key),
    ),
  },
  {
    key: 'administration',
    label: 'Administração',
    items: WORKSPACE_NAVIGATION_ITEMS.filter(({ key }) => key === 'company-settings'),
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
  if (window.location.pathname === DRIVER_TRIP_PATH) return 'driver-trip'
  if (window.location.pathname === '/clientes') return 'delivery-clients'
  if (window.location.pathname === '/repasses') return 'extra-charges'
  if (window.location.pathname === '/resultados') return 'trip-financials'
  if (window.location.pathname === '/fleet') return 'fleet'
  if (window.location.pathname === '/mdfe-manifests') return 'mdfe-manifest'
  if (window.location.pathname === '/nfse-invoices') return 'nfse-invoice'
  if (window.location.pathname.startsWith('/notificacoes')) return 'notification'
  if (window.location.pathname === '/operations') return 'operations'
  if (window.location.pathname === '/ocorrencias') return 'trip-occurrences'
  if (window.location.pathname === '/freight') return 'freight'
  if (window.location.pathname === '/usuarios') return 'users'
  if (window.location.pathname === '/papeis') return 'access-profiles'

  const storedWorkspace = sessionStorage.getItem(WORKSPACE_STORAGE_KEY)
  if (
    storedWorkspace === 'billing' ||
    storedWorkspace === 'company-settings' ||
    storedWorkspace === 'cte-batch' ||
    storedWorkspace === 'cte-profiles' ||
    storedWorkspace === 'delivery-clients' ||
    storedWorkspace === 'driver-trip' ||
    storedWorkspace === 'extra-charges' ||
    storedWorkspace === 'trip-financials' ||
    storedWorkspace === 'fleet' ||
    storedWorkspace === 'mdfe-manifest' ||
    storedWorkspace === 'nfse-invoice' ||
    storedWorkspace === 'notification' ||
    storedWorkspace === 'operations' ||
    storedWorkspace === 'trip-occurrences' ||
    storedWorkspace === 'freight' ||
    storedWorkspace === 'trip' ||
    storedWorkspace === 'users' ||
    storedWorkspace === 'access-profiles'
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
    case 'delivery-clients':
      return <DeliveryClientWorkspacePage />
    case 'driver-trip':
      return <DriverTripWorkspacePage />
    case 'extra-charges':
      return <ExtraChargeWorkspacePage />
    case 'trip-financials':
      return <FinancialResultsWorkspacePage />
    case 'fleet':
      return <FleetWorkspacePage />
    case 'mdfe-manifest':
      return (
        <MdfeManifestWorkspacePage originTripId={parseMdfeManifestTripParameter(input.search)} />
      )
    case 'nfse-invoice':
      return <NfseInvoiceWorkspacePage openInvoiceId={parseNfseInvoiceParameter(input.search)} />
    case 'notification':
      return input.path === NOTIFICATION_SETTINGS_HREF ? (
        <NotificationSettingsPage />
      ) : (
        <NotificationWorkspacePage />
      )
    case 'trip': {
      const tripId = parseTripRoute(input.path)
      return tripId === null ? <TripWorkspacePage /> : <TripDetailPage tripId={tripId} />
    }
    case 'operations':
      return <OperationsDashboardPage />
    case 'trip-occurrences':
      return <TripOccurrencesWorkspacePage />
    case 'freight':
      return <FreightWorkspacePage />
    case 'users':
      return <UserAdministrationPage />
    case 'access-profiles':
      return <AccessProfilesPage />
    default:
      return <NfeWorkspacePage />
  }
}

/** O tipo gerado para CSS Module devolve `string | undefined`; o pacote pede classe obrigatória. */
const NOTIFICATION_BELL_CLASS = notificationStyles.notificationBell ?? ''

/** O selo avisa se a emissão vale de verdade — o rótulo vem do ambiente da empresa, nunca de literal. */
const FISCAL_ENVIRONMENT_LABELS: Readonly<Record<FiscalEnvironment, string>> = {
  homologation: 'Homologação',
  production: 'Produção',
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
    administration: currentWorkspace === 'company-settings',
    identity: currentWorkspace === 'users' || currentWorkspace === 'access-profiles',
    fiscal: [
      'nfe',
      'freight',
      'cte-batch',
      'trip',
      'mdfe-manifest',
      'billing',
      'nfse-invoice',
    ].includes(currentWorkspace),
    operations: ['operations', 'trip-occurrences'].includes(currentWorkspace),
    registries: ['cte-profiles', 'fleet'].includes(currentWorkspace),
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
        setOpenGroups({
          administration: true,
          fiscal: true,
          identity: true,
          operations: true,
          registries: true,
        })
      }
    }
    window.addEventListener('keydown', closeWithEscape)
    return () => window.removeEventListener('keydown', closeWithEscape)
  }, [])

  /**
   * Spec 057, RF-6: quem só tem o par do campo não pode cair na tela de NF-e. A troca acontece
   * depois de `auth/me` responder — antes disso não há permissão para consultar — e **só** quando a
   * pessoa não escolheu tela nenhuma: navegar para outro lugar continua sendo decisão dela.
   */
  const permissions = authMeQuery.data?.data.permissions
  useEffect(() => {
    if (permissions === undefined || !isFieldOnlyUser(permissions)) return
    if (window.location.pathname !== '/') return

    window.history.replaceState({}, '', DRIVER_TRIP_PATH)
    setCurrentWorkspace('driver-trip')
    setCurrentPath(DRIVER_TRIP_PATH)
  }, [permissions])

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
  /**
   * A foto do cabeçalho vinha do claim `picture` do token, e nunca aparecia por duas razões
   * independentes: o claim aponta para a rota autenticada da foto, e `<img src>` não manda o
   * `Authorization`; e o claim só entra num token novo, então a foto enviada agora só surgiria no
   * próximo login. Buscar os bytes pela API é o mesmo caminho que os diálogos já usam, e ele
   * atualiza assim que o envio termina.
   */
  const [hasCopiedEmail, setHasCopiedEmail] = useState(false)

  /** A área de transferência falha em contexto sem permissão: o ✓ só aparece se o valor foi mesmo. */
  async function copyEmail(email: string | undefined): Promise<void> {
    if (email === undefined) return
    try {
      await navigator.clipboard.writeText(email)
      setHasCopiedEmail(true)
      window.setTimeout(() => setHasCopiedEmail(false), COPY_FEEDBACK_MILLISECONDS)
    } catch {
      setHasCopiedEmail(false)
    }
  }

  const headerPicture = useCompanyUserPicture({
    userId: authMeQuery.data?.data.identity.userId,
  })
  const fiscalEnvironment = authMeQuery.data?.data.company.fiscalEnvironment ?? null
  const colorTheme = useColorTheme()

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
              setOpenGroups({
                administration: true,
                fiscal: true,
                identity: true,
                operations: true,
                registries: true,
              })
            }}
          >
            <span aria-hidden="true">{sidebarOpen ? '×' : '☰'}</span>
          </Button>
          <span className="sidebar-brand-identity">
            <img alt="" className="sidebar-brand-logo" src="/icons/icon.svg" />
            <strong>TransportAdA</strong>
          </span>
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
        <EnvironmentBanner environment={deploymentEnvironment} />
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
              {authMeQuery.isLoading ? <Skeleton height="0.7rem" width="var(--space-16)" /> : null}
              {fiscalEnvironment === null ? null : (
                <span
                  className="application-fiscal-environment"
                  data-environment={fiscalEnvironment}
                >
                  {FISCAL_ENVIRONMENT_LABELS[fiscalEnvironment]}
                </span>
              )}
              <div className="application-user-area" aria-label="Sessão do usuário">
                <Button
                  aria-label={colorTheme.theme === 'dark' ? 'Usar tema claro' : 'Usar tema escuro'}
                  className="application-theme-toggle"
                  onClick={colorTheme.toggleTheme}
                  size="sm"
                  title={colorTheme.theme === 'dark' ? 'Usar tema claro' : 'Usar tema escuro'}
                  type="button"
                  variant="ghost"
                >
                  <Icon name={colorTheme.theme === 'dark' ? 'sun' : 'moon'} />
                </Button>
                <NotificationBell
                  className={NOTIFICATION_BELL_CLASS}
                  onClick={() =>
                    navigateTo({
                      href: '/notificacoes',
                      key: 'notification',
                      label: 'Notificações',
                    })
                  }
                />
                <span className="application-user-avatar" aria-hidden="true">
                  {headerPicture.objectUrl !== null ? (
                    <img className="application-user-photo" src={headerPicture.objectUrl} alt="" />
                  ) : (
                    userProfile.initials
                  )}
                </span>
                <span className="application-user-identity">
                  <span className="application-user-name">
                    {authMeQuery.isLoading ? 'Carregando' : userProfile.displayName}
                  </span>
                  {!authMeQuery.isLoading && userProfile.subtitle !== undefined ? (
                    <span className="application-user-subtitle">
                      <span className="application-user-email">{userProfile.subtitle}</span>
                    </span>
                  ) : null}
                </span>
                {/* Na fileira de controles, não sob o e-mail: ali ele crescia o cabeçalho em 18px
                    justamente no celular, onde a tela é o recurso escasso. */}
                {!authMeQuery.isLoading && userProfile.subtitle !== undefined ? (
                  <Button
                    aria-label="Copiar e-mail"
                    className="application-user-copy-email"
                    onClick={() => void copyEmail(userProfile.subtitle)}
                    size="sm"
                    title="Copiar e-mail"
                    type="button"
                    variant="ghost"
                  >
                    <Icon name={hasCopiedEmail ? 'check' : 'copy'} />
                  </Button>
                ) : null}
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
        <ApplicationFooter />
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
  if (window.location.pathname === '/primeiro-acesso') {
    createRoot(applicationRootElement).render(
      <StrictMode>
        <FirstAccessPage />
      </StrictMode>,
    )
    return
  }

  // A tela de login é do Keycloak; a de recuperação é nossa, e precisa abrir sem sessão nenhuma.
  if (window.location.pathname === '/recuperar-senha') {
    createRoot(applicationRootElement).render(
      <StrictMode>
        <PasswordResetPage />
      </StrictMode>,
    )
    return
  }

  /**
   * Com a etapa de identificação ligada, `initialize` volta sem sessão em vez de redirecionar: a
   * tela pergunta o identificador, resolve o login e só então leva ao provedor. Desligada, ela
   * redireciona antes de renderizar, exatamente como sempre fez.
   */
  const isAuthenticated = await initializeKeycloakAuth()
  if (!isAuthenticated) {
    createRoot(applicationRootElement).render(
      <StrictMode>
        <LoginIdentifierPage />
      </StrictMode>,
    )
    return
  }

  createRoot(applicationRootElement).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <NotificationProvider
          client={getNotificationClient()}
          theme={{ rootClassName: NOTIFICATION_THEME_CLASS }}
        >
          <ApplicationShell />
        </NotificationProvider>
      </QueryClientProvider>
    </StrictMode>,
  )
}

void bootstrapApplication()
