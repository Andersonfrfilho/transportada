/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 248 T5.3 (RF6, RF13): ler o retorno da contratante e marcá-lo como tratado. A leitura é `fleet.read`,
 * sem cache, e ocorrência de outra empresa é 404 igual à inexistente; o "tratado" é `occurrences.resolve`,
 * corpo de 1 a 500, idempotente, e nunca esconde um retorno já entregue ou cancelado atrás de um 200.
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
import {
  createMarkContractorReplyHandledUseCase,
  createReadContractorReplyUseCase,
} from '../../src/occurrence-conversation/application/contractor-reply-read.use-case.js'
import type {
  ContractorReplyHandledPort,
  ContractorReplyReaderPort,
  ContractorReplyView,
  MarkContractorReplyHandledOutcome,
} from '../../src/occurrence-conversation/application/contractor-reply-view.port.js'
import { createOccurrenceContractorReplyRoutes } from '../../src/occurrence-conversation/presentation/occurrence-contractor-reply.routes.js'
import { stubCompanyFiscalEnvironment } from '../fixtures/company-fiscal-environment.fixture.js'
import { appliedMigrations } from '../fixtures/health.fixture.js'
import { COMPANY_CONTEXT } from '../fixtures/trip-http.fixture.js'
import {
  FRONTEND_ORIGIN,
  jsonRequest,
  responseApiError,
} from '../fixtures/trip-http-payload.fixture.js'
import { stubUserPictureExistence } from '../fixtures/user-picture-existence.fixture.js'

const OCCURRENCE_ID = '00000000-0000-4000-8000-000000248501'
const NOW = new Date('2026-10-12T20:00:00.000Z')

const VIEW: ContractorReplyView = {
  alertCount: 2,
  alertMaxCount: 24,
  deadlineAt: new Date('2026-10-12T18:00:00.000Z'),
  deliveries: [],
  events: [
    {
      actorKind: 'system',
      createdAt: NOW,
      fromStatus: 'awaiting_contractor',
      id: 'event-1',
      reason: null,
      toStatus: 'overdue',
    },
  ],
  handledNote: null,
  reason: null,
  replyAttachmentId: null,
  resend: { availableAt: null, canResend: true, reason: null },
  status: 'overdue',
}

type HandledCall = Parameters<ContractorReplyHandledPort['markHandled']>[0]

function build(overrides: {
  readonly handled?: MarkContractorReplyHandledOutcome | undefined
  readonly permissions?: CompanyContext['permissions']
  readonly view?: ContractorReplyView | null | undefined
}) {
  const handledCalls: HandledCall[] = []
  const readerCalls: unknown[] = []
  const reader: ContractorReplyReaderPort = {
    findByOccurrence: async (input) => {
      readerCalls.push(input)
      return 'view' in overrides ? overrides.view : VIEW
    },
  }
  const writer: ContractorReplyHandledPort = {
    markHandled: async (input) => {
      handledCalls.push(input)
      return 'handled' in overrides ? overrides.handled : 'handled'
    },
  }
  const context: AuthenticatedContext<CompanyContext> = {
    identity: {
      companyIdClaim: COMPANY_CONTEXT.companyId,
      externalIdentityId: crypto.randomUUID(),
      issuer: 'http://localhost:58080/realms/transportada-local',
      platformAdmin: false,
      serviceAccount: false,
      subject: 'contractor-reply-read-contract',
      userId: COMPANY_CONTEXT.userId,
    },
    scope: {
      ...COMPANY_CONTEXT,
      permissions: overrides.permissions ?? new Set(['fleet.read', 'occurrences.resolve'] as const),
    },
  }
  const authorization = new AuthorizationService()
  const router = createRouter({
    authentication: { authenticate: async () => context.identity },
    authorization: { authorize: (value, policy) => authorization.authorize(value, policy) },
    companyFiscalEnvironment: stubCompanyFiscalEnvironment(),
    healthService: new HealthService({
      database: { async close() {}, healthCheck: async () => ({ healthy: true }) },
      identityReadiness: { checkReadiness: async () => true },
      migrationStatus: appliedMigrations(),
    }),
    rateLimitWindows: { consume: async () => ({ allowed: true }) },
    routes: createOccurrenceContractorReplyRoutes({
      deliverToDriver: { deliver: async () => ({ kind: 'already_delivered' }) },
      emailOptions: { read: async () => null },
      forwardByEmail: {
        forward: () => {
          throw new Error('NOT_USED_BY_THIS_CONTRACT')
        },
      },
      markHandled: createMarkContractorReplyHandledUseCase({ clock: () => NOW, writer }),
      readReply: createReadContractorReplyUseCase({ reader }),
      resendRequest: { resend: async () => ({}) as never },
    }),
    tenantContext: { resolveCompany: async () => context },
    userPictureExistence: stubUserPictureExistence(),
  })
  const handleRequest = createRequestHandler({
    createCorrelationId: () => 'contractor-reply-correlation',
    frontendOrigins: [FRONTEND_ORIGIN],
    logger: { error() {}, info() {}, warn() {} },
    requestTimeoutSeconds: 10,
    router,
  })
  return {
    handle: (request: Request) => handleRequest(request, { timeout() {} }),
    handledCalls,
    readerCalls,
  }
}

const READ_PATH = `/trip-occurrences/${OCCURRENCE_ID}/contractor-reply`
const HANDLED_PATH = `${READ_PATH}/handled`

describe('GET /trip-occurrences/:id/contractor-reply (spec 248 RF13)', () => {
  test('com fleet.read devolve o retorno, sem cache e com a empresa do contexto', async () => {
    const fixture = build({ permissions: new Set(['fleet.read'] as const) })
    const response = await fixture.handle(jsonRequest({ method: 'GET', path: READ_PATH }))

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toContain('no-store')
    const body = (await response.json()) as { data: Record<string, unknown> }
    expect(body.data).toMatchObject({
      alertCount: 2,
      alertMaxCount: 24,
      replyAttachmentId: null,
      resend: { availableAt: null, canResend: true, reason: null },
      status: 'overdue',
    })
    expect(JSON.stringify(body)).not.toContain('actorUserId')
    expect(fixture.readerCalls).toEqual([
      { companyId: COMPANY_CONTEXT.companyId, occurrenceId: OCCURRENCE_ID },
    ])
  })

  test('ocorrência sem retorno devolve data nula; sem a permissão é 403', async () => {
    const empty = build({ view: null })
    const response = await empty.handle(jsonRequest({ method: 'GET', path: READ_PATH }))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ data: null })

    const denied = build({ permissions: new Set(['trip.read'] as const) })
    expect((await denied.handle(jsonRequest({ method: 'GET', path: READ_PATH }))).status).toBe(403)
  })

  test('ocorrência inexistente ou de outra empresa é 404 com o mesmo código', async () => {
    const fixture = build({ view: undefined })
    const response = await fixture.handle(jsonRequest({ method: 'GET', path: READ_PATH }))
    expect(response.status).toBe(404)
    expect((await responseApiError(response)).code).toBe('TRIP_OCCURRENCE_NOT_FOUND')
  })
})

describe('POST /trip-occurrences/:id/contractor-reply/handled (spec 248 RF6)', () => {
  test('com occurrences.resolve grava a nota com o autor do contexto e responde 201', async () => {
    const fixture = build({})
    const response = await fixture.handle(
      jsonRequest({
        body: { note: '  Liguei e o boleto sai amanhã.  ' },
        method: 'POST',
        path: HANDLED_PATH,
      }),
    )

    expect(response.status).toBe(201)
    expect(await response.json()).toEqual({ data: { kind: 'handled' } })
    expect(fixture.handledCalls).toEqual([
      {
        actorUserId: COMPANY_CONTEXT.userId,
        companyId: COMPANY_CONTEXT.companyId,
        note: 'Liguei e o boleto sai amanhã.',
        now: NOW,
        occurrenceId: OCCURRENCE_ID,
      },
    ])
  })

  test('repetir é 200 e não regrava; nota vazia, longa ou campo extra é 400', async () => {
    const repeated = build({ handled: 'already_handled' })
    const again = await repeated.handle(
      jsonRequest({ body: { note: 'ok' }, method: 'POST', path: HANDLED_PATH }),
    )
    expect(again.status).toBe(200)
    expect(await again.json()).toEqual({ data: { kind: 'already_handled' } })

    for (const body of [
      { note: '' },
      { note: '   ' },
      { note: 'x'.repeat(501) },
      { note: 'ok', status: 'delivered' },
      {},
    ]) {
      const fixture = build({})
      const response = await fixture.handle(
        jsonRequest({ body, method: 'POST', path: HANDLED_PATH }),
      )
      expect(response.status).toBe(400)
      expect(fixture.handledCalls).toEqual([])
    }
  })

  test('500 caracteres cabem; só com fleet.read é 403', async () => {
    const fixture = build({})
    const response = await fixture.handle(
      jsonRequest({ body: { note: 'x'.repeat(500) }, method: 'POST', path: HANDLED_PATH }),
    )
    expect(response.status).toBe(201)

    const denied = build({ permissions: new Set(['fleet.read'] as const) })
    const forbidden = await denied.handle(
      jsonRequest({ body: { note: 'ok' }, method: 'POST', path: HANDLED_PATH }),
    )
    expect(forbidden.status).toBe(403)
    expect(denied.handledCalls).toEqual([])
  })

  test('sem retorno é 404; retorno entregue ou cancelado é 409', async () => {
    const missing = build({ handled: undefined })
    const notFound = await missing.handle(
      jsonRequest({ body: { note: 'ok' }, method: 'POST', path: HANDLED_PATH }),
    )
    expect(notFound.status).toBe(404)

    const final = build({ handled: 'not_applicable' })
    const conflict = await final.handle(
      jsonRequest({ body: { note: 'ok' }, method: 'POST', path: HANDLED_PATH }),
    )
    expect(conflict.status).toBe(409)
    expect((await responseApiError(conflict)).code).toBe('CONTRACTOR_REPLY_NOT_HANDLEABLE')
  })
})

describe('o retorno que o painel lê (spec 248 RF13)', () => {
  test('a leitura da empresa errada nunca chega ao painel: o caso de uso lança 404', async () => {
    const useCase = createReadContractorReplyUseCase({
      reader: { findByOccurrence: async () => undefined },
    })
    await expect(useCase.read({ companyId: 'c', occurrenceId: 'o' })).rejects.toMatchObject({
      status: 404,
    })
  })
})
