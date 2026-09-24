/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 164 T13/T18: as duas rotas do acerto — permissão, resolução `occurrenceId → caseId`, corpo
 * estrito e o mapa dos erros de domínio para status HTTP. Comportamento contra Postgres real (lock,
 * transação, a ponte para `delivery_charges`) fica em `test/integration/*` (fora deste arquivo).
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
import type {
  FindOccurrenceSettlementResult,
  FindOccurrenceSettlementUseCase,
} from '../../src/trips/application/find-occurrence-settlement.use-case.js'
import type { RecordOccurrenceSettlementUseCase } from '../../src/trips/application/record-occurrence-settlement.use-case.js'
import type { ReimburseOccurrenceSettlementUseCase } from '../../src/trips/application/reimburse-occurrence-settlement.use-case.js'
import {
  OccurrenceCaseNotFoundError,
  OccurrenceCaseTransitionNotAllowedError,
  OccurrenceSettlementAmountInvalidError,
  OccurrenceSettlementItemNotFoundError,
  OccurrenceSettlementItemUnknownError,
  OccurrenceSettlementNotReimbursableError,
  OccurrenceSettlementPayerInvalidError,
} from '../../src/trips/domain/trip.error.js'
import { createOccurrenceSettlementRoutes } from '../../src/trips/presentation/occurrence-settlement.routes.js'
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
const CASE_ID = '00000000-0000-4000-8000-00000000f002'
const DRIVER_ID = '00000000-0000-4000-8000-00000000f003'

const CONTEXT_WITH_OCCURRENCE_RESOLVE: CompanyContext = {
  ...COMPANY_CONTEXT,
  permissions: new Set([...COMPANY_CONTEXT.permissions, 'occurrences.resolve' as const]),
}

function createFixture(params: {
  readonly findCaseIdReturnsNull?: boolean
  readonly findError?: Error
  readonly findResult?: FindOccurrenceSettlementResult
  readonly permissions?: CompanyContext['permissions']
  readonly recordError?: Error
  readonly reimburseError?: Error
}) {
  const recordCalls: unknown[] = []
  const reimburseCalls: unknown[] = []
  const findCalls: unknown[] = []
  const settlement: RecordOccurrenceSettlementUseCase = {
    async record(input) {
      recordCalls.push(input)
      if (params.recordError !== undefined) throw params.recordError
      return { items: input.items, total: '0.0000' }
    },
  }
  const settlementReimbursement: ReimburseOccurrenceSettlementUseCase = {
    async reimburse(input) {
      reimburseCalls.push(input)
      if (params.reimburseError !== undefined) throw params.reimburseError
      return { kind: 'changed' }
    },
  }
  const settlementFind: FindOccurrenceSettlementUseCase = {
    async find(input) {
      findCalls.push(input)
      if (params.findError !== undefined) throw params.findError
      return params.findResult ?? { items: [], total: '0.0000' }
    },
  }
  const findCaseIdCalls: unknown[] = []
  const context: AuthenticatedContext<CompanyContext> = {
    identity: {
      companyIdClaim: COMPANY_CONTEXT.companyId,
      externalIdentityId: crypto.randomUUID(),
      issuer: 'http://localhost:58080/realms/transportada-local',
      platformAdmin: false,
      serviceAccount: false,
      subject: 'occurrence-settlement-contract',
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
    routes: createOccurrenceSettlementRoutes({
      findCaseIdByOccurrenceId: async (input) => {
        findCaseIdCalls.push(input)
        if (params.findCaseIdReturnsNull === true) return null
        return CASE_ID
      },
      settlement,
      settlementFind,
      settlementReimbursement,
    }),
    rateLimitWindows: { consume: async () => ({ allowed: true }) },
    tenantContext: { resolveCompany: async () => context },
  })
  const handleRequest = createRequestHandler({
    createCorrelationId: () => 'occurrence-settlement-correlation',
    frontendOrigins: [FRONTEND_ORIGIN],
    logger: { error() {}, info() {}, warn() {} },
    requestTimeoutSeconds: 10,
    router,
  })
  return {
    findCalls,
    findCaseIdCalls,
    handle: (request: Request) => handleRequest(request, { timeout() {} }),
    recordCalls,
    reimburseCalls,
  }
}

const SETTLEMENT_PATH = `/trip-occurrences/${OCCURRENCE_ID}/case/settlement`
const REIMBURSEMENT_PATH = `${SETTLEMENT_PATH}/reimbursement`

const VALID_ITEM = {
  amount: '150.0000',
  amountSource: 'nfe' as const,
  payerKind: 'contractor' as const,
  productCode: 'ABC-1',
}

describe('PUT .../case/settlement (spec 164 T13)', () => {
  test('sem occurrences.resolve, 403 antes de tocar o caso de uso', async () => {
    const fixture = createFixture({ permissions: new Set(['fleet.read']) })
    const response = await fixture.handle(
      jsonRequest({ body: { items: [VALID_ITEM] }, method: 'PUT', path: SETTLEMENT_PATH }),
    )
    expect(response.status).toBe(403)
    expect(fixture.recordCalls).toEqual([])
  })

  test('resolve occurrenceId -> caseId e chama o caso de uso com a lista inteira', async () => {
    const fixture = createFixture({})
    const response = await fixture.handle(
      jsonRequest({ body: { items: [VALID_ITEM] }, method: 'PUT', path: SETTLEMENT_PATH }),
    )
    expect(response.status).toBe(200)
    expect(fixture.findCaseIdCalls).toEqual([
      { companyId: COMPANY_CONTEXT.companyId, occurrenceId: OCCURRENCE_ID },
    ])
    expect(fixture.recordCalls).toEqual([
      { caseId: CASE_ID, context: CONTEXT_WITH_OCCURRENCE_RESOLVE, items: [VALID_ITEM] },
    ])
    const body = (await response.json()) as { data: { items: unknown[]; total: string } }
    expect(body.data.total).toBe('0.0000')
  })

  test('ocorrência de outra empresa (ou sem tratativa) é 404 antes de chamar o caso de uso', async () => {
    const fixture = createFixture({ findCaseIdReturnsNull: true })
    const response = await fixture.handle(
      jsonRequest({ body: { items: [] }, method: 'PUT', path: SETTLEMENT_PATH }),
    )
    expect(response.status).toBe(404)
    expect((await responseApiError(response)).code).toBe('OCCURRENCE_CASE_NOT_FOUND')
    expect(fixture.recordCalls).toEqual([])
  })

  test('lista vazia é aceita (limpa o acerto)', async () => {
    const fixture = createFixture({})
    const response = await fixture.handle(
      jsonRequest({ body: { items: [] }, method: 'PUT', path: SETTLEMENT_PATH }),
    )
    expect(response.status).toBe(200)
  })

  test('item com `payerId` fora do padrão UUID é 400 (zod)', async () => {
    const fixture = createFixture({})
    const response = await fixture.handle(
      jsonRequest({
        body: { items: [{ ...VALID_ITEM, payerId: 'not-a-uuid', payerKind: 'driver' }] },
        method: 'PUT',
        path: SETTLEMENT_PATH,
      }),
    )
    expect(response.status).toBe(400)
  })

  test('item com `payerId` válido para `driver` passa a fronteira', async () => {
    const fixture = createFixture({})
    const response = await fixture.handle(
      jsonRequest({
        body: { items: [{ ...VALID_ITEM, payerId: DRIVER_ID, payerKind: 'driver' }] },
        method: 'PUT',
        path: SETTLEMENT_PATH,
      }),
    )
    expect(response.status).toBe(200)
  })

  test('corpo com chave desconhecida é 400 (zod .strict())', async () => {
    const fixture = createFixture({})
    const response = await fixture.handle(
      jsonRequest({
        body: { extra: true, items: [] },
        method: 'PUT',
        path: SETTLEMENT_PATH,
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
      code: 'OCCURRENCE_SETTLEMENT_ITEM_UNKNOWN',
      error: new OccurrenceSettlementItemUnknownError(),
      status: 422,
    },
    {
      code: 'OCCURRENCE_SETTLEMENT_AMOUNT_INVALID',
      error: new OccurrenceSettlementAmountInvalidError(),
      status: 422,
    },
    {
      code: 'OCCURRENCE_SETTLEMENT_PAYER_INVALID',
      error: new OccurrenceSettlementPayerInvalidError(),
      status: 422,
    },
  ])('$code sai como $status', async ({ code, error, status }) => {
    const fixture = createFixture({ recordError: error })
    const response = await fixture.handle(
      jsonRequest({ body: { items: [VALID_ITEM] }, method: 'PUT', path: SETTLEMENT_PATH }),
    )
    expect(response.status).toBe(status)
    expect((await responseApiError(response)).code).toBe(code)
  })
})

describe('POST .../case/settlement/reimbursement (spec 164 T18)', () => {
  test('sem occurrences.resolve, 403 antes de tocar o caso de uso', async () => {
    const fixture = createFixture({ permissions: new Set(['fleet.read']) })
    const response = await fixture.handle(
      jsonRequest({
        body: { productCode: 'ABC-1' },
        method: 'POST',
        path: REIMBURSEMENT_PATH,
      }),
    )
    expect(response.status).toBe(403)
    expect(fixture.reimburseCalls).toEqual([])
  })

  test('resolve occurrenceId -> caseId e chama o caso de uso com o productCode', async () => {
    const fixture = createFixture({})
    const response = await fixture.handle(
      jsonRequest({
        body: { productCode: 'ABC-1' },
        method: 'POST',
        path: REIMBURSEMENT_PATH,
      }),
    )
    expect(response.status).toBe(200)
    expect(fixture.reimburseCalls).toEqual([
      { caseId: CASE_ID, context: CONTEXT_WITH_OCCURRENCE_RESOLVE, productCode: 'ABC-1' },
    ])
  })

  test('ocorrência de outra empresa (ou sem tratativa) é 404', async () => {
    const fixture = createFixture({ findCaseIdReturnsNull: true })
    const response = await fixture.handle(
      jsonRequest({
        body: { productCode: 'ABC-1' },
        method: 'POST',
        path: REIMBURSEMENT_PATH,
      }),
    )
    expect(response.status).toBe(404)
    expect((await responseApiError(response)).code).toBe('OCCURRENCE_CASE_NOT_FOUND')
  })

  test('corpo sem `productCode` é 400', async () => {
    const fixture = createFixture({})
    const response = await fixture.handle(
      jsonRequest({ body: {}, method: 'POST', path: REIMBURSEMENT_PATH }),
    )
    expect(response.status).toBe(400)
  })

  test.each([
    {
      code: 'OCCURRENCE_SETTLEMENT_ITEM_NOT_FOUND',
      error: new OccurrenceSettlementItemNotFoundError(),
      status: 404,
    },
    {
      code: 'OCCURRENCE_SETTLEMENT_NOT_REIMBURSABLE',
      error: new OccurrenceSettlementNotReimbursableError(),
      status: 422,
    },
  ])('$code sai como $status', async ({ code, error, status }) => {
    const fixture = createFixture({ reimburseError: error })
    const response = await fixture.handle(
      jsonRequest({
        body: { productCode: 'ABC-1' },
        method: 'POST',
        path: REIMBURSEMENT_PATH,
      }),
    )
    expect(response.status).toBe(status)
    expect((await responseApiError(response)).code).toBe(code)
  })
})

/** Achado 2 da revisão: `GET` devolve o que o `PUT` gravou, no mesmo formato de item. */
describe('GET .../case/settlement (achado 2 da revisão)', () => {
  test('sem occurrences.resolve, 403 antes de tocar o caso de uso', async () => {
    const fixture = createFixture({ permissions: new Set(['fleet.read']) })
    const response = await fixture.handle(jsonRequest({ method: 'GET', path: SETTLEMENT_PATH }))
    expect(response.status).toBe(403)
    expect(fixture.findCalls).toEqual([])
  })

  test('resolve occurrenceId -> caseId e devolve os itens gravados', async () => {
    const storedItem = {
      amount: '150.0000',
      amountSource: 'nfe' as const,
      payerKind: 'contractor' as const,
      productCode: 'ABC-1',
      reimbursedAt: null,
    }
    const fixture = createFixture({ findResult: { items: [storedItem], total: '150.0000' } })
    const response = await fixture.handle(jsonRequest({ method: 'GET', path: SETTLEMENT_PATH }))

    expect(response.status).toBe(200)
    expect(fixture.findCaseIdCalls).toEqual([
      { companyId: COMPANY_CONTEXT.companyId, occurrenceId: OCCURRENCE_ID },
    ])
    expect(fixture.findCalls).toEqual([
      { caseId: CASE_ID, context: CONTEXT_WITH_OCCURRENCE_RESOLVE },
    ])
    const body = (await response.json()) as {
      data: { items: readonly unknown[]; total: string }
    }
    expect(body.data.items).toEqual([storedItem])
    expect(body.data.total).toBe('150.0000')
  })

  test('ocorrência de outra empresa (ou sem tratativa) é 404 antes de chamar o caso de uso', async () => {
    const fixture = createFixture({ findCaseIdReturnsNull: true })
    const response = await fixture.handle(jsonRequest({ method: 'GET', path: SETTLEMENT_PATH }))
    expect(response.status).toBe(404)
    expect((await responseApiError(response)).code).toBe('OCCURRENCE_CASE_NOT_FOUND')
    expect(fixture.findCalls).toEqual([])
  })

  test('sem acerto gravado, devolve lista vazia e total zero', async () => {
    const fixture = createFixture({})
    const response = await fixture.handle(jsonRequest({ method: 'GET', path: SETTLEMENT_PATH }))
    expect(response.status).toBe(200)
    const body = (await response.json()) as { data: { items: readonly unknown[]; total: string } }
    expect(body.data).toEqual({ items: [], total: '0.0000' })
  })
})
