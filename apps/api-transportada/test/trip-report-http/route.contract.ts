/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { HealthService } from '../../src/health/health.service.js'
import { createRequestHandler } from '../../src/http/request-handler.service.js'
import { createRouter } from '../../src/http/router.service.js'
import { AuthorizationService } from '../../src/identity/application/authorization.service.js'
import type { AuthenticatedIdentity } from '../../src/identity/domain/authenticated-identity.js'
import type {
  AuthenticatedContext,
  CompanyContext,
} from '../../src/identity/domain/tenant-context.js'
import { ApiError } from '../../src/shared/api.error.js'
import { HTTP_ERROR } from '../../src/shared/api.constant.js'
import type {
  ListTripReportParams,
  ListTripReportResult,
  TripReportRow,
} from '../../src/trips/domain/trip-report.types.js'
import { TripReportTooLargeError } from '../../src/trips/domain/trip.error.js'
import { createTripDocumentReportRoutes } from '../../src/trips/presentation/trip-document-report.routes.js'
import { stubCompanyFiscalEnvironment } from '../fixtures/company-fiscal-environment.fixture.js'
import { appliedMigrations } from '../fixtures/health.fixture.js'
import { stubUserPictureExistence } from '../fixtures/user-picture-existence.fixture.js'

const COMPANY_ID = '00000000-0000-4000-8000-000000000002'
const USER_ID = '00000000-0000-4000-8000-000000000001'
const TRIP_ID = '00000000-0000-4000-8000-000000000a01'
const REPORT_PATH = '/trip-document-report'
const ORIGIN = 'http://127.0.0.1:53000'

const REPORT_RESULT: ListTripReportResult = {
  data: [
    {
      accessKey: '3'.repeat(44),
      amount: '120.5000',
      contractorName: 'Alfa',
      documentNumber: '12345',
      documentSeries: '1',
      documentStatus: 'loaded',
      recipientCity: 'Campinas',
      recipientName: 'Destinatario',
      recipientState: 'SP',
      tone: 'warehouse',
      tripId: TRIP_ID,
    },
  ],
  excludedWithoutTrip: 1,
  page: { nextCursor: null, total: 1 },
}

function omitAmount(row: TripReportRow): TripReportRow {
  const copy: { -readonly [Key in keyof TripReportRow]: TripReportRow[Key] } = { ...row }
  delete copy.amount
  return copy
}

function buildContext(permissions: readonly string[]): AuthenticatedContext<CompanyContext> {
  return {
    identity: {
      companyIdClaim: COMPANY_ID,
      externalIdentityId: crypto.randomUUID(),
      issuer: 'https://issuer.test',
      platformAdmin: false,
      serviceAccount: false,
      subject: 'trip-report-http',
      userId: USER_ID,
    } satisfies AuthenticatedIdentity,
    scope: {
      companyId: COMPANY_ID,
      kind: 'company',
      membershipId: crypto.randomUUID(),
      permissions: new Set(permissions),
      roles: ['operator'],
      userId: USER_ID,
    },
  } as AuthenticatedContext<CompanyContext>
}

function buildHandler(input: {
  readonly isAuthenticated?: boolean
  readonly listTripReport?: (params: ListTripReportParams) => Promise<ListTripReportResult>
  readonly permissions: readonly string[]
}) {
  const context = buildContext(input.permissions)
  const router = createRouter({
    authentication: {
      async authenticate() {
        if (input.isAuthenticated === false) throw new ApiError(HTTP_ERROR.unauthenticated)
        return context.identity
      },
    },
    authorization: new AuthorizationService(),
    companyFiscalEnvironment: stubCompanyFiscalEnvironment(),
    healthService: new HealthService({
      database: { async close() {}, healthCheck: async () => ({ healthy: true }) },
      identityReadiness: { checkReadiness: async () => true },
      migrationStatus: appliedMigrations(),
    }),
    rateLimitWindows: { consume: async () => ({ allowed: true }) },
    routes: createTripDocumentReportRoutes({
      exportTripProofPdf: async () => {
        throw new Error('unexpected proofs-pdf call')
      },
      listTripReport: input.listTripReport ?? (async () => REPORT_RESULT),
    }),
    tenantContext: { resolveCompany: async () => context },
    userPictureExistence: stubUserPictureExistence(),
  })
  const handle = createRequestHandler({
    createCorrelationId: () => crypto.randomUUID(),
    frontendOrigins: [ORIGIN],
    logger: { error() {}, info() {}, warn() {} },
    requestTimeoutSeconds: 30,
    router,
  })
  return (query = '') =>
    handle(
      new Request(`${ORIGIN}${REPORT_PATH}${query}`, { headers: { authorization: 'Bearer x' } }),
      { timeout() {} },
    )
}

describe('GET /trip-document-report (spec 253 T2.3)', () => {
  test('200 com o envelope, a empresa do contexto e os padroes da query', async () => {
    const calls: ListTripReportParams[] = []
    const handle = buildHandler({
      listTripReport: async (params) => {
        calls.push(params)
        return REPORT_RESULT
      },
      permissions: ['fleet.read', 'trip.financials'],
    })

    const response = await handle(`?statusIn=draft&limit=10`)

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(await response.json()).toEqual(REPORT_RESULT)
    expect(calls).toHaveLength(1)
    expect(calls[0]?.companyId).toBe(COMPANY_ID)
    expect(calls[0]?.canReadFinancials).toBe(true)
    expect(calls[0]?.query.limit).toBe(10)
    expect(calls[0]?.query.filters.statusIn).toEqual(['draft'])
  })

  test('sem trip.financials o chamador nao pede o valor', async () => {
    const calls: ListTripReportParams[] = []
    const handle = buildHandler({
      listTripReport: async (params) => {
        calls.push(params)
        return { ...REPORT_RESULT, data: REPORT_RESULT.data.map((row) => omitAmount(row)) }
      },
      permissions: ['fleet.read'],
    })

    const response = await handle()
    const body = (await response.json()) as { data: object[] }

    expect(response.status).toBe(200)
    expect(calls[0]?.canReadFinancials).toBe(false)
    expect(body.data[0]).not.toHaveProperty('amount')
    expect(JSON.stringify(body)).not.toContain('120.5')
  })

  test('trip.report-on-behalf tambem le o relatorio', async () => {
    const response = await buildHandler({ permissions: ['trip.report-on-behalf'] })()
    expect(response.status).toBe(200)
  })

  test('400 INVALID_REQUEST devolve todos os erros da query juntos', async () => {
    const handle = buildHandler({ permissions: ['fleet.read'] })

    const response = await handle('?limit=0&cursor=x&statusIn=nope&mystery=1')

    expect(response.status).toBe(400)
    const body = (await response.json()) as {
      error: { code: string; details: { field: string }[] }
    }
    expect(body.error.code).toBe('INVALID_REQUEST')
    expect(body.error.details.map((detail) => detail.field).sort()).toEqual([
      '',
      'cursor',
      'limit',
      'statusIn',
    ])
  })

  test('401 sem identidade', async () => {
    const response = await buildHandler({ isAuthenticated: false, permissions: [] })()
    expect(response.status).toBe(401)
  })

  test('403 sem permissao de leitura e o caso de uso nem roda', async () => {
    let wasCalled = false
    const handle = buildHandler({
      listTripReport: async () => {
        wasCalled = true
        return REPORT_RESULT
      },
      permissions: ['trip.financials'],
    })

    const response = await handle()

    expect(response.status).toBe(403)
    expect(wasCalled).toBe(false)
  })

  test('422 TRIP_REPORT_TOO_LARGE pelo filtro global de erros', async () => {
    const handle = buildHandler({
      listTripReport: async () => {
        throw new TripReportTooLargeError()
      },
      permissions: ['fleet.read'],
    })

    const response = await handle()

    expect(response.status).toBe(422)
    const body = (await response.json()) as { error: { code: string } }
    expect(body.error.code).toBe('TRIP_REPORT_TOO_LARGE')
  })
})
