/* Copyright (c) 2026 Ada Technology. MIT License. */
import { NotificationProvider } from '@adatechnology/notification-ui'
import '@adatechnology/notification-ui/styles.css'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'

import { EnvironmentBanner } from '@/components/EnvironmentBanner.component'
import { DriverTripWorkspacePage } from '@/modules/driver-trip/pages/DriverTripWorkspace.page'
import { DriverForbiddenPage } from '@/modules/identity/DriverForbidden.page'
import { checkDriverAuthorization } from '@/modules/identity/shared/driverAuthorization.service'
import { DriverNotificationsPage } from '@/modules/notification/pages/DriverNotifications.page'
import { getNotificationClient } from '@/modules/notification/shared/notificationClient.service'
import { NOTIFICATION_THEME_CLASS } from '@/modules/notification/shared/notificationTheme.constant'
import { getDeploymentEnvironment } from '@/modules/shared/deploymentEnvironment.service'
import {
  resolveDriverRouteSection,
  subscribeDriverRoute,
} from '@/modules/shared/driverRoute.service'
import { applyEnvironmentBadge } from '@/modules/shared/environmentBadge.service'
import { getDriverEnvironment } from '@/modules/shared/environment.config'
import '@/modules/shared/i18n/i18n.service'
import {
  getKeycloakAuthProvider,
  initializeKeycloakAuth,
} from '@/modules/shared/KeycloakAuthProvider.provider'
import { LoginIdentifierPage } from '@/modules/shared/LoginIdentifier.page'
import '@/styles/index.css'

const deploymentEnvironment = getDeploymentEnvironment()
const queryClient = new QueryClient()

applyEnvironmentBadge({ document, environment: deploymentEnvironment })

type PageFrameProps = Readonly<{ children: ReactNode }>

/** A faixa de ambiente vai no topo de toda página — com sessão ou não. */
function PageFrame({ children }: PageFrameProps): ReactNode {
  return (
    <>
      <EnvironmentBanner environment={deploymentEnvironment} />
      {children}
    </>
  )
}

/**
 * A casca autenticada (T3.3, plan D4): a rota decide entre a viagem — que abre a fila e as fotos
 * pendentes por cima dela mesma, via `DriverTripWorkspacePage` — e a tela do sino. Nenhuma
 * biblioteca de roteamento: `driverRoute.service` é `pushState`/`popstate` puro (RF5).
 */
function AuthenticatedApp(): ReactNode {
  const [section, setSection] = useState(() => resolveDriverRouteSection(window.location.pathname))

  useEffect(() => subscribeDriverRoute(setSection), [])

  return (
    <QueryClientProvider client={queryClient}>
      <NotificationProvider
        client={getNotificationClient()}
        theme={{ rootClassName: NOTIFICATION_THEME_CLASS }}
      >
        {section === 'notifications' ? <DriverNotificationsPage /> : <DriverTripWorkspacePage />}
      </NotificationProvider>
    </QueryClientProvider>
  )
}

/**
 * A autenticação acontece **antes** de a árvore montar, como no portal: sem token não há o que
 * pedir, e montar a tela primeiro produziria um piscar antes do redirect.
 *
 * Depois de autenticado, a T2.3 confere `trip.read` (RF3) chamando `GET /me/trips/current` — sem
 * essa permissão a API responde `403`, e é a tela de "Sem acesso" que aparece, nunca a viagem.
 */
async function start(): Promise<void> {
  const container = document.getElementById('root')
  if (container === null) throw new Error('DRIVER_ROOT_ELEMENT_MISSING')

  const isAuthenticated = await initializeKeycloakAuth()
  if (!isAuthenticated) {
    createRoot(container).render(
      <StrictMode>
        <PageFrame>
          <LoginIdentifierPage />
        </PageFrame>
      </StrictMode>,
    )
    return
  }

  const authorization = await checkDriverAuthorization({
    apiBaseUrl: getDriverEnvironment().apiBaseUrl,
    fetch: (input, init) => fetch(input, init),
    getAccessToken: () => getKeycloakAuthProvider().getAccessToken(),
  })

  if (authorization === 'forbidden') {
    createRoot(container).render(
      <StrictMode>
        <PageFrame>
          <DriverForbiddenPage />
        </PageFrame>
      </StrictMode>,
    )
    return
  }

  createRoot(container).render(
    <StrictMode>
      <PageFrame>
        <AuthenticatedApp />
      </PageFrame>
    </StrictMode>,
  )
}

void start()
