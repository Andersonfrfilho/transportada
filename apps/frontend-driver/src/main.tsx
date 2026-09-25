/* Copyright (c) 2026 Ada Technology. MIT License. */
import { NotificationProvider } from '@adatechnology/notification-ui'
import '@adatechnology/notification-ui/styles.css'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { StrictMode, useEffect, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'

import { EnvironmentBanner } from '@/components/EnvironmentBanner.component'
import {
  DriverSessionContext,
  type DriverSession,
} from '@/modules/driver-trip/hooks/useDriverSession.hook'
import { DriverOfflineEmptyPage } from '@/modules/driver-trip/pages/DriverOfflineEmpty.page'
import { DriverTripWorkspacePage } from '@/modules/driver-trip/pages/DriverTripWorkspace.page'
import {
  probeIdentityProvider,
  resolveBootMode,
  scheduleAuthenticationOnReconnect,
} from '@/modules/driver-trip/shared/bootMode.service'
import { captureRegistry } from '@/modules/driver-trip/shared/captureRegistry.service'
import { createIndexedDbTripSnapshotStore } from '@/modules/driver-trip/shared/indexedDbQueue.service'
import {
  claimTripSnapshot,
  hashSubject,
  readLastTripSnapshot,
  type OwnedTripSnapshot,
} from '@/modules/driver-trip/shared/tripSnapshot.service'
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
const tripSnapshotStore = createIndexedDbTripSnapshotStore()

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

function renderScreen(root: Root, screen: ReactNode): void {
  root.render(
    <StrictMode>
      <PageFrame>{screen}</PageFrame>
    </StrictMode>,
  )
}

type DriverShellProps = Readonly<{ session: DriverSession }>

/**
 * A casca (T3.3, plan D4): a rota decide entre a viagem — que abre a fila e as fotos pendentes por
 * cima dela mesma, via `DriverTripWorkspacePage` — e a tela do sino. Nenhuma biblioteca de
 * roteamento: `driverRoute.service` é `pushState`/`popstate` puro (RF5). A sessão (T3.3a) diz de
 * quem é a viagem e se já dá para falar com a API.
 */
function DriverShell({ session }: DriverShellProps): ReactNode {
  const [section, setSection] = useState(() => resolveDriverRouteSection(window.location.pathname))

  useEffect(() => subscribeDriverRoute(setSection), [])

  return (
    <QueryClientProvider client={queryClient}>
      <DriverSessionContext value={session}>
        <NotificationProvider
          client={getNotificationClient()}
          theme={{ rootClassName: NOTIFICATION_THEME_CLASS }}
        >
          {section === 'notifications' ? <DriverNotificationsPage /> : <DriverTripWorkspacePage />}
        </NotificationProvider>
      </DriverSessionContext>
    </QueryClientProvider>
  )
}

function probeKeycloak(): Promise<boolean> {
  const { keycloak } = getDriverEnvironment()
  return probeIdentityProvider({
    fetch: (url, init) => fetch(url, init),
    keycloakUrl: keycloak.url,
    realm: keycloak.realm,
  })
}

/**
 * A autenticação de sempre, e o dono (plan D5): o `sub` vira `SHA-256(sub)`, o snapshot de outro
 * usuário sai, e o deste vira o dado inicial da tela.
 *
 * Depois de autenticado, a T2.3 confere `trip.read` (RF3) chamando `GET /me/trips/current` — sem
 * essa permissão a API responde `403`, e é a tela de "Sem acesso" que aparece, nunca a viagem.
 */
async function startAuthenticated(root: Root): Promise<void> {
  const isAuthenticated = await initializeKeycloakAuth()
  if (!isAuthenticated) {
    renderScreen(root, <LoginIdentifierPage />)
    return
  }

  const subject = getKeycloakAuthProvider().getSubject()
  if (subject === undefined) throw new Error('DRIVER_SUBJECT_MISSING')
  const subHash = await hashSubject(subject)
  const initialSnapshot = await claimTripSnapshot({
    now: new Date(),
    store: tripSnapshotStore,
    subHash,
  }).catch(() => undefined)

  const authorization = await checkDriverAuthorization({
    apiBaseUrl: getDriverEnvironment().apiBaseUrl,
    fetch: (input, init) => fetch(input, init),
    getAccessToken: () => getKeycloakAuthProvider().getAccessToken(),
  })

  if (authorization === 'forbidden') {
    renderScreen(root, <DriverForbiddenPage />)
    return
  }

  /** O cache da consulta pode ser do snapshot de outra sessão, montado antes deste login. */
  queryClient.clear()
  renderScreen(
    root,
    <DriverShell key={subHash} session={{ canSync: true, initialSnapshot, subHash }} />,
  )
}

/**
 * Sem Keycloak: o snapshot de quem usou por último, só leitura e com toques enfileiráveis — ou a
 * tela "sem viagem salva". A autenticação fica para quando a rede voltar, e só com o registro de
 * capturas vazio, porque o `keycloak.init` navega a página.
 */
function startOffline(root: Root, snapshot: OwnedTripSnapshot | undefined): void {
  if (snapshot === undefined) {
    renderScreen(root, <DriverOfflineEmptyPage />)
  } else {
    renderScreen(
      root,
      <DriverShell
        key="offline"
        session={{ canSync: false, initialSnapshot: snapshot, subHash: snapshot.subHash }}
      />,
    )
  }

  scheduleAuthenticationOnReconnect({
    authenticate: () => startAuthenticated(root),
    captureRegistry,
    probe: probeKeycloak,
    target: window,
  })
}

/**
 * ADR-0075 §8: a decisão vem **antes** do `keycloak.init`. O `check-sso` sem
 * `silentCheckSsoRedirectUri` navega a página inteira quando o Keycloak não responde, e nenhuma
 * exceção chega aqui — por isso a sonda, e não o `onLine` do navegador, que diz `true` com sinal fraco.
 */
async function start(): Promise<void> {
  const container = document.getElementById('root')
  if (container === null) throw new Error('DRIVER_ROOT_ELEMENT_MISSING')
  const root = createRoot(container)

  const [isReachable, lastSnapshot] = await Promise.all([
    probeKeycloak(),
    /** IndexedDB indisponível (aba privada, cota) é o mesmo que não ter snapshot. */
    readLastTripSnapshot({ now: new Date(), store: tripSnapshotStore }).catch(() => undefined),
  ])
  const bootMode = resolveBootMode({ isReachable, now: new Date(), snapshot: lastSnapshot })

  if (bootMode === 'authenticate') {
    await startAuthenticated(root)
    return
  }

  startOffline(root, bootMode === 'offline-snapshot' ? lastSnapshot : undefined)
}

void start()
