/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 344 T5b (CA05b): mover o comprovante do canhoto para a NF certa — a régua (política), a
 * transação (caso de uso, com trilha sem PII e idempotência) e a superfície HTTP (permissão, corpo
 * `.strict()`, empresa do contexto). O SQL contra Postgres real está em
 * `test/integration/canhoto-move.integration.ts`.
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
  CanhotoMoveAuditEntry,
  CanhotoMovePort,
  CanhotoMoveTransaction,
  LockedCanhotoMoveSource,
} from '../../src/trips/application/canhoto-move.port.js'
import { moveCanhotoProof } from '../../src/trips/application/move-canhoto-proof.use-case.js'
import type { CanhotoMismatch } from '../../src/trips/domain/canhoto-mismatch.policy.js'
import {
  CanhotoMoveNotFlaggedForTargetError,
  CanhotoMoveSourceNotPendingError,
  CanhotoMoveTargetAlreadyApprovedError,
  CanhotoMoveTargetHasProofError,
  CanhotoMoveTargetNotDeliveredError,
  CanhotoMoveTargetNotInTripError,
} from '../../src/trips/domain/canhoto-move.error.js'
import {
  CANHOTO_MOVE_REASONS,
  resolveCanhotoMoveEvent,
  type CanhotoMoveDecisionInput,
} from '../../src/trips/domain/canhoto-move.policy.js'
import { CanhotoReviewProofNotFoundError } from '../../src/trips/domain/canhoto-review.error.js'
import { createCanhotoMoveRoutes } from '../../src/trips/presentation/canhoto-move.routes.js'
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
const DOCUMENT_B = '00000000-0000-4000-8000-0000000000d2'
const EVENT_B = '00000000-0000-4000-8000-0000000000b2'
const PROOF_ID = '00000000-0000-4000-8000-0000000000f1'
const TRIP_ID = '00000000-0000-4000-8000-0000000000e1'
const CLIENT_IP = '203.0.113.7'
const CORRELATION_ID = 'canhoto-move-correlation'
const MOVE_PATH = `/trips/${TRIP_ID}/documents/${DOCUMENT_A}/proof/move`

function mismatchTo(
  overrides: Partial<NonNullable<CanhotoMismatch['matchedDocument']>> = {},
): CanhotoMismatch {
  return {
    kind: 'other_document',
    matchedDocument: {
      canhotoApproved: false,
      nfeDocumentId: '00000000-0000-4000-8000-0000000000aa',
      number: '172195',
      sameTrip: true,
      series: '1',
      status: 'authorized',
      tripDocumentId: DOCUMENT_B,
      tripId: TRIP_ID,
      ...overrides,
    },
    readNumber: '172195',
    readSeries: '1',
  }
}

const DECISION: CanhotoMoveDecisionInput = {
  mismatch: mismatchTo(),
  sourceReview: 'pending',
  target: { deliveredEventId: EVENT_B, hasCanhotoProof: false },
  targetDocumentId: DOCUMENT_B,
}

describe('a régua do mover (D9 a–d)', () => {
  test('alerta apontando para B, mesma viagem, sem canhoto, entregue: devolve o evento de B', () => {
    expect(resolveCanhotoMoveEvent(DECISION)).toBe(EVENT_B)
  })

  test.each([
    {
      error: CanhotoMoveSourceNotPendingError,
      label: 'aprovada',
      patch: { sourceReview: 'approved' },
    },
    {
      error: CanhotoMoveSourceNotPendingError,
      label: 'recusada',
      patch: { sourceReview: 'rejected' },
    },
    { error: CanhotoMoveNotFlaggedForTargetError, label: 'sem alerta', patch: { mismatch: null } },
    {
      error: CanhotoMoveNotFlaggedForTargetError,
      label: 'alerta sem nota citada (empate)',
      patch: { mismatch: { ...mismatchTo(), matchedDocument: null } },
    },
    {
      error: CanhotoMoveNotFlaggedForTargetError,
      label: 'o alerta cita outra nota que não o destino pedido',
      patch: { mismatch: mismatchTo({ tripDocumentId: '00000000-0000-4000-8000-0000000000d9' }) },
    },
    {
      error: CanhotoMoveTargetNotInTripError,
      label: 'nota citada em outra viagem (Q6)',
      patch: { mismatch: mismatchTo({ sameTrip: false }) },
    },
    {
      error: CanhotoMoveTargetNotInTripError,
      label: 'destino fora da viagem',
      patch: { target: null },
    },
    {
      error: CanhotoMoveTargetAlreadyApprovedError,
      label: 'B já tem canhoto aprovado',
      patch: { mismatch: mismatchTo({ canhotoApproved: true }) },
    },
    {
      error: CanhotoMoveTargetHasProofError,
      label: 'B já tem foto de canhoto',
      patch: { target: { deliveredEventId: EVENT_B, hasCanhotoProof: true } },
    },
    {
      error: CanhotoMoveTargetNotDeliveredError,
      label: 'B não foi entregue',
      patch: { target: { deliveredEventId: null, hasCanhotoProof: false } },
    },
  ] as const)('$label ⇒ 409 e nada se move', ({ error, patch }) => {
    expect(() => resolveCanhotoMoveEvent({ ...DECISION, ...patch })).toThrow(error)
  })

  test('o motivo é lista fechada, sem texto livre', () => {
    expect(CANHOTO_MOVE_REASONS).toEqual(['wrong_document', 'driver_mistake', 'office_mistake'])
  })
})

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

function createFixture(
  overrides: {
    readonly alreadyMovedProofId?: null | string
    readonly mismatch?: CanhotoMismatch | null
    readonly source?: LockedCanhotoMoveSource | null
    readonly target?: CanhotoMoveDecisionInput['target']
  } = {},
) {
  const audits: CanhotoMoveAuditEntry[] = []
  const locked: unknown[] = []
  const moved: unknown[] = []
  const transaction: CanhotoMoveTransaction = {
    deriveMismatch: async () =>
      'mismatch' in overrides ? (overrides.mismatch ?? null) : mismatchTo(),
    findAlreadyMovedProof: async () => overrides.alreadyMovedProofId ?? null,
    findTarget: async () =>
      'target' in overrides
        ? (overrides.target ?? null)
        : { deliveredEventId: EVENT_B, hasCanhotoProof: false },
    insertAudit: async (entry) => {
      audits.push(entry)
    },
    lockSourceProof: async (params) => {
      locked.push(params)
      return 'source' in overrides ? (overrides.source ?? null) : SOURCE
    },
    moveProof: async (params) => {
      moved.push(params)
    },
    readReviewView: async () => ({
      canhotoReadNumber: '172195',
      canhotoReadSeries: '1',
      canhotoReadSource: 'ocr',
      canhotoReview: 'pending',
      canhotoReviewAt: null,
      canhotoReviewNote: null,
      canhotoReviewOrigin: null,
      canhotoReviewReason: null,
    }),
  }
  return {
    audits,
    locked,
    moved,
    unitOfWork: {
      execute: <T>(run: (tx: CanhotoMoveTransaction) => Promise<T>) => run(transaction),
    },
  }
}

function run(fixture: ReturnType<typeof createFixture>) {
  return moveCanhotoProof({
    actorUserId: ACTOR_USER_ID,
    companyId: COMPANY_ID,
    correlationId: CORRELATION_ID,
    documentId: DOCUMENT_A,
    ipAddress: CLIENT_IP,
    reason: 'driver_mistake',
    targetDocumentId: DOCUMENT_B,
    tripId: TRIP_ID,
    unitOfWork: fixture.unitOfWork,
  })
}

describe('o caso de uso move numa transação, sem aprovar', () => {
  test('a trava carrega empresa, viagem e documento; a prova vai ao evento de B e a trilha sai', async () => {
    const fixture = createFixture()
    const result = await run(fixture)

    expect(fixture.locked).toEqual([
      { companyId: COMPANY_ID, documentId: DOCUMENT_A, tripId: TRIP_ID },
    ])
    expect(fixture.moved).toEqual([
      { companyId: COMPANY_ID, proofId: PROOF_ID, targetEventId: EVENT_B },
    ])
    expect(result.alreadyMoved).toBe(false)
    // Mover não aprova (RF26 da 220): B recebe a foto `pending`, conferência humana continua.
    expect(result.review.canhotoReview).toBe('pending')
  })

  test('a trilha leva ator, origem e destino, IP e motivo — nunca número, série ou texto lido', async () => {
    const fixture = createFixture()
    await run(fixture)

    expect(fixture.audits).toEqual([
      {
        action: 'trip.canhoto-proof.moved',
        actorUserId: ACTOR_USER_ID,
        companyId: COMPANY_ID,
        correlationId: CORRELATION_ID,
        fromDocumentId: DOCUMENT_A,
        ipAddress: CLIENT_IP,
        permission: 'trip.manage',
        proofId: PROOF_ID,
        reason: 'driver_mistake',
        toDocumentId: DOCUMENT_B,
        tripId: TRIP_ID,
      },
    ])
    const serialized = JSON.stringify(fixture.audits)
    for (const secret of ['172195', '931988']) expect(serialized).not.toContain(secret)
  })

  test('prova de outra empresa ou inexistente é 404, nunca 403', async () => {
    const fixture = createFixture({ source: null })
    await expect(run(fixture)).rejects.toThrow(CanhotoReviewProofNotFoundError)
    expect(fixture.moved).toEqual([])
    expect(fixture.audits).toEqual([])
  })

  test('idempotência: repetir um movimento já feito devolve o mesmo resultado sem escrever de novo', async () => {
    const fixture = createFixture({ alreadyMovedProofId: PROOF_ID, source: null })
    const result = await run(fixture)

    expect(result.alreadyMoved).toBe(true)
    expect(fixture.moved).toEqual([])
    expect(fixture.audits).toEqual([])
  })

  test('B com canhoto aprovado: 409, nada é movido e nada é auditado', async () => {
    const fixture = createFixture({ mismatch: mismatchTo({ canhotoApproved: true }) })
    await expect(run(fixture)).rejects.toThrow(CanhotoMoveTargetAlreadyApprovedError)
    expect(fixture.moved).toEqual([])
    expect(fixture.audits).toEqual([])
  })

  test('prova com veredito de gente não é movida por cima', async () => {
    const fixture = createFixture({ source: { ...SOURCE, review: 'approved' } })
    await expect(run(fixture)).rejects.toThrow(CanhotoMoveSourceNotPendingError)
    expect(fixture.moved).toEqual([])
  })
})

function createRouteFixture(permissions?: CompanyContext['permissions'], failure?: Error) {
  const calls: unknown[] = []
  const canhotoMove: CanhotoMovePort = {
    move: async (command) => {
      calls.push(command)
      if (failure !== undefined) throw failure
      return {
        alreadyMoved: false,
        review: {
          canhotoReadNumber: '172195',
          canhotoReadSeries: '1',
          canhotoReadSource: 'ocr',
          canhotoReview: 'pending',
          canhotoReviewAt: null,
          canhotoReviewNote: null,
          canhotoReviewOrigin: null,
          canhotoReviewReason: null,
        },
        sourceDocumentId: command.documentId,
        targetDocumentId: command.targetDocumentId,
      }
    },
  }
  const context: AuthenticatedContext<CompanyContext> = {
    identity: {
      companyIdClaim: COMPANY_CONTEXT.companyId,
      externalIdentityId: crypto.randomUUID(),
      issuer: 'http://localhost:58080/realms/transportada-local',
      platformAdmin: false,
      serviceAccount: false,
      subject: 'canhoto-move-contract',
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
    routes: createCanhotoMoveRoutes({ canhotoMove, resolveClientIp: () => CLIENT_IP }),
    tenantContext: { resolveCompany: async () => context },
  })
  const handleRequest = createRequestHandler({
    createCorrelationId: () => CORRELATION_ID,
    frontendOrigins: [FRONTEND_ORIGIN],
    logger: { error() {}, info() {}, warn() {} },
    requestTimeoutSeconds: 10,
    router,
  })
  return { calls, handle: (request: Request) => handleRequest(request, { timeout() {} }) }
}

function post(fixture: ReturnType<typeof createRouteFixture>, body: unknown) {
  return fixture.handle(jsonRequest({ body, method: 'POST', path: MOVE_PATH }))
}

describe('a rota do mover é `trip.manage` e o corpo é estrito', () => {
  test('quem só lê a frota recebe 403, e a porta não é tocada', async () => {
    const fixture = createRouteFixture(new Set(['fleet.read']))
    const response = await post(fixture, { reason: 'wrong_document', targetDocumentId: DOCUMENT_B })
    expect(response.status).toBe(403)
    expect(fixture.calls).toEqual([])
  })

  test('empresa, autor e IP vêm do contexto; a empresa no corpo é 400', async () => {
    const fixture = createRouteFixture()
    const smuggled = await post(fixture, {
      companyId: crypto.randomUUID(),
      reason: 'wrong_document',
      targetDocumentId: DOCUMENT_B,
    })
    expect(smuggled.status).toBe(400)
    expect(fixture.calls).toEqual([])

    const response = await post(fixture, { reason: 'wrong_document', targetDocumentId: DOCUMENT_B })
    expect(response.status).toBe(200)
    expect(fixture.calls[0]).toEqual({
      actorUserId: COMPANY_CONTEXT.userId,
      companyId: COMPANY_CONTEXT.companyId,
      correlationId: expect.any(String),
      documentId: DOCUMENT_A,
      ipAddress: CLIENT_IP,
      reason: 'wrong_document',
      targetDocumentId: DOCUMENT_B,
      tripId: TRIP_ID,
    })
    expect(await response.json()).toMatchObject({
      data: { alreadyMoved: false, targetDocumentId: DOCUMENT_B },
    })
  })

  test.each([
    { body: {}, label: 'corpo vazio' },
    { body: { targetDocumentId: DOCUMENT_B }, label: 'sem motivo' },
    { body: { reason: 'wrong_document' }, label: 'sem destino' },
    { body: { reason: 'porque sim', targetDocumentId: DOCUMENT_B }, label: 'motivo fora da lista' },
    {
      body: { reason: 'wrong_document', targetDocumentId: 'não-é-uuid' },
      label: 'destino sem uuid',
    },
    {
      body: { note: 'texto livre', reason: 'wrong_document', targetDocumentId: DOCUMENT_B },
      label: 'texto livre',
    },
  ])('$label é 400 e não chega à porta', async ({ body }) => {
    const fixture = createRouteFixture()
    expect((await post(fixture, body)).status).toBe(400)
    expect(fixture.calls).toEqual([])
  })

  test('o 409 do domínio sai com o código, sem número de nota', async () => {
    const fixture = createRouteFixture(undefined, new CanhotoMoveTargetHasProofError())
    const response = await post(fixture, { reason: 'wrong_document', targetDocumentId: DOCUMENT_B })
    expect(response.status).toBe(409)
    expect((await responseApiError(response)).code).toBe('CANHOTO_MOVE_TARGET_HAS_PROOF')
  })
})
