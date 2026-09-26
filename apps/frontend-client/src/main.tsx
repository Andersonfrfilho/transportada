/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { ReactNode } from 'react'
import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { EnvironmentBanner } from '@/components/EnvironmentBanner.component'
import { ChargeBatchListPage } from '@/modules/charges/ChargeBatchList.page'
import { DeliveryListPage } from '@/modules/deliveries/DeliveryList.page'
import { OccurrenceListPage } from '@/modules/occurrences/OccurrenceList.page'
import { getDeploymentEnvironment } from '@/modules/shared/deploymentEnvironment.service'
import { applyEnvironmentBadge } from '@/modules/shared/environmentBadge.service'
import { getClientEnvironment } from '@/modules/shared/environment.config'
import {
  getKeycloakAuthProvider,
  initializeKeycloakAuth,
} from '@/modules/shared/KeycloakAuthProvider.provider'
import { LoginIdentifierPage } from '@/modules/shared/LoginIdentifier.page'
import { createPortalClient } from '@/modules/shared/portalClient.service'
import { initialPortalTab, type PortalTab } from '@/modules/shared/portalTab.service'
import '@/styles/index.css'

/**
 * `retry: false` e `staleTime` de 30s, como no painel: entrega é estado que muda, e repetir sozinho
 * uma requisição recusada por permissão só multiplica 403 no log.
 */
const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, staleTime: 30_000 } },
})

const deploymentEnvironment = getDeploymentEnvironment()

applyEnvironmentBadge({ document, environment: deploymentEnvironment })

type Tab = PortalTab

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

function App() {
  /** Spec 183 RF21: o link do aviso por e-mail abre direto na aba dele (`?aba=ocorrencias`). */
  const [tab, setTab] = useState<Tab>(() => initialPortalTab(window.location.search))
  const client = createPortalClient({
    apiUrl: getClientEnvironment().apiBaseUrl,
    fetch: (input, init) => fetch(input, init),
    getAccessToken: () => getKeycloakAuthProvider().getAccessToken(),
  })

  return (
    <QueryClientProvider client={queryClient}>
      <PageFrame>
        <main>
          <div className="page">
            <nav className="nav">
              <button
                aria-current={tab === 'deliveries'}
                className={tab === 'deliveries' ? '' : 'secondary'}
                onClick={() => setTab('deliveries')}
                type="button"
              >
                Entregas
              </button>
              <button
                aria-current={tab === 'charges'}
                className={tab === 'charges' ? '' : 'secondary'}
                onClick={() => setTab('charges')}
                type="button"
              >
                Repasses
              </button>
              <button
                aria-current={tab === 'occurrences'}
                className={tab === 'occurrences' ? '' : 'secondary'}
                onClick={() => setTab('occurrences')}
                type="button"
              >
                Ocorrências
              </button>
              <button
                className="secondary"
                onClick={() => void getKeycloakAuthProvider().logout()}
                type="button"
              >
                Sair
              </button>
            </nav>
          </div>
          {tab === 'deliveries' && <DeliveryListPage client={client} />}
          {tab === 'charges' && <ChargeBatchListPage client={client} />}
          {tab === 'occurrences' && <OccurrenceListPage client={client} />}
        </main>
      </PageFrame>
    </QueryClientProvider>
  )
}

/**
 * A autenticação acontece **antes** de a árvore montar, como no painel: sem token não há o que
 * pedir, e montar a tela primeiro produziria um piscar de "sem entregas" antes do redirect.
 *
 * Com a etapa de identificação ligada, `initializeKeycloakAuth` volta sem sessão em vez de
 * redirecionar: a tela pergunta o identificador, resolve o login e só então leva ao provedor.
 * Desligada, ela redireciona antes de renderizar, exatamente como sempre fez.
 */
async function start(): Promise<void> {
  const container = document.getElementById('root')
  if (container === null) throw new Error('CLIENT_ROOT_ELEMENT_MISSING')

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

  createRoot(container).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

void start()
