/* Copyright (c) 2026 Ada Technology. MIT License. */
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { EnvironmentBanner } from '@/components/EnvironmentBanner.component'
import { getDeploymentEnvironment } from '@/modules/shared/deploymentEnvironment.service'
import { applyEnvironmentBadge } from '@/modules/shared/environmentBadge.service'
import '@/styles/index.css'

const deploymentEnvironment = getDeploymentEnvironment()

applyEnvironmentBadge({ document, environment: deploymentEnvironment })

/**
 * Tela provisória da T1.2: a app existe, é servida e se instala. A autenticação chega na T2.3 e a
 * viagem na Fase 3 — até lá não há o que pedir à API.
 */
function App() {
  return (
    <>
      <EnvironmentBanner environment={deploymentEnvironment} />
      <main className="page">
        <h1 className="page__title">Minha viagem</h1>
        <p className="page__lead">A app do motorista está sendo montada.</p>
      </main>
    </>
  )
}

const container = document.getElementById('root')
if (container === null) throw new Error('DRIVER_ROOT_ELEMENT_MISSING')

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
