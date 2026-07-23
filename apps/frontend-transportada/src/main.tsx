/* Copyright (c) 2026 Ada Technology. MIT License. */
import { StrictMode } from 'react'
import type { ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { registerSW } from 'virtual:pwa-register'

import { BillingWorkspacePage } from '@/modules/billing/pages/BillingWorkspace.page'
import { CteBatchWorkspacePage } from '@/modules/cte-batch/pages/CteBatchWorkspace.page'
import '@/modules/shared/i18n/i18n.service'
import { FreightWorkspacePage } from '@/modules/freight/pages/FreightWorkspace.page'
import { initializeKeycloakAuth } from '@/modules/identity/shared/KeycloakAuthProvider.provider'
import { isSmokeAuthBypassEnabled } from '@/modules/identity/shared/smokeAuthBypass.service'
import { NfeWorkspacePage } from '@/modules/nfe-workspace/pages/NfeWorkspace.page'
import { OperationsDashboardPage } from '@/modules/operations/pages/OperationsDashboard.page'
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

function resolvePage(): ReactNode {
  if (
    window.location.pathname === '/billing' ||
    sessionStorage.getItem('transportada.workspace') === 'billing'
  ) {
    return <BillingWorkspacePage />
  }

  if (
    window.location.pathname === '/cte-batches' ||
    sessionStorage.getItem('transportada.workspace') === 'cte-batch'
  ) {
    return <CteBatchWorkspacePage />
  }

  if (
    window.location.pathname === '/operations' ||
    sessionStorage.getItem('transportada.workspace') === 'operations'
  ) {
    return <OperationsDashboardPage />
  }

  if (
    window.location.pathname === '/freight' ||
    sessionStorage.getItem('transportada.workspace') === 'freight'
  ) {
    return <FreightWorkspacePage />
  }

  return <NfeWorkspacePage />
}

async function bootstrapApplication(): Promise<void> {
  await initializeKeycloakAuth()

  createRoot(applicationRootElement).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>{resolvePage()}</QueryClientProvider>
    </StrictMode>,
  )
}

void bootstrapApplication()
