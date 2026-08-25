/* Copyright (c) 2026 Ada Technology. MIT License. */
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { registerSW } from 'virtual:pwa-register'

import { App } from './App'
import { applyEnvironmentBadge } from '@/modules/shared/environmentBadge.service'
import { getDeploymentEnvironment } from '@/modules/shared/deploymentEnvironment.service'
import '@/styles/index.css'

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, staleTime: 30_000 } },
})

applyEnvironmentBadge({ document, environment: getDeploymentEnvironment() })

registerSW({ immediate: true })

const rootElement = document.getElementById('root')

if (rootElement === null) {
  throw new Error('FRONTEND_LANDING_ROOT_MISSING')
}

createRoot(rootElement).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
)
