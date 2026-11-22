/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 344 T5d: "Descartar" o alerta de canhoto de outra nota — o caso de uso (trilha sem PII,
 * idempotência, 404/409) e a superfície HTTP (`trip.manage`, corpo estrito). O SQL contra Postgres
 * está em `test/integration/canhoto-dismiss.integration.ts`.
 */
import { describe, expect, test } from 'bun:test'

import { HealthService } from '../../src/health/health.service.js'
import { createRequestHandler } from '../../src/http/request-handler.service.js'
import { createRouter } from '../../src/http/router.service.js'
import { AuthorizationService } from '../../src/identity/application/authorization.service.js'
import type {
  AuthenticatedContext,
  CompanyContext,
} from '../../src/identity/domain/tenant-context.js'
import type {
  CanhotoDismissAuditEntry,
  CanhotoDismissPort,
  CanhotoDismissTransaction,
} from '../../src/trips/application/canhoto-dismiss.port.js'
import type { LockedCanhotoMoveSource } from '../../src/trips/application/canhoto-move.port.js'
import { dismissCanhotoMismatch } from '../../src/trips/application/dismiss-canhoto-mismatch.use-case.js'
import {
  CanhotoDismissNotFlaggedError,
  CanhotoDismissNotPendingError,
} from '../../src/trips/domain/canhoto-dismiss.error.js'
import type { CanhotoMismatch } from '../../src/trips/domain/canhoto-mismatch.policy.js'
import { CanhotoReviewProofNotFoundError } from '../../src/trips/domain/canhoto-review.error.js'
import { createCanhotoDismissRoutes } from '../../src/trips/presentation/canhoto-dismiss.routes.js'
import { stubCompanyFiscalEnvironment } from '../fixtures/company-fiscal-environment.fixture.js'
import { appliedMigrations } from '../fixtures/health.fixture.js'
import { COMPANY_CONTEXT } from '../fixtures/trip-http.fixture.js'
import {
  FRONTEND_ORIGIN,
  jsonRequest,
  responseApiError,
} from '../fixtures/trip-http-payload.fixture.js'
import { stubUserPictureExistence } from '../fixtures/user-picture-existence.fixture.js'

const ACTOR_USER_ID = '00000000-0000-4000-8000-0000000000a1'
const COMPANY_ID = '00000000-0000-4000-8000-0000000000c1'
const DOCUMENT_A = '00000000-0000-4000-8000-0000000000d1'
const PROOF_ID = '00000000-0000-4000-8000-0000000000f1'
const TRIP_ID = '00000000-0000-4000-8000-0000000000e1'
const CLIENT_IP = '203.0.113.7'
const DISMISS_PATH = `/trips/${TRIP_ID}/documents/${DOCUMENT_A}/proof/mismatch/dismiss`

const SOURCE: LockedCanhotoMoveSource = {
  expectedAccessKey: null,
  expectedNfeDocumentId: null,
  expectedNumber: '931988',
  expectedSeries: '1',
  mismatchDismissed: false,
  proofId: PROOF_ID,
  readNumber: '172195',
  readSeries: '1',
  review: 'pending',
  reviewOrigin: null,
}
const MISMATCH: CanhotoMismatch = {
  kind: 'other_document',
  matchedDocument: null,
  readNumber: '172195',
  readSeries: '1',
}

function createFixture(
  overrides: {
    readonly mismatch?: CanhotoMismatch | null
    readonly source?: LockedCanhotoMoveSource | null
  } = {},
) {
  const audits: CanhotoDismissAuditEntry[] = []
  const dismissed: unknown[] = []
  const transaction: CanhotoDismissTransaction = {
    deriveMismatch: async () => ('mismatch' in overrides ? (overrides.mismatch ?? null) : MISMATCH),
    insertAudit: async (entry) => {
      audits.push(entry)
    },
    lockSourceProof: async () => ('source' in overrides ? (overrides.source ?? null) : SOURCE),
    markDismissed: async (params) => {
      dismissed.push(params)
    },
  }
  return {
    audits,
    dismissed,
    unitOfWork: {
      execute: <T>(run: (tx: CanhotoDismissTransaction) => Promise<T>) => run(transaction),
    },
  }
}

function run(fixture: ReturnType<typeof createFixture>) {
  return dismissCanhotoMismatch({
    actorUserId: ACTOR_USER_ID,
    companyId: COMPANY_ID,
    correlationId: 'canhoto-dismiss-correlation',
    documentId: DOCUMENT_A,
    ipAddress: CLIENT_IP,
    tripId: TRIP_ID,
    unitOfWork: fixture.unitOfWork,
  })
}

describe('descartar o alerta só apaga o alerta daquela foto', () => {
  test('carimba a prova e deixa a trilha só com ids', async () => {
    const fixture = createFixture()
    const result = await run(fixture)

    expect(result).toEqual({ alreadyDismissed: false, documentId: DOCUMENT_A })
    expect(fixture.dismissed).toEqual([
      { at: expect.any(Date), companyId: COMPANY_ID, proofId: PROOF_ID },
    ])
    expect(fixture.audits).toEqual([
      {
        action: 'trip.canhoto-mismatch.dismissed',
        actorUserId: ACTOR_USER_ID,
        companyId: COMPANY_ID,
        correlationId: 'canhoto-dismiss-correlation',
        documentId: DOCUMENT_A,
        ipAddress: CLIENT_IP,
        permission: 'trip.manage',
        proofId: PROOF_ID,
        tripId: TRIP_ID,
      },
    ])
    const serialized = JSON.stringify(fixture.audits)
    for (const secret of ['172195', '931988']) expect(serialized).not.toContain(secret)
  })

  test('repetir é idempotente: nada é escrito de novo', async () => {
    const fixture = createFixture({ source: { ...SOURCE, mismatchDismissed: true } })
    expect(await run(fixture)).toEqual({ alreadyDismissed: true, documentId: DOCUMENT_A })
    expect(fixture.dismissed).toEqual([])
    expect(fixture.audits).toEqual([])
  })

  test('prova de outra empresa ou inexistente é 404', async () => {
    await expect(run(createFixture({ source: null }))).rejects.toThrow(
      CanhotoReviewProofNotFoundError,
    )
  })

  test.each([
    {
      error: CanhotoDismissNotPendingError,
      label: 'aprovada',
      source: { ...SOURCE, review: 'approved' as const },
    },
    {
      error: CanhotoDismissNotPendingError,
      label: 'recusada',
      source: { ...SOURCE, review: 'rejected' as const },
    },
  ])('prova $label ⇒ 409', async ({ error, source }) => {
    const fixture = createFixture({ source })
    await expect(run(fixture)).rejects.toThrow(error)
    expect(fixture.dismissed).toEqual([])
  })

  test('sem alerta derivado ⇒ 409 e nada é gravado', async () => {
    const fixture = createFixture({ mismatch: null })
    await expect(run(fixture)).rejects.toThrow(CanhotoDismissNotFlaggedError)
    expect(fixture.dismissed).toEqual([])
    expect(fixture.audits).toEqual([])
  })
})

function createRouteFixture(permissions?: CompanyContext['permissions'], failure?: Error) {
  const calls: unknown[] = []
  const canhotoDismiss: CanhotoDismissPort = {
    dismiss: async (command) => {
      calls.push(command)
      if (failure !== undefined) throw failure
      return { alreadyDismissed: false, documentId: command.documentId }
    },
  }
  const context: AuthenticatedContext<CompanyContext> = {
    identity: {
      companyIdClaim: COMPANY_CONTEXT.companyId,
      externalIdentityId: crypto.randomUUID(),
      issuer: 'http://localhost:58080/realms/transportada-local',
      platformAdmin: false,
      serviceAccount: false,
      subject: 'canhoto-dismiss-contract',
      userId: COMPANY_CONTEXT.userId,
    },
    scope: { ...COMPANY_CONTEXT, permissions: permissions ?? COMPANY_CONTEXT.permissions },
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
    routes: createCanhotoDismissRoutes({ canhotoDismiss, resolveClientIp: () => CLIENT_IP }),
    tenantContext: { resolveCompany: async () => context },
  })
  const handleRequest = createRequestHandler({
    createCorrelationId: () => 'canhoto-dismiss-correlation',
    frontendOrigins: [FRONTEND_ORIGIN],
    logger: { error() {}, info() {}, warn() {} },
    requestTimeoutSeconds: 10,
    router,
  })
  return { calls, handle: (request: Request) => handleRequest(request, { timeout() {} }) }
}

function post(fixture: ReturnType<typeof createRouteFixture>, body: unknown) {
  return fixture.handle(jsonRequest({ body, method: 'POST', path: DISMISS_PATH }))
}

describe('a rota do descartar é `trip.manage` e o corpo é estrito', () => {
  test('quem só lê a frota recebe 403, e a porta não é tocada', async () => {
    const fixture = createRouteFixture(new Set(['fleet.read']))
    expect((await post(fixture, {})).status).toBe(403)
    expect(fixture.calls).toEqual([])
  })

  test('empresa, autor e IP vêm do contexto; qualquer campo no corpo é 400', async () => {
    const fixture = createRouteFixture()
    expect((await post(fixture, { companyId: crypto.randomUUID() })).status).toBe(400)
    expect(fixture.calls).toEqual([])

    const response = await post(fixture, {})
    expect(response.status).toBe(200)
    expect(fixture.calls[0]).toEqual({
      actorUserId: COMPANY_CONTEXT.userId,
      companyId: COMPANY_CONTEXT.companyId,
      correlationId: expect.any(String),
      documentId: DOCUMENT_A,
      ipAddress: CLIENT_IP,
      tripId: TRIP_ID,
    })
    expect(await response.json()).toEqual({
      data: { alreadyDismissed: false, documentId: DOCUMENT_A },
    })
  })

  test('o 409 do domínio sai com o código', async () => {
    const fixture = createRouteFixture(undefined, new CanhotoDismissNotFlaggedError())
    const response = await post(fixture, {})
    expect(response.status).toBe(409)
    expect((await responseApiError(response)).code).toBe('CANHOTO_DISMISS_NOT_FLAGGED')
  })
})
