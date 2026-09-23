/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 164 T7: as cinco rotas internas da tratativa — permissão, resolução `occurrenceId → caseId`,
 * corpo estrito e o mapa dos erros de domínio para status HTTP. Comportamento contra Postgres real
 * (lock, compare-and-set, 409 de corrida) já é coberto por `trip-occurrence-case-write-guard.
 * integration.ts` (T4) e fica fora daqui.
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
import type { OccurrenceCaseUseCase } from '../../src/trips/application/occurrence-case.use-case.js'
import {
  OccurrenceCaseDecisionConflictError,
  OccurrenceCaseNotFoundError,
  OccurrenceCaseRedeliveryNotAllowedError,
  OccurrenceCaseSettlementWithoutItemsError,
  OccurrenceCaseTransitionNotAllowedError,
} from '../../src/trips/domain/trip.error.js'
import { createOccurrenceCaseRoutes } from '../../src/trips/presentation/occurrence-case.routes.js'
import { stubCompanyFiscalEnvironment } from '../fixtures/company-fiscal-environment.fixture.js'
import { stubUserPictureExistence } from '../fixtures/user-picture-existence.fixture.js'
import { appliedMigrations } from '../fixtures/health.fixture.js'
import { COMPANY_CONTEXT } from '../fixtures/trip-http.fixture.js'
import {
  FRONTEND_ORIGIN,
  jsonRequest,
  responseApiError,
} from '../fixtures/trip-http-payload.fixture.js'

const OCCURRENCE_ID = '00000000-0000-4000-8000-00000000e001'
const CASE_ID = '00000000-0000-4000-8000-00000000e002'
const OTHER_OCCURRENCE_ID = '00000000-0000-4000-8000-00000000e003'

/** Spec 164 T6: `occurrences.resolve` ainda não faz parte do fixture genérico de trips. */
const CONTEXT_WITH_OCCURRENCE_RESOLVE: CompanyContext = {
  ...COMPANY_CONTEXT,
  permissions: new Set([...COMPANY_CONTEXT.permissions, 'occurrences.resolve' as const]),
}

type Calls = Record<keyof OccurrenceCaseUseCase, unknown[]>

function createFixture(params: {
  readonly error?: Error
  readonly findCaseIdReturnsNull?: boolean
  readonly permissions?: CompanyContext['permissions']
}) {
  const calls: Calls = {
    cancel: [],
    closure: [],
    contractorSubmission: [],
    decide: [],
    review: [],
    warehouseReturn: [],
  }
  function record(name: keyof OccurrenceCaseUseCase) {
    return async (
      input: unknown,
    ): Promise<{ readonly kind: 'changed'; readonly status: string }> => {
      calls[name].push(input)
      if (params.error !== undefined) throw params.error
      return { kind: 'changed', status: 'under_review' }
    }
  }
  const occurrenceCase: OccurrenceCaseUseCase = {
    cancel: record('cancel'),
    closure: record('closure'),
    contractorSubmission: record('contractorSubmission'),
    decide: record('decide'),
    review: record('review'),
    warehouseReturn: record('warehouseReturn'),
  }
  const findCaseIdCalls: unknown[] = []
  const context: AuthenticatedContext<CompanyContext> = {
    identity: {
      companyIdClaim: COMPANY_CONTEXT.companyId,
      externalIdentityId: crypto.randomUUID(),
      issuer: 'http://localhost:58080/realms/transportada-local',
      platformAdmin: false,
      serviceAccount: false,
      subject: 'occurrence-case-contract',
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
    routes: createOccurrenceCaseRoutes({
      findCaseIdByOccurrenceId: async (input) => {
        findCaseIdCalls.push(input)
        if (params.findCaseIdReturnsNull === true) return null
        return CASE_ID
      },
      occurrenceCase,
    }),
    rateLimitWindows: { consume: async () => ({ allowed: true }) },
    tenantContext: { resolveCompany: async () => context },
  })
  const handleRequest = createRequestHandler({
    createCorrelationId: () => 'occurrence-case-correlation',
    frontendOrigins: [FRONTEND_ORIGIN],
    logger: { error() {}, info() {}, warn() {} },
    requestTimeoutSeconds: 10,
    router,
  })
  return {
    calls,
    findCaseIdCalls,
    handle: (request: Request) => handleRequest(request, { timeout() {} }),
  }
}

const casePath = (occurrenceId: string, action: string): string =>
  `/trip-occurrences/${occurrenceId}/case/${action}`

describe('rotas internas da tratativa (spec 164 T7)', () => {
  test('sem occurrences.resolve, 403 antes de tocar o caso de uso', async () => {
    const fixture = createFixture({ permissions: new Set(['fleet.read']) })
    const response = await fixture.handle(
      jsonRequest({ method: 'POST', path: casePath(OCCURRENCE_ID, 'review') }),
    )
    expect(response.status).toBe(403)
    expect(fixture.calls.review).toEqual([])
  })

  test('review resolve occurrenceId -> caseId e chama a ação com o contexto da empresa', async () => {
    const fixture = createFixture({})
    const response = await fixture.handle(
      jsonRequest({ method: 'POST', path: casePath(OCCURRENCE_ID, 'review') }),
    )

    expect(response.status).toBe(200)
    expect(fixture.findCaseIdCalls).toEqual([
      { companyId: COMPANY_CONTEXT.companyId, occurrenceId: OCCURRENCE_ID },
    ])
    expect(fixture.calls.review).toEqual([
      { caseId: CASE_ID, context: CONTEXT_WITH_OCCURRENCE_RESOLVE },
    ])
  })

  test('ocorrência de outra empresa (ou sem tratativa) é 404 antes de chamar o caso de uso', async () => {
    const fixture = createFixture({ findCaseIdReturnsNull: true })
    const response = await fixture.handle(
      jsonRequest({ method: 'POST', path: casePath(OTHER_OCCURRENCE_ID, 'review') }),
    )

    expect(response.status).toBe(404)
    expect((await responseApiError(response)).code).toBe('OCCURRENCE_CASE_NOT_FOUND')
    expect(fixture.calls.review).toEqual([])
  })

  test('warehouse-return exige nota no corpo', async () => {
    const fixture = createFixture({})
    const missing = await fixture.handle(
      jsonRequest({ method: 'POST', path: casePath(OCCURRENCE_ID, 'warehouse-return') }),
    )
    expect(missing.status).toBe(400)
    expect(fixture.calls.warehouseReturn).toEqual([])

    const withNote = await fixture.handle(
      jsonRequest({
        body: { note: 'devolvida ao galpão' },
        method: 'POST',
        path: casePath(OCCURRENCE_ID, 'warehouse-return'),
      }),
    )
    expect(withNote.status).toBe(200)
    expect(fixture.calls.warehouseReturn).toEqual([
      { caseId: CASE_ID, context: CONTEXT_WITH_OCCURRENCE_RESOLVE, note: 'devolvida ao galpão' },
    ])
  })

  test('cancel exige nota no corpo', async () => {
    const fixture = createFixture({})
    const missing = await fixture.handle(
      jsonRequest({ method: 'POST', path: casePath(OCCURRENCE_ID, 'cancel') }),
    )
    expect(missing.status).toBe(400)
    expect(fixture.calls.cancel).toEqual([])

    const withNote = await fixture.handle(
      jsonRequest({
        body: { note: 'ocorrência aberta por engano' },
        method: 'POST',
        path: casePath(OCCURRENCE_ID, 'cancel'),
      }),
    )
    expect(withNote.status).toBe(200)
    expect(fixture.calls.cancel).toEqual([
      {
        caseId: CASE_ID,
        context: CONTEXT_WITH_OCCURRENCE_RESOLVE,
        note: 'ocorrência aberta por engano',
      },
    ])
  })

  test('contractor-submission e closure não exigem nota', async () => {
    const fixture = createFixture({})
    const submission = await fixture.handle(
      jsonRequest({ method: 'POST', path: casePath(OCCURRENCE_ID, 'contractor-submission') }),
    )
    expect(submission.status).toBe(200)

    const closure = await fixture.handle(
      jsonRequest({ method: 'POST', path: casePath(OCCURRENCE_ID, 'closure') }),
    )
    expect(closure.status).toBe(200)
  })

  test('corpo com chave desconhecida é 400 (zod .strict())', async () => {
    const fixture = createFixture({})
    const response = await fixture.handle(
      jsonRequest({
        body: { companyId: crypto.randomUUID() },
        method: 'POST',
        path: casePath(OCCURRENCE_ID, 'review'),
      }),
    )
    expect(response.status).toBe(400)
  })

  test.each([
    { code: 'OCCURRENCE_CASE_NOT_FOUND', error: new OccurrenceCaseNotFoundError(), status: 404 },
    {
      code: 'OCCURRENCE_CASE_TRANSITION_NOT_ALLOWED',
      error: new OccurrenceCaseTransitionNotAllowedError(),
      status: 409,
    },
    {
      code: 'OCCURRENCE_CASE_REDELIVERY_NOT_ALLOWED',
      error: new OccurrenceCaseRedeliveryNotAllowedError('redeliveryNotAllowed'),
      status: 422,
    },
    {
      code: 'OCCURRENCE_CASE_SETTLEMENT_WITHOUT_ITEMS',
      error: new OccurrenceCaseSettlementWithoutItemsError(),
      status: 422,
    },
  ])(
    '$code sai como $status (inclusive a corrida perdida, 409)',
    async ({ code, error, status }) => {
      const fixture = createFixture({ error })
      const response = await fixture.handle(
        jsonRequest({ method: 'POST', path: casePath(OCCURRENCE_ID, 'review') }),
      )
      expect(response.status).toBe(status)
      expect((await responseApiError(response)).code).toBe(code)
    },
  )

  test('repetir a mesma ação converge (idempotente) — kind unchanged não é erro', async () => {
    const fixture = createFixture({})
    const first = await fixture.handle(
      jsonRequest({ method: 'POST', path: casePath(OCCURRENCE_ID, 'review') }),
    )
    const second = await fixture.handle(
      jsonRequest({ method: 'POST', path: casePath(OCCURRENCE_ID, 'review') }),
    )
    expect(first.status).toBe(200)
    expect(second.status).toBe(200)
    expect(fixture.calls.review).toHaveLength(2)
  })
})

/** Achado 1 da revisão: a decisão em nome do contratante — permissão própria e nota obrigatória. */
describe('POST .../case/decision (achado 1 da revisão)', () => {
  test('sem occurrences.resolve, 403 antes de tocar o caso de uso', async () => {
    const fixture = createFixture({ permissions: new Set(['fleet.read']) })
    const response = await fixture.handle(
      jsonRequest({
        body: { kind: 'other', note: 'contratante não responde' },
        method: 'POST',
        path: casePath(OCCURRENCE_ID, 'decision'),
      }),
    )
    expect(response.status).toBe(403)
    expect(fixture.calls.decide).toEqual([])
  })

  /** RF12/D6/D7: `occurrences.decide` é do papel `contractor`, nunca alcança a rota interna. */
  test('papel contractor (occurrences.decide, sem occurrences.resolve) não alcança a rota', async () => {
    const fixture = createFixture({
      permissions: new Set(['deliveries.track', 'occurrences.decide']),
    })
    const response = await fixture.handle(
      jsonRequest({
        body: { kind: 'other', note: 'contratante não responde' },
        method: 'POST',
        path: casePath(OCCURRENCE_ID, 'decision'),
      }),
    )
    expect(response.status).toBe(403)
    expect(fixture.calls.decide).toEqual([])
  })

  /** Molde de `separator-role.contract.test.ts`: o separador (`trip.manage`) nunca ganha `occurrences.resolve`. */
  test('papel separator (trip.manage, sem occurrences.resolve) não alcança a rota', async () => {
    const fixture = createFixture({
      permissions: new Set(['invoices.read', 'fleet.read', 'trip.read', 'trip.manage']),
    })
    const response = await fixture.handle(
      jsonRequest({
        body: { kind: 'other', note: 'contratante não responde' },
        method: 'POST',
        path: casePath(OCCURRENCE_ID, 'decision'),
      }),
    )
    expect(response.status).toBe(403)
    expect(fixture.calls.decide).toEqual([])
  })

  test('resolve occurrenceId -> caseId e chama decide com actorKind fixo no caso de uso', async () => {
    const fixture = createFixture({})
    const response = await fixture.handle(
      jsonRequest({
        body: { kind: 'redelivery_authorized', note: 'escritório decidiu pelo contratante' },
        method: 'POST',
        path: casePath(OCCURRENCE_ID, 'decision'),
      }),
    )
    expect(response.status).toBe(200)
    expect(fixture.findCaseIdCalls).toEqual([
      { companyId: COMPANY_CONTEXT.companyId, occurrenceId: OCCURRENCE_ID },
    ])
    expect(fixture.calls.decide).toEqual([
      {
        caseId: CASE_ID,
        context: CONTEXT_WITH_OCCURRENCE_RESOLVE,
        kind: 'redelivery_authorized',
        note: 'escritório decidiu pelo contratante',
      },
    ])
  })

  test('nota ausente é 400 (zod) — decidir em nome de alguém nunca é silencioso', async () => {
    const fixture = createFixture({})
    const response = await fixture.handle(
      jsonRequest({
        body: { kind: 'other' },
        method: 'POST',
        path: casePath(OCCURRENCE_ID, 'decision'),
      }),
    )
    expect(response.status).toBe(400)
    expect(fixture.calls.decide).toEqual([])
  })

  test('ocorrência de outra empresa (ou sem tratativa) é 404 antes de chamar o caso de uso', async () => {
    const fixture = createFixture({ findCaseIdReturnsNull: true })
    const response = await fixture.handle(
      jsonRequest({
        body: { kind: 'other', note: 'motivo' },
        method: 'POST',
        path: casePath(OTHER_OCCURRENCE_ID, 'decision'),
      }),
    )
    expect(response.status).toBe(404)
    expect((await responseApiError(response)).code).toBe('OCCURRENCE_CASE_NOT_FOUND')
    expect(fixture.calls.decide).toEqual([])
  })

  test('corpo com chave desconhecida é 400 (zod .strict())', async () => {
    const fixture = createFixture({})
    const response = await fixture.handle(
      jsonRequest({
        body: { kind: 'other', note: 'motivo', extra: true },
        method: 'POST',
        path: casePath(OCCURRENCE_ID, 'decision'),
      }),
    )
    expect(response.status).toBe(400)
  })

  test('OCCURRENCE_CASE_DECISION_CONFLICT sai como 409', async () => {
    const fixture = createFixture({ error: new OccurrenceCaseDecisionConflictError() })
    const response = await fixture.handle(
      jsonRequest({
        body: { kind: 'other', note: 'motivo' },
        method: 'POST',
        path: casePath(OCCURRENCE_ID, 'decision'),
      }),
    )
    expect(response.status).toBe(409)
    expect((await responseApiError(response)).code).toBe('OCCURRENCE_CASE_DECISION_CONFLICT')
  })
})
