/* Copyright (c) 2026 Ada Technology. MIT License. */
import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { ChargeBatchListPage } from '@/modules/charges/ChargeBatchList.page'
import { DeliveryListPage } from '@/modules/deliveries/DeliveryList.page'
import { getClientEnvironment } from '@/modules/shared/environment.config'
import {
  getKeycloakAuthProvider,
  initializeKeycloakAuth,
} from '@/modules/shared/KeycloakAuthProvider.provider'
import { createPortalClient } from '@/modules/shared/portalClient.service'
import '@/styles/index.css'

/**
 * `retry: false` e `staleTime` de 30s, como no painel: entrega é estado que muda, e repetir sozinho
 * uma requisição recusada por permissão só multiplica 403 no log.
 */
const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, staleTime: 30_000 } },
})

type Tab = 'charges' | 'deliveries'

function App() {
  const [tab, setTab] = useState<Tab>('deliveries')
  const client = createPortalClient({
    apiUrl: getClientEnvironment().apiBaseUrl,
    fetch: (input, init) => fetch(input, init),
    getAccessToken: () => getKeycloakAuthProvider().getAccessToken(),
  })

  return (
    <QueryClientProvider client={queryClient}>
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
              className="secondary"
              onClick={() => void getKeycloakAuthProvider().logout()}
              type="button"
            >
              Sair
            </button>
          </nav>
        </div>
        {tab === 'deliveries' ? (
          <DeliveryListPage client={client} />
        ) : (
          <ChargeBatchListPage client={client} />
        )}
      </main>
    </QueryClientProvider>
  )
}

/**
 * A autenticação acontece **antes** de a árvore montar, como no painel: sem token não há o que
 * pedir, e montar a tela primeiro produziria um piscar de "sem entregas" antes do redirect.
 */
async function start(): Promise<void> {
  const container = document.getElementById('root')
  if (container === null) throw new Error('CLIENT_ROOT_ELEMENT_MISSING')

  await initializeKeycloakAuth()

  createRoot(container).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

void start()
