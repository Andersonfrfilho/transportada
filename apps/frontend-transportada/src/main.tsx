/* Copyright (c) 2026 Ada Technology. MIT License. */
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { registerSW } from 'virtual:pwa-register'

import '@/modules/shared/i18n/i18n.service'
import { FoundationStatusPage } from '@/modules/foundation/pages/FoundationStatus.page'
import { initializeKeycloakAuth } from '@/modules/identity/shared/KeycloakAuthProvider.provider'
import '@/styles/index.css'

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, staleTime: 30_000 } },
})

registerSW({ immediate: true })

const rootElement = document.getElementById('root')

if (rootElement === null) {
  throw new Error('FRONTEND_ROOT_MISSING')
}

const applicationRootElement = rootElement

async function bootstrapApplication(): Promise<void> {
  await initializeKeycloakAuth()

  createRoot(applicationRootElement).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <FoundationStatusPage />
      </QueryClientProvider>
    </StrictMode>,
  )
}

void bootstrapApplication()
