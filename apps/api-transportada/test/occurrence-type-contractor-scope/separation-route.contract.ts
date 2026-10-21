/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 270 T2.4 (R6): `GET /trips/:tripId/documents/:documentId/occurrence-types` — os tipos do galpão
 * para uma nota. O caminho passa pelo roteador de verdade (a rota casa e responde no preflight); o caso
 * de uso filtra pela contratante que o servidor lê da nota e responde 404 para a nota fora da viagem.
 */
import { describe, expect, it } from 'bun:test'

import { HealthService } from '../../src/health/health.service.js'
import { createRouter } from '../../src/http/router.service.js'
import { listSeparationOccurrenceTypes } from '../../src/trips/application/list-separation-occurrence-types.use-case.js'
import type { OccurrenceTypeRecord } from '../../src/trips/application/register-trip-occurrence.use-case.js'
import { TripDocumentNotFoundError } from '../../src/trips/domain/trip.error.js'
import { createTripRoutes } from '../../src/trips/presentation/trip.routes.js'
import { stubCompanyFiscalEnvironment } from '../fixtures/company-fiscal-environment.fixture.js'
import { appliedMigrations } from '../fixtures/health.fixture.js'
import { stubUserPictureExistence } from '../fixtures/user-picture-existence.fixture.js'

const COMPANY = '00000000-0000-4000-8000-000000000001'
const TRIP = '0b5f7c1e-2f43-4f6a-9d7e-3c1a2b4d5e6f'
const DOCUMENT = '7d2e1f4a-9b8c-4c3d-8e2f-1a0b9c8d7e6f'
const ZARAGOZA = '11111111-1111-4111-8111-111111111111'
const RIBER = '22222222-2222-4222-8222-222222222222'

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
    routes: createTripRoutes(anyDependencies()),
    tenantContext: anyDependencies(),
    userPictureExistence: stubUserPictureExistence(),
  })
}

function type(overrides: Partial<OccurrenceTypeRecord> & { readonly id: string }) {
  return {
    active: true,
    allowsMultipleItems: true,
    emailTemplateKey: null,
    moments: ['separation'],
    name: overrides.id,
    notifies: false,
    stage: 'separation',
    ...overrides,
  } satisfies OccurrenceTypeRecord
}

const TYPES = [
  type({ id: 'general' }),
  type({ contractorIds: [ZARAGOZA], contractorScope: 'listed', id: 'zaragoza' }),
  type({ active: false, id: 'inactive' }),
  type({ id: 'delivery-only', moments: ['document'], stage: 'delivery' }),
]

function repository(contractorId: null | string | 'missing') {
  return {
    findDocumentContractor: async () => (contractorId === 'missing' ? null : { contractorId }),
    listOccurrenceTypes: async () => TYPES,
  }
}

describe('a rota dos tipos do galpão por nota (spec 270, R6)', () => {
  it('casa pelo roteador, com GET no preflight', () => {
    const router = buildRouter()
    expect(
      router.allowedMethods(`/trips/${TRIP}/documents/${DOCUMENT}/occurrence-types`),
    ).toContain('GET')
  })

  it('a nota da contratante da lista recebe o geral e o dela, só do momento separation e ativos', async () => {
    const types = await listSeparationOccurrenceTypes({
      companyId: COMPANY,
      documentId: DOCUMENT,
      repository: repository(ZARAGOZA),
      tripId: TRIP,
    })

    expect(types.map((candidate) => candidate.id)).toEqual(['general', 'zaragoza'])
  })

  it('a nota de outra contratante e a sem contratante só recebem o geral', async () => {
    for (const contractorId of [RIBER, null]) {
      const types = await listSeparationOccurrenceTypes({
        companyId: COMPANY,
        documentId: DOCUMENT,
        repository: repository(contractorId),
        tripId: TRIP,
      })
      expect(types.map((candidate) => candidate.id)).toEqual(['general'])
    }
  })

  it('a nota que não é da viagem ou da empresa é 404', async () => {
    await expect(
      listSeparationOccurrenceTypes({
        companyId: COMPANY,
        documentId: DOCUMENT,
        repository: repository('missing'),
        tripId: TRIP,
      }),
    ).rejects.toBeInstanceOf(TripDocumentNotFoundError)
  })

  it('a resposta não carrega escopo, lista nem contratantes do tipo', async () => {
    const [view] = await listSeparationOccurrenceTypes({
      companyId: COMPANY,
      documentId: DOCUMENT,
      repository: repository(ZARAGOZA),
      tripId: TRIP,
    })

    expect(Object.keys(view ?? {})).not.toContain('contractorScope')
    expect(Object.keys(view ?? {})).not.toContain('contractorIds')
    expect(Object.keys(view ?? {})).not.toContain('contractors')
  })
})
