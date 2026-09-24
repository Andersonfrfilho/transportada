/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 164 T14a/T14b: as duas rotas de reentrega — permissão, corpo estrito e o mapa dos erros de
 * domínio para status HTTP. O comportamento transacional real (lock, compare-and-set, 409 de
 * corrida, TOCTOU) fica em `test/integration/trip-redelivery-application.integration.ts`.
 */
import { describe, expect, test } from 'bun:test'

import { createRequestHandler } from '../../src/http/request-handler.service.js'
import { createRouter } from '../../src/http/router.service.js'
import { HealthService } from '../../src/health/health.service.js'
import { AuthorizationService } from '../../src/identity/application/authorization.service.js'
import type {
  AuthenticatedContext,
  CompanyContext,
} from '../../src/identity/domain/tenant-context.js'
import type { RedeliveryProposal } from '../../src/trips/domain/redelivery-proposal.policy.js'
import { OccurrenceCaseNotFoundError } from '../../src/trips/domain/trip.error.js'
import { createRedeliveryProposalRoutes } from '../../src/trips/presentation/redelivery-proposal.routes.js'
import { createRedeliveryApplicationRoutes } from '../../src/trips/presentation/redelivery-application.routes.js'
import { stubCompanyFiscalEnvironment } from '../fixtures/company-fiscal-environment.fixture.js'
import { stubUserPictureExistence } from '../fixtures/user-picture-existence.fixture.js'
import { appliedMigrations } from '../fixtures/health.fixture.js'
import { COMPANY_CONTEXT } from '../fixtures/trip-http.fixture.js'
import {
  FRONTEND_ORIGIN,
  jsonRequest,
  responseApiError,
} from '../fixtures/trip-http-payload.fixture.js'

const OCCURRENCE_ID = '00000000-0000-4000-8000-00000000f001'

const CONTEXT_WITH_OCCURRENCE_RESOLVE: CompanyContext = {
  ...COMPANY_CONTEXT,
  permissions: new Set([...COMPANY_CONTEXT.permissions, 'occurrences.resolve' as const]),
}

function createFixture(params: {
  readonly permissions?: CompanyContext['permissions']
  readonly proposalError?: Error
  readonly proposalResult?: RedeliveryProposal
}) {
  const proposalCalls: unknown[] = []
  const applicationCalls: unknown[] = []
  const context: AuthenticatedContext<CompanyContext> = {
    identity: {
      companyIdClaim: COMPANY_CONTEXT.companyId,
      externalIdentityId: crypto.randomUUID(),
      issuer: 'http://localhost:58080/realms/transportada-local',
      platformAdmin: false,
      serviceAccount: false,
      subject: 'redelivery-proposal-contract',
      userId: COMPANY_CONTEXT.userId,
    },
    scope: {
      ...COMPANY_CONTEXT,
      permissions: params.permissions ?? CONTEXT_WITH_OCCURRENCE_RESOLVE.permissions,
    },
  }
  const authorization = new AuthorizationService()
  const router = createRouter({
    authentication: { authenticate: async () => context.identity },
    authorization: { authorize: (value, policy) => authorization.authorize(value, policy) },
    companyFiscalEnvironment: stubCompanyFiscalEnvironment(),
    userPictureExistence: stubUserPictureExistence(),
    healthService: new HealthService({
      database: { async close() {}, healthCheck: async () => ({ healthy: true }) },
      identityReadiness: { checkReadiness: async () => true },
      migrationStatus: appliedMigrations(),
    }),
    routes: [
      ...createRedeliveryProposalRoutes({
        redeliveryProposal: {
          getProposal: async (input) => {
            proposalCalls.push(input)
            if (params.proposalError !== undefined) throw params.proposalError
            return (
              params.proposalResult ?? {
                kind: 'reorder_stop',
                orderedStopIds: ['stop-2', 'stop-1'],
                stopId: 'stop-1',
              }
            )
          },
        },
      }),
      ...createRedeliveryApplicationRoutes({
        redeliveryApplication: {
          apply: async (input) => {
            applicationCalls.push(input)
            return { application: 'reordered' }
          },
        },
      }),
    ],
    rateLimitWindows: { consume: async () => ({ allowed: true }) },
    tenantContext: { resolveCompany: async () => context },
  })
  const handleRequest = createRequestHandler({
    createCorrelationId: () => 'redelivery-proposal-correlation',
    frontendOrigins: [FRONTEND_ORIGIN],
    logger: { error() {}, info() {}, warn() {} },
    requestTimeoutSeconds: 10,
    router,
  })
  return {
    applicationCalls,
    handle: (request: Request) => handleRequest(request, { timeout() {} }),
    proposalCalls,
  }
}

const proposalPath = (occurrenceId: string): string =>
  `/trip-occurrences/${occurrenceId}/case/redelivery-proposal`
const applicationPath = (occurrenceId: string): string =>
  `/trip-occurrences/${occurrenceId}/case/redelivery-application`

describe('GET redelivery-proposal (spec 164 T14a)', () => {
  test('sem occurrences.resolve, 403', async () => {
    const fixture = createFixture({ permissions: new Set(['fleet.read']) })
    const response = await fixture.handle(
      jsonRequest({ method: 'GET', path: proposalPath(OCCURRENCE_ID) }),
    )
    expect(response.status).toBe(403)
    expect(fixture.proposalCalls).toEqual([])
  })

  test('devolve a proposta com companyId/occurrenceId do contexto', async () => {
    const fixture = createFixture({})
    const response = await fixture.handle(
      jsonRequest({ method: 'GET', path: proposalPath(OCCURRENCE_ID) }),
    )
    expect(response.status).toBe(200)
    const body = (await response.json()) as { data: RedeliveryProposal }
    expect(body.data).toEqual({
      kind: 'reorder_stop',
      orderedStopIds: ['stop-2', 'stop-1'],
      stopId: 'stop-1',
    })
    expect(fixture.proposalCalls).toEqual([
      { companyId: COMPANY_CONTEXT.companyId, occurrenceId: OCCURRENCE_ID },
    ])
  })

  test('ocorrência de outra empresa é 404', async () => {
    const fixture = createFixture({ proposalError: new OccurrenceCaseNotFoundError() })
    const response = await fixture.handle(
      jsonRequest({ method: 'GET', path: proposalPath(OCCURRENCE_ID) }),
    )
    expect(response.status).toBe(404)
    expect((await responseApiError(response)).code).toBe('OCCURRENCE_CASE_NOT_FOUND')
  })
})

describe('POST redelivery-application (spec 164 T14b)', () => {
  test('sem occurrences.resolve, 403 antes de tocar o caso de uso', async () => {
    const fixture = createFixture({ permissions: new Set(['fleet.read']) })
    const response = await fixture.handle(
      jsonRequest({ method: 'POST', path: applicationPath(OCCURRENCE_ID) }),
    )
    expect(response.status).toBe(403)
    expect(fixture.applicationCalls).toEqual([])
  })

  test('aplica com o ator do contexto autenticado', async () => {
    const fixture = createFixture({})
    const response = await fixture.handle(
      jsonRequest({ method: 'POST', path: applicationPath(OCCURRENCE_ID) }),
    )
    expect(response.status).toBe(200)
    const body = (await response.json()) as { data: { application: string } }
    expect(body.data).toEqual({ application: 'reordered' })
    expect(fixture.applicationCalls).toEqual([
      {
        actorUserId: COMPANY_CONTEXT.userId,
        companyId: COMPANY_CONTEXT.companyId,
        occurrenceId: OCCURRENCE_ID,
      },
    ])
  })

  test('corpo com chave desconhecida é 400 (zod .strict())', async () => {
    const fixture = createFixture({})
    const response = await fixture.handle(
      jsonRequest({
        body: { note: 'não existe campo aqui' },
        method: 'POST',
        path: applicationPath(OCCURRENCE_ID),
      }),
    )
    expect(response.status).toBe(400)
  })
})
