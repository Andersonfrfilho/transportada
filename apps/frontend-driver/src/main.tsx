/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { ReactNode } from 'react'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { EnvironmentBanner } from '@/components/EnvironmentBanner.component'
import { DriverForbiddenPage } from '@/modules/identity/DriverForbidden.page'
import { checkDriverAuthorization } from '@/modules/identity/shared/driverAuthorization.service'
import { getDeploymentEnvironment } from '@/modules/shared/deploymentEnvironment.service'
import { applyEnvironmentBadge } from '@/modules/shared/environmentBadge.service'
import { getDriverEnvironment } from '@/modules/shared/environment.config'
import {
  getKeycloakAuthProvider,
  initializeKeycloakAuth,
} from '@/modules/shared/KeycloakAuthProvider.provider'
import { LoginIdentifierPage } from '@/modules/shared/LoginIdentifier.page'
import '@/styles/index.css'

const deploymentEnvironment = getDeploymentEnvironment()

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
 * Tela provisória da T1.2: a app existe, é servida e se instala. A viagem chega na Fase 3 — até lá
 * não há o que pedir à API além da checagem de autorização da T2.3.
 */
function App() {
  return (
    <main className="page">
      <h1 className="page__title">Minha viagem</h1>
      <p className="page__lead">A app do motorista está sendo montada.</p>
    </main>
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
        <App />
      </PageFrame>
    </StrictMode>,
  )
}

void start()
