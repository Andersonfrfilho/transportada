/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 220 RF27/RF28 (T6.8): a superfície HTTP da conferência do canhoto — permissão, empresa do
 * contexto e o mapa dos erros. A decisão em si está em `decision.contract.ts`; a trilha, em
 * `use-case.contract.ts`.
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
import type { CanhotoReviewPort } from '../../src/trips/application/canhoto-review.port.js'
import {
  CanhotoNotReviewableError,
  CanhotoReviewAlreadyResolvedError,
  CanhotoReviewNotePersonalDataError,
  CanhotoReviewProofNotFoundError,
} from '../../src/trips/domain/canhoto-review.error.js'
import { createCanhotoReviewRoutes } from '../../src/trips/presentation/canhoto-review.routes.js'
import { stubCompanyFiscalEnvironment } from '../fixtures/company-fiscal-environment.fixture.js'
import { stubUserPictureExistence } from '../fixtures/user-picture-existence.fixture.js'
import { appliedMigrations } from '../fixtures/health.fixture.js'
import { COMPANY_CONTEXT } from '../fixtures/trip-http.fixture.js'
import {
  FRONTEND_ORIGIN,
  jsonRequest,
  responseApiError,
} from '../fixtures/trip-http-payload.fixture.js'

const CLIENT_IP = '203.0.113.7'
const DOCUMENT_ID = '00000000-0000-4000-8000-00000000d001'
const TRIP_ID = '00000000-0000-4000-8000-00000000d002'
const REVIEW_PATH = `/trips/${TRIP_ID}/documents/${DOCUMENT_ID}/proof/review`
const READ_NUMBER = '12345'
const READ_SERIES = '1'

const AUTOMATIC_READING = {
  action: 'automatic',
  readDocumentId: DOCUMENT_ID,
  readNumber: READ_NUMBER,
  readSeries: READ_SERIES,
  readSource: 'barcode',
} as const

const VIEW = {
  canhotoReadNumber: '000012345',
  canhotoReadSeries: '1',
  canhotoReadSource: 'barcode',
  canhotoReview: 'approved',
  canhotoReviewAt: '2026-09-30T12:00:00.000Z',
  canhotoReviewNote: null,
  canhotoReviewOrigin: 'manual',
  canhotoReviewReason: null,
} as const

function createFixture(params: {
  readonly error?: Error
  readonly permissions?: CompanyContext['permissions']
}) {
  const calls: unknown[] = []
  const canhotoReview: CanhotoReviewPort = {
    review: async (input) => {
      calls.push(input)
      if (params.error !== undefined) throw params.error
      return VIEW
    },
  }
  const context: AuthenticatedContext<CompanyContext> = {
    identity: {
      companyIdClaim: COMPANY_CONTEXT.companyId,
      externalIdentityId: crypto.randomUUID(),
      issuer: 'http://localhost:58080/realms/transportada-local',
      platformAdmin: false,
      serviceAccount: false,
      subject: 'canhoto-review-contract',
      userId: COMPANY_CONTEXT.userId,
    },
    scope: { ...COMPANY_CONTEXT, permissions: params.permissions ?? COMPANY_CONTEXT.permissions },
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
    routes: createCanhotoReviewRoutes({
      canhotoReview,
      resolveClientIp: () => CLIENT_IP,
    }),
    tenantContext: { resolveCompany: async () => context },
  })
  const handleRequest = createRequestHandler({
    createCorrelationId: () => 'canhoto-review-correlation',
    frontendOrigins: [FRONTEND_ORIGIN],
    logger: { error() {}, info() {}, warn() {} },
    requestTimeoutSeconds: 10,
    router,
  })
  return { calls, handle: (request: Request) => handleRequest(request, { timeout() {} }) }
}

function patch(fixture: ReturnType<typeof createFixture>, body: unknown) {
  return fixture.handle(jsonRequest({ body, method: 'PATCH', path: REVIEW_PATH }))
}

describe('conferir o canhoto é `trip.manage` (RF27)', () => {
  test('quem só lê a frota recebe 403, e a porta não é tocada', async () => {
    const fixture = createFixture({ permissions: new Set(['fleet.read']) })
    for (const body of [{ action: 'approve' }, { action: 'reject', reason: 'illegible' }]) {
      expect((await patch(fixture, body)).status).toBe(403)
    }
    expect(fixture.calls).toEqual([])
  })

  test('a empresa, o autor e o IP vêm do contexto, nunca do corpo', async () => {
    const fixture = createFixture({})
    const smuggled = await patch(fixture, {
      action: 'approve',
      companyId: crypto.randomUUID(),
    })
    expect(smuggled.status).toBe(400)
    expect(fixture.calls).toEqual([])

    const response = await patch(fixture, { action: 'approve' })
    expect(response.status).toBe(200)
    expect(fixture.calls[0]).toMatchObject({
      actorUserId: COMPANY_CONTEXT.userId,
      command: { action: 'approve' },
      companyId: COMPANY_CONTEXT.companyId,
      documentId: DOCUMENT_ID,
      ipAddress: CLIENT_IP,
      tripId: TRIP_ID,
    })
    expect(await response.json()).toEqual({ data: VIEW })
  })
})

describe('o corpo é conferido antes de chegar ao domínio', () => {
  test.each([
    { body: {}, label: 'sem ação' },
    { body: { action: 'ignore' }, label: 'ação fora da lista' },
    { body: { action: 'reject' }, label: 'recusa sem motivo' },
    { body: { action: 'reject', reason: 'porque sim' }, label: 'motivo fora da lista fechada' },
    { body: { action: 'approve', reason: 'illegible' }, label: 'aprovação com motivo' },
  ])('$label é 400 e não chega à porta', async ({ body }) => {
    const fixture = createFixture({})
    expect((await patch(fixture, body)).status).toBe(400)
    expect(fixture.calls).toEqual([])
  })

  test('recusa com motivo fechado passa, e `other` leva a nota adiante', async () => {
    const fixture = createFixture({})
    expect((await patch(fixture, { action: 'reject', reason: 'missing_signature' })).status).toBe(
      200,
    )
    expect(
      (
        await patch(fixture, {
          action: 'reject',
          note: 'canhoto rasgado no meio, assinatura cortada ao meio',
          reason: 'other',
        })
      ).status,
    ).toBe(200)
    expect(fixture.calls[1]).toMatchObject({
      command: {
        action: 'reject',
        note: 'canhoto rasgado no meio, assinatura cortada ao meio',
        reason: 'other',
      },
    })
  })
})

/**
 * T7.1: a leitura roda no navegador (RF25), então o navegador é o único chamador possível. O que
 * ele pode dizer é o que **leu**; o veredito é do servidor, e o corpo que o traz é 400.
 */
describe('a leitura automática entra pela rota, e o veredito não sobe (T7.1)', () => {
  test.each([
    { extra: { review: 'approved' }, label: 'veredito no corpo' },
    { extra: { review: 'pending' }, label: 'veredito pendente no corpo' },
    { extra: { canhotoReviewOrigin: 'automatic' }, label: 'origem do veredito no corpo' },
    { extra: { accessKey: '1'.repeat(44) }, label: 'chave de acesso de carona (RNF03)' },
    { extra: { ocrText: 'NOTA FISCAL 12345' }, label: 'texto cru do OCR (RNF03)' },
    {
      extra: { readNumber: '1'.repeat(44) },
      label: 'chave de acesso disfarçada de número lido (RNF03)',
    },
    { extra: { readSeries: '1'.repeat(44) }, label: 'chave de acesso disfarçada de série (RNF03)' },
  ])('$label é 400 e não chega à porta', async ({ extra }) => {
    const fixture = createFixture({})
    expect((await patch(fixture, { ...AUTOMATIC_READING, ...extra })).status).toBe(400)
    expect(fixture.calls).toEqual([])
  })

  test('sem a origem da leitura é 400 — número e origem andam juntos', async () => {
    const fixture = createFixture({})
    const withoutSource = {
      action: 'automatic',
      readDocumentId: DOCUMENT_ID,
      readNumber: READ_NUMBER,
      readSeries: READ_SERIES,
    }
    expect((await patch(fixture, withoutSource)).status).toBe(400)
    expect(fixture.calls).toEqual([])
  })

  test('a leitura bem formada chega à porta exatamente como foi lida, e sem veredito', async () => {
    const fixture = createFixture({})
    expect((await patch(fixture, AUTOMATIC_READING)).status).toBe(200)
    expect(fixture.calls[0]).toMatchObject({
      command: {
        action: 'automatic',
        readDocumentId: DOCUMENT_ID,
        readNumber: READ_NUMBER,
        readSeries: READ_SERIES,
        readSource: 'barcode',
      },
      companyId: COMPANY_CONTEXT.companyId,
    })
    expect(JSON.stringify(fixture.calls[0])).not.toContain('review')
  })

  test('leitura vazia é legítima: a máquina tentou e não leu nada', async () => {
    const fixture = createFixture({})
    const response = await patch(fixture, {
      action: 'automatic',
      readDocumentId: null,
      readNumber: null,
      readSeries: null,
      readSource: null,
    })
    expect(response.status).toBe(200)
  })
})

describe('o mapa dos erros do domínio', () => {
  test.each([
    {
      code: 'CANHOTO_REVIEW_PROOF_NOT_FOUND',
      error: new CanhotoReviewProofNotFoundError(),
      status: 404,
    },
    {
      code: 'CANHOTO_REVIEW_ALREADY_RESOLVED',
      error: new CanhotoReviewAlreadyResolvedError(),
      status: 409,
    },
    { code: 'CANHOTO_NOT_REVIEWABLE', error: new CanhotoNotReviewableError(), status: 409 },
    {
      code: 'CANHOTO_REVIEW_NOTE_PERSONAL_DATA',
      error: new CanhotoReviewNotePersonalDataError('cpf'),
      status: 400,
    },
  ])('$code responde $status', async ({ code, error, status }) => {
    const fixture = createFixture({ error })
    const response = await patch(fixture, { action: 'approve' })
    expect(response.status).toBe(status)
    expect((await responseApiError(response)).code).toBe(code)
  })

  test('a recusa por dado pessoal não devolve o dado — só a categoria', async () => {
    const fixture = createFixture({ error: new CanhotoReviewNotePersonalDataError('cpf') })
    const response = await patch(fixture, {
      action: 'reject',
      note: 'recebedor informou o CPF 123.456.789-09 na entrega',
      reason: 'other',
    })
    const body = await response.text()
    expect(body).not.toContain('123.456.789-09')
    expect(body).toContain('cpf')
  })
})
