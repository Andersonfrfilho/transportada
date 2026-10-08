/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, it } from 'bun:test'

import { HealthService } from '../../src/health/health.service.js'
import { createRequestHandler } from '../../src/http/request-handler.service.js'
import { createRouter } from '../../src/http/router.service.js'
import { AuthorizationService } from '../../src/identity/application/authorization.service.js'
import type { AuthenticatedIdentity } from '../../src/identity/domain/authenticated-identity.js'
import type {
  AuthenticatedContext,
  CompanyContext,
} from '../../src/identity/domain/tenant-context.js'
import { HTTP_ERROR } from '../../src/shared/api.constant.js'
import { ApiError } from '../../src/shared/api.error.js'
import type {
  ExportTripProofPdfParams,
  ExportTripProofPdfResult,
} from '../../src/trips/domain/trip-proof-report.types.js'
import { TripProofReportTooLargeError } from '../../src/trips/domain/trip.error.js'
import { createTripDocumentReportRoutes } from '../../src/trips/presentation/trip-document-report.routes.js'
import { stubCompanyFiscalEnvironment } from '../fixtures/company-fiscal-environment.fixture.js'
import { appliedMigrations } from '../fixtures/health.fixture.js'
import { stubUserPictureExistence } from '../fixtures/user-picture-existence.fixture.js'

const COMPANY_ID = '00000000-0000-4000-8000-000000000002'
const USER_ID = '00000000-0000-4000-8000-000000000001'
const PROOFS_PATH = '/trip-document-report/proofs-pdf'
const ORIGIN = 'http://127.0.0.1:53000'

function buildContext(permissions: readonly string[]): AuthenticatedContext<CompanyContext> {
  return {
    identity: {
      companyIdClaim: COMPANY_ID,
      externalIdentityId: crypto.randomUUID(),
      issuer: 'https://issuer.test',
      platformAdmin: false,
      serviceAccount: false,
      subject: 'trip-proof-pdf-http',
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
  readonly exportTripProofPdf?: (
    params: ExportTripProofPdfParams,
  ) => Promise<ExportTripProofPdfResult>
  readonly isAuthenticated?: boolean
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
      exportTripProofPdf:
        input.exportTripProofPdf ??
        (async () => ({
          filename: 'canhotos-20261007.pdf',
          stream: new Response('%PDF-1.7').body as ReadableStream<Uint8Array>,
        })),
      listTripReport: async () => {
        throw new Error('unexpected report call')
      },
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
      new Request(`${ORIGIN}${PROOFS_PATH}${query}`, { headers: { authorization: 'Bearer x' } }),
      { timeout() {} },
    )
}

describe('GET /trip-document-report/proofs-pdf (spec 253 T2.4)', () => {
  it('200 streams the PDF as an attachment, no-store, without PII in the filename', async () => {
    const calls: ExportTripProofPdfParams[] = []
    const handle = buildHandler({
      exportTripProofPdf: async (params) => {
        calls.push(params)
        return {
          filename: 'canhotos-20261007.pdf',
          stream: new Response('%PDF-1.7').body as ReadableStream<Uint8Array>,
        }
      },
      permissions: ['fleet.read', 'trip.financials'],
    })

    const response = await handle('?statusIn=draft')

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('application/pdf')
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(response.headers.get('content-disposition')).toBe(
      'attachment; filename="canhotos-20261007.pdf"',
    )
    expect(await response.text()).toBe('%PDF-1.7')
    expect(calls).toHaveLength(1)
    expect(calls[0]?.companyId).toBe(COMPANY_ID)
    expect(calls[0]?.exportedByUserId).toBe(USER_ID)
    expect(calls[0]?.canReadFinancials).toBe(true)
    expect(calls[0]?.filters.statusIn).toEqual(['draft'])
  })

  it('does not ask for the value without trip.financials', async () => {
    const calls: ExportTripProofPdfParams[] = []
    const handle = buildHandler({
      exportTripProofPdf: async (params) => {
        calls.push(params)
        return {
          filename: 'x.pdf',
          stream: new Response('%PDF').body as ReadableStream<Uint8Array>,
        }
      },
      permissions: ['fleet.read'],
    })
    expect((await handle()).status).toBe(200)
    expect(calls[0]?.canReadFinancials).toBe(false)
  })

  it('trip.report-on-behalf also reads it', async () => {
    expect((await buildHandler({ permissions: ['trip.report-on-behalf'] })()).status).toBe(200)
  })

  it('403 without a read permission and 401 without authentication', async () => {
    expect((await buildHandler({ permissions: ['invoices.read'] })()).status).toBe(403)
    expect((await buildHandler({ isAuthenticated: false, permissions: [] })()).status).toBe(401)
  })

  it('400 lists every query error together', async () => {
    const response = await buildHandler({ permissions: ['fleet.read'] })('?statusIn=nope&mystery=1')
    expect(response.status).toBe(400)
  })

  it('accepts the spec 258 note filters and hands them to the export', async () => {
    const calls: ExportTripProofPdfParams[] = []
    const handle = buildHandler({
      exportTripProofPdf: async (params) => {
        calls.push(params)
        return {
          filename: 'x.pdf',
          stream: new Response('%PDF').body as ReadableStream<Uint8Array>,
        }
      },
      permissions: ['fleet.read'],
    })
    const response = await handle(
      '?numberFrom=00001&numberTo=99999&issuedFrom=2026-10-01&issuedUntil=2026-10-31' +
        '&emitterNameIn=AMARELINHA&cteIssued=pending&fiscalStatusIn=authorized',
    )
    expect(response.status).toBe(200)
    expect(calls[0]?.filters).toMatchObject({
      cteIssued: 'pending',
      emitterNameIn: ['AMARELINHA'],
      fiscalStatusIn: ['authorized'],
      issuedFrom: '2026-10-01',
      issuedUntil: '2026-10-31',
      numberFrom: '00001',
      numberTo: '99999',
    })
  })

  it('400 for the spec 258 filters refused by the shared parser', async () => {
    const handle = buildHandler({ permissions: ['fleet.read'] })
    expect((await handle('?numberFrom=99999&numberTo=00001')).status).toBe(400)
    expect((await handle('?issuedFrom=2026-02-30')).status).toBe(400)
    expect((await handle('?cteIssued=maybe')).status).toBe(400)
    expect((await handle('?numberFrom=1A')).status).toBe(400)
  })

  it('422 TRIP_PROOF_REPORT_TOO_LARGE when the selection is above the ceiling', async () => {
    const handle = buildHandler({
      exportTripProofPdf: async () => {
        throw new TripProofReportTooLargeError()
      },
      permissions: ['fleet.read'],
    })
    const response = await handle()
    expect(response.status).toBe(422)
    expect(JSON.stringify(await response.json())).toContain('TRIP_PROOF_REPORT_TOO_LARGE')
  })
})
