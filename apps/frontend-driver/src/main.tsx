/* Copyright (c) 2026 Ada Technology. MIT License. */
import { NotificationProvider } from '@adatechnology/notification-ui'
import '@adatechnology/notification-ui/styles.css'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { StrictMode, useEffect, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'

import { EnvironmentBanner } from '@/components/EnvironmentBanner.component'
import { DriverServiceWorkerUpdateNotice } from '@/modules/driver-trip/components/DriverServiceWorkerUpdateNotice.component'
import { DriverSessionExpiredNotice } from '@/modules/driver-trip/components/DriverSessionExpiredNotice.component'
import {
  DriverSessionContext,
  type DriverSession,
} from '@/modules/driver-trip/hooks/useDriverSession.hook'
import { useSessionExpiry } from '@/modules/driver-trip/hooks/useSessionExpiry.hook'
import { DriverBootLoadingPage } from '@/modules/driver-trip/pages/DriverBootLoading.page'
import { DriverOfflineEmptyPage } from '@/modules/driver-trip/pages/DriverOfflineEmpty.page'
import { DriverTripWorkspacePage } from '@/modules/driver-trip/pages/DriverTripWorkspace.page'
import {
  probeIdentityProvider,
  runDriverBoot,
  scheduleAuthenticationOnReconnect,
} from '@/modules/driver-trip/shared/bootMode.service'
import {
  captureRegistry,
  createAuthenticationCaptureView,
} from '@/modules/driver-trip/shared/captureRegistry.service'
import { createIndexedDbTripSnapshotStore } from '@/modules/driver-trip/shared/indexedDbQueue.service'
import {
  handleServiceWorkerUpdateAvailable,
  requestServiceWorkerUpdate,
} from '@/modules/driver-trip/shared/serviceWorkerUpdate.service'
import type { DriverTripSnapshot } from '@/modules/driver-trip/shared/driverTrip.types'
import { toDriverTripSnapshot } from '@/modules/driver-trip/shared/driverTripResponse.validation'
import {
  claimTripSnapshot,
  hashSubject,
  readLastTripSnapshot,
  saveTripSnapshot,
  type OwnedTripSnapshot,
  type StoredTripSnapshot,
} from '@/modules/driver-trip/shared/tripSnapshot.service'
import { DriverForbiddenPage } from '@/modules/identity/DriverForbidden.page'
import { checkDriverAuthorization } from '@/modules/identity/shared/driverAuthorization.service'
import { isSmokeAuthBypassEnabled } from '@/modules/identity/shared/smokeAuthBypass.service'
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

/**
 * Registro do service worker (plan D2). `registerType: 'prompt'` (ADR-0075 §5): o `onNeedRefresh`
 * decide, pela regra de aplicação, entre `updateSW(true)` sozinho e o aviso "Nova versão —
 * Atualizar" — nunca recarrega a página no meio de uma captura. Fora do smoke: um SW real
 * atrapalharia o bypass de autenticação da T4.1.
 */
const serviceWorkerUpdateListeners = new Set<() => void>()
let needsServiceWorkerUpdate = false
/** B4: o toque foi ouvido com captura aberta — o aviso troca o botão por "Atualiza ao terminar". */
let isServiceWorkerUpdateWaiting = false
let applyServiceWorkerUpdate: ((reloadPage?: boolean) => Promise<void>) | undefined

function notifyServiceWorkerUpdateListeners(): void {
  for (const listener of [...serviceWorkerUpdateListeners]) listener()
}

if (!isSmokeAuthBypassEnabled()) {
  applyServiceWorkerUpdate = registerSW({
    immediate: true,
    onNeedRefresh: () => {
      handleServiceWorkerUpdateAvailable({
        apply: () => void applyServiceWorkerUpdate?.(true),
        captureRegistry,
        showUpdateBanner: () => {
          needsServiceWorkerUpdate = true
          notifyServiceWorkerUpdateListeners()
        },
      })
    },
  })
}

function applyServiceWorkerUpdateNow(): void {
  const outcome = requestServiceWorkerUpdate({
    apply: () => {
      needsServiceWorkerUpdate = false
      isServiceWorkerUpdateWaiting = false
      notifyServiceWorkerUpdateListeners()
      void applyServiceWorkerUpdate?.(true)
    },
    captureRegistry,
  })
  if (outcome === 'deferred') {
    isServiceWorkerUpdateWaiting = true
    notifyServiceWorkerUpdateListeners()
  }
}

type ServiceWorkerUpdateBanner = Readonly<{ isWaitingCapture: boolean; needsUpdate: boolean }>

function readServiceWorkerUpdateBanner(): ServiceWorkerUpdateBanner {
  return { isWaitingCapture: isServiceWorkerUpdateWaiting, needsUpdate: needsServiceWorkerUpdate }
}

/** O componente relê o módulo a cada notificação — o mesmo padrão de assinatura do captureRegistry. */
function useServiceWorkerUpdateBanner(): ServiceWorkerUpdateBanner {
  const [banner, setBanner] = useState(readServiceWorkerUpdateBanner)

  useEffect(() => {
    setBanner(readServiceWorkerUpdateBanner())
    function handleChange(): void {
      setBanner(readServiceWorkerUpdateBanner())
    }
    serviceWorkerUpdateListeners.add(handleChange)
    return () => {
      serviceWorkerUpdateListeners.delete(handleChange)
    }
  }, [])

  return banner
}

type PageFrameProps = Readonly<{ children: ReactNode }>

/** A faixa de ambiente vai no topo de toda página — com sessão ou não. */
function PageFrame({ children }: PageFrameProps): ReactNode {
  const serviceWorkerUpdate = useServiceWorkerUpdateBanner()

  return (
    <>
      <EnvironmentBanner environment={deploymentEnvironment} />
      {serviceWorkerUpdate.needsUpdate ? (
        <DriverServiceWorkerUpdateNotice
          isWaitingCapture={serviceWorkerUpdate.isWaitingCapture}
          onApply={applyServiceWorkerUpdateNow}
        />
      ) : null}
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
  const sessionExpiry = useSessionExpiry(session.canSync)

  useEffect(() => subscribeDriverRoute(setSection), [])

  return (
    <QueryClientProvider client={queryClient}>
      <DriverSessionContext value={session}>
        {sessionExpiry.state === 'active' ? null : (
          <DriverSessionExpiredNotice
            onReauthenticate={sessionExpiry.reauthenticate}
            state={sessionExpiry.state}
          />
        )}
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

  let authorizedPayload: unknown
  const authorization = await checkDriverAuthorization({
    apiBaseUrl: getDriverEnvironment().apiBaseUrl,
    fetch: (input, init) => fetch(input, init),
    getAccessToken: () => getKeycloakAuthProvider().getAccessToken(),
    onAuthorizedPayload: (payload) => {
      authorizedPayload = payload
    },
  })

  if (authorization === 'forbidden') {
    renderScreen(root, <DriverForbiddenPage />)
    return
  }

  /** O cache da consulta pode ser do snapshot de outra sessão, montado antes deste login. */
  queryClient.clear()
  const freshSnapshot = await adoptAuthorizedSnapshot({ payload: authorizedPayload, subHash })
  renderScreen(
    root,
    <DriverShell
      key={subHash}
      session={{ canSync: true, initialSnapshot: freshSnapshot ?? initialSnapshot, subHash }}
    />,
  )
}

/**
 * B7 (spec 189 T9.2): a checagem de autorização já leu `GET /me/trips/current`. A resposta vira o
 * dado inicial da tela, fresco (`savedAt` agora), e é guardada como snapshot — a consulta não pede
 * a mesma coisa de novo no mesmo segundo. Corpo que não tem a forma da viagem é ignorado: a tela
 * cai no snapshot guardado e a consulta lê do jeito de sempre.
 */
async function adoptAuthorizedSnapshot(input: {
  readonly payload: unknown
  readonly subHash: string
}): Promise<StoredTripSnapshot | undefined> {
  if (input.payload === undefined) return undefined
  let snapshot: DriverTripSnapshot
  try {
    snapshot = toDriverTripSnapshot(input.payload)
  } catch {
    return undefined
  }
  const now = new Date()
  await saveTripSnapshot({ now, snapshot, store: tripSnapshotStore, subHash: input.subHash }).catch(
    () => undefined,
  )
  return { savedAt: now.toISOString(), snapshot }
}

/**
 * Sem Keycloak — ou com o `init` rejeitando: o snapshot de quem usou por último, só leitura e com
 * toques enfileiráveis — ou a tela "sem viagem salva". A autenticação fica para quando a rede voltar,
 * e só com o registro de capturas vazio, porque o `keycloak.init` navega a página; um `init` que
 * rejeita de novo continua agendado (`scheduleAuthenticationOnReconnect`).
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
    captureRegistry: createAuthenticationCaptureView(captureRegistry),
    probe: probeKeycloak,
    target: window,
  })
}

/**
 * ADR-0075 §8: a decisão vem **antes** do `keycloak.init`. O `check-sso` sem
 * `silentCheckSsoRedirectUri` navega a página inteira quando o Keycloak não responde, e nenhuma
 * exceção chega aqui — por isso a sonda, e não o `onLine` do navegador, que diz `true` com sinal fraco.
 * A ordem (esqueleto, sonda, decisão, `init`) e a queda para o snapshot quando o `init` rejeita
 * moram em `runDriverBoot`.
 */
async function start(): Promise<void> {
  const container = document.getElementById('root')
  if (container === null) throw new Error('DRIVER_ROOT_ELEMENT_MISSING')
  const root = createRoot(container)

  await runDriverBoot({
    authenticate: () => startAuthenticated(root),
    now: () => new Date(),
    probe: probeKeycloak,
    readLastSnapshot: () => readLastTripSnapshot({ now: new Date(), store: tripSnapshotStore }),
    renderLoading: () => renderScreen(root, <DriverBootLoadingPage />),
    startOffline: (snapshot) => startOffline(root, snapshot),
  })
}

void start()
