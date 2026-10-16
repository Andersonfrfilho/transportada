/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 266: `:kind` vale `document` ou `stop`, não UUID. Com o formato padrão (`canonicalUuid`) o roteador
 * não casava o caminho — preflight 403 no app do motorista e 404 no "Resolver com observação" do painel —,
 * e os contratos das rotas não viam, porque chamavam o handler sem passar pelo roteador. Aqui o caminho
 * concreto passa pelo roteador de verdade.
 */
import { describe, expect, it } from 'bun:test'

import { createRouter } from '../../src/http/router.service.js'
import { HealthService } from '../../src/health/health.service.js'
import { createMeRouteOccurrenceRoutes } from '../../src/trips/presentation/me-route-occurrence.routes.js'
import { createOccurrenceResolutionRoutes } from '../../src/trips/presentation/occurrence-resolution.routes.js'
import { stubCompanyFiscalEnvironment } from '../fixtures/company-fiscal-environment.fixture.js'
import { appliedMigrations } from '../fixtures/health.fixture.js'
import { stubUserPictureExistence } from '../fixtures/user-picture-existence.fixture.js'

const OCCURRENCE_ID = '0b5f7c1e-2f43-4f6a-9d7e-3c1a2b4d5e6f'
const OBJECT_ID = '7d2e1f4a-9b8c-4c3d-8e2f-1a0b9c8d7e6f'

function anyDependencies<TDependencies>(): TDependencies {
  const handler: ProxyHandler<() => void> = { get: () => new Proxy(() => undefined, handler) }
  return new Proxy(() => undefined, handler) as unknown as TDependencies
}

function buildRouter(): ReturnType<typeof createRouter> {
  return createRouter({
    authentication: anyDependencies(),
    authorization: anyDependencies(),
    companyFiscalEnvironment: stubCompanyFiscalEnvironment(),
    healthService: new HealthService({
      database: { async close() {}, healthCheck: async () => ({ healthy: true }) },
      identityReadiness: { checkReadiness: async () => true },
      migrationStatus: appliedMigrations(),
    }),
    rateLimitWindows: anyDependencies(),
    routes: [
      ...createMeRouteOccurrenceRoutes(anyDependencies()),
      ...createOccurrenceResolutionRoutes(anyDependencies()),
    ],
    tenantContext: anyDependencies(),
    userPictureExistence: stubUserPictureExistence(),
  })
}

describe('as rotas com :kind casam document e stop pelo roteador (spec 266)', () => {
  const router = buildRouter()

  it.each(['document', 'stop'])('o detalhe da ocorrência de %s tem GET no preflight', (kind) => {
    const path = `/me/trips/current/route-occurrences/${kind}/${OCCURRENCE_ID}`
    expect(router.allowedMethods(path)).toContain('GET')
  })

  it.each(['document', 'stop'])('o link do documento da ocorrência de %s tem GET', (kind) => {
    const path = `/me/trips/current/route-occurrences/${kind}/${OCCURRENCE_ID}/attachments/${OBJECT_ID}/url`
    expect(router.allowedMethods(path)).toContain('GET')
  })

  it.each(['document', 'stop'])('resolver a ocorrência de %s tem POST', (kind) => {
    const path = `/trip-occurrences/${kind}/${OCCURRENCE_ID}/resolution`
    expect(router.allowedMethods(path)).toContain('POST')
  })
})
